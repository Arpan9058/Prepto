# Verification and hardening

## Reproducible local setup

Use Node 24.19 (`.nvmrc`). Preserve existing `.env`/secure bindings. No Publish step is
required. A credential-free default verification needs only Node/npm:

```sh
npm ci
npm test
npm run test:frontend
```

`npm test` excludes browser/build-artifact/emulator suites. PDF/DOCX extraction still
runs; the real Chromium PDF round-trip lives in `tests/pdfBrowser.test.js` and the
explicit full/browser checks. No checks silently skip missing browser/Java prerequisites.

Install Chromium and Java 21 for all gates, or configure your existing Chrome path:

```sh
npm run check
npm run test:emulator
npm run test:production
npm run test:docker
```

For containers that cannot use the Chromium sandbox, apply
`CHROMIUM_NO_SANDBOX=true` only to the relevant local smoke invocation. A normal host
should retain Chromium's sandbox. Docker already explicitly configures that container
exception and runs under the unprivileged `node` user.

## Production, development and demo

```sh
npm ci
npm run build
npm start
```

Production requires existing Firebase/Gemini/session bindings and HTTPS for secure
cookies. `npm run dev` runs Vite and Express on one origin. Neither command stores
provider/session secrets in the Vite bundle or localStorage. For a synthetic, isolated
workspace (no credentials, no live APIs):

```sh
npm ci
npm run build
npm run demo
```

Open the loopback URL printed by the demo; use its explicitly labelled synthetic
workspace. `npm run demo:dev` offers the same backend with Vite. Production and demo
cookies/data stores remain separate. Untrusted code execution remains disabled.

`test:production` runs a real built application HTTP server, verifies immutable hashed
assets/missing-asset 404, protected deep links, API denial, demo isolation and private
resume PDF download. It uses the real Chromium renderer/extractor, not a stub PDF.
Authenticated journeys use isolated synthetic data; this is not live Firebase validation.
`test:docker` performs the same checks inside the image with network disabled, read-only
root filesystem, dropped capabilities and writable temporary storage. Image build
requires registry/npm/Debian network access. Restricted cloud builders can use existing
build-only bindings without modifying global proxy settings:

```sh
DOCKER_CONFIG=/tmp/prepto-docker-config \
PREPTO_DOCKER_BUILD_NETWORK=host PREPTO_DOCKER_RESOLVE_PROXY=1 npm run test:docker
```

The script forwards existing Docker predefined proxy build arguments by name and mounts
an existing `NODE_EXTRA_CA_CERTS` file as a BuildKit secret. Credentials are never copied
into image layers. Those options are unnecessary on a normal Docker host.

## Opt-in live Firebase/Gemini validation from VS Code

Live checks are **unrun** for this milestone. Do not confuse offline provider doubles
or a successful Docker smoke with provider/deployment validation.

1. Open this repository in a trusted VS Code terminal, select Node 24.19 and run
   `npm ci && npm run build`.
2. Reuse existing private `.env` or terminal/workload-identity bindings:
   `FIREBASE_SERVICE_ACCOUNT_JSON` or ADC, `GEMINI_API_KEY`, and the matching publishable
   `FIREBASE_WEB_CONFIG_JSON` if the configured public project differs. Never paste or
   commit secrets, and never overwrite an existing `.env` blindly.
3. Set non-secret `LIVE_FIREBASE_PROJECT_ID` to the authorized project's exact ID.
   Admin credentials and public web configuration must match that pin. Firebase
   Email/Password authentication must be enabled. Review deployed Firestore indexes
   and provider quota/billing before choosing to run.
4. Unset emulator bindings **in this terminal only**. Run:

```sh
npm run verify:live -- --run
```

This command starts a local server with a temporary in-memory browser-session store,
creates unique `prepto-live-<uuid>` Auth accounts and synthetic records, signs in with
a generated password, exchanges the real ID token for HttpOnly cookies, and exercises
interview start/pause/resume, real Gemini feedback, saved report, progress, private resume
versions, real PDF export/extraction/re-upload and Gemini matching. It confirms cross-user
service denial. Logs contain check status/run ID only, never passwords, ID tokens or
provider response bodies. Gemini calls may incur cost.

Cleanup is registered only for users/documents/events created by that run, attempts all
registered actions even after one fails, and runs on normal success/error. Unexpected
process termination/power loss can interrupt cleanup: inspect the reported run ID and
remove **only** its isolated users/records. No project-wide cleanup is performed. The
validator does not test deployed HTTPS, real reset-email delivery, microphone quality,
all composite-index combinations, or production session-store TTL/permissions.

Without `--run`, the command exits 2 with an `unrun` prerequisite report and performs no
provider operations. Missing bindings, emulator configuration or project mismatch also
prevent writes. Keep live execution outside offline CI.

## Coverage and accessibility interpretation

