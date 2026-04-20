# Copyright 2026 Snippd / deployer. Apache-2.0 where applicable.
#
# Vertex AI Agent Development Kit (ADK) — Multi-Agent Relay for stack planning.
#
# Production layout (modular deploy): see `snippd_agent/` (app entry: `snippd_agent/agent.py`).
#
# Dependencies (Reasoning Engine / local):
#   pip install "google-adk>=1.30.0" supabase google-genai
#
# Environment:
#   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — read stack_candidates (live deals).
#   GOOGLE_CLOUD_PROJECT / GOOGLE_GENAI_USE_VERTEXAI — standard Vertex wiring.
#   VERTEX_AGENT_MODEL — optional override (default gemini-2.5-flash).
#
# Vertex AI Agent Engine (AdkApp) wiring:
#   from vertexai.agent_engines import AdkApp
#   app = AdkApp(agent=root_agent)

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone
from typing import Any, Final, Optional

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.google_search_tool import GoogleSearchTool

try:
    from google.genai import types as genai_types
except ImportError:  # pragma: no cover - optional tuning
    genai_types = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

DEFAULT_MODEL: Final[str] = os.environ.get("VERTEX_AGENT_MODEL", "gemini-2.5-flash")

CANONICAL_STORES: Final[tuple[dict[str, str], ...]] = (
    {"id": "walmart", "name": "Walmart", "origin": "https://www.walmart.com"},
    {"id": "aldi", "name": "Aldi", "origin": "https://www.aldi.us"},
    {"id": "target", "name": "Target", "origin": "https://www.target.com"},
)

# Google Search tool: use the instance with bypass so it can pair with FunctionTools (Supabase).
GoogleSearchToolDiscovery = GoogleSearchTool(bypass_multi_tools_limit=True)


# -----------------------------------------------------------------------------
# Supabase (supabase-py) — stack_candidates
# -----------------------------------------------------------------------------


class SupabaseTool:
    """Thin supabase-py accessor for `public.stack_candidates` (live deal candidates)."""

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
        """Pull rows from `stack_candidates` for grounding (expected ~163 live deals)."""
        try:
            client = self._ensure_client()
            res = (
                client.table("stack_candidates")
                .select("*")
                .limit(min(max(limit, 1), 500))
                .execute()
            )
            rows = getattr(res, "data", None) or []
            payload = {
                "ok": True,
                "row_count": len(rows),
                "rows": rows,
            }
            return json.dumps(payload, default=str)
        except Exception as exc:  # noqa: BLE001 — tool surface must not throw raw
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

    Always call this before proposing stacks so outputs reflect the ~163 curated rows.

    Args:
        limit: Maximum rows to return (1–500; default 200).
    """
    return _supabase().fetch_stack_candidates(limit)


# -----------------------------------------------------------------------------
# Instructions — relay roles
# -----------------------------------------------------------------------------

_COMPLIANCE_BLOCK = """
## Compliance (non-negotiable)
- Use **Google Search only** for discovery (prices, availability, public rebate pages).
- **Never** scrape, automate, or log into user retailer or rebate **accounts**.
- Provide **official deep links** only (retailer domains, Ibotta.com, Fetch.com, Checkout51.com,
  manufacturer sites). Users clip/activate in the **in-app browser**.
- Do not fabricate SKUs, prices, or clip links. If uncertain, say so and omit the field.
"""


def _truth_instruction(_: ReadonlyContext) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""You are **Truth_Validator**.
Current reference time (UTC): **{now}** (live clock via `datetime.now(timezone.utc)`).

## Mission
- Cross-check candidate items vs **live retailer discovery** (Google Search tool only).
- Compare advertised deal prices/sizes to search snippets; if **price or unit mismatch > 5%**,
  **discard** that candidate for downstream composition and record `rejected_reason`.
- Prefer evidence from retailer domains and first-party circulars.

{_COMPLIANCE_BLOCK}

## Outputs
Return concise JSON-ready findings: validated[], rejected[] with percent delta.
"""


def _matchmaker_instruction(_: ReadonlyContext) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""You are **Item_Matchmaker**.
Current reference time (UTC): **{now}**.

## Mission
- Resolve identities: raw text → **official product URLs**, **high-res pack image URLs**
  when publicly posted, and **shelf-stable display names**.
- **Grandma-Proof naming**: every consumer-facing title MUST follow
  **`[Brand] [Product] ([Size])`** (example: `Cheerios Original Breakfast Cereal (18 oz)`).
- Ground selections in `query_stack_candidates` rows first; use Search only to find
  official PDP / image URLs on retailer or brand sites.

{_COMPLIANCE_BLOCK}

## Outputs
Return JSON-ready `matches[]` with fields: display_name, product_url, image_url, source_row_id?.
"""


def _savings_instruction(_: ReadonlyContext) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return f"""You are **Savings_Scout**.
Current reference time (UTC): **{now}**.

## Mission
- Call **`query_stack_candidates`** first to anchor product identities, then find **triple-stack**
  opportunities: **Ibotta**, **Fetch Rewards**, **Checkout 51**.
