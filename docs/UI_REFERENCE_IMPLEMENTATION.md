# CISO workspace: reference implementation

The supplied ByoSync reference screens informed the white/light-blue surfaces, navy text, compact cards, inventory tables, review workspace and evidence timeline. Their fictional people, incidents, counts, dates and verification claims are not loaded into product data.

## Connected screens

- Overview: pending action approvals, room builds and memory proposals; findings, changes and evidence coverage from current state.
- AI estate: registered identities and discovery observations, owner/authority/control distinctions, search, filters, sort, pagination and CSV export.
- Decisions: existing approvals and room-run decisions, with an exact-action review inspector. Local operator sessions are explicitly not independent human verification.
- Operations: room membership, real CLI bindings, governed build requests, activity, proposed artifacts and reviewed memory. No new execution is triggered by this visual redesign.
- Assurance: actual findings, coverage and source health. Missing observations are not evidence of safety.
- Identity trace: existing authority/runtime relationship view plus a chronological, filterable record table. The lanes remain distinguishable.

## Product marks

Claude, Gemini and Antigravity assets come from their official product sites. Codex and ChatGPT use the original OpenAI blossom distributed with the official Codex extension. The marks are packaged locally so displaying them needs no vendor network request.

`public/product-marks/sources.json` (under the bundled h2a-mvp project) records original sources and SHA-256 checksums. `scripts/import-product-marks.mjs` reproduces the import; its optional argument is the installed official OpenAI extension directory.

Brand recognition uses collector `tool_id` or an exact product name; a registered identity retains its discovery snapshot. A custom agent using an OpenAI/Google/Anthropic model is not automatically branded as that vendor's product. Custom or unidentified agents use a bot icon. A missing image also falls back to the bot.

Logos are vendor trademarks used for identification, not evidence of endorsement, authorization, monitoring or enforcement. Supporting an icon does not add discovery coverage: Antigravity displays its mark when an observation identifies that product; it is not claimed to have been detected on this machine.

## Deliberate boundaries

The UI/UX skill informed readable hierarchy, keyboard focus, labeled controls, restrained status colors and responsive layouts. Backend authority remains the source of enforcement. This update does not claim universal endpoint visibility, independent biometric verification, comprehensive cloud coverage or production multi-tenant assurance.
