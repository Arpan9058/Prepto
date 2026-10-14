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

## Persistent interviews

`/interviews` lists owned sessions and lets learners choose 1-10 bank questions. `/interviews/:id` continues a saved session across page reloads, application restarts and devices using Firestore `interviewSessions`, not Express session state. Existing HR/technical routes are retained; persistence applies to this new workflow.

- `POST /api/interviews` body `{title?, questionIds}` starts an owned `active` session with immutable question/rubric snapshots. Archived questions cannot be selected.
- `GET /api/interviews?status=active|paused|completed&pageSize=12&after=ID` lists only authenticated user's session summaries.
- `GET /api/interviews/:id` returns owned session state, public question cards and previously saved feedback; answer keys/model explanations stay hidden until completion.
- `POST /api/interviews/:id/pause` / `.../resume` body `{version}` transitions active/paused. Use the latest server version; stale changes return 409. Repeating an already-applied transition is idempotent.
- `POST /api/interviews/:id/answers` body `{questionId, text, requestId, version}` saves the current question's answer in sequence. Supply a new UUID `requestId` per answer. Replaying the exact saved request returns saved feedback; changed/repeated answers are rejected. Multiple choice is graded against saved keys. Open-ended answers use the shared Gemini adapter and saved rubric, with validated 0-100 scores, plain-text feedback and an actionable next step.
- `POST /api/interviews/:id/complete` body `{version}` requires every answer saved and atomically writes completed state plus one `InterviewPractice` progress/report attempt. Repeated completion does not duplicate attempts.
- `GET /api/interviews/:id/review` is available only after completion and only to the owner; returns saved answers/feedback and model explanations.

Every single-session endpoint checks ownership, even for administrators; another user's ID returns 404. Do not grant browser clients direct Firestore access to `interviewSessions`. Deploy the added owner/status composite indexes from `firestore.indexes.json`.

AI evaluation runs outside Firestore transaction retries, under a 90-second lease. Concurrent submissions receive 409; failed provider calls release the lease, and crashed evaluations expire. Pause/completion cannot race an active evaluation. Refresh before retrying a failed network request; already-saved answers remain visible. Feedback is educational guidance, not a validated hiring assessment.

Sample sessions in tests use `fixtures/question-bank.json`; no personal histories are seeded into production. The legacy sample/mock questions remain separate. Live open-ended evaluation needs Gemini access; multiple-choice grading does not.

`fixtures/interview-start.json` is a credential-free example start payload for the HTTP multiple-choice practice session. It can be used with the start endpoint after question-bank seeding. Tests also use it as their default session selection.

## Progress and study goals

`/progress` is the enhanced dashboard. `/progress/legacy` preserves the original chart dashboard; `/reports` still exposes all stored reports. New completion records include an explicit score scale and skill results without rewriting old attempts.

- `GET /api/progress/overview`: owned summary, skill trends with sample counts, latest-vs-previous comparisons by attempt type, feedback-based recommendations and persisted personal goals.
- `GET /api/progress/attempts?type=InterviewPractice&pageSize=10&after=CURSOR`: owned history with normalized score where the original scale is known, raw points otherwise, review links and cursor pagination. Invalid or foreign cursors return 400. Never supply UID in a request to select another user's records.
- `PUT /api/progress/goals` body `{skill, targetScore, weeklySessions, revision?}`: create/update one personal goal per case-insensitive skill. Skill <=60 characters; target score is integer 1-100; weekly sessions integer 1-14. Existing goals require current revision; stale changes return 409. Goal progress combines latest skill score and completed skill-bearing sessions in the rolling past seven days.
- `DELETE /api/progress/goals/:id` body `{revision}`: delete only the authenticated user's owned goal, with concurrency checks.

Store `users/{uid}/studyGoals` behind backend-only Firestore rules. No additional composite index is needed for goals. Updates never accept an owner UID from the client. Admin roles do not bypass private progress/session ownership.

Analytics uses at most the latest 200 attempts per source (type/mock category) to bound Firestore reads. Responses disclose `window.perSource` and `window.truncated`; the dashboard links to original reports for older records. Before large-scale use, replace cross-source reads with maintained rollups and a unified history index. Cursor pagination reflects the current bounded window; concurrent new attempts may shift that window.

Only scores with known denominators are normalized. Historic coding attempts missing a scale remain raw points and are excluded from score comparisons rather than assuming a denominator. Skill trends require explicit skill results or persistent-practice answers. Latest-vs-previous comparisons stay within each attempt type. Feedback scores are educational indicators and can vary with question difficulty; no ranking against other users is presented.

`fixtures/progress-history.json` provides three fictitious relative-date examples for tests and UI checks. No demo histories/goals are written into a live user's account during setup. Empty, loading and recoverable error states are built into the dashboard, and rendered user/model strings use DOM text nodes.
