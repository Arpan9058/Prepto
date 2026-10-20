# Prepto

React + TypeScript + Vite interview-preparation workspace with an Express/Firebase backend: interviews, coding, resume versions, matching history, reports and progress. Navy/ivory/teal visual identity; existing URLs and backend authorization preserved.

See [frontend architecture, completed migration checklist, screenshots and validation](docs/FRONTEND_MIGRATION.md).

## Full offline tests with Docker (recommended for contributors)

For the lightweight baseline with Node 24 installed, `npm ci && npm test` needs neither
Java nor Chromium. For the **complete** suite, only Docker Engine/Desktop with Compose
v2 is required on the host:

```sh
docker compose -f docker-compose.test.yml run --build --rm test
```

The separate test image includes pinned Node 24, Java 21, Chromium, dev dependencies
and a size/SHA-256-verified official Firestore emulator. It runs build/typecheck/lint/
format, `npm run test:all` (backend/browser, React and emulator), then real PDF/production
smoke. Build needs public registry/package/emulator access; execution has **no network**,
no published ports, no host source/credential mounts and no live API keys. Containers
are removed on exit. The production image and app Compose service remain separate.
See [container test architecture, isolation and restricted-proxy setup](docs/CONTAINER_TESTS.md).

## Local development

For the default offline tests, Node/npm are sufficient. Full browser/PDF checks additionally need Chromium and emulator checks need Java 21. Use Node **24.12+ in the 24.x line** (`.nvmrc` pins 24.19.0), npm and Chromium. On Debian/Ubuntu, install Chromium with `sudo apt-get update && sudo apt-get install -y chromium`. On other platforms install Chrome/Chromium and set `CHROMIUM_EXECUTABLE_PATH` to its executable.

```sh
npm ci
# Configure existing .env/secure bindings; do not overwrite an existing .env.
# Fill SESSION_SECRET (>=32 random characters), then Firebase credentials and GEMINI_API_KEY.
npm run check
npm start
```

`SESSION_SECRET` has no hardcoded or application fallback. Generate a value with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"` and store it securely in `.env` or the environment's secret settings. Never commit it. Use `FIREBASE_SERVICE_ACCOUNT_JSON` as a JSON string, or ADC via `GOOGLE_APPLICATION_CREDENTIALS`/a workload identity. No credential file is required merely to import `createApp` or serve public pages. Gemini defaults to `gemini-2.5-flash-lite`; override with `GEMINI_MODEL`.

| Command | Purpose |
| --- | --- |
| `npm start` | Start server on port 8080 with native Node environment proxy support |
| `npm run dev` | Same-origin Vite middleware + Express development |
| `npm run build` | Backend/document checks, strict TypeScript check and Vite production build |
| `npm run lint` | ESLint |
| `npm test` | Node-only offline Jest/Supertest tests, PDF/DOCX extraction and enforced backend coverage; no Chromium/Java |
| `npm run test:frontend` | React integration tests with separate source coverage |
| `npm run test:all` | Full backend/browser, React and Firestore emulator suites |
| `npm run check` | Build, frontend and backend/runtime-tooling typechecks, lint, source formatting, backend/browser and React tests |
| `npm audit` | Full dependency advisory report |
| `npm run audit` | Production dependency advisory report |

Default tests need no Chromium/Java; the explicit browser/full suites need Chromium. Tests do not need Firebase, Gemini or a session secret from your environment. Test setup clears injected credentials; tests use explicit offline doubles. The test command enables Node's VM module support for ESM dependencies. Tests verify session ownership, answer hiding, saved-question grading and concurrent duplicate submission rejection. Coverage output is in `coverage/`.

## Application and adapters

```js
const { createApp } = require('./app');
const app = createApp({ env, firebase, gemini, pdf, logger, sessionStore });
```

`createApp` has no listening or Firebase initialization side effects. `server.js` owns startup; `firebase.js` delegates lazily to `adapters/firebase.js`. Inject doubles for offline work (see `tests/doubles.js`). All AI calls share `adapters/gemini.js`, and async route failures use one sanitized error handler and Pino logging. Existing UI routes remain available. Coding tests use AI evaluation; host execution of untrusted code is disabled.

