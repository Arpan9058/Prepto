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
