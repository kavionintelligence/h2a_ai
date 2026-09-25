"""Real, bounded local MCP tools and an ordinary arithmetic HTTP service.

These peers do actual filesystem reads, report writes, and arithmetic. They never
produce LLM responses, Census events, classifications, or registry records.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import threading
import time
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field

from agent_census.discovery import MCP_VERSION

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "repository_analysis",
        "description": (
            "Inspect actual project files. First use inventory with an empty path to see "
            "permitted Python modules and pyproject.toml, then read a listed path. Reads "
            "return at most 3000 characters plus truncation status, actual metadata and SHA-256."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "operation": {"type": "string", "enum": ["inventory", "read"]},
                "path": {
                    "type": "string",
                    "description": "Empty for inventory; an exact inventory path for read.",
                },
            },
            "required": ["operation", "path"],
            "additionalProperties": False,
        },
    },
    {
        "name": "write_report",
        "description": (
            "Save the final analysis as an actual artifact after examining repository "
            "tool results. Use a safe filename ending in .md, .txt, or .json."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "filename": {"type": "string"},
                "content": {"type": "string"},
            },
            "required": ["filename", "content"],
            "additionalProperties": False,
        },
    },
]


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _json_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, ensure_ascii=False).encode("utf-8")


def create_mcp_app(repo_root: Path, output_dir: Path) -> FastAPI:
    """Serve the project's supported sessionless JSON MCP compatibility profile."""
    root = repo_root.resolve(strict=True)
    output = output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    artifacts = output / "artifacts"
    artifacts.mkdir(exist_ok=True)
    if artifacts.resolve() != artifacts:
        raise ValueError("Artifact directory must not be a symlink")
    audit_path = output / "mcp-tool-calls.jsonl"
    if audit_path.is_symlink():
        raise ValueError("MCP audit path must not be a symlink")
    audit_lock = threading.Lock()
    app = FastAPI(title="Real validation repository tools")
    app.state.tool_calls = []

    def inventory() -> dict[str, Path]:
        candidates = list((root / "src" / "agent_census").glob("*.py"))
        candidates.append(root / "pyproject.toml")
        allowed = {}
        for path in candidates:
            resolved = path.resolve()
            if path.is_file() and not path.is_symlink() and resolved.is_relative_to(root):
                allowed[path.relative_to(root).as_posix()] = path
        return dict(sorted(allowed.items()))

    def execute(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        if name == "repository_analysis":
            if set(arguments) != {"operation", "path"}:
                raise ValueError("repository_analysis requires only operation and path")
            operation, path = arguments["operation"], arguments["path"]
            if not isinstance(path, str):
                raise ValueError("path must be a string")
            allowed = inventory()
            if operation == "inventory":
                if path:
                    raise ValueError("inventory requires an empty path")
                return {
                    "operation": operation,
                    "files": [
                        {"path": relative, "bytes": target.stat().st_size}
                        for relative, target in allowed.items()
                    ],
                }
            if operation != "read" or path not in allowed:
                raise ValueError("read requires an exact path from the permitted inventory")
            raw = allowed[path].read_bytes()
            content = raw.decode("utf-8", errors="replace")
            return {
                "operation": operation,
                "path": path,
                "bytes": len(raw),
                "sha256": _sha256(raw),
                "content": content[:3000],
                "truncated": len(content) > 3000,
            }
        if name == "write_report":
            if set(arguments) != {"filename", "content"}:
                raise ValueError("write_report requires only filename and content")
            filename, content = arguments["filename"], arguments["content"]
            if not isinstance(filename, str) or not re.fullmatch(
                r"[A-Za-z0-9][A-Za-z0-9_.-]{0,95}\.(?:md|txt|json)", filename
            ):
                raise ValueError("filename must be a safe .md, .txt, or .json basename")
            if filename.split(".", 1)[0].upper() in {
                "CON",
                "PRN",
                "AUX",
                "NUL",
                *(f"COM{number}" for number in range(1, 10)),
                *(f"LPT{number}" for number in range(1, 10)),
            }:
                raise ValueError("Reserved device names cannot be report filenames")
            if not isinstance(content, str) or not 1 <= len(content) <= 100000:
                raise ValueError("content must contain 1 to 100000 characters")
            target = artifacts / filename
            if target.is_symlink() or target.resolve().parent != artifacts:
                raise ValueError("Report path must remain inside the artifact directory")
            raw = content.encode("utf-8")
            target.write_bytes(raw)
            return {
                "filename": filename,
                "artifact": target.relative_to(output).as_posix(),
                "bytes": len(raw),
                "sha256": _sha256(raw),
                "written": True,
            }
        raise ValueError("Unknown tool")

    def rpc_error(request_id: Any, code: int, message: str) -> JSONResponse:
        return JSONResponse(
            {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}}
        )

    @app.get("/health")
    @app.get("/mcp/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/mcp")
    async def mcp(request: Request) -> Response:
        try:
            body = await request.json()
        except (ValueError, UnicodeError):
            return rpc_error(None, -32700, "Invalid JSON")
        if not isinstance(body, dict) or body.get("jsonrpc") != "2.0":
            return rpc_error(None, -32600, "Expected a JSON-RPC 2.0 request")
        request_id = body.get("id")
        method, params = body.get("method"), body.get("params", {})
        if not isinstance(params, dict):
            return rpc_error(request_id, -32602, "Parameters must be an object")
        if method == "notifications/initialized":
            return Response(status_code=202)
        if request_id is None:
            return rpc_error(None, -32600, "Requests require an ID")
        if method == "initialize":
            result: dict[str, Any] = {
                "protocolVersion": MCP_VERSION,
                "serverInfo": {"name": "real-repository-tools", "version": "1.0.0"},
                "capabilities": {"tools": {}},
            }
        elif method == "tools/list":
            result = {"tools": TOOL_DEFINITIONS}
        elif method == "tools/call":
            name, arguments = params.get("name"), params.get("arguments", {})
            if not isinstance(name, str) or not isinstance(arguments, dict):
                return rpc_error(request_id, -32602, "Tool name and arguments are required")
            started_at = datetime.now(UTC).isoformat()
            started = time.perf_counter()
            try:
                payload = execute(name, arguments)
                is_error = False
            except (ValueError, OSError) as exc:
                # Filesystem error text may contain unrelated paths; expose only its type.
                message = str(exc) if isinstance(exc, ValueError) else type(exc).__name__
                payload = {"error": message}
                is_error = True
            result = {
                "content": [{"type": "text", "text": json.dumps(payload, ensure_ascii=False)}],
                "structuredContent": payload,
                "isError": is_error,
            }
            audit = {
                "request_id": request_id,
                "tool": name,
                "arguments": arguments,
                "started_at": started_at,
                "finished_at": datetime.now(UTC).isoformat(),
                "duration_seconds": round(time.perf_counter() - started, 6),
                "result_sha256": _sha256(_json_bytes(result)),
                "result": payload,
                "is_error": is_error,
            }
            with audit_lock:
                with audit_path.open("a", encoding="utf-8") as log:
                    log.write(json.dumps(audit, ensure_ascii=False) + "\n")
                app.state.tool_calls.append(audit)
        elif method == "ping":
            result = {}
        else:
            return rpc_error(request_id, -32601, "Unknown method")
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result})

    return app


