import type { TaskType } from '../types'

export const TYPE_META: Record<TaskType, { icon: string; label: string }> = {
  assignment: { icon: '📝', label: 'Assignment' },
  quiz: { icon: '❓', label: 'Quiz' },
  exam: { icon: '🎓', label: 'Exam' },
  attendance: { icon: '🪑', label: 'Attendance' },
  system: { icon: '📅', label: 'System' },
  other: { icon: '📌', label: 'Other' },
}
