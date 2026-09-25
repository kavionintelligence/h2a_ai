"""Authorization, redaction, and a bounded outbound HTTP trust boundary."""

from __future__ import annotations

import hmac
import ipaddress
import json as jsonlib
import re
import socket
import time
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import httpx

from .config import Settings


class IntegrationError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class StaticTokenAuthenticator:
    """Replace this boundary with OIDC validation without changing API handlers."""

    def __init__(self, settings: Settings):
        self.tokens = {
            "admin": settings.admin_token,
            "reader": settings.reader_token,
            "ingest": settings.ingest_token,
        }

    def authenticate(self, authorization: str | None) -> str | None:
        if not authorization or not authorization.startswith("Bearer "):
            return None
        supplied = authorization[7:]
        for role, token in self.tokens.items():
            if token and hmac.compare_digest(supplied.encode(), token.encode()):
                return role
        return None


SENSITIVE_KEY = re.compile(
    r"secret|password|token|authorization|api.?key|credential|prompt|completion|content|command|cmdline|environment_variables",
    re.I,
)
SECRET_PATTERN = re.compile(
    r"(?i)(bearer\s+\S+|(?:sk-|AKIA)[a-z0-9_-]{12,}|(?:password|api[_-]?key|token|secret)\s*[:=]\s*[^\s,;]+)"
)
SAFE_METADATA = {
    "protocol_version",
    "protocol_binding",
    "kubernetes_kind",
    "resource_uid",
    "mcp_servers",
    "a2a_agents",
    "parent_service",
    "api_routes",
    "llm_provider",
    "framework",
    "origin",
    "language",
    "repository",
    "image",
    "pid",
    "registered_name",
    "llm_location",
    "mcp_server",
    "gen_ai.provider.name",
    "service.instance.id",
    "k8s.pod.name",
    "k8s.serviceaccount.name",
    "gen_ai.agent.id",
    "gen_ai.agent.name",
}


def redact(value: Any, secrets: tuple[str, ...] = ()) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[REDACTED]" if SENSITIVE_KEY.search(k) else redact(v, secrets))
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [redact(v, secrets) for v in value]
    if isinstance(value, str):
        for secret in secrets:
            if secret:
                value = value.replace(secret, "[REDACTED]")
        return SECRET_PATTERN.sub("[REDACTED]", value)
    return value


def safe_metadata(value: dict[str, Any]) -> dict[str, Any]:
    return {k: redact(v) for k, v in value.items() if k in SAFE_METADATA}


def origin(url: str) -> str:
    try:
        p = urlsplit(url)
        port = p.port or (443 if p.scheme == "https" else 80)
        host = (p.hostname or "").lower().rstrip(".")
        if (
            not host
            or p.scheme not in {"http", "https"}
            or p.username
            or p.password
            or p.query
            or p.fragment
        ):
            raise ValueError
        display_host = f"[{host}]" if ":" in host else host
        return f"{p.scheme}://{display_host}:{port}"
    except ValueError as exc:
        raise IntegrationError("invalid_endpoint", "Endpoint is not a permitted HTTP URL") from exc


