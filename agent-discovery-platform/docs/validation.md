# Delivery validation

Validated on **2026-09-24, Windows x64, Python 3.12.14, SQLite**. This is an execution record, not a production-readiness or protocol-conformance certification.

## Clean extraction

A candidate source ZIP was created, CRC/content hashes checked, and extracted into a new directory. A fresh `python -m venv` environment was created. The documented installation commands were actually executed against the extracted files:

```bash
python -m pip install --require-hashes -r requirements.lock
python -m pip install --no-deps -e .
python -m pip check
python -m ruff format --check .
python -m ruff check .
python -m mypy src/agent_census
python -m pytest -q -p no:cacheprovider --basetemp output/clean-test-temp --cov=agent_census
python scripts/demo.py
```

The dedicated pytest temp/cache options accommodate this host's restricted OS temp directory and do not change the tests. All checks passed: **95 tests, zero failures/skips**; mypy checked 12 modules; all 27 Python files passed formatting. Statement coverage was **1,667 / 1,802 = 92.51%**. The clean suite completed in 7.90 seconds on this run; duration is not a performance guarantee.

The demo recovered ten targeted entities, classified six as agents, retained four non-agent controls, detected two shadow candidates, merged duplicates, built the graph, searched/matched and dispatched a synthetic task through A2A. Full evidence and measured metrics are in [demo-report.json](../output/reports/demo-report.json), [demo-report.md](../output/reports/demo-report.md), and [evaluation.json](../output/reports/evaluation.json). These outputs were generated from the clean extraction.

## Additional executed checks

- Started `scripts/serve_demo.py` as a real loopback process; verified `/ready`, dashboard HTML, authenticated inventory (10 records), two shadow candidates, `/docs`, and the OpenAPI bearer scheme. Unauthenticated `/agents` returned 401. Stopped the process afterward. This was an HTTP/browser-script smoke test, not a visual screenshot audit.
- Extracted the dashboard JavaScript and checked syntax with Node.
- Ran `scripts/init_env.py` twice in a separate directory; verified distinct random role tokens, no credential output, and no overwrite of an existing `.env`.
- Executed `scripts/migrate.py`; created a persistent SQLite registry entry, closed the database and reopened it; registry, graph and audit data survived.
- Built a Python wheel from the extracted project and checked that all 12 modules and the dashboard asset are included.
- Collected notices for all 41 installed dependency distributions and the two isolated build requirements. No upstream implementation source was vendored.
- Checked the archive's single project root, required files, per-file hashes, CRC, size bounds, lack of machine-specific user paths, absence of `.env`/databases/caches/virtual environments, and absence of private-key material. Source uses generated/environment credentials, not embedded credentials. These checks do not claim universal detection of every possible secret pattern.

Final documentation, machine-readable validation results and the generated OpenAPI schema were added after execution; final source hashes are compared with the clean-tested source before packaging. The final ZIP is extracted and hash-verified again. Its adjacent manifest provides SHA-256 integrity and the exact included file list.

## Not evaluated

Docker was not installed on this host, so Compose execution and a live PostgreSQL server are **NOT EVALUATED**. Real Kubernetes/Docker inventories, cloud IAM, provider/framework exporters, real LLM agents, exhaustive protocol conformance, other Python/OS combinations and real-world detection accuracy are also **NOT EVALUATED**. The offline SQLite path is the tested reproducible route. The supplied deployment and adapter boundaries are documented in the README and protocol/security guides.

See [validation.json](../output/reports/validation.json) for the machine-readable record and [evaluation limitations](evaluation.md) for the scope of the synthetic accuracy figures.
