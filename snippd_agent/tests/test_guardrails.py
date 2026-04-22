"""Smoke tests for the R3/R4/R5 guardrails.

Runnable standalone:
    cd snippd_agent && python tests/test_guardrails.py

Designed to require NO external deps (no Supabase, no Sentry, no pytest).
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

# Make `tools.*` importable when run from repo root OR from snippd_agent/.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from tools.guardrails import (  # noqa: E402
    ValidationError,
    hardened_tool,
    validate_confidence,
    validate_enum,
    validate_slug,
    with_rate_limit,
    with_timeout,
)


def _assert(cond: bool, label: str) -> None:
    if not cond:
        raise AssertionError(f"FAIL: {label}")
    print(f"  [ok] {label}")


def test_timeout() -> None:
    print("[R3] timeout decorator")

    @with_timeout(seconds=0.2)
    def slow() -> str:
        time.sleep(1.0)
        return json.dumps({"ok": True})

    out = json.loads(slow())
    _assert(out["ok"] is False, "slow tool returns ok=False")
    _assert(out["reason_code"] == "timeout", "reason_code=timeout")

    @with_timeout(seconds=1.0)
    def fast() -> str:
        return json.dumps({"ok": True, "hello": "world"})

    out = json.loads(fast())
    _assert(out["ok"] is True and out["hello"] == "world", "fast tool passes through")


def test_rate_limit() -> None:
    print("[R5] rate-limit decorator")

    @with_rate_limit(calls=2, per_seconds=5.0)
    def tool() -> str:
        return json.dumps({"ok": True})

    _assert(json.loads(tool())["ok"], "call 1 passes")
    _assert(json.loads(tool())["ok"], "call 2 passes")
    out = json.loads(tool())
    _assert(out["ok"] is False, "call 3 rejected")
    _assert(out["reason_code"] == "rate_limited", "reason_code=rate_limited")
    _assert("retry_after_s" in out, "retry_after_s present")


def test_validation() -> None:
    print("[R4] validators")

    try:
        validate_slug("Publix", "store_id")
        raise AssertionError("uppercase slug should fail")
    except ValidationError:
        print("  [ok] uppercase slug rejected")
    _assert(validate_slug("publix", "store_id") == "publix", "lowercase slug accepted")

    try:
        validate_enum("made_up", "policy_type", ["coupon_acceptance"])
        raise AssertionError("unknown enum should fail")
    except ValidationError:
        print("  [ok] unknown enum rejected")

    try:
        validate_confidence(1.5, "confidence")
        raise AssertionError("out-of-range confidence should fail")
    except ValidationError:
        print("  [ok] out-of-range confidence rejected")
    _assert(validate_confidence(0.85) == 0.85, "valid confidence accepted")
    _assert(validate_confidence(None) is None, "None confidence passes through")


def test_composite_hardened_tool() -> None:
    print("[R3+R4+R5] @hardened_tool composite")

    def validator(x: int) -> None:
        if x < 0:
            raise ValidationError("x must be >= 0")

    @hardened_tool(timeout_s=1.0, rate_calls=3, rate_per_s=5.0, validator=validator)
    def work(x: int) -> str:
        return json.dumps({"ok": True, "x": x})

    out = json.loads(work(-1))
    _assert(out["reason_code"] == "invalid_input", "negative x rejected by validator")

    ok = json.loads(work(7))
    _assert(ok["ok"] and ok["x"] == 7, "positive x passes all layers")


def main() -> int:
    test_timeout()
    test_rate_limit()
    test_validation()
    test_composite_hardened_tool()
    print("\nALL GUARDRAIL SMOKE TESTS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
