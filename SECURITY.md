# Security

Report vulnerabilities privately through GitHub's security advisory reporting for this repository. Do not put keys, tokens, resume contents or service account JSON in public issues.

The previously tracked `private_key.pem`, certificate and CSR have been removed from the current tree. Historical commits still contain the old private key: consider it compromised, revoke/rotate any certificate or deployment credential that used it. No history rewrite is performed. Removing a file does not revoke the key.

Use a unique random `SESSION_SECRET` of at least 32 characters. Firebase Admin initializes only when needed, from `FIREBASE_SERVICE_ACCOUNT_JSON` or ADC. Give its service account the minimum necessary Firestore and Firebase Auth permissions. End users must not have direct access to `sessions`, `webSessions`, question answer keys or another user's progress. Configure Firestore rules independently; Admin SDK bypasses rules. Never expose a service account to browser code. The browser Firebase web configuration is public project metadata, not an Admin private key.

Deploy behind HTTPS. Production cookies are Secure, HttpOnly and SameSite=Lax. Set `TRUST_PROXY=true` only behind exactly one trusted proxy and prevent direct public access to the app port. Cookie-authenticated mutation requests with cross-site Fetch Metadata or foreign Origin are rejected. Bearer clients must protect their tokens. Logout clears local cookies; it does not globally revoke a Firebase identity.

Production sessions use Firestore `webSessions`; enable a TTL policy on `expiresAt` to clean up expired records. Development uses a process-local session store. Avoid logging prompts, resumes, authorization headers, cookies or provider error bodies. PDF/DOCX uploads are limited to 5 MiB; JSON/forms to 256 KiB. Files are parsed in memory and no submitted code is executed on the host. For hostile public deployments add edge rate limiting and isolate document parsers/Chromium under resource limits.

Resume PDFs are produced from escaped EJS data with browser JavaScript disabled and all resource requests blocked. Chromium closes in a `finally` block on success and failure. `CHROMIUM_NO_SANDBOX=true` is an explicit opt-in for isolated containers; prefer an enabled browser sandbox when the host supports it. Mock test completion and report writes are transactional, ownership is checked and answers are withheld until grading.

Tests delete credential-related environment variables before importing application modules, inject Firebase/Gemini doubles and never contact the live services. Run `npm ci`, `npm run check`, and `npm audit` regularly; read the actual audit report rather than applying breaking automatic downgrades.

## Dependency audit recorded during reconstruction (2026-10-14)

After clean `npm ci`, `npm audit` reported **20 moderate, 0 high, 0 critical** findings. `npm audit --omit=dev` reported **3 moderate, 0 high, 0 critical**. These are the remaining `sprintf-js` denial-of-service advisory [GHSA-hp3w-g68c-fv3c](https://github.com/advisories/GHSA-hp3w-g68c-fv3c) and its dependency chains: `mammoth -> argparse -> sprintf-js` in production, plus Jest/Istanbul development tooling. The suggested forced Mammoth/Jest downgrades are breaking and were not applied. High and critical findings in the earlier dependency set were resolved using supported upgrades/patches. Re-run the audit because advisories can change. The CI production audit gate rejects high/critical findings while continuing to display the remaining moderate findings.