class Calculation(BaseModel):
    model_config = ConfigDict(extra="forbid")
    operation: Literal["add", "subtract", "multiply", "divide"]
    left: float = Field(allow_inf_nan=False)
    right: float = Field(allow_inf_nan=False)


def create_ordinary_app(base_url: str) -> FastAPI:
    """Ordinary API with real arithmetic and factual, live service metadata."""
    app = FastAPI(title="Arithmetic HTTP service")
    app.state.calculations = []

    @app.get("/health")
    @app.get("/calculate/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/service-metadata")
    def metadata() -> dict[str, Any]:
        return {
            "name": "arithmetic-http-service",
            "framework": "FastAPI",
            "version": "1.0.0",
            "description": "HTTP API performing addition, subtraction, multiplication and division.",
            "endpoint": base_url.rstrip("/") + "/calculate",
            "protocols": ["http"],
            "service": "arithmetic-http-service",
            "input_types": ["application/json"],
            "output_types": ["application/json"],
        }

    @app.post("/calculate")
    def calculate(body: Calculation) -> dict[str, Any]:
        if body.operation == "divide" and body.right == 0:
            raise HTTPException(status_code=400, detail="Division by zero")
        operations = {
            "add": lambda: body.left + body.right,
            "subtract": lambda: body.left - body.right,
            "multiply": lambda: body.left * body.right,
            "divide": lambda: body.left / body.right,
        }
        value = operations[body.operation]()
        if not math.isfinite(value):
            raise HTTPException(status_code=400, detail="Result is not finite")
        result = {
            **body.model_dump(),
            "result": value,
            "observed_at": datetime.now(UTC).isoformat(),
        }
        app.state.calculations.append(result)
        return result

    return app