- Return **public** offer deep-links only (no account scraping, no autoclip).
- If a program has no public match, return `null` for that leg with a short note.

{_COMPLIANCE_BLOCK}

## Outputs
JSON-ready `rebates` object with keys ibotta_url, fetch_url, checkout51_url, notes.
"""


def _stack_architect_instruction(_: ReadonlyContext) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    stores = ", ".join(s["name"] for s in CANONICAL_STORES)
    return f"""You are **Stack_Architect** (root orchestrator).
Current reference time (UTC): **{now}** — always treat this as "today" for freshness.

## Relay
Delegate in order as needed:
1) `Truth_Validator` — kill hallucinations & >5% price/unit drift vs discovery.
2) `Item_Matchmaker` — URLs, images, Grandma-Proof names.
3) `Savings_Scout` — public Ibotta / Fetch / Checkout 51 deep-links.

You **must** call `query_stack_candidates` yourself and ensure sub-agents ground on those rows.

## Strategy engine (7+1)
For **each** store in {{{stores}}} output **exactly three** strategies:
`budget`, `chef`, `quick` (labels: Budget, Chef, Quick).

**7+1 rule (every strategy):**
- **7** dinner anchors: `dinners` length **7**, each element has `"isAnchor": true` and
  `items[]` drawn from validated deals (protein + starch + veg style is fine).
- **1** household essentials stack: `"stack_type": "household_essentials"` covering
  **Beauty**, **Health**, **Cleaning** (at least one vetted item pillar each; map from
  `stack_candidates` categories such as personal_care / health_adjacent / cleaning).

## Naming
All item `display_name` fields: **`[Brand] [Product] ([Size])`**.

{_COMPLIANCE_BLOCK}

## Final response shape (strict JSON)
```json
{{
  "current_time_utc": "{now}",
  "stores": [
    {{
      "store_id": "walmart",
      "strategies": {{
        "budget": {{ "dinners": [...7...], "household_essentials": {{...}} }},
        "chef": {{ ... }},
        "quick": {{ ... }}
      }}
    }}
  ]
}}
```
No extra strategies. No fewer than three per store.
"""


# -----------------------------------------------------------------------------
# Agent graph — production relay
# -----------------------------------------------------------------------------


def _gen_config() -> Any:
    if genai_types is None:
        return None
    return genai_types.GenerateContentConfig(
        temperature=0.15,
        top_p=0.9,
        max_output_tokens=8192,
    )


def build_multi_agent_relay(model: str = DEFAULT_MODEL) -> Agent:
    """Constructs the Stack Architect + specialized sub-agents."""

    _gc = _gen_config()
    _kw = {} if _gc is None else {"generate_content_config": _gc}

    truth_validator = Agent(
        model=model,
        name="Truth_Validator",
        description=(
            "Hallucination guard: Google Search vs claimed prices/sizes; rejects >5% drift."
        ),
        instruction=_truth_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **_kw,
    )

    item_matchmaker = Agent(
        model=model,
        name="Item_Matchmaker",
        description=(
            "Identity resolver: official URLs, images, Grandma-Proof [Brand] [Product] ([Size])."
        ),
        instruction=_matchmaker_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **_kw,
    )

    savings_scout = Agent(
        model=model,
        name="Savings_Scout",
        description="Triple-stack scout for Ibotta, Fetch, Checkout 51 public deep-links only.",
        instruction=_savings_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **_kw,
    )

    root_agent = Agent(
        model=model,
        name="Stack_Architect",
        description=(
            "Coordinates Truth_Validator, Item_Matchmaker, and Savings_Scout; "
            "emits 7+1 strategies (Budget, Chef, Quick) per store from stack_candidates."
        ),
        instruction=_stack_architect_instruction,
        tools=[query_stack_candidates],
        sub_agents=[truth_validator, item_matchmaker, savings_scout],
        **_kw,
    )
    return root_agent


# Vertex / ADK entry — Reasoning Engine expects a module-level `root_agent`.
root_agent: Agent = build_multi_agent_relay()


class AgentClass:
    """Back-compat factory for callers expecting a class-based entrypoint."""

    __slots__ = ()

    model: str = DEFAULT_MODEL

    @staticmethod
    def root() -> Agent:
        return root_agent

    @staticmethod
    def rebuild(model: Optional[str] = None) -> Agent:
        """Rebuild graph (e.g., after env changes). Not used by default import path."""
        m = model or DEFAULT_MODEL
        return build_multi_agent_relay(m)


__all__ = [
    "AgentClass",
    "AgentRelaySystem",
    "GoogleSearchToolDiscovery",
    "SupabaseTool",
    "build_multi_agent_relay",
    "query_stack_candidates",
    "root_agent",
]


class AgentRelaySystem:
    """Explicit system handle for deployment manifests."""

    __slots__ = ("model",)

    def __init__(self, model: str = DEFAULT_MODEL) -> None:
        self.model = model

    @property
    def root_agent(self) -> Agent:
        return build_multi_agent_relay(self.model)
