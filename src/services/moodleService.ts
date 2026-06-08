import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { MoodleTask, TaskPhase, TaskType } from '../types'

/**
 * The Moodle URL is a secret (it contains an auth token). It is stored
 * encrypted server-side and never reaches the browser. This callable runs a
 * Cloud Function that decrypts the URL, fetches the .ics from Moodle
 * server-to-server (with a Firestore cache — 15 min TTL), and returns the raw
 * calendar text.
 */
export interface CalendarSyncResult {
  tasks: MoodleTask[]
  cached: boolean
  fetchedAt: Date | null
}

const syncCalendarFn = httpsCallable<
  { forceRefresh?: boolean },
  { ics: string; cached?: boolean; fetchedAt?: number }
>(functions, 'syncCalendar')

/** @param forceRefresh Pass true when the user clicks Sync to bypass the server cache. */
export async function fetchMoodleCalendar(forceRefresh = false): Promise<CalendarSyncResult> {
  const res = await syncCalendarFn({ forceRefresh })
  return {
    tasks: parseICS(res.data.ics),
    cached: res.data.cached ?? false,
    fetchedAt: res.data.fetchedAt ? new Date(res.data.fetchedAt) : null,
  }
}

/** Unfold folded lines (RFC 5545: continuation lines start with a space/tab). */
function unfold(ics: string): string[] {
  const rawLines = ics.replace(/\r\n/g, '\n').split('\n')
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function unescapeText(value: string): string {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Parse an iCalendar date value (DATE or DATE-TIME, with or without Z/TZID). */
function parseDate(value: string): Date | null {
  const v = value.trim()
  // DATE-TIME: 20250115T235900Z  or  20250115T235900
  const dt = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (dt) {
    const [, y, mo, d, h, mi, s, z] = dt
    if (z) {
      return new Date(
        Date.UTC(+y, +mo - 1, +d, +h, +mi, +s),
      )
    }
    return new Date(+y, +mo - 1, +d, +h, +mi, +s)
  }
  // DATE only: 20250115
  const date = v.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (date) {
    const [, y, mo, d] = date
    return new Date(+y, +mo - 1, +d, 23, 59, 0)
  }
  const parsed = new Date(v)
  return isNaN(parsed.getTime()) ? null : parsed
}

function extractUrl(text: string): string | undefined {
  const match = text.match(/https?:\/\/[^\s"'<>]+/)
  return match ? match[0] : undefined
}

/** CATEGORIES looks like "67808-מערכות הפעלה" (code-name) or "אירועי מערכת". */
function parseCourse(categories?: string): { course?: string; courseCode?: string } {
  if (!categories) return {}
  const c = categories.trim()
  const m = c.match(/^(\d{4,})\s*-\s*(.+)$/)
  if (m) return { courseCode: m[1], course: m[2].trim() }
  return { course: c }
}

const SYSTEM_COURSES = ['אירועי מערכת']

/** Classify a Moodle event into a task type + phase from its summary/course. */
function classify(
  summary: string,
  courseName?: string,
): { type: TaskType; phase?: TaskPhase } {
  const s = summary.toLowerCase()

  let phase: TaskPhase | undefined
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

  if (s.includes('attendance') || summary.includes('נוכחות')) {
    return { type: 'attendance', phase }
  }
  if (courseName && SYSTEM_COURSES.includes(courseName)) {
    return { type: 'system', phase }
  }
  if (s.includes('exam') || summary.includes('מבחן')) {
    return { type: 'exam', phase }
  }
  if (s.includes('quiz') || summary.includes('בוחן')) {
    return { type: 'quiz', phase }
  }
  if (
    phase === 'due' ||
    s.includes('exercise') ||
    /\bex[\s-]?\d/.test(s) ||
    /\bhw\s*\d/.test(s) ||
    summary.includes('להגיש') ||
    summary.includes('תרגיל')
  ) {
    return { type: 'assignment', phase }
  }
  return { type: 'other', phase }
}

/** Strip Hebrew action prefixes and wrapping quotes for a cleaner title. */
function cleanTitle(summary: string): string {
  let t = summary.trim()
  t = t.replace(/^יש להגיש את\s*/, '')
  t = t.replace(/^נפתח ב\s*/, '')
  t = t.replace(/^תאריך הגשה\s*/, '')
  t = t.replace(/^['"\u2018\u2019\u201c\u201d](.*)['"\u2018\u2019\u201c\u201d]$/, '$1')
  return t.trim() || summary.trim()
}

export function parseICS(ics: string): MoodleTask[] {
  const lines = unfold(ics)
  const tasks: MoodleTask[] = []
  let current: Record<string, string> | null = null

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
    const keyPart = line.slice(0, idx) // may include params, e.g. DTSTART;VALUE=DATE
    const value = line.slice(idx + 1)
    const key = keyPart.split(';')[0].toUpperCase()
    // Keep the first occurrence; store raw value.
    current[key] = value
  }

  return tasks
    .filter((t): t is MoodleTask => t !== null)
    .sort((a, b) => a.due.getTime() - b.due.getTime())
}

function buildTask(fields: Record<string, string>): MoodleTask {
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

  return {
    id,
    title,
    rawSummary,
    course,
    courseCode,
    description: description || undefined,
    due,
    type,
    phase,
    url,
  }
}