Mock categories are `aptitude`, `reasoning`, `automata`, `englishComprehension`, `personality`. Authenticated sessions save a full server-side question snapshot and owner UID; responses contain only IDs, question text and options. Submission grades the snapshot, not client scores or mutable question data, and atomically writes one progress attempt plus the completion flag. Reports/downloads are retrieved from the authenticated user's stored attempts. Technical interview state/scores and HR question sequencing are server-owned.

To seed multiple-choice questions deliberately, run `node --use-env-proxy upload.js` with Firebase credentials. It uses stable IDs and is repeatable; it is not run during installation. Essay prompts are excluded. Keep answer collections private.

## Cloud and proxy configuration

Each Codex task is already isolated: use the existing `/workspace/Prepto` checkout and do not create a Git worktree unless explicitly requested.

Export `HTTPS_PROXY`, `HTTP_PROXY` and `NO_PROXY` **before** `npm start`; Node's `--use-env-proxy` configures native fetch at process startup, so proxy entries loaded later from `.env` are insufficient. Firebase Auth/credential HTTP requests use an HTTPS proxy agent; Firestore uses `grpc_proxy`, derived from the HTTP(S) proxy unless already supplied. Keep TLS and package integrity verification enabled. Typical live service destinations are `generativelanguage.googleapis.com`, `firestore.googleapis.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com` and `oauth2.googleapis.com`; ADC may need its configured identity/metadata endpoint as well. Allow only the destinations your credentials/workflow require.

`/health` reports process liveness; it does not imply live Firebase/Gemini access. Public-page smoke checks and offline tests work without those service credentials. Live authenticated workflows additionally require valid Firebase bindings, a matching browser project configuration in the login/register pages, populated questions, and Gemini access. Configure these through secure environment settings; never paste secrets into chat or Git.

## Containers and production

Docker installs system Chromium and runs as the `node` user:

```sh
docker compose build
docker compose up -d
```

Behind a TLS-inspecting build proxy, pass its trusted public CA without retaining it in the image: `docker build --secret id=build_ca,src=/path/to/trusted-ca.pem --build-arg https_proxy --build-arg http_proxy -t prepto .` (export the proxy variables first). The optional BuildKit secret configures Node certificate trust for installation; TLS and npm artifact verification remain enabled. Container DNS must also resolve the proxy hostname.

Create a private `.env` first. Compose binds only to localhost for use behind a trusted TLS reverse proxy. Production requires HTTPS for Secure cookies; use local development mode for plain HTTP. Production sessions persist in Firestore `webSessions` (enable TTL on `expiresAt`). Chromium sandbox bypass is explicit in the isolated container configuration. See [SECURITY.md](SECURITY.md) for deployment and key-rotation requirements.

GitHub Actions runs clean `npm ci`, build/lint/offline tests and both full/production audits; Dependabot checks npm, actions and Docker updates weekly. No publication of a Codex environment is needed to commit or push to GitHub.

## Product question bank

Visit `/question-bank` to search by title/skill keyword, filter categories and difficulty, and bookmark practice questions. Verified admins can create, edit and archive content with backend enforcement and conflict detection. See [Product API and setup](docs/API.md) for custom claims, composite indexes, sample data and endpoint contracts. `npm run check` includes real Chromium browser checks; `npm run test:browser` runs them alone. Existing mock tests and resume/interview routes are retained.

## Saved practice interviews

`/interviews` starts owned, persistent practice sessions from bank questions. Pause/resume, sequential answers, validated saved feedback, completion and private answer review survive restarts through Firestore. Completion also adds a report/progress attempt. Bank cards link directly into practice. Existing HR/technical interview experiences remain available. See [API/setup documentation](docs/API.md) for ownership, replay safety, leases and new indexes.

## Progress and study goals

`/progress` combines owned attempt history, skill trend charts, same-type score comparisons, feedback-based next steps and editable personal study goals. Loading, empty and retry/error states support first-time users and service failures. The original chart view remains at `/progress/legacy`. Historical scores without known scales stay visible as raw points. Analytics explicitly discloses its recent-attempt window. See [API/setup docs](docs/API.md) and `fixtures/progress-history.json` for contracts and illustrative data.

## Production-readiness gates

