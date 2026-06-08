export type TaskType =
  | 'assignment'
  | 'quiz'
  | 'exam'
  | 'attendance'
  | 'system'
  | 'other'

/** Whether the event marks something opening or a real deadline. */
export type TaskPhase = 'opens' | 'closes' | 'due'

export interface MoodleTask {
  /** Stable id derived from the ICS UID (or a hash of summary+date). */
  id: string
  /** Cleaned event title. */
  title: string
  /** Original, untouched summary from the calendar. */
  rawSummary: string
  /** Course name parsed from CATEGORIES. */
  course?: string
  /** Numeric course code parsed from CATEGORIES (e.g. "67808"). */
  courseCode?: string
  /** Cleaned, plain-text description. */
  description?: string
  /** Due date/time of the task. */
  due: Date
  /** Classified event type. */
  type: TaskType
  /** Opening vs closing/deadline, when detectable. */
  phase?: TaskPhase
  /** Direct link back to the activity on Moodle, when present. */
  url?: string
}

export type TaskFilter = 'all' | 'upcoming' | 'overdue' | 'done'

export interface TaskOverride {
  done?: boolean
  pinned?: boolean
  note?: string
  /** Hidden from all views (removed from Done list). */
  dismissed?: boolean
}

export interface UserSettings {
  /** Whether a Moodle calendar URL is stored (encrypted, server-side). */
  moodleConnected?: boolean
  /** Whether a Gemini API key is stored (encrypted, server-side). */
  geminiConnected?: boolean
  overrides?: Record<string, TaskOverride>
  /** Task types the user has hidden from view. */
  hiddenTypes?: TaskType[]
  /** Whether to hide quiz/activity "opens" events. */
  hideOpens?: boolean
  /** Web push enabled (FCM tokens stored server-side). */
  pushEnabled?: boolean
  /** What to notify about and when (09:00 / 18:00 checks). */
  notificationPrefs?: NotificationPrefs
  updatedAt?: number
}

/** User-configurable push notification options. */
export interface NotificationPrefs {
  dueToday: boolean
  dueTomorrow: boolean
  newTasks: boolean
  /** When true, skip due-date reminders and only notify for newly added tasks. */
  onlyIfNew: boolean
  morning: boolean
  evening: boolean
  /** Include quiz/activity "opens" events in notifications. */
  includeOpens: boolean
  /** Task types to notify about (allowlist). */
  types: TaskType[]
}

export const ALL_TASK_TYPES: TaskType[] = [
  'assignment',
  'quiz',
  'exam',
  'attendance',
  'system',
  'other',
]

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  dueToday: true,
  dueTomorrow: true,
  newTasks: true,
  onlyIfNew: false,
  morning: true,
  evening: true,
  includeOpens: false,
  types: ['assignment', 'quiz', 'exam', 'other'],
}

export function mergeNotificationPrefs(prefs?: Partial<NotificationPrefs>): NotificationPrefs {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...prefs,
    types: prefs?.types?.length ? prefs.types : DEFAULT_NOTIFICATION_PREFS.types,
  }
}
