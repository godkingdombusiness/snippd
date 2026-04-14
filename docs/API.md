# Snippd — API Reference

> All Edge Functions run on Supabase's Deno runtime.
> Base URL: `{SUPABASE_URL}/functions/v1/`
> CORS: `Access-Control-Allow-Origin: *` on all endpoints.

---

## Authentication

Two auth methods are supported:

| Method | Header | Used for |
|---|---|---|
| Bearer JWT | `Authorization: Bearer <jwt>` | App clients (React Native) |
| Ingest API key | `x-ingest-key: <key>` | Server-to-server ingestion |

---

## POST /functions/v1/ingest-event

Ingests one or more behavioral events. Writes to `event_stream`. Optionally writes recommendation exposures.

**File:** `supabase/functions/ingest-event/index.ts`

### Single event request body
```json
{
  "event_name": "COUPON_CLIPPED",
  "user_id": "uuid",
  "session_id": "uuid",
  "household_id": "uuid",
  "screen_name": "CouponDetail",
  "object_type": "coupon",
  "object_id": "uuid",
  "retailer_key": "publix",
  "category": "dairy",
  "brand": "Yoplait",
  "rank_position": 2,
  "model_version": "v1.0.0",
  "explanation_shown": false,
  "timestamp": "2026-04-12T14:30:00Z",
  "metadata": { "coupon_value_cents": 75 },
  "context": { "app_version": "2.1.0" }
}
```

### Batch request body
```json
{
  "events": [
    { "event_name": "ITEM_VIEWED", "user_id": "...", "session_id": "...", "..." : "..." },
    { "event_name": "COUPON_CLIPPED", "user_id": "...", "session_id": "...", "..." : "..." }
  ]
}
```

**Required fields:** `event_name`, `user_id`, `session_id`

**Recommendation exposure** — triggered automatically when `event_name` is `RECOMMENDATION_EXPOSED` or `recommendation_type` is present. Requires `object_id`.

**Outcome update** — when `outcome_status` is `clicked`, `accepted`, or `dismissed`, updates the matching `recommendation_exposures` row.

### Response
```json
{
  "status": "ok",
  "inserted_events": 2,
  "inserted_exposures": 0,
  "updated_outcomes": 0,
  "events": [],
  "exposures": [],
  "outcomes": []
}
```

### Rate limiting

JWT-authenticated requests only (API key calls are not rate-limited):

- **Max:** 200 requests per user per hour
- **Enforcement:** `api_rate_limit_log` table — one row inserted per request, counted over the rolling 60-minute window
- **When exceeded:** `429 Too Many Requests`
  ```json
  { "error": "Rate limit exceeded", "retry_after_seconds": 60 }
  ```
- **Cleanup:** Records older than 2 hours are deleted on ~1% of requests (probabilistic GC)

### Input validation

All fields are validated before DB writes. Unknown fields are rejected.

