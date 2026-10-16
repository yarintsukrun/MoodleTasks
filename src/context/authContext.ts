import { createContext, useContext } from 'react'
import type { User } from 'firebase/auth'
import type { TaskOverride, UserSettings, ManualTask, ManualTaskInput } from '../types'

export interface AuthContextValue {
  user: User | null
  loading: boolean
  settings: UserSettings
  signIn: () => Promise<void>
  signOutUser: () => Promise<void>
  saveSettings: (patch: Partial<UserSettings>) => Promise<void>
  /** Update server-managed flags (e.g. pushEnabled) in local state only. */
  applyServerState: (patch: Pick<UserSettings, 'pushEnabled'>) => void
  setOverride: (taskId: string, patch: Partial<TaskOverride>) => Promise<void>
  addManualTask: (input: ManualTaskInput) => Promise<ManualTask>
  updateManualTask: (id: string, patch: Partial<ManualTaskInput>) => Promise<void>
  deleteManualTask: (id: string) => Promise<void>
  /** Store secrets (Moodle URL / Gemini key) encrypted on the server. */
  saveSecrets: (input: { moodleUrl?: string; geminiKey?: string }) => Promise<void>
  /** Forget a stored secret. */
  disconnectSecret: (which: 'moodle' | 'gemini') => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
