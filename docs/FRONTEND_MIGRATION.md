# Prepto React architecture and migration

Prepto now serves React + TypeScript + Vite at the original product URLs. The approved identity uses navy/charcoal, warm ivory, teal, editorial type, consistent SVG icons and restrained motion. No analytics, testimonials, partnerships or product outcomes are invented. The dashboard reads real authenticated APIs; screenshots use clearly labeled synthetic records.

## Start and validation

Node 24.19.0 is pinned; Java 21 is needed for emulator checks and Chromium for browser/PDF checks.

```sh
npm ci
npm run build
npm start
# Same-origin Vite + Express with the existing secure runtime bindings:
npm run dev
npm run frontend:typecheck
npm run lint
npm run check
npm run test:react
npm run test:emulator
npm audit --omit=dev --audit-level=high
```

Build includes backend syntax/EJS checks, strict frontend typecheck and Vite production compilation. `check` also runs lint and all Jest regression/browser suites. `test:react` is the focused real-Chromium React integration suite (already part of check). Use existing `.env`/secure bindings; never overwrite an existing .env when following setup. SESSION_SECRET, Firebase Admin/ADC and Gemini configuration remain server-only. No Publish action, global proxy change or unrelated service is needed.

Production Express serves hashed Vite assets with immutable caching and no-store HTML/API responses. `npm start` fails explicitly when the frontend has not been built. Development mounts Vite middleware on the same HTTP server; the same authentication and CSRF middleware guards pages/APIs, with no separate-origin cookie proxy or CORS exemption. Existing URLs and query parameters are retained. Docker builds the frontend in a separate stage; the runtime receives compiled assets and production dependencies. Docker execution remains unverified here.

## Completed screen checklist

- [x] Landing and responsive desktop/mobile navigation
- [x] Login, registration and password reset
- [x] Profile/onboarding and dashboard
- [x] Question bank, bookmarks, filters, cursor pagination and admin create/edit/archive
- [x] Persistent interview start, pause/resume, saved answer feedback, completion and private review
- [x] Resume upload/text creation, immutable versions, current-version selection and PDF download
- [x] Job matching history, saved job text, comparison and failed/expired evaluation retry
- [x] Coding library/filters, private drafts/submissions, retryable AI-only answer review
- [x] Progress history, skill trends/comparison, separate coding AI estimates and study goals
- [x] Reports, sanitized report content and private JSON downloads
- [x] Existing isolated offline demo, its guide and distinct cookie/session isolation
- [x] Guided HR/technical rounds, opt-in voice transcription and typing fallback
- [x] Legacy timed coding round, category mock tests, resume builder/PDF, one-off ATS, resume questions and career guidance

`/progress/legacy` deliberately redirects to the current progress screen; historical records remain available in Reports. Other old entry points keep their URLs and business handlers. Legacy coding retains its 15-minute per-question countdown/automatic submit; the server independently enforces the 45-minute total limit and repeat-answer checks. A total-limit expiry can reject a late answer; timers never bypass server limits. Guided rounds remain browser-session workflows; persistent Interviews are still the recommended cross-device workflow. Legacy coding scores are historical AI evaluations, never evidence of execution.

EJS **source files remain** for the explicitly selected `frontend:false` compatibility regression harness and existing HTML-negotiated clients. They are not the default product frontend. The escaped server-side resume/PDF document template also remains EJS; moving frontend rendering does not require replacing a document generator. JSON negotiation reuses the same guarded legacy handlers, not a second grading/ownership implementation. Never remove EJS sources before deciding how to retire those compatibility/document paths.

## Authentication and trust boundaries

The browser Firebase SDK uses **in-memory persistence**, never localStorage token persistence. Login and registration exchange an ID token through the existing Bearer-authenticated `/api/set-token`, which regenerates the server session and sets an HttpOnly cookie. Registration now reliably exchanges the cookie before profile/onboarding. Firebase Admin still checks token revocation on each new request. Cookies stay Secure in production and SameSite-configured; cookie mutations retain the original origin/Sec-Fetch-Site checks. Tokens expire on the existing one-hour cookie lifetime; no new persistent browser refresh-token mechanism is introduced.

