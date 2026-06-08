import { NotificationGuide } from './NotificationGuide'

interface Props {
  onClose: () => void
}

export function NotificationPanel({ onClose }: Props) {
  return (
    <div className="ai-overlay" onClick={onClose}>
      <div className="ai-panel notify-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ai-head">
          <h2>🔔 Notifications</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="ai-content notify-panel-body">
          <NotificationGuide inPanel onClose={onClose} />
        </div>
      </div>
    </div>
  )
}
