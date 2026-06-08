const { onCall, HttpsError } = require('firebase-functions/v2/https')
const { onSchedule } = require('firebase-functions/v2/scheduler')
const { defineSecret } = require('firebase-functions/params')
const logger = require('firebase-functions/logger')
const admin = require('firebase-admin')
const { createCipheriv, createDecipheriv, randomBytes } = require('node:crypto')
const { runTaskPushNotifications, bootstrapKnownTasks } = require('./notifications')

admin.initializeApp()
const db = admin.firestore()

// 32-byte (base64) master key. Provided via Secret Manager in production and
// via functions/.secret.local when running the emulator. The plaintext token
// is NEVER stored — only AES-256-GCM ciphertext lives in Firestore.
const ENCRYPTION_KEY = defineSecret('ENCRYPTION_KEY')

const GEMINI_MODEL = 'gemini-2.5-flash'
/** How long to reuse a Moodle .ics response before fetching again. */
const CALENDAR_CACHE_TTL_MS = 15 * 60 * 1000

function getKey() {
  const key = Buffer.from(ENCRYPTION_KEY.value() || '', 'base64')
  if (key.length !== 32) {
    throw new HttpsError('internal', 'Server encryption key is misconfigured.')
  }
  return key
}

function encrypt(plain, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // Layout: [12B IV][16B auth tag][ciphertext]
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

function decrypt(payload, key) {
  const data = Buffer.from(payload, 'base64')
  const iv = data.subarray(0, 12)
  const tag = data.subarray(12, 28)
  const enc = data.subarray(28)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8')
}

function requireAuth(request) {
  const uid = request.auth && request.auth.uid
  if (!uid) throw new HttpsError('unauthenticated', 'You must be signed in.')
  return uid
}

const IS_EMULATOR = !!process.env.FUNCTIONS_EMULATOR

// App Check enforcement is opt-in so the first deploy never breaks before
// reCAPTCHA is registered. Turn it on once App Check is set up by deploying
// with ENFORCE_APP_CHECK=true (e.g. in functions/.env.<projectId>).
const ENFORCE_APP_CHECK = process.env.ENFORCE_APP_CHECK === 'true'

// App Check: reject calls that don't originate from our verified app. Skipped
// in the emulator (no real attestations) and until enforcement is enabled.
function requireAppCheck(request) {
  if (IS_EMULATOR || !ENFORCE_APP_CHECK) return
  if (!request.app) {
    throw new HttpsError('failed-precondition', 'App Check verification failed.')
  }
}

/**
 * Fixed-window per-user rate limiter backed by Firestore. Protects against
 * abuse / runaway costs (especially on aiGenerate). Counters live in the
 * locked `rateLimits/{uid}` doc that no client can read or write.
 */
async function enforceRateLimit(uid, key, limit, windowMs) {
  const ref = db.collection('rateLimits').doc(uid)
  const now = Date.now()
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    const data = (snap.exists && snap.data()) || {}
    const entry = data[key] || { count: 0, windowStart: now }
    let count = entry.count
    let windowStart = entry.windowStart
    if (now - windowStart >= windowMs) {
      count = 0
      windowStart = now
    }
    if (count >= limit) {
      const retry = Math.ceil((windowStart + windowMs - now) / 1000)
      throw new HttpsError('resource-exhausted', `Too many requests. Try again in ${retry}s.`)
    }
    tx.set(ref, { [key]: { count: count + 1, windowStart } }, { merge: true })
  })
}

const callOpts = { secrets: [ENCRYPTION_KEY] }

/** Encrypt and store the Moodle URL and/or Gemini key for the signed-in user. */
exports.saveSecrets = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  await enforceRateLimit(uid, 'save', 30, 60 * 60 * 1000)
  const key = getKey()
  const { moodleUrl, geminiKey } = request.data || {}

  const secretUpdate = { updatedAt: Date.now() }
  const flags = {}

  if (typeof moodleUrl === 'string' && moodleUrl.trim()) {
    const url = moodleUrl.trim()
    if (!/^https?:\/\//i.test(url)) {
      throw new HttpsError('invalid-argument', 'That does not look like a valid URL.')
    }
    secretUpdate.moodleUrl = encrypt(url, key)
    flags.moodleConnected = true
  }
  if (typeof geminiKey === 'string' && geminiKey.trim()) {
    secretUpdate.geminiKey = encrypt(geminiKey.trim(), key)
    flags.geminiConnected = true
  }

  if (Object.keys(flags).length === 0) {
    throw new HttpsError('invalid-argument', 'Nothing to save.')
  }

  await db.collection('secrets').doc(uid).set(secretUpdate, { merge: true })
  await db.collection('users').doc(uid).set(flags, { merge: true })
  if (flags.moodleConnected) {
    await db.collection('calendarCache').doc(uid).delete()
  }
  return { ok: true, ...flags }
})

/** Forget a stored secret. */
exports.disconnect = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  await enforceRateLimit(uid, 'save', 30, 60 * 60 * 1000)
  const which = request.data && request.data.which
  const FieldValue = admin.firestore.FieldValue

  if (which === 'moodle') {
    await db.collection('secrets').doc(uid).set({ moodleUrl: FieldValue.delete() }, { merge: true })
    await db.collection('users').doc(uid).set({ moodleConnected: false }, { merge: true })
    await db.collection('calendarCache').doc(uid).delete()
  } else if (which === 'gemini') {
    await db.collection('secrets').doc(uid).set({ geminiKey: FieldValue.delete() }, { merge: true })
    await db.collection('users').doc(uid).set({ geminiConnected: false }, { merge: true })
  } else {
    throw new HttpsError('invalid-argument', 'Unknown secret.')
  }
  return { ok: true }
})