`/api/runtime` exposes only the existing **publishable Firebase web app configuration**, not service-account, Gemini, ADC or session bindings. `config/firebase-web.json` carries the same already-public project settings previously duplicated in EJS, not an Admin credential. Operators may provide `FIREBASE_WEB_CONFIG_JSON` containing only apiKey/authDomain/projectId/storageBucket/messagingSenderId/appId; unexpected fields fail closed. Vite reads no environment prefixes or .env files. Browser bundles contain neither server bindings nor a hardcoded Firebase project key. Real Firebase/Gemini login/feedback validation remains pending.

`/api/session` returns only uid, boolean admin and demo status. `/api/profile` is owner-scoped and ignores claimed owner/admin fields. React report JSON endpoints read only the authenticated user's existing attempt collections and sanitize HTML before rendering. Admin controls are hidden from learners but permission checks remain on the backend. Firebase Admin bypasses Firestore rules, so frontend migration never replaces those backend checks. The app never executes submitted code; AI guidance and illustrative examples remain explicitly distinct from executable results.

Optional browser speech recognition is opt-in, preserves a typing fallback, stops on submission/unmount and may use the browser vendor's service. The migration does not add an audio-upload service. Actual microphone permissions/recognition quality have not been live-tested; browser tests use a deterministic recognition double.

## Existing offline demo

No new demo-only replacement for the product was built. The existing isolated demo now hosts the same React screens and APIs:

```sh
npm run build
NODE_ENV=development HOST=127.0.0.1 PORT=8090 npm run demo
# Or same-origin hot development using synthetic data, with no .env loading:
NODE_ENV=development PORT=8090 npm run demo:dev
```

The demo remains loopback-only, refuses production mode, uses volatile per-owner memory storage, distinct cookies, non-admin opaque demo tokens and fixed labeled feedback. It neither accepts nor overwrites real product cookies, and its tokens cannot authenticate production. Live login/token-exchange/profile routes stay restricted as previously documented; no production environment flag enables demo authentication. See DEMO.md for reset/lifetime/cleanup behavior.

## Screenshots and evidence

Actual browser screenshots are in [docs/design](design): [landing](design/react-landing.png), [dashboard](design/react-dashboard.png), [mobile navigation](design/react-mobile-navigation.png), [coding](design/react-coding.png), [resumes](design/react-resumes.png), [progress](design/react-progress.png). Signed-in captures use synthetic data and display that label.

```sh
npm run frontend:screenshots
# Only in an isolated container lacking a supported Chromium sandbox:
CHROMIUM_NO_SANDBOX=true npm run frontend:screenshots
```

Existing regression and emulator tests remain intact through the compatibility harness. New React journeys cover actual production builds and same-origin Vite development; auth/private-page guards; loading/empty/error/retry states; mobile/keyboard/reduced-motion behavior; admin create/edit/archive; interview lifecycle; real PDF upload extraction and download transport; same-job matching; coding drafts/reviews; progress/goals/reports; isolated demo; legacy rounds, mock grading and resume building. Browser SDK sign-in is exercised with intercepted synthetic provider responses, not a live Firebase login. Dictation is tested with a browser API double. Existing PDF tests additionally run real Chromium export and real PDF/DOCX extraction.

Backend Jest coverage is reported separately from React source coverage. These browser integration tests establish UI behavior; no frontend source-coverage percentage is fabricated.

## Pending and limitations

- Live Firebase Auth/refresh/reset and Gemini quality: **pending**; successful offline provider doubles are not live evidence.
- Production deployment, HTTPS/real proxy behavior, Firestore rules/index build readiness: **pending**.
- Docker image execution, load/backup/restore drills, cross-browser testing beyond Chromium and a full assistive-technology audit: **not verified**.
- Executable code runner integration: **not implemented; execution remains disabled**.
- Old EJS compatibility views/PDF template remain intentionally; default product screens are React.
- Existing upstream dependency advisories remain documented in DEPENDENCIES.md; migration makes no blind audit-force downgrade.

## Recorded final validation

Clean `npm ci`, frontend typecheck/production build, ESLint and full check passed. Final suite: **175 Jest regression/integration/browser tests**, **11 real Firestore emulator tests**, zero skipped. Backend coverage: **92.40% lines/statements, 94.97% functions, 91.24% branches**. React source coverage is not measured; real browser journeys are reported as integration checks. Production dependency audit: **3 moderate, 0 high/critical**; full audit including tooling: **3 high, 24 moderate, 0 critical**, the existing documented upstream tooling chain. No blind force fix was applied. Live API, real microphone, Docker execution and deployment checks remain pending as listed above.
