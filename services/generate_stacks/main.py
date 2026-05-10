"""
Snippd — generate-stacks Cloud Run service.
POST /generate-stacks

Loads stack_candidates + digital_coupons + retailer_policies from Supabase,
runs the 6-type stack engine, filters by savings_threshold, writes results
to app_home_feed, and returns clean JSON for the 3-screen flow.

Legacy stack types:
  BOGO_STACK           final = bogo_price - coupon_value - rebate
  THRESHOLD_STACK      subtotal >= threshold; apply threshold coupon last
  PROMO_TRIGGER_STACK  buy_X_get_Y / auto-discount; trigger count must be met
  DIGITAL_COUPON_STACK verified coupon_value > 0; savings >= 40%
  BASKET_ENGINEERED    combined basket <= budget; savings >= 40%
  OVERAGE_STACK        coupon/rebate > price; flag as credit — never cash
"""
from __future__ import annotations

import json
import math
import os
from datetime import datetime, timedelta, timezone
from difflib import SequenceMatcher
from typing import Any

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
MIN_SAVINGS_PCT = float(os.environ.get("MIN_SAVINGS_PCT", "40"))

SNIPPD_TITLES = [
    "Snippd Budget Stack",
    "Snippd Household Stack",
    "Snippd Under-Budget Basket",
    "Snippd Smart Cart",
    "Snippd Weekly Stack",
    "Snippd Deal Builder",
]

STORE_APP_NAMES = {
    "publix":           "Publix app",
    "kroger":           "Kroger app",
    "dollar_general":   "Dollar General app",
    "walgreens":        "Walgreens app",
    "cvs":              "CVS app",
    "target":           "Target app",
    "walmart":          "Walmart app",
    "aldi":             "ALDI app",
    "heb":              "H-E-B app",
    "whole_foods":      "Whole Foods app",
    "trader_joes":      "Trader Joe's app",
    "winn_dixie":       "Winn-Dixie app",
}

RETAILER_COUPON_HUBS = {
    "dollar_general": "https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0",
    "publix": "https://www.publix.com/savings/digital-coupons",
    "kroger": "https://www.kroger.com/savings/cl/coupons",
    "walmart": "https://www.walmart.com/coupons",
    "target": "https://www.target.com/circle",
}

RETAILER_COUPON_SEARCH = {
    "dollar_general": "https://www.dollargeneral.com/deals/coupons?search={query}",
    "publix": "https://www.publix.com/savings/digital-coupons?search={query}",
    "kroger": "https://www.kroger.com/savings/cl/coupons?searchTerm={query}",
    "walmart": "https://www.walmart.com/coupons?query={query}",
    "target": "https://www.target.com/circle/offers?keyword={query}",
}


# ── Supabase helpers ──────────────────────────────────────────────────────────

def _hdr() -> dict:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
    }


def _sb_select(table: str, qs: str = "") -> list:
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if qs:
        url += f"?{qs}"
    try:
        r = requests.get(url, headers=_hdr(), timeout=12)
        if r.ok:
            return r.json() if isinstance(r.json(), list) else []
    except Exception:
        pass
    return []


def _sb_upsert(table: str, rows: list | dict) -> bool:
    if not rows:
        return True
    data = rows if isinstance(rows, list) else [rows]
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/{table}",
            headers={**_hdr(), "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=data,
            timeout=12,
        )
        return r.ok
    except Exception:
        return False


def _sb_patch(table: str, qs: str, payload: dict) -> bool:
    try:
        r = requests.patch(
            f"{SUPABASE_URL}/rest/v1/{table}?{qs}",
            headers={**_hdr(), "Prefer": "return=minimal"},
            json=payload,
            timeout=12,
        )
        return r.ok
    except Exception:
        return False


def _sb_rpc(function_name: str, payload: dict) -> dict:
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/rpc/{function_name}",
            headers=_hdr(),
            json=payload,
            timeout=30,
        )
        if r.ok:
            data = r.json()
            return data if isinstance(data, dict) else {"ok": True, "data": data}
        return {"ok": False, "error": r.text}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _create_generation_run(retailer_key: str | None, trigger_source: str) -> str | None:
    row = {
        "retailer_key": retailer_key,
        "model_function_used": "generate-stacks-cloudrun",
        "status": "running",
        "trigger_source": trigger_source,
        "source_tables_used": ["stack_candidates", "digital_coupons", "normalized_coupons", "retailer_rules", "app_home_feed"],
    }
    try:
        r = requests.post(
            f"{SUPABASE_URL}/rest/v1/stack_generation_runs",
            headers={**_hdr(), "Prefer": "return=representation"},
            json=[row],
            timeout=12,
        )
        if r.ok:
            data = r.json()
            return data[0].get("id") if isinstance(data, list) and data else None
    except Exception:
        pass
    return None


