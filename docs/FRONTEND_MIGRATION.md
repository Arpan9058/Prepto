# React workspace migration

Approved identity: deep navy/charcoal, warm ivory, restrained teal, editorial headings and accessible shared components. No invented testimonials, partnerships or analytics. The core slice replaces landing, login/register/reset, onboarding, dashboard, question bank/bookmarks/admin editing, persistent interviews/review, resume versions/matching, coding, progress/goals, reports and the isolated demo guide. Existing EJS sources remain in the explicit compatibility harness. Legacy guided rounds and one-off resume/career tools are the next migration slice; their working URLs remain linked meanwhile.

## Commands

```sh
npm ci
npm run build
npm start
# Same-origin Vite middleware and Express, default loopback port 8080:
npm run dev
# Isolated synthetic data, same React build:
NODE_ENV=development HOST=127.0.0.1 PORT=8090 npm run demo
# Same synthetic isolation with Vite middleware:
NODE_ENV=development PORT=8090 npm run demo:dev
npm run frontend:typecheck
npm run check
npm run test:emulator
```

Normal start/dev requires existing secure SESSION_SECRET and Firebase/Gemini bindings for the relevant APIs. Demo development does not load .env. Vite imports no environment prefixes or .env files; no secrets are in VITE variables. `/api/runtime` serves only existing publishable Firebase browser configuration (or an explicitly allowlisted FIREBASE_WEB_CONFIG_JSON), never Admin/Gemini/session credentials. Existing frontend Firebase config was public already; it is now served at runtime rather than duplicated in bundles. Real authentication remains pending live validation.

Built assets are served by Express. The same server guards private page routes and APIs in production and development; Vite runs as middleware, so there is no cross-origin auth proxy or CORS exception. JavaScript only receives JSON and uses same-origin HttpOnly cookies; backend token revocation, owner/admin checks and CSRF protections remain active. Production requires a built frontend and fails explicitly if it is missing. Docker uses a frontend build stage; the runtime installs production dependencies and receives compiled assets. Docker execution is not established by a successful local build.

The factory's explicit `frontend:false` keeps the existing EJS regression harness available. It is not a URL/environment auth switch. New browser tests exercise real React production builds, error recovery, keyboard/mobile navigation, API owner boundaries and private-page guards. Existing tests are retained for compatibility, not deleted or replaced by screenshots. React source coverage is not inferred from backend Jest coverage; browser journeys establish actual UI integration.

Live Firebase/Gemini, production deployment/index readiness and a full assistive technology audit remain pending. Untrusted execution stays disabled.

Core slice validation: 165 Jest regression/browser tests and 10 real Firestore emulator tests passed. Browser journeys cover React interviews, private resumes/PDF links, coding drafts/reviews, progress/goals, reports, demo isolation, mobile keyboard navigation, registration validation and actual same-origin Vite development versus production assets. Firebase/Gemini are mocked; browser PDF transport uses an injected buffer while existing PDF tests still exercise real Chromium export and real extraction.

React screenshots are actual browser captures under `docs/design/react-*.png`; signed-in screenshots are explicitly synthetic. Regenerate with `CHROMIUM_NO_SANDBOX=true npm run frontend:screenshots` only in an isolated container without a supported Chromium sandbox. Screenshots are documentation, not test evidence.
