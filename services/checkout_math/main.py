from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from typing import Any

import requests
from flask import Flask, jsonify, request

app = Flask(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY") or os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
CHECKOUT_MATH_HMAC_SECRET = os.environ.get("CHECKOUT_MATH_HMAC_SECRET", "")
MIN_SAVINGS_PCT = float(os.environ.get("MIN_SAVINGS_PCT", "60"))
MAX_STORE_COUNT = int(os.environ.get("MAX_STORE_COUNT", "2"))
MAX_STACK_ITEMS = int(os.environ.get("MAX_STACK_ITEMS", "12"))

SUPPORTED_RETAILER_PREFIXES = (
    "publix",
    "winn_dixie",
    "aldi",
    "kroger",
    "kroger_delivery",
    "cvs",
    "walgreens",
    "dollar_general",
)

DEFAULT_BOGO_MODELS = {
    "publix": "true_bogo",
    "winn_dixie": "true_bogo",
    "aldi": "half_price",
    "kroger": "half_price",
    "kroger_delivery": "half_price",
    "cvs": "true_bogo",
    "walgreens": "true_bogo",
    "dollar_general": "true_bogo",
}


def _json_error(message: str, status: int, code: str):
    return jsonify({"ok": False, "error": message, "code": code}), status


def _headers(key: str) -> dict[str, str]:
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _require_env() -> tuple[bool, str | None]:
    required = {
        "SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_ROLE_KEY,
        "CHECKOUT_MATH_HMAC_SECRET": CHECKOUT_MATH_HMAC_SECRET,
    }
    missing = [name for name, value in required.items() if not value]
    if missing:
        return False, ",".join(missing)
    return True, None


def _verify_user_token(auth_header: str) -> dict[str, Any] | None:
    if not auth_header.lower().startswith("bearer "):
        return None
    resp = requests.get(
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": auth_header,
        },
        timeout=8,
    )
    if resp.status_code != 200:
        return None
    return resp.json()


def _fetch_plan(plan_id: str) -> dict[str, Any] | None:
    resp = requests.get(
        f"{SUPABASE_URL}/rest/v1/weekly_lifecycle_plans",
        params={"plan_id": f"eq.{plan_id}", "select": "*", "limit": "1"},
        headers=_headers(SUPABASE_SERVICE_ROLE_KEY),
        timeout=8,
    )
    resp.raise_for_status()
    rows = resp.json()
    return rows[0] if rows else None


def _round_money_cents(value: float) -> int:
    return int(round(value * 100))


def _retailer_key(retailer_node: str) -> str:
    node = str(retailer_node or "").lower()
    if node.startswith("winn"):
        return "winn_dixie"
    if "dollar" in node and "general" in node:
        return "dollar_general"
    if "delivery" in node and "kroger" in node:
        return "kroger_delivery"
    for prefix in SUPPORTED_RETAILER_PREFIXES:
        if node.startswith(prefix):
            return prefix
    return node.split("_")[0] if node else ""


def _is_supported_retailer(retailer_node: str) -> bool:
    return _retailer_key(retailer_node) in SUPPORTED_RETAILER_PREFIXES


def _item_savings_dollars(item: dict[str, Any]) -> float:
    if str(item.get("deal_type") or "").upper() == "BOGO":
        return _bogo_savings_dollars(item)
    return (
        float(item.get("digital_stack") or 0)
        + float(item.get("store_reward") or 0)
        + float(item.get("threshold_reward") or 0)
    )


def _bogo_savings_dollars(item: dict[str, Any]) -> float:
    gross = float(item.get("gross") or 0)
    unit = float(item.get("unit_price") or 0)
    quantity = int(item.get("quantity") or 2)
    retailer = _retailer_key(str(item.get("retailer_node") or ""))
    mode = str(item.get("bogo_model") or DEFAULT_BOGO_MODELS.get(retailer) or "true_bogo")
    coupon_layers = (
        float(item.get("digital_stack") or 0)
        + float(item.get("store_reward") or 0)
        + float(item.get("threshold_reward") or 0)
    )

    if gross <= 0 and unit > 0:
        gross = unit * quantity

    if mode in ("half_price", "half_off_both"):
        bogo_savings = gross * 0.5
    else:
        effective_unit = unit if unit > 0 else (gross / max(quantity, 1))
        free_units = quantity // 2
        bogo_savings = effective_unit * free_units

    return max(0.0, bogo_savings + coupon_layers)


def _calculate(basket: list[dict[str, Any]]) -> dict[str, Any]:
    gross = sum(float(item.get("gross") or 0) for item in basket)
    savings = sum(_item_savings_dollars(item) for item in basket)
    oop = max(0.0, gross - savings)
    pct = round((savings / gross) * 100, 1) if gross > 0 else 0.0
    return {
        "regular_total_cents": _round_money_cents(gross),
        "you_pay_cents": _round_money_cents(oop),
        "savings_cents": _round_money_cents(savings),
        "savings_pct": pct,
    }


