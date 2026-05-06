"""
agent/tools/graph_tool.py — Graph Engine

Two public functions:

  find_compatibility_bridges(user_id)
      Discovers which stores ACCEPT coupons issued by OTHER stores for this user
      (e.g. "Target accepts CVS coupons"). Runs before the Maps step so the
      Architect knows what cross-retailer arbitrage is possible upfront.

  find_hidden_stacks(user_id, stores, gps_coords, radius_km)
      Finds every valid coupon the user holds that can be redeemed at the
      supplied stores, optionally filtered by GPS proximity using Neo4j's
      native point() type.

Both functions are safe to call concurrently. Neo4j errors are caught,
logged, and return empty lists — they never propagate to the user.
"""

from __future__ import annotations

import logging
from typing import Optional

from agents.shared import Neo4jDriver

logger = logging.getLogger("snippd.agent.graph_tool")


# ---------------------------------------------------------------------------
# Step B — Compatibility Bridge Discovery (runs BEFORE the Maps step)
# ---------------------------------------------------------------------------

_COMPATIBILITY_BRIDGE_CYPHER = """
MATCH (u:User {user_id: $user_id})-[:HAS_COUPON]->(c:Coupon)
MATCH (c)-[:VALID_AT]->(issuer:Store)
OPTIONAL MATCH (issuer)-[:ACCEPTS_COUPON_FROM]-(partner:Store)
WHERE (c.expires_at > datetime() OR c.expires_at IS NULL)
  AND c.is_active = true
WITH
    c.coupon_id      AS coupon_id,
    c.discount_text  AS discount,
    c.discount_value AS discount_value,
    c.category       AS category,
    c.brand          AS brand,
    issuer.name      AS issuer_store,
    issuer.chain     AS issuer_chain,
    collect(DISTINCT partner.name) AS accepted_at_stores
WHERE size(accepted_at_stores) > 0
RETURN
    coupon_id,
    discount,
    discount_value,
    category,
    brand,
    issuer_store,
    issuer_chain,
    accepted_at_stores
ORDER BY discount_value DESC
LIMIT 50
"""


def find_compatibility_bridges(user_id: str) -> list[dict]:
    """
    Return all cross-retailer compatibility bridges for a user.

    A bridge exists when:
      (User)-[:HAS_COUPON]->(Coupon)-[:VALID_AT]->(IssuerStore)
      AND
      (IssuerStore)-[:ACCEPTS_COUPON_FROM]-(PartnerStore)

    Example return value:
      [
        {
          "coupon_id": "cpn_abc123",
          "discount": "20% off vitamins",
          "discount_value": 20.0,
          "category": "health",
          "brand": "Nature Made",
          "issuer_store": "CVS",
          "issuer_chain": "cvs",
          "accepted_at_stores": ["Target", "Walmart"]
        },
        ...
      ]
    """
    try:
        with Neo4jDriver.get().session() as session:
            result = session.run(_COMPATIBILITY_BRIDGE_CYPHER, user_id=user_id)
            bridges = [dict(record) for record in result]
            logger.info(
                "Compatibility bridges for %s: %d found", user_id, len(bridges)
            )
            return bridges
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "find_compatibility_bridges failed for user %s: %s",
            user_id,
            exc,
            exc_info=True,
        )
        return []


# ---------------------------------------------------------------------------
# Step D support — Hidden Stack Discovery (runs AFTER the Maps step)
# ---------------------------------------------------------------------------

_HIDDEN_STACKS_CYPHER = """
MATCH (u:User {user_id: $user_id})-[:HAS_COUPON]->(c:Coupon)-[:VALID_AT]->(s:Store)
WHERE
    (size($stores) = 0 OR s.chain IN $stores)
    AND (c.expires_at > datetime() OR c.expires_at IS NULL)
    AND c.is_active = true
    AND (
        $lat IS NULL
        OR point.distance(
            s.location,
            point({latitude: $lat, longitude: $lng, crs: 'WGS-84'})
           ) <= $radius_m
    )
RETURN
    c.coupon_id      AS coupon_id,
    c.discount_text  AS discount,
    c.discount_value AS discount_value,
    c.category       AS category,
    c.brand          AS brand,
    c.coupon_type    AS coupon_type,
    c.stack_group    AS stack_group,
    s.name           AS store_name,
    s.address        AS store_address,
    s.chain          AS store_chain,
    CASE
        WHEN $lat IS NOT NULL THEN
            point.distance(
                s.location,
                point({latitude: $lat, longitude: $lng, crs: 'WGS-84'})
            )
        ELSE null
    END              AS distance_m
ORDER BY c.discount_value DESC
LIMIT 100
"""


def find_hidden_stacks(
    user_id: str,
    stores: list[str],
    gps_coords: Optional[dict] = None,
    radius_km: float = 8.0,
) -> list[dict]:
    """
    Find every stackable coupon the user holds that is valid at the given stores.

    Args:
        user_id:    Supabase auth UUID.
        stores:     List of canonical store names (e.g. ["Target", "Publix"]).
                    Pass [] to search across ALL stores the user has coupons for.
        gps_coords: Optional {"lat": float, "lng": float}. When provided, only
                    stores within `radius_km` are returned, ranked by distance.
                    Uses Neo4j native point() — no post-processing required.
        radius_km:  Search radius in kilometres (default 8 km ≈ 5 miles).

    Returns:
        List of coupon dicts, ordered by discount_value DESC.

    Example return value:
        [
          {
            "coupon_id":     "cpn_xyz",
            "discount":      "$1.50 off any Tide",
            "discount_value": 1.50,
            "category":      "laundry",
            "brand":         "Tide",
            "coupon_type":   "MFR",
            "stack_group":   "manufacturer",
            "store_name":    "Target",
            "store_address": "123 Main St",
            "store_chain":   "target",
            "distance_m":    1842.3
          },
          ...
        ]
    """
    lat: Optional[float] = None
    lng: Optional[float] = None

    if gps_coords:
        lat = float(gps_coords["lat"])
        lng = float(gps_coords["lng"])

    radius_m = radius_km * 1000.0

    try:
        with Neo4jDriver.get().session() as session:
            result = session.run(
                _HIDDEN_STACKS_CYPHER,
                user_id=user_id,
                stores=stores,
                lat=lat,
                lng=lng,
                radius_m=radius_m,
            )
            stacks = [dict(record) for record in result]
            logger.info(
                "Hidden stacks for %s at stores=%s: %d found",
                user_id,
                stores,
                len(stacks),
            )
            return stacks
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "find_hidden_stacks failed for user %s: %s",
            user_id,
            exc,
            exc_info=True,
        )
        return []
