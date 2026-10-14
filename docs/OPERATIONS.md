# Deployment and operations

## Reproducible gates

Use pinned Node 24.19.0 (development tools require >=24.12), npm, Java 21 and Chromium. Run:

```sh
npm ci
npm run check
npm run test:emulator
npm audit --omit=dev --audit-level=high
```

`check` runs offline unit/integration and real Chromium browser/PDF checks. `test:emulator` starts only a loopback Firestore emulator under `demo-prepto`, strips live credential bindings from its children, exercises client rules and actual Admin SDK transactions/queries, and shuts the emulator down. Emulator downloads retain the Firebase CLI's size/SHA256 verification. No live project is seeded or contacted. Firebase/Gemini authentication in emulator backend tests is deliberately mocked; Firestore storage/transactions/rules are real emulator behavior.

The emulator does not enforce production composite indexes. `firestore.indexes.json` is schema/query-shape checked and combined queries run against the emulator; actual index build/query readiness must be verified in staging after deployment. A green emulator run alone is not a production-index readiness claim.

## Firestore deployment

`firebase.json` points to repository rules/indexes. `firestore.rules` denies all direct browser database access, including clients with admin claims; client Firebase Auth and authenticated Express APIs continue to work. Every Admin SDK operation bypasses rules, so backend ownership, boolean admin-claim checks, revisions and state transitions remain required. Do not remove them.

Use an authorized operator account and an explicit project after reviewing the existing rules and any other applications sharing the project:

```sh
npx firebase deploy --only firestore:rules,firestore:indexes --project YOUR_AUTHORIZED_PROJECT
```

Deploy indexes first if a release introduces new query shapes; wait until they finish building and test staging queries before shifting traffic. Rules are a complete replacement, so merge/review intentionally when a project has other consumers. Preserve a reviewed previous rules/index manifest for rollback. No production rules/indexes were deployed by this task. Never set a default live project for emulator tests.

## Workflow guidance and reporting

Recommend **Practice interviews** at `/interviews`: bank question snapshots, cross-device Firestore persistence, pause/resume and saved private review. Question bank cards enter this same workflow. Legacy HR/technical guided rounds remain separately labeled on `/mock-interviews`; they use a browser session and are intended for users who specifically want the older guided experience. Submit before leaving. Legacy coding evaluation uses Gemini and never executes submitted code on this host.

Completed new and legacy attempts use `/reports` and `/progress`. Practice completion writes a deterministic report ID atomically, preventing duplicate reports on retries. Score normalization requires known scales. The dashboard always states its latest-200-per-type/category analytics window; older reports remain accessible in Reports. This is a bounded analytics window, not a lifetime total. Before high-volume use, introduce maintained rollups/unified history storage.

## Runtime configuration

Keep Firebase service-account JSON or ADC, Gemini bindings and a >=32-character `SESSION_SECRET` in secure environment settings. Existing bindings must be preserved during updates. No secrets belong in Git, build args, logs or browser scripts. `npm start` activates native fetch proxy support only in the Node application process. If desired, `NODE_USE_ENV_PROXY=1 npm start` is also a process-scoped invocation; do not add that variable globally to the environment.

Use HTTPS, Secure/HttpOnly cookies, a single explicitly trusted TLS proxy when `TRUST_PROXY=true`, and a Firestore TTL policy on `webSessions.expiresAt`. `/health` is process liveness, not Firebase/Gemini readiness. The provided Docker image runs as a non-root user, installs Chromium and supports a build-only CA secret for trusted inspection proxies without disabling TLS checks.

## Live validation (deferred)

Live checks are blocked/deferred for this milestone by user direction. Before running them later, repair/reuse the existing secure Firebase binding and supply the existing Gemini binding. Set the non-secret `LIVE_FIREBASE_PROJECT_ID` safety pin to the authorized project. Run `npm run verify:live` from a trusted terminal; never paste keys into chat.

The runner verifies the credential project before creating `prepto-live-*` test users/data, uses actual Firebase Admin Auth/Firestore and Gemini, checks owner boundaries, then recursively removes test-user records, session snapshots, questions/audit events, private resume versions/matches and temporary Auth users in `finally`. It reports status metadata only. Exit 0 means executed checks and cleanup passed; 2 means blocked prerequisites; 1 means failure. No data is created when prerequisites are blocked. Review a cleanup failure before retrying. Authenticated live browser login/ID-token exchange is a separate staging check; offline browser checks do not establish it.

## Operations and incidents

Watch request status/error-type metrics and latency, provider failures and quota errors, abandoned evaluation leases, Firestore index failures, and storage growth. Pino omits tokens, cookies, prompts, resumes and SDK response bodies. Add edge rate limits and resource limits for public deployments; isolate document parsing/Chromium for hostile uploads. Preserve TLS verification.

Back up Firestore before schema changes; periodically restore a backup into an isolated staging project and test owner-only access. Define retention/deletion policies for resumes, matching records, sessions and reports. On credential compromise rotate the affected binding with an authorized operator and revoke relevant refresh tokens; application code does not silently replace bindings. Environment publication is unrelated to GitHub commit/push and is not a push prerequisite.

## Resume and job matching operations

Use `/resumes` to upload PDF/DOCX or paste text, save immutable versions and select the current version. PDF export regenerates readable text; it does not preserve the original upload layout. Original upload binaries are not retained. A saved version can be matched against a job description; `/resume-matches` retains the exact job text, version reference, model name and feedback. Compare completed records for the same exact job description to assess changes; scores are AI estimates, not hiring guarantees. Matching history is separate from interview scores so it cannot distort progress.

Every resume/version/match endpoint checks the authenticated owner; admin claims never grant private resume access. Failed matches retain a retryable record. Pending evaluations use a 90-second transactional lease; an interrupted request can be retried after expiry with its original request ID and payload. Provider calls happen outside transactions and only the lease holder may save feedback. Apply a retention/deletion policy across `users/{uid}/resumes` (including child versions) and `users/{uid}/resumeMatches`; delete recursively rather than deleting only parent documents. Large text/result fields are excluded from single-field indexing. Deploy the new resume/matching composite indexes and verify all filtered/cursor queries in staging.
