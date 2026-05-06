from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from typing import Any

try:
    from google.adk.agents import Agent
    from google.adk.agents.readonly_context import ReadonlyContext
except Exception:  # pragma: no cover - local environments may not have ADK yet
    Agent = None  # type: ignore
    ReadonlyContext = object  # type: ignore

try:
    from supabase import create_client
except Exception:  # pragma: no cover
    create_client = None  # type: ignore

try:
    import neo4j
except Exception:  # pragma: no cover
    neo4j = None  # type: ignore


TARGET_RETAILERS = [
    {"id": "publix", "name": "Publix", "class": "grocery"},
    {"id": "winn_dixie", "name": "Winn-Dixie", "class": "grocery"},
    {"id": "aldi", "name": "Aldi", "class": "grocery"},
    {"id": "kroger", "name": "Kroger Physical", "class": "grocery"},
    {"id": "kroger_delivery", "name": "Kroger Delivery", "class": "grocery"},
    {"id": "cvs", "name": "CVS", "class": "pharmacy_household"},
    {"id": "walgreens", "name": "Walgreens", "class": "pharmacy_household"},
    {"id": "dollar_general", "name": "Dollar General", "class": "discount_essentials"},
]
TARGET_RETAILERS_BY_ID = {retailer["id"]: retailer for retailer in TARGET_RETAILERS}
DEFAULT_BUDGET_CENTS = 10000
MIN_SAVINGS_PERCENT = 40.0
REASONABLE_ITEM_LIMIT = 10
SNIPPD_BRANDS = [
    "Snippd Budget Stack",
    "Snippd Household Stack",
    "Snippd Under-Budget Basket",
    "Snippd Smart Cart",
]

DEFAULT_MODEL = os.environ.get("ADK_MODEL", "gemini-2.5-flash")
COMPLIANCE_BLOCK = """
## Non-Negotiable Trust Rules
- Do not invent prices, coupons, rebate values, nutrition facts, or stock status.
- Every stack must pass Cloud Run `checkout-math` before funding or display as approved.
- If no 60%+ stack exists, return `LOW_YIELD_WEEK`.
- Health and allergy substitutions are deterministic guardrails, not medical advice.
- Users must verify physical product labels before purchase or consumption.
"""


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _supabase_client():
    if create_client is None:
        return None, "supabase client unavailable"
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return None, "supabase env missing"
    return create_client(url, key), None


def query_stack_candidates(retailer_ids: list[str] | None = None, market: str | None = None) -> dict[str, Any]:
    sb, error = _supabase_client()
    if error:
        return {"ok": False, "error": error, "candidates": []}

    query = (
        sb.table("stack_candidates")
        .select("*")
        .eq("is_active", True)
        .limit(300)
    )
    if retailer_ids:
        query = query.in_("retailer_key", retailer_ids)
    if market:
        query = query.eq("market", market)
    result = query.execute()
    return {"ok": True, "candidates": result.data or []}


