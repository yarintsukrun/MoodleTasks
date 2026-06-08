import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'
import type { MoodleTask } from '../types'

/**
 * The Gemini API key is stored encrypted server-side. We send only the prompt
 * to a Cloud Function, which decrypts the key, calls Gemini, and returns text.
 * The key never reaches the browser.
 */
const aiGenerateFn = httpsCallable<{ prompt: string }, { text: string }>(functions, 'aiGenerate')

async function run(prompt: string): Promise<string> {
  const res = await aiGenerateFn({ prompt })
  return res.data.text
}

function summariseTasks(tasks: MoodleTask[]): string {
  const now = new Date()
  return tasks
    .map((t) => {
      const days = Math.ceil((t.due.getTime() - now.getTime()) / 86_400_000)
      const when =
        days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'due today' : `in ${days}d`
      const kind = t.phase && t.phase !== 'due' ? `${t.type}/${t.phase}` : t.type
      return `- [${kind}] ${t.title}${t.course ? ` (${t.course})` : ''} — due ${t.due.toLocaleString()} [${when}]`
    })
    .join('\n')
}

/** Ask Gemini to build a prioritised study plan from the pending tasks. */
export async function generateStudyPlan(tasks: MoodleTask[]): Promise<string> {
  if (!tasks.length) return 'You have no pending tasks. Enjoy the break! 🎉'
  const prompt = `You are a focused academic productivity coach. A student has these pending Moodle tasks:

${summariseTasks(tasks)}

Today is ${new Date().toLocaleString()}.

Create a short, motivating action plan:
1. Highlight the 1-3 most urgent tasks and why.
2. Suggest a realistic order to tackle everything this week.
3. Flag any tasks that are overdue or due very soon.

Keep it concise, use markdown with short bullet points, and be encouraging.`
  return run(prompt)
}

/** Ask Gemini to break a single task into concrete sub-steps. */
export async function breakdownTask(task: MoodleTask): Promise<string> {
  const prompt = `A student needs help with this academic task:

Title: ${task.title}
${task.course ? `Course: ${task.course}\n` : ''}Due: ${task.due.toLocaleString()}
${task.description ? `Details: ${task.description}\n` : ''}

Break this down into 4-6 concrete, actionable sub-steps with a suggested time estimate for each. Use a markdown checklist.`
  return run(prompt)
}
