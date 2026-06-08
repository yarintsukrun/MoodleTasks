import { miniMarkdown } from '../utils'

interface Props {
  title: string
  content: string | null
  loading: boolean
  error: string | null
  onClose: () => void
}

export function AiPanel({ title, content, loading, error, onClose }: Props) {
  return (
    <div className="ai-overlay" onClick={onClose}>
      <div className="ai-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ai-head">
          <h2>✨ {title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="ai-content">
          {loading && (
            <div className="ai-loading">
              <div className="spinner" />
              <p>Thinking with Gemini…</p>
            </div>
          )}
          {error && <p className="error">{error}</p>}
          {content && !loading && (
            <div
              className="markdown"
              dangerouslySetInnerHTML={{ __html: miniMarkdown(content) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
