# Hosting the hospital simulator on Vercel

This configuration publishes the **browser-based hospital simulator**, not the local ByoSync governance server. Local scanning, Claude Code/Codex CLI execution, endpoint control, real identity sessions and local persistent records are not deployed by this build.

The existing `npm start`, `npm run setup` and `npm run build` commands remain unchanged for the local product.

## Vercel project settings

Import the approved GitHub repository after the source-only commit has been reviewed.

| Setting | Value |
| --- | --- |
| Root Directory | `ByoSync` if the repository contains that folder; `.` if ByoSync is the repository root |
| Framework Preset | Other; the committed configuration supplies the commands |
| Node.js | 22.x, at least 22.12 |
| Install Command | `npm run install:hosted` |
| Build Command | `npm run build:hosted` |
| Output Directory | `hosted-dist` |
| Required API keys | None for this simulator |

`vercel.json` is the source of truth for install/build/output and response headers. Vercel supports these overrides in its [project configuration](https://vercel.com/docs/project-configuration/vercel-json).

The install script uses the committed `h2a-mvp/h2a-mvp/package-lock.json` with `npm ci`, including development build dependencies but skipping lifecycle scripts. It does not install Python, download Electron or Playwright browsers, or initialize operational data. Native modules in the shared dependency lock are not usable in this hosted installation; they are unnecessary for the static simulator.

## Hosted-mode contract

`scripts/build-hosted.mjs` defines:

```ts
import.meta.env.VITE_BYOSYNC_HOSTED_SIMULATOR === 'true'
```

The application must use that compile-time flag to keep hosted users inside the simulator even when `?mode=workspace` is supplied. This flag is a capability boundary, not authentication or a secret. In a normal local build it is absent, and the explicit local `?mode=workspace` route remains available.

The build disables automatic `.env` loading and the normal public-folder copy. Only the reviewed product-logo allowlist is copied. It writes to `hosted-dist`, separate from the existing local frontend build, and emits `hosting-mode.json` stating that no backend is deployed. Source maps, biometric assets, local keys, runtime databases and collected endpoint evidence are not published by this script.

The SPA fallback supports client navigation; `/api`, hashed assets and product-mark paths are excluded from fallback. There is no hosted `/api` implementation or rewrite to a localhost backend. Vercel documents the SPA routing requirement for [Vite applications](https://vercel.com/docs/frameworks/frontend/vite).

## Identity and data boundaries

- Any in-browser operator sign-in or hospital selector is a presentation session unless backed by a separately implemented, authenticated service. It is not enterprise SSO, MFA or secure multi-tenant authorization.
- Hospital state and playback decisions remain browser-local. They do not synchronize across laptops or users.
- Use synthetic administrative examples only. Do not upload patient data, credentials, customer records or private security evidence.
- For a private presentation, configure deployment access protection in Vercel. A client-side sign-in screen must not be relied upon to protect the static bundle or scenario data.
- Never add provider API keys or credentials to `VITE_*` variables. Values compiled into browser JavaScript are public to viewers.

## Before committing or uploading

Do not stage the entire downloads workspace. Review a source-only allowlist for the chosen repository root:

- Root manifests and configuration: `package.json`, `vercel.json`, `.gitignore`, reviewed `README.md`, `THIRD_PARTY_NOTICES.md`, and TypeScript configuration.
- `scripts/` source files, excluding caches, logs and local output.
- `h2a-mvp/h2a-mvp/apps/`, `packages/`, required build configuration, `package.json`, `package-lock.json`, and source tests. Review local fixture keys explicitly; do not confuse them with operational keys.
- `h2a-mvp/h2a-mvp/public/product-marks/` with attribution metadata. Review other public assets separately; do not upload biometric weights by default.
- Reviewed documentation. Include the local backend and discovery/vendor source only if the repository is intentionally distributing the full product and its licenses have been reviewed; these are not required merely to host the simulator.

Always exclude `integration-data/`, `demo-data/`, `demo-archives/`, `node_modules/`, `.env` and non-example environment files, signing/provider/workload keys, databases, `.test-artifacts/`, `.ui-review/`, `.vercel/`, `hosted-dist/`, build output, logs, archives, Python environments and machine-local configuration.

The existing ignore file already covers operational data, keys, databases, dependencies and common build output. Ensure the new `hosted-dist/`, `.vercel/` and `.ui-review/` paths are ignored as well. `.gitignore` is only a staging aid: inspect the actual staged file list and diff, and perform a secret scan before pushing. No credentials or runtime data should be committed even to a private repository.

## Local verification before a deployment

From the ByoSync project root, with locked dependencies already installed:

```sh
npm run build:hosted
```

On a clean checkout, run `npm run install:hosted` first. It replaces that checkout’s nested `node_modules` with the lockfile install; do not use it to modify an unrelated running workspace.

Serve `hosted-dist` using a static HTTP server and verify:

1. The operator entry and hospital selection flow works, including refresh and sign-out.
2. The hospital overview, estate, rooms, brain, decisions and downloads work.
3. `?mode=workspace` cannot activate the local backend UI in this build.
4. No `/api` requests, endpoint scans or model-provider calls occur during the walkthrough.
5. Product logos load, mobile layouts remain usable, and the persistent environment indicator remains truthful.
6. The output contains no source maps, local data directories, credentials or biometric files.

A successful local build is not a successful cloud deployment. After importing the Git repository, review the Vercel build logs and the actual preview deployment before sharing its URL.

## What a real hosted product would require

A hosted UI cannot inspect a visitor’s laptop or invoke its local CLI without an explicitly installed and authenticated endpoint component. Production hosting of the existing local service also needs a separately designed backend, persistent database, key management, authenticated tenant isolation, job execution, evidence retention and operational monitoring. Vercel’s serverless functions do not provide the shared persistent local storage that the current file/SQLite-oriented deployment expects; see [Vercel’s SQLite guidance](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel).

This simulator configuration does not implement those production services or turn browser-local operator state into an access-control system.
