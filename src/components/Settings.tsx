import { useState } from 'react'
import { useAuth } from '../context/authContext'

interface Props {
  onClose: () => void
  onSaved: () => void
}

export function Settings({ onClose, onSaved }: Props) {
  const { settings, saveSecrets, disconnectSecret } = useAuth()
  const [moodleUrl, setMoodleUrl] = useState('')
  const [geminiKey, setGeminiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const input: { moodleUrl?: string; geminiKey?: string } = {}
    if (moodleUrl.trim()) input.moodleUrl = moodleUrl.trim()
    if (geminiKey.trim()) input.geminiKey = geminiKey.trim()
    if (!input.moodleUrl && !input.geminiKey) {
      onClose()
      return
    }
    setSaving(true)
    try {
      await saveSecrets(input)
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save securely.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDisconnect(which: 'moodle' | 'gemini') {
    setError(null)
    try {
      await disconnectSecret(which)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disconnect.')
    }
  }

  return (
    <div className="ai-overlay" onClick={onClose}>
      <div className="ai-panel settings-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ai-head">
          <h2>⚙️ Settings</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="ai-content">
          <p className="secure-note">
            🔒 Your Moodle link and API key are <strong>encrypted on the server</strong> and
            never stored in your browser. They are sent over a secure connection only when
            syncing.
          </p>

          <label className="field">
            <span className="field-label">
              Moodle calendar URL
              {settings.moodleConnected && <span className="connected-tag">Connected ✓</span>}
            </span>
            <input
              className="input"
              type="url"
              placeholder={
                settings.moodleConnected
                  ? 'Connected — paste a new URL to replace'
                  : 'https://moodle.huji.ac.il/.../export_execute.php?...'
              }
              value={moodleUrl}
              onChange={(e) => setMoodleUrl(e.target.value)}
            />
            <span className="field-hint">
              In Moodle open <em>Calendar → Export calendar</em>, choose “All events” and a
              time range, then copy the generated URL. It contains a private token.
              {' '}This app is not affiliated with Moodle Pty Ltd.
              {settings.moodleConnected && (
                <button className="link-btn" onClick={() => handleDisconnect('moodle')}>
                  Disconnect
                </button>
              )}
            </span>
          </label>

          <label className="field">
            <span className="field-label">
              Gemini API key (optional)
              {settings.geminiConnected && <span className="connected-tag">Connected ✓</span>}
            </span>
            <input
              className="input"
              type="password"
              placeholder={settings.geminiConnected ? 'Connected — enter a new key to replace' : 'AIza…'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
            />
            <span className="field-hint">
              Needed for the AI study coach. Get a free key at{' '}
              <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">
                aistudio.google.com
              </a>
              .
              {settings.geminiConnected && (
                <button className="link-btn" onClick={() => handleDisconnect('gemini')}>
                  Disconnect
                </button>
              )}
            </span>
          </label>

          {error && <p className="error">{error}</p>}

          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Securing…' : 'Save securely'}
          </button>
        </div>
      </div>
    </div>
  )
}
