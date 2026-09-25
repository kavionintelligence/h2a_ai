# ByoSync source-publication checklist

## Scope of this review

Read-only publication inspection on 25 September 2026, plus this checklist and an updated root third-party notice. Reviewed folder/file inventory, current ignore rules, package/build references, selected license notices and filename/content patterns. No secret values were printed, no runtime data was deleted, and this review did not initialize, stage, commit or push Git content. It is a bounded audit, not a guarantee that no secret or licensing issue exists.

No `AGENTS.md` was found in the product or the checked ancestors. The parent task subsequently initialized Git; recheck the actual staged file list before committing because ignore rules do not remove already staged files.

## Inventory snapshot

Excluding `node_modules`, `.venv*`, `.git` and Python bytecode caches, but including other generated output:

| Area | Files | Approximate size | Publication handling |
| --- | ---: | ---: | --- |
| `h2a-mvp/` | 836 | 368.31 MB | Keep product source/config/tests/notices; exclude generated builds, local state and unreviewed/copied optional biometric binaries. |
| `.test-artifacts/` | 1,133 | 78.52 MB | Exclude; contains generated evidence, databases and signing keys. |
| `integration-data/` | 61 | 18.27 MB | Exclude; real local state, discovery database, logs and signing keys. |
| `docs/` | 22 | 3.26 MB | Keep authored docs; optionally omit bulky generated source-audit CSVs. Review machine-specific paths before public release. |
| `agent-discovery-platform/` | 164 | 1.04 MB | Keep source, manifests/lockfile, tests, examples and licenses; exclude environments and output. |
| `.ui-review/` | 7 | 0.65 MB | Exclude generated screenshots. |
| `vendor/` | 9 | 0.10 MB | Keep all nine selected files and notices; these are runtime dependencies. |
| `scripts/` / `tests/` | 20 / 8 | 0.15 MB combined | Keep authored build/start/setup/integration scripts and tests. |

Counts are a point-in-time snapshot; the active task may add files after this review.

## Files that must stay out

- `integration-data/**`, `.test-artifacts/**`, `.ui-review/**`, demo/runtime data, local named-user credential files, `.env` variants except deliberately blank examples, logs and database/WAL files.
- `node_modules/**`, `.venv*/**`, caches, `out/**`, `dist/**`, `.governance-dist/**`, hosted build output, `.vercel/**` and archives.
- `h2a-mvp/h2a-mvp/docs/**/evidence/**`: 233 generated files, approximately 22.78 MB, include human-proof screenshots and runtime/baseline JSON. Do not assume these are privacy-cleared publication assets. Keep the authored source/docs and regenerate evidence locally where older baseline tests require it.
- Optional `public/biometric/models/*.onnx`: the existing component notice records restricted or unverified redistribution terms. Do not add them with force.
- Unless intentionally reviewed for a separate biometric distribution, omit `h2a-mvp/h2a-mvp/public/biometric/ort/**`, `.../mediapipe/**` and `.../models/*.task`. The first two contain roughly 103 MB of copied runtimes; the task model is approximately 3.76 MB. They are not required by the hospital simulation. Keep their source contracts/manifests/notices; do not imply the optional biometric flow is fully portable without its assets.

Observed actual signing-key files and Census databases are under ignored runtime/test directories. A filename-only private-key pattern check found the intentionally supplied `tests/fixtures/federation-loopback-key.pem` plus source that validates PEM headers; a multiline PEM-body check found only that test fixture among nonignored source candidates. This limited scan is not a general secret-scanner clearance.

## Ignore-rule recommendations

The initial root rules already protected state, `.env`, databases, builds, caches, signing-key names and `.onnx` weights. At review time these additions were still recommended:

1. Exact copied biometric folders/model pattern listed above.
2. Private certificate/key patterns (`*.pem`, `*.pfx`, `*.p12`, `*.key`) with **only explicit reviewed test-fixture exceptions**, if those fixtures remain necessary.
3. Deployment-specific named-user files such as `users.local.json`; keep credential provisioning examples blank, never the provisioned directory.
4. Exclude generated `docs/backend-source-audit/*.csv` to avoid approximately 3.1 MB of upstream inventory and local-path context. These are not product runtime dependencies; retain the authored audit summary if needed.
5. Exclude `h2a-mvp/h2a-mvp/docs/**/evidence/` to keep generated screenshots and runtime evidence private. Regeneration may be necessary before running older evidence-dependent baseline checks.

The loopback key/certificate are referenced by `tests/federation-phase20.test.ts` for a local TLS test. If retained, treat the private key as public test material, document it as test-only and never use it for a deployed service. Do not apply a blanket key-file exception across the repo.

## Recommended tracked source scope

- Root `.gitignore`, blank `.env.example`, `package.json`, `tsconfig.governance.json`, `README.md`, corrected `THIRD_PARTY_NOTICES.md` and authored hosting configuration such as `vercel.json`.
- `scripts/`, `tests/` and reviewed `docs/`.
- `h2a-mvp/h2a-mvp/apps/`, `packages/`, `integrations/`, `tools/`, `scripts/`, `tests/`, authored samples/scenarios, design/docs, small reviewed `assets/` and `public/` assets, and `third_party/` source/licenses. Keep package manifests and lockfiles, Vite/Electron/TypeScript/test configuration and nested third-party notices. Apply the exclusions above rather than omitting the source packages.
- `agent-discovery-platform/src/`, `scripts/`, `tests/`, `examples/`, docs, build/container configuration, `pyproject.toml`, `requirements.lock`, blank `.env.example`, `LICENSE`, `NOTICE` and `third_party/` licenses.
- All of `vendor/`: Claw Hunter collector scripts + MIT license; adapted Claw Orchestrator `exec.ts` + MIT license; Shadow AI Guard registry + Apache license/NOTICE; `manifest.json` with provenance hashes. Governed rooms and collectors import/read these exact paths.
- Local product/tool icons with their source attribution records. These are not endorsement or connection-verification badges.

Do not copy the seven upstream repositories into the new repository. Do not invent a blanket MIT license for the combined product: the existing H2A BCH component carries GPL-2.0 notices, Agent Census has Apache notices, and optional weights have separate restrictions. The root third-party notice was corrected to distinguish actually bundled files from service adapters and architecture references.

## Before commit and push

1. Review `git status --short`, the candidate tracked file names and `git diff --cached --stat`; check large files and ignored-state paths specifically. Review diffs locally without publishing secret values to logs.
2. Confirm no actual token, provisioned users file, private signing key, real scan report, browser storage export or database entered the index. Do not use `git add -f` to override these exclusions.
3. Keep the approved remote URL and intended branch explicit. Repository visibility and publication authority remain the owner's choice.
4. Run typecheck, production/hosted build as relevant, selected unit tests and the browser journey. Validate a fresh install from manifests, not local dependency folders.
5. Review optional biometric/GPL distribution scope before packaging those features. Passing product tests is not licensing or security certification.
