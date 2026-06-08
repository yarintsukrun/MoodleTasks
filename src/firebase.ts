import { initializeApp } from 'firebase/app'
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check'
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth'
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const useEmulators = import.meta.env.VITE_USE_EMULATORS === 'true'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY ?? (useEmulators ? 'demo-api-key' : undefined),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? (useEmulators ? 'localhost' : undefined),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? (useEmulators ? 'demo-moodle-tasks' : undefined),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? (useEmulators ? 'demo-app' : undefined),
}

export const firebaseConfigured =
  useEmulators || Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)

export { firebaseConfig }

const app = initializeApp(firebaseConfig)

// App Check: proves requests come from our real app so the backend can reject
// scripts/bots. Only initialised when a reCAPTCHA v3 site key is configured.
// In the emulator we also enable a debug token (functions skip enforcement there).
const recaptchaSiteKey = import.meta.env.VITE_RECAPTCHA_SITE_KEY
if (recaptchaSiteKey) {
  if (useEmulators) {
    // @ts-expect-error -- debug flag read by the App Check SDK at runtime
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = true
  }
  initializeAppCheck(app, {
    provider: new ReCaptchaV3Provider(recaptchaSiteKey),
    isTokenAutoRefreshEnabled: true,
  })
}

export const auth = getAuth(app)
export const db = getFirestore(app)
export const functions = getFunctions(app)
export const googleProvider = new GoogleAuthProvider()
googleProvider.setCustomParameters({ prompt: 'select_account' })

if (useEmulators) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
}

/** Lazy-init FCM (browser only; not supported in all environments). */
export async function getMessagingIfSupported() {
  if (typeof window === 'undefined' || !firebaseConfigured) return null
  try {
    const { getMessaging, isSupported } = await import('firebase/messaging')
    if (!(await isSupported())) return null
    return getMessaging(app)
  } catch {
    return null
  }
}
