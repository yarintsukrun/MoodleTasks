/** Server-side Moodle .ics parser (mirrors src/services/moodleService.ts). */

function unfold(ics) {
  const rawLines = ics.replace(/\r\n/g, '\n').split('\n')
  const lines = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function unescapeText(value) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function stripHtml(value) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseDate(value) {
  const v = value.trim()
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt
    if (z) return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s))
    return new Date(+y, +mo - 1, +d, +h, +mi, +s)
  }
  const date = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date) {
    const [, y, mo, d] = date
    return new Date(+y, +mo - 1, +d, 23, 59, 0)
  }
  const parsed = new Date(v)
  return isNaN(parsed.getTime()) ? null : parsed
}

function extractUrl(text) {
  const match = text.match(/https?:\/\/[^\s"'<>]+/)
  return match ? match[0] : undefined
}

function parseCourse(categories) {
  if (!categories) return {}
  const c = categories.trim()
  const m = c.match(/^(\d{4,})\s*-\s*(.+)$/)
  if (m) return { courseCode: m[1], course: m[2].trim() }
  return { course: c }
}

const SYSTEM_COURSES = ['אירועי מערכת']

function classify(summary, courseName) {
  const s = summary.toLowerCase()
  let phase
  if (/\bopens?\b/.test(s) || summary.includes('נפתח')) phase = 'opens'
  else if (/\bcloses?\b/.test(s)) phase = 'closes'
  else if (
    /\bis due\b/.test(s) ||
    /\bsubmission\b/.test(s) ||
    summary.includes('יש להגיש') ||
    summary.includes('תאריך הגשה') ||
    summary.includes('הגשה')
  )
    phase = 'due'

  if (s.includes('attendance') || summary.includes('נוכחות')) return { type: 'attendance', phase }
  if (courseName && SYSTEM_COURSES.includes(courseName)) return { type: 'system', phase }
  if (s.includes('exam') || summary.includes('מבחן')) return { type: 'exam', phase }
  if (s.includes('quiz') || summary.includes('בוחן')) return { type: 'quiz', phase }
  if (
    phase === 'due' ||
    s.includes('exercise') ||
    /\bex[\s-]?\d/.test(s) ||
    /\bhw\s*\d/.test(s) ||
    summary.includes('להגיש') ||
    summary.includes('תרגיל')
  )
    return { type: 'assignment', phase }
  return { type: 'other', phase }
}

function cleanTitle(summary) {
  let t = summary.trim()
  t = t.replace(/^יש להגיש את\s*/, '')
  t = t.replace(/^נפתח ב\s*/, '')
  t = t.replace(/^תאריך הגשה\s*/, '')
  t = t.replace(/^['"\u2018\u2019\u201c\u201d](.*)['"\u2018\u2019\u201c\u201d]$/, '$1')
  return t.trim() || summary.trim()
}

function buildTask(fields) {
  const rawSummary = unescapeText(fields.SUMMARY ?? 'Untitled task').trim()
  const rawDescription = fields.DESCRIPTION ? unescapeText(fields.DESCRIPTION) : ''
  const description = stripHtml(rawDescription)
  const { course, courseCode } = parseCourse(fields.CATEGORIES)
  const { type, phase } = classify(rawSummary, course)
  const title = cleanTitle(rawSummary)
  const due =
    parseDate(fields.DTSTART ?? '') ??
    parseDate(fields.DTEND ?? '') ??
    new Date()
  const id =
    (fields.UID && fields.UID.trim()) ||
    `${title}-${due.getTime()}`.replace(/\s+/g, '-')
  const url = extractUrl(rawDescription) ?? fields.URL?.trim()
  return { id, title, rawSummary, course, courseCode, description: description || undefined, due, type, phase, url }
}

function parseICS(ics) {
  const lines = unfold(ics)
  const tasks = []
  let current = null

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {}
      continue
    }
    if (line === 'END:VEVENT') {
      if (current) tasks.push(buildTask(current))
      current = null
      continue
    }
    if (!current) continue
    const idx = line.indexOf(':')
    if (idx === -1) continue
    const keyPart = line.slice(0, idx)
    const value = line.slice(idx + 1)
    const key = keyPart.split(';')[0].toUpperCase()
    current[key] = value
  }

  return tasks
    .filter(Boolean)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
}

function daysUntil(date, now = new Date()) {
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

const DEFAULT_HIDDEN = ['attendance', 'system']

const DEFAULT_NOTIFICATION_PREFS = {
  dueToday: true,
  dueTomorrow: true,
  newTasks: true,
  onlyIfNew: false,
  morning: true,
  evening: true,
  includeOpens: false,
  types: ['assignment', 'quiz', 'exam', 'other'],
}

function mergeNotificationPrefs(prefs) {
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...prefs,
    types: prefs?.types?.length ? prefs.types : DEFAULT_NOTIFICATION_PREFS.types,
  }
}

function filterTasksForUser(tasks, userSettings) {
  const overrides = userSettings.overrides ?? {}
  const hiddenTypes = userSettings.hiddenTypes ?? DEFAULT_HIDDEN
  const hideOpens = userSettings.hideOpens ?? true

  return tasks.filter((t) => {
    const ov = overrides[t.id] ?? {}
    if (ov.dismissed || ov.done) return false
    if (hiddenTypes.includes(t.type)) return false
    if (hideOpens && t.phase === 'opens') return false
    return true
  })
}

/** Notification allowlist — separate from dashboard visibility filters. */
function filterTasksForNotifications(tasks, userSettings) {
  const overrides = userSettings.overrides ?? {}
  const prefs = mergeNotificationPrefs(userSettings.notificationPrefs)
  const allowed = new Set(prefs.types)

  return tasks.filter((t) => {
    const ov = overrides[t.id] ?? {}
    if (ov.dismissed || ov.done) return false
    if (!allowed.has(t.type)) return false
    if (!prefs.includeOpens && t.phase === 'opens') return false
    return true
  })
}

module.exports = {
  parseICS,
  daysUntil,
  filterTasksForUser,
  filterTasksForNotifications,
  mergeNotificationPrefs,
}
