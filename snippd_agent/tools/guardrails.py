"""Shared hardening decorators for ADK tool functions.

Closes audit risks R3, R4, R5 from PR #1:

- R3  Tool-call timeouts       →  ``with_timeout``
- R4  Input/schema validation  →  ``validate_with`` + helpers in this module
- R5  In-process rate limiting →  ``with_rate_limit``

Plus a single composite decorator ``hardened_tool`` that applies all three
plus Sentry tracing, so each tool definition stays a one-liner:

    from tools.guardrails import hardened_tool

    @hardened_tool(timeout_s=10, rate_calls=30, rate_per_s=60)
    def query_stack_candidates(limit: int = 200) -> str:
        ...

Contract: every wrapped tool still returns a JSON string — timeouts,
rate-limits, and validation errors all surface as
``{"ok": false, "error": ..., "reason_code": ...}`` envelopes so the
LLM (and the frontend) get consistent, parseable failures.
"""

from __future__ import annotations

import functools
import json
import logging
import re
import threading
import time
from collections import deque
from typing import Any, Callable, Iterable, Optional

from tools.sentry_hook import sentry_traced_tool

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# R3: Timeout
# ----------------------------------------------------------------------

def with_timeout(seconds: float) -> Callable[[Callable[..., str]], Callable[..., str]]:
    """Abort a tool call after ``seconds`` elapsed; return a JSON error envelope.

    Uses a worker thread because ``signal.alarm`` is POSIX-only and we
    need Windows + Cloud Run compatibility. The underlying work thread is
    not forcibly killed (Python has no safe thread kill); we just stop
    waiting on it. Callers should design tools to bound their own I/O
    (httpx/supabase-py timeouts) so abandoned threads terminate soon.
    """

    def deco(fn: Callable[..., str]) -> Callable[..., str]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            result_box: dict[str, Any] = {}

            def runner() -> None:
                try:
                    result_box["result"] = fn(*args, **kwargs)
                except BaseException as exc:  # noqa: BLE001
                    result_box["exc"] = exc

            t = threading.Thread(
                target=runner,
                name=f"snippd-tool[{fn.__name__}]",
                daemon=True,
            )
            t.start()
            t.join(seconds)
            if t.is_alive():
                logger.warning("tool %s exceeded %.1fs — returning timeout", fn.__name__, seconds)
                return json.dumps(
                    {
                        "ok": False,
                        "error": f"tool '{fn.__name__}' exceeded {seconds:.1f}s",
                        "reason_code": "timeout",
                    }
                )
            if "exc" in result_box:
                raise result_box["exc"]  # let the next decorator (Sentry) catch it
            return result_box.get("result", "null")

        return wrapper

    return deco


# ----------------------------------------------------------------------
# R5: Rate limit (per-process, per-tool, sliding window)
# ----------------------------------------------------------------------

_RATE_LOCK = threading.Lock()
_RATE_WINDOWS: dict[str, deque[float]] = {}


def with_rate_limit(
    calls: int,
    per_seconds: float,
    scope_key: Optional[Callable[..., str]] = None,
) -> Callable[[Callable[..., str]], Callable[..., str]]:
    """Allow at most ``calls`` invocations per ``per_seconds`` window.

    Scope defaults to tool name; pass ``scope_key=lambda *a, **kw: ...``
    to bucket per (tool, tenant) or similar.
    """

    def deco(fn: Callable[..., str]) -> Callable[..., str]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            key = (
                scope_key(*args, **kwargs)
                if scope_key is not None
                else f"tool:{fn.__name__}"
            )
            now = time.monotonic()
            cutoff = now - per_seconds
            with _RATE_LOCK:
                window = _RATE_WINDOWS.setdefault(key, deque())
                while window and window[0] < cutoff:
                    window.popleft()
                if len(window) >= calls:
                    retry_after = max(0.0, window[0] + per_seconds - now)
                    logger.warning(
                        "rate-limit hit for %s (%d/%ss) retry in %.1fs",
                        key,
                        calls,
                        per_seconds,
                        retry_after,
                    )
                    return json.dumps(
                        {
                            "ok": False,
                            "error": (
                                f"rate limit: {calls} calls / {per_seconds}s "
                                f"exceeded for {key}"
                            ),
                            "reason_code": "rate_limited",
                            "retry_after_s": round(retry_after, 2),
                        }
                    )
                window.append(now)
            return fn(*args, **kwargs)

        return wrapper

    return deco


