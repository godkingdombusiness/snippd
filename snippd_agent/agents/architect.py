"""Stack_Architect (root) + Item_Matchmaker sub-agent — 7+1 strategy assembly."""

from __future__ import annotations

from google.adk.agents import Agent
from google.adk.agents.readonly_context import ReadonlyContext

from agents.shared import (
    CANONICAL_STORES,
    GoogleSearchToolDiscovery,
    _COMPLIANCE_BLOCK,
    agent_extra_kwargs,
    DEFAULT_MODEL,
    utc_now_iso,
)
from agents.savings_scout import build_savings_scout
from agents.validator import build_truth_validator
from tools.supabase_tool import query_stack_candidates


def _matchmaker_instruction(_: ReadonlyContext) -> str:
    now = utc_now_iso()
    return f"""You are **Item_Matchmaker**.
Current reference time (UTC): **{now}**.

## Mission
- Resolve identities: raw text → **official product URLs**, **high-res pack image URLs**
  when publicly posted, and **shelf-stable display names**.
- **Grandma-Proof naming**: **`[Brand] [Product] ([Size])`**
  (e.g. `Cheerios Original Breakfast Cereal (18 oz)`).
- Ground in `query_stack_candidates` first; use Search only for official PDP / image URLs.

{_COMPLIANCE_BLOCK}

## Outputs
JSON-ready `matches[]`: display_name, product_url, image_url, source_row_id?.
"""


def build_item_matchmaker(model: str = DEFAULT_MODEL) -> Agent:
    return Agent(
        model=model,
        name="Item_Matchmaker",
        description=(
            "Identity resolver: official URLs, images, Grandma-Proof [Brand] [Product] ([Size])."
        ),
        instruction=_matchmaker_instruction,
        tools=[GoogleSearchToolDiscovery, query_stack_candidates],
        **agent_extra_kwargs(),
    )


def _architect_instruction(_: ReadonlyContext) -> str:
    now = utc_now_iso()
    stores = ", ".join(s["name"] for s in CANONICAL_STORES)
    return f"""You are **Stack_Architect** (root orchestrator).
Current reference time (UTC): **{now}**.

## Relay
Delegate as needed:
1) `Truth_Validator` - reject >5% price/unit drift vs discovery.
2) `Item_Matchmaker` - URLs, images, Grandma-Proof names.
3) `Savings_Scout` - **public** Ibotta / Fetch / Checkout 51 links (no scraping).

You **must** call `query_stack_candidates` and ground outputs on those rows.

## Strategy engine — **7+1** (mandatory)
For **each** store in {{{stores}}} emit **exactly three** strategies: **budget**, **chef**, **quick**
(labels: Budget, Chef, Quick).

**7+1 rule (each strategy):**
- **7** dinner anchors: `dinners` array length **7**; each dinner has `"isAnchor": true` and
  `items[]` from validated deals.
- **1** `household_essentials` stack with pillars **Beauty**, **Health**, **Cleaning**
  (at least one vetted item per pillar where data allows).

## Naming
All `display_name` fields: **`[Brand] [Product] ([Size])`**.

{_COMPLIANCE_BLOCK}

## Final JSON shape
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
"""


def build_root_agent(model: str = DEFAULT_MODEL) -> Agent:
    truth = build_truth_validator(model)
    matchmaker = build_item_matchmaker(model)
    savings = build_savings_scout(model)
    return Agent(
        model=model,
        name="Stack_Architect",
        description=(
            "Coordinates Truth_Validator, Item_Matchmaker, Savings_Scout; "
            "7+1 strategies (Budget, Chef, Quick) per store from stack_candidates."
        ),
        instruction=_architect_instruction,
        tools=[query_stack_candidates],
        sub_agents=[truth, matchmaker, savings],
        **agent_extra_kwargs(),
    )