def _finish_generation_run(run_id: str | None, status: str, counts: dict, error: str | None = None) -> None:
    if not run_id:
        return
    payload = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "generated_count": counts.get("generated", 0),
        "approved_count": counts.get("approved", 0),
        "rejected_count": counts.get("rejected", 0),
        "candidates_created": counts.get("generated", 0),
        "candidates_approved": counts.get("approved", 0),
        "candidates_rejected": counts.get("rejected", 0),
        "coupons_matched": counts.get("coupons", 0),
        "error_message": error,
    }
    _sb_patch("stack_generation_runs", f"id=eq.{run_id}", payload)


def _parse_json_field(value: Any, fallback: Any = None) -> Any:
    if fallback is None:
        fallback = []
    if isinstance(value, (list, dict)):
        return value
    if isinstance(value, str):
        try:
            return json.loads(value)
        except Exception:
            pass
    return fallback


def _product_key(value: str) -> str:
    import re
    return re.sub(r"(^_+|_+$)", "", re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()))


# ── Item enrichment ───────────────────────────────────────────────────────────

def _fuzzy_match(a: str, b: str) -> float:
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _find_coupon(item: dict, coupons: list, retailer_key: str) -> dict | None:
    name = str(item.get("name") or item.get("item_name") or item.get("product_name") or "")
    brand = str(item.get("brand") or "")
    needle = f"{brand} {name}".strip().lower()
    best, best_coupon = 0.0, None
    for c in coupons:
        c_retailer = str(c.get("retailer_key") or "")
        if c_retailer and c_retailer != retailer_key:
            continue
        c_name = str(c.get("product_name") or c.get("brand") or "").lower()
        score = _fuzzy_match(needle, c_name)
        if score > best and score > 0.45:
            best, best_coupon = score, c
    return best_coupon


def resolve_coupon_activation_link(item: dict, coupon: dict | None, retailer_key: str) -> dict:
    item_url = (
        item.get("official_coupon_url")
        or item.get("exact_coupon_url")
        or item.get("coupon_url")
        or (coupon or {}).get("link_url")
        or (coupon or {}).get("exact_coupon_url")
        or (coupon or {}).get("official_coupon_url")
        or (coupon or {}).get("source_url")
    )
    if item_url and str(item_url).startswith("https://"):
        return {
            "link_type": "item",
            "link_url": item_url,
            "source": "coupon_evidence",
            "confidence": 0.95,
        }

    search_template = RETAILER_COUPON_SEARCH.get(retailer_key)
    product_name = item.get("product_name") or item.get("name") or item.get("item_name") or ""
    if search_template and product_name:
        return {
            "link_type": "search",
            "link_url": search_template.format(query=requests.utils.quote(str(product_name))),
            "source": "retailer_search",
            "confidence": 0.70,
        }

    hub = RETAILER_COUPON_HUBS.get(retailer_key)
    return {
        "link_type": "hub" if hub else "unavailable",
        "link_url": hub,
        "source": "retailer_hub" if hub else "none",
        "confidence": 0.45 if hub else 0.0,
    }


def _end_of_week() -> str:
    today = datetime.now(timezone.utc)
    days_until_sunday = (6 - today.weekday()) % 7 or 7
    eow = today + timedelta(days=days_until_sunday)
    return eow.strftime("%Y-%m-%d")


def _best_shop_window(expiry: str | None) -> str:
    if not expiry:
        return "This week while supplies last"
    try:
        dt = datetime.strptime(expiry[:10], "%Y-%m-%d")
        day = dt.strftime("%A, %b %-d")
        return f"Shop by {day}"
    except Exception:
        return "This week while supplies last"


