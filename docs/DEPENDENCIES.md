# Dependency advisories

The original baseline had 12 high and 24 moderate findings. The current lockfile removes
the Firebase CLI from the development dependency tree. The application did not use that
CLI at runtime; its only automated use was starting Firestore for the rules/backend tests.

`npm run test:emulator` now starts the **same official Firestore emulator 1.22.0** directly
with Java 21, loopback binding, `demo-prepto`, existing rules and the unchanged real-store
suite. `config/firestore-emulator.json` pins the official Google URL, byte length and SHA-256
published in Firebase CLI 15.33.0's `downloadableEmulatorInfo.json`. Downloads and cached
JARs are verified before execution. Corrupt downloads never become runnable cache entries.
The runner rejects an occupied port, strips live bindings from test children and stops only
its own processes. The emulator is not bundled into the production image.

This removes the unsupported braces → chokidar → firebase-tools chain rather than forcing
a major chokidar override, downgrading the CLI, disabling the advisory, or replacing real
emulator tests with mocks. The obsolete CLI-only FTP override/test has been removed.
The compatible gRPC 1.x override remains because the Firebase client/Admin dependency
tree still needs that fix.

The full audit after this removal has **zero high/critical** findings and **20 moderate**
findings (production: 3 moderate, zero high/critical). The remaining chains are Jest/
js-yaml and Mammoth/argparse/sprintf-js. A compatible `npm audit fix --dry-run` offered no
changes; proposed fixes require major downgrades of Jest or Mammoth. `sprintf-js` 1.1.3
is still the latest release and affected. These findings are documented, not suppressed.
Avoid treating CLI installation for an operator deployment as part of the audited app tree:
review the separately installed official Firebase CLI's own advisories before deployment.

CI audits **both the full and production dependency trees** at the high severity boundary.
For reproduction:

```sh
npm ci
npm audit --audit-level=high
npm audit --omit=dev --audit-level=high
npm run test:emulator
```

To update the emulator, review official Firebase release metadata, replace all pinned
version/size/SHA-256/URL fields together, and rerun integrity, browser and real emulator
tests. Do not disable checksum/TLS verification or accept an arbitrary environment URL.
Deployment commands using the official Firebase CLI remain documented in OPERATIONS.md;
they are separate operator actions and were not executed by this milestone.


## Direct dependency freshness review — 2026-10-21

`npm outdated --json`, `npm ls --depth=0 --json`, `npm ls --all` and `npm audit`
were executed for this milestone. Sixteen direct packages had newer versions;
this is not sixteen vulnerabilities. Audit remained 0 high/critical and 20 moderate.

Examples of major transitions deliberately not bundled into the test-container change:
EJS 3.1.10 → 7.0.2, TypeScript 6.0.3 → 7.0.2, marked 15.0.12 → 18.1.1,
https-proxy-agent 7.0.6 → 9.1.0 and globals 16.5.0 → 17.13.0.
`@types/node` remains on the supported Node 24 line rather than following Node 26.
Minor/patch candidates (including Vitest/coverage together, ESLint, puppeteer-core,
jsdom, JSZip and sanitize-html) can be reviewed in focused Dependabot changes with
browser/PDF/emulator regressions; their presence alone does not justify lockfile churn.

The existing weekly npm/Actions/Docker Dependabot configuration remains the automated
freshness mechanism. No unused package manager or second dependency-update bot was
added. Mammoth, PDFKit and browser tooling have exercised DOCX/PDF/test consumers;
removing those dependencies merely to reduce the transitive count would drop behavior.
