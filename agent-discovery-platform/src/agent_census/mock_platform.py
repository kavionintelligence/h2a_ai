"""Offline synthetic peers speaking the supported A2A/MCP JSON profiles.

Nothing in this module scans a repository, invokes an LLM, sends mail, or calls
external services. Mock results always carry ``synthetic: true``.
"""

from __future__ import annotations

import socket
import threading
import time
from contextlib import AbstractContextManager
from typing import Any

import uvicorn
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

AGENTS: dict[str, dict[str, Any]] = {
    "security": {
        "name": "Security Agent",
        "skills": ["code_security", "secret_detection", "repository_analysis"],
        "tools": ["secret_scanner", "github.search_code"],
    },
    "research": {
        "name": "Research Agent",
        "skills": ["literature_search", "paper_analysis"],
        "tools": ["paper_search", "paper_reader"],
    },
    "cv": {
        "name": "CV Agent",
        "skills": ["object_detection", "image_classification"],
        "tools": ["image_classifier"],
    },
    "coordinator": {
        "name": "Coordinator Agent",
        "skills": ["repository_analysis"],
        "tools": ["github.search_code"],
    },
    "child": {
        "name": "Dynamic Review Subagent",
        "skills": ["code_security"],
        "tools": ["secret_scanner"],
    },
}


def agent_card(base_url: str, key: str) -> dict[str, Any]:
    spec = AGENTS[key]
    return {
        "protocolVersion": "0.3.0",
        "name": spec["name"],
        "description": "Synthetic offline agent; no real analysis is performed.",
        "url": f"{base_url}/{key}",
        "version": "1.0.0",
        "provider": {"organization": "Synthetic Demo", "url": "https://example.invalid"},
        "preferredTransport": "JSONRPC",
        "capabilities": {"streaming": False, "pushNotifications": False},
        "defaultInputModes": ["text/plain"],
        "defaultOutputModes": ["text/plain"],
        "skills": [
            {"id": skill, "name": skill, "description": f"Synthetic {skill}", "tags": [skill]}
            for skill in spec["skills"]
        ],
    }


def create_mock_app() -> FastAPI:
    app = FastAPI(title="Agent Census offline synthetic platform")
    app.state.calls = []

    @app.get("/health")
    def health() -> dict[str, Any]:
        return {"status": "ok", "synthetic": True}

    @app.get("/{key}/.well-known/agent-card.json")
    def card(key: str, request: Request) -> Any:
        if key not in AGENTS:
            return JSONResponse({"error": "unknown mock peer"}, status_code=404)
        return agent_card(str(request.base_url).rstrip("/"), key)

    @app.get("/{key}")
    @app.get("/{key}/health")
    def peer_health(key: str) -> dict[str, Any]:
        return {"status": "ok", "peer": key, "synthetic": True}

    @app.post("/mcp")
    async def mcp(request: Request) -> Response:
        body = await request.json()
        method = body.get("method")
        request_id = body.get("id")
        app.state.calls.append({"protocol": "mcp", "method": method})
        if method == "notifications/initialized":
            return Response(status_code=202)
        result: dict[str, Any]
        if method == "initialize":
            result = {
                "protocolVersion": "2025-11-25",
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": "Synthetic MCP Tool Server", "version": "1.0.0"},
            }
        elif method == "tools/list":
            result = {
                "tools": [
                    {
                        "name": "secret_scanner",
                        "description": "Returns a synthetic fixture; never reads actual source files.",
                        "inputSchema": {
                            "type": "object",
                            "properties": {"task": {"type": "string"}},
                        },
                    }
                ]
            }
        elif method == "tools/call":
            result = {
                "content": [
                    {
                        "type": "text",
                        "text": "SYNTHETIC: fixture scan completed; zero real files inspected.",
                    }
                ],
                "isError": False,
            }
        else:
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": request_id,
                    "error": {"code": -32601, "message": "unsupported mock method"},
                }
            )
        return JSONResponse({"jsonrpc": "2.0", "id": request_id, "result": result})

    @app.post("/http")
    async def http_agent(request: Request) -> dict[str, Any]:
        body = await request.json()
        app.state.calls.append({"protocol": "http", "method": "POST"})
        return {
            "synthetic": True,
            "result": "Synthetic HTTP task complete",
            "task": body.get("task"),
        }

    @app.post("/{key}")
    async def a2a(key: str, request: Request) -> Any:
        body = await request.json()
        if key not in AGENTS:
            return JSONResponse({"error": "unknown mock peer"}, status_code=404)
        app.state.calls.append({"protocol": "a2a", "method": body.get("method"), "peer": key})
        if body.get("method") != "message/send":
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "error": {"code": -32601, "message": "unsupported mock method"},
                }
            )
        return {
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "result": {
                "kind": "message",
                "role": "agent",
                "messageId": f"synthetic-{key}-reply",
                "parts": [
                    {
                        "kind": "text",
                        "text": f"SYNTHETIC: {AGENTS[key]['name']} completed fixture task.",
                    }
                ],
                "metadata": {"synthetic": True},
            },
        }

    return app


class MockPlatform(AbstractContextManager["MockPlatform"]):
    """A real loopback HTTP server on an OS-selected port, with bounded cleanup."""

    def __init__(self) -> None:
        self.app = create_mock_app()
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.socket.bind(("127.0.0.1", 0))
        self.socket.listen(128)
        self.base_url = f"http://127.0.0.1:{self.socket.getsockname()[1]}"
        config = uvicorn.Config(self.app, log_level="error", access_log=False)
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(
            target=self.server.run, kwargs={"sockets": [self.socket]}, daemon=True
        )

    def __enter__(self) -> MockPlatform:
        self.thread.start()
        deadline = time.monotonic() + 10
        while not self.server.started:
            if not self.thread.is_alive() or time.monotonic() > deadline:
                self.__exit__(None, None, None)
                raise RuntimeError("offline mock platform did not start")
            time.sleep(0.01)
        return self

    def __exit__(self, *_: Any) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)
        self.socket.close()
        if self.thread.is_alive():
            raise RuntimeError("offline mock platform did not stop")