def enrich_item(raw: dict, coupons: list, retailer_key: str) -> dict:
    raw_name = str(raw.get("name") or raw.get("item_name") or raw.get("product_name") or "Item")
    brand = str(raw.get("brand") or "")
    size = str(raw.get("size") or "")

    # display_name: "Brand Product Name (Size)"
    display_name = raw_name
    if brand and brand.lower() not in raw_name.lower():
        display_name = f"{brand} {raw_name}"
    if size and size.lower() not in display_name.lower():
        display_name = f"{display_name} ({size})"

    # coupon_search_name: first 3 words — copy/paste searchable
    words = display_name.split()
    coupon_search_name = " ".join(words[:3]) if len(words) >= 3 else display_name

    matched = _find_coupon(raw, coupons, retailer_key)
    coupon_exp = None
    coupon_value_cents = 0
    coupon_status = "needs_user_verification"

    if matched:
        coupon_exp = matched.get("expiration_date") or matched.get("valid_until")
        v = matched.get("coupon_value") or matched.get("discount_value") or matched.get("discount_cents") or 0
        coupon_value_cents = int(float(v) * 100) if float(v) < 200 else int(float(v))
        coupon_status = "verified"
        official_coupon_url = matched.get("exact_coupon_url") or matched.get("official_coupon_url") or matched.get("link_url")
    else:
        cv = raw.get("coupon_value") or raw.get("coupon_value_cents") or 0
        if float(cv) > 0:
            coupon_value_cents = int(float(cv) * 100) if float(cv) < 200 else int(float(cv))
        official_coupon_url = raw.get("official_coupon_url") or raw.get("exact_coupon_url") or raw.get("coupon_url")

    deal_exp = raw.get("deal_expiration_date") or raw.get("valid_until") or _end_of_week()

    store_app = STORE_APP_NAMES.get(retailer_key, f"{retailer_key.replace('_', ' ').title()} app")
    retailer_coupon_hub_url = RETAILER_COUPON_HUBS.get(retailer_key)
    link = resolve_coupon_activation_link(raw, matched, retailer_key)
    coupon_activation_url = official_coupon_url or link.get("link_url")

    # price_cents from multiple possible fields, including existing *_cents names.
    price_raw = (
        raw.get("regular_price_cents")
        or raw.get("regular_price")
        or raw.get("base_price")
        or raw.get("price_cents")
        or raw.get("price")
        or 0
    )
    pay_raw = (
        raw.get("sale_price_cents")
        or raw.get("pay_price")
        or raw.get("final_price_cents")
        or raw.get("final_price")
        or raw.get("sale_price")
        or 0
    )
    price_cents = int(float(price_raw) * 100) if float(price_raw) < 500 else int(float(price_raw))
    pay_cents   = int(float(pay_raw)   * 100) if float(pay_raw)   < 500 else int(float(pay_raw))

    if price_cents == 0:
        price_cents = pay_cents
    if pay_cents == 0:
        pay_cents = max(0, price_cents - coupon_value_cents)

    qty = int(raw.get("quantity") or raw.get("qty") or 1)

    return {
        "display_name":            display_name,
        "coupon_search_name":      coupon_search_name,
        "native_app_search_terms": [
            coupon_search_name.lower(),
            f"{brand.lower()} {words[0].lower()}".strip() if brand else coupon_search_name.lower(),
        ],
        "coupon_clip_instruction": f"Open {store_app} coupons and search '{coupon_search_name}'",
        "official_coupon_url":     coupon_activation_url,
        "retailer_coupon_hub_url": retailer_coupon_hub_url,
        "coupon_link_status":      "evidence_exact" if link["link_type"] == "item" else ("official_hub" if link["link_type"] == "hub" else link["link_type"]),
        "coupon_link_type":        link["link_type"],
        "coupon_link_source":      link["source"],
        "coupon_link_confidence":  link["confidence"],
        "canonical_product_key":   _product_key(display_name),
        "coupon_expiration_date":  coupon_exp,
        "deal_expiration_date":    deal_exp,
        "best_shop_window":        _best_shop_window(deal_exp),
        "coupon_status":           coupon_status,
        "price_cents":             price_cents,
        "coupon_value_cents":      coupon_value_cents,
        "final_price_cents":       pay_cents,
        "qty":                     qty,
        # pass-through originals for basket math
        "_deal_type": str(raw.get("deal_type") or raw.get("stack_type") or "").upper(),
        "_promo_discount_cents": int(raw.get("promo_discount_cents") or max(price_cents - pay_cents, 0)),
        "_rebate_cents": int(raw.get("rebate_value_cents") or raw.get("rebate_cents") or float(raw.get("rebate_value") or 0) * 100),
    }


# ── Basket math ───────────────────────────────────────────────────────────────

