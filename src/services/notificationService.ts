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
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
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

export async function subscribeForegroundMessages(
  handler: (title: string, body: string) => void,
): Promise<(() => void) | null> {
  const messaging = await getMessagingIfSupported()
  if (!messaging) return null
  return onMessage(messaging as Messaging, (payload) => {
    const title = payload.notification?.title ?? 'Moodle Tasks'
    const body = payload.notification?.body ?? ''
    handler(title, body)
  })
}

export function pushConfigured(): boolean {
  return Boolean(vapidKey?.trim())
}
