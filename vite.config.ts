import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

function firebaseSwConfigPlugin(mode: string): Plugin {
  return {
    name: 'firebase-sw-config',
    configureServer() {
      writeFirebaseSwConfig(mode)
    },
    buildStart() {
      writeFirebaseSwConfig(mode)
    },
  }
}

function writeFirebaseSwConfig(mode: string) {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const config = {
    apiKey: env.VITE_FIREBASE_API_KEY ?? '',
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? '',
    projectId: env.VITE_FIREBASE_PROJECT_ID ?? '',
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    appId: env.VITE_FIREBASE_APP_ID ?? '',
  }
  const out = resolve(process.cwd(), 'public/firebase-sw-config.js')
  writeFileSync(
    out,
    `/** Auto-generated — do not edit. */\nself.FIREBASE_SW_CONFIG=${JSON.stringify(config)};\n`,
  )
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), firebaseSwConfigPlugin(mode)],
}))
