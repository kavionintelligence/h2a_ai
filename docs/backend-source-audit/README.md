# Candidate backend source inventory

This inventory covers every regular file in the seven supplied source trees after excluding generated dependency and build directories (`.git`, `node_modules`, `.venv`, `dist`, `build`, `.next`, `target`, caches and vendored dependencies). It is an audit aid, not a statement that every file is safe or useful to copy.

| Repository | Root | Files | Source | Tests | Deployment | License posture |
|---|---|---:|---:|---:|---:|---|
| langfuse-main | `C:/Users/khatr/Downloads/H2A_mvp/langfuse-main/langfuse-main` | 6433 | 4472 | 791 | 64 | MIT_CORE_WITH_SEPARATE_ENTERPRISE_DIRECTORIES |
| AIOstack-main | `C:/Users/khatr/Downloads/H2A_mvp/AIOstack-main/AIOstack-main` | 162 | 13 | 1 | 49 | APACHE-2.0 |
| Claw-Hunter-main | `C:/Users/khatr/Downloads/H2A_mvp/Claw-Hunter-main/Claw-Hunter-main` | 19 | 2 | 3 | 0 | MIT |
| shadow-ai-guard-main | `C:/Users/khatr/Downloads/H2A_mvp/shadow-ai-guard-main/shadow-ai-guard-main` | 285 | 69 | 79 | 41 | APACHE-2.0_WITH_NOTICE |
| mem0-main | `C:/Users/khatr/Downloads/H2A_mvp/mem0-main/mem0-main` | 1827 | 595 | 323 | 4 | APACHE-2.0 |
| forge-orchestrator-main | `C:/Users/khatr/Downloads/H2A_mvp/forge-orchestrator-main/forge-orchestrator-main` | 146 | 64 | 20 | 0 | FSL-1.1-ALV2_REFERENCE_ONLY_UNTIL_CONVERSION |
| claw-orchestrator-main | `C:/Users/khatr/Downloads/H2A_mvp/claw-orchestrator-main/claw-orchestrator-main` | 256 | 104 | 102 | 0 | MIT |

## Generated outputs

- `FILE_INVENTORY.csv`: path, size, digest, classification, candidate domain and license scope for each retained file.
- `SYMBOL_INDEX.csv`: statically extracted named functions/classes/exports for supported source languages. It is intentionally mechanical and must be validated against the source before reuse.

Generated at 2026-09-24T21:30:30.129Z.
