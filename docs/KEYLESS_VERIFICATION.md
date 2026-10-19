# Verification without live credentials — 2026-10-19

This run starts from `0b609f8` on origin/main. No Firebase/Gemini binding is changed
or used for live calls. Backend/React fixtures use synthetic identities and provider
doubles; the Firestore emulator is real local storage/rules/transactions. Untrusted
code execution stays disabled. Existing EJS/PDF compatibility is retained.

## Commands and results

```sh
npm ci
npm run check
npm run test:emulator
CHROMIUM_NO_SANDBOX=true npm run test:production
CHROMIUM_EXECUTABLE_PATH=/nonexistent JAVA_HOME=/nonexistent npm test
npm audit --json
npm audit --omit=dev --json
npm audit fix --dry-run --ignore-scripts --json
npm run test:compose
```

The Chromium sandbox override above is scoped to a single check in this isolated
cloud machine. It is not a global setting or a recommendation to disable sandboxing
on a general workstation. This host's SUID helper cannot launch sandboxed Chromium;
the explicit isolated startup succeeded. Package/TLS integrity checks stay enabled.

Clean installation, production build, types, lint, formatting, backend/React
regressions, standalone emulator, production HTTP/PDF and default Node-only tests
passed. Current full backend totals include the added browser cases below. The
167-case default subset passed with nonexistent Chromium/Java paths; it is not
added again to the total. Full backend has 233 cases, React 51 and emulator 11:
**295 distinct regression cases**. Focused `--testNamePattern` screenshot runs
intentionally deselect other tests; the final complete suites must have zero skips.

Local Docker checks reused cached `prepto:smoke` image `c40adf28190f`:
default startup via Compose, healthy published loopback HTTP,
authentication redirects/401, read-only/no-network PDF/HTTP smoke, and targeted
Firefox ESR 153.5.0 smoke passed using the existing optional Firefox test image.
The cached images are not claimed identical to current HEAD: their source hashes
differ. Latest-source production behavior is checked locally outside Docker and
the new GitHub CI independently performs a clean image build, production Docker
smoke and Compose health/auth smoke after push. This separates cached-image checks
from current-source verification rather than silently treating them as equivalent.

Audit results: **0 high/critical, 20 moderate overall, 3 moderate in production**.
The compatible audit dry run offered **0 additions/removals/changes**. No force fix,
advisory suppression, dependency churn or new telemetry service was introduced.
Remaining chains and upstream limitations are described in DEPENDENCIES.md.

## Additional accessibility/browser evidence

Thirteen new browser cases cover 12 representative routes (landing, login,
registration, onboarding, dashboard, admin questions, interviews, resumes,
matching, coding, progress and reports) and the mobile drawer keyboard cycle.
They check:

- Reflow without page-level horizontal scrolling at **320 CSS pixels**.
- Independent **computed text-size stress at 200%**, at a 640-pixel viewport.
  Font and explicit line sizes are doubled from their actual computed values,
  including fixed-pixel text. This is a CSS stress test, not native browser zoom.
- Chromium's exposed accessibility tree gives names to non-ignored buttons,
  links, textboxes, selectors, checkboxes and radios.
- Keyboard entry has a visible outline/shadow; forward/backward drawer cycling
  stays within the drawer/toggle and Escape restores the closed toggle.

Existing WCAG-tagged axe scans, reduced-motion checks, populated/empty/error forms,
demo isolation, authorization, development/production parity and PDF checks also
remain in the complete suites. Automated trees/axe checks are not a human screen
reader or full accessibility audit.

Actual synthetic screenshots captured and visually inspected in this run:

- [Login with computed text doubled](design/text-resize-login-640-200.png)
- [Progress/goals with computed text doubled](design/text-resize-progress-640-200.png)

Reproduce these screenshots after building with:

```sh
CAPTURE_HARDENING_SCREENSHOTS=1 node --experimental-vm-modules \
  node_modules/jest/bin/jest.js tests/react.test.js --runInBand \
  --testNamePattern='320 CSS-pixel|narrow mobile navigation'
```

These checks found no product regression requiring a visual redesign.

## Blocked and unrun checks

**WebKit download blocked:** an isolated temporary Playwright 1.64.1 tool was
installed outside the repository; official WebKit 27.2 downloads failed with
HTTP 403 `Domain forbidden` at cdn.playwright.dev and
playwright.download.prss.microsoft.com, including an escalated retry. No unofficial
mirror, TLS bypass or project dependency was added. No WebKit success is claimed.

**Actual Safari/VoiceOver/NVDA unrun:** this Linux/headless workspace has no macOS
Safari or human assistive-technology operator. These checks need no API keys, but
need the appropriate platform/operator. To review locally without credentials:

```sh
npm ci && npm run build && npm run demo
```

Use the labelled local demo in Safari/Firefox/Chromium. Check keyboard-only entry,
skip link, drawer Tab/Shift+Tab/Escape, form labels/errors, session controls, saved
reviews, reports/downloads and progress goals with VoiceOver or NVDA; inspect 200%
native browser zoom and 320 CSS-pixel reflow. Do not treat these instructions as
completed human validation.

**Live/deployment unrun:** real Firebase/Gemini, mail/reset delivery, deployed TLS,
live persistent sessions, Firestore index build/TTL readiness and hosted monitoring
sink/alert delivery remain pending. The existing secure-binding opt-in live tool
is retained. No credentials, live projects, global proxy settings or environment
publication were changed. Genuine long-term maintenance history is not fabricated.
