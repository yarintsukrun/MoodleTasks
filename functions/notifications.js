const logger = require('firebase-functions/logger')
const {
  parseICS,
  daysUntil,
  filterTasksForNotifications,
  mergeNotificationPrefs,
} = require('./parseIcs')

const CALENDAR_CACHE_TTL_MS = 15 * 60 * 1000

async function fetchUserIcs(db, uid, decrypt, getKey) {
  const cacheRef = db.collection('calendarCache').doc(uid)
  const cacheSnap = await cacheRef.get()
  if (cacheSnap.exists) {
    const { ics, fetchedAt } = cacheSnap.data() || {}
    if (
      typeof ics === 'string' &&
      ics.includes('BEGIN:VCALENDAR') &&
      typeof fetchedAt === 'number' &&
      Date.now() - fetchedAt < CALENDAR_CACHE_TTL_MS
    ) {
      return ics
    }
  }

  const secretSnap = await db.collection('secrets').doc(uid).get()
  const enc = secretSnap.get('moodleUrl')
  if (!enc) return null

  const url = decrypt(enc, getKey())
  let res
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch (err) {
    logger.warn('Moodle fetch failed for push', { uid, err: String(err) })
    return null
  }
  if (!res.ok) {
    logger.warn('Moodle bad status for push', { uid, status: res.status })
    return null
  }
  const ics = await res.text()
  if (!ics.includes('BEGIN:VCALENDAR')) return null
  await cacheRef.set({ ics, fetchedAt: Date.now() })
  return ics
}

function buildNotificationPayload(actionable, knownIds, prefsInput, now = new Date()) {
  const prefs = mergeNotificationPrefs(prefsInput)
  const known = new Set(knownIds || [])
  const isBootstrap = known.size === 0

  let dueToday = prefs.dueToday ? actionable.filter((t) => daysUntil(t.due, now) === 0) : []
  let dueTomorrow = prefs.dueTomorrow
    ? actionable.filter((t) => daysUntil(t.due, now) === 1)
    : []
  let newTasks =
    prefs.newTasks && !isBootstrap ? actionable.filter((t) => !known.has(t.id)) : []

  if (prefs.onlyIfNew) {
    dueToday = []
    dueTomorrow = []
  }

  if (dueToday.length === 0 && dueTomorrow.length === 0 && newTasks.length === 0) {
    return null
  }

  const parts = []
  if (dueToday.length === 1) parts.push(`1 task due today`)
  else if (dueToday.length > 1) parts.push(`${dueToday.length} tasks due today`)
  if (dueTomorrow.length === 1) parts.push(`1 task due tomorrow`)
  else if (dueTomorrow.length > 1) parts.push(`${dueTomorrow.length} tasks due tomorrow`)
  if (newTasks.length === 1) parts.push(`New: ${newTasks[0].title}`)
  else if (newTasks.length > 1) {
    parts.push(`${newTasks.length} new tasks — ${newTasks[0].title}, ${newTasks[1].title}`)
    if (newTasks.length > 2) parts[parts.length - 1] += ` +${newTasks.length - 2} more`
  }

  let title = 'Moodle Tasks'
  if (newTasks.length > 0 && dueToday.length + dueTomorrow.length === 0) title = 'New Moodle task'
  else if (newTasks.length === 0) title = 'Task reminder'

  return {
    title,
    body: parts.join(' · '),
    knownTaskIds: actionable.map((t) => t.id),
  }
}

async function sendPushToUser(admin, db, uid, userData, slot, decrypt, getKey) {
  const prefs = mergeNotificationPrefs(userData.notificationPrefs)
  if (slot === 'morning' && !prefs.morning) return { uid, sent: false, reason: 'morning_disabled' }
  if (slot === 'evening' && !prefs.evening) return { uid, sent: false, reason: 'evening_disabled' }

  const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens.filter(Boolean) : []
  if (tokens.length === 0) return { uid, sent: false, reason: 'no_tokens' }

  const ics = await fetchUserIcs(db, uid, decrypt, getKey)
  if (!ics) return { uid, sent: false, reason: 'no_calendar' }

  const tasks = parseICS(ics)
  const actionable = filterTasksForNotifications(tasks, userData)

  const stateRef = db.collection('notificationState').doc(uid)
  const stateSnap = await stateRef.get()
  const knownIds = stateSnap.exists ? stateSnap.data().knownTaskIds : []

  const payload = buildNotificationPayload(actionable, knownIds, userData.notificationPrefs)
  if (!payload) {
    await stateRef.set(
      { knownTaskIds: actionable.map((t) => t.id), updatedAt: Date.now() },
      { merge: true },
    )
    return { uid, sent: false, reason: 'nothing_to_send' }
  }

  const messaging = admin.messaging()
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title: payload.title, body: payload.body },
    webpush: {
      fcmOptions: { link: '/' },
      notification: { icon: '/icon-192.png' },
    },
    data: { slot, url: '/' },
  })

  const validTokens = []
  res.responses.forEach((r, i) => {
    if (r.success) validTokens.push(tokens[i])
    else if (
      r.error?.code === 'messaging/invalid-registration-token' ||
      r.error?.code === 'messaging/registration-token-not-registered'
    ) {
      logger.info('Removing stale FCM token', { uid })
    } else {
      validTokens.push(tokens[i])
      logger.warn('FCM send error', { uid, error: r.error?.message })
    }
  })

  await db.collection('users').doc(uid).set(
    { fcmTokens: validTokens, pushEnabled: validTokens.length > 0 },
    { merge: true },
  )
  await stateRef.set(
    {
      knownTaskIds: payload.knownTaskIds,
      lastPushAt: Date.now(),
      lastPushSlot: slot,
      updatedAt: Date.now(),
    },
    { merge: true },
  )

  return { uid, sent: res.successCount > 0, successCount: res.successCount }
}

async function runTaskPushNotifications(admin, db, slot, decrypt, getKey) {
  const snap = await db
    .collection('users')
    .where('pushEnabled', '==', true)
    .where('moodleConnected', '==', true)
    .get()

  const results = []
  for (const doc of snap.docs) {
    try {
      results.push(await sendPushToUser(admin, db, doc.id, doc.data(), slot, decrypt, getKey))
    } catch (err) {
      logger.error('Push failed for user', { uid: doc.id, err: String(err) })
      results.push({ uid: doc.id, sent: false, reason: 'error' })
    }
  }
  logger.info('Task push run complete', { slot, users: snap.size, sent: results.filter((r) => r.sent).length })
  return results
}

async function bootstrapKnownTasks(db, uid, userSettings, decrypt, getKey) {
  const ics = await fetchUserIcs(db, uid, decrypt, getKey)
  if (!ics) return
  const tasks = parseICS(ics)
  const actionable = filterTasksForNotifications(tasks, userSettings)
  await db.collection('notificationState').doc(uid).set(
    { knownTaskIds: actionable.map((t) => t.id), updatedAt: Date.now() },
    { merge: true },
  )
}

module.exports = { runTaskPushNotifications, bootstrapKnownTasks, buildNotificationPayload }
