"""Pure deterministic secret redaction.

This module intentionally has no provider, HTTP, or detection-engine imports.  It is
the only code that can construct a ``RedactedPrompt`` for outbound AI requests.
"""
from __future__ import annotations

from dataclasses import dataclass
import hashlib
import logging
import math
import re
from typing import Any, Iterable, Mapping, Sequence


MASK_WIDTH = 16
ENTROPY_THRESHOLD = 3.0
_FACTORY_TOKEN = object()
logger = logging.getLogger(__name__)

# The value capture is deliberately conservative: it requires a security-relevant key
# and a sufficiently long, entropy-bearing value. It never calls a model or service.
_SUSPICIOUS_ASSIGNMENT = re.compile(
    r"(?im)\b(?:api[_-]?key|secret|token|password|passwd|connection(?:[_-]?string)?|"
    r"mongodb(?:[_-]?uri)?|webhook|authorization|[a-z][\w-]*(?:api[_-]?key|secret|token|"
    r"password|passwd|connection(?:[_-]?string)?|mongodb(?:[_-]?uri)?|webhook)[\w-]*)"
    r"\b\s*(?:=|:)\s*(?:bearer\s+)?[\"']?"
    r"(?P<value>[^\s\"',;)}\]]{8,})"
)


class RedactionError(ValueError):
    """Raised when secret-shaped text survives the final defensive scan."""


@dataclass(frozen=True, init=False)
class RedactedPrompt:
    """A prompt that passed deterministic redaction immediately before transport."""

    text: str

    def __init__(self, text: str, *, _factory_token: object | None = None) -> None:
        if _factory_token is not _FACTORY_TOKEN:
            raise TypeError("RedactedPrompt values can only be created by redact_for_llm().")
        object.__setattr__(self, "text", text)


def shannon_entropy(value: str) -> float:
    """Return Shannon entropy using only local string operations."""
    if not value:
        return 0.0
    counts: dict[str, int] = {}
    for character in value:
        counts[character] = counts.get(character, 0) + 1
    length = len(value)
    return -sum((count / length) * math.log2(count / length) for count in counts.values())


def mask_secret(value: str) -> str:
    """Preserve four characters on each side and never expose secret length."""
    value = str(value or "")
    if not value:
        return "[REDACTED]"
    if len(value) <= 8:
        return "[REDACTED]"
    return f"{value[:4]}{'*' * MASK_WIDTH}{value[-4:]}"


def _finding_secret(finding: Mapping[str, Any] | Any) -> str:
    if isinstance(finding, Mapping):
        return str(finding.get("raw_secret") or finding.get("raw_value") or "")
    return str(getattr(finding, "raw_secret", "") or getattr(finding, "raw_value", "") or "")


def _replace_known_values(text: str, findings: Iterable[Mapping[str, Any] | Any]) -> str:
    # Longest first avoids partially masking a value that is a prefix of another one.
    values = sorted({_finding_secret(f) for f in findings if _finding_secret(f)}, key=len, reverse=True)
    for value in values:
        text = text.replace(value, mask_secret(value))
    return text


def _secret_shaped_matches(text: str) -> list[re.Match[str]]:
    return [
        match
        for match in _SUSPICIOUS_ASSIGNMENT.finditer(text)
        if "*" not in match.group("value")
        and shannon_entropy(match.group("value")) >= ENTROPY_THRESHOLD
    ]


def _redact_entropy_fallback(text: str) -> str:
    matches = _secret_shaped_matches(text)
    for match in reversed(matches):
        value = match.group("value")
        text = text[:match.start("value")] + mask_secret(value) + text[match.end("value"):]
    return text


def redact(text: str, known_findings: Sequence[Mapping[str, Any] | Any] | None = None) -> str:
    """Mask known values and unknown secret-shaped assignments without network access."""
    source = str(text or "")
    redacted = _replace_known_values(source, known_findings or [])
    return _redact_entropy_fallback(redacted)


def redact_for_llm(text: str, known_findings: Sequence[Mapping[str, Any] | Any] | None = None) -> RedactedPrompt:
    """Create an LLM-safe prompt or block transport if a secret-shaped value remains."""
    redacted = redact(text, known_findings)
    survivors = _secret_shaped_matches(redacted)
    if survivors:
        # Only a digest and character positions are retained for diagnostics; never log
        # the candidate itself, even in an exception message.
        locations = ", ".join(
            f"offset={match.start('value')},sha256={hashlib.sha256(match.group('value').encode()).hexdigest()[:12]}"
            for match in survivors
        )
        logger.critical("Critical redaction failure: secret-shaped payload blocked (%s).", locations)
        raise RedactionError(f"Critical redaction failure: secret-shaped payload blocked ({locations}).")
    return RedactedPrompt(redacted, _factory_token=_FACTORY_TOKEN)
