# 📚 Moodle Task Manager

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Open source](https://img.shields.io/badge/open--source-yes-brightgreen)](#-open-source)

A React + TypeScript app that pulls your **Moodle calendar** feed, lists every
deadline ordered by date, and helps you stay on top of submissions — with
Google sign-in, cloud sync, and an optional **Gemini AI** study coach.

**Live demo:** [moodletasks.web.app](https://moodletasks.web.app) · **Source:** [github.com/yarintsukrun/MoodleTasks](https://github.com/yarintsukrun/MoodleTasks)

> **Disclaimer:** This project is **not affiliated with Moodle Pty Ltd**. See [DISCLAIMER.md](./DISCLAIMER.md).

## 📖 Open source

This repository is published under the **[MIT License](./LICENSE)**.

| Document | Purpose |
| --- | --- |
| [DISCLAIMER.md](./DISCLAIMER.md) | Moodle trademark & third-party services |
| [PRIVACY.md](./PRIVACY.md) | What data the demo deployment stores |
| [SECURITY.md](./SECURITY.md) | Security model & vulnerability reporting |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | How to fork, develop, and open PRs |

**Self-hosting:** Use your own Firebase project and `.env` — never commit real keys. See [Security](#-security-model) and `.env.example`.

## ✨ Features

- **Google sign-in** via Firebase Authentication.
- **Moodle calendar import** — paste your `.ics` export URL and all assignments,
  quizzes and deadlines are fetched, parsed and **sorted by due date**.
- **Smart highlights** — colour-coded urgency (overdue / due soon / upcoming),
  live "due today / in 3 days" labels, and at-a-glance stats.
- **Filter & search** — tabs for Upcoming / Overdue / All / Done, plus search and
  per-course filtering.
- **Mark done & pin** important tasks. Your progress **syncs to Firestore** and
  is available on any device (with a local fallback).
- **🔔 Web push notifications** — optional reminders at **09:00** and **18:00**
  (Israel time) when tasks are due today/tomorrow or when new Moodle tasks appear.
- **🤖 Gemini AI** — generate a prioritised weekly study plan, or break any single
  task into actionable sub-steps with time estimates.

## 🚀 Getting started

### 1. Install dependencies

```bash
npm install
cd functions && npm install && cd ..
```

### Run fully locally with emulators (no real Firebase project needed)

The repo is pre-configured for the **Firebase Emulator Suite** (Auth, Firestore,
Functions). You need **Java** (for Firestore) and the Firebase CLI (`npm i -g firebase-tools`).

1. Generate a 32-byte encryption key and put it in `functions/.secret.local`:

   ```bash
   node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('base64'))" > functions/.secret.local
   ```

2. Create your `.env` with emulator mode enabled:

   ```bash
   cp .env.example .env   # it already has VITE_USE_EMULATORS=true
   ```

3. Start everything:

   ```bash
   npm run dev:local
   ```

   This runs Vite **and** the emulators together. Open the app, click *Continue with
   Google* → *Add new account* (fake local account), then add your Moodle URL in Settings.
   Inspect data at the Emulator UI (http://127.0.0.1:4000/).

> The emulator runs the Cloud Functions locally, so the Moodle fetch works offline and
> for free. For **production**, Cloud Functions outbound networking requires the Blaze plan,
> and you should set `ENCRYPTION_KEY` via Secret Manager:
> `firebase functions:secrets:set ENCRYPTION_KEY`.

## 🌐 Use a real Firebase project (production)

### 1. Create a Firebase project

1. Go to the [Firebase console](https://console.firebase.google.com/) and create a project
   on the **Blaze plan** (required for Cloud Functions outbound networking).
2. **Build → Authentication → Sign-in method → enable Google.**
3. **Build → Firestore Database → Create database** (start in production mode).
4. **Project settings → Your apps → Web app** → register an app and copy the config.
5. Paste the Firestore rules from [`firestore.rules`](./firestore.rules) into
   **Firestore → Rules** and publish.
6. Set the encryption key as a secret and deploy the functions:

   ```bash
   firebase functions:secrets:set ENCRYPTION_KEY   # paste a base64 32-byte key
   firebase deploy --only functions,firestore:rules
   ```

7. In your `.env`, set `VITE_USE_EMULATORS=false`.

### 2. Add your config

Copy `.env.example` to `.env` and fill in the values from the console:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_VAPID_KEY=...   # Web Push — see below
```

### Web push notifications (optional)

1. Firebase Console → **Project settings → Cloud Messaging**.
2. Under **Web Push certificates**, click **Generate key pair** and copy the key.
3. Add it to `.env` as `VITE_FIREBASE_VAPID_KEY` (and the same GitHub secret for CI).
4. Deploy functions (includes scheduled jobs at 09:00 & 18:00 `Asia/Jerusalem`):

   ```bash
   firebase deploy --only functions,firestore
   ```

5. In the app, use the **Task notifications** guide on the dashboard → **Enable notifications**.

**iPhone:** Add the site to your **Home Screen** first (Share → Add to Home Screen), open
from the icon, then enable notifications. iOS 16.4+ required.

Notifications fire when (respecting your **notification settings** in the app):

- A task is **due today or tomorrow** (if enabled)
- A **new task** appears in your Moodle calendar (if enabled)
- At **09:00** and/or **18:00** Israel time (whichever slots you turned on)

The app does not need to be open. A **scheduled Cloud Function** fetches each user’s Moodle
calendar, compares it to the last snapshot in Firestore, and sends FCM push to registered devices.

### 3. Run it

```bash
npm run dev          # app only (functions must be deployed)
```

Open the printed URL, sign in with Google, then click **⚙️ Settings** to add:

- **Moodle calendar URL** — in Moodle open *Calendar → Export calendar*, choose
  "All events" + a time range, and copy the generated export link.
- **Gemini API key** (optional) — grab a free one at
  [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) to
  unlock the AI study coach.

## 🔧 How it works

- **`functions/`** is a Cloud Functions backend that:
  - Stores your Moodle URL and Gemini key **encrypted (AES-256-GCM)** in a locked
    `secrets/{uid}` collection that clients can never read (see `firestore.rules`).
  - `syncCalendar` decrypts the URL and fetches the `.ics` **server-to-server**, so the
    token never travels through your browser or any third party (this also avoids CORS).
    Responses are **cached in Firestore** (`calendarCache/{uid}`, 15 min TTL) so repeated
    opens don’t hammer Moodle. Click **Sync** to force a fresh fetch.
  - `aiGenerate` decrypts **each user’s own** Gemini API key and calls Gemini server-side.
    **You (the project owner) do not pay for Gemini** — each user brings their own key.
  - **Scheduled push** (`sendTaskPushMorning` / `sendTaskPushEvening`) runs at 09:00 and
    18:00 Israel time, diffs each user’s Moodle calendar against `notificationState/{uid}`,
    and sends FCM web push when tasks are due today/tomorrow or newly added.
  - `registerPushToken` / `unregisterPushToken` store FCM tokens on `users/{uid}`.
- **`src/services/moodleService.ts`** calls `syncCalendar` and parses the returned `.ics`.
- **`src/services/geminiService.ts`** sends only a prompt to `aiGenerate`.
- **`src/context/`** holds Firebase auth + Firestore-backed *non-secret* settings.
- Per-task overrides (done/pinned) and filter prefs live at `users/{uid}`. **No secrets
  are ever stored in the browser / localStorage.**

### 🔐 Security model

| Concern | How it's handled |
| --- | --- |
| Moodle token leaking to a 3rd-party proxy | Eliminated — fetch happens server-side in a Cloud Function |
| Token/key readable from the browser | They're never sent to the client; only a `connected` flag is |
| Token/key at rest | Encrypted with AES-256-GCM; ciphertext stored in `secrets/{uid}` |
| Who can read `secrets/{uid}` | Nobody via the client (`allow read, write: if false`) — only the Admin SDK in functions |
| Encryption master key | `ENCRYPTION_KEY` from Secret Manager (prod) / `functions/.secret.local` (emulator) |
| Bots/scripts calling the API | **App Check** (reCAPTCHA v3) — functions reject requests without a valid app attestation |
| Abuse / runaway Gemini cost | **Per-user rate limits** enforced in Firestore (`rateLimits/{uid}`, no client access) |

**Rate limits** (per signed-in user): `aiGenerate` 25/hour, `syncCalendar` 40 / 10 min,
secret saves 30/hour. Exceeding them returns a `resource-exhausted` error with a retry hint.

**App Check** enforcement is **opt-in** so your first deploy never breaks. The
verification code is in place but dormant until you turn it on:
1. Firebase Console → **App Check** → register your web app with **reCAPTCHA v3**.
2. Put the reCAPTCHA **site key** in `VITE_RECAPTCHA_SITE_KEY` (and the GitHub secret of
   the same name for CI builds).
3. Enable enforcement by deploying functions with `ENFORCE_APP_CHECK=true` — add it to
   `functions/.env.<your-project-id>` (gitignored), then redeploy.
4. Optionally set **Cloud Functions = Enforced** in the App Check console too.

Until step 3, rate-limiting is fully active but App Check simply passes through.

> If you ever suspect your Moodle link leaked, reset the calendar token in Moodle
> (*Calendar → Export → it regenerates*) and re-save it here.

## 🔄 Continuous deployment (GitHub → Firebase)

A workflow at [`.github/workflows/firebase-deploy.yml`](./.github/workflows/firebase-deploy.yml)
builds the app and deploys **Hosting + Functions + Firestore rules** on every push to `main`.

To enable it, add these **GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | **Entire** JSON file from Firebase Console → Project settings → Service accounts → *Generate new private key* (not just the email or project id) |
| `FIREBASE_PROJECT_ID` | Optional — defaults to `VITE_FIREBASE_PROJECT_ID` |
| `VITE_FIREBASE_API_KEY` … `VITE_FIREBASE_APP_ID` | Your Firebase web config (same 6 values as `.env`) |
| `VITE_FIREBASE_VAPID_KEY` | Web Push key from Cloud Messaging → Web Push certificates |

Then set the encryption key once (from your machine, not in CI):

```bash
firebase functions:secrets:set ENCRYPTION_KEY   # paste a base64 32-byte key
```

> Cloud Functions deploys require the **Blaze** plan. Generate a service account at
> Firebase Console → Project settings → Service accounts → *Generate new private key*.

### CI service account IAM roles (required)

The service account in `FIREBASE_SERVICE_ACCOUNT` must be allowed to **deploy** Hosting,
Functions, Firestore rules, and read the `ENCRYPTION_KEY` secret. Use the `client_email`
from the JSON key.

1. Open [Google Cloud IAM](https://console.cloud.google.com/iam-admin/iam) for **your** Firebase project
2. **Grant access** → paste the service account email (e.g. `firebase-adminsdk-…@your-project.iam.gserviceaccount.com`)
3. Add these roles:

| Role | Fixes |
| --- | --- |
| **Service Account User** | `iam.serviceAccounts.ActAs on …@appspot.gserviceaccount.com` |
| **Cloud Functions Admin** | Functions deploy |
| **Cloud Run Admin** | Gen 2 functions (Cloud Run) |
| **Firebase Admin** | Hosting + broad deploy access |
| **Firebase Rules Admin** | `firebaserules.googleapis.com … 403` when deploying rules |
| **Secret Manager Admin** | `secretmanager.secrets.get denied on ENCRYPTION_KEY` during functions deploy |
| **Cloud Scheduler Admin** | `cloudscheduler.jobs.update` 403 when deploying scheduled functions (`sendTaskPushMorning` / `sendTaskPushEvening`) |
| **Service Usage Consumer** | Enable/use GCP APIs during deploy |

> **Note:** *Secret Manager Secret Accessor* alone is **not enough** for deploy — Firebase
> needs `secretmanager.secrets.get` to bind secrets to functions. Use **Secret Manager Admin**
> on the CI service account (or grant **Viewer** + **Secret Accessor** together).

4. Confirm the secret exists (once, from your machine):

   ```bash
   firebase use prod   # or: firebase use moodletasks
   firebase functions:secrets:set ENCRYPTION_KEY
   firebase functions:secrets:access ENCRYPTION_KEY   # should print the key value
   ```

   Or in console: Google Cloud → **Secret Manager** → `ENCRYPTION_KEY`

5. **Grant on the secret itself** (if project-level IAM still fails): open `ENCRYPTION_KEY` →
   **Permissions** → **Grant access** → add the CI service account with **Secret Manager Admin**.

6. **Scheduled push functions** need **Cloud Scheduler Admin** on the same CI service account.
   Without it, deploy fails with `cloudscheduler.jobs.update` 403 for scheduled push functions.
   Also ensure the [Cloud Scheduler API](https://console.cloud.google.com/apis/library/cloudscheduler.googleapis.com)
   is enabled for your project.

Then **Re-run** the failed GitHub Actions job (no code change needed).

If your university org blocks granting roles, ask a **project Owner** to add them.

## 🛠️ Scripts

| Command | Description |
| --- | --- |
| `npm run dev:local` | Run Vite **and** the Firebase emulators together (recommended for local dev) |
| `npm run emulators` | Start only the Firebase emulators (Auth, Firestore, Functions) |
| `npm run dev` | Start just the Vite dev server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
