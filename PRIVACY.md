# Privacy Policy

*Last updated: June 2026*

This policy applies to **Moodle Task Manager** when you use a deployment operated by the
project author (e.g. [moodletasks.web.app](https://moodletasks.web.app)). If you **self-host**
your own instance, you are the data controller and should publish your own policy.

## What we collect

| Data | Why | Where it lives |
| --- | --- | --- |
| Google account (email, name, uid) | Sign-in | Firebase Authentication |
| Moodle calendar export URL | Fetch your deadlines | Encrypted in Firestore `secrets/{uid}` |
| Gemini API key (optional) | AI study coach | Encrypted in Firestore `secrets/{uid}` |
| Task overrides (done, pinned, dismissed) | Your progress | Firestore `users/{uid}` |
| Filter / UI preferences | Remember your view | Firestore `users/{uid}` |
| FCM push token (optional) | Send reminders | Firestore `users/{uid}` |
| Cached `.ics` text | Reduce Moodle load (15 min TTL) | Firestore `calendarCache/{uid}` (server-only) |

We **do not** sell your data. We **do not** store your Moodle password.

## What we do not store in the browser

Moodle URLs and Gemini keys are **not** kept in `localStorage`. Only non-secret preferences
may be cached locally as a fallback.

## Third parties

- **Google / Firebase** — auth, database, hosting, functions, messaging
- **Google Gemini** — only when you add your own API key; prompts go server-to-server
- **Your Moodle institution** — calendar feed you provide

See their respective privacy policies.

## Retention

Data remains until you delete your account data or disconnect services in Settings. Cached
calendar data expires after about **15 minutes**. You can disconnect Moodle and Gemini in
Settings at any time.

## Your choices

- Do not connect Moodle or Gemini if you only want to explore the UI.
- Disable push notifications in the app.
- Use a self-hosted deployment with your own Firebase project.

## Contact

Privacy questions: **yarin.tsukrun@gmail.com**

See also [DISCLAIMER.md](./DISCLAIMER.md) and [SECURITY.md](./SECURITY.md).
