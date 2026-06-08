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
import type { TaskOverride, UserSettings } from '../types'
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
            const remote = snap.data() as UserSettings
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
        // Merge so server-written connection flags are never clobbered.
        await setDoc(doc(db, 'users', user.uid), { ...next, updatedAt: Date.now() }, { merge: true })
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
        saveSecrets,
        disconnectSecret,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
