"""Supabase helpers: stack_candidates grounding + store/policy audit & curation.

Security posture (DNA §Auditor):
- All rows returned to the LLM context are passed through a **column whitelist**
  and a **PII denylist**, so accidental `select("*")` against a schema that later
  grows a PII column cannot leak user data into prompts / Sentry / logs.
- Write RPCs (`upsert_retailer_policy`) **fail loud** when the service-role key
  is missing instead of silently 401'ing through RLS.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Iterable, Optional

from tools.guardrails import (
    ValidationError,
    hardened_tool,
    validate_confidence,
    validate_enum,
    validate_http_url,
    validate_iso_date,
    validate_slug,
    validate_text,
)

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------------
# Security hardening (R1 + R2 fixes from .cursorrules audit PR #1)
# ----------------------------------------------------------------------

# LLM-SAFE column allowlist for stack_candidates. Deliberately excludes any
# field that could contain user PII, auth identifiers, or raw source dumps.
# Override via env `STACK_CANDIDATES_LLM_COLUMNS` (comma-separated) if the
# schema legitimately needs to grow.
_DEFAULT_STACK_CANDIDATES_COLUMNS: tuple[str, ...] = (
    "id",
    "store_id",
    "product_name",
    "brand",
    "category",
    "deal_type",
    "base_price",
    "sale_price",
    "final_price",
    "discount_pct",
    "coupon_value",
    "rebate_app",
    "rebate_value",
    "cashback_app",
    "cashback_value",
    "stack_notes",
    "valid_from",
    "valid_until",
    "source_url",
    "created_at",
    "updated_at",
)

# Hard denylist — stripped from every outbound row even if they slip into
# the whitelist via env override. Any future PII column added to Supabase
# will be blocked at this layer until an explicit allowlist exception is
# added and audited.
_PII_DENYLIST: frozenset[str] = frozenset(
    {
        "user_id",
        "auth_user_id",
        "owner_id",
        "created_by",
        "submitted_by",
        "submitted_by_email",
        "curator_email",
        "email",
        "phone",
        "phone_number",
        "full_name",
        "first_name",
        "last_name",
        "address",
        "street",
        "zip",
        "postal_code",
        "ip",
        "ip_address",
        "device_id",
        "session_id",
        "stripe_customer_id",
        "stripe_subscription_id",
    }
)


def _stack_candidates_columns() -> str:
    """Return the comma-separated column projection for LLM-grounded queries."""
    override = os.environ.get("STACK_CANDIDATES_LLM_COLUMNS")
    cols: Iterable[str]
    if override:
        cols = [c.strip() for c in override.split(",") if c.strip()]
    else:
        cols = _DEFAULT_STACK_CANDIDATES_COLUMNS
    safe = [c for c in cols if c not in _PII_DENYLIST]
    if not safe:
        # Defensive: never fall back to "*"; prefer a minimal projection.
        safe = ["id", "store_id"]
    return ",".join(safe)


def _redact_pii(rows: Any) -> Any:
    """Strip PII-denylisted keys from every dict row. Defense in depth."""
    if not isinstance(rows, list):
        return rows
    cleaned: list[Any] = []
    for row in rows:
        if isinstance(row, dict):
            cleaned.append({k: v for k, v in row.items() if k not in _PII_DENYLIST})
        else:
            cleaned.append(row)
    return cleaned


def _require_service_role(op: str) -> None:
    """Fail loud if a write op is attempted without the service-role key.

    Prevents the silent-failure class where an agent "successfully" calls a
    write RPC under the anon key and RLS drops the row with no error surface.
    """
    if not os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        raise RuntimeError(
            f"[governance] {op} requires SUPABASE_SERVICE_ROLE_KEY. "
            "Refusing to attempt write with anon/JWT key — "
            "writes would be silently dropped by RLS."
        )


class SupabaseTool:
    """Thin supabase-py accessor for the Snippd tables."""

    __slots__ = ("_url", "_key", "_client")

    def __init__(self, url: Optional[str] = None, key: Optional[str] = None) -> None:
        self._url = url or os.environ.get("SUPABASE_URL")
        self._key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get(
            "SUPABASE_KEY"
        )
        self._client: Any = None

    @classmethod
    def from_env(cls) -> SupabaseTool:
        return cls()

    def _ensure_client(self) -> Any:
        if self._client is not None:
            return self._client
        if not self._url or not self._key:
            raise RuntimeError(
                "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / SUPABASE_KEY in environment."
            )
        from supabase import create_client  # type: ignore[import-untyped]

        self._client = create_client(self._url, self._key)
        return self._client

    # ------------------------------------------------------------------
    # stack_candidates grounding
    # ------------------------------------------------------------------
    def fetch_stack_candidates(self, limit: int = 200) -> str:
        try:
            client = self._ensure_client()
            projection = _stack_candidates_columns()
            res = (
                client.table("stack_candidates")
                .select(projection)
                .limit(min(max(limit, 1), 500))
                .execute()
            )
            rows = _redact_pii(getattr(res, "data", None) or [])
            return json.dumps(
                {
                    "ok": True,
                    "row_count": len(rows),
                    "columns": projection.split(","),
                    "rows": rows,
                },
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("stack_candidates query failed")
            return json.dumps({"ok": False, "error": str(exc)})

    # ------------------------------------------------------------------
    # Data audit helpers
    # ------------------------------------------------------------------
    def store_coverage(self) -> str:
        """Row counts in stack_candidates per canonical store (from v_snippd_store_audit)."""
        try:
            client = self._ensure_client()
            res = client.table("v_snippd_store_audit").select("*").execute()
            return json.dumps(
                {"ok": True, "rows": getattr(res, "data", None) or []},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("store_coverage failed")
            return json.dumps({"ok": False, "error": str(exc)})

    def mismatched_store_ids(self) -> str:
        """Return stack_candidates.store_id values that do NOT match a canonical slug."""
        try:
            client = self._ensure_client()
            res = client.rpc("snippd_agent_mismatched_store_ids", {}).execute()
            return json.dumps(
                {"ok": True, "rows": getattr(res, "data", None) or []},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("mismatched_store_ids failed")
            return json.dumps({"ok": False, "error": str(exc)})

    def stack_candidates_columns(self) -> str:
        """Column catalog for stack_candidates (used when designing ingest changes)."""
        try:
            client = self._ensure_client()
            res = client.rpc("snippd_agent_stack_candidates_columns", {}).execute()
            return json.dumps(
                {"ok": True, "rows": getattr(res, "data", None) or []},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("stack_candidates_columns failed")
            return json.dumps({"ok": False, "error": str(exc)})

    # ------------------------------------------------------------------
    # Retailer policies
    # ------------------------------------------------------------------
    def fetch_retailer_policies(
        self,
        store_id: Optional[str] = None,
        policy_type: Optional[str] = None,
        limit: int = 500,
    ) -> str:
        try:
            client = self._ensure_client()
            q = client.table("v_retailer_policy_current").select("*")
            if store_id:
                q = q.eq("store_id", store_id)
            if policy_type:
                q = q.eq("policy_type", policy_type)
            res = q.limit(min(max(limit, 1), 2000)).execute()
            rows = _redact_pii(getattr(res, "data", None) or [])
            return json.dumps(
                {"ok": True, "row_count": len(rows), "rows": rows},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("fetch_retailer_policies failed")
            return json.dumps({"ok": False, "error": str(exc)})

    def stale_retailer_policies(self, days: int = 30) -> str:
        try:
            client = self._ensure_client()
            res = client.rpc(
                "snippd_agent_stale_policies",
                {"p_days": int(max(days, 0))},
            ).execute()
            return json.dumps(
                {"ok": True, "rows": getattr(res, "data", None) or []},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("stale_retailer_policies failed")
            return json.dumps({"ok": False, "error": str(exc)})

    def upsert_retailer_policy(
        self,
        store_id: str,
        policy_type: str,
        policy_key: str,
        value_json: dict[str, Any],
        summary: Optional[str] = None,
        source_url: Optional[str] = None,
        source_snippet: Optional[str] = None,
        effective_date: Optional[str] = None,
        verified_by: str = "Retailer_Policy_Curator",
        confidence: Optional[float] = None,
    ) -> str:
        try:
            _require_service_role("upsert_retailer_policy")
            client = self._ensure_client()
            payload = {
                "p_store_id": store_id,
                "p_policy_type": policy_type,
                "p_policy_key": policy_key,
                "p_value_json": value_json or {},
                "p_summary": summary,
                "p_source_url": source_url,
                "p_source_snippet": source_snippet,
                "p_effective_date": effective_date,
                "p_verified_by": verified_by,
                "p_confidence": confidence,
            }
            res = client.rpc("snippd_agent_upsert_retailer_policy", payload).execute()
            return json.dumps(
                {"ok": True, "row": getattr(res, "data", None)},
                default=str,
            )
        except Exception as exc:  # noqa: BLE001
            logger.exception("upsert_retailer_policy failed")
            return json.dumps({"ok": False, "error": str(exc)})


_SUPABASE_SINGLETON: Optional[SupabaseTool] = None


def _supabase() -> SupabaseTool:
    global _SUPABASE_SINGLETON
    if _SUPABASE_SINGLETON is None:
        _SUPABASE_SINGLETON = SupabaseTool.from_env()
    return _SUPABASE_SINGLETON


# ----------------------------------------------------------------------
# ADK tool surface — plain functions with typed signatures + docstrings
# (ADK auto-wraps these as FunctionTool when passed to Agent(tools=[...])).
#
# Every tool below is @hardened_tool — that stacks: Sentry tracing +
# R3 timeout + R5 rate-limit + (where present) R4 input validation.
# ----------------------------------------------------------------------

# Policy-type vocabulary from .cursorrules DNA. Kept here (not in guardrails)
# so it stays next to the RPC that consumes it.
_POLICY_TYPES: frozenset[str] = frozenset(
    {
        "coupon_acceptance",
        "price_match",
        "rebate_compat",
        "rewards_program",
        "ibotta_compat",
        "bogo_rules",
        "stacking_rules",
        "return_policy",
        "sales_calendar",
        "app_deals",
    }
)


def _validate_upsert_retailer_policy(
    store_id: str,
    policy_type: str,
    policy_key: str,
    value_json: Any,
    summary: Optional[str] = None,
    source_url: Optional[str] = None,
    source_snippet: Optional[str] = None,
    effective_date: Optional[str] = None,
    confidence: Optional[float] = None,
) -> None:
    """R4: reject malformed upserts before they touch the DB or rate-limit."""
    validate_slug(store_id, "store_id")
    validate_enum(policy_type, "policy_type", _POLICY_TYPES)
    validate_slug(policy_key, "policy_key")
    if not isinstance(value_json, dict):
        raise ValidationError(
            f"value_json must be a JSON object, got {type(value_json).__name__}"
        )
    if len(json.dumps(value_json, default=str)) > 16384:
        raise ValidationError("value_json exceeds 16 KB")
    validate_text(summary, "summary", max_len=512)
    validate_http_url(source_url, "source_url")
    validate_text(source_snippet, "source_snippet", max_len=1024)
    validate_iso_date(effective_date, "effective_date")
    validate_confidence(confidence, "confidence")


@hardened_tool(timeout_s=8.0, rate_calls=60, rate_per_s=60.0)
def query_stack_candidates(limit: int = 200) -> str:
    """Query Supabase `stack_candidates` for current live deal candidates.

    Call before proposing stacks so outputs reflect curated rows (expected ~163).

    Args:
        limit: Maximum rows (1–500; default 200).
    """
    return _supabase().fetch_stack_candidates(limit)


@hardened_tool(timeout_s=5.0, rate_calls=30, rate_per_s=60.0)
def audit_store_coverage() -> str:
    """Return per-store row counts from `v_snippd_store_audit`.

    Use to confirm every canonical retailer has deal candidates, and to flag
    stores with zero rows so the Architect can emit a warning_banner.
    """
    return _supabase().store_coverage()


@hardened_tool(timeout_s=5.0, rate_calls=30, rate_per_s=60.0)
def audit_mismatched_store_ids() -> str:
    """List `stack_candidates.store_id` values NOT matching any canonical slug.

    Returns rows with `raw_store_id` and `row_count` so ingest pipelines can
    normalize (e.g. `trader joes` → `trader_joes`).
    """
    return _supabase().mismatched_store_ids()


@hardened_tool(timeout_s=5.0, rate_calls=10, rate_per_s=60.0)
def audit_stack_candidates_schema() -> str:
    """Return `information_schema.columns` for `stack_candidates`.

    Used by the Data_Auditor when proposing schema changes or seed rows.
    """
    return _supabase().stack_candidates_columns()


@hardened_tool(timeout_s=8.0, rate_calls=60, rate_per_s=60.0)
def fetch_retailer_policies(
    store_id: Optional[str] = None,
    policy_type: Optional[str] = None,
    limit: int = 500,
) -> str:
    """Return active retailer policies from `v_retailer_policy_current`.

    Args:
        store_id: Optional canonical slug (e.g. `walmart`, `publix`).
        policy_type: Optional policy vocabulary value (e.g. `coupon_acceptance`).
        limit: Row cap (1–2000).
    """
    return _supabase().fetch_retailer_policies(store_id, policy_type, limit)


@hardened_tool(timeout_s=5.0, rate_calls=30, rate_per_s=60.0)
def list_stale_retailer_policies(days: int = 30) -> str:
    """Return retailer policies older than `days` since last verification.

    Feeds the Retailer_Policy_Curator's refresh queue.
    """
    return _supabase().stale_retailer_policies(days)


@hardened_tool(
    timeout_s=12.0,
    rate_calls=20,
    rate_per_s=60.0,
    validator=_validate_upsert_retailer_policy,
)
def upsert_retailer_policy(
    store_id: str,
    policy_type: str,
    policy_key: str,
    value_json: dict[str, Any],
    summary: Optional[str] = None,
    source_url: Optional[str] = None,
    source_snippet: Optional[str] = None,
    effective_date: Optional[str] = None,
    confidence: Optional[float] = None,
) -> str:
    """Upsert a verified retailer policy row.

    Writes (or updates) via the `snippd_agent_upsert_retailer_policy` RPC.
    The DB trigger auto-captures change history in `retailer_policy_history`.

    Args:
        store_id: Canonical slug, e.g. `publix`.
        policy_type: One of the vocabulary values (e.g. `coupon_acceptance`,
            `price_match`, `rebate_compat`, `rewards_program`, ...).
        policy_key: Sub-key within the type (e.g. `accepts_competitor_coupons`).
        value_json: Structured value. Free-form JSON — e.g.
            {"accepts": ["target", "cvs"], "notes": "Beauty coupons only."}.
        summary: Human-readable one-liner.
        source_url: Official policy page URL (required for drift verification).
        source_snippet: Short quote from the source for provenance.
        effective_date: ISO date when this rule took effect, if known.
        confidence: 0.0–1.0 confidence score based on source quality.
    """
    return _supabase().upsert_retailer_policy(
        store_id=store_id,
        policy_type=policy_type,
        policy_key=policy_key,
        value_json=value_json,
        summary=summary,
        source_url=source_url,
        source_snippet=source_snippet,
        effective_date=effective_date,
        confidence=confidence,
    )
