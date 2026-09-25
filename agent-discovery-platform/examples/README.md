# Synthetic examples

These files describe fictitious entities. The `127.0.0.1:8766` origin is a placeholder for a local mock platform. No external host, model account, token, or repository is required by the demo.

`python scripts/demo.py` creates the same scenario with a fresh loopback port and current timestamps. It is the supported one-command replay. Static runtime fixtures preserve a fixed timestamp for review; replace timestamps before ingesting them into a running server because old evidence is deliberately excluded by the runtime time window.

* `agent_cards/`: A2A 0.3 cards with declared skills. A card alone is not proof of autonomous behavior.
* `agents/registered-agents.json`: four operator registrations, with no trust approval embedded.
* `services/discovery.json`: A2A and Kubernetes duplicate observations, an ordinary API, a fixed workflow, an LLM wrapper, and MCP metadata discovery.
* `services/mcp-inventory.json`: an MCP tool-server example; the tool server is deliberately not an agent.
* `services/subagent-creation.json`: explicit synthetic creation metadata for the transient child. Dynamic creation is a declared subtype, not an inference from delegation alone.
* `shadow_agent/runtime-events.json`: positive behavior, delegation to a transient child, and negative controls. Both the child and unknown shadow service remain unregistered.
* `ground-truth.json`: independent fixture labels used to measure precision, recall, false positives, duplicate merges and inferred capabilities.

Mock outputs are explicitly marked synthetic. A `secret_scanner` tool name is evidence for a capability mapping, but the mock never reads source files or secrets.