def _classify_stack_type(items: list[dict], trigger: str | None) -> str:
    types = {i.get("_deal_type", "") for i in items}
    if any("BOGO" in t for t in types):
        return "BOGO_STACK"
    if trigger and ("off $" in trigger.lower() or "off at" in trigger.lower()):
        return "THRESHOLD_STACK"
    if trigger and ("buy" in trigger.lower() and "get" in trigger.lower()):
        return "PROMO_TRIGGER_STACK"
    all_verified = all(i.get("coupon_status") == "verified" for i in items if i.get("coupon_value_cents", 0) > 0)
    has_coupon = any(i.get("coupon_value_cents", 0) > 0 for i in items)
    if has_coupon and all_verified:
        return "DIGITAL_COUPON_STACK"
    if len(items) > 2:
        return "BASKET_ENGINEERED_STACK"
    return "DIGITAL_COUPON_STACK"


def calculate_stack_math(items: list[dict], trigger_discount_cents: int = 0) -> dict:
    subtotal = sum(i["price_cents"] * i["qty"] for i in items)
    coupon_total = sum(i["coupon_value_cents"] * i["qty"] for i in items)
    rebate_total = sum(i.get("_rebate_cents", 0) * i["qty"] for i in items)

    # BOGO: half-price for paired items
    bogo_discount = 0
    for i in items:
        if "BOGO" in i.get("_deal_type", ""):
            bogo_discount += (i["price_cents"] // 2) * i["qty"]

    promo_discount = bogo_discount + trigger_discount_cents
    register_discount = coupon_total + promo_discount
    final = max(0, subtotal - register_discount)
    net_after_rebate = max(0, final - rebate_total)

    # Overage: coupon > price — flag as credit scenario
    is_overage = register_discount > subtotal
    if is_overage:
        final = 0
        net_after_rebate = 0

    total_savings = register_discount + rebate_total
    savings_pct = round((total_savings / subtotal * 100)) if subtotal > 0 else 0

    return {
        "subtotal_cents":        subtotal,
        "sale_total_cents":      max(0, subtotal - promo_discount),
        "promo_discount_cents":  promo_discount,
        "coupon_total_cents":    coupon_total,
        "rebate_total_cents":    rebate_total,
        "total_discounts_cents": total_savings,
        "final_out_of_pocket_cents": final,
        "net_after_rebate_cents": net_after_rebate,
        "savings_percent":       savings_pct,
        "is_overage":            is_overage,
    }


# ── Stack engine ──────────────────────────────────────────────────────────────

def _parse_threshold_policy(policy: dict) -> tuple[int, int] | None:
    """Returns (threshold_cents, discount_cents) or None."""
    raw = str(policy.get("threshold_coupon") or policy.get("threshold_rules") or "").lower()
    # e.g. "$5 off $25" or "5 off 25"
    import re
    m = re.search(r"\$?(\d+(?:\.\d+)?)\s+off\s+\$?(\d+(?:\.\d+)?)", raw)
    if m:
        discount = int(float(m.group(1)) * 100)
        threshold = int(float(m.group(2)) * 100)
        return threshold, discount
    return None


def build_stack_from_candidate(
    candidate: dict,
    coupons: list,
    policies: list,
    threshold: float,
) -> dict | None:
    retailer_key = str(candidate.get("retailer_key") or candidate.get("retailer") or "unknown")
    raw_items = _parse_json_field(candidate.get("items") or candidate.get("breakdown_list"), [])

    if not raw_items:
        return None

    enriched = [enrich_item(r, coupons, retailer_key) for r in raw_items]
    if not enriched:
        return None

    # Find retailer policy for threshold coupon
    retailer_policy = next((p for p in policies
                            if str(p.get("retailer_key") or "").lower() == retailer_key.lower()), None)
    trigger_coupon = None
    trigger_discount_cents = 0

    if retailer_policy:
        parsed = _parse_threshold_policy(retailer_policy)
        if parsed:
            thresh_cents, disc_cents = parsed
            basket_subtotal = sum(i["price_cents"] * i["qty"] for i in enriched)
            if basket_subtotal >= thresh_cents:
                trigger_coupon = str(retailer_policy.get("threshold_coupon") or "")
                trigger_discount_cents = disc_cents

    math = calculate_stack_math(enriched, trigger_discount_cents)

    if math["savings_percent"] < threshold:
        return None
    if math["subtotal_cents"] == 0:
        return None

    stack_type = _classify_stack_type(enriched, trigger_coupon)

    # Validate: reject if any item has no name or no price
    for item in enriched:
        if not item["display_name"] or item["display_name"] == "Item":
            return None
        if item["price_cents"] == 0 and item["final_price_cents"] == 0:
            return None

    store_name = retailer_key.replace("_", " ").title()
    # title includes retailer name
    title_base = next(
        (t for t in SNIPPD_TITLES if "Household" in t),
        SNIPPD_TITLES[0]
    )
    title = f"{store_name} — {title_base}"

    expiry = min(
        (i["deal_expiration_date"] for i in enriched if i.get("deal_expiration_date")),
        default=_end_of_week(),
    )
    shop_window = _best_shop_window(expiry)

    store_app = STORE_APP_NAMES.get(retailer_key, f"{store_name} app")
    instructions = [
        f"Open the {store_app}",
        "Search each coupon name below and clip it",
        "Add exact items listed to your physical cart",
        "Verify prices in-store before checkout",
    ]

    confidence_raw = candidate.get("confidence_score") or candidate.get("confidence_pct") or candidate.get("stack_rank_score")
    try:
        confidence_n = float(confidence_raw or 0)
        if confidence_n > 1:
            confidence_n /= 100
        confidence = "HIGH" if confidence_n >= 0.75 else "MEDIUM" if confidence_n >= 0.50 else "LOW"
    except Exception:
        confidence = "LOW"

    # Strip internal fields from enriched items before returning
    stack_items = [{k: v for k, v in i.items() if not k.startswith("_")} for i in enriched]

    return {
        "stack_candidate_id":          candidate.get("id"),
        "retailer_key":               retailer_key,
        "store":                      store_name,
        "title":                      title,
        "stack_type":                 stack_type,
        "trigger_coupon":             trigger_coupon,
        "subtotal_cents":             math["subtotal_cents"],
        "sale_total_cents":           math["sale_total_cents"],
        "total_discounts_cents":      math["total_discounts_cents"],
        "final_out_of_pocket_cents":  math["final_out_of_pocket_cents"],
        "net_after_rebate_cents":     math["net_after_rebate_cents"],
        "savings_percent":            math["savings_percent"],
        "is_overage":                 math["is_overage"],
        "stack_items":                stack_items,
        "item_count":                 len(stack_items),
        "instructions":               instructions,
        "expiration_date":            expiry,
        "best_shop_window":           shop_window,
        "confidence":                 confidence,
        "source_type":                "SNIPPD_GENERATED",
        "validation_status":          "system_generated_verified",
        "attribution":                None,
        "source_tables_used":          candidate.get("source_tables_used") or ["stack_candidates", "digital_coupons", "normalized_coupons", "retailer_rules"],
        "rules_applied":              _parse_json_field(candidate.get("rules_applied"), []),
        "model_function_used":         candidate.get("model_function_used") or "generate-stacks-cloudrun",
        "generation_timestamp":        candidate.get("generation_timestamp") or datetime.now(timezone.utc).isoformat(),
        "review_status":              candidate.get("review_status") or "approved",
        "error_reason":               candidate.get("error_reason"),
        "regular_price_cents":         candidate.get("regular_price_cents") or math["subtotal_cents"],
        "sale_price_cents":            candidate.get("sale_price_cents") or math["sale_total_cents"],
        "promo_discount_cents":        candidate.get("promo_discount_cents") or math["promo_discount_cents"],
        "coupon_discount_cents":       candidate.get("coupon_discount_cents") or math["coupon_total_cents"],
        "rebate_value_cents":          candidate.get("rebate_value_cents") or math["rebate_total_cents"],
        "net_price_after_rebate_cents": candidate.get("net_price_after_rebate_cents") or math["net_after_rebate_cents"],
        "coupon_activation_links":     [
            {
                "product_name": item.get("display_name"),
                "link_type": item.get("coupon_link_type"),
                "link_url": item.get("official_coupon_url"),
                "source": item.get("coupon_link_source"),
                "confidence": item.get("coupon_link_confidence"),
            }
            for item in stack_items
            if item.get("coupon_link_type") and item.get("coupon_link_type") != "unavailable"
        ],
        "confidence_explanation":      candidate.get("confidence_explanation") or candidate.get("explanation"),
        "is_fallback":                 bool(candidate.get("is_fallback")),
    }


def self_heal_stack_results(stacks: list, candidates: list, coupons: list, threshold: float) -> list:
    """
    If fewer than 3 valid stacks, relax filters progressively.
    Never fabricates data.
    """
    if len(stacks) >= 3:
        return stacks

    # Relax 1: lower threshold to 20%
    relaxed = []
    for c in candidates:
        s = build_stack_from_candidate(c, coupons, [], 20)
        if s and s not in stacks:
            relaxed.append(s)
    combined = stacks + relaxed
    if combined:
        return sorted(combined, key=lambda x: x["savings_percent"], reverse=True)

    return stacks


def format_low_yield_response(stacks: list) -> dict:
    return {
        "status":          "LOW_YIELD_WEEK",
        "mode":            "budget_first_self_healing",
        "reason":          "Not enough verified stacks met current filters",
        "fallback_used":   True,
        "stacks_generated": len(stacks),
        "stacks":          stacks,
    }


# ── Supabase writes ───────────────────────────────────────────────────────────

def save_stack_to_home_feed(stack: dict) -> bool:
    pay_dollars   = round(stack["final_out_of_pocket_cents"] / 100, 2)
    orig_dollars  = round(stack["subtotal_cents"] / 100, 2)
    save_dollars  = round(stack["total_discounts_cents"] / 100, 2)

    row = {
        "stack_candidate_id":           stack.get("stack_candidate_id"),
        "title":                       stack["title"],
        "retailer":                    stack["retailer_key"],
        "pay_price":                   pay_dollars,
        "original_price":              orig_dollars,
        "save_price":                  save_dollars,
        "breakdown_list":              json.dumps(stack["stack_items"]),
        "card_type":                   "stack",
        "status":                      "active",
        "validation_status":           stack["validation_status"],
        "valid_until":                 stack["expiration_date"],
        "source_summary":              stack["source_type"],
        # Extended columns (added by 20260501_generate_stacks_schema.sql)
        "stack_type":                  stack["stack_type"],
        "trigger_coupon":              stack.get("trigger_coupon"),
        "instructions":                json.dumps(stack["instructions"]),
        "best_shop_window":            stack["best_shop_window"],
        "confidence":                  stack["confidence"],
        "savings_percent":             stack["savings_percent"],
        "final_out_of_pocket_cents":   stack["final_out_of_pocket_cents"],
        "subtotal_cents":              stack["subtotal_cents"],
        "total_discounts_cents":       stack["total_discounts_cents"],
        "item_count":                  stack["item_count"],
        "source_type":                 stack["source_type"],
        "is_active":                   True,
        "source_tables_used":          stack.get("source_tables_used"),
        "rules_applied":               stack.get("rules_applied") or [],
        "model_function_used":         stack.get("model_function_used"),
        "generation_timestamp":        stack.get("generation_timestamp"),
        "review_status":               stack.get("review_status"),
        "error_reason":                stack.get("error_reason"),
        "regular_price_cents":         stack.get("regular_price_cents"),
        "sale_price_cents":            stack.get("sale_price_cents"),
        "promo_discount_cents":        stack.get("promo_discount_cents", 0),
        "coupon_discount_cents":       stack.get("coupon_discount_cents", 0),
        "rebate_value_cents":          stack.get("rebate_value_cents", 0),
        "net_price_after_rebate_cents": stack.get("net_price_after_rebate_cents"),
        "coupon_activation_links":     stack.get("coupon_activation_links") or [],
        "generation_run_id":           stack.get("generation_run_id"),
        "confidence_explanation":      stack.get("confidence_explanation"),
        "is_fallback":                 stack.get("is_fallback", False),
    }
    return _sb_upsert("app_home_feed", row)


# ── Route ─────────────────────────────────────────────────────────────────────

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "service": "generate-stacks"})


