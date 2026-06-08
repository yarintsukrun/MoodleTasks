# Disclaimer

## Moodle trademark

**Moodle Task Manager** is an independent open-source project. It is **not** affiliated
with, endorsed by, or sponsored by Moodle Pty Ltd or any official Moodle partner.

The name **Moodle** is a registered trademark of Moodle Pty Ltd. We use it only to
describe compatibility with Moodle calendar export feeds (`.ics` URLs). This project
does not distribute Moodle software, Moodle branding, or access to Moodle servers
beyond what you configure with your own calendar export link.

If you deploy your own instance, use your own app name and icon if your university or
Moodle site policy requires it.

## Third-party services

This app integrates with services you configure yourself:

- **Google** — Sign-in (Firebase Authentication) and optional Gemini AI (your API key)
- **Firebase** — Hosting, database, Cloud Functions, and push notifications (your project)
- **Your Moodle site** — Calendar export URL (contains a private token; treat it as a secret)

Each service is governed by its own terms and privacy policy.

## No warranty

See the [LICENSE](./LICENSE). This software is provided **as is**, without warranty.
You are responsible for compliance with your institution's policies, applicable law,
and the terms of every third-party service you connect.

## Demo deployment

The public demo at [moodletasks.web.app](https://moodletasks.web.app) is maintained by
the project author for convenience. It is not an official Moodle or university service.
Do not paste production credentials into any deployment you do not trust.
