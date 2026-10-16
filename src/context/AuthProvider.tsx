import { useEffect, useState, type ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { auth, db, functions, googleProvider } from '../firebase'
import { releasePushTokenOnSignOut } from '../services/notificationService'
import type { TaskOverride, UserSettings, ManualTask, ManualTaskInput } from '../types'
import { MANUAL_TASK_ID_PREFIX } from '../types'
import { AuthContext } from './authContext'

const saveSecretsFn = httpsCallable<
  { moodleUrl?: string; geminiKey?: string },
  { ok: boolean; moodleConnected?: boolean; geminiConnected?: boolean }
>(functions, 'saveSecrets')
const disconnectFn = httpsCallable<{ which: 'moodle' | 'gemini' }, { ok: boolean }>(
  functions,
  'disconnect',
)

/** Pre-fix shared cache key (not per-user) — removed on load so it can't leak between accounts. */
const LEGACY_LOCAL_KEY = 'moodle-task-manager-settings'
const localKey = (uid: string) => `${LEGACY_LOCAL_KEY}:${uid}`

/**
 * Fields the client may write to `users/{uid}`. Server-only fields (fcmTokens,
 * pushEnabled) are excluded — the rules reject client changes to them.
 */
const CLIENT_SETTINGS_KEYS = [
  'overrides',
  'hiddenTypes',
  'hideOpens',
  'notificationPrefs',
  'manualTasks',
] as const satisfies readonly (keyof UserSettings)[]

function pickClientSettings(settings: UserSettings): Partial<UserSettings> {
  const out: Partial<UserSettings> = {}
  for (const key of CLIENT_SETTINGS_KEYS) {
    const value = settings[key]
    if (value !== undefined) {
      ;(out as Record<string, unknown>)[key] = value
    }
  }
  return out
}

/** Strip server-managed fields before storing settings in React state / localStorage. */
function toClientSettings(data: Record<string, unknown>): UserSettings {
  const rest = { ...data }
  delete rest.fcmTokens
  return rest as UserSettings
}

/** Per-user local fallback so the app still works before Firestore writes succeed. */
function readLocal(uid: string): UserSettings {
  try {
    return JSON.parse(localStorage.getItem(localKey(uid)) ?? '{}')
  } catch {
    return {}
  }
}

function writeLocal(uid: string, settings: UserSettings) {
  try {
    localStorage.setItem(localKey(uid), JSON.stringify(settings))
  } catch {
    /* storage full or blocked — Firestore stays the source of truth */
  }
}

function removeLocal(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* storage blocked */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<UserSettings>({})

  useEffect(() => {
    removeLocal(LEGACY_LOCAL_KEY)
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (!u) {
        setSettings({})
        setLoading(false)
        return
      }
      setLoading(true)
      setSettings(readLocal(u.uid))
      try {
        const snap = await getDoc(doc(db, 'users', u.uid))
        // Another account signed in while this read was in flight — drop it.
        if (auth.currentUser?.uid !== u.uid) return
        if (snap.exists()) {
          const remote = toClientSettings(snap.data())
          setSettings(remote)
          writeLocal(u.uid, remote)
        }
      } catch (err) {
        console.warn('Could not load settings from Firestore:', err)
      }
      if (auth.currentUser?.uid === u.uid) setLoading(false)
    })
  }, [])

  async function persist(next: UserSettings) {
    setSettings(next)
    if (user) {
      writeLocal(user.uid, next)
      try {
        // Only write client-owned fields — never clobber server fields like fcmTokens.
        await setDoc(
          doc(db, 'users', user.uid),
          { ...pickClientSettings(next), updatedAt: Date.now() },
          { merge: true },
        )
      } catch (err) {
        console.warn('Could not save settings to Firestore:', err)
      }
    }
  }

  async function signIn() {
    await signInWithPopup(auth, googleProvider)
  }

  async function signOutUser() {
    const uid = auth.currentUser?.uid
    // Must run while still signed in (the server call needs the auth token),
    // so this device stops receiving this account's reminders.
    await releasePushTokenOnSignOut()
    await signOut(auth)
    // Shared devices: don't leave this account's tasks/notes in localStorage.
    if (uid) removeLocal(localKey(uid))
  }

  async function saveSettings(patch: Partial<UserSettings>) {
    await persist({ ...settings, ...patch })
  }

  /** Mirror server-managed flags locally without writing them to Firestore. */
  function applyServerState(patch: Pick<UserSettings, 'pushEnabled'>) {
    // Functional update so it isn't clobbered by a save from the same handler.
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      if (user) writeLocal(user.uid, next)
      return next
    })
  }

  async function setOverride(taskId: string, patch: Partial<TaskOverride>) {
    const overrides = { ...(settings.overrides ?? {}) }
    overrides[taskId] = { ...overrides[taskId], ...patch }
    await persist({ ...settings, overrides })
  }

  async function addManualTask(input: ManualTaskInput): Promise<ManualTask> {
    const now = Date.now()
    const task: ManualTask = {
      ...input,
      id: `${MANUAL_TASK_ID_PREFIX}${crypto.randomUUID()}`,
      createdAt: now,
      updatedAt: now,
    }
    const manualTasks = [...(settings.manualTasks ?? []), task]
    await persist({ ...settings, manualTasks })
    return task
  }

  async function updateManualTask(id: string, patch: Partial<ManualTaskInput>) {
    const manualTasks = (settings.manualTasks ?? []).map((t) =>
      t.id === id ? { ...t, ...patch, updatedAt: Date.now() } : t,
    )
    await persist({ ...settings, manualTasks })
  }

  async function deleteManualTask(id: string) {
    const manualTasks = (settings.manualTasks ?? []).filter((t) => t.id !== id)
    const overrides = { ...(settings.overrides ?? {}) }
    delete overrides[id]
    await persist({ ...settings, manualTasks, overrides })
  }

  async function saveSecrets(input: { moodleUrl?: string; geminiKey?: string }) {
    const res = await saveSecretsFn(input)
    const flags: Partial<UserSettings> = {}
    if (res.data.moodleConnected) flags.moodleConnected = true
    if (res.data.geminiConnected) flags.geminiConnected = true
    const next = { ...settings, ...flags }
    setSettings(next)
    if (user) writeLocal(user.uid, next)
  }

  async function disconnectSecret(which: 'moodle' | 'gemini') {
    await disconnectFn({ which })
    const next = {
      ...settings,
      ...(which === 'moodle' ? { moodleConnected: false } : { geminiConnected: false }),
    }
    setSettings(next)
    if (user) writeLocal(user.uid, next)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        settings,
        signIn,
        signOutUser,
        saveSettings,
        applyServerState,
        setOverride,
        addManualTask,
        updateManualTask,
        deleteManualTask,
        saveSecrets,
        disconnectSecret,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