def _amount(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _cents_from_value(value: Any, key: str = "") -> int:
    amount = _amount(value)
    if key.endswith("_cents") or abs(amount) > 1000:
        return int(round(amount))
    return int(round(amount * 100))


def _money_cents(row: dict[str, Any], *keys: str) -> int:
    for key in keys:
        if row.get(key) is None:
            continue
        return _cents_from_value(row.get(key), key)
    return 0


def _money_amount(row: dict[str, Any], *keys: str) -> float:
    return round(_money_cents(row, *keys) / 100, 2)


def _confidence(row: dict[str, Any]) -> float | None:
    value = row.get("confidence_pct")
    if value is None:
        value = row.get("confidence_score")
    if value is None:
        value = row.get("stack_rank_score")
    if value is None:
        return None

    score = _amount(value)
    return round(score * 100, 1) if 0 < score <= 1 else round(score, 1)


def _retailer_ids_for_request(request: str | None) -> list[str]:
    text = str(request or "").lower()
    return [
        retailer_id
        for retailer_id in TARGET_RETAILERS_BY_ID
        if retailer_id.replace("_", " ") in text or retailer_id in text
    ] or list(TARGET_RETAILERS_BY_ID)


def resolve_live_stacks(retailer_ids: list[str] | None = None, market: str | None = None) -> list[dict[str, Any]]:
    rows = query_stack_candidates(retailer_ids, market)
    candidates = rows.get("candidates", []) if isinstance(rows, dict) else rows

    valid_stacks = []
    for r in candidates:
        coupon_value = _money_amount(
            r,
            "coupon_value",
            "coupon_amount",
            "coupon_savings",
            "coupon_value_cents",
            "coupon_savings_cents",
        )
        price = _money_amount(
            r,
            "price",
            "base_price",
            "price_at_rec",
            "regular_price",
            "original_price",
            "final_estimated_cents",
        )
        deal_type = str(r.get("deal_type") or r.get("stack_type") or "").upper()
        if not deal_type and r.get("is_bogo"):
            deal_type = "BOGO"

        if deal_type == "BOGO" and coupon_value > 0:
            final_price = _money_amount(r, "final_price", "final_estimated_cents")
            if final_price <= 0:
                final_price = max(price - coupon_value, 0)
            savings_percent = round((coupon_value / price) * 100, 1) if price > 0 else 0.0
            valid_stacks.append({
                "store": r.get("retailer") or r.get("retailer_key") or r.get("store_name"),
                "item": r.get("product_name") or r.get("item_name") or r.get("title"),
                "deal_type": deal_type,
                "coupon_value": round(coupon_value, 2),
                "final_price": round(final_price, 2),
                "savings_percent": savings_percent,
                "confidence": _confidence(r),
                "source": (
                    r.get("exact_coupon_url")
                    or r.get("source_url")
                    or r.get("source_page_url")
                    or r.get("source")
                    or _source_value(r)
                    or r.get("offer_source_id")
                    or "stack_candidates"
                ),
            })

    return valid_stacks[:5]


def format_simple_output(stacks: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "status": "APPROVED" if stacks else "LOW_YIELD_WEEK",
        "current_time_utc": utc_now_iso(),
        "stacks": stacks,
        "requires_checkout_math": False,
        "mode": "live_stack_bypass",
    }


def fetch_retailer_policies(retailer_ids: list[str] | None = None) -> dict[str, Any]:
    sb, error = _supabase_client()
    if error:
        return {"ok": False, "error": error, "policies": []}

    try:
        query = sb.table("retailer_coupon_parameters").select("*")
        if retailer_ids:
            query = query.in_("retailer_key", retailer_ids)
        result = query.execute()
        return {"ok": True, "policies": result.data or []}
    except Exception:
        try:
            query = sb.table("retailer_coupon_parameters").select("*")
            if retailer_ids:
                query = query.in_("retailer_id", retailer_ids)
            result = query.execute()
            return {"ok": True, "policies": result.data or []}
        except Exception as exc:
            return {"ok": False, "error": str(exc), "policies": []}


def fetch_user_budget_cents(user_id: str, default: int = DEFAULT_BUDGET_CENTS) -> int:
    if not re.fullmatch(r"[0-9a-fA-F-]{32,36}", str(user_id or "")):
        return default

    sb, error = _supabase_client()
    if error:
        return default

    try:
        result = (
            sb.table("profiles")
            .select("weekly_budget, weekly_budget_cents")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        profile = (result.data or [None])[0] or {}
        return int(profile.get("weekly_budget_cents") or profile.get("weekly_budget") or default)
    except Exception:
        return default


def fetch_digital_coupons(retailer_ids: list[str] | None = None) -> dict[str, Any]:
    sb, error = _supabase_client()
    if error:
        return {"ok": False, "error": error, "coupons": []}

    try:
        query = (
            sb.table("digital_coupons")
            .select("*")
            .eq("is_active", True)
            .limit(500)
        )
        if retailer_ids:
            query = query.in_("retailer_key", retailer_ids)
        result = query.execute()
        return {"ok": True, "coupons": result.data or []}
    except Exception as exc:
        return {"ok": False, "error": str(exc), "coupons": []}


def get_user_intelligence(user_id: str) -> dict[str, Any]:
    if neo4j is None:
        return {"preferred_brands": [], "meal_modes": []}
    uri = os.environ.get("NEO4J_URI")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD")
    if not uri or not password:
        return {"preferred_brands": [], "meal_modes": []}

    driver = neo4j.GraphDatabase.driver(uri, auth=(user, password))
    try:
        with driver.session() as session:
            brands = session.run(
                "MATCH (u:User {id: $uid})-[:PREFERS]->(b:Brand) RETURN b.name AS brand LIMIT 20",
                uid=user_id,
            )
            meals = session.run(
                "MATCH (u:User {id: $uid})-[:PREFERS]->(m:MealMode) RETURN m.name AS mode LIMIT 20",
                uid=user_id,
            )
            return {
                "preferred_brands": [record["brand"] for record in brands],
                "meal_modes": [record["mode"] for record in meals],
            }
    finally:
        driver.close()


def _as_list(value: Any) -> list[Any]:
    return value if isinstance(value, list) else []


def _text_blob(row: dict[str, Any]) -> str:
    parts = [
        row.get("stack_type"),
        row.get("deal_type"),
        row.get("coupon_type"),
        row.get("promotion_type"),
        row.get("deal_label"),
        row.get("title"),
        row.get("description"),
        row.get("source_summary"),
    ]
    return " ".join(str(part) for part in parts if part).lower()


def _is_expired(row: dict[str, Any]) -> bool:
    for key in ("valid_to", "valid_until", "expires_at", "expiration_date"):
        raw = row.get(key)
        if not raw:
            continue
        try:
            dt = datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt < datetime.now(timezone.utc)
        except ValueError:
            continue
    return False


def _store_name(row: dict[str, Any]) -> str:
    key = row.get("retailer") or row.get("retailer_key") or row.get("store_name") or row.get("store")
    if not key:
        return ""
    return str(key).replace("_", " ").title()


def _item_name(row: dict[str, Any]) -> str:
    return str(row.get("product_name") or row.get("item_name") or row.get("title") or row.get("name") or "").strip()


def _source_value(row: dict[str, Any]) -> str:
    profile = row.get("preference_profile")
    profile_source = profile.get("source") if isinstance(profile, dict) else None
    return str(
        row.get("exact_coupon_url")
        or row.get("source_url")
        or row.get("source_page_url")
        or row.get("source")
        or profile_source
        or row.get("offer_source_id")
        or "stack_candidates"
    )


def _mechanisms(row: dict[str, Any]) -> set[str]:
    blob = _text_blob(row)
    mechanisms: set[str] = set()
    deal_type = str(row.get("deal_type") or row.get("stack_type") or "").upper()
    if row.get("is_bogo") or "BOGO" in deal_type or "bogo" in blob or "buy one" in blob:
        mechanisms.add("BOGO")
    if row.get("has_coupon") or _money_cents(row, "coupon_value", "coupon_amount", "coupon_savings", "coupon_value_cents", "coupon_savings_cents") > 0:
        mechanisms.add("DIGITAL_COUPON")
    if "threshold" in blob or re.search(r"\$\s*\d+\s*off\s*\$\s*\d+", blob):
        mechanisms.add("THRESHOLD_COUPON")
    if "promo" in blob or "trigger" in blob or "buy x" in blob or "participating" in blob:
        mechanisms.add("PROMO_TRIGGER")
    if "rebate" in blob or _money_cents(row, "rebate_value", "rebate_savings", "rebate_value_cents", "rebate_cents") > 0:
        mechanisms.add("REBATE")
    if _money_cents(row, "sale_savings", "sale_savings_cents") > 0:
        mechanisms.add("SALE")
    return mechanisms


def classify_stack_type(row: dict[str, Any]) -> str:
    mechanisms = _mechanisms(row)
    blob = _text_blob(row)
    coupon_cents = _money_cents(row, "coupon_value", "coupon_amount", "coupon_savings", "coupon_value_cents", "coupon_savings_cents")
    rebate_cents = _money_cents(row, "rebate_value", "rebate_savings", "rebate_value_cents", "rebate_cents")
    price_cents = _money_cents(row, "base_price", "price", "price_at_rec", "regular_price", "original_price", "final_estimated_cents")

    if coupon_cents + rebate_cents > 0 and price_cents > 0 and coupon_cents + rebate_cents > price_cents:
        return "OVERAGE_STACK"
    if "THRESHOLD_COUPON" in mechanisms:
        return "THRESHOLD_STACK"
    if "PROMO_TRIGGER" in mechanisms:
        return "PROMO_TRIGGER_STACK"
    if "BOGO" in mechanisms:
        return "BOGO_STACK"
    if "DIGITAL_COUPON" in mechanisms:
        return "DIGITAL_COUPON_STACK"
    if "basket" in blob or len(mechanisms) >= 2:
        return "BASKET_ENGINEERED_STACK"
    return "BASKET_ENGINEERED_STACK"


def calculate_stack_math(row: dict[str, Any], policy: dict[str, Any] | None = None) -> dict[str, Any]:
    name = _item_name(row)
    store = _store_name(row)
    regular_cents = _money_cents(row, "base_price", "price", "price_at_rec", "regular_price", "original_price")
    final_cents = _money_cents(row, "final_price", "final_estimated_cents", "sale_price", "pay_price")
    coupon_cents = _money_cents(row, "coupon_value", "coupon_amount", "coupon_savings", "coupon_value_cents", "coupon_savings_cents")
    sale_cents = _money_cents(row, "sale_savings", "sale_savings_cents")
    rebate_cents = _money_cents(row, "rebate_value", "rebate_savings", "rebate_value_cents", "rebate_cents")
    auto_discount_cents = _money_cents(row, "auto_discount", "auto_discount_cents", "promo_savings", "promo_savings_cents")
    mechanisms = _mechanisms(row)
    stack_type = classify_stack_type(row)

    if regular_cents <= 0 and final_cents > 0:
        regular_cents = final_cents + coupon_cents + sale_cents + auto_discount_cents
    if regular_cents <= 0:
        return {"ok": False, "reason": "no price"}
    if final_cents <= 0:
        final_cents = max(regular_cents - coupon_cents - sale_cents - auto_discount_cents, 0)

    if stack_type == "BOGO_STACK" and "BOGO" in mechanisms:
        bogo_discount = regular_cents if sale_cents <= 0 else sale_cents
        sale_cents = max(sale_cents, bogo_discount)
        final_cents = max((regular_cents * 2) - sale_cents - coupon_cents - auto_discount_cents, 0)
        regular_for_percent = regular_cents * 2
    else:
        regular_for_percent = regular_cents

    total_discount_cents = max(0, regular_for_percent - final_cents) + rebate_cents
    overage_cents = max(0, coupon_cents + rebate_cents + auto_discount_cents - regular_for_percent)
    savings_percent = round((total_discount_cents / regular_for_percent) * 100, 1) if regular_for_percent > 0 else 0.0

    reject_reason = None
    if not name:
        reject_reason = "missing product name"
    elif not store:
        reject_reason = "missing retailer/store"
    elif _is_expired(row):
        reject_reason = "expired offer"
    elif not mechanisms:
        reject_reason = "no verified savings mechanism"
    elif stack_type == "PROMO_TRIGGER_STACK" and not (row.get("required_qty") or row.get("trigger_qty") or "PROMO_TRIGGER" in mechanisms):
        reject_reason = "unclear promo trigger"
    elif final_cents < 0:
        reject_reason = "final math cannot be reproduced"

    return {
        "ok": reject_reason is None,
        "reason": reject_reason,
        "store": store,
        "store_key": str(row.get("retailer_key") or row.get("retailer") or "").lower(),
        "name": name,
        "stack_type": "OVERAGE_STACK" if overage_cents > 0 else stack_type,
        "price_cents": regular_cents,
        "subtotal_cents": regular_for_percent,
        "coupon_value_cents": coupon_cents,
        "sale_savings_cents": sale_cents,
        "rebate_value_cents": rebate_cents,
        "auto_discount_cents": auto_discount_cents,
        "total_discount_cents": total_discount_cents,
        "final_price_cents": final_cents,
        "savings_percent": savings_percent,
        "confidence_score": _confidence(row) or 0,
        "mechanisms": sorted(mechanisms),
        "source": _source_value(row),
        "raw": row,
    }


def _policy_by_retailer(policies: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for policy in policies:
        retailer = str(policy.get("retailer_key") or policy.get("retailer_id") or "").lower()
        if not retailer:
            continue
        grouped.setdefault(retailer, {})[str(policy.get("policy_key"))] = policy.get("policy_value")
    return grouped


def _preference_match(math: dict[str, Any], preferences: dict[str, Any]) -> float:
    raw = math.get("raw", {})
    brand = str(raw.get("brand") or "").lower()
    category = str(raw.get("category") or "").lower()
    store = str(math.get("store_key") or "").lower()
    score = 50.0
    preferred_brands = [str(v).lower() for v in _as_list(preferences.get("preferred_brands"))]
    preferred_stores = [str(v).lower() for v in _as_list(preferences.get("preferred_stores"))]
    ignored_categories = [str(v).lower() for v in _as_list(preferences.get("ignored_categories"))]
    household_needs = [str(v).lower() for v in _as_list(preferences.get("household_needs"))]

    if brand and brand in preferred_brands:
        score += 25
    if store and store in preferred_stores:
        score += 20
    if category and category in household_needs:
        score += 15
    if category and category in ignored_categories:
        score -= 50
    return max(0.0, min(100.0, score))


def _budget_fit_score(final_cents: int, budget_cents: int) -> float:
    if budget_cents <= 0:
        return 0.0
    if final_cents > budget_cents:
        return 0.0
    ratio = final_cents / budget_cents
    return round(100 - abs(0.75 - ratio) * 100, 1)


def _simplicity_score(math: dict[str, Any]) -> float:
    mechanisms = len(math.get("mechanisms") or [])
    return max(40.0, 100.0 - max(0, mechanisms - 1) * 15)


def _score_stack(math: dict[str, Any], budget_cents: int, preferences: dict[str, Any]) -> float:
    confidence = math.get("confidence_score") or 0
    return round(
        (math["savings_percent"] * 0.35)
        + (_budget_fit_score(math["final_price_cents"], budget_cents) * 0.25)
        + (confidence * 0.20)
        + (_preference_match(math, preferences) * 0.10)
        + (_simplicity_score(math) * 0.10),
        2,
    )


def _qualifies(math: dict[str, Any], budget_cents: int, relaxed: bool = False, enforce_budget: bool = True) -> bool:
    if not math.get("ok"):
        return False
    has_mechanism = bool(math.get("mechanisms"))
    within_budget = math["final_price_cents"] <= budget_cents
    if math["savings_percent"] >= MIN_SAVINGS_PERCENT:
        return True
    if has_mechanism and not enforce_budget:
        return True
    if within_budget and has_mechanism:
        return True
    return relaxed and has_mechanism and within_budget


def _basket_from_items(store: str, items: list[dict[str, Any]], budget_cents: int, enforce_budget: bool = True) -> dict[str, Any]:
    subtotal = sum(item["subtotal_cents"] for item in items)
    discount = sum(item["total_discount_cents"] for item in items)
    final = sum(item["final_price_cents"] for item in items)
    savings_percent = round((discount / subtotal) * 100, 1) if subtotal > 0 else 0.0
    stack_type = "BASKET_ENGINEERED_STACK" if len(items) > 1 else items[0]["stack_type"]
    confidence_avg = sum(item.get("confidence_score") or 0 for item in items) / max(1, len(items))
    title = SNIPPD_BRANDS[2] if enforce_budget and final <= budget_cents else SNIPPD_BRANDS[0]
    if any(item["stack_type"] == "OVERAGE_STACK" for item in items):
        title = "Snippd Smart Cart"
    elif any("household" in str(item.get("raw", {}).get("category", "")).lower() for item in items):
        title = "Snippd Household Stack"

    return {
        "store": store,
        "stack_type": stack_type,
        "title": title,
        "subtotal_cents": subtotal,
        "total_discount_cents": discount,
        "final_price_cents": final,
        "savings_percent": savings_percent,
        "confidence": "HIGH" if confidence_avg >= 80 else "MEDIUM" if confidence_avg >= 50 else "LOW",
        "items": [
            {
                "name": item["name"],
                "qty": 2 if "BOGO" in item.get("mechanisms", []) else 1,
                "price_cents": item["price_cents"],
                "coupon_value_cents": item["coupon_value_cents"],
                "final_price_cents": item["final_price_cents"],
            }
            for item in items
        ],
        "coupons": [
            {
                "item": item["name"],
                "value_cents": item["coupon_value_cents"],
                "source": item["source"],
            }
            for item in items
            if item["coupon_value_cents"] > 0
        ],
        "rules_applied": sorted({rule for item in items for rule in item.get("mechanisms", [])}),
        "instructions": [
            "Clip listed coupons before checkout.",
            "Buy exact items listed.",
            "Verify price in store before checkout.",
        ],
        "source_type": "SNIPPD_GENERATED",
        "attribution": None,
        "budget_fit": final <= budget_cents,
    }


def _build_budget_baskets(valid: list[dict[str, Any]], budget_cents: int, enforce_budget: bool = True) -> list[dict[str, Any]]:
    baskets: list[dict[str, Any]] = []
    by_store: dict[str, list[dict[str, Any]]] = {}
    for item in valid:
        by_store.setdefault(item["store"], []).append(item)

    for store, items in by_store.items():
        selected: list[dict[str, Any]] = []
        running_total = 0
        for item in sorted(items, key=lambda i: i["score"], reverse=True):
            if len(selected) >= REASONABLE_ITEM_LIMIT:
                break
            if not enforce_budget or running_total + item["final_price_cents"] <= budget_cents:
                selected.append(item)
                running_total += item["final_price_cents"]
        if selected:
            baskets.append(_basket_from_items(store, selected, budget_cents, enforce_budget))

    return sorted(baskets, key=lambda b: (b["total_discount_cents"], b["savings_percent"]), reverse=True)[:3]


def self_heal_stack_results(
    valid: list[dict[str, Any]],
    rejected: list[dict[str, Any]],
    budget_cents: int,
    preferences: dict[str, Any],
    enforce_budget: bool = True,
) -> dict[str, Any] | None:
    if len(valid) >= 3:
        return None

    next_best: list[dict[str, Any]] = []
    for item in rejected:
        if item.get("reason") in {"expired offer", "missing product name", "missing retailer/store", "no price"}:
            continue
        if not item.get("mechanisms"):
            continue
        if enforce_budget and item.get("final_price_cents", budget_cents + 1) > budget_cents:
            continue
        item["score"] = _score_stack(item, budget_cents, preferences)
        next_best.append(item)

    next_best = sorted(next_best, key=lambda i: i["score"], reverse=True)[:5]
    return {
        "status": "LOW_YIELD_WEEK",
        "reason": "Not enough verified stacks met current filters",
        "fallback_used": True,
        "next_best_options": [
            {
                "store": item["store"],
                "item": item["name"],
                "stack_type": item["stack_type"],
                "final_price_cents": item["final_price_cents"],
                "savings_percent": item["savings_percent"],
                "reason": item.get("reason"),
                "source": item["source"],
            }
            for item in next_best
        ],
    }


def format_budget_first_output(
    budget_cents: int,
    baskets: list[dict[str, Any]],
    healing: dict[str, Any] | None = None,
    enforce_budget: bool = True,
) -> dict[str, Any]:
    mode = "budget_first_self_healing" if enforce_budget else "stack_first_curated"
    if baskets:
        return {
            "status": "OK",
            "mode": mode,
            "budget_cents": budget_cents,
            "budget_filter_applied": enforce_budget,
            "recommended_baskets": baskets,
        }

    return {
        "status": "LOW_YIELD_WEEK",
        "mode": mode,
        "budget_cents": budget_cents,
        "budget_filter_applied": enforce_budget,
        "recommended_baskets": [],
        "reason": (healing or {}).get("reason", "Not enough verified stacks met current filters"),
        "fallback_used": True,
        "next_best_options": (healing or {}).get("next_best_options", []),
    }


def resolve_budget_first_stacks(
    user_id: str,
    store_key: str | None = None,
    budget_cents: int | None = None,
    enforce_budget: bool = True,
) -> dict[str, Any]:
    effective_budget = int(budget_cents or _budget_from_request(user_id) or fetch_user_budget_cents(user_id))
    retailer_ids = [store_key] if store_key else _retailer_ids_for_request(user_id)
    candidates_result = query_stack_candidates(retailer_ids)
    candidates = candidates_result.get("candidates", []) if isinstance(candidates_result, dict) else []
    policies = fetch_retailer_policies(retailer_ids).get("policies", [])
    policy_lookup = _policy_by_retailer(policies)
    fetch_digital_coupons(retailer_ids)  # Best-effort warm check; stack_candidates remains the output source.

    try:
        preferences = get_user_intelligence(user_id)
    except Exception:
        preferences = {"preferred_brands": [], "meal_modes": []}

    valid: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for row in candidates:
        retailer = str(row.get("retailer_key") or row.get("retailer") or "").lower()
        math = calculate_stack_math(row, policy_lookup.get(retailer))
        if _qualifies(math, effective_budget, enforce_budget=enforce_budget):
            math["score"] = _score_stack(math, effective_budget, preferences)
            valid.append(math)
        else:
            rejected.append(math)

    valid = sorted(valid, key=lambda item: item["score"], reverse=True)
    baskets = _build_budget_baskets(valid, effective_budget, enforce_budget)
    healing = self_heal_stack_results(valid, rejected, effective_budget, preferences, enforce_budget)
    if healing and len(valid) < 3:
        return format_budget_first_output(effective_budget, baskets if baskets and len(valid) >= 1 else [], healing, enforce_budget)
    return format_budget_first_output(effective_budget, baskets, healing, enforce_budget)


def _budget_from_request(request: str | None) -> int | None:
    text = str(request or "").lower()
    match = re.search(r"(?:budget|under|within|spend)\D{0,8}\$?\s*(\d{1,5})(?:\.(\d{1,2}))?", text)
    if not match:
        return None
    dollars = int(match.group(1))
    cents = int((match.group(2) or "0").ljust(2, "0")[:2])
    return dollars * 100 + cents


def _architect_instruction(_: ReadonlyContext) -> str:
    retailers = "\n".join(f"- `{r['id']}`: {r['name']} ({r['class']})" for r in TARGET_RETAILERS)
    return f"""You are **ADK_Stack_Architect**, the Snippd Universal Engine.
Current reference time UTC: **{utc_now_iso()}**.

## Mission
Find the 1-2 highest Savings Yield retailer locations for the user TODAY and assemble a
12-item stack plus a 7-day, 21-meal instructional manual.

## Retailer Grid
{retailers}

## Mandatory Flow
1. Use `get_user_intelligence` for preferred brands, meal modes, and prior behavior.
2. Use `query_stack_candidates` and live circular search grounding across every target retailer.
3. Use `fetch_retailer_policies` for BOGO and coupon rules.
4. Build candidate stacks for each retailer and rank by Savings Yield.
5. Choose at most 2 physically shoppable retailer nodes.
6. Call Cloud Run `checkout-math` outside the agent before any card funding.
7. Return `LOW_YIELD_WEEK` if no stack can clear 60%.

## 7-Day Manual Rules
- Exactly 21 meals: breakfast, lunch, dinner for 7 days.
- Repurpose ingredients for perceived value and low waste.
- Include prep pivots such as mayo glazes, yogurt sauces, deli lunch cycles, and leftover remixes.
- Include a Household/Vault stack when surplus exists.

{COMPLIANCE_BLOCK}

## Output JSON
Return:
`status`, `current_time_utc`, `selected_retailer_nodes[]`, `savings_yield_rank[]`,
`basket_stack[]`, `meal_prep_manual`, `surplus_action`, `learning_hooks`,
`disclosures`, `requires_checkout_math=true`.
"""


def build_root_agent(model: str = DEFAULT_MODEL):
    if Agent is None:
        raise RuntimeError("google-adk is not installed in this environment")
    return Agent(
        model=model,
        name="ADK_Stack_Architect",
        description="Universal 60%+ stack architect across grocery, pharmacy, and discount retailers.",
        instruction=_architect_instruction,
        tools=[query_stack_candidates, fetch_retailer_policies, get_user_intelligence],
    )


class StackArchitect:
    """Pickle-safe Reasoning Engine app wrapper."""

    def set_up(self) -> None:
        # Secrets are read lazily by tools from Google Secret Manager-injected env.
        return None

    def query(self, user_id: str, market: str | None = None) -> dict[str, Any]:
        store_ids = _retailer_ids_for_request(user_id)
        store_key = store_ids[0] if len(store_ids) == 1 else None
        requested_budget = _budget_from_request(user_id)
        return resolve_budget_first_stacks(
            user_id=user_id,
            store_key=store_key,
            budget_cents=requested_budget,
            enforce_budget=requested_budget is not None,
        )
