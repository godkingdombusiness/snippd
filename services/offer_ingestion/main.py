from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from typing import Any

import requests
from fastapi import FastAPI, HTTPException, Request
from pydantic import BaseModel, Field

from vertex_stack_reasoning import reason_with_gemini

app = FastAPI(title="Snippd Offer Ingestion", version="1.0.0")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

RETAILER_SEARCH_URLS = {
    "dollar_general": "https://www.dollargeneral.com/deals/coupons?search={query}",
    "kroger": "https://www.kroger.com/savings/cl/coupons?searchTerm={query}",
    "publix": "https://www.publix.com/savings/digital-coupons?search={query}",
    "walmart": "https://www.walmart.com/coupons?query={query}",
    "target": "https://www.target.com/circle/offers?keyword={query}",
}

RETAILER_HUB_URLS = {
    "dollar_general": "https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0",
    "kroger": "https://www.kroger.com/savings/cl/coupons",
    "publix": "https://www.publix.com/savings/digital-coupons",
    "walmart": "https://www.walmart.com/coupons",
    "target": "https://www.target.com/circle",
}


class IngestPayload(BaseModel):
    retailer_key: str | None = None
    source_url: str | None = None
    source_type: str = "manual"
    offers: list[dict[str, Any]] = Field(default_factory=list)
    coupons: list[dict[str, Any]] = Field(default_factory=list)
    run_stack_reasoning: bool = False
    trigger_source: str = "manual"


def _require_config() -> None:
    if not SUPABASE_URL or not SERVICE_KEY:
        raise HTTPException(status_code=500, detail="SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing")


def _headers(prefer: str = "return=representation") -> dict[str, str]:
    return {
        "apikey": SERVICE_KEY,
        "Authorization": f"Bearer {SERVICE_KEY}",
        "Content-Type": "application/json",
        "Prefer": prefer,
    }


def _retailer_key(value: str | None) -> str:
    return re.sub(r"(^_+|_+$)", "", re.sub(r"[^a-z0-9]+", "_", (value or "").strip().lower()))


def _product_key(value: str | None) -> str:
    return _retailer_key(value)


def _cents(*values: Any) -> int | None:
    for value in values:
        if value is None or value == "":
            continue
        num = float(value)
        return int(round(num * 100)) if num < 500 else int(round(num))
    return None


def _source_hash(row: dict[str, Any]) -> str:
    encoded = repr(sorted(row.items())).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _sb_post(
    table: str,
    rows: list[dict[str, Any]],
    prefer: str = "resolution=merge-duplicates,return=representation",
    on_conflict: str | None = None,
) -> list[dict[str, Any]]:
    if not rows:
        return []
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if on_conflict:
        url = f"{url}?on_conflict={on_conflict}"
    response = requests.post(
        url,
        headers=_headers(prefer),
        json=rows,
        timeout=30,
    )
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Supabase write failed for {table}: {response.text}")
    try:
        data = response.json()
        return data if isinstance(data, list) else []
    except Exception:
        return []


def _sb_patch(table: str, query: str, payload: dict[str, Any]) -> None:
    response = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?{query}",
        headers=_headers("return=minimal"),
        json=payload,
        timeout=20,
    )
    if not response.ok:
        raise HTTPException(status_code=502, detail=f"Supabase update failed for {table}: {response.text}")


def _sb_select(table: str, query: str) -> list[dict[str, Any]]:
    response = requests.get(f"{SUPABASE_URL}/rest/v1/{table}?{query}", headers=_headers(), timeout=20)
    if not response.ok:
        return []
    data = response.json()
    return data if isinstance(data, list) else []


def _create_run(retailer_key: str | None, trigger_source: str) -> str | None:
    rows = _sb_post("stack_generation_runs", [{
        "retailer_key": retailer_key,
        "model_function_used": "offer-ingestion-cloudrun",
        "status": "running",
        "trigger_source": trigger_source,
        "source_tables_used": ["retailer_data_sources", "normalized_offers", "normalized_coupons"],
    }])
    return rows[0].get("id") if rows else None


def _finish_run(run_id: str | None, status: str, counts: dict[str, int], metadata: dict[str, Any] | None = None) -> None:
    if not run_id:
        return
    payload = {
        "status": status,
        "completed_at": datetime.now(timezone.utc).isoformat(),
        "offers_ingested": counts.get("offers_ingested", 0),
        "coupons_matched": counts.get("coupons_matched", 0),
        "candidates_created": counts.get("candidates_created", 0),
        "candidates_approved": counts.get("candidates_approved", 0),
        "candidates_rejected": counts.get("candidates_rejected", 0),
        "generated_count": counts.get("candidates_created", 0),
        "approved_count": counts.get("candidates_approved", 0),
        "rejected_count": counts.get("candidates_rejected", 0),
        "metadata": metadata or {},
    }
    _sb_patch("stack_generation_runs", f"id=eq.{run_id}", payload)


