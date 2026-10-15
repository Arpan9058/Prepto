# Contributing to Prepto

Use Node 24.19 (see `.nvmrc`) and `npm ci`. Keep your existing local bindings private;
never commit `.env`, service accounts, API tokens or generated credentials.

## Development and verification

- `npm test`: offline backend tests and enforced coverage, no browser or Java required.
- `npm run test:frontend`: React component/integration tests and separate source coverage.
- `npm run check`: build, lint, scoped strict backend typecheck, formatting and backend/browser/React tests.
- `npm run test:emulator`: real Firestore emulator tests; Java 21 required.
- `npm run test:production`: built frontend, HTTP guards and real Chromium PDF smoke.
- `npm run test:docker`: builds the image and runs an isolated smoke with networking disabled.

Chromium is required for the browser/full checks; setup and exact commands are in
[README](README.md), [operations](docs/OPERATIONS.md) and [verification](docs/VERIFICATION.md).
Live provider checks are opt-in and never part of offline CI.

Use `fix/<description>` or `feat/<description>` branches. Submit focused changes with a
regression test demonstrating the behavior. Prefer descriptive scoped commit messages,
such as `fix(interviews): preserve answers after a version conflict`. Preserve EJS
compatibility/PDF templates until replacements have proven parity. Never enable an
untrusted code executor as part of a UI feature.

The backend typecheck currently covers shared validation/error boundaries; extending
it module by module is preferable to disabling diagnostics across the existing backend.
Formatting is enforced on this milestone's new test/tooling and shared boundaries;
repository-wide formatting is deliberately a separate reviewable change.

Maintain genuine authorship and history. Do not pad LOC, generate artificial commits,
backdate releases or attribute work to fictitious contributors.
