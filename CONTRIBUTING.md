# Contributing

Thanks for your interest in Moodle Task Manager!

## Getting started

1. Fork the repo and clone locally.
2. Follow the [README](./README.md) — `npm install`, copy `.env.example` → `.env`, run `npm run dev:local` with emulators.
3. Create a branch from `main`.

## Pull requests

- Keep changes focused — one feature or fix per PR when possible.
- Run `npm run lint` and `npm run build` before opening.
- Do **not** commit secrets, `.env` files, or generated `public/firebase-sw-config.js` with real values.
- Update README/docs if you change setup, security, or env variables.

## Code style

- Match existing TypeScript / React patterns in `src/`.
- Cloud Functions use CommonJS in `functions/`.
- Prefer small, readable diffs over large refactors unless discussed first.

## Security

See [SECURITY.md](./SECURITY.md). Report vulnerabilities privately — do not file public issues.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](./LICENSE).