/** Fetch the user's Moodle calendar server-side and return the raw ICS. */
exports.syncCalendar = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  await enforceRateLimit(uid, 'sync', 40, 10 * 60 * 1000)
  const forceRefresh = !!(request.data && request.data.forceRefresh)
  const snap = await db.collection('secrets').doc(uid).get()
  const enc = snap.get('moodleUrl')
  if (!enc) throw new HttpsError('failed-precondition', 'No Moodle calendar connected.')

  const cacheRef = db.collection('calendarCache').doc(uid)
  if (!forceRefresh) {
    const cacheSnap = await cacheRef.get()
    if (cacheSnap.exists) {
      const { ics, fetchedAt } = cacheSnap.data() || {}
      if (
        typeof ics === 'string' &&
        ics.includes('BEGIN:VCALENDAR') &&
        typeof fetchedAt === 'number' &&
        Date.now() - fetchedAt < CALENDAR_CACHE_TTL_MS
      ) {
        return { ics, cached: true, fetchedAt }
      }
    }
  }

  const url = decrypt(enc, getKey())
  let res
  try {
    res = await fetch(url, { redirect: 'follow' })
  } catch (err) {
    logger.error('Moodle fetch failed', err)
    throw new HttpsError('unavailable', 'Could not reach Moodle. Try again later.')
  }
  if (!res.ok) {
    throw new HttpsError('unavailable', `Moodle responded with ${res.status}.`)
  }
  const ics = await res.text()
  if (!ics.includes('BEGIN:VCALENDAR')) {
    throw new HttpsError('failed-precondition', 'The saved URL is not a valid calendar feed.')
  }
  const fetchedAt = Date.now()
  await cacheRef.set({ ics, fetchedAt })
  return { ics, cached: false, fetchedAt }
})

/** Run a Gemini completion using the user's stored key (key never reaches the client). */
exports.aiGenerate = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  await enforceRateLimit(uid, 'ai', 25, 60 * 60 * 1000)
  const prompt = request.data && request.data.prompt
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new HttpsError('invalid-argument', 'A prompt is required.')
  }
  if (prompt.length > 12000) {
    throw new HttpsError('invalid-argument', 'Prompt is too long.')
  }

  const snap = await db.collection('secrets').doc(uid).get()
  const enc = snap.get('geminiKey')
  if (!enc) throw new HttpsError('failed-precondition', 'No Gemini API key connected.')
  const apiKey = decrypt(enc, getKey())

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4 },
      }),
    },
  )

  if (!res.ok) {
    if (res.status === 400 || res.status === 403) {
      throw new HttpsError('permission-denied', 'Gemini rejected the request — check your API key.')
    }
    throw new HttpsError('internal', `Gemini error ${res.status}.`)
  }

  const data = await res.json()
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []
  const text = parts.map((p) => p.text || '').join('').trim()
  if (!text) throw new HttpsError('internal', 'Gemini returned an empty response.')
  return { text }
})

/** Save the browser FCM token for scheduled push notifications. */
exports.registerPushToken = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  await enforceRateLimit(uid, 'push', 20, 60 * 60 * 1000)
  const token = request.data && request.data.token
  if (typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    throw new HttpsError('invalid-argument', 'Invalid push token.')
  }

  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = userSnap.exists ? userSnap.data() : {}
  const tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : []
  if (!tokens.includes(token)) tokens.push(token)

  await userRef.set({ fcmTokens: tokens, pushEnabled: true }, { merge: true })

  if (userData.moodleConnected) {
    await bootstrapKnownTasks(db, uid, userData, decrypt, getKey)
  }

  return { ok: true, pushEnabled: true }
})

/** Remove an FCM token when the user disables notifications. */
exports.unregisterPushToken = onCall(callOpts, async (request) => {
  const uid = requireAuth(request)
  requireAppCheck(request)
  const token = request.data && request.data.token
  const userRef = db.collection('users').doc(uid)
  const userSnap = await userRef.get()
  const userData = (userSnap.exists && userSnap.data()) || {}
  let tokens = Array.isArray(userData.fcmTokens) ? userData.fcmTokens : []

  if (typeof token === 'string' && token) {
    tokens = tokens.filter((t) => t !== token)
  } else {
    tokens = []
  }

  await userRef.set(
    { fcmTokens: tokens, pushEnabled: tokens.length > 0 },
    { merge: true },
  )
  return { ok: true, pushEnabled: tokens.length > 0 }
})

const scheduleOpts = { secrets: [ENCRYPTION_KEY], timeZone: 'Asia/Jerusalem' }

/** Morning task reminders at 09:00 Israel time. */
exports.sendTaskPushMorning = onSchedule({ schedule: '0 9 * * *', ...scheduleOpts }, async () => {
  await runTaskPushNotifications(admin, db, 'morning', decrypt, getKey)
})

/** Evening task reminders at 18:00 Israel time. */
exports.sendTaskPushEvening = onSchedule({ schedule: '0 18 * * *', ...scheduleOpts }, async () => {
  await runTaskPushNotifications(admin, db, 'evening', decrypt, getKey)
})
