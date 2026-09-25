# Full H2A suite failures — 2026-09-24

Final full run: **351 passed, 31 failed, 4 skipped**, 386 tests. This is not an all-green result. No failing test was filtered from the run.

The previous-run column compares the complete elevated run before the pipe fix. A changed outcome is investigated separately; this table does not assume it is a code regression or a harmless flake.

| File | Failed tests | Previous run | First failure messages |
| --- | ---: | --- | --- |
| electron-ceremony-phase24.test.ts | 1 | failed | locator.click: Target page, context or browser has been closed |
| electron-collaboration-phase41.test.ts | 1 | passed | page.evaluate: Target page, context or browser has been closed |
| electron-control-plane-phase34.test.ts | 1 | failed | page.waitForSelector: Target page, context or browser has been closed |
| electron-controls-phase31.test.ts | 2 | failed | locator.click: Timeout 30000ms exceeded. |
| electron-employee-access.test.ts | 1 | failed | locator.waitFor: Target page, context or browser has been closed |
| electron-federation-pairing-phase48.test.ts | 1 | failed | AssertionError: expected 'import {\n  Activity,\n  Bot,\n  Buil…' to contain '<CoworkerPairingPanel compact' |
| electron-federation-pairing-visual-phase48.test.ts | 1 | failed | page.waitForSelector: Target page, context or browser has been closed |
| electron-final-integration-phase43.test.ts | 1 | failed | page.waitForSelector: Target page, context or browser has been closed |
| electron-goal-work-graph-phase49.test.ts | 1 | failed | page.waitForSelector: Timeout 30000ms exceeded. |
| electron-guided-bootstrap-phase25.test.ts | 1 | failed | locator.click: Target page, context or browser has been closed |
| electron-guided-workflows-phase38.test.ts | 2 | failed | page.waitForSelector: Target page, context or browser has been closed; electronApplication.firstWindow: Target page, context or browser has been closed |
| electron-office-native-phase50.test.ts | 1 | passed | locator.getAttribute: Target page, context or browser has been closed |
| electron-operator-journey-baseline-phase45.test.ts | 1 | failed | page.waitForSelector: Timeout 30000ms exceeded. |
| electron-pixel-office-phase36.test.ts | 2 | failed | page.waitForSelector: Target page, context or browser has been closed; electronApplication.firstWindow: Target page, context or browser has been closed |
| electron-presentation-shell-phase35.test.ts | 2 | failed | page.waitForSelector: Target page, context or browser has been closed; electronApplication.firstWindow: Target page, context or browser has been closed |
| electron-project-delivery-phase40.test.ts | 1 | failed | page.waitForSelector: Target page, context or browser has been closed |
| electron-readiness-phase46.test.ts | 1 | failed | page.waitForSelector: Target page, context or browser has been closed |
| electron-runtime-attachment-phase39.test.ts | 1 | failed | locator.click: Target page, context or browser has been closed |
| electron-surface-phase23.test.ts | 1 | failed | locator.click: Target page, context or browser has been closed |
| electron-truthful-office-phase37.test.ts | 1 | failed | locator.click: Target page, context or browser has been closed |
| local-demo-data.contract.test.ts | 1 | failed | AssertionError: expected { status: 'verified', …(2) } to deeply equal { status: 'verified', …(2) } |
| product-surface-phase23.test.ts | 1 | failed | AssertionError: expected { 'App.tsx': 1, …(41) } to deeply equal { 'App.tsx': 1, …(37) } |
| provider-adapters-phase16.test.ts | 3 | failed | Error: Official claude-code executable was not found.; Error: Official Antigravity CLI is not available in PATH or the verified WinGet location.; AssertionError: expected [ 'ready', 'degraded' ] to include 'dependency-missing' |
| runtime-attachment-phase39.test.ts | 1 | failed | AssertionError: expected 'dependency-missing' not to be 'dependency-missing' // Object.is equality |
| workspace-ux.test.ts | 1 | failed | AssertionError: expected '<div class="h2a-workspace"><a class="…' to contain 'Your next piece of work starts here' |

[Machine-readable final report](../.test-artifacts/h2a-full-suite.json) · [Full log](../.test-artifacts/h2a-full-suite.log) · [Previous report](../.test-artifacts/h2a-full-suite-before-pipe-fix.json)

All six pipe/refresh/lifecycle regression files passed in this full run (48 tests), including actual Electron with a closed stderr pipe. Further targeted rerun findings are in [verification.md](verification.md).