| Field | Rules |
|---|---|
| `event_name` | Required, string, max 100 characters |
| `session_id` | Required, valid UUID (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`) |
| `user_id` | Required, string |
| `retailer_key` | Optional; if present: alphanumeric + underscore only, max 50 chars |
| `category` | Optional; string, max 100 chars |
| `metadata` | Optional; JSON object (not array), max 10 keys, nesting depth ≤ 2 |
| Unknown fields | Rejected with 400 |

### Error responses
| Status | Condition |
|---|---|
| 400 | Validation error, unknown field, invalid JSON, missing required fields |
| 401 | No auth header or invalid JWT |
| 405 | Non-POST method |
| 429 | Rate limit exceeded (JWT auth only) |
| 500 | Supabase insert error or missing env vars |

### Request logging

Every request writes one row to `ingestion_run_log` (`source_key = 'ingest-event'`) with `stage = 'success'` or `'error'`, HTTP `status` code, and `metadata: { user_id, duration_ms, event_count }`.

---

## POST /functions/v1/stack-compute

Computes the optimal coupon stack for a basket at a given retailer. Returns validated offers in canonical order with full savings breakdown.

**File:** `supabase/functions/stack-compute/index.ts`
**Auth:** Bearer JWT required.

### Request body
```json
{
  "retailer_key": "publix",
  "basket_id": "uuid",
  "persist": false,
  "items": [
    {
      "id": "item-1",
      "name": "Chicken Breast",
      "regular_price_cents": 899,
      "quantity": 2,
      "category": "meat",
      "brand": "Perdue",
      "offers": [
        {
          "id": "offer-1",
          "offer_type": "SALE",
          "description": "20% off chicken",
          "discount_pct": 0.20,
          "stackable": true
        },
        {
          "id": "offer-2",
          "offer_type": "MANUFACTURER_COUPON",
          "description": "$1.00 off Perdue",
          "discount_cents": 100,
          "coupon_type": "manufacturer",
          "stackable": true
        }
      ]
    }
  ]
}
```

**Offer type values:** `SALE` | `BOGO` | `MULTI` | `BUY_X_GET_Y` | `LOYALTY_PRICE` | `STORE_COUPON` | `MANUFACTURER_COUPON` | `DIGITAL_COUPON` | `REBATE`

**`persist: true`** — saves the result to `stack_results` under the authenticated user.

### Response
```json
{
  "status": "ok",
  "result": {
    "basketId": "uuid",
    "retailerKey": "publix",
    "basketRegularCents": 1798,
    "basketFinalCents": 1238,
    "totalSavingsCents": 560,
    "inStackSavingsCents": 560,
    "rebateCents": 0,
    "warnings": [],
    "rejectedOfferIds": [],
    "computedAt": "2026-04-12T14:30:00Z",
    "modelVersion": "v1.0.0",
    "explanation": {
      "summary": "Stack saves $5.60 (31.1%) on 1 item(s) at publix.",
      "orderApplied": ["SALE", "MANUFACTURER_COUPON"],
      "lineBreakdown": [
        {
          "itemName": "Chicken Breast",
          "regularTotal": "$17.98",
          "finalTotal": "$12.38",
          "savings": "$5.60"
        }
      ]
    },
    "lines": [ "..." ]
  }
}
```

### Warning codes

| Code | Meaning |
|---|---|
| `OFFER_EXPIRED` | Offer past `expires_at` |
| `QUANTITY_REQUIRED` | Item qty below `required_qty` |
| `NON_STACKABLE` | Multiple non-stackable offers; kept first |
| `MUTUAL_EXCLUSION` | Offer in same exclusion group as higher-priority offer |
| `COUPON_TYPE_NOT_ALLOWED` | Coupon type not in retailer's `allowed_coupon_types` |
| `SALE_DIGITAL_BLOCKED` | Retailer blocks DIGITAL_COUPON when SALE present |
| `SALE_LOYALTY_BLOCKED` | Retailer blocks LOYALTY_PRICE when SALE present |
| `BOGO_COUPON_BLOCKED` | Retailer blocks coupons when BOGO present |
| `MANUFACTURER_LIMIT` | Over `max_manufacturer_coupons`; kept highest value |
| `STORE_LIMIT` | Over `max_store_coupons`; kept highest value |
| `MAX_REDEMPTIONS_REACHED` | Qty exceeds `max_redemptions` |
| `COUPON_FLOOR_APPLIED` | Coupon would push price negative; clamped to $0 |

### Input validation

| Field | Rules |
|---|---|
| `retailer_key` | Required; alphanumeric + underscore only, max 50 chars |
| `items` | Required; array, 1–50 entries |
| `items[].id` | Optional; if provided must be a valid UUID |
| `items[].quantity` | Integer, 1–100 |
| `items[].regular_price_cents` | Positive integer, max 100 000 (≤ $1,000) |
| `items[].offers` / `available_offers` | Max 10 per item (excess silently truncated during coercion) |

### Error responses
| Status | Condition |
|---|---|
| 400 | Validation failure — descriptive message identifies the field and rule |
| 401 | Missing or invalid JWT |
| 405 | Non-POST method |
| 500 | DB error or missing env vars |

### Request logging

Every request writes one row to `ingestion_run_log` (`source_key = 'stack-compute'`) with `stage = 'success'` or `'error'`, HTTP `status`, and `metadata: { user_id, duration_ms, item_count }`.

---

## GET /functions/v1/get-cart-options

Returns 3 personalised cart options for the authenticated user at a given retailer for the given week. All computation happens in the Edge Function — response time target under 2 seconds.

**File:** `supabase/functions/get-cart-options/index.ts`
**Auth:** Bearer JWT required.

### Query parameters
| Param | Required | Example | Notes |
|---|---|---|---|
| `retailer_key` | Yes | `publix` | |
| `week_of` | No | `2026-04-14` | Defaults to current date |

### Example request
```
GET /functions/v1/get-cart-options?retailer_key=publix&week_of=2026-04-14
Authorization: Bearer <jwt>
```

### Response
```json
{
  "status": "ok",
  "computed_at": "2026-04-14T10:00:00Z",
  "retailer_key": "publix",
  "week_of": "2026-04-14",
  "elapsed_ms": 1243,
  "carts": [
    {
      "cart_id": "uuid",
      "cart_type": "max_savings",
      "retailer_set": ["publix"],
      "items": [
        {
          "product_id": "item-uuid",
          "name": "Chicken Breast",
          "qty": 2,
          "regular_price_cents": 1798,
          "final_price_cents": 1238,
          "savings_cents": 560,
          "retailer_key": "publix",
          "category": "meat",
          "brand": "Perdue"
        }
      ],
      "subtotal_before_savings_cents": 5200,
      "subtotal_after_savings_cents": 3800,
      "total_savings_cents": 1400,
      "savings_pct": 26.9,
      "store_count": 1,
      "item_count": 8,
      "explanation": [
        "Saves $5.60 on Chicken Breast",
        "Saves $3.00 on Orange Juice",
        "Stays $4.20 under your weekly budget"
      ],
      "reason_codes": ["savings_optimised", "within_budget", "has_savings"],
      "budget_fit": true,
      "model_version": "v1.0.0",
      "cart_acceptance_probability": 0.72
    },
    { "cart_type": "balanced", "..." : "..." },
    { "cart_type": "convenience", "..." : "..." }
  ]
}
```

**Cart types returned (always in this order):**
1. `max_savings` — highest effective discount %, may cross multiple stores, 15–25 items
2. `balanced` — 50% savings + 50% preference score, single store preferred, 12–18 items
3. `convenience` — highest preference score only, single store, 8–12 items

### Error responses
| Status | Condition |
|---|---|
| 400 | Missing `retailer_key` param |
| 401 | Missing or invalid JWT |
| 405 | Non-GET method |
| 500 | DB error |

---

## POST /functions/v1/process-receipt

Processes an uploaded receipt image. OCRs via Gemini Vision (fallback: GPT-4V), writes parsed line items, triggers WealthEngine computation, fires `purchase_completed` event.

**File:** `supabase/functions/process-receipt/index.ts`
**Auth:** Bearer JWT required.

### Request body
```json
{ "receipt_upload_id": "uuid" }
```

### Response
```json
{
  "success": true,
  "receipt": {
    "store_name": "Publix",
    "date": "2026-04-14",
    "items": [
      {
        "product_name": "Chicken Breast",
        "qty": 2,
        "unit_price": 999,
        "line_total": 1998,
        "promo_savings_cents": 200,
        "normalized_key": "chicken breast",
        "category": "meat",
        "brand": "Perdue"
      }
    ],
    "subtotal_cents": 5200,
    "tax_cents": 416,
    "total_cents": 5616
  },
  "wealth_result": {
    "user_id": "uuid",
    "timestamp": "2026-04-14T10:00:00Z",
    "realized_savings": 450,
    "inflation_offset": 250,
    "velocity_score": 0.72,
    "wealth_momentum": 716,
    "projected_annual_wealth": 37232,
    "budget_stress_alert": false,
    "budget_stress_score": 0.2,
    "transparency_report": { "math_version": "v1.0.0", "..." : "..." }
  }
}
```

### Side effects
- Writes rows to `receipt_items`
- Updates `receipt_uploads.status` → `'parsed'`
- Writes row to `wealth_momentum_snapshots`
- Inserts `purchase_completed` event into `event_stream`

### Error responses
| Status | Condition |
|---|---|
| 400 | Missing `receipt_upload_id`, receipt already processed |
| 401 | Missing or invalid JWT |
| 404 | Receipt upload not found |
| 405 | Non-POST method |
| 500 | Vision API error, DB error, or missing env vars |

### Required env vars
| Var | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `GEMINI_API_KEY` | Gemini Vision API key (primary OCR) |
| `OPENAI_API_KEY` | (Optional) GPT-4V fallback when `VISION_API=openai` |
| `VISION_API` | (Optional) `gemini` (default) or `openai` |

---

## GET /functions/v1/get-wealth-momentum

Returns the authenticated user's wealth momentum history, velocity score, lifetime savings, and a time-series array for charting.

**File:** `supabase/functions/get-wealth-momentum/index.ts`
**Auth:** Bearer JWT required.

### Response
```json
{
  "success": true,
  "data": {
    "snapshots": [ { "..." : "..." } ],
    "current_velocity_score": 0.72,
    "lifetime_realized_savings": 12450,
    "inflation_shield_total": 4200,
    "transparency_report": {
      "math_version": "v1.0.0",
      "data_sources": ["USDA CPI benchmarks from app_config", "..."],
      "formula": "(inflation_shield + stacking_savings) × (1 + velocity_score/10) × 52",
      "breakdown": [ { "component": "inflation_shield", "value": 250, "explanation": "..." } ]
    },
    "time_series": [
      { "date": "2026-04-07", "savings": 380, "momentum": 19760, "inflation_offset": 150 },
      { "date": "2026-04-14", "savings": 450, "momentum": 23400, "inflation_offset": 250 }
    ]
  }
}
```

### Error responses
| Status | Condition |
|---|---|
| 401 | Missing or invalid JWT |
| 405 | Non-GET method |
| 500 | DB error |

---

## POST /functions/v1/trigger-ingestion

Creates an ingestion job for a weekly-ad PDF. The `ingestionWorker` picks it up within 30 minutes.

**File:** `supabase/functions/trigger-ingestion/index.ts`
**Auth:** Service role key only — via `x-ingest-key: <service_role_key>` or `Authorization: Bearer <service_role_key>`.

### Request body
```json
{
  "retailer_key": "publix",
  "week_of": "2026-04-14",
  "storage_path": "publix/2026-04-14/weekly-ad.pdf"
}
```

All three fields are required. `week_of` must be `YYYY-MM-DD`.

### Response
```json
{
  "status": "ok",
  "job_id": "uuid",
  "retailer_key": "publix",
  "week_of": "2026-04-14",
  "storage_path": "publix/2026-04-14/weekly-ad.pdf",
  "job_status": "queued",
  "created_at": "2026-04-14T10:00:00Z"
}
```

### Error responses
| Status | Condition |
|---|---|
| 400 | Missing required fields, bad `week_of` format |
| 401 | Missing or invalid service role key |
| 405 | Non-POST method |
| 500 | DB insert error |

---

## GET /functions/v1/admin-graph-stats

Returns Neo4j memory graph topology stats for the admin graph viewer. Queries Neo4j via the HTTP Transaction API — no npm deps.

**File:** `supabase/functions/admin-graph-stats/index.ts`
**Auth:** Bearer JWT required. Email must be in `ADMIN_EMAILS` env var (comma-separated) or match hardcoded defaults.

### Response
```json
{
  "status": "ok",
  "neo4j_configured": true,
  "computed_at": "2026-04-14T10:00:00Z",
  "nodes": {
    "User": 47, "Product": 1203, "Category": 28,
    "Brand": 156, "Store": 5, "Stack": 340
  },
  "relationships": {
    "PREFERS": 2340, "BUYS": 8901, "CO_OCCURS_WITH": 15230,
    "SHOWS_PATTERN": 312, "REJECTS": 89, "ACCEPTS": 210, "DISMISSES": 95
  },
  "top_categories": [
    { "name": "meat", "user_count": 35, "avg_score": 0.72 }
  ],
  "top_brands": [
    { "name": "Perdue", "user_count": 28, "avg_score": 0.68 }
  ],
  "top_co_occurrences": [
    { "product1": "chicken breast", "product2": "rice", "count": 45 }
  ],
  "top_cohort_pairs": [
    { "user1": "a1b2c3d4", "user2": "e5f6g7h8", "similarity": 0.91 }
  ]
}
```

If `neo4j_configured` is `false`, all counts are `0` and arrays are empty.

### Required env vars
| Var | Description |
|---|---|
| `NEO4J_URI` | Neo4j Aura URI (`neo4j+s://...`) |
| `NEO4J_USER` | Database user (default: `neo4j`) |
| `NEO4J_PASSWORD` | Database password |
| `ADMIN_EMAILS` | (Optional) Comma-separated admin emails; falls back to hardcoded list |

### Error responses
| Status | Condition |
|---|---|
| 401 | Missing or invalid JWT |
| 403 | Authenticated user is not in admin email list |
| 405 | Non-GET method |
| 500 | Neo4j query failed (message included in response body) |

---

## POST /functions/v1/graph-insights

Returns plain-language graph signal explanations for a given cart's items. Used by `CartOptionDetailScreen` to surface explainability ("Your neighbours love Perdue — we included it for you"). Queries Neo4j via the HTTP Transaction API (no npm deps). Gracefully returns empty arrays when `NEO4J_URI` is not configured.

**File:** `supabase/functions/graph-insights/index.ts`
**Auth:** Bearer JWT required.

### Request body
```json
{
  "items": [
    {
      "product_id": "uuid",
      "name": "Chicken Breast",
      "brand": "Perdue",
      "category": "meat",
      "normalized_key": "chicken breast"
    }
  ]
}
```

All fields except `name` are optional but improve signal coverage.

### Response
```json
{
  "status": "ok",
  "neo4j_configured": true,
  "neo4j_reachable": true,
  "cart_insights": [
    "Covers 3 of your favourite categories",
    "Includes Chicken Breast and Orange Juice — staples from your history",
    "2 items loved by shoppers with similar tastes"
  ],
  "item_insights": {
    "uuid-chicken": {
      "signal": "buy_history",
      "text": "You've bought Chicken Breast before — we kept it in"
    },
    "uuid-perdue-brand-item": {
      "signal": "cohort_brand",
      "text": "Your neighbours love Perdue — we included it for you to try"
    }
  }
}
```

**Signal types:**
| Signal | Meaning |
|---|---|
| `buy_history` | User has a `BUYS` edge to this product in Neo4j |
| `preferred_brand` | User has a `PREFERS` edge to this brand (score ≥ 0.5) |
| `preferred_category` | User has a `PREFERS` edge to this category (score ≥ 0.5) |
| `cohort_brand` | Cohort peer prefers this brand but user hasn't adopted it yet |
| `co_occurrence` | This product co-occurs with another item in the same cart |

When `neo4j_configured` is `false`, `cart_insights` and `item_insights` are empty. No error is returned.

### Error responses
| Status | Condition |
|---|---|
| 400 | Invalid JSON body |
| 401 | Missing or invalid JWT |
| 405 | Non-POST method |