Use `npm run test:emulator` (Java 21) for deny-by-default client rules plus real emulator storage/query/transaction tests. Backend authorization remains mandatory because Firebase Admin bypasses rules. Live validation is deliberately deferred; no live-service success is claimed. See [deployment and operations](docs/OPERATIONS.md) for reviewed rules/index deployment, proxy scope, analytics-window semantics, workflow guidance, staging checks and cleanup-safe live verification. GitHub CI includes emulator checks; publication is not required for pushing Git changes.

## Resume versions

Use `/resumes` for owner-only saved text/PDF/DOCX versions. Preview earlier copies, save improvements without overwriting history, choose a current version, and export a saved version as PDF. The existing resume builder remains available for drafting. [API docs](docs/API.md) describe replay-safe writes, revision checks, upload limits and storage/index setup.

## Saved job matching

On a saved resume version, add a job description for private, replay-safe matching feedback. `/resume-matches` shows pending/failed/completed history, retries and same-job version comparisons. Scores are compatibility estimates; the selected immutable version and original job description remain linked. [API docs](docs/API.md) and [operations](docs/OPERATIONS.md) cover provider bindings, data retention, leases and index deployment. One-off `/analyze` remains available; use saved versions/matching for a tracked application workflow.

### Coding practice

Open `/coding-practice` for searchable problems, JavaScript/Python editing, owner-only saved drafts/submissions and answer review. `/progress` displays a separate AI estimate panel and saved attempt history. Code execution is disabled; AI feedback never establishes passing executable tests. See [API documentation](docs/API.md), [operations](docs/OPERATIONS.md) and [dependency advisories](docs/DEPENDENCIES.md). Live API and staging validation remain pending.

The coding library contains 18 original problems with explicit contracts, topics, difficulty, illustrative examples, edge cases and JavaScript/Python starters. Trusted test oracles check authored scenarios; these content checks never execute user submissions.

See the [coding content review](docs/CODING_LIBRARY.md) for the complete 18-problem catalogue and example/edge-case validation approach.

### Isolated offline product demo

```sh
npm ci
npm run build
NODE_ENV=development HOST=127.0.0.1 PORT=8080 npm run demo
```

Use your local loopback browser on port 8080, path `/demo`. This separate entry point uses synthetic in-memory data and fixed simulated feedback, keeps backend authorization active, never reads live bindings and cannot grant production access. Execution stays disabled. See the [complete walkthrough, architecture, screenshots and validation commands](docs/DEMO.md). Live API and deployment validation remain pending.

## Verification and contributing

See [verification commands, live-validation safety, coverage, mobile checks and LOC definitions](docs/VERIFICATION.md), [contribution guide](CONTRIBUTING.md) and [changelog](CHANGELOG.md). Run `npm run test:production` and `npm run test:docker` for built-app/image smoke checks. Live provider checks are opt-in: `npm run verify:live -- --run`; they remain unrun until existing secure bindings and the authorized project pin are available.

The current hardening removes the unused Firebase CLI dependency: real Firestore tests run the same SHA-256-pinned official emulator directly. `npm run backend:typecheck` covers all backend modules and scripts; frontend integration tests are also strictly checked. [Current remaining-issue evidence](docs/REMAINING_ISSUES.md) distinguishes completed code fixes from external validation.


### Optional production error reporting

`createApp({ reportError: event => monitoring.captureEvent(event) })` accepts a
deployment-owned aggregation/alerting sink. Only sanitized 5xx metadata is sent:
`kind`, HTTP status, allowlisted method and a bounded request ID. Raw exceptions,
provider messages/stacks, URLs, headers, bodies and user identities are excluded.
Expected 4xx responses are not reported; a rejected, throwing or slow sink cannot
change the HTTP response. With no injected sink, no telemetry is sent. Configure
credentials/retention in your deployment adapter; the stock server does not consume
an invented `SENTRY_DSN` or claim hosted monitoring is active. Never embed a DSN or
secret in frontend `VITE_*` config.


`npm run test:docker && npm run test:compose` builds/smokes the production image,
then validates the real `compose.yaml` healthcheck, published loopback HTTP and
authentication boundaries using a temporary generated env file and isolated project.
The Compose check never reads/replaces your `.env` and removes only its own resources.
The file is named `compose.yaml`, a standard filename supported by Docker Compose;
a second `docker-compose.yml` is unnecessary.
