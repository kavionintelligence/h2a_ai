"""Bounded discovery adapters. Discovery collects evidence and never invokes work."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Any
from urllib.parse import quote

from .models import AdapterResult, Candidate, Evidence, stable_id
from .security import IntegrationError, SafeHTTP

MAX_ITEMS = 1000
MAX_PAGES = 10
MCP_VERSION = "2025-11-25"


def _error(code: str, message: str) -> IntegrationError:
    return IntegrationError(code, message)


def _object(value: Any, label: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise _error("invalid_inventory", f"{label} must be an object")
    return value


def _list(value: Any, label: str, limit: int = MAX_ITEMS) -> list[Any]:
    if not isinstance(value, list) or len(value) > limit:
        raise _error("invalid_inventory", f"{label} must be a list of at most {limit} items")
    return value


def _text(value: Any, label: str, required: bool = True) -> str:
    if not isinstance(value, str) or not value.strip():
        raise _error("invalid_inventory", f"{label} must be nonempty text")
    return value


def _strings(value: Any, label: str) -> list[str]:
    return [_text(x, label, True) for x in _list(value, label, 100)]


def _ev(kind: str, source: str, value: str) -> Evidence:
    return Evidence(kind=kind, source=source, value=value[:500])


def _failure(source: str, index: int, exc: Exception) -> dict[str, str]:
    # Do not include arbitrary upstream bodies, request URLs or user payloads.
    return {
        "source": source,
        "item": str(index),
        "code": str(getattr(exc, "code", "invalid_inventory")),
        "message": "Discovery item could not be imported; check its schema, endpoint and source policy.",
    }


def _candidate(source: str, item: dict[str, Any], evidence_kind: str) -> Candidate:
    allowed = {
        "name",
        "endpoint",
        "provider",
        "framework",
        "model",
        "version",
        "description",
        "skills",
        "tools",
        "protocols",
        "input_types",
        "output_types",
        "owner",
        "environment",
        "auth_type",
        "service",
        "namespace",
        "deployment",
        "service_account",
        "entity_hint",
    }
    fields = {key: item[key] for key in allowed if key in item}
    name = _text(fields.get("name"), "name", True)
    identity = str(item.get("id") or item.get("candidate_id") or fields.get("endpoint") or name)
    return Candidate(
        candidate_id=stable_id(source, identity),
        source=source,
        **fields,
        evidence=[_ev(evidence_kind, source, f"Supplied metadata for {name}")],
    )


class DiscoveryAdapter(ABC):
    name: str

    def discover(self, items: list[dict[str, Any]], transport: SafeHTTP) -> AdapterResult:
        result = AdapterResult()
        for index, item in enumerate(items[:MAX_ITEMS]):
            try:
                for candidate in self._discover(_object(item, "item"), transport):
                    if isinstance(candidate, Exception):
                        result.errors.append(_failure(self.name, index, candidate))
                    else:
                        result.candidates.append(candidate)
            except Exception as exc:
                result.errors.append(_failure(self.name, index, exc))
        if len(items) > MAX_ITEMS:
            result.errors.append(
                {
                    "source": self.name,
                    "item": str(MAX_ITEMS),
                    "code": "item_limit",
                    "message": "Source item limit exceeded",
                }
            )
        return result

    @abstractmethod
    def _discover(
        self, item: dict[str, Any], transport: SafeHTTP
    ) -> Iterable[Candidate | Exception]:
        raise NotImplementedError


class A2AAdapter(DiscoveryAdapter):
    name = "a2a"

    def _discover(self, item: dict[str, Any], transport: SafeHTTP) -> Iterable[Candidate]:
        card = item.get("card")
        if card is None and "url" in item and "skills" not in item:
            card = transport.request("GET", _text(item["url"], "card URL", True), retry=True)
        card = _object(card if card is not None else item, "Agent Card")
        for key in ("name", "description", "version"):
            _text(card.get(key), key, True)
        _object(card.get("capabilities"), "capabilities")
        inputs = _strings(card.get("defaultInputModes"), "defaultInputModes")
        outputs = _strings(card.get("defaultOutputModes"), "defaultOutputModes")
        skills = _list(card.get("skills"), "skills", 100)
        names: list[str] = []
        for skill in skills:
            skill = _object(skill, "skill")
            for key in ("id", "name", "description"):
                _text(skill.get(key), f"skill.{key}", True)
            _strings(skill.get("tags"), "skill.tags")
            names.append(skill["name"])
        interfaces = card.get("supportedInterfaces")
        if interfaces is not None:
            interfaces = _list(interfaces, "supportedInterfaces", 20)
            if not interfaces:
                raise _error("invalid_card", "Card must declare an interface")
            for interface in interfaces:
                interface = _object(interface, "interface")
                for key in ("url", "protocolBinding", "protocolVersion"):
                    _text(interface.get(key), f"interface.{key}", True)
            selected = next(
                (i for i in interfaces if i["protocolBinding"] in {"JSONRPC", "HTTP+JSON"}), None
            )
            # The catalog supports gRPC-only cards as metadata; it cannot route them.
            if selected is None:
                endpoint, version, binding = (
                    None,
                    interfaces[0]["protocolVersion"],
                    interfaces[0]["protocolBinding"],
                )
            else:
                endpoint, version, binding = (
                    selected["url"],
                    selected["protocolVersion"],
                    selected["protocolBinding"],
                )
            tenant = selected.get("tenant") if selected else None
        else:
            endpoint = _text(card.get("url"), "url", True)
            version = _text(card.get("protocolVersion"), "protocolVersion", True)
            binding = card.get("preferredTransport", "JSONRPC")
            tenant = None
        provider = card.get("provider") or {}
        auth = "declared" if card.get("security") or card.get("securityRequirements") else None
        evidence = [
            _ev(
                "agent_card",
                self.name,
                "Validated declared A2A card; identity and skills unverified",
            ),
            _ev("protocol_version", self.name, version),
            _ev("protocol_binding", self.name, binding),
        ]
        if tenant:
            evidence.append(_ev("protocol_tenant", self.name, str(tenant)))
        yield Candidate(
            candidate_id=stable_id(self.name, endpoint or str(item.get("url") or card["name"])),
            name=card["name"],
            source=self.name,
            endpoint=endpoint,
            description=card["description"],
            version=card["version"],
            provider=provider.get("organization") if isinstance(provider, dict) else None,
            skills=names,
            protocols=["a2a"],
            input_types=inputs,
            output_types=outputs,
            auth_type=auth,
            entity_hint="a2a_agent",
            evidence=evidence,
            metadata={
                "card_version": version,
                "binding": binding,
                "signature_present": bool(card.get("signatures")),
                "signature_verified": False,
                "extended_card_advertised": bool(
                    card["capabilities"].get("extendedAgentCard")
                    or card.get("supportsAuthenticatedExtendedCard")
                ),
            },
        )


def mcp_rpc(
    transport: SafeHTTP,
    endpoint: str,
    method: str,
    params: dict[str, Any],
    request_id: int | None = 1,
) -> dict[str, Any]:
    payload: dict[str, Any] = {"jsonrpc": "2.0", "method": method, "params": params}
    if request_id is not None:
        payload["id"] = request_id
    body = transport.request(
        "POST",
        endpoint,
        json=payload,
        headers={
            "Accept": "application/json, text/event-stream",
            "MCP-Protocol-Version": MCP_VERSION,
        },
        retry=False,
    )
    if request_id is None:
        return {}
    body = _object(body, "MCP response")
    if body.get("jsonrpc") != "2.0" or body.get("id") != request_id:
        raise _error("invalid_rpc", "MCP response envelope mismatch")
    if "error" in body:
        raise _error("upstream_rpc_error", "MCP server returned a protocol error")
    return _object(body.get("result"), "MCP result")


def mcp_initialize(transport: SafeHTTP, endpoint: str) -> dict[str, Any]:
    result = mcp_rpc(
        transport,
        endpoint,
        "initialize",
        {
            "protocolVersion": MCP_VERSION,
            "capabilities": {},
            "clientInfo": {"name": "agent-census", "version": "0.1.0"},
        },
        1,
    )
    if result.get("protocolVersion") != MCP_VERSION:
        raise _error(
            "unsupported_protocol", "Only MCP 2025-11-25 sessionless JSON discovery is supported"
        )
    server = _object(result.get("serverInfo"), "serverInfo")
    _text(server.get("name"), "serverInfo.name", True)
    _text(server.get("version"), "serverInfo.version", True)
    _object(result.get("capabilities"), "capabilities")
    mcp_rpc(transport, endpoint, "notifications/initialized", {}, None)
    return result


def mcp_tools(transport: SafeHTTP, endpoint: str) -> list[dict[str, Any]]:
    tools: list[dict[str, Any]] = []
    cursor: str | None = None
    seen: set[str] = set()
    for page in range(MAX_PAGES):
        result = mcp_rpc(
            transport, endpoint, "tools/list", {"cursor": cursor} if cursor else {}, 2 + page
        )
        tools.extend(_list(result.get("tools"), "tools", 100))
        if len(tools) > 100:
            raise _error("tool_limit", "Inventory exceeds 100 tools")
        cursor = result.get("nextCursor")
        if not cursor:
            return tools
        if not isinstance(cursor, str) or cursor in seen:
            raise _error("invalid_cursor", "Invalid or repeated MCP pagination cursor")
        seen.add(cursor)
    raise _error("page_limit", "MCP pagination limit exceeded")


class MCPAdapter(DiscoveryAdapter):
    name = "mcp"

    def _discover(self, item: dict[str, Any], transport: SafeHTTP) -> Iterable[Candidate]:
        inventory = item.get("inventory")
        endpoint = item.get("url") or item.get("endpoint")
        if inventory is None:
            endpoint = _text(endpoint, "MCP endpoint", True)
            inventory = mcp_initialize(transport, endpoint)
            if "tools" not in inventory["capabilities"]:
                raise _error("unsupported_capability", "MCP server does not advertise tools")
            inventory["tools"] = mcp_tools(transport, endpoint)
        inventory = _object(inventory, "MCP inventory")
        server = _object(inventory.get("serverInfo"), "serverInfo")
        name = _text(server.get("name"), "serverInfo.name", True)
        version = _text(inventory.get("protocolVersion", MCP_VERSION), "protocolVersion", True)
        tools = _list(inventory.get("tools"), "tools", 100)
        names: list[str] = []
        schemas: dict[str, Any] = {}
        for tool in tools:
            tool = _object(tool, "tool")
            tool_name = _text(tool.get("name"), "tool.name", True)
            if tool_name in names:
                raise _error("duplicate_tool", "Duplicate tool name")
            schema = _object(tool.get("inputSchema"), "tool.inputSchema")
            names.append(tool_name)
            schemas[tool_name] = {"inputSchema": schema}
            if "outputSchema" in tool:
                schemas[tool_name]["outputSchema"] = _object(
                    tool["outputSchema"], "tool.outputSchema"
                )
        yield Candidate(
            candidate_id=stable_id(self.name, endpoint or name),
            name=name,
            source=self.name,
            endpoint=endpoint,
            version=server.get("version"),
            protocols=["mcp"],
            tools=names,
            entity_hint="mcp_server",
            metadata={"tool_schemas": schemas},
            evidence=[
                _ev(
                    "mcp_inventory",
                    self.name,
                    "Declared tools; tool server alone is not agent evidence",
                ),
                _ev("protocol_version", self.name, version),
            ],
        )


class KubernetesAdapter(DiscoveryAdapter):
    name = "kubernetes"
    kinds = {"Pod", "Deployment", "Service", "Ingress", "ServiceAccount"}

    def _discover(
        self, item: dict[str, Any], transport: SafeHTTP
    ) -> Iterable[Candidate | Exception]:
        if "api_url" in item:
            base = _text(item["api_url"], "api_url", True).rstrip("/")
            namespace = quote(_text(item.get("namespace", "default"), "namespace", True), safe="")
            paths = [
                ("Pod", f"/api/v1/namespaces/{namespace}/pods"),
                ("Deployment", f"/apis/apps/v1/namespaces/{namespace}/deployments"),
                ("Service", f"/api/v1/namespaces/{namespace}/services"),
                ("Ingress", f"/apis/networking.k8s.io/v1/namespaces/{namespace}/ingresses"),
                ("ServiceAccount", f"/api/v1/namespaces/{namespace}/serviceaccounts"),
            ]
            requested = item.get("kinds", [kind for kind, _ in paths])
            for kind, path in paths:
                if kind not in requested:
                    continue
                try:
                    body = transport.request("GET", base + path, retry=True)
                    if body.get("metadata", {}).get("continue"):
                        raise _error(
                            "partial_inventory",
                            "Paginated Kubernetes response requires a supplied complete snapshot",
                        )
                    for obj in _list(body.get("items"), "Kubernetes items"):
                        try:
                            obj = _object(obj, "Kubernetes object")
                            yield self.parse({**obj, "kind": obj.get("kind", kind)})
                        except Exception as exc:
                            yield exc
                except Exception as exc:
                    yield exc
        else:
            for obj in _list(item.get("items", [item]), "Kubernetes items"):
                try:
                    yield self.parse(_object(obj, "Kubernetes object"))
                except Exception as exc:
                    yield exc

    def parse(self, obj: dict[str, Any]) -> Candidate:
        kind = obj.get("kind")
        if kind not in self.kinds:
            raise _error(
                "unsupported_resource",
                "Only Pod, Deployment, Service, Ingress and ServiceAccount metadata are imported",
            )
        meta = _object(obj.get("metadata"), "metadata")
        annotations = _object(meta.get("annotations", {}), "annotations")
        labels = _object(meta.get("labels", {}), "labels")
        name = _text(meta.get("name"), "metadata.name", True)
        namespace = meta.get("namespace", "default")
        prefix = "agent-census.io/"
        protocol = annotations.get(prefix + "protocol")
        source_id = str(meta.get("uid") or f"{namespace}/{kind}/{name}")
        spec = obj.get("spec") or {}
        if kind == "Deployment":
            spec = spec.get("template", {}).get("spec", {})
        service_account = name if kind == "ServiceAccount" else spec.get("serviceAccountName")
        return Candidate(
            candidate_id=stable_id(self.name, source_id),
            name=annotations.get(prefix + "name", name),
            source=self.name,
            endpoint=annotations.get(prefix + "endpoint"),
            framework=annotations.get(prefix + "framework"),
            owner=annotations.get(prefix + "owner"),
            service=labels.get("app.kubernetes.io/name", name),
            namespace=namespace,
            deployment=name if kind == "Deployment" else annotations.get(prefix + "deployment"),
            service_account=service_account,
            protocols=[protocol] if protocol else [],
            entity_hint=str(kind).lower(),
            metadata={
                "resource_kind": kind,
                "resource_uid": meta.get("uid"),
                "resource_version": meta.get("resourceVersion"),
            },
            evidence=[
                _ev("kubernetes_metadata", self.name, f"{namespace}/{kind}/{name}; metadata only")
            ],
        )


class DockerAdapter(DiscoveryAdapter):
    name = "docker"

    def _discover(
        self, item: dict[str, Any], transport: SafeHTTP
    ) -> Iterable[Candidate | Exception]:
        if "api_url" in item:
            body = transport.request(
                "GET",
                _text(item["api_url"], "api_url", True).rstrip("/") + "/containers/json",
                retry=True,
            )
            # SafeHTTP is object-oriented; an authenticated proxy may wrap Docker's array.
            containers = body if isinstance(body, list) else body.get("containers")
        else:
            containers = item.get("containers", [item])
        for container in _list(containers, "containers"):
            try:
                yield self.parse(_object(container, "container"))
            except Exception as exc:
                yield exc

    def parse(self, container: dict[str, Any]) -> Candidate:
        labels = _object(container.get("Labels", {}), "Labels")
        names = container.get("Names") or [container.get("name") or container.get("Id")]
        name = _text(names[0], "container name", True).lstrip("/")
        protocol = labels.get("agent-census.protocol")
        return Candidate(
            candidate_id=stable_id(self.name, str(container.get("Id") or name)),
            name=labels.get("agent-census.name", name),
            source=self.name,
            endpoint=labels.get("agent-census.endpoint"),
            framework=labels.get("agent-census.framework"),
            owner=labels.get("agent-census.owner"),
            service=labels.get("com.docker.compose.service", name),
            protocols=[protocol] if protocol else [],
            entity_hint="container",
            metadata={"container_id": container.get("Id"), "state": container.get("State")},
            evidence=[
                _ev(
                    "docker_metadata",
                    self.name,
                    "Container labels and state; no command or environment imported",
                )
            ],
        )


class APIRegistryAdapter(DiscoveryAdapter):
    name = "api_registry"

    def _discover(
        self, item: dict[str, Any], transport: SafeHTTP
    ) -> Iterable[Candidate | Exception]:
        body = transport.request("GET", item["url"], retry=True) if "url" in item else item
        entries = body.get("entries", body.get("servers", [body]))
        for entry in _list(entries, "registry entries"):
            try:
                entry = _object(entry, "registry entry")
                if "server" in entry:
                    server = _object(entry["server"], "server")
                    remotes = server.get("remotes") or []
                    entry = {
                        "id": server.get("name"),
                        "name": server.get("name"),
                        "description": server.get("description"),
                        "version": server.get("version"),
                        "endpoint": remotes[0].get("url") if remotes else None,
                        "protocols": ["mcp"],
                        "entity_hint": "mcp_server",
                    }
                yield _candidate(self.name, entry, "api_registry")
            except Exception as exc:
                yield exc


class GitManifestAdapter(DiscoveryAdapter):
    name = "git"

    def _discover(self, item: dict[str, Any], transport: SafeHTTP) -> Iterable[Candidate]:
        if any(key in item for key in ("path", "file", "command", "clone_url")):
            raise _error(
                "unsafe_source",
                "Only an inline manifest is accepted; filesystem and clone operations are disabled",
            )
        manifest = _object(item.get("manifest"), "manifest")
        yield _candidate(self.name, manifest, "git_manifest")


class LocalProcessAdapter(DiscoveryAdapter):
    name = "local_process"

    def _discover(self, item: dict[str, Any], transport: SafeHTTP) -> Iterable[Candidate]:
        # Only supplied metadata; deliberately no psutil/process scans or command lines.
        candidate = _candidate(self.name, item, "process_metadata")
        candidate.entity_hint = "process"
        yield candidate


class ManualAdapter(DiscoveryAdapter):
    name = "manual"

    def _discover(self, item: dict[str, Any], transport: SafeHTTP) -> Iterable[Candidate]:
        # registration_id, trust assertions and arbitrary evidence are intentionally ignored.
        yield _candidate(self.name, item, "manual_claim")


ADAPTERS: dict[str, DiscoveryAdapter] = {
    adapter.name: adapter
    for adapter in (
        A2AAdapter(),
        MCPAdapter(),
        KubernetesAdapter(),
        DockerAdapter(),
        APIRegistryAdapter(),
        GitManifestAdapter(),
        LocalProcessAdapter(),
        ManualAdapter(),
    )
}


def run_adapters(sources: dict[str, list[dict[str, Any]]], transport: SafeHTTP) -> AdapterResult:
    result = AdapterResult()
    for name, items in sources.items():
        adapter = ADAPTERS.get(name)
        if adapter is None:
            result.errors.append(
                {
                    "source": name,
                    "item": "",
                    "code": "unknown_source",
                    "message": "Unknown discovery source",
                }
            )
            continue
        if not isinstance(items, list):
            result.errors.append(
                {
                    "source": name,
                    "item": "",
                    "code": "invalid_inventory",
                    "message": "Source must contain a list",
                }
            )
            continue
        partial = adapter.discover(items, transport)
        result.candidates.extend(partial.candidates)
        result.errors.extend(partial.errors)
    return result
