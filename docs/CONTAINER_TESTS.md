# Complete offline tests in Docker

With Docker Engine/Desktop and Compose v2, start from a clean clone and run:

```sh
docker compose -f docker-compose.test.yml run --build --rm test
```

No host Node, Chromium or Java installation and no Firebase/Gemini credentials are
required. Build needs access to the official public image/package/emulator sources;
execution is offline. Docker Desktop must be running and have sufficient memory/disk.
An ordinary overlay-based Docker host is recommended; VFS copies whole intermediate
filesystems and needs substantially more disk than the final image size.

## What executes

`Dockerfile.test` is separate from the production Dockerfile. It bundles:

- Node 24.19.0 and the committed npm lockfile/dev dependencies (`npm ci`).
- Java 21 JRE, sourced from an official multi-architecture Temurin digest.
- Debian's Chromium, public CA certificates and fonts.
- Official Firestore emulator 1.22.0, prepared with the existing size/SHA-256 verifier.
  The same integrity verification executes before the cached emulator starts.
- Both backend and frontend tests/fixtures. `Dockerfile.test.dockerignore` intentionally
  retains tests, while the production build context keeps its existing exclusions.

The default command runs build, lint, frontend/backend typechecks, formatting,
`npm run test:all` (backend/browser + React + real Firestore emulator), and production
HTTP/static/auth/deep-link/demo-isolation checks with real Chromium PDF export.
Failures preserve their exit status; coverage thresholds remain enforced. A separate
GitHub Actions job builds and runs this exact Compose command from a fresh checkout.
It does not replace the existing Node-only, browser/emulator or production Docker jobs.

Expected regression cases at this milestone: 233 backend/browser, 51 React and 11
emulator cases, **295 distinct cases**. Production smoke is reported separately.
`npm test` is a 167-case Node-only subset, not 167 additional cases.

## Isolation and credentials

The service runs as the non-root `node` user with no runtime network, no published
ports, no host source/credential mounts, dropped capabilities, init and explicit
shared-memory/tmpfs limits. Loopback within the container remains available for its
HTTP servers and Firestore emulator. Runtime workspace writes are internal to the
throwaway container so builds/coverage can work; `--rm` removes it on exit.

There is no `env_file` or live secret pass-through. Docker Compose may parse its
usual local interpolation settings, but this service does not mount `.env` or
forward Firebase/Gemini/session bindings. Build contexts exclude `.env*` (except the
public example), private PEM/CSR/service-account artifacts, Git metadata, dependency
and generated-output directories. Test setup clears injected provider/session
bindings and uses doubles; emulator tests isolate the `demo-prepto` project.

The Chromium sandbox override is explicit only for this isolated test image. Do not
deploy this image or expose test doubles as a production authentication mechanism.
User-submitted code execution remains disabled. No Docker socket is mounted and no
Docker-in-Docker daemon is required.

## Host Node-only baseline

If Node 24 is already installed, the light first-run path is:

```sh
npm ci
npm test
```

This path needs neither Java nor Chromium. The full container path above adds the
browser/emulator/build gates without installing those tools globally on the host.
Existing backend floors are 85% statements/functions/lines and 80% branches; React
floors are 80% statements/functions/lines and 70% branches, plus per-module gates.
See package.json and frontend/vitest.config.mjs. `--coverage` alone is not the gate:
the numeric thresholds and nonzero runner exit codes are enforced in CI.

## Restricted build proxies and public CAs

Export existing `HTTP_PROXY`, `HTTPS_PROXY` and `NO_PROXY` before building if needed;
these predefined Docker build arguments are scoped to build steps, not runtime
service settings. No global proxy changes or environment Publish are required.
`PREPTO_DOCKER_BUILD_NETWORK=host` is an optional build-only override on hosts where
that networking mode is needed. Ordinary contributors do not need these settings.

For a TLS-inspecting proxy/custom host mapping, keep a local override outside Git:

```yaml
# /tmp/prepto-test-build.override.yml — use your existing trusted public CA/path.
services:
  test:
    build:
      network: host
      extra_hosts:
        - "YOUR_PROXY_HOST:YOUR_PROXY_IP"
      secrets:
        - build_ca
secrets:
  build_ca:
    file: /absolute/path/to/trusted-public-ca.pem
```

```sh
docker compose -f docker-compose.test.yml -f /tmp/prepto-test-build.override.yml build
docker compose -f docker-compose.test.yml run --rm test
```

The optional BuildKit secret is readable by UID 1000 only during the install/
emulator-preparation step. TLS and npm/artifact integrity verification stay enabled;
CA contents, proxy credentials and live bindings are not copied into image layers.
Do not add placeholder CA paths as active environment values. The four optional
Firefox/CA/build-network/build-proxy variables named by the assessment are already
commented and explained in `.env.example`; they are not mandatory application keys.

## Assessment interpretation and remaining limits

The supplied assessment explicitly says it never executes code. Its repeated
“no test suite”/null coverage gate claims conflict with the committed suites,
threshold configs and actual CI results. This container adds a practical portable
full-test path; it does not manufacture a higher score, offer or maintenance history.
Only npm is supported, so a second package-manager lockfile is unnecessary.
Weekly Dependabot already covers npm, Actions and Docker. Dependency provenance and
unresolved upstream findings remain documented in DEPENDENCIES.md.

This validates offline/local behavior. Real Firebase/Gemini, email delivery, deployed
TLS/session/index readiness, human assistive-technology and actual Safari validation
remain distinct pending checks. Offline provider doubles are not live verification.


## Recorded local validation

The optimized image built successfully on the restricted VFS cloud host. A non-root,
read-only/network-disabled preflight verified Node 24, Java 21, Chromium, backend and
frontend test fixtures, absence of `.env`/Git metadata/live credential bindings, and
the pinned emulator checksum. The default Compose service then ran with network
mode `none`: build, types, lint, format, all 295 regression cases (zero skipped), real
emulator transactions/rules and production HTTP/PDF smoke passed with exit code 0.
The test container was removed by `--rm`; no live project or host secret was used.
Restricted-host proxy/CA overrides applied only to the build, with normal TLS/integrity
verification. The resulting latest-source clean-build CI status is reported after push.
