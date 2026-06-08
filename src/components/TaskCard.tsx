import type { MoodleTask, TaskOverride, TaskType } from '../types'
import { formatDate, formatTime, relativeLabel, urgency } from '../utils'

export const TYPE_META: Record<TaskType, { icon: string; label: string }> = {
  assignment: { icon: '📝', label: 'Assignment' },
  quiz: { icon: '❓', label: 'Quiz' },
  exam: { icon: '🎓', label: 'Exam' },
  attendance: { icon: '🪑', label: 'Attendance' },
  system: { icon: '📅', label: 'System' },
  other: { icon: '📌', label: 'Other' },
}

const PHASE_LABEL: Record<string, string> = {
  opens: 'Opens',
  closes: 'Closes',
  due: 'Due',
}

interface Props {
  task: MoodleTask
  override: TaskOverride
  onToggleDone: () => void
  onDismiss: () => void
  onTogglePin: () => void
  onAi: () => void
  aiBusy: boolean
}

export function TaskCard({ task, override, onToggleDone, onDismiss, onTogglePin, onAi, aiBusy }: Props) {
  const done = override.done ?? false
  const level = done ? 'done' : urgency(task.due)
  const meta = TYPE_META[task.type]

  return (
    <article className={`task ${level} ${done ? 'is-done' : ''}`}>
      <button
        className={`check ${done ? 'checked' : ''}`}
        onClick={onToggleDone}
        title={done ? 'Reopen task' : 'Mark as done'}
        aria-label={done ? 'Reopen task' : 'Mark as done'}
      >
        {done ? '✓' : ''}
      </button>

      <div className="task-body">
        <div className="task-top">
          <span className="task-icon" title={meta.label}>{meta.icon}</span>
          <h3 className="task-title" dir="auto">{task.title}</h3>
          {task.phase && task.phase !== 'due' && (
            <span className={`phase phase-${task.phase}`}>{PHASE_LABEL[task.phase]}</span>
          )}
          {override.pinned && <span className="pin-flag" title="Pinned">📌</span>}
        </div>
        {task.course && <div className="task-course" dir="auto">{task.course}</div>}
        {task.description && <p className="task-desc" dir="auto">{task.description}</p>}
        <div className="task-meta">
          <span className={`badge badge-${level}`}>{done ? 'Done' : relativeLabel(task.due)}</span>
          <span className="task-type-tag">{meta.label}</span>
          <span className="task-date">
            {formatDate(task.due)} · {formatTime(task.due)}
          </span>
          {task.url && (
            <a className="task-link" href={task.url} target="_blank" rel="noreferrer">
              Open in Moodle ↗
            </a>
          )}
        </div>
      </div>

      <div className="task-actions">
        {done ? (
          <>
            <button className="btn btn-ghost task-act" onClick={onToggleDone}>
              Reopen
            </button>
            <button className="btn btn-ghost task-act task-act-danger" onClick={onDismiss}>
              Remove
            </button>
          </>
        ) : (
          <>
            <button className="icon-btn" onClick={onTogglePin} title="Pin task">
              {override.pinned ? '📌' : '📍'}
            </button>
            <button className="icon-btn" onClick={onAi} disabled={aiBusy} title="AI breakdown">
              {aiBusy ? '…' : '✨'}
            </button>
          </>
        )}
      </div>
    </article>
  )
}
