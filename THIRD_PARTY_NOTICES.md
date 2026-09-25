# Third-party source and asset notices

ByoSync includes the selected third-party files below; it does not bundle the seven supplied upstream repositories wholesale. These notices do not place the entire product under one common license. Retain each component's license, copyright and NOTICE files when redistributing it.

## Selected source actually bundled

| Component | Included files / use | License and attribution |
| --- | --- | --- |
| Claw Hunter | `vendor/claw-hunter/claw-hunter.ps1` and `claw-hunter.sh`, invoked by the optional OpenClaw collector | MIT; copyright 2026 backslash-security. Exact license: `vendor/claw-hunter/LICENSE`. |
| Claw Orchestrator | `vendor/claw-orchestrator/exec.ts`, imported by governed CLI rooms and the collector | MIT; copyright 2024 enderfga. Exact license: `vendor/claw-orchestrator/LICENSE`. Locally adapted for Windows process-tree termination, hidden windows and cancellation; this is not the full orchestrator. |
| Shadow AI Guard | `vendor/shadow-ai-guard/registry.yaml`, used by endpoint presence collection | Apache-2.0; copyright 2026 Aman Karir. Preserve `vendor/shadow-ai-guard/LICENSE` and `vendor/shadow-ai-guard/NOTICE`. |
| Agent Census / Agent Discovery Platform | Local discovery product source under `agent-discovery-platform/` | Preserve `agent-discovery-platform/LICENSE`, `NOTICE` and `third_party/licenses/`. Its NOTICE identifies Apache-2.0 source. |

`vendor/manifest.json` records original file hashes and local adaptation hashes. `scripts/vendor-integrations.mjs` identifies the corresponding supplied source paths. These nine vendor files are required by the real local product; excluding the directory would break those imports and collectors.

## Service integrations and architectural references

- **Langfuse:** ByoSync implements a metadata/hash export adapter using the supplied public service contract. The Langfuse application and separately licensed enterprise directories are not bundled here.
- **Mem0:** ByoSync implements reviewed-memory service requests. A separately deployed Mem0 service and its dependencies are not bundled here.
- **AIOStack:** normalized report/telemetry intake accepts integration data; the upstream observer deployment is not bundled or installed by that adapter.
- **Forge Orchestrator:** architectural reference only; no Forge source was copied. The supplied source review records FSL-1.1-ALv2, not MIT. This notice does not grant rights to that separate repository.

## Existing H2A biometric components

Preserve `h2a-mvp/h2a-mvp/THIRD_PARTY_NOTICES.md`, `public/biometric/MODEL_MANIFEST.json`, and all component licenses under `third_party/`. In particular, the BCH codec source/binaries carry GPL-2.0 notices; do not relabel them MIT or Apache-2.0.

The existing H2A notice identifies the InsightFace weight as non-commercial/research-restricted and the supplied anti-spoofing weight as lacking independently verified redistribution provenance. Those optional `.onnx` weights must remain out of this source publication unless separately reviewed and authorized. Their presence in a local folder does not establish distribution rights. The hospital simulation does not require them.

MediaPipe/ONNX runtime assets and dependencies retain their own package licenses. If copied runtime/model binaries are included in a distribution, review and preserve their exact provenance and required notices. Package-manager dependencies are installed from manifests/lockfiles rather than committing `node_modules` or Python environments.

## Product recognition assets

Local runtime marks and company tool icons are recognition aids. Keep the source records accompanying `public/product-marks/` and the tool-mark asset directory. GitHub, Figma and Salesforce website icons and Microsoft/Google platform marks do not imply endorsement, a product-specific integration, or a verified connection. Trademark/brand permissions are separate from source-code licenses.

This is a component inventory, not a complete legal opinion or a certification that every redistribution right has been cleared. Review the exact files in each release, especially optional biometric assets and GPL-linked components.
