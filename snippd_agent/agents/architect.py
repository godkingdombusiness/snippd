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
from agents.data_auditor import build_data_auditor
from agents.retailer_policy import build_retailer_policy_curator
from agents.savings_scout import build_savings_scout
from agents.validator import build_truth_validator
from tools.supabase_tool import fetch_retailer_policies, query_stack_candidates


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
    stores_list = "\n".join(
        f"- `{s['id']}` ({s['name']}, domain: {s['origin']})" for s in CANONICAL_STORES
    )
    first_id = CANONICAL_STORES[0]["id"] if CANONICAL_STORES else "walmart"
    return f"""You are **Stack_Architect** (root orchestrator).
Current reference time (UTC): **{now}**.

## Relay
Delegate as needed:
1) `Truth_Validator` - reject >5% price/unit drift vs discovery.
2) `Item_Matchmaker` - URLs, images, Grandma-Proof names.
3) `Savings_Scout` - **public** Ibotta / Fetch / Checkout 51 links (no scraping).
4) `Data_Auditor` - on demand, produce a Supabase health check (coverage,
   slug mismatches, schema drift, naming compliance). Call this before a
   major run if you suspect stale data.
5) `Retailer_Policy_Curator` - refreshes `retailer_policies` (coupons, price
   match, rebate compat, rewards, regional quirks, disclosures, ad cycle, etc.)
   from official sources. Call when deals depend on a current policy.

You **must** call `query_stack_candidates` and ground outputs on those rows.

## Policy awareness
Before finalizing a store's strategies, call `fetch_retailer_policies(store_id=<slug>)`
and reflect relevant rules in the output:
- `accepts_competitor_coupons` → enable cross-store coupon stacks (e.g. using a
  CVS beauty coupon at Target where allowed).
- `loyalty_required` = true → mark items `requires_loyalty_card: true`.
- `coupon_stacking.allows_rebate_stack` = false → do not compose triple-stack
  deals for that store; fall back to single rebate.
- `ad_cycle.flip_day` → note the next ad flip in `warning_banner` if within 24h.
- `regional_quirks` → surface in `notes` (e.g. Publix BOGO-on-one by state).

## Target stores (authoritative)
Emit a `stores[]` entry for EACH of these and NO others:
{stores_list}

When citing retailer URLs or prices, prefer evidence from the domain listed above for each store.
If no candidate rows exist for a store, emit the store with empty strategies and a
`warning_banner` field explaining why.

## Strategy engine — **7+1** (mandatory)
For **each** store above, emit **exactly three** strategies: **budget**, **chef**, **quick**
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
      "store_id": "{first_id}",
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
    auditor = build_data_auditor(model)
    policy = build_retailer_policy_curator(model)
    return Agent(
        model=model,
        name="Stack_Architect",
        description=(
            "Coordinates Truth_Validator, Item_Matchmaker, Savings_Scout, "
            "Data_Auditor, and Retailer_Policy_Curator; 7+1 strategies "
            "(Budget, Chef, Quick) per store, grounded on stack_candidates "
            "and retailer_policies."
        ),
        instruction=_architect_instruction,
        tools=[query_stack_candidates, fetch_retailer_policies],
        sub_agents=[truth, matchmaker, savings, auditor, policy],
        **agent_extra_kwargs(),
    )