@app.route("/stack-thinking-engine", methods=["POST"])
def stack_thinking_engine():
    if not SUPABASE_URL or not SERVICE_KEY:
        return jsonify({"ok": False, "error": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    stores = body.get("stores") or []
    retailer_key = body.get("retailer_key") or (stores[0] if stores else None)
    result = _sb_rpc("rpc_run_stack_thinking_engine", {
        "p_retailer_key": retailer_key,
        "p_week_of": body.get("week_of"),
        "p_budget_cents": body.get("budget_cents"),
        "p_publish": body.get("publish", True),
    })
    status = 200 if result.get("ok") else 500
    return jsonify(result), status


@app.route("/budget-optimizer", methods=["POST"])
def budget_optimizer():
    if not SUPABASE_URL or not SERVICE_KEY:
        return jsonify({"ok": False, "error": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    budget_cents = body.get("budget_cents")
    if budget_cents is None:
        budget_cents = int(float(body.get("budget", 50)) * 100)

    result = _sb_rpc("rpc_build_budget_stack_plan", {
        "p_budget_cents": budget_cents,
        "p_retailer_key": body.get("retailer_key"),
        "p_limit": body.get("limit", 20),
    })
    status = 200 if result.get("ok") else 500
    return jsonify(result), status


@app.route("/generate-stacks", methods=["POST"])
def generate_stacks():
    if not SUPABASE_URL or not SERVICE_KEY:
        return jsonify({"ok": False, "error": "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured"}), 500

    body = request.get_json(silent=True) or {}
    stores = body.get("stores", [])
    savings_threshold = float(body.get("savings_threshold", MIN_SAVINGS_PCT))
    retailer_for_run = stores[0] if len(stores) == 1 else body.get("retailer_key")
    run_id = _create_generation_run(retailer_for_run, body.get("trigger_source") or "manual")
    counts = {"generated": 0, "approved": 0, "rejected": 0, "coupons": 0}

    # ── 1. Load data ──────────────────────────────────────────────────────────
    automation_result = _sb_rpc("rpc_run_stack_thinking_engine", {
        "p_retailer_key": stores[0] if len(stores) == 1 else None,
        "p_week_of": body.get("week_of"),
        "p_budget_cents": body.get("budget_cents"),
        "p_publish": True,
    })

    cand_qs = "is_active=eq.true&select=*&order=stack_rank_score.desc&limit=60"
    candidates = _sb_select("stack_candidates", cand_qs)

    if stores:
        candidates = [c for c in candidates
                      if c.get("retailer_key") in stores or c.get("retailer") in stores]

    digital_coupons = _sb_select("digital_coupons", "select=*&limit=300")
    normalized_coupons = _sb_select("v_normalized_coupon_inventory", "select=*&limit=300")
    coupons = normalized_coupons or digital_coupons
    counts["coupons"] = len(coupons)
    retailer_policies = _sb_select("retailer_policies", "select=*&limit=50") or _sb_select("retailer_rules", "select=*&limit=100")

    # ── 2. Generate stacks ────────────────────────────────────────────────────
    valid_stacks: list[dict] = []
    for candidate in candidates:
        try:
            threshold = 0 if candidate.get("is_fallback") else savings_threshold
            stack = build_stack_from_candidate(candidate, coupons, retailer_policies, threshold)
            if stack:
                stack["generation_run_id"] = run_id
                valid_stacks.append(stack)
            else:
                counts["rejected"] += 1
        except Exception:
            counts["rejected"] += 1
            continue

    # Deduplicate by retailer_key (keep highest savings per store)
    seen_retailers: dict[str, dict] = {}
    for s in sorted(valid_stacks, key=lambda x: x["savings_percent"], reverse=True):
        rk = s["retailer_key"]
        if rk not in seen_retailers:
            seen_retailers[rk] = s
    ranked = list(seen_retailers.values())

    # Self-healing: if < 3 stacks, relax filters
    if len(ranked) < 3:
        ranked = self_heal_stack_results(ranked, candidates, coupons, savings_threshold)

    top = ranked[:6]

    # ── 3. Write to app_home_feed ─────────────────────────────────────────────
    for stack in top:
        try:
            if save_stack_to_home_feed(stack):
                counts["approved"] += 1
        except Exception:
            pass
    counts["generated"] = len(valid_stacks)
    _finish_generation_run(run_id, "completed", counts)

    # ── 4. Return ─────────────────────────────────────────────────────────────
    status = "OK" if len(top) >= 3 else "LOW_YIELD_WEEK"
    response = {
        "ok":               True,
        "status":           status,
        "mode":             "budget_first_self_healing",
        "automation_result": automation_result,
        "run_id":            run_id,
        "stacks_generated": len(top),
        "stacks":           top,
    }
    if status == "LOW_YIELD_WEEK":
        response["reason"] = "Fewer than 3 stacks met savings threshold"
        response["fallback_used"] = len(ranked) < 3

    return jsonify(response)


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8080))
    app.run(host="0.0.0.0", port=port, debug=False)
