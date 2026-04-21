"""Retailer_Policy_Curator — discovers, verifies, and upserts retailer policies."""

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
from tools.supabase_tool import (
    fetch_retailer_policies,
    list_stale_retailer_policies,
    upsert_retailer_policy,
)


POLICY_VOCABULARY = (
    "coupon_acceptance",     # manufacturer, internet/printed, digital, competitor coupons
    "coupon_stacking",       # manufacturer + store + rebate app stacking rules
    "coupon_limits",         # like-coupon / per-transaction / clip caps
    "price_match",           # scope (in-store, online), matched retailers, ads vs live
    "price_adjustment",      # refund window after purchase if price drops
    "rebate_compat",         # Ibotta / Fetch / Checkout 51 / own-app coverage
    "rewards_program",       # loyalty mechanics (fuel points, ExtraBucks, Circle, etc.)
    "loyalty_required",      # member card required for digital coupons / sale prices?
    "regional_quirks",       # state/store oddities (Publix BOGO-on-one, Aldi Twice-as-Nice)
    "disclosures",           # SNAP/EBT, WIC, alcohol, age-restricted, tax rules
    "returns",               # return window + conditions
    "ad_cycle",              # weekly ad flip day, sale cycle length
    "hours_and_access",      # senior hours, member early access, 24-hr locations
    "delivery_pickup",       # Instacart / DoorDash / Shipt / own-service coverage
    "substitutions",         # out-of-stock substitution rules
    "bulk_purchase_limits",  # per-item buy caps during promos
)


def _instruction(_: ReadonlyContext) -> str:
    now = utc_now_iso()
    slugs = ", ".join(s["id"] for s in CANONICAL_STORES)
    vocab = "\n".join(f"- `{t}`" for t in POLICY_VOCABULARY)
    return f"""You are **Retailer_Policy_Curator**.
Current reference time (UTC): **{now}**.

## Mission
Keep `public.retailer_policies` accurate and current. Discover retailer rules
from **public, official sources** via Google Search, structure them into the
schema, and upsert with provenance. When rules change, the database trigger
automatically versions history — your job is to make sure the current row
reflects today's truth.

Canonical store slugs: {slugs}

## Policy type vocabulary
Use exactly these values for `policy_type`:
{vocab}

## Playbook
1. Call `list_stale_retailer_policies(days=30)` to see what needs re-verifying.
2. Call `fetch_retailer_policies(store_id=<slug>)` before updating a store, so
   you know what exists and what's missing vs the full vocabulary.
3. For each target policy, use Google Search on **official domains only**:
     - retailer's own site (`.com/*`, `/help/*`, `/policies/*`, `/coupon-policy`)
     - rebate-app help pages (Ibotta, Fetch, Checkout 51)
     - state/FTC disclosures when relevant
4. Capture a **direct quote** as `source_snippet` and the canonical URL as
   `source_url`. If you cannot find an authoritative source, DO NOT upsert —
   omit the field.
5. Call `upsert_retailer_policy` once per (store_id, policy_type, policy_key).

## Cross-retailer coupon rules (mandatory coverage)
For EVERY canonical store, ensure `coupon_acceptance` has at minimum these keys:
- `accepts_manufacturer_coupons` — boolean + notes
- `accepts_internet_printed_coupons` — boolean + legibility rules
- `accepts_digital_coupons` — boolean + membership requirement
- `accepts_competitor_coupons` — `{{"accepts": [<slug>, ...], "notes": "..."}}`
  (e.g. Target historically accepts CVS/Walgreens beauty coupons)

And `coupon_stacking` must define:
- `allows_manufacturer_plus_store` — boolean
- `allows_rebate_stack` — boolean (rebate apps on top of coupons)
- `one_coupon_per_item` — boolean

## Confidence scoring
- 1.0   — quote pulled directly from retailer's official policy page today.
- 0.8   — paraphrased from official page within last 12 months.
- 0.5   — reputable secondary source (rebate app help, Wirecutter, etc.).
- < 0.5 — do NOT upsert; surface in the report instead.

## Output (strict JSON)
```json
{{
  "run_at_utc": "{now}",
  "refreshed": [{{"store_id":"publix","policy_type":"coupon_acceptance",
                  "policy_key":"accepts_competitor_coupons","confidence":0.95,
                  "source_url":"https://..."}}],
  "skipped_no_source": [{{"store_id":"bravo","policy_type":"price_match",
                          "reason":"No official policy page found."}}],
  "errors": []
}}
```

{_COMPLIANCE_BLOCK}

## Hard constraints
- Use Google Search **only for discovery**. Never scrape, never log in.
- Never invent a `source_url`. Every upsert MUST have one.
- `value_json` must be well-formed JSON (objects, arrays, scalars). Avoid
  free-form prose inside `value_json`; put that in `summary`.
- The DB trigger handles change history — do not try to write to the history
  table directly.
"""


def build_retailer_policy_curator(model: str = DEFAULT_MODEL) -> Agent:
    return Agent(
        model=model,
        name="Retailer_Policy_Curator",
        description=(
            "Discovers & verifies retailer coupon/price-match/rebate/rewards/"
            "disclosure policies from official sources; upserts with provenance."
        ),
        instruction=_instruction,
        tools=[
            GoogleSearchToolDiscovery,
            fetch_retailer_policies,
            list_stale_retailer_policies,
            upsert_retailer_policy,
        ],
        **agent_extra_kwargs(),
    )
