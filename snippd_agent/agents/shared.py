"""Shared constants and model config for Snippd ADK agents."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Final, Optional

from google.adk.tools.google_search_tool import GoogleSearchTool

try:
    from google.genai import types as genai_types
except ImportError:  # pragma: no cover
    genai_types = None  # type: ignore[assignment]

logger = logging.getLogger(__name__)

DEFAULT_MODEL: Final[str] = os.environ.get("VERTEX_AGENT_MODEL", "gemini-2.5-flash")

# -----------------------------------------------------------------------------
# Retailer registry
# -----------------------------------------------------------------------------
# Add a new retailer here once, then enable it via the SNIPPD_STORES env var
# (comma-separated slugs) or by changing DEFAULT_STORE_IDS below.
STORE_REGISTRY: Final[dict[str, dict[str, str]]] = {
    "walmart":     {"id": "walmart",     "name": "Walmart",      "origin": "https://www.walmart.com"},
    "aldi":        {"id": "aldi",        "name": "Aldi",         "origin": "https://www.aldi.us"},
    "target":      {"id": "target",      "name": "Target",       "origin": "https://www.target.com"},
    "kroger":      {"id": "kroger",      "name": "Kroger",       "origin": "https://www.kroger.com"},
    "publix":      {"id": "publix",      "name": "Publix",       "origin": "https://www.publix.com"},
    "heb":         {"id": "heb",         "name": "H-E-B",        "origin": "https://www.heb.com"},
    "costco":      {"id": "costco",      "name": "Costco",       "origin": "https://www.costco.com"},
    "sams_club":   {"id": "sams_club",   "name": "Sam's Club",   "origin": "https://www.samsclub.com"},
    "whole_foods": {"id": "whole_foods", "name": "Whole Foods",  "origin": "https://www.wholefoodsmarket.com"},
    "trader_joes": {"id": "trader_joes", "name": "Trader Joe's", "origin": "https://www.traderjoes.com"},
    "safeway":     {"id": "safeway",     "name": "Safeway",      "origin": "https://www.safeway.com"},
    "albertsons":  {"id": "albertsons",  "name": "Albertsons",   "origin": "https://www.albertsons.com"},
    "meijer":      {"id": "meijer",      "name": "Meijer",       "origin": "https://www.meijer.com"},
    "wegmans":     {"id": "wegmans",     "name": "Wegmans",      "origin": "https://www.wegmans.com"},
    "shoprite":    {"id": "shoprite",    "name": "ShopRite",     "origin": "https://www.shoprite.com"},
    "stop_shop":   {"id": "stop_shop",   "name": "Stop & Shop",  "origin": "https://www.stopandshop.com"},
    "food_lion":   {"id": "food_lion",   "name": "Food Lion",    "origin": "https://www.foodlion.com"},
    "giant_eagle": {"id": "giant_eagle", "name": "Giant Eagle",  "origin": "https://www.gianteagle.com"},
    "dollar_gen":  {"id": "dollar_gen",  "name": "Dollar General","origin": "https://www.dollargeneral.com"},
    "family_dollar": {"id": "family_dollar", "name": "Family Dollar", "origin": "https://www.familydollar.com"},
    "sprouts":     {"id": "sprouts",     "name": "Sprouts Farmers Market", "origin": "https://www.sprouts.com"},
    "cvs":         {"id": "cvs",         "name": "CVS Pharmacy", "origin": "https://www.cvs.com"},
    "walgreens":   {"id": "walgreens",   "name": "Walgreens",    "origin": "https://www.walgreens.com"},
    "bravo":       {"id": "bravo",       "name": "Bravo Supermarkets", "origin": "https://www.shopbravo.com"},
    "sav_a_lot":   {"id": "sav_a_lot",   "name": "Save A Lot",   "origin": "https://save-a-lot.com"},
    "key_foods":   {"id": "key_foods",   "name": "Key Food",     "origin": "https://www.keyfood.com"},
}

DEFAULT_STORE_IDS: Final[tuple[str, ...]] = (
    "walmart",
    "aldi",
    "target",
    "publix",
    "sprouts",
    "cvs",
    "walgreens",
    "trader_joes",
    "bravo",
    "sav_a_lot",
    "key_foods",
)


def _resolve_stores() -> tuple[dict[str, str], ...]:
    env_val = os.environ.get("SNIPPD_STORES", "").strip()
    ids = (
        tuple(s.strip().lower() for s in env_val.split(",") if s.strip())
        if env_val
        else DEFAULT_STORE_IDS
    )
    resolved: list[dict[str, str]] = []
    unknown: list[str] = []
    for sid in ids:
        if sid in STORE_REGISTRY:
            resolved.append(STORE_REGISTRY[sid])
        else:
            unknown.append(sid)
    if unknown:
        logger.warning(
            "SNIPPD_STORES contains unknown slug(s): %s. Known slugs: %s",
            ", ".join(unknown),
            ", ".join(sorted(STORE_REGISTRY.keys())),
        )
    if not resolved:
        resolved = [STORE_REGISTRY[s] for s in DEFAULT_STORE_IDS]
    return tuple(resolved)


CANONICAL_STORES: Final[tuple[dict[str, str], ...]] = _resolve_stores()

# Pair Google Search with other tools (ADK requires bypass when combining tools).
GoogleSearchToolDiscovery = GoogleSearchTool(bypass_multi_tools_limit=True)

_COMPLIANCE_BLOCK = """
## Compliance (non-negotiable)
- Use **Google Search only** for discovery (prices, availability, public rebate pages).
- **Never** scrape HTML, automate browsers, or log into user retailer or rebate **accounts**.
- **No** bulk page fetch beyond what the Search tool returns as discovery snippets/links.
- Provide **official deep links** only (retailer domains, Ibotta.com, Fetch.com, Checkout51.com).
- Do not fabricate SKUs, prices, or clip links. If uncertain, omit the field.
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def gen_content_config() -> Optional[Any]:
    if genai_types is None:
        return None
    return genai_types.GenerateContentConfig(
        temperature=0.15,
        top_p=0.9,
        max_output_tokens=8192,
    )


def agent_extra_kwargs() -> dict[str, Any]:
    gc = gen_content_config()
    return {} if gc is None else {"generate_content_config": gc}
