"""Supabase helpers: stack_candidates grounding + store/policy audit & curation."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


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
            res = (
                client.table("stack_candidates")
                .select("*")
                .limit(min(max(limit, 1), 500))
                .execute()
            )
            rows = getattr(res, "data", None) or []
            return json.dumps(
                {"ok": True, "row_count": len(rows), "rows": rows},
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
            rows = getattr(res, "data", None) or []
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
# ----------------------------------------------------------------------

def query_stack_candidates(limit: int = 200) -> str:
    """Query Supabase `stack_candidates` for current live deal candidates.

    Call before proposing stacks so outputs reflect curated rows (expected ~163).

    Args:
        limit: Maximum rows (1–500; default 200).
    """
    return _supabase().fetch_stack_candidates(limit)


def audit_store_coverage() -> str:
    """Return per-store row counts from `v_snippd_store_audit`.

    Use to confirm every canonical retailer has deal candidates, and to flag
    stores with zero rows so the Architect can emit a warning_banner.
    """
    return _supabase().store_coverage()


def audit_mismatched_store_ids() -> str:
    """List `stack_candidates.store_id` values NOT matching any canonical slug.

    Returns rows with `raw_store_id` and `row_count` so ingest pipelines can
    normalize (e.g. `trader joes` → `trader_joes`).
    """
    return _supabase().mismatched_store_ids()


def audit_stack_candidates_schema() -> str:
    """Return `information_schema.columns` for `stack_candidates`.

    Used by the Data_Auditor when proposing schema changes or seed rows.
    """
    return _supabase().stack_candidates_columns()


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


def list_stale_retailer_policies(days: int = 30) -> str:
    """Return retailer policies older than `days` since last verification.

    Feeds the Retailer_Policy_Curator's refresh queue.
    """
    return _supabase().stale_retailer_policies(days)


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
