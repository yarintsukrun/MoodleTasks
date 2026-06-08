import type { MoodleTask, TaskOverride } from '../types'
import { urgency } from '../utils'

interface Props {
  tasks: MoodleTask[]
  overrides: Record<string, TaskOverride>
}

export function Stats({ tasks, overrides }: Props) {
  const pending = tasks.filter((t) => !overrides[t.id]?.done)
  const overdue = pending.filter((t) => urgency(t.due) === 'overdue').length
  const soon = pending.filter((t) => urgency(t.due) === 'soon').length
  const done = tasks.filter((t) => overrides[t.id]?.done).length

  const items = [
    { label: 'Pending', value: pending.length, cls: 'upcoming' },
    { label: 'Due soon', value: soon, cls: 'soon' },
    { label: 'Overdue', value: overdue, cls: 'overdue' },
    { label: 'Completed', value: done, cls: 'done' },
  ]

  return (
    <div className="stats">
      {items.map((it) => (
        <div key={it.label} className={`stat stat-${it.cls}`}>
          <span className="stat-value">{it.value}</span>
          <span className="stat-label">{it.label}</span>
        </div>
      ))}
    </div>
  )
}
