"""Supabase client helper for `stack_candidates` (live deal grounding)."""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional

logger = logging.getLogger(__name__)


class SupabaseTool:
    """Thin supabase-py accessor for `public.stack_candidates`."""

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

    def fetch_stack_candidates(self, limit: int = 200) -> str:
        """Return JSON: ok, row_count, rows from `stack_candidates` (~163 live deals)."""
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
        except Exception as exc:  # noqa: BLE001 — tool must return JSON, not raise
            logger.exception("stack_candidates query failed")
            return json.dumps({"ok": False, "error": str(exc)})


_SUPABASE_SINGLETON: Optional[SupabaseTool] = None


def _supabase() -> SupabaseTool:
    global _SUPABASE_SINGLETON
    if _SUPABASE_SINGLETON is None:
        _SUPABASE_SINGLETON = SupabaseTool.from_env()
    return _SUPABASE_SINGLETON


def query_stack_candidates(limit: int = 200) -> str:
    """Query Supabase `stack_candidates` for current live deal candidates.

    Call before proposing stacks so outputs reflect curated rows (expected ~163).

    Args:
        limit: Maximum rows (1–500; default 200).
    """
    return _supabase().fetch_stack_candidates(limit)
