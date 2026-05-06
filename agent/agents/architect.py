"""
agent/agents/architect.py — Decision Engine

Implements the 5-step 'Behind the Curtain' workflow:

  A. Accept user_id + gps_coords
  B. [SECRET]  Neo4j → Compatibility Bridges
  C. [MAPS]    Google Maps grounding → 3 nearest canonical stores
  D. [SEARCH]  Google Search dynamic retrieval → 7 best items + 1 essential
               (live inventory check; pivot on out-of-stock)
  E. [OUTPUT]  Return ShoppingHaul with grounding_metadata links

Entry point:
    haul = await run_architect(user_id="uuid", gps_coords={"lat": 25.7617, "lng": -80.1918})

Errors are wrapped in ArchitectError. Raw Cypher / Gemini tracebacks
never reach the caller.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

import httpx
from pydantic import BaseModel, Field

from agents.shared import (
    GEMINI_MODEL,
    MAPS_API_KEY,
    MAPS_GROUNDING_NATIVE,
    build_maps_config,
    build_search_config,
    get_gemini_client,
)
from tools.graph_tool import find_compatibility_bridges, find_hidden_stacks

logger = logging.getLogger("snippd.agent.architect")


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------

class ArchitectError(RuntimeError):
    """Raised when the Architect cannot produce a haul. Safe to surface to users."""


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class GpsCoords(BaseModel):
    lat: float = Field(..., ge=-90.0, le=90.0)
    lng: float = Field(..., ge=-180.0, le=180.0)


class NearbyStore(BaseModel):
    name: str
    chain: str
    address: str
    lat: float
    lng: float
    distance_miles: float


class HaulItem(BaseModel):
    rank: int
    name: str
    brand: str
    category: str
    store: str
    store_chain: str
    price_cents: int                     # shelf price before coupons
    unit: str                            # e.g. "12 oz", "1 lb"
    coupon_applied: Optional[str]        # human-readable coupon text or null
    final_price_cents: int               # after coupon
    savings_cents: int
    in_stock: bool
    fallback_used: bool                  # True if this item pivoted from OOS
    grounding_url: Optional[str]         # source URL from Gemini grounding


class ShoppingHaul(BaseModel):
    user_id: str
    generated_at: str                    # ISO-8601 UTC
    stores: list[str]
    items: list[HaulItem]                # exactly 7 ranked items
    essential: HaulItem                  # 1 staple item
    compatibility_bridges: list[dict]   # raw Neo4j bridge objects
    hidden_stacks: list[dict]           # raw Neo4j stack objects
    grounding_metadata: list[dict]       # [{uri, title}] from Gemini search
    total_savings_cents: int


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _parse_json(text: str) -> dict:
    """
    Robustly extract a JSON object from Gemini text output.
    Handles raw JSON, markdown ```json blocks, and leading/trailing prose.
    Raises ValueError if nothing parseable is found.
    """
    text = text.strip()

    # 1. Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip markdown code fence
    match = re.search(r"```(?:json)?\s*([\s\S]+?)\s*```", text, re.IGNORECASE)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Find first { ... } block in the text
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end > start:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"No valid JSON found in Gemini response (first 300 chars): {text[:300]}")


def _extract_grounding_metadata(response) -> list[dict]:
    """Pull source URLs from Gemini's grounding_metadata field (if present)."""
    metadata: list[dict] = []
    try:
        candidate = response.candidates[0]
        chunks = candidate.grounding_metadata.grounding_chunks or []
        for chunk in chunks:
            if hasattr(chunk, "web") and chunk.web:
                metadata.append(
                    {"uri": chunk.web.uri, "title": getattr(chunk.web, "title", "")}
                )
    except (AttributeError, IndexError, TypeError):
        pass
    return metadata


# ---------------------------------------------------------------------------
# Step C — Find 3 Nearest Stores
# ---------------------------------------------------------------------------

# Google Maps Places API (New) — used when native Gemini Maps grounding is
# not available in the installed SDK version.
_PLACES_URL = "https://places.googleapis.com/v1/places:searchNearby"
_STORE_CHAINS = ["supermarket", "grocery_store", "pharmacy", "convenience_store"]


async def _find_nearest_stores_via_maps_api(
    lat: float, lng: float
) -> list[NearbyStore]:
    """
    Calls Google Maps Places API (New) to find the 3 nearest grocery /
    pharmacy stores. Returns NearbyStore objects sorted by distance.
    """
    payload = {
        "includedTypes": _STORE_CHAINS,
        "maxResultCount": 5,
        "locationRestriction": {
            "circle": {
                "center": {"latitude": lat, "longitude": lng},
                "radius": 12000.0,  # 12 km search radius
            }
        },
        "rankPreference": "DISTANCE",
    }
    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": MAPS_API_KEY,
        "X-Goog-FieldMask": (
            "places.displayName,places.formattedAddress,"
            "places.location,places.primaryTypeDisplayName"
        ),
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(_PLACES_URL, json=payload, headers=headers)
        resp.raise_for_status()
        data = resp.json()

    stores: list[NearbyStore] = []
    for place in (data.get("places") or [])[:3]:
        loc = place.get("location", {})
        place_lat = loc.get("latitude", lat)
        place_lng = loc.get("longitude", lng)

        # Approximate distance in miles (haversine-lite)
        dlat = abs(place_lat - lat) * 69.0
        dlng = abs(place_lng - lng) * 54.6
        dist_miles = round((dlat**2 + dlng**2) ** 0.5, 2)

        name_obj = place.get("displayName", {})
        raw_name: str = (
            name_obj.get("text", "") if isinstance(name_obj, dict) else str(name_obj)
        )

        chain = raw_name.lower().replace(" ", "_").split("_")[0]

        stores.append(
            NearbyStore(
                name=raw_name,
                chain=chain,
                address=place.get("formattedAddress", ""),
                lat=place_lat,
                lng=place_lng,
                distance_miles=dist_miles,
            )
        )

    return stores


async def _find_nearest_stores_via_gemini(
    lat: float, lng: float
) -> list[NearbyStore]:
    """
    Uses Gemini 2.5-Flash with native Google Maps grounding to locate
    the 3 nearest grocery / pharmacy stores. Only reached when
    MAPS_GROUNDING_NATIVE is True (enterprise SDK).
    """
    client = get_gemini_client()
    prompt = (
        f"Find the 3 nearest grocery stores or pharmacies to GPS coordinates "
        f"latitude={lat}, longitude={lng}. "
        "Return ONLY a JSON array with exactly 3 objects — no prose, no markdown:\n"
        '[{"name":"...","chain":"target|walmart|kroger|cvs|walgreens|publix|aldi|trader_joes|whole_foods|costco|other","address":"...","lat":0.0,"lng":0.0,"distance_miles":0.0}]'
    )

    response = await client.aio.models.generate_content(
        model=GEMINI_MODEL,
        contents=prompt,
        config=build_maps_config(),
    )

    raw = response.text or ""
    parsed = _parse_json(raw)

    if isinstance(parsed, list):
        store_list = parsed
    elif "stores" in parsed:
        store_list = parsed["stores"]
    else:
        store_list = list(parsed.values())[0] if parsed else []

    return [NearbyStore(**s) for s in store_list[:3]]


async def _find_nearest_stores(lat: float, lng: float) -> list[NearbyStore]:
    """
    Route to the appropriate Maps implementation.
    Falls back gracefully if both methods fail.
    """
    try:
        if MAPS_GROUNDING_NATIVE:
            return await _find_nearest_stores_via_gemini(lat, lng)
        return await _find_nearest_stores_via_maps_api(lat, lng)
    except Exception as exc:  # noqa: BLE001
        logger.error("Store lookup failed: %s", exc, exc_info=True)
        raise ArchitectError(
            "Unable to locate nearby stores. Please try again."
        ) from exc


# ---------------------------------------------------------------------------
# Step D — Build 7+1 Shopping Haul
# ---------------------------------------------------------------------------

_HAUL_SYSTEM_PROMPT = """
You are Snippd's Sovereign Intelligence engine — a precision shopping analyst.
Your job: build the single best 7+1 Shopping Haul for a user based on live data.

RULES (non-negotiable):
1. Use Google Search grounding to verify LIVE inventory and price for every item.
2. If any item is OUT OF STOCK, you MUST pivot to the next best alternative in the
   same category. Set "fallback_used": true and "in_stock": true on the replacement.
3. Apply compatibility bridge coupons wherever possible (cross-retailer stacking).
4. The 7 ranked items should represent the best savings opportunity across ALL stores.
5. The 1 essential item must be a staple: eggs, milk, bread, butter, or rice.
6. For every item, include a grounding_url pointing to the live price/product page.
7. Return ONLY valid JSON — no markdown, no prose, nothing else.

OUTPUT SCHEMA (strict):
{
  "items": [
    {
      "rank": 1,
      "name": "Product name",
      "brand": "Brand",
      "category": "produce|dairy|meat|bakery|frozen|pantry|health|household|other",
      "store": "Store Name",
      "store_chain": "lowercase_chain_key",
      "price_cents": 299,
      "unit": "12 oz",
      "coupon_applied": "$1.00 off (Manufacturer)" or null,
      "final_price_cents": 199,
      "savings_cents": 100,
      "in_stock": true,
      "fallback_used": false,
      "grounding_url": "https://..."
    }
  ],
  "essential": { ...same schema, rank: 8... },
  "total_savings_cents": 100
}
"""


def _build_haul_prompt(
    user_id: str,
    stores: list[NearbyStore],
    bridges: list[dict],
    stacks: list[dict],
) -> str:
    store_lines = "\n".join(
        f"  • {s.name} ({s.chain}) — {s.distance_miles} miles — {s.address}"
        for s in stores
    )

    bridge_lines = (
        "\n".join(
            f"  • {b.get('discount')} issued by {b.get('issuer_store')} "
            f"— also valid at: {', '.join(b.get('accepted_at_stores', []))}"
            for b in bridges[:10]
        )
        or "  None found"
    )

    stack_lines = (
        "\n".join(
            f"  • {s.get('discount')} ({s.get('coupon_type')}) "
            f"for {s.get('brand')} @ {s.get('store_name')}"
            for s in stacks[:15]
        )
        or "  None found"
    )

    return (
        f"Build a 7+1 Shopping Haul for Snippd user {user_id}.\n\n"
        f"NEARBY STORES:\n{store_lines}\n\n"
        f"COMPATIBILITY BRIDGES (cross-store coupons from Neo4j):\n{bridge_lines}\n\n"
        f"USER'S CLIPPED COUPONS (from Neo4j):\n{stack_lines}\n\n"
        "Use Google Search to verify live inventory and prices at these stores.\n"
        "Pivot immediately on any out-of-stock item.\n"
        "Return the JSON haul now."
    )


async def _build_shopping_haul(
    user_id: str,
    stores: list[NearbyStore],
    bridges: list[dict],
    stacks: list[dict],
) -> tuple[list[HaulItem], HaulItem, list[dict], int]:
    """
    Returns (items, essential, grounding_metadata, total_savings_cents).
    Raises ArchitectError on unrecoverable failure.
    """
    client = get_gemini_client()
    prompt = _build_haul_prompt(user_id, stores, bridges, stacks)

    try:
        response = await client.aio.models.generate_content(
            model=GEMINI_MODEL,
            contents=[
                {"role": "user", "parts": [{"text": _HAUL_SYSTEM_PROMPT}]},
                {"role": "model", "parts": [{"text": "Understood. I will follow all rules exactly and return only JSON."}]},
                {"role": "user", "parts": [{"text": prompt}]},
            ],
            config=build_search_config(temperature=0.1),
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("Gemini haul generation failed: %s", exc, exc_info=True)
        raise ArchitectError("Shopping intelligence temporarily unavailable.") from exc

    grounding_meta = _extract_grounding_metadata(response)
    raw_text = response.text or ""

    try:
        parsed = _parse_json(raw_text)
    except ValueError as exc:
        logger.error("Haul JSON parse failed. Raw: %s", raw_text[:500])
        raise ArchitectError("Haul generation returned unparseable data.") from exc

    # Map raw dicts to HaulItem, tolerating minor schema differences
    raw_items: list[dict] = parsed.get("items", [])
    raw_essential: dict = parsed.get("essential", {})
    total_savings: int = int(parsed.get("total_savings_cents", 0))

    store_lookup = {s.chain: s.name for s in stores}

    def _coerce_item(d: dict, rank: int) -> HaulItem:
        chain = str(d.get("store_chain", "")).lower()
        return HaulItem(
            rank=d.get("rank", rank),
            name=str(d.get("name", "Unknown item")),
            brand=str(d.get("brand", "")),
            category=str(d.get("category", "other")),
            store=str(d.get("store", store_lookup.get(chain, "Unknown store"))),
            store_chain=chain,
            price_cents=int(d.get("price_cents", 0)),
            unit=str(d.get("unit", "")),
            coupon_applied=d.get("coupon_applied"),
            final_price_cents=int(d.get("final_price_cents", d.get("price_cents", 0))),
            savings_cents=int(d.get("savings_cents", 0)),
            in_stock=bool(d.get("in_stock", True)),
            fallback_used=bool(d.get("fallback_used", False)),
            grounding_url=d.get("grounding_url"),
        )

    items = [_coerce_item(d, i + 1) for i, d in enumerate(raw_items[:7])]

    if not raw_essential:
        # Safety net: synthesise a basic essential if Gemini omitted it
        raw_essential = {
            "rank": 8,
            "name": "Large Eggs (12 ct)",
            "brand": "",
            "category": "dairy",
            "store": stores[0].name if stores else "Unknown",
            "store_chain": stores[0].chain if stores else "",
            "price_cents": 399,
            "unit": "12 ct",
            "coupon_applied": None,
            "final_price_cents": 399,
            "savings_cents": 0,
            "in_stock": True,
            "fallback_used": True,
            "grounding_url": None,
        }

    essential = _coerce_item(raw_essential, 8)

    return items, essential, grounding_meta, total_savings


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

async def run_architect(
    user_id: str,
    gps_coords: dict,
) -> ShoppingHaul:
    """
    Run the full 5-step Decision Engine for a single user.

    Args:
        user_id:    Supabase auth UUID string.
        gps_coords: {"lat": float, "lng": float}

    Returns:
        ShoppingHaul — a fully structured 7+1 haul with grounding links.

    Raises:
        ArchitectError — on any unrecoverable failure (safe message, no internals).
        ValueError      — if gps_coords schema is invalid.
    """

    coords = GpsCoords(**gps_coords)

    # ── Step B ── SECRET: Compatibility Bridge Discovery ───────────────────
    logger.info("[B] Fetching compatibility bridges for user %s", user_id)
    bridges = find_compatibility_bridges(user_id)
    logger.info("[B] %d bridges found", len(bridges))

    # ── Step C ── MAPS: 3 Nearest Canonical Stores ─────────────────────────
    logger.info("[C] Locating nearest stores near (%s, %s)", coords.lat, coords.lng)
    stores = await _find_nearest_stores(coords.lat, coords.lng)
    if not stores:
        raise ArchitectError("No stores found near your location.")
    logger.info("[C] Stores: %s", [s.name for s in stores])

    # ── Step B (refined) ── Filter bridges & stacks to confirmed stores ────
    store_chains_for_filter = [s.chain for s in stores] # Use chains for Neo4j filter
    stacks = find_hidden_stacks(
        user_id=user_id,
        stores=store_chains_for_filter,
        gps_coords={"lat": coords.lat, "lng": coords.lng},
    )
    logger.info("[B] %d hidden stacks after store filter", len(stacks))

    # ── Step D ── SEARCH: Dynamic Retrieval — 7+1 Haul ────────────────────
    logger.info("[D] Building shopping haul via Gemini + Google Search grounding")
    items, essential, grounding_meta, total_savings = await _build_shopping_haul(
        user_id=user_id,
        stores=stores,
        bridges=bridges,
        stacks=stacks,
    )
    logger.info("[D] Haul complete — %d items, essential: %s", len(items), essential.name)

    # ── Step E ── OUTPUT ───────────────────────────────────────────────────
    haul = ShoppingHaul(
        user_id=user_id,
        generated_at=datetime.now(tz=timezone.utc).isoformat(),
        stores=[s.name for s in stores], # The ShoppingHaul model expects store names
        items=items,
        essential=essential,
        compatibility_bridges=bridges,
        hidden_stacks=stacks,
        grounding_metadata=grounding_meta,
        total_savings_cents=total_savings,
    )
    logger.info(
        "[E] ShoppingHaul ready for %s — total savings: $%.2f",
        user_id,
        total_savings / 100,
    )
    return haul
