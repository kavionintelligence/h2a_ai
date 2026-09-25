# Live verification — 25 September 2026

This records observed results, not a production-security certification.

## Actual system observations

- Real-data application: `http://127.0.0.1:8788/`, with separate persistent data in `integration-data/live-workspace`. The previous 8787 instance/data was not replaced.
- Endpoint collector observed six tool identities/configuration or process-name matches: Claude, Claude Code, ChatGPT, Codex CLI, Gemini CLI and Cursor. Presence does not prove authorization or autonomous agent behavior. Cloud discovery sources are not configured.
- Actual Claw Hunter collector completed with zero OpenClaw agents/findings. Report: `RPT-e55d1417-b5c0-4dcd-b9df-a2713a4aeb62`. This is collector coverage, not proof that the host is safe.
- Standalone Codex CLI reported a ChatGPT login; Claude Code reported signed out. No credentials were copied or printed.
- Actual Codex execution through the ByoSync approval/runtime path succeeded, exit code 0, duration 56,512 ms. Run: `RUN-e553cb72-4f3b-4752-b74c-379c885903e4`.
- That run generated `index.html` and `README.md` for a small offline task checklist. Output hash: `sha256:ea681f5c589333730630d547dfbd97a0abc7e854757debfe2fe723e2ef949a34`.
- The approval used explicit **automated local-operator verification**, not a separate human reviewer. Generated files were inspected as text; the generated application was not executed, tested, installed or deployed. Files remain proposed for the user's review/publication in Operations.

## Separately tested with isolated fixtures

Room tests verify named-user role checks, independent reviewer requirements, cross-room denial, two-step handoff, failure without invented success, reviewed memory reuse, tampered-memory rejection, publication, ZIP download, restart persistence and process cancellation. Connector tests exercise Mem0 and Langfuse HTTP contracts with mocked responses.

The browser regression covers the CISO lifecycle and new room approval request, including narrow-screen layout. These fixture runs are not inserted into the real-data workspace.

## Not demonstrated live

- Two different live CLI agents collaborating: handoff is fixture-tested; only one actual Codex step was run.
- Multiple real people signing in and approving: named-user controls are tested, but real users must be provisioned and participate.
- Claude Code execution until sign-in; live Mem0 or Langfuse connectivity until services are configured.
- Enterprise-wide discovery, SSO/MFA, tenant isolation, generated-code deployment, or an independent security assessment.

See [setup and boundaries](REAL_ROOMS_AND_DISCOVERY.md) before moving the product to another device.
