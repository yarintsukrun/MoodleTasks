# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| `main` branch | ✅ Active development |

There are no numbered releases yet. Security fixes land on `main`.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Email **yarin.tsukrun@gmail.com** with:

- Description of the issue and impact
- Steps to reproduce
- Affected component (client, Cloud Functions, Firestore rules, CI, etc.)

We aim to acknowledge within **72 hours** and provide a fix or mitigation timeline when possible.

## Security model (summary)

- **Moodle calendar URLs** and **Gemini API keys** are encrypted at rest (AES-256-GCM) in
  Firestore `secrets/{uid}`. Clients cannot read this collection (`firestore.rules`).
- **Server-side fetch** — Moodle `.ics` feeds are fetched from Cloud Functions, not the browser.
- **App Check** (reCAPTCHA v3) can be enabled to block unauthenticated clients from calling functions.
- **Rate limits** on `saveSecrets`, `syncCalendar`, `aiGenerate`, and push registration.

Full details are in the [README](./README.md#-security-model).

## Secrets and configuration

**Never commit:**

| File / secret | Purpose |
| --- | --- |
| `.env`, `.env.production` | Firebase web config, VAPID key, reCAPTCHA site key |
| `functions/.secret.local` | Local `ENCRYPTION_KEY` for emulators |
| `functions/.env.*` | e.g. `ENFORCE_APP_CHECK=true` |
| `FIREBASE_SERVICE_ACCOUNT` (CI) | Deploy credentials — GitHub secret only |
| User Moodle URLs / Gemini keys | Stored encrypted in Firestore per user |

`public/firebase-sw-config.js` is **generated at build time** from `VITE_*` variables and
is listed in `.gitignore`. Do not commit real values.

## For self-hosters

1. Generate a unique `ENCRYPTION_KEY` — never reuse keys from examples or other deployments.
2. Enable App Check before production traffic (`ENFORCE_APP_CHECK=true`).
3. Review Firestore rules after any schema change.
4. Rotate a user's Moodle export token in Moodle if you suspect leakage.
