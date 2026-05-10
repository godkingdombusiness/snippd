from __future__ import annotations

import json
import os
from dataclasses import dataclass
from typing import Any


REQUIRED_CANDIDATE_KEYS = {
    "retailer_key",
    "title",
    "items",
    "confidence_score",
    "explanation",
}


@dataclass
class ReasoningResult:
    candidates: list[dict[str, Any]]
    rejected: list[dict[str, Any]]
    model_used: str


def _product_key(value: str | None) -> str:
    import re

    return re.sub(r"(^_+|_+$)", "", re.sub(r"[^a-z0-9]+", "_", (value or "").lower()))


def _candidate_is_clear(candidate: dict[str, Any]) -> tuple[bool, str | None]:
    missing = [key for key in REQUIRED_CANDIDATE_KEYS if key not in candidate]
    if missing:
        return False, f"missing_required_keys:{','.join(missing)}"
    items = candidate.get("items")
    if not isinstance(items, list) or not items:
        return False, "items_required"
    for item in items:
        if not item.get("product_name") and not item.get("name"):
            return False, "item_name_required"
        if item.get("regular_price_cents") is None and item.get("price_cents") is None:
            return False, "regular_price_required"
    score = float(candidate.get("confidence_score") or 0)
    if score < 0.55:
        return False, "confidence_below_floor"
    return True, None


def _strict_json_from_text(text: str) -> list[dict[str, Any]]:
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start < 0 or end < start:
            return []
        parsed = json.loads(text[start : end + 1])
    if isinstance(parsed, dict):
        parsed = parsed.get("candidates", [])
    return parsed if isinstance(parsed, list) else []


def build_prompt(
    offers: list[dict[str, Any]],
    coupons: list[dict[str, Any]],
    retailer_rules: list[dict[str, Any]],
    examples: list[dict[str, Any]],
) -> str:
    schema = {
        "retailer_key": "string",
        "title": "string",
        "items": [
            {
                "product_name": "string",
                "regular_price_cents": "integer",
                "sale_price_cents": "integer",
                "coupon_value_cents": "integer",
                "quantity": "integer",
                "offer_id": "string",
                "coupon_id": "string|null",
            }
        ],
        "confidence_score": "number 0..1",
        "explanation": "string",
        "rejection_reason": "string|null",
    }
    return (
        "You are Snippd's stack reasoning engine. Return JSON only.\n"
        "Create only grocery stacks that are clear, verifiable, and can be checked by deterministic math.\n"
        "Reject unclear stacks by omitting them. Never invent prices, coupons, retailers, or savings.\n"
        f"Output schema: {json.dumps(schema)}\n"
        f"Retailer rules: {json.dumps(retailer_rules)[:12000]}\n"
        f"Human-approved examples: {json.dumps(examples)[:12000]}\n"
        f"Offers: {json.dumps(offers)[:50000]}\n"
        f"Coupons: {json.dumps(coupons)[:30000]}\n"
    )


def reason_with_gemini(
    offers: list[dict[str, Any]],
    coupons: list[dict[str, Any]],
    retailer_rules: list[dict[str, Any]],
    examples: list[dict[str, Any]],
) -> ReasoningResult:
    model_name = os.environ.get("VERTEX_GEMINI_MODEL", "gemini-1.5-pro")
    if os.environ.get("VERTEX_AI_ENABLED", "").lower() not in {"1", "true", "yes"}:
        return ReasoningResult(candidates=[], rejected=[], model_used="vertex_disabled")

    prompt = build_prompt(offers, coupons, retailer_rules, examples)
    try:
        import vertexai
        from vertexai.generative_models import GenerativeModel, GenerationConfig

        project = os.environ["GOOGLE_CLOUD_PROJECT"]
        location = os.environ.get("VERTEX_AI_LOCATION", "us-central1")
        vertexai.init(project=project, location=location)
        model = GenerativeModel(model_name)
        response = model.generate_content(
            prompt,
            generation_config=GenerationConfig(
                response_mime_type="application/json",
                temperature=0.1,
                max_output_tokens=8192,
            ),
        )
        raw_candidates = _strict_json_from_text(response.text or "[]")
    except Exception as exc:
        return ReasoningResult(
            candidates=[],
            rejected=[{"reason": "vertex_call_failed", "detail": str(exc)}],
            model_used=model_name,
        )

    accepted: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    for candidate in raw_candidates:
        ok, reason = _candidate_is_clear(candidate)
        if ok:
            candidate["canonical_product_keys"] = [
                _product_key(item.get("product_name") or item.get("name"))
                for item in candidate.get("items", [])
            ]
            candidate["model_function_used"] = f"vertex:{model_name}"
            accepted.append(candidate)
        else:
            rejected.append({"reason": reason, "candidate": candidate})

    return ReasoningResult(candidates=accepted, rejected=rejected, model_used=model_name)
