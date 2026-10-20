# Changelog

Notable changes are recorded here. Version numbers describe package metadata and do
not imply that a deployment or GitHub release has occurred.

## Unreleased

### Added

- Isolated full test image/Compose command with Node, Chromium and verified Java/Firestore emulator; fresh container CI gate.

- Backend-wide/runtime-script checked JavaScript with shared request/session contracts and strict frontend test checking.
- Expanded React integration coverage and enforced 80% statement/function/line floors.
- Verified direct official Firestore emulator launcher, removing the unused vulnerable Firebase CLI chain.

- Separate React source coverage and integration tests for critical workspace behavior.
- Mobile page-content accessibility checks and production/Docker smoke tooling.
- Shared request schemas, coverage gates and scoped backend type checking.
- Explicit offline/default versus browser/emulator verification commands.

### Fixed

- Authentication initialization failures can retry without a reload or stored browser tokens.
- Runtime/tooling TCP address narrowing and upload error callback contracts.

- Low-contrast dashboard labels on tinted cards and secondary-button hover text.

## 1.0.0 — existing package version

- Express/Firebase interview workspace, question bank, resume versions and matching,
  coding practice, progress/goals, sanitized reports and isolated offline demo.
- React/TypeScript/Vite frontend migration with retained EJS compatibility/PDF templates.

This entry summarizes existing capabilities; it is not a newly fabricated release.