# ----------------------------------------------------------------------
# R4: Input / schema validation
# ----------------------------------------------------------------------

class ValidationError(ValueError):
    """Raised when tool input fails validation. Caught by ``validate_with``."""


_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9_]{1,63}$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_slug(value: Any, field: str) -> str:
    if not isinstance(value, str) or not _SLUG_RE.match(value):
        raise ValidationError(
            f"{field} must be lowercase snake_case slug [a-z0-9_], got {value!r}"
        )
    return value


def validate_enum(value: Any, field: str, allowed: Iterable[str]) -> str:
    allowed_set = set(allowed)
    if value not in allowed_set:
        raise ValidationError(
            f"{field} must be one of {sorted(allowed_set)}, got {value!r}"
        )
    return str(value)


def validate_confidence(value: Any, field: str = "confidence") -> Optional[float]:
    if value is None:
        return None
    try:
        f = float(value)
    except (TypeError, ValueError) as exc:
        raise ValidationError(f"{field} must be a float in [0, 1], got {value!r}") from exc
    if not (0.0 <= f <= 1.0):
        raise ValidationError(f"{field} must be in [0, 1], got {f}")
    return f


def validate_iso_date(value: Any, field: str) -> Optional[str]:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not _ISO_DATE_RE.match(value):
        raise ValidationError(f"{field} must be ISO 'YYYY-MM-DD', got {value!r}")
    return value


def validate_http_url(value: Any, field: str) -> Optional[str]:
    if value is None or value == "":
        return None
    if not isinstance(value, str) or not value.startswith(("http://", "https://")):
        raise ValidationError(f"{field} must be an http(s) URL, got {value!r}")
    if len(value) > 2048:
        raise ValidationError(f"{field} exceeds 2048 chars")
    return value


def validate_text(
    value: Any,
    field: str,
    *,
    max_len: int = 4096,
    required: bool = False,
) -> Optional[str]:
    if value is None:
        if required:
            raise ValidationError(f"{field} is required")
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be a string, got {type(value).__name__}")
    if required and not value.strip():
        raise ValidationError(f"{field} is required")
    if len(value) > max_len:
        raise ValidationError(f"{field} exceeds {max_len} chars")
    return value


def validate_with(
    validator: Callable[..., None],
) -> Callable[[Callable[..., str]], Callable[..., str]]:
    """Run ``validator(*args, **kwargs)`` before the tool; short-circuit on failure.

    Validator should raise ``ValidationError`` with a descriptive message.
    On failure the tool returns a standard JSON error envelope with
    ``reason_code="invalid_input"`` instead of invoking the wrapped function.
    """

    def deco(fn: Callable[..., str]) -> Callable[..., str]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> str:
            try:
                validator(*args, **kwargs)
            except ValidationError as exc:
                logger.info("validation failed for %s: %s", fn.__name__, exc)
                return json.dumps(
                    {
                        "ok": False,
                        "error": str(exc),
                        "reason_code": "invalid_input",
                        "tool": fn.__name__,
                    }
                )
            return fn(*args, **kwargs)

        return wrapper

    return deco


# ----------------------------------------------------------------------
# Composite: @hardened_tool
# ----------------------------------------------------------------------

def hardened_tool(
    *,
    timeout_s: float = 10.0,
    rate_calls: int = 60,
    rate_per_s: float = 60.0,
    validator: Optional[Callable[..., None]] = None,
) -> Callable[[Callable[..., str]], Callable[..., str]]:
    """One-liner: Sentry tracing + timeout + rate limit + optional validator.

    Stacked order matters — innermost (closest to the function) runs first:
        validator -> timeout -> rate-limit -> Sentry span (outermost)

    Rate-limit outside Sentry means rejected calls don't spawn spans
    (keeps the Sentry bill clean under abuse); validation innermost means
    bad input never touches the network or the rate-limit bucket.
    """

    def deco(fn: Callable[..., str]) -> Callable[..., str]:
        wrapped = fn
        if validator is not None:
            wrapped = validate_with(validator)(wrapped)
        wrapped = with_timeout(timeout_s)(wrapped)
        wrapped = with_rate_limit(rate_calls, rate_per_s)(wrapped)
        wrapped = sentry_traced_tool(wrapped)
        return wrapped

    return deco


__all__ = [
    "ValidationError",
    "validate_slug",
    "validate_enum",
    "validate_confidence",
    "validate_iso_date",
    "validate_http_url",
    "validate_text",
    "validate_with",
    "with_timeout",
    "with_rate_limit",
    "hardened_tool",
]
