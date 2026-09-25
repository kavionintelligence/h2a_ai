# Agent Census dashboard

The dashboard reads the real Census registry and never seeds demo fixtures. For a real Bedrock validation database, first complete `scripts/real_validate.py` with status `passed` in `output/real-validation/report.json`.

Start the real-results dashboard from the project directory:

```powershell
.\.venv\Scripts\python.exe scripts/serve_real_dashboard.py --port 8765
```

Open `http://127.0.0.1:8765/`. The dashboard opens with zero counters and an empty inventory; it does not fetch the registry or run discovery on page load. Select **SCAN** to begin discovery and load the current results. No credential is entered or sent by the browser. Its data and mutation routes accept requests only from loopback with a same-origin browser request; the server uses its private `CENSUS_ADMIN_TOKEN` configuration internally. Both dashboard server and trusted UI must remain on loopback; do not expose this process to a public network.

Select **SCAN** to run any adapter inventories configured in `CENSUS_DISCOVERY_SOURCES`, then refresh classifications, fingerprints, identity resolution and capabilities from stored discovery/runtime evidence and probe endpoints for approved records. Expired observations remain in the inventory with their original classifications, registration/shadow state and evidence; the Active agents counter excludes stale runtime evidence, and rows show activity status, last seen and evidence age. The progress indicator remains active until scanning and registry refresh finish; errors are shown without discarding existing evidence. Select an entity to inspect its fingerprint, evidence and identity decisions. With no configured adapter inventories, Scan refreshes existing evidence and performs approved endpoint health checks; it does not invent results or discover arbitrary network targets.

This endpoint scans the sources and runtime observations already recorded in Census; it does not invent inventories or discover arbitrary network targets. To add new target inventories, use the existing authenticated `POST /discovery/run` endpoint with its supported `a2a`, `mcp`, `kubernetes`, `docker`, `api_registry`, `git`, `local_process` or `manual` adapters. The dashboard reflects those candidates on the next load or scan.

For an unregistered positive, select **Register Agent**, review the observed identity and evidence, then confirm. A loopback-only dashboard route invokes the existing Census registration service. Census resolves the registration against prior observations using its identity pipeline, retains the existing canonical Agent ID when matched, and keeps the original runtime/discovery observations and event history. Registration does not automatically approve trust or make an endpoint routable.

To serve the synthetic offline example instead, follow the separate instructions in the README for `scripts/serve_demo.py`; it is not the real-results dashboard.
