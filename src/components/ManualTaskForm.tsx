import { useState } from 'react'
import type { ManualTask, ManualTaskInput, TaskType } from '../types'
import { ALL_TASK_TYPES } from '../types'
import { TYPE_META } from './taskMeta'

interface Props {
  initial?: ManualTask
  onSave: (input: ManualTaskInput) => Promise<void>
  onClose: () => void
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function defaultDueLocal(): string {
  const d = new Date()
  d.setHours(23, 59, 0, 0)
  return toDatetimeLocalValue(d.toISOString())
}

export function ManualTaskForm({ initial, onSave, onClose }: Props) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [course, setCourse] = useState(initial?.course ?? '')
  const [description, setDescription] = useState(initial?.description ?? '')
  const [dueLocal, setDueLocal] = useState(initial ? toDatetimeLocalValue(initial.due) : defaultDueLocal())
  const [type, setType] = useState<TaskType>(initial?.type ?? 'other')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Title is required.')
      return
    }
    if (!dueLocal) {
      setError('Due date is required.')
      return
    }
    const due = new Date(dueLocal)
    if (Number.isNaN(due.getTime())) {
      setError('Invalid due date.')
      return
    }
    setSaving(true)
    try {
      await onSave({
        title: trimmed,
        course: course.trim() || undefined,
        description: description.trim() || undefined,
        due: due.toISOString(),
        type,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save task.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="ai-overlay" onClick={onClose}>
      <div className="ai-panel manual-task-panel" onClick={(e) => e.stopPropagation()}>
        <header className="ai-head">
          <h2>{initial ? '✏️ Edit task' : '➕ Add personal task'}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <form className="ai-content manual-task-form" onSubmit={handleSubmit}>
          <p className="muted manual-task-lead">
            Personal tasks stay in your account and are not synced from Moodle.
          </p>

          <label className="field">
            <span className="field-label">Title</span>
            <input
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Read chapter 3, submit lab report…"
              autoFocus
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Due date & time</span>
            <input
              className="input"
              type="datetime-local"
              value={dueLocal}
              onChange={(e) => setDueLocal(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Course / label (optional)</span>
            <input
              className="input"
              value={course}
              onChange={(e) => setCourse(e.target.value)}
              placeholder="Biology 101, Personal, Work…"
            />
          </label>

          <label className="field">
            <span className="field-label">Notes (optional)</span>
            <textarea
              className="input manual-task-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extra details, links, reminders…"
              rows={3}
            />
          </label>

          <label className="field">
            <span className="field-label">Type</span>
            <select className="input" value={type} onChange={(e) => setType(e.target.value as TaskType)}>
              {ALL_TASK_TYPES.filter((t) => t !== 'system').map((t) => (
                <option key={t} value={t}>
                  {TYPE_META[t].icon} {TYPE_META[t].label}
                </option>
              ))}
            </select>
          </label>

          {error && <p className="error">{error}</p>}

          <div className="manual-task-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Add task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
