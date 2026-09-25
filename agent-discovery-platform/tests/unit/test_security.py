import secrets
import socket

import httpx
import pytest

from agent_census.config import Settings
from agent_census.models import Candidate
from agent_census.security import IntegrationError, SafeHTTP, StaticTokenAuthenticator, redact


def settings(**kwargs):
    return Settings(admin_token=secrets.token_urlsafe(32), **kwargs)


def test_distinct_role_authentication_and_fail_closed():
    s = settings(reader_token=secrets.token_urlsafe(32))
    auth = StaticTokenAuthenticator(s)
    assert auth.authenticate("Bearer " + s.admin_token) == "admin"
    assert auth.authenticate("Bearer " + s.reader_token) == "reader"
    assert auth.authenticate("Bearer wrong") is None
    assert auth.authenticate(None) is None
    with pytest.raises(ValueError):
        Settings(admin_token="short")
    with pytest.raises(ValueError):
        Settings(admin_token=s.admin_token, reader_token=s.admin_token)


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "ftp://example.org",
        "https://user:password@example.org",
        "https://example.org?token=private",
        "https://example.org#fragment",
    ],
)
def test_credential_and_non_http_endpoints_rejected(url):
    with pytest.raises(ValueError):
        Candidate(candidate_id="bad", name="bad", source="manual", endpoint=url)


def test_allowlist_blocklist_tls_and_link_local():
    with pytest.raises(IntegrationError, match="origin"):
        SafeHTTP(settings()).validate("https://example.org")
    with pytest.raises(IntegrationError, match="HTTPS"):
        SafeHTTP(settings(allowed_origins=("http://127.0.0.1:8000",), allow_private=True)).validate(
            "http://127.0.0.1:8000/x"
        )
    with pytest.raises(IntegrationError, match="prohibited"):
        SafeHTTP(settings(allowed_origins=("https://127.0.0.1",))).validate("https://127.0.0.1")
    with pytest.raises(IntegrationError, match="Link-local"):
        SafeHTTP(
            settings(
                allowed_origins=("http://169.254.169.254",), allow_private=True, allow_http=True
            )
        ).validate("http://169.254.169.254")
    with pytest.raises(IntegrationError, match="blocked"):
        SafeHTTP(
            settings(allowed_origins=("https://example.org",), blocked_hosts=("example.org",))
        ).validate("https://example.org")


def test_dns_pin_host_and_no_redirect(monkeypatch):
    monkeypatch.setattr(
        socket,
        "getaddrinfo",
        lambda *a, **kw: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))],
    )
    captured = []
    real_client = httpx.Client

    def respond(request):
        captured.append(request)
        return httpx.Response(302, headers={"Location": "http://169.254.169.254/"}, json={})

    monkeypatch.setattr(
        httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    transport = SafeHTTP(settings(allowed_origins=("https://example.org",)))
    with pytest.raises(IntegrationError, match="302"):
        transport.request("GET", "https://example.org/card")
    assert len(captured) == 1
    assert captured[0].url.host == "93.184.216.34"
    assert captured[0].headers["host"] == "example.org"
    assert captured[0].extensions["sni_hostname"] == "example.org"


def test_read_retries_but_task_post_does_not(monkeypatch):
    captured = []
    real_client = httpx.Client

    def respond(request):
        captured.append(request)
        return httpx.Response(503, json={})

    monkeypatch.setattr(
        httpx, "Client", lambda **kw: real_client(transport=httpx.MockTransport(respond), **kw)
    )
    transport = SafeHTTP(
        settings(allowed_origins=("http://127.0.0.1",), allow_http=True, allow_private=True)
    )
    with pytest.raises(IntegrationError):
        transport.request("GET", "http://127.0.0.1", retry=True)
    assert len(captured) == 3
    captured.clear()
    with pytest.raises(IntegrationError):
        transport.request("POST", "http://127.0.0.1", retry=True, json={"task": "mock"})
    assert len(captured) == 1


def test_response_size_and_redaction(monkeypatch):
    real_client = httpx.Client
    monkeypatch.setattr(
        httpx,
        "Client",
        lambda **kw: real_client(
            transport=httpx.MockTransport(
                lambda req: httpx.Response(200, json={"large": "x" * 500})
            ),
            **kw,
        ),
    )
    transport = SafeHTTP(
        settings(
            allowed_origins=("http://127.0.0.1",),
            allow_http=True,
            allow_private=True,
            max_body_bytes=100,
        )
    )
    with pytest.raises(IntegrationError, match="byte limit"):
        transport.request("GET", "http://127.0.0.1")
    token = secrets.token_urlsafe(32)
    cleaned = redact({"password": "secret", "safe": "Bearer abc", "nested": [token]}, (token,))
    assert cleaned == {"password": "[REDACTED]", "safe": "[REDACTED]", "nested": ["[REDACTED]"]}
