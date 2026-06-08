import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/authContext'
import { fetchMoodleCalendar } from '../services/moodleService'
import { breakdownTask, generateStudyPlan } from '../services/geminiService'
import type { MoodleTask, TaskFilter, TaskType } from '../types'
import { urgency } from '../utils'
import { TaskCard, TYPE_META } from './TaskCard'
import { Stats } from './Stats'
import { AiPanel } from './AiPanel'
import { Settings } from './Settings'
import { WeekCalendar } from './WeekCalendar'
import { NotificationPanel } from './NotificationPanel'
import { ScrollRow } from './ScrollRow'
import { LegalFooter } from './LegalFooter'

type ViewMode = 'list' | 'calendar'

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All open' },
  { key: 'done', label: 'Done' },
]

const TYPE_ORDER: TaskType[] = ['assignment', 'quiz', 'exam', 'attendance', 'system', 'other']
const DEFAULT_HIDDEN: TaskType[] = ['attendance', 'system']

export function Dashboard() {
  const { user, settings, signOutUser, setOverride, saveSettings } = useAuth()

  const [tasks, setTasks] = useState<MoodleTask[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastSync, setLastSync] = useState<Date | null>(null)
  const [fromCache, setFromCache] = useState(false)

  const [filter, setFilter] = useState<TaskFilter>('upcoming')
  const [viewMode, setViewMode] = useState<ViewMode>('list')
  const [search, setSearch] = useState('')
  const [course, setCourse] = useState('all')
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  const [ai, setAi] = useState<{ title: string; content: string | null; loading: boolean; error: string | null } | null>(null)
  const [aiTaskId, setAiTaskId] = useState<string | null>(null)

  const overrides = settings.overrides ?? {}
  const hiddenTypes = settings.hiddenTypes ?? DEFAULT_HIDDEN
  const hideOpens = settings.hideOpens ?? true

  const loadTasks = useCallback(async (forceRefresh = false) => {
    if (!settings.moodleConnected) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchMoodleCalendar(forceRefresh)
      setTasks(result.tasks)
      setLastSync(result.fetchedAt ?? new Date())
      setFromCache(result.cached)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load calendar')
    } finally {
      setLoading(false)
    }
  }, [settings.moodleConnected])

  useEffect(() => {
    loadTasks()
  }, [loadTasks])

  function toggleType(type: TaskType) {
    const next = hiddenTypes.includes(type)
      ? hiddenTypes.filter((t) => t !== type)
      : [...hiddenTypes, type]
    saveSettings({ hiddenTypes: next })
  }

  const typeCounts = useMemo(() => {
    const counts: Partial<Record<TaskType, number>> = {}
    tasks.forEach((t) => {
      counts[t.type] = (counts[t.type] ?? 0) + 1
    })
    return counts
  }, [tasks])

  // Tasks that pass the type / opens filters — used for stats and the list.
  const scoped = useMemo(
    () =>
      tasks.filter(
        (t) =>
          !overrides[t.id]?.dismissed &&
          !hiddenTypes.includes(t.type) &&
          !(hideOpens && t.phase === 'opens'),
      ),
    [tasks, hiddenTypes, hideOpens, overrides],
  )

  const courses = useMemo(() => {
    const set = new Set<string>()
    scoped.forEach((t) => t.course && set.add(t.course))
    return Array.from(set).sort()
  }, [scoped])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped
      .filter((t) => {
        const done = overrides[t.id]?.done ?? false
        if (filter === 'done' && !done) return false
        if (filter !== 'done' && done) return false
        if (filter === 'upcoming' && urgency(t.due) === 'overdue') return false
        if (filter === 'overdue' && urgency(t.due) !== 'overdue') return false
        if (course !== 'all' && t.course !== course) return false
        if (q) {
          const hay = `${t.title} ${t.rawSummary} ${t.course ?? ''} ${t.description ?? ''}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        const pa = overrides[a.id]?.pinned ? 0 : 1
        const pb = overrides[b.id]?.pinned ? 0 : 1
        if (pa !== pb) return pa - pb
        return a.due.getTime() - b.due.getTime()
      })
  }, [scoped, overrides, filter, course, search])

  const calendarTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scoped.filter((t) => {
      if (overrides[t.id]?.done) return false
      if (course !== 'all' && t.course !== course) return false
      if (q) {
        const hay = `${t.title} ${t.rawSummary} ${t.course ?? ''} ${t.description ?? ''}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [scoped, overrides, course, search])

  async function runStudyPlan() {
    if (!settings.geminiConnected) {
      setShowSettings(true)
      return
    }
    const pending = scoped.filter((t) => !overrides[t.id]?.done)
    setAi({ title: 'Your study plan', content: null, loading: true, error: null })
    try {
      const content = await generateStudyPlan(pending)
      setAi({ title: 'Your study plan', content, loading: false, error: null })
    } catch (err) {
      setAi({ title: 'Your study plan', content: null, loading: false, error: err instanceof Error ? err.message : 'AI error' })
    }
  }

  async function runBreakdown(task: MoodleTask) {
    if (!settings.geminiConnected) {
      setShowSettings(true)
      return
    }
    setAiTaskId(task.id)
    setAi({ title: task.title, content: null, loading: true, error: null })
    try {
      const content = await breakdownTask(task)
      setAi({ title: task.title, content, loading: false, error: null })
    } catch (err) {
      setAi({ title: task.title, content: null, loading: false, error: err instanceof Error ? err.message : 'AI error' })
    } finally {
      setAiTaskId(null)
    }
  }

  const noUrl = !settings.moodleConnected
  const availableTypes = TYPE_ORDER.filter((t) => (typeCounts[t] ?? 0) > 0)

  return (
    <div className="dash">
      <header className="topbar">
        <div className="brand">
          <span className="brand-badge">📚</span>
          <span className="brand-name">Moodle Tasks</span>
        </div>
        <div className="topbar-actions">
          <button
            className="btn btn-ghost btn-compact"
            onClick={() => loadTasks(true)}
            disabled={loading || noUrl}
            title="Sync from Moodle"
          >
            <span aria-hidden>⟳</span>
            <span className="btn-compact-label">Sync</span>
          </button>
          <button
            className="btn btn-primary btn-compact"
            onClick={runStudyPlan}
            disabled={noUrl}
            title="AI study plan"
          >
            <span aria-hidden>✨</span>
            <span className="btn-compact-label">Plan</span>
          </button>
          <button
            className={`icon-btn ${settings.pushEnabled ? 'icon-btn-active' : ''}`}
            onClick={() => setShowNotifications(true)}
            title="Notifications"
            aria-label="Notifications"
          >
            🔔
          </button>
          <button className="icon-btn" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            ⚙️
          </button>
          {user?.photoURL ? (
            <img className="avatar" src={user.photoURL} alt={user.displayName ?? 'You'} title={user.displayName ?? ''} />
          ) : (
            <span className="avatar avatar-fallback">{user?.displayName?.[0] ?? 'U'}</span>
          )}
          <button className="btn btn-ghost btn-compact btn-signout" onClick={signOutUser} title="Sign out">
            <span className="btn-compact-label">Sign out</span>
          </button>
        </div>
      </header>

      <main className="content">
        {noUrl ? (
          <div className="empty">
            <div className="empty-icon">🔗</div>
            <h2>Connect your Moodle calendar</h2>
            <p className="muted">Add your calendar export URL to start tracking deadlines.</p>
            <button className="btn btn-primary" onClick={() => setShowSettings(true)}>Add calendar URL</button>
          </div>
        ) : (
          <>
            <Stats tasks={scoped} overrides={overrides} />

            {availableTypes.length > 0 && (
              <ScrollRow className="type-chips-row" label="Task type filters">
                <div className="type-chips">
                {availableTypes.map((t) => {
                  const active = !hiddenTypes.includes(t)
                  return (
                    <button
                      key={t}
                      className={`chip ${active ? 'on' : ''}`}
                      onClick={() => toggleType(t)}
                      title={active ? 'Click to hide' : 'Click to show'}
                    >
                      {TYPE_META[t].icon} {TYPE_META[t].label}
                      <span className="chip-count">{typeCounts[t]}</span>
                    </button>
                  )
                })}
                <button
                  className={`chip ${hideOpens ? '' : 'on'}`}
                  onClick={() => saveSettings({ hideOpens: !hideOpens })}
                  title="Quiz/activity opening events are not deadlines"
                >
                  {hideOpens ? '🙈' : '👁️'} “Opens” events
                </button>
                </div>
              </ScrollRow>
            )}

            <div className="toolbar">
              <div className="tabs view-tabs view-tabs-full">
                <button
                  className={`tab ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => setViewMode('list')}
                >
                  📋 List
                </button>
                <button
                  className={`tab ${viewMode === 'calendar' ? 'active' : ''}`}
                  onClick={() => setViewMode('calendar')}
                >
                  📅 Calendar
                </button>
              </div>

              {viewMode === 'list' && (
                <div className="filter-tabs-row">
                  <div className="tabs filter-tabs filter-tabs-full" role="tablist" aria-label="Task filters">
                    {FILTERS.map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        role="tab"
                        aria-selected={filter === f.key}
                        className={`tab filter-tab ${filter === f.key ? 'active' : ''}`}
                        onClick={() => setFilter(f.key)}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="toolbar-filters">
                <input
                  className="input search"
                  placeholder="Search tasks…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {courses.length > 0 && (
                  <select className="input" value={course} onChange={(e) => setCourse(e.target.value)}>
                    <option value="all">All courses</option>
                    {courses.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {error && (
              <div className="banner banner-error">
                <span>{error}</span>
                <button className="btn btn-ghost" onClick={() => loadTasks(true)}>Retry</button>
              </div>
            )}

            {loading && tasks.length === 0 ? (
              <div className="empty"><div className="spinner" /><p>Loading your deadlines…</p></div>
            ) : viewMode === 'calendar' ? (
              <WeekCalendar
                tasks={calendarTasks}
                overrides={overrides}
                onToggleDone={(id) => setOverride(id, { done: !(overrides[id]?.done ?? false) })}
              />
            ) : visible.length === 0 ? (
              <div className="empty">
                <div className="empty-icon">🎉</div>
                <h2>Nothing here</h2>
                <p className="muted">No tasks match this view. Try another tab, type, or sync again.</p>
              </div>
            ) : (
              <div className="task-list">
                {visible.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    override={overrides[t.id] ?? {}}
                    onToggleDone={() => setOverride(t.id, { done: !(overrides[t.id]?.done ?? false) })}
                    onDismiss={() => setOverride(t.id, { dismissed: true, done: true })}
                    onTogglePin={() => setOverride(t.id, { pinned: !(overrides[t.id]?.pinned ?? false) })}
                    onAi={() => runBreakdown(t)}
                    aiBusy={aiTaskId === t.id}
                  />
                ))}
              </div>
            )}

            {lastSync && (
              <p className="sync-note muted">
                {fromCache ? 'Loaded from cache' : 'Fetched from Moodle'} · {lastSync.toLocaleTimeString()}
                {!fromCache && ' · cache refreshes every 15 min'}
              </p>
            )}

            <LegalFooter />
          </>
        )}
      </main>

      {ai && (
        <AiPanel title={ai.title} content={ai.content} loading={ai.loading} error={ai.error} onClose={() => setAi(null)} />
      )}
      {showSettings && (
        <Settings onClose={() => setShowSettings(false)} onSaved={() => loadTasks(true)} />
      )}
      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </div>
  )
}
