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

const LOCAL_KEY = 'moodle-task-manager-settings'

/** Fields the client may write to `users/{uid}`. Server-only fields (e.g. fcmTokens) are excluded. */
const CLIENT_SETTINGS_KEYS = [
  'overrides',
  'hiddenTypes',
  'hideOpens',
  'pushEnabled',
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
  const { fcmTokens: _tokens, ...rest } = data
  return rest as UserSettings
}

/** Local fallback so the app still works before Firestore writes succeed. */
function readLocal(): UserSettings {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) ?? '{}')
  } catch {
    return {}
  }
}

function writeLocal(settings: UserSettings) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(settings))
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<UserSettings>(readLocal())

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u)
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid))
          if (snap.exists()) {
            const remote = toClientSettings(snap.data())
            setSettings(remote)
            writeLocal(remote)
          }
        } catch (err) {
          console.warn('Could not load settings from Firestore:', err)
        }
      }
      setLoading(false)
    })
  }, [])

  async function persist(next: UserSettings) {
    setSettings(next)
    writeLocal(next)
    if (user) {
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
    await signOut(auth)
  }

  async function saveSettings(patch: Partial<UserSettings>) {
    await persist({ ...settings, ...patch })
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
    writeLocal(next)
  }

  async function disconnectSecret(which: 'moodle' | 'gemini') {
    await disconnectFn({ which })
    const next = {
      ...settings,
      ...(which === 'moodle' ? { moodleConnected: false } : { geminiConnected: false }),
    }
    setSettings(next)
    writeLocal(next)
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