def resolve_coupon_link(coupon: dict[str, Any], retailer_key: str) -> dict[str, Any]:
    exact = coupon.get("item_url") or coupon.get("exact_coupon_url") or coupon.get("official_coupon_url") or coupon.get("link_url")
    product_name = coupon.get("product_name") or coupon.get("name") or ""
    canonical = _product_key(product_name)
    if exact and str(exact).startswith("https://"):
        return {
            "retailer_key": retailer_key,
            "product_name": product_name,
            "canonical_product_key": canonical,
            "link_type": "item",
            "link_url": exact,
            "source": "item_level",
            "confidence_score": 0.95,
        }
    search_template = RETAILER_SEARCH_URLS.get(retailer_key)
    if search_template and product_name:
        return {
            "retailer_key": retailer_key,
            "product_name": product_name,
            "canonical_product_key": canonical,
            "link_type": "search",
            "link_url": search_template.format(query=requests.utils.quote(product_name)),
            "source": "retailer_search",
            "confidence_score": 0.70,
        }
    hub = RETAILER_HUB_URLS.get(retailer_key)
    return {
        "retailer_key": retailer_key,
        "product_name": product_name,
        "canonical_product_key": canonical,
        "link_type": "hub" if hub else "unavailable",
        "link_url": hub,
        "source": "retailer_hub" if hub else "none",
        "confidence_score": 0.45 if hub else 0.0,
    }


def normalize_offer(raw: dict[str, Any], retailer_key: str, run_id: str | None, source_url: str | None) -> dict[str, Any]:
    product = raw.get("product_name") or raw.get("name") or raw.get("title")
    if not product:
        raise ValueError("offer product_name required")
    sale = _cents(raw.get("sale_price_cents"), raw.get("price_cents"), raw.get("sale_price"), raw.get("price"))
    regular = _cents(raw.get("regular_price_cents"), raw.get("regular_price"), raw.get("original_price"))
    savings = max(0, (regular or sale or 0) - (sale or regular or 0)) if regular or sale else None
    return {
        "source_offer_id": raw.get("source_offer_id") or raw.get("id") or _source_hash(raw),
        "retailer": raw.get("retailer") or retailer_key.replace("_", " ").title(),
        "retailer_key": retailer_key,
        "product_name": product,
        "brand": raw.get("brand"),
        "category": raw.get("category"),
        "size_text": raw.get("size_text") or raw.get("size"),
        "price_cents": sale,
        "regular_price_cents": regular,
        "deal_type": (raw.get("deal_type") or "unknown").lower(),
        "quantity_required": int(raw.get("quantity_required") or raw.get("quantity") or 1),
        "quantity_received": int(raw.get("quantity_received") or raw.get("quantity") or 1),
        "final_unit_price_cents": sale,
        "savings_cents": savings,
        "confidence_score": float(raw.get("confidence_score") or 0.7),
        "raw_source": raw,
        "source_url": source_url or raw.get("source_url"),
        "valid_from": raw.get("valid_from"),
        "valid_until": raw.get("valid_until") or raw.get("expiration_date"),
        "ingestion_run_id": run_id,
        "source_hash": _source_hash(raw),
        "canonical_product_key": _product_key(product),
    }


def normalize_coupon(raw: dict[str, Any], retailer_key: str, run_id: str | None) -> dict[str, Any]:
    product = raw.get("product_name") or raw.get("name") or raw.get("title")
    if not product:
        raise ValueError("coupon product_name required")
    return {
        "retailer_key": retailer_key,
        "coupon_id": raw.get("coupon_id") or raw.get("id") or _source_hash(raw),
        "product_name": product,
        "brand": raw.get("brand"),
        "canonical_product_key": _product_key(product),
        "discount_cents": _cents(raw.get("discount_cents"), raw.get("coupon_value_cents"), raw.get("discount"), raw.get("value")) or 0,
        "discount_pct": raw.get("discount_pct"),
        "coupon_type": raw.get("coupon_type") or "digital",
        "link_url": raw.get("link_url") or raw.get("exact_coupon_url") or raw.get("official_coupon_url"),
        "source_url": raw.get("source_url"),
        "valid_from": raw.get("valid_from"),
        "expires_at": raw.get("expires_at") or raw.get("expiration_date"),
        "is_active": raw.get("is_active", True),
        "confidence_score": float(raw.get("confidence_score") or 0.75),
        "raw_source": raw,
        "ingestion_run_id": run_id,
    }


