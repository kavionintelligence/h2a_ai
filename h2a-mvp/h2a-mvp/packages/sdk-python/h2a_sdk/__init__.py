"""H2A connector protocol helpers for Python agents.

Signature operations are dependency-injected so deployments can use an approved
Ed25519 implementation, HSM, KMS, or platform cryptography provider.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Callable


def canonicalize(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def hash_canonical(value: Any) -> str:
    return "sha256:" + hashlib.sha256(canonicalize(value).encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class VerificationResult:
    valid: bool
    reason: str


def verify_frame(frame: dict[str, Any], verifier: Callable[[bytes, str], bool]) -> VerificationResult:
    required = {"protocol_version", "kind", "task_id", "trace_id", "sequence", "idempotency_key", "payload", "payload_hash", "expires_at", "sender_signature"}
    if not required.issubset(frame):
        return VerificationResult(False, "FRAME_FIELDS_MISSING")
    if frame["protocol_version"] != "1.0" or hash_canonical(frame["payload"]) != frame["payload_hash"]:
        return VerificationResult(False, "FRAME_INTEGRITY_INVALID")
    expires = datetime.fromisoformat(str(frame["expires_at"]).replace("Z", "+00:00"))
    if expires <= datetime.now(timezone.utc):
        return VerificationResult(False, "FRAME_EXPIRED")
    unsigned = {key: value for key, value in frame.items() if key != "sender_signature"}
    if not verifier(canonicalize(unsigned).encode("utf-8"), str(frame["sender_signature"])):
        return VerificationResult(False, "FRAME_SIGNATURE_INVALID")
    return VerificationResult(True, "VERIFIED")


class IdempotencyStore:
    def __init__(self) -> None:
        self._results: dict[str, dict[str, Any]] = {}

    def get(self, key: str) -> dict[str, Any] | None:
        return self._results.get(key)

    def remember(self, key: str, result: dict[str, Any]) -> None:
        self._results[key] = result

