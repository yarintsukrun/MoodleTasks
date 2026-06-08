import { useState } from 'react'
import { useAuth } from '../context/authContext'
import { LegalFooter } from './LegalFooter'

export function Login() {
  const { signIn } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSignIn() {
    setError(null)
    setBusy(true)
    try {
      await signIn()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login">
      <div className="login-card">
        <div className="login-badge">📚</div>
        <h1>Moodle Task Manager</h1>
        <p className="muted">
          Sign in, paste your Moodle calendar link, and see every deadline neatly
          ordered — with an AI study coach to keep you on track.
        </p>
        <button className="btn btn-google" onClick={handleSignIn} disabled={busy}>
          <GoogleIcon />
          {busy ? 'Signing in…' : 'Continue with Google'}
        </button>
        {error && <p className="error">{error}</p>}
        <ul className="login-features">
          <li>🗓️ Deadlines auto-sorted by date</li>
          <li>🔔 Overdue &amp; due-soon highlights</li>
          <li>🤖 Gemini-powered study plans</li>
          <li>☁️ Synced across your devices</li>
        </ul>
        <LegalFooter />
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.5-5.2l-6.2-5.3C29.2 35 26.7 36 24 36c-5.3 0-9.7-3.1-11.3-7.6l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4 5.5l6.2 5.3C39.9 36.7 44 31 44 24c0-1.3-.1-2.3-.4-3.5z" />
    </svg>
  )
}
