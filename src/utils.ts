export function daysUntil(date: Date): number {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const target = new Date(date)
  target.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - start.getTime()) / 86_400_000)
}

export function relativeLabel(date: Date): string {
  const d = daysUntil(date)
  if (d < -1) return `${Math.abs(d)} days overdue`
  if (d === -1) return 'Yesterday'
  if (d === 0) return 'Due today'
  if (d === 1) return 'Tomorrow'
  if (d < 7) return `In ${d} days`
  if (d < 14) return 'Next week'
  return `In ${Math.round(d / 7)} weeks`
}

export function urgency(date: Date): 'overdue' | 'soon' | 'upcoming' | 'later' {
  const d = daysUntil(date)
  if (d < 0) return 'overdue'
  if (d <= 2) return 'soon'
  if (d <= 7) return 'upcoming'
  return 'later'
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

/** Start of week (Sunday = 0, common in Israel). */
export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  const day = d.getDay()
  d.setDate(d.getDate() - day)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function endOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(23, 59, 59, 999)
  return d
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

export function dayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Calendar bounds: 1 week back through 2 weeks forward from today. */
export function calendarRangeBounds(now = new Date()): { min: Date; max: Date } {
  const min = new Date(now)
  min.setHours(0, 0, 0, 0)
  min.setDate(min.getDate() - 7)
  const max = new Date(now)
  max.setHours(23, 59, 59, 999)
  max.setDate(max.getDate() + 14)
  return { min, max }
}

/** Two week-rows for the calendar; offset -1 | 0 | 1 slides within the allowed range. */
export function buildTwoWeekRows(offset: number, now = new Date()): Date[][] {
  const clamped = Math.max(-1, Math.min(1, offset))
  const thisWeek = startOfWeek(now)
  const row1Start = addDays(thisWeek, clamped * 7)
  const rows: Date[][] = []
  for (let w = 0; w < 2; w++) {
    const weekStart = addDays(row1Start, w * 7)
    const days: Date[] = []
    for (let d = 0; d < 7; d++) days.push(addDays(weekStart, d))
    rows.push(days)
  }
  return rows
}

export function formatWeekLabel(weekStart: Date): string {
  const end = addDays(weekStart, 6)
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }
  const a = weekStart.toLocaleDateString(undefined, opts)
  const b = end.toLocaleDateString(undefined, opts)
  return `${a} – ${b}`
}

/** Very small markdown -> HTML renderer for AI output (headings, bullets, bold). */
export function miniMarkdown(md: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const lines = escape(md).split('\n')
  const html: string[] = []
  let inList = false

  const inline = (s: string) =>
    s
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>')
      .replace(/`(.+?)`/g, '<code>$1</code>')

  for (const raw of lines) {
    const line = raw.trimEnd()
    const bullet = line.match(/^\s*[-*]\s+(.*)/)
    const checkbox = line.match(/^\s*[-*]\s+\[[ xX]\]\s+(.*)/)
    const heading = line.match(/^(#{1,3})\s+(.*)/)

    if (checkbox) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li class="check">${inline(checkbox[1])}</li>`)
    } else if (bullet) {
      if (!inList) { html.push('<ul>'); inList = true }
      html.push(`<li>${inline(bullet[1])}</li>`)
    } else {
      if (inList) { html.push('</ul>'); inList = false }
      if (heading) {
        const level = heading[1].length + 2
        html.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      } else if (line) {
        html.push(`<p>${inline(line)}</p>`)
      }
    }
  }
  if (inList) html.push('</ul>')
  return html.join('')
}
