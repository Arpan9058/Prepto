# Remaining assessment issues: evidence and limits

This follow-up addresses the supplied external assessment using runnable checks. Its
quality score and proprietary “Source LOC” are not measurements produced by our test
runners, and no increase or offer is promised.

| Assessment concern | Implemented evidence |
| --- | --- |
| No runnable test suite detected | Explicit Node-only/default, full backend/browser, React and emulator commands in package.json/CI; fresh-install gates remain mandatory |
| Missing coverage thresholds | Enforced backend global floors; React floors now 80% statements/functions/lines and 70% branches, plus API/shared-form gates |
| Weak React coverage | Real integration cases for SDK initialization retries, password-reset privacy, login exchange, bootstrap failures, saved session review/completion, admin conflicts, legacy grading/timer/dictation, matching retries and resume revision conflicts |
| Three high dev advisories | Unused Firebase CLI removed; the same official Firestore 1.22.0 JAR is SHA-256/size-verified and real emulator tests preserved |
| Default tests require Chromium/Java | Node-only `npm test` remains independent; full browser/emulator checks stay explicit and enforced in CI |
| Inconsistent input validation | Shared request schemas, parsed-object boundary, service/domain validation and existing owner/admin guards retained |
| Backend typecheck only scoped | All runtime backend modules **and scripts** checked through tsconfig.backend.all.json with Express/session/adapter contracts; strict boundary project retained separately |
| Formatting only scoped | Prettier checks all backend/client source, runtime scripts and declarations; EJS/PDF templates preserved and compiled |
| Missing maintenance docs | CONTRIBUTING, CHANGELOG, architecture, operations, demo and validation commands maintained |
| CI deprecation warnings | Verified supported Node 24 action majors; runner pinned to Ubuntu 24.04 for reproducibility |
| Health endpoint not detected | Existing `GET /health` remains covered by backend, production and Docker checks |
| Thin history | Genuine tested work only; no fabricated authors, dates, releases or commits |

## Reproduction

```sh
npm ci
npm test
npm run check
npm run test:emulator
npm run test:production
npm run test:docker
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
```

Use installed Chromium/Java 21 and existing documented browser/proxy bindings. Restricted
cloud Docker build options are in VERIFICATION.md; they apply only to the build command.
No secrets, global proxy settings, environment Publish or live deployment are required.

The full audit has **0 high/critical and 20 moderate** findings; production has 3 moderate.
Compatible audit remediation offers no changes. Remaining Jest/js-yaml and Mammoth/
argparse/sprintf-js chains need supported upstream patches; major downgrades are not
applied blindly. See DEPENDENCIES.md for provenance and update procedures.

The backend check uses gradual checked-JavaScript inference across the complete surface;
it does not turn every existing dynamic JSON/database value into a fully strict domain
model. Strict shared boundaries and strict frontend/source-test checking are retained.
No `@ts-nocheck` or blanket diagnostics suppression is used.

## External checks still not represented as complete

- Live Firebase/Gemini, real email/reset delivery and staging/deployment are unrun under
  the user's existing deferral. Existing bindings are not deleted or replaced. The safe
  opt-in terminal command remains `npm run verify:live -- --run` after project pin/setup.
- Automated Chromium/axe checks and screenshot inspection are not a human accessibility
  audit. Screen-reader/assistive-technology and Safari/Firefox validation remain pending.
- Real sustained maintenance/team history cannot be manufactured in one task.
- Docker/browser/emulator results do not prove deployed TLS, Firestore index readiness,
  production TTL/permissions or live session persistence.

Untrusted code execution remains disabled. Demo data remains isolated/synthetic. The
application's EJS compatibility and PDF document templates remain intact.

Source files were formatted for readability as requested. Physical/nonblank LOC will
change substantially from formatting alone; neither metric should be presented as new
product functionality or as the platform's proprietary 4,871 Source LOC figure.

## Recorded local follow-up results

Node 24.19 clean `npm ci`, build, frontend source/test typecheck, all-backend/script
checked-JavaScript gates, lint and source formatting passed.

- Full backend/API/browser regression suite: **208 cases in 19 suites**, zero skipped.
- Separate React integration suite: **51 cases in two suites**, zero skipped.
- Real Firestore emulator suite: **11 cases**, zero skipped, same emulator engine/version.
- Built production HTTP/static/deep-link/auth/private-PDF smoke: passed.
- Docker default `npm start` and isolated PDF/HTTP smoke: passed with read-only root,
  network disabled, dropped capabilities, init and 256 MB shared memory.

React coverage: **82.59% statements, 75.23% branches, 86.47% functions, 85.79% lines**.
Backend coverage: **95.69% lines/statements, 91.07% branches, 94.53% functions**.
Backend line coverage changes partly reflect formatting/V8 source mapping; branch/function
figures are supplied so that more physical lines are not mistaken for more tested behavior.
Browser coverage is not merged into React component-source coverage. All executable
frontend modules remain included, including the small unvisited bootstrap entry.

The default Node-only suite is a subset of the backend total, not an additional collection
of cases. These figures represent **270 distinct cases** across the three test runners.
Latest remote commit and GitHub CI links are reported after push, separately from local
results. Earlier historical figures in VERIFICATION.md are labelled by their commit.

The default **155-case** subset also passed with deliberately nonexistent Chromium and
Java paths. Java is needed only for the explicit emulator command; Chromium is needed
only for explicit browser/PDF checks. Local verification reused existing trusted proxy/CA
bindings only at application/build startup and did not modify global settings or secrets.

The tracked physical-line counter changed from **13,795 to 22,126**, largely because
Prettier expanded existing minified source into readable formatting. This increase is
not a measure of new product behavior. Use `node scripts/loc.js` for the defined local
metric; the buyer's proprietary Source LOC still requires its own fresh scan.
