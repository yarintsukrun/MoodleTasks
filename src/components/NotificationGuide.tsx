import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/authContext'
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushPermission,
  isAndroid,
  isIos,
  isStandalonePwa,
  needsIosHomeScreenInstall,
  pushConfigured,
  pushSupported,
  showPushSetupUi,
  subscribeForegroundMessages,
} from '../services/notificationService'
import type { NotificationPrefs, TaskType } from '../types'
import { ALL_TASK_TYPES, mergeNotificationPrefs } from '../types'
import { TYPE_META } from './TaskCard'
import { ScrollRow } from './ScrollRow'

interface Props {
  onClose?: () => void
  /** Render inside the top-bar slide-over panel (no inline collapsed bar). */
  inPanel?: boolean
}

function scheduleSummary(prefs: NotificationPrefs): string {
  const times: string[] = []
  if (prefs.morning) times.push('09:00')
  if (prefs.evening) times.push('18:00')
  if (times.length === 0) return 'no scheduled checks'
  return times.join(' & ')
}

function HomeScreenInstructions() {
  const ios = isIos()
  const android = isAndroid()
  const installed = isStandalonePwa()

  if (installed) {
    return (
      <p className="notify-install-ok muted">
        ✓ Opened from Home Screen — you can enable notifications below.
      </p>
    )
  }

  return (
    <div className="notify-install">
      <p className="notify-settings-label">Add to Home Screen (required on phones)</p>
      <p className="muted notify-guide-lead">
        Push notifications on phones work best when you install this app to your home screen,
        then open it from that icon — not from the browser tab.
      </p>

      {(ios || !android) && (
        <div className="notify-install-block">
          <h4 className="notify-install-title">📱 iPhone (iOS 16.4+)</h4>
          <ol className="notify-steps">
            <li>
              Open this site in <strong>Safari</strong> (not Chrome on iPhone).
            </li>
            <li>
              Tap <strong>Share</strong> at the bottom, then <strong>Add to Home Screen</strong>.
            </li>
            <li>
              Tap <strong>Add</strong>, then open <strong>Moodle Tasks</strong> from your home screen.
            </li>
            <li>Sign in and tap <strong>Enable notifications</strong> below.</li>
          </ol>
        </div>
      )}

      {(android || !ios) && (
        <div className="notify-install-block">
          <h4 className="notify-install-title">🤖 Android (Chrome)</h4>
          <ol className="notify-steps">
            <li>
              Open this site in <strong>Chrome</strong>.
            </li>
            <li>
              Tap the <strong>⋮</strong> menu (top right) → <strong>Add to Home screen</strong> or{' '}
              <strong>Install app</strong>.
            </li>
            <li>
              Confirm, then open <strong>Moodle Tasks</strong> from your home screen or app drawer.
            </li>
            <li>Sign in and tap <strong>Enable notifications</strong> below.</li>
          </ol>
        </div>
      )}
    </div>
  )
}

function NotifyPrefsEditor({
  prefs,
  patchPrefs,
  toggleNotifyType,
}: {
  prefs: NotificationPrefs
  patchPrefs: (patch: Partial<NotificationPrefs>) => void
  toggleNotifyType: (type: TaskType) => void
}) {
  return (
    <>
      <p className="notify-settings-label">When to check</p>
      <div className="notify-toggles">
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.morning}
            onChange={(e) => patchPrefs({ morning: e.target.checked })}
          />
          Morning <span className="muted">09:00</span>
        </label>
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.evening}
            onChange={(e) => patchPrefs({ evening: e.target.checked })}
          />
          Evening <span className="muted">18:00</span>
        </label>
      </div>

      <p className="notify-settings-label">Notify me about</p>
      <div className="notify-toggles">
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.dueToday}
            disabled={prefs.onlyIfNew}
            onChange={(e) => patchPrefs({ dueToday: e.target.checked })}
          />
          Tasks due today
        </label>
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.dueTomorrow}
            disabled={prefs.onlyIfNew}
            onChange={(e) => patchPrefs({ dueTomorrow: e.target.checked })}
          />
          Tasks due tomorrow
        </label>
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.newTasks}
            onChange={(e) => patchPrefs({ newTasks: e.target.checked })}
          />
          New tasks added to Moodle
        </label>
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.onlyIfNew}
            onChange={(e) => patchPrefs({ onlyIfNew: e.target.checked })}
          />
          Only when something is new <span className="muted">(skip due-date reminders)</span>
        </label>
        <label className="notify-check">
          <input
            type="checkbox"
            checked={prefs.includeOpens}
            onChange={(e) => patchPrefs({ includeOpens: e.target.checked })}
          />
          “Opens” events
        </label>
      </div>

      <p className="notify-settings-label">Task types</p>
      <ScrollRow label="Notification task types">
        <div className="type-chips notify-type-chips">
          {ALL_TASK_TYPES.map((t) => {
            const active = prefs.types.includes(t)
            return (
              <button
                key={t}
                type="button"
                className={`chip ${active ? 'on' : ''}`}
                onClick={() => toggleNotifyType(t)}
                title={active ? 'Click to exclude' : 'Click to include'}
              >
                {TYPE_META[t].icon} {TYPE_META[t].label}
              </button>
            )
          })}
        </div>
      </ScrollRow>
    </>
  )
}

