import { useMemo, useState } from 'react'
import type { MoodleTask, TaskOverride } from '../types'
import {
  buildTwoWeekRows,
  calendarRangeBounds,
  dayKey,
  formatTime,
  formatWeekLabel,
  isSameDay,
  urgency,
} from '../utils'
import { TYPE_META } from './TaskCard'

interface Props {
  tasks: MoodleTask[]
  overrides: Record<string, TaskOverride>
  onToggleDone: (taskId: string) => void
}

export function WeekCalendar({ tasks, overrides, onToggleDone }: Props) {
  const [weekOffset, setWeekOffset] = useState(0)
  const today = useMemo(() => new Date(), [])
  const { min, max } = useMemo(() => calendarRangeBounds(today), [today])
  const rows = useMemo(() => buildTwoWeekRows(weekOffset, today), [weekOffset, today])

  const tasksByDay = useMemo(() => {
    const map = new Map<string, MoodleTask[]>()
    for (const task of tasks) {
      if (overrides[task.id]?.done) continue
      if (task.due < min || task.due > max) continue
      const key = dayKey(task.due)
      const list = map.get(key) ?? []
      list.push(task)
      map.set(key, list)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.due.getTime() - b.due.getTime())
    }
    return map
  }, [tasks, overrides, min, max])

  const weekLabels = rows.map((days) => formatWeekLabel(days[0]!))

  return (
    <div className="week-cal">
      <div className="week-cal-nav">
        <button
          className="btn btn-ghost week-cal-arrow"
          disabled={weekOffset <= -1}
          onClick={() => setWeekOffset((o) => o - 1)}
          aria-label="Previous weeks"
        >
          ←
        </button>
        <div className="week-cal-range muted">
          1 week back · up to 2 weeks ahead
        </div>
        <button
          className="btn btn-ghost week-cal-arrow"
          disabled={weekOffset >= 1}
          onClick={() => setWeekOffset((o) => o + 1)}
          aria-label="Next weeks"
        >
          →
        </button>
      </div>

      {rows.map((days, rowIdx) => (
        <section key={rowIdx} className="week-cal-row">
          <header className="week-cal-row-head">
            <span className="week-cal-row-label">Week {rowIdx + 1}</span>
            <span className="week-cal-row-dates">{weekLabels[rowIdx]}</span>
          </header>
          <div className="week-cal-grid">
            {days.map((day) => {
              const key = dayKey(day)
              const dayTasks = tasksByDay.get(key) ?? []
              const dayStart = new Date(day)
              dayStart.setHours(0, 0, 0, 0)
              const todayStart = new Date(today)
              todayStart.setHours(0, 0, 0, 0)
              const inRange = dayStart >= min && dayStart <= max
              const isToday = isSameDay(day, today)
              const isPast = dayStart < todayStart && !isToday

              return (
                <div
                  key={key}
                  className={`week-cal-day ${isToday ? 'is-today' : ''} ${isPast ? 'is-past' : ''} ${!inRange ? 'is-outside' : ''}`}
                >
                  <div className="week-cal-day-head">
                    <span className="week-cal-dow">
                      {day.toLocaleDateString(undefined, { weekday: 'short' })}
                    </span>
                    <span className={`week-cal-num ${isToday ? 'today-num' : ''}`}>{day.getDate()}</span>
                  </div>
                  <div className="week-cal-events">
                    {dayTasks.length === 0 ? (
                      inRange && <span className="week-cal-empty">—</span>
                    ) : (
                      dayTasks.map((task) => {
                        const level = urgency(task.due)
                        const meta = TYPE_META[task.type]
                        return (
                          <button
                            key={task.id}
                            type="button"
                            className={`week-cal-event ${level}`}
                            title={`${task.title}\n${formatTime(task.due)}${task.course ? `\n${task.course}` : ''}`}
                            onClick={() => onToggleDone(task.id)}
                          >
                            <span className="week-cal-event-icon">{meta.icon}</span>
                            <span className="week-cal-event-body">
                              <span className="week-cal-event-title" dir="auto">
                                {task.title}
                              </span>
                              <span className="week-cal-event-time">{formatTime(task.due)}</span>
                            </span>
                          </button>
                        )
                      })
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      ))}

      <p className="week-cal-hint muted">
        Click a task to mark it done · {tasksByDay.size} days with tasks in range
      </p>
    </div>
  )
}