Backend coverage lives in `coverage/coverage-summary.json`; React component source
coverage lives in `coverage/react/coverage-summary.json`. React includes every executable
TS/TSX module (including unvisited legacy/bootstrap modules), excludes only type-only
`domain.ts`, and does not inherit browser-test coverage. Report both figures separately.
Backend global floors are 85% statements/lines/functions and 80% branches. React floors
reflect the measured initial integration baseline, with stronger API/shared-form gates;
legacy/bootstrap gaps remain visible and are not excluded to inflate the percentage.

Chromium browser tests cover development/production routing and mobile content at 360px:
public/auth, dashboard, learner/admin question bank, interview session/review, resumes,
matching, coding editor, progress/goals and reports. Axe scans WCAG A/AA tags, plus browser
assertions check keyboard focus/Escape, reduced motion, labels, overflow, errors and
loading/empty states. Synthetic populated demo screens supplement empty-state scans.
These automated scans and screenshot inspections are **not a full accessibility audit**.
Real screen-reader, touch/zoom, Safari/Firefox and a human assistive-technology review
remain pending.

## Repository assessment and LOC

The external assessment reported 4,871 “Source LOC”; its exact exclusions/tokenization
were not supplied. Our starting **12,894** count was tracked JS/TS/TSX/CSS/EJS physical
lines, including blank lines, comments, tests and compatibility templates. These metrics
are not comparable. `node scripts/loc.js` prints repeatable physical/nonblank counts by
category; neither is represented as the buyer's proprietary Source LOC score.

The assessment's “no test suite” and “no health endpoint” flags conflict with the
repository's runnable suites and tested `GET /health`. CI now calls install, build,
typecheck, lint and test commands explicitly in named steps and includes a Node-only
job and Docker smoke. A scanner's recognition or a payout/score increase is not guaranteed.
No fabricated history, contributors, tags, code padding or score-oriented test duplication
is used. Sustained genuine maintenance cannot be created retroactively.

Backend request boundaries reject non-object JSON/form payloads; typed shared schemas
cover mock sessions, legacy coding submission/start, interview creation/transitions and
study goals. Existing service validation, ownership/admin checks, upload limits and
report query allowlists remain enforced. Strict backend JSDoc checking currently covers
validation/error boundaries only; the backend has not been fully migrated to TypeScript.
Formatting enforcement is scoped to the new shared/tooling/test files, avoiding unrelated
repository-wide churn.

## Recorded milestone results

On Node 24.19, the completed local verification recorded:

| Check | Result |
| --- | --- |
| Clean `npm ci` | Passed |
| Default Node-only `npm test` with an intentionally invalid Chromium path | 152 passed, zero skipped |
| Full Jest/Supertest/Chromium regression suites | 205 passed across 19 suites, zero skipped |
| Separate React component/integration suite | 21 passed, zero skipped |
| Firestore rules/backend emulator suite | 11 passed, zero skipped |
| Build, frontend typecheck, scoped backend typecheck, lint, scoped formatting | Passed |
| Built-app HTTP/static/auth/deep-link/private-PDF smoke | Passed |
| Built Docker default `npm start` plus isolated real PDF smoke | Passed |
| Live Firebase/Gemini | Unrun: existing Gemini binding and authorized project pin unavailable |

Backend source coverage: 92.66% lines/statements, 91.11% branches, 95.05% functions.
Separate React source coverage: 43.93% lines, 40.82% statements, 40.61% branches,
43.90% functions. Browser coverage is not merged into those React percentages.

Production npm audit: 3 moderate, zero high/critical. Full development audit: 3 high
(`braces` → `chokidar` → `firebase-tools` chain), 24 moderate, zero critical. These
existing findings were not suppressed or subjected to `audit --force`. Exact dependency
versions are locked; repeat the audit as advisory databases change.

Earlier attempts hit build-network DNS/proxy resolution and disk exhaustion; the build
used existing build-only proxy/CA bindings, unused build cache was reclaimed, and the
final built image was run successfully afterward. Those failures are not counted as
passes. Existing unrelated Docker images/source files/secrets were not deleted as a cleanup strategy.

The smoke intentionally uses isolated synthetic in-memory data for authenticated flows;
its MemoryStore warning does not establish production Firestore session-store readiness.
Production session persistence/TTL, HTTPS/reverse-proxy behavior and deployed rules/index
readiness remain deployment checks. Human assistive-technology and cross-browser audits
remain pending. CI status and exact remote commit links are reported separately after push.

Screenshots captured from actual Chromium-rendered code (signed-in data is synthetic):
[mobile dashboard](design/mobile-populated-dashboard.png),
[mobile login](design/mobile-login-alice.png),
[mobile progress](design/mobile-populated-progress.png),
[admin question bank](design/mobile-question-bank-admin.png).