class SafeHTTP:
    """Exact-origin allowlist + IP validation + DNS pinning for each connection.

    Retries only read operations explicitly flagged retry=True. No inherited proxy,
    credentials, redirects, insecure TLS, unbounded reads or task POST retries.
    """

    def __init__(self, settings: Settings):
        self.settings = settings
        self.allowed = {origin(x) for x in settings.allowed_origins}
        self.blocked = {host.lower().rstrip(".") for host in settings.blocked_hosts}

    def validate(self, url: str) -> tuple[str, str]:
        p = urlsplit(url)
        normalized = origin(url)
        host = (p.hostname or "").lower().rstrip(".")
        if host in self.blocked or normalized not in self.allowed:
            raise IntegrationError(
                "endpoint_denied", "Endpoint origin is not allowed or host is blocked"
            )
        if p.scheme == "http" and not self.settings.allow_http:
            raise IntegrationError("tls_required", "HTTPS is required by outbound policy")
        try:
            entries = socket.getaddrinfo(
                host, p.port or (443 if p.scheme == "https" else 80), type=socket.SOCK_STREAM
            )
            addresses = sorted({str(entry[4][0]) for entry in entries})
        except OSError as exc:
            raise IntegrationError("dns_failed", "Endpoint DNS lookup failed") from exc
        if not addresses:
            raise IntegrationError("dns_failed", "Endpoint DNS returned no address")
        for address in addresses:
            ip = ipaddress.ip_address(address)
            if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
                ip = ip.ipv4_mapped
            if (
                ip.is_unspecified
                or ip.is_multicast
                or (not ip.is_global and not self.settings.allow_private)
            ):
                raise IntegrationError(
                    "address_denied", "Resolved address is prohibited by outbound policy"
                )
            # Link-local metadata endpoints are never allowed, even for a local demo.
            if ip.is_link_local:
                raise IntegrationError("address_denied", "Link-local addresses are prohibited")
        return host, addresses[0]

    def request(
        self,
        method: str,
        url: str,
        *,
        json: Any = None,
        headers: dict[str, str] | None = None,
        retry: bool = False,
    ) -> Any:
        method = method.upper()
        attempts = 3 if retry and method in {"GET", "HEAD"} else 1
        for attempt in range(attempts):
            host, address = self.validate(url)
            p = urlsplit(url)
            netloc = f"[{address}]" if ":" in address else address
            if p.port:
                netloc += f":{p.port}"
            pinned_url = urlunsplit((p.scheme, netloc, p.path or "/", "", ""))
            request_headers = {"Accept": "application/json", "Host": p.netloc}
            if headers:
                if any(
                    k.lower() in {"authorization", "cookie", "host", "proxy-authorization"}
                    for k in headers
                ):
                    raise IntegrationError(
                        "credential_forwarding_denied",
                        "Outbound credentials require a dedicated credential adapter",
                    )
                request_headers.update(headers)
            try:
                with httpx.Client(
                    timeout=self.settings.timeout_seconds,
                    follow_redirects=False,
                    trust_env=False,
                    verify=True,
                ) as client:
                    with client.stream(
                        method,
                        pinned_url,
                        json=json,
                        headers=request_headers,
                        extensions={"sni_hostname": host},
                    ) as response:
                        if response.status_code >= 500 and attempt + 1 < attempts:
                            time.sleep(0.1 * 2**attempt)
                            continue
                        if not 200 <= response.status_code < 300:
                            raise IntegrationError(
                                "upstream_http_error",
                                f"Upstream returned HTTP {response.status_code}",
                            )
                        if response.status_code in {202, 204}:
                            return {}
                        if "text/event-stream" in response.headers.get("content-type", "").lower():
                            raise IntegrationError(
                                "unsupported_stream", "This profile accepts JSON responses, not SSE"
                            )
                        data = bytearray()
                        for chunk in response.iter_bytes():
                            data.extend(chunk)
                            if len(data) > self.settings.max_body_bytes:
                                raise IntegrationError(
                                    "response_too_large",
                                    "Upstream response exceeded configured byte limit",
                                )
                        if not data:
                            return {}
                        payload = jsonlib.loads(data)
                        if not isinstance(payload, (dict, list)):
                            raise IntegrationError(
                                "invalid_response", "Expected a JSON object or array"
                            )
                        return payload
            except (httpx.HTTPError, OSError) as exc:
                if attempt + 1 < attempts:
                    time.sleep(0.1 * 2**attempt)
                    continue
                raise IntegrationError(
                    "transport_failed", "Upstream request failed or timed out"
                ) from exc
            except (ValueError, UnicodeError) as exc:
                raise IntegrationError(
                    "invalid_response", "Upstream returned malformed JSON"
                ) from exc
        raise IntegrationError("transport_failed", "Read retries exhausted")
