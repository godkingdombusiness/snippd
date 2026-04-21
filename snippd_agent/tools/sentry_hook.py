"""Sentry <-> ADK bridge: trace every tool call and surface trace IDs in output.

Why this file exists
--------------------
The Snippd Vertex ADK agents run far from the user's browser. When a React
component calls a tool and it fails, we want a single Sentry UI to show:
  React render error → API call span → Python tool span → Supabase/HTTP call.

`sentry_traced_tool` is a decorator that wraps a plain Python ADK tool
function (one that returns a JSON string). It:

1. Opens a Sentry span scoped to the tool call.
2. Tags the span with the tool name, arg count, and agent.runtime.
3. Injects `_sentry_trace` + `_sentry_baggage` into the JSON the tool
   returns, so the LLM's outputs (and downstream traces) carry the trace
   ID through to the frontend for correlation.
4. On exception: captures to Sentry, then returns the standard
   `{"ok": false, "error": ...}` envelope so the tool contract stays
   intact (ADK tools MUST return JSON — never raise).

If `sentry_sdk` isn't installed or `SENTRY_DSN` isn't set, this is a
zero-cost no-op — the tool runs exactly as before.
"""

from __future__ import annotations

import functools
import json
import logging
import os
from typing import Any, Callable

logger = logging.getLogger(__name__)

_SENTRY_AVAILABLE: bool = False
try:  # pragma: no cover - environment dependent
    import sentry_sdk  # type: ignore[import-untyped]
    _SENTRY_AVAILABLE = True
except ImportError:
    sentry_sdk = None  # type: ignore[assignment]


def _sentry_enabled() -> bool:
    if not _SENTRY_AVAILABLE:
        return False
    if os.environ.get("SENTRY_DSN"):
        return True
    # Allow running with Sentry pre-initialized elsewhere in the process.
    try:
        return sentry_sdk.Hub.current.client is not None  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        return False


def _serialize_trace_headers(span: Any) -> dict[str, str]:
    """Return sentry-trace + baggage for distributed-trace continuation."""
    headers: dict[str, str] = {}
    try:
        if span is None:
            return headers
        tp = getattr(span, "to_traceparent", None)
        if callable(tp):
            headers["sentry_trace"] = tp()
        bag = getattr(span, "to_baggage", None)
        if callable(bag):
            headers["baggage"] = bag()
    except Exception:  # noqa: BLE001
        pass
    return headers


def _inject_trace(result: str, headers: dict[str, str]) -> str:
    """If the result is a JSON object, attach trace headers; otherwise pass through."""
    if not headers or not isinstance(result, str):
        return result
    try:
        parsed = json.loads(result)
    except (json.JSONDecodeError, TypeError):
        return result
    if not isinstance(parsed, dict):
        return result
    parsed.setdefault("_sentry_trace", headers.get("sentry_trace"))
    parsed.setdefault("_sentry_baggage", headers.get("baggage"))
    try:
        return json.dumps(parsed, default=str)
    except TypeError:
        return result


def sentry_traced_tool(fn: Callable[..., str]) -> Callable[..., str]:
    """Wrap a JSON-returning ADK tool function in a Sentry span.

    Preserves the exact signature / docstring / return type of the wrapped
    function (required for ADK to auto-generate the tool schema).
    """

    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> str:
        if not _sentry_enabled():
            return fn(*args, **kwargs)

        op = "agent.tool"
        name = fn.__name__

        try:
            span_cm = sentry_sdk.start_span(op=op, name=name)  # type: ignore[union-attr]
        except TypeError:
            # Older sentry-sdk uses `description` instead of `name`.
            span_cm = sentry_sdk.start_span(op=op, description=name)  # type: ignore[union-attr]

        with span_cm as span:
            try:
                if span is not None and hasattr(span, "set_tag"):
                    span.set_tag("tool.name", name)
                    span.set_tag("agent.runtime", "vertex-ai-adk")
                if span is not None and hasattr(span, "set_data"):
                    span.set_data("tool.args_count", len(args))
                    span.set_data("tool.kwargs_keys", sorted(kwargs.keys()))
            except Exception:  # noqa: BLE001
                pass

            headers = _serialize_trace_headers(span)

            try:
                result = fn(*args, **kwargs)
            except Exception as exc:  # noqa: BLE001 - tool contract: never raise
                logger.exception("tool %s crashed", name)
                try:
                    sentry_sdk.capture_exception(exc)  # type: ignore[union-attr]
                except Exception:  # noqa: BLE001
                    pass
                err_payload = {
                    "ok": False,
                    "error": f"{type(exc).__name__}: {exc}",
                    "tool": name,
                    **({"_sentry_trace": headers["sentry_trace"]} if "sentry_trace" in headers else {}),
                    **({"_sentry_baggage": headers["baggage"]} if "baggage" in headers else {}),
                }
                return json.dumps(err_payload, default=str)

            return _inject_trace(result, headers)

    return wrapper


def init_agent_sentry() -> bool:
    """Idempotently initialize sentry-sdk for the ADK agent.

    Reads `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_TRACES_SAMPLE_RATE`,
    `VERTEX_AGENT_MODEL` from env. Safe to call multiple times; second call
    is a no-op because sentry_sdk.init() dedupes on the same DSN.
    """
    if not _SENTRY_AVAILABLE:
        return False
    dsn = os.environ.get("SENTRY_DSN")
    if not dsn:
        return False

    try:
        sentry_sdk.init(  # type: ignore[union-attr]
            dsn=dsn,
            environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
            release=os.environ.get("SENTRY_RELEASE")
            or os.environ.get("K_REVISION")  # Cloud Run revision, if present
            or None,
            traces_sample_rate=float(
                os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")
            ),
            send_default_pii=False,  # server-side: never default-send PII
            before_send=_redact_pii,
        )
        try:
            sentry_sdk.set_tag(  # type: ignore[union-attr]
                "agent.model",
                os.environ.get("VERTEX_AGENT_MODEL", "gemini-2.5-flash"),
            )
            sentry_sdk.set_tag("snippd.surface", "adk-agent")  # type: ignore[union-attr]
        except Exception:  # noqa: BLE001
            pass
        logger.info("Sentry initialized for Snippd ADK agent.")
        return True
    except Exception:  # noqa: BLE001
        logger.exception("Sentry init failed; continuing without it.")
        return False


_PII_KEY_RE = ("receipt", "coupon_code", "otp", "ssn", "dob", "email",
               "phone", "password", "authorization", "service_role", "api_key")


def _redact_pii(event: dict[str, Any], _hint: Any) -> dict[str, Any] | None:
    """Drop obvious PII before shipping to Sentry."""
    try:
        extra = event.get("extra") or {}
        for key in list(extra.keys()):
            if any(tok in key.lower() for tok in _PII_KEY_RE):
                extra[key] = "[Filtered]"
        event["extra"] = extra

        headers = (event.get("request") or {}).get("headers") or {}
        for key in list(headers.keys()):
            if any(tok in key.lower() for tok in ("auth", "cookie", "apikey")):
                headers[key] = "[Filtered]"
    except Exception:  # noqa: BLE001
        pass
    return event


__all__ = ["sentry_traced_tool", "init_agent_sentry"]
