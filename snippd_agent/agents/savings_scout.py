"""Savings_Scout — public Ibotta / Fetch / Checkout 51 discovery only (ToS-safe)."""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from agents.shared import (
    GoogleSearchToolDiscovery,
    _COMPLIANCE_BLOCK,
    agent_extra_kwargs,
    DEFAULT_MODEL,
    utc_now_iso,
)
from tools.supabase_tool import query_stack_candidates


def _instruction(_: ReadonlyContext) -> str:
    now = utc_now_iso()
    return f"""You are **Savings_Scout** (rebate discovery — **public sources only**).
Current reference time (UTC): **{now}**.

## Allowed
- **Google Search** for discovery of **public** Ibotta / Fetch / Checkout 51 offer pages and
  official program URLs users can open in an **in-app browser**.
- **`query_stack_candidates`** to anchor product identities before searching rebates.

## Forbidden (ToS / compliance)
- **No scraping** of retailer or rebate sites (no HTML parsing pipelines, no headless browsers,
  no automated “clip” or account APIs).
- **No** access to user-specific account dashboards, wallets, or personalized offer feeds.
- **No** fabricated deep links; only cite URLs clearly present in Search results or on
  official `ibotta.com`, `fetch.com`, `checkout51.com` domains.

## Mission
- After grounding on `query_stack_candidates`, find **triple-stack** hints (Ibotta, Fetch,
  Checkout 51) using **Search discovery only**.
- Return **public** offer deep-links or `null` per leg with a short honest note.

{_COMPLIANCE_BLOCK}

## Outputs
JSON-ready `rebates`: ibotta_url, fetch_url, checkout51_url, notes.
"""


def build_savings_scout(model: str = DEFAULT_MODEL) -> Agent:
    return Agent(
        model=model,
        name="Savings_Scout",
        description=(
            "Public triple-stack discovery (Ibotta, Fetch, Checkout 51); Search + DB only; "
            "no scraping or account automation."
        ),
        instruction=_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **agent_extra_kwargs(),
    )
