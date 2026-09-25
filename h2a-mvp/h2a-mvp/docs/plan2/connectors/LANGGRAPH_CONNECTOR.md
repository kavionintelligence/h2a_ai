# LangGraph Connector

## Boundary

`packages/sdk-python/h2a_sdk/langgraph.py` provides `H2AAuthorityMiddleware`, a real LangChain `AgentMiddleware` suitable for LangGraph-backed agents. It fails closed before model execution when H2A authority is absent or invalid and wraps every tool call with an H2A tool-authorization callback.

Install the optional host dependencies:

```powershell
python -m pip install -r packages/sdk-python/requirements-phase17.txt
```

Construct the middleware with application-owned `verify_authority` and `authorize_tool` callbacks and pass purpose-bound authority in runtime context under `h2a_authority`. Do not place reusable biometric records, provider secrets, or unrestricted organization context in graph state or checkpoints.

The current machine does not have LangGraph installed, so Connector Health reports `dependency-missing`. Python syntax and the fail-closed contract are tested without fabricating a live host result.