def _candidate_rows(reasoned: list[dict[str, Any]], retailer_key: str, run_id: str | None) -> list[dict[str, Any]]:
    rows = []
    week = datetime.now(timezone.utc).date().isoformat()
    for candidate in reasoned:
        rows.append({
            "retailer_key": retailer_key,
            "week_of": week,
            "dedupe_key": f"{retailer_key}:{_source_hash(candidate)}",
            "items": candidate.get("items", []),
            "stack_rank_score": float(candidate.get("confidence_score") or 0),
            "savings_pct": 0,
            "has_coupon": any((item.get("coupon_value_cents") or 0) > 0 for item in candidate.get("items", [])),
            "source_tables_used": ["normalized_offers", "normalized_coupons", "retailer_rules"],
            "rules_applied": [{"rule": "vertex_reasoning_candidate"}],
            "model_function_used": candidate.get("model_function_used") or "vertex",
            "generation_timestamp": datetime.now(timezone.utc).isoformat(),
            "review_status": "pending",
            "generation_run_id": run_id,
            "explanation": candidate.get("explanation"),
            "confidence_score": candidate.get("confidence_score"),
        })
    return rows


async def ingest_payload(payload: IngestPayload, retailer_override: str | None = None) -> dict[str, Any]:
    _require_config()
    retailer_key = _retailer_key(retailer_override or payload.retailer_key)
    if not retailer_key:
        raise HTTPException(status_code=400, detail="retailer_key required")

    run_id = _create_run(retailer_key, payload.trigger_source)
    counts = {
        "offers_ingested": 0,
        "coupons_matched": 0,
        "candidates_created": 0,
        "candidates_approved": 0,
        "candidates_rejected": 0,
    }

    try:
        _sb_post("retailer_data_sources", [{
            "retailer_key": retailer_key,
            "source_type": payload.source_type,
            "source_url": payload.source_url,
            "last_ingested_at": datetime.now(timezone.utc).isoformat(),
            "last_status": "running",
            "metadata": {"trigger_source": payload.trigger_source},
        }], prefer="resolution=merge-duplicates,return=minimal", on_conflict="retailer_key,source_type,source_url")

        offer_rows = []
        for raw in payload.offers:
            try:
                offer_rows.append(normalize_offer(raw, retailer_key, run_id, payload.source_url))
            except ValueError:
                continue
        coupon_rows = []
        link_rows = []
        for raw in payload.coupons:
            try:
                coupon = normalize_coupon(raw, retailer_key, run_id)
                coupon_rows.append(coupon)
                link_rows.append(resolve_coupon_link(raw, retailer_key))
            except ValueError:
                continue

        _sb_post("normalized_offers", offer_rows, on_conflict="source_offer_id")
        _sb_post("normalized_coupons", coupon_rows)
        _sb_post("coupon_activation_links", link_rows)

        counts["offers_ingested"] = len(offer_rows)
        counts["coupons_matched"] = len(coupon_rows)

        reasoning_metadata: dict[str, Any] = {"vertex_enabled": payload.run_stack_reasoning}
        if payload.run_stack_reasoning and offer_rows:
            retailer_rules = _sb_select("retailer_rules", f"retailer_key=eq.{retailer_key}&select=*")
            examples = _sb_select("stack_training_feedback", "action=eq.approve&select=*&limit=20")
            reasoning = reason_with_gemini(offer_rows, coupon_rows, retailer_rules, examples)
            candidate_rows = _candidate_rows(reasoning.candidates, retailer_key, run_id)
            _sb_post("stack_candidates", candidate_rows)
            counts["candidates_created"] = len(candidate_rows)
            counts["candidates_rejected"] = len(reasoning.rejected)
            reasoning_metadata = {
                "vertex_model": reasoning.model_used,
                "vertex_rejected": reasoning.rejected[:10],
            }

        _sb_post("retailer_data_sources", [{
            "retailer_key": retailer_key,
            "source_type": payload.source_type,
            "source_url": payload.source_url,
            "last_ingested_at": datetime.now(timezone.utc).isoformat(),
            "last_status": "completed",
        }], prefer="resolution=merge-duplicates,return=minimal", on_conflict="retailer_key,source_type,source_url")

        _finish_run(run_id, "completed", counts, reasoning_metadata)
        return {"ok": True, "run_id": run_id, **counts}
    except Exception as exc:
        _finish_run(run_id, "failed", counts, {"error": str(exc)})
        raise


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "offer-ingestion"}


@app.post("/ingest/retailer")
async def ingest_retailer(payload: IngestPayload) -> dict[str, Any]:
    return await ingest_payload(payload)


@app.post("/ingest/dollar-general")
async def ingest_dollar_general(payload: IngestPayload) -> dict[str, Any]:
    return await ingest_payload(payload, "dollar_general")


@app.post("/ingest/kroger")
async def ingest_kroger(payload: IngestPayload) -> dict[str, Any]:
    return await ingest_payload(payload, "kroger")


@app.post("/ingest/manual-upload")
async def ingest_manual_upload(payload: IngestPayload, request: Request) -> dict[str, Any]:
    payload.source_type = payload.source_type or "manual_upload"
    if not payload.offers and not payload.coupons:
        return {
            "ok": True,
            "run_id": None,
            "offers_ingested": 0,
            "coupons_matched": 0,
            "candidates_created": 0,
            "candidates_approved": 0,
            "candidates_rejected": 0,
            "reason": "no_payload_rows",
        }
    return await ingest_payload(payload)
