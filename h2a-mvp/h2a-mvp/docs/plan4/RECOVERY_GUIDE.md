# Recovery Guide

1. Relaunch with the exact prior `H2A_DATA_PATH`. H2A reconciles interrupted provider and terminal runs without converting them to success.
2. Inspect Settings for the expected data path, required liveness mode, and verified evidence head.
3. Open Evidence and filter by the ceremony trace. Confirm restart records use `HOST_PROCESS_RESTARTED` where applicable.
4. Re-attest only the affected runtime session. Do not replace a Passport or widen a mandate to recover a process.
5. Renew expired Context Grants or authority through their protected workflows. Never edit repository files manually.
6. If ledger verification fails, stop the ceremony, retain the root, and export no final package.
7. A clean final retry must use **New clean session**. It creates a separate root and never deletes the failed root.