export function NotificationGuide({ onClose, inPanel = false }: Props) {
  const { settings, saveSettings } = useAuth()
  const prefs = useMemo(() => mergeNotificationPrefs(settings.notificationPrefs), [settings.notificationPrefs])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const permission = pushSupported() ? getPushPermission() : 'unsupported'
  const enabled = settings.pushEnabled && permission === 'granted'
  const iosInstallFirst = needsIosHomeScreenInstall()
  const showInstallHelp = !enabled && (iosInstallFirst || isAndroid() || isIos())

  useEffect(() => {
    if (!enabled) return
    let unsub: (() => void) | null = null
    subscribeForegroundMessages((title, body) => {
      if (Notification.permission === 'granted') {
        new Notification(title, { body, icon: '/icon-192.png' })
      }
    }).then((fn) => {
      unsub = fn
    })
    return () => {
      unsub?.()
    }
  }, [enabled])

  function patchPrefs(patch: Partial<NotificationPrefs>) {
    saveSettings({ notificationPrefs: { ...prefs, ...patch } })
  }

  function toggleNotifyType(type: TaskType) {
    const types = prefs.types.includes(type)
      ? prefs.types.filter((t) => t !== type)
      : [...prefs.types, type]
    patchPrefs({ types })
  }

  async function handleEnable() {
    setError(null)
    setBusy(true)
    try {
      await enablePushNotifications()
      await saveSettings({ pushEnabled: true, notificationPrefs: prefs })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not enable notifications.')
    } finally {
      setBusy(false)
    }
  }

  async function handleDisable() {
    setError(null)
    setBusy(true)
    try {
      await disablePushNotifications()
      await saveSettings({ pushEnabled: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not disable notifications.')
    } finally {
      setBusy(false)
    }
  }

  const wrapperClass = inPanel ? 'notify-guide notify-guide-panel' : 'notify-guide'

  if (!pushConfigured()) {
    return (
      <div className={`${wrapperClass} notify-guide-muted`}>
        <p className="muted">
          Push notifications need a VAPID key in production setup. See README for Firebase Cloud Messaging setup.
        </p>
      </div>
    )
  }

  if (!showPushSetupUi()) {
    return (
      <div className={`${wrapperClass} notify-guide-muted`}>
        <p className="muted">Web push notifications are not supported in this browser.</p>
      </div>
    )
  }

  return (
    <div className={wrapperClass}>
      {!inPanel && (
        <div className="notify-guide-head">
          <h3>🔔 Task notifications</h3>
          {onClose && (
            <button className="icon-btn" onClick={onClose} aria-label="Hide guide">
              ✕
            </button>
          )}
        </div>
      )}

      {enabled && (
        <p className="notify-status-on">
          🔔 Notifications on · checks at {scheduleSummary(prefs)}
        </p>
      )}

      {!enabled && (
        <p className="muted notify-guide-lead">
          The server checks your Moodle calendar at 09:00 and 18:00 and sends a push when something
          matches your settings — even when the app is closed.
        </p>
      )}

      {showInstallHelp && <HomeScreenInstructions />}

      {permission !== 'granted' && !enabled && !iosInstallFirst && pushSupported() && (
        <ol className="notify-steps">
          <li>Tap <strong>Enable notifications</strong> below.</li>
          <li>When your browser asks, choose <strong>Allow</strong>.</li>
        </ol>
      )}

      <div className="notify-settings">
        <NotifyPrefsEditor prefs={prefs} patchPrefs={patchPrefs} toggleNotifyType={toggleNotifyType} />
      </div>

      {permission === 'denied' && (
        <p className="error notify-denied">
          Notifications are blocked. Enable them in your phone Settings, then try again.
        </p>
      )}

      {error && <p className="error">{error}</p>}

      <div className="notify-guide-actions">
        {enabled ? (
          <button className="btn btn-ghost" onClick={handleDisable} disabled={busy}>
            {busy ? 'Turning off…' : 'Turn off notifications'}
          </button>
        ) : (
          <button
            className="btn btn-primary"
            onClick={handleEnable}
            disabled={busy || permission === 'denied' || iosInstallFirst}
          >
            {busy ? 'Enabling…' : 'Enable notifications'}
          </button>
        )}
        {inPanel && onClose && (
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}