def _sign(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hmac.new(
        CHECKOUT_MATH_HMAC_SECRET.encode("utf-8"),
        canonical,
        hashlib.sha256,
    ).hexdigest()


def _persist_snapshot(row: dict[str, Any]) -> None:
    requests.post(
        f"{SUPABASE_URL}/rest/v1/checkout_math_snapshots",
        headers={
            **_headers(SUPABASE_SERVICE_ROLE_KEY),
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=8,
    ).raise_for_status()


def _persist_funding_authorization(row: dict[str, Any]) -> None:
    requests.post(
        f"{SUPABASE_URL}/rest/v1/authoritative_funding_ledger",
        headers={
            **_headers(SUPABASE_SERVICE_ROLE_KEY),
            "Prefer": "return=minimal",
        },
        json=row,
        timeout=8,
    ).raise_for_status()


def _rank_store_yield(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in items:
        node = str(item.get("retailer_node") or "")
        grouped.setdefault(node, []).append(item)

    ranked = []
    for node, rows in grouped.items():
        totals = _calculate(rows)
        ranked.append(
            {
                "retailer_node": node,
                "item_count": len(rows),
                "regular_total_cents": totals["regular_total_cents"],
                "you_pay_cents": totals["you_pay_cents"],
                "savings_cents": totals["savings_cents"],
                "savings_pct": totals["savings_pct"],
            }
        )
    return sorted(ranked, key=lambda row: (row["savings_pct"], row["savings_cents"]), reverse=True)


@app.get("/health")
def health():
    ok, missing = _require_env()
    return jsonify({"ok": ok, "missing": missing})


@app.post("/checkout-math")
def checkout_math():
    ok, missing = _require_env()
    if not ok:
        return _json_error(f"Server misconfiguration: {missing}", 500, "SERVER_MISCONFIGURED")

    user = _verify_user_token(request.headers.get("Authorization", ""))
    if not user:
        return _json_error("Missing or invalid user token", 401, "UNAUTHORIZED")

    body = request.get_json(silent=True) or {}
    plan_id = str(body.get("plan_id") or "")
    requested_item_ids = body.get("cart_items") or body.get("item_ids") or []
    if not plan_id:
        return _json_error("plan_id is required", 400, "PLAN_ID_REQUIRED")
    if requested_item_ids and not isinstance(requested_item_ids, list):
        return _json_error("cart_items must be an array", 400, "CART_ITEMS_INVALID")

    plan_row = _fetch_plan(plan_id)
    if not plan_row:
        return _json_error("Plan not found", 404, "PLAN_NOT_FOUND")
    if str(plan_row.get("user_id")) != str(user.get("id")):
        return _json_error("Plan does not belong to user", 403, "PLAN_FORBIDDEN")

    lifecycle = plan_row.get("lifecycle_payload") or {}
    basket = lifecycle.get("basket_stack") or []
    item_filter = {str(item_id) for item_id in requested_item_ids if item_id}
    selected = [item for item in basket if not item_filter or str(item.get("item_id")) in item_filter]
    if not selected:
        return _json_error("No requested items matched the plan", 400, "NO_MATCHING_ITEMS")

    retailer_nodes = {str(item.get("retailer_node")) for item in selected}
    unsupported = [node for node in retailer_nodes if not _is_supported_retailer(node)]
    validation_errors: list[str] = []
    if unsupported:
        validation_errors.append("NO_RETAILER_COVERAGE")
    if len(retailer_nodes) > MAX_STORE_COUNT:
        validation_errors.append("STORE_COUNT_EXCEEDED")
    if len(selected) > MAX_STACK_ITEMS:
        validation_errors.append("STACK_ITEM_LIMIT_EXCEEDED")
    allowed_nodes = set(lifecycle.get("retailer_nodes") or [lifecycle.get("retailer_node")])
    if allowed_nodes and not retailer_nodes.issubset({str(node) for node in allowed_nodes if node}):
        validation_errors.append("STORE_INTEGRITY_FAILED")

    expires_at = lifecycle.get("stack_expires_at") or plan_row.get("stack_expires_at")
    if expires_at:
        expiry_date = str(expires_at).split("T")[0]
        if expiry_date < datetime.now(timezone.utc).date().isoformat():
            validation_errors.append("DATA_STALE")

    totals = _calculate(selected)
    if totals["savings_pct"] < MIN_SAVINGS_PCT:
        validation_errors.append("SAVINGS_FLOOR_FAILED")

    status = "APPROVED" if not validation_errors else "REJECTED"
    response_payload = {
        "ok": True,
        "plan_id": plan_id,
        "status": status,
        "validation_errors": validation_errors,
        "regular_total_cents": totals["regular_total_cents"],
        "you_pay_cents": totals["you_pay_cents"],
        "savings_cents": totals["savings_cents"],
        "savings_pct": totals["savings_pct"],
        "retailer_nodes": sorted(retailer_nodes),
        "store_yield_rank": _rank_store_yield(selected),
        "stack_expires_at": expires_at,
        "math_source": "cloud_run_checkout_math",
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    response_payload["signature"] = _sign(response_payload)

    try:
        _persist_snapshot(
            {
                "plan_id": plan_id,
                "user_id": user.get("id"),
                "status": status,
                "request_payload": {
                    "cart_items": list(item_filter),
                    "selected_count": len(selected),
                },
                "response_payload": response_payload,
                "signature": response_payload["signature"],
                "computed_at": response_payload["computed_at"],
            }
        )
    except Exception:
        # Snapshot failure should never cause the app to invent math locally.
        response_payload["snapshot_persisted"] = False
    else:
        response_payload["snapshot_persisted"] = True

    if status == "APPROVED":
        try:
            _persist_funding_authorization(
                {
                    "plan_id": plan_id,
                    "user_id": user.get("id"),
                    "authorization_status": "AUTHORIZED",
                    "authorized_amount_cents": totals["you_pay_cents"],
                    "savings_pct": totals["savings_pct"],
                    "retailer_nodes": sorted(retailer_nodes),
                    "signature": response_payload["signature"],
                    "math_payload": response_payload,
                    "expires_at": expires_at,
                    "authorized_at": response_payload["computed_at"],
                }
            )
        except Exception:
            response_payload["funding_authorization_persisted"] = False
        else:
            response_payload["funding_authorization_persisted"] = True

    return jsonify(response_payload)
