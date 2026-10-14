# Product APIs

All endpoints require a verified Firebase ID token (Bearer header or HttpOnly `session_token` cookie). The backend derives UID and roles from the verified token. It ignores client UID/role assignments. Errors are JSON `{error}` with meaningful 400/401/403/404/409 status codes. Dates are ISO 8601. Cookie-based browser mutations require same-origin requests.

## Question bank

- `GET /question-bank`: learner page; admin controls appear only for tokens with boolean `admin: true`.
- `GET /api/questions?q=node&category=technical&difficulty=easy&pageSize=12&after=ID`: active question cards and `nextCursor`. `pageSize` is 1-50; omit `after` on first page. Search is a **single case-insensitive keyword prefix in title/skills**, 2-40 characters, not general full-text search. Category/difficulty can be combined. Admins may request `archived=true`. Students cannot read archived questions, correct answers or model explanations.
- `GET /api/questions/:id`: public card, or complete record for verified admins.
- `PUT /api/questions/:id/bookmark` / `DELETE .../bookmark`: idempotent, affects only authenticated user's bookmarks.
- `GET /api/bookmarks?pageSize=12&after=ID`: owned saved cards with cursor pagination; archived/deleted questions are omitted. If a page contains only archived entries, follow `nextCursor` to continue. Bookmark mode is separate from bank search/filters.
- `POST /api/admin/questions`: create; `PUT /api/admin/questions/:id`: full content edit with current `revision`.
- `POST /api/admin/questions/:id/archive` body `{revision}`: archive with optimistic concurrency. Historical interview snapshots are retained.

Create/edit body: `title` (<=140), `prompt` (<=4000), `category`, `difficulty` (`easy|medium|hard`), `type` (`openEnded|multipleChoice`), `skills` (1-5 strings <=60), `explanation` (<=4000). Multiple-choice questions additionally need 2-6 distinct `options` and `answer` equal to one option. For edits send the latest integer `revision`; stale edits receive 409. Backend validates fields, records editor UID and increments revision. `questionEvents` stores audit metadata, not credential or prompt dumps.

Categories: `technical`, `behavioral`, `systemDesign`, `aptitude`, `reasoning`, `automata`, `englishComprehension`, `personality`.

## Setup

Deploy the composite indexes in `firestore.indexes.json` to the configured Firestore project before using combined search/filter queries. Use your existing authorized Firebase deployment workflow; do not automatically deploy to an unknown project. New collections (`questionBank`, `questionEvents`, `users/{uid}/bookmarks`) are backend-only. Client Firestore rules must deny direct access; the Admin SDK bypasses rules and the Express backend enforces permissions.

Grant `admin: true` only using a trusted operator's Firebase Admin custom-claim workflow; never let users edit their own role. Refresh the ID token after a claim change. Do not expose service-account credentials in browser code.

`npm run seed:bank` deliberately installs 13 illustrative questions from `fixtures/question-bank.json` into `questionBank` using ADC/service-account environment credentials. It is idempotent and skips existing IDs so edits are preserved. It does not change the legacy mock-test question collection. Tests seed doubles; setup never seeds a live project automatically.

`npm run check` runs build, lint, unit/integration regression tests and Chromium browser checks without live Firebase/Gemini credentials. Use Node 24.9+ and Chromium as described in README. The browser suite exercises real rendered pages and APIs against injected doubles, not production services.
