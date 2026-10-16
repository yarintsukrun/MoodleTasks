import { getToken, deleteToken, onMessage, type Messaging } from 'firebase/messaging'
import { httpsCallable } from 'firebase/functions'
import { getMessagingIfSupported, functions } from '../firebase'

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined
const TOKEN_KEY = 'moodle-push-token'

const registerPushTokenFn = httpsCallable<{ token: string }, { ok: boolean }>(
  functions,
  'registerPushToken',
)
const unregisterPushTokenFn = httpsCallable<{ token: string }, { ok: boolean }>(
  functions,
  'unregisterPushToken',
)
const sendTestPushFn = httpsCallable<{ token?: string }, { ok: boolean; sent: number }>(
  functions,
  'sendTestPush',
)

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator
}

/** iOS only exposes web push after the user installs the PWA to the Home Screen. */
export function needsIosHomeScreenInstall(): boolean {
  return isIos() && !isStandalonePwa()
}

/** Whether we should show the notification setup UI (not the admin/VAPID error). */
export function showPushSetupUi(): boolean {
  if (!pushConfigured()) return false
  return pushSupported() || needsIosHomeScreenInstall()
}

export function isIos(): boolean {
  // Classic iPhone/iPod/iPad UA, plus iPadOS 13+ which reports as "Macintosh"
  // but is touch-capable (real Macs report maxTouchPoints === 0).
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  )
}

export function isAndroid(): boolean {
  return /Android/i.test(navigator.userAgent)
}

export function isStandalonePwa(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator && !!(navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export function getPushPermission(): NotificationPermission | 'unsupported' {
  if (!pushSupported()) return 'unsupported'
  return Notification.permission
}

export function getStoredPushToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

function storePushToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const reg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' })
  await navigator.serviceWorker.ready
  return reg
}

export async function enablePushNotifications(): Promise<string> {
  if (!vapidKey?.trim()) {
    throw new Error('Push is not configured yet (missing VAPID key in server setup).')
  }
  if (!pushSupported()) {
    throw new Error('This browser does not support web push notifications.')
  }
  if (isIos() && !isStandalonePwa()) {
    throw new Error('On iPhone, add this app to your Home Screen first, then enable notifications.')
  }

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission was denied.')
  }

  const reg = await ensureServiceWorker()
  const messaging = await getMessagingIfSupported()
  if (!messaging) throw new Error('Push notifications are not supported in this browser.')

  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg })
  if (!token) throw new Error('Could not register for push notifications.')

  await registerPushTokenFn({ token })
  storePushToken(token)
  return token
}

async function obtainFcmToken(): Promise<string> {
  if (!vapidKey?.trim()) {
    throw new Error('Push is not configured yet (missing VAPID key in server setup).')
  }
  if (!pushSupported()) {
    throw new Error('This browser does not support web push notifications.')
  }
  if (getPushPermission() !== 'granted') {
    throw new Error('Notification permission was denied.')
  }
  if (isIos() && !isStandalonePwa()) {
    throw new Error('On iPhone, add this app to your Home Screen first, then enable notifications.')
  }

  const messaging = await getMessagingIfSupported()
  if (!messaging) throw new Error('Push notifications are not supported in this browser.')

  const reg = (await navigator.serviceWorker.getRegistration()) ?? (await ensureServiceWorker())
  const token = await getToken(messaging, { vapidKey, serviceWorkerRegistration: reg })
  if (!token) {
    throw new Error('Could not register for push notifications. Turn notifications off and on again.')
  }
  storePushToken(token)
  return token
}

/** Ensure this device has an FCM token and that the server has stored it. */
export async function ensurePushTokenRegistered(): Promise<string> {
  const token = await obtainFcmToken()
  await registerPushTokenFn({ token })
  return token
}

/** Ask the server to send an immediate test push to this user's devices. */
export async function sendTestPushNotification(): Promise<number> {
  const token = await obtainFcmToken()
  const res = await sendTestPushFn({ token })
  return res.data?.sent ?? 0
}

/**
 * Show a notification from the foreground. iOS standalone PWAs do NOT support
 * the `new Notification()` constructor (it throws "Illegal constructor"), so we
 * route through the service worker there. Desktop Chrome works best with
 * `new Notification()` when the tab is focused.
 */
export async function showLocalNotification(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const options: NotificationOptions = { body, icon: '/icon-192.png' }

  if (!isIos()) {
    try {
      new Notification(title, options)
      return
    } catch {
      /* fall through to service worker */
    }
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.showNotification(title, options)
        return
      }
    }
  } catch {
    /* fall through */
  }

  if (isIos()) {
    try {
      new Notification(title, options)
    } catch {
      /* iOS without an active SW registration */
    }
  }
}

export async function disablePushNotifications(): Promise<void> {
  const token = getStoredPushToken()
  const messaging = await getMessagingIfSupported()
  if (messaging && token) {
    try {
      await deleteToken(messaging)
    } catch {
      /* token may already be invalid */
    }
  }
  await unregisterPushTokenFn({ token: token ?? '' })
  storePushToken(null)
}

/**
 * Detach this device from the signed-in account before sign-out. Deleting the
 * FCM registration stops delivery even if the server call fails (the server
 * prunes the dead token on its next send). Only this device's token is removed
 * — other devices keep their reminders. Never throws: sign-out must not block.
 */
export async function releasePushTokenOnSignOut(): Promise<void> {
  const token = getStoredPushToken()
  storePushToken(null)
  if (!token && getPushPermission() !== 'granted') return

  await Promise.allSettled([
    (async () => {
      const messaging = await getMessagingIfSupported()
      if (messaging) await deleteToken(messaging)
    })(),
    token ? unregisterPushTokenFn({ token }) : Promise.resolve(),
  ])
}

export async function subscribeForegroundMessages(
  handler: (title: string, body: string) => void,
): Promise<(() => void) | null> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return null
  return onMessage(messaging as Messaging, (payload) => {
    const title = payload.notification?.title ?? payload.data?.title ?? 'Moodle Tasks'
    const body = payload.notification?.body ?? payload.data?.body ?? ''
    handler(title, body)
  })
}

export function pushConfigured(): boolean {
  return Boolean(vapidKey?.trim())
}
