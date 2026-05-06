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

## Barcode Lookup (added 2026-05-03)

### POST /lookup-barcode
**Auth:** None (public endpoint)
**Body:** `{ "barcode": "012345678905" }`

Flow: `scanned_products` cache → Open Food Facts API → save to cache → fire `usda-search-food` in background.

**Response (found):**
```json
{
  "found": true,
  "source": "off",
  "product": {
    "name": "Cheerios",
    "brand": "General Mills",
    "image": "https://images.openfoodfacts.org/...",
    "ingredients": "Whole grain oats...",
    "allergens": ["gluten", "oats"],
    "nutrition": {
      "calories": 375,
      "protein": 12.5,
      "carbs": 67,
      "fat": 6.5,
      "fiber": 8,
      "sugar": 4,
      "sodium": 490
    },
    "barcode": "012345678905"
  }
}
```
**Response (not found):** `{ "found": false, "barcode": "012345678905" }`
Nutrition values are per 100g. `allergens` is a plain-English array (e.g. `["gluten", "milk"]`).

---

## Savings Loop Endpoints (added 2026-05-04)

### POST /generate-weekly-plan
**Auth:** Bearer JWT (required)
**Body:**
```json
{
  "meals": [{ "name": "Chicken Dinner", "ingredients": [...], "coupon": "...", "cal": 490 }],
  "projected_total_cents": 14382,
  "baseline_without_snippd_cents": 18240,
  "budget_target_cents": 15000,
  "household_size": 2,
  "preferred_stores": ["Publix"],
  "week_start": "2026-05-04"
}
```
Upserts `weekly_plans` (idempotent by user_id + week_start), inserts `weekly_plan_days` (7 rows), inserts `coupon_checklist` rows for meals with coupons.

**Response 200:**
```json
{
  "ok": true,
  "weekly_plan_id": "uuid",
  "projected_total": 143.82,
  "baseline_without_snippd_total": 182.40,
  "estimated_snippd_savings": 38.58,
  "budget_target": 150.00
}
```

---

### POST /compare-receipt-to-plan
**Auth:** Bearer JWT (required)
**Body:**
```json
{
  "weekly_plan_id": "uuid",
  "receipt_total_cents": 14000,
  "store": "Publix",
  "parsed_items": [...],
  "stack_items_count": 12,
  "total_saved_cents": 2200
}
```
`weekly_plan_id` is optional. When missing, baseline is estimated at 1.35× actual and labeled `baseline_is_estimated: true`. Saves to `receipt_outcomes` and returns full comparison.

**Response 200:**
```json
{
  "ok": true,
  "outcome_id": "uuid",
  "planned_total": 143.82,
  "actual_total": 140.00,
  "baseline_without_snippd_total": 182.40,
  "baseline_is_estimated": false,
  "planned_savings": 38.58,
  "actual_savings": 42.40,
  "plan_accuracy_percent": 97,
  "budget_target": 150.00,
  "budget_result": 10.00,
  "was_under_budget": true,
  "matched_items_count": 12,
  "missing_items_count": 3,
  "coupons_expected": 4,
  "coupons_confirmed": 3,
  "meals_covered": 6
}
```

---

## Adaptive Memory Endpoints (added 2026-05-03)

### POST /record-memory-event
**Auth:** Bearer JWT (required)
**Body:**
```json
{
  "event_type": "survey_completed",
  "survey_response": { "saved_money": "yes", "matched_store": "mostly", "use_again": "yes" },
  "savings": 1450,
  "store_id": "publix-123",
  "metadata": { "store": "Publix", "rating": "good" }
}
```
Allowed `event_type` values: `product_viewed`, `product_added_to_cart`, `product_removed_from_cart`, `barcode_scanned`, `cart_completed`, `receipt_confirmed`, `survey_completed`, `deal_clipped`, `deal_dismissed`, `store_selected`, `onboarding_completed`.

**Response 200:**
```json
{ "ok": true, "neo4j_synced": true, "profile": { "savings_priority": 0.72, "nutrition_priority": 0.45, ... } }
```
Always HTTP 200. Neo4j write is non-blocking — `neo4j_synced: false` means Supabase insert succeeded but Neo4j was unreachable.

---

### POST /get-dynamic-home-layout
**Auth:** Bearer JWT (required)
**Body:** `{}` (no body required)

**Response 200:**
```json
{
  "status": "ok",
  "source": "profile",
  "sections": ["weekly_budget", "hottest_deals", "plan_my_week", "scan_item", "cart_summary", "receipt", "buying_power", "feature_grid"],
  "alerts": [{ "type": "store_accuracy", "message": "Your store prices may be off. Re-scan next trip.", "severity": "warning" }],
  "emphasized_actions": ["scan_item"],
  "hidden_sections": [],
  "fallback": false
}
```
Returns `fallback: true` when no profile exists yet — `sections` is the default static order. Always HTTP 200.

---

### POST /sync-memory-events
**Auth:** Optional `Memory-Sync-Key` header (checked against `MEMORY_SYNC_KEY` secret if set)
**Body:** `{}` (no body required)

Fetches up to 100 `memory_events` where `neo4j_synced = false`, replays each to Neo4j, marks synced or records error. Returns `{ synced, failed, errors[] }`. Intended for cron or manual backfill.

---

## Nutrition Intelligence Endpoints (added 2026-05-03)

### POST /usda-search-food
**Auth:** None required (public; USDA_API_KEY stays server-side)
**Body:**
```json
{ "query": "whole milk", "product_name": "Great Value Whole Milk", "retailer": "Walmart" }
```
- `query` — required; sent to USDA FoodData Central
- `product_name` — optional; used for cache lookup key (falls back to `query`)
- `retailer` — optional; used to scope `product_nutrition_map` entry

**Response (hit):**
```json
{
  "hit": true,
  "source": "cache",
  "data": {
    "usda_food_id": 746782,
    "description": "Milk, whole, 3.25% milkfat",
    "calories": 61,
    "protein": 3.2,
    "carbs": 4.8,
    "fat": 3.3,
    "fiber": 0,
    "sugar": 5.1,
    "sodium": 44,
    "serving_size": 244,
    "serving_unit": "g",
    "last_updated": "2026-05-03T..."
  }
}
```
**Response (miss):** `{ "hit": false, "data": null }`
**Response (no key):** `{ "hit": false, "data": null, "warning": "USDA_API_KEY not configured" }`
Always HTTP 200. Cache-first: `product_nutrition_map` → `nutrition_cache` → USDA API. Requires ≥30% word overlap to accept match.

---

### POST /score-deals
**Auth:** Bearer JWT (user must be authenticated)
**Body:**
```json
{
  "stores": ["Publix", "Walmart"],
  "preferences": ["vegetarian", "budget"],
  "nutrition": {
    "min_protein": 10,
    "max_carbs": null,
    "max_calories": 300,
    "max_sodium": null
  },
  "limit": 30
}
```
All fields optional. `limit` capped at 60.

**Response 200:**
```json
{
  "deals": [
    {
      "id": "uuid",
      "product_name": "Chicken Breast",
      "retailer": "Publix",
      "price_cents": 599,
      "savings_cents": 200,
      "deal_type": "sale",
      "calories": 165,
      "protein": 31,
      "carbs": 0,
      "fat": 3.6,
      "composite_score": 0.7823,
      "score_breakdown": {
        "savings_score": 0.4,
        "nutrition_score": 0.9,
        "preference_score": 0.7,
        "novelty_score": 1.0,
        "composite": 0.7823
      }
    }
  ],
  "nutrition_summary": {
    "avg_calories": 165,
    "avg_protein": 31,
    "avg_carbs": 12,
    "avg_fat": 5.2,
    "enriched_count": 18,
    "total_count": 30
  },
  "total_returned": 30,
  "filters_applied": { "stores": ["Publix"], "preferences": ["vegetarian"], "nutrition": {...} }
}
```
Scoring weights: savings=0.45, nutrition=0.25, preference=0.20, novelty=0.10.
Updates `user_variation_state.last_seen_deals` (ring buffer, max 40 IDs) on every call.

---

## SOC2 Fortress Endpoints (2026-04-29)

### POST /verify-receipt — The Logic Lock
**Auth:** Bearer JWT
**Body:** `{ "receipt_upload_id": string, "content_hash"?: string }`

Single authoritative gatekeeper for receipt credit awards. Replaces client-side `applyReceiptVerifyCredits()` + `updateStreakOnVerify()`.

Security controls applied server-side:
1. JWT ownership check — upload must belong to the calling user (RLS enforced)
2. Duplicate detection — `receipt_upload_id` already claimed → `{ ok: false, error: "already_claimed" }` (HTTP 200, idempotent)
3. Content hash dedup — same physical receipt re-uploaded → `{ ok: false, error: "duplicate_receipt_content" }` (HTTP 422)
4. Velocity check — ≥3 receipts in 5 min → fraud flag + `{ ok: false, error: "velocity_limit_exceeded" }` (HTTP 429)
5. Atomic DB transaction — `process_receipt_verification()` RPC uses `SELECT FOR UPDATE`, ToCTOU impossible

**Response (success):**
```json
{
  "ok": true,
  "credits_earned": 10,
  "bonus_credits": 0,
  "total_credits_earned": 10,
  "streak_weeks": 7,
  "longest_streak": 7,
  "was_extended": true,
  "shield_used": false,
  "already_counted_this_week": false,
  "badges_earned": ["STREAK_4"]
}
```

**Variable reward:** `bonus_credits` is 25 (10% chance), 10 (30% chance), or 0 (60% chance) — computed server-side.

---

### POST /reflexion-agent — Self-Healing Reflexion Loop
**Auth:** `x-ingest-key` header
**Body:** empty (or `{}`)
**Trigger:** pg_cron every 6h, or on-demand from AdminPulseScreen

Scans `healing_events` for unanalyzed critical/warning events in the last 24h. Groups by `check_name`. For chronic patterns (≥2 failures), calls Gemini 1.5 Flash for root-cause + fix recommendation. Applies automated fixes where safe.

**Automated fix actions:**
| `auto_fix_action` | What it does |
|---|---|
| `flag_retailer_coverage` | Sets `market_readiness_score = 0` for the affected retailer |
| `update_user_preference` | Writes a preference key for all affected users |
| `clear_stale_cache` | Deletes `home_payload_cache` rows for affected users |
| `notify_admin` | Inserts a `REFLEXION_ADMIN_ALERT` healing event (surfaces in AdminPulseScreen) |

**Response:**
```json
{
  "ok": true,
  "events_scanned": 47,
  "patterns_found": 3,
  "patterns_analyzed": 2,
  "outcomes": [
    { "check_name": "session_integrity", "analysis": { ... }, "fix_result": "notify_admin" }
  ],
  "elapsed_ms": 1240
}
```

---

## Deal Intelligence Layer (2026-04-29)

### POST /functions/v1/deal-validator/validate
Run full validation + confidence scoring on one offer.
**Auth:** Bearer JWT or x-ingest-key
```json
{ "offer_id": "uuid" }
```
**Returns:** `{ confidence_score, validation_status, user_badge, reason_codes, is_blocked, needs_review }`

### POST /functions/v1/deal-validator/publish
Run publish gate on one offer. Auto-publishes if score ≥ 85. Queues review if blocked/needs-review.
```json
{ "offer_id": "uuid" }
```

### POST /functions/v1/deal-validator/feedback
Submit user deal outcome — feeds back into scoring.
```json
{
  "user_id": "uuid", "offer_id": "uuid",
  "outcome": "worked|coupon_failed|out_of_stock|wrong_price|substituted|quantity_not_met|exclusion_hit|register_rejected",
  "actual_cents": 350, "predicted_cents": 400,
  "store_id": "publix_32828", "zip_code": "32828", "state": "FL"
}
```

### POST /functions/v1/deal-validator/market
Get market readiness score for state/zip. Used for demo routing.
```json
{ "state": "FL", "zip_code": "32828", "retailer": "publix" }
```
**Returns:** `{ market_readiness_score, status: "demo_ready|demo_with_caution|national_generic_only", active_offers, verified_offers, avg_confidence }`

### POST /functions/v1/deal-validator/batch
Validate up to 100 offers at once (for post-ingestion scoring).
```json
{ "offer_ids": ["uuid", "uuid", ...] }
```

### POST /functions/v1/deal-validator/active-offers
Get display-ready offers filtered by state/retailer/confidence.
```json
{ "state": "FL", "retailer_key": "publix", "min_confidence": 70, "limit": 50 }
```

### POST /functions/v1/price-tracker/observe
Log a price observation for a product at a store/location.
```json
{
  "offer_source_id": "uuid", "retailer_key": "publix",
  "normalized_key": "bounty_6ct", "product_name": "Bounty Paper Towels 6ct",
  "observed_price_cents": 799, "zip_code": "32828", "state": "FL",
  "source_type": "flyer"
}
```

### POST /functions/v1/price-tracker/volatility
Compute price volatility over a time window.
```json
{ "offer_id": "uuid", "window_days": 14 }
```

### POST /functions/v1/price-tracker/history
Get price history trend for a product.
```json
{ "normalized_key": "bounty_6ct", "retailer_key": "publix", "limit": 30 }
```

### POST /functions/v1/run-deal-scoring
Batch scoring worker — run manually or via pg_cron.
**Auth:** x-ingest-key only
Runs `flag_stale_prices()` then `publish_gate()` on all pending/needs_review offers (≤500 per run).

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
## GET /functions/v1/get-weekly-plan
Returns a personalized Wednesday-Tuesday lifecycle manual for the authenticated user. Uses Supabase `home_payload_cache` for fast client rendering and falls back to rebuild the plan via the Edge Function on cache miss.

**File:** `supabase/functions/get-weekly-plan/index.ts`
**Auth:** Bearer JWT required.

### Query parameters
| Param | Required | Example | Notes |
|---|---|---|---|
| `refresh` | No | `true` | Skip cache and force rebuild |
| `headcount` | No | `4` | Optional household size override |
| `focus` | No | `savings` | Optional weekly focus override |

### Response
```json
{
  "ciphertext": "...",
  "hmac": "...",
  "_cache": "miss"
}
```

The client decrypts `ciphertext` with `EXPO_PUBLIC_STACK_SECRET` and verifies `hmac` with `EXPO_PUBLIC_HMAC_SECRET`.

### Lifecycle plan contract
The decrypted payload is expected to match `WeeklyLifecyclePlan` from `src/services/lifecyclePlan.ts`.

Hard-gate statuses:
- `APPROVED` - one-store basket, current circular dates, profile constraints, budget, and 60%+ savings floor passed.
- `LOW_YIELD_WEEK` - no honest 60% same-store stack exists after same-store fillers.
- `NEEDS_SUBSTITUTION` - a basket item violates profile exclusions and needs deterministic replacement.
- `DATA_STALE` - circular or coupon dates are outside the current validation window.
- `NO_RETAILER_COVERAGE` - the user's market cannot be mapped to a supported retailer node.

Circular metadata is part of the payload:
- `circular_valid_from` / `circular_valid_until` - current circular window used to build the stack.
- `next_circular_at` - next expected circular release for the retailer node.
- `stack_expires_at` - earliest sale/coupon expiry in the accepted basket.

### Cache behavior
- Reads `profiles.cached_weekly_plan` and returns cached ciphertext when valid (<24h).
- On rebuild, writes encrypted plan back to `profiles.cached_weekly_plan`.
- Also writes raw `plan` payload into `home_payload_cache` with `cache_key = 'weekly_plan'`, `generated_at`, `expires_at`, and `source = 'get-weekly-plan'`.
- Validator-approved payloads should also be upserted into `weekly_lifecycle_plans` with the same `plan_id` for receipt verification and learning hooks.

### Error responses
| Status | Condition |
|---|---|
| 401 | Missing or invalid JWT |
| 405 | Non-GET method |
| 500 | Server misconfiguration, DB error, or plan build failure |

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

---

## GET /functions/v1/health

System health check. No authentication required.

**File:** `supabase/functions/health/index.ts`

### Response (200 OK)
```json
{
  "status": "ok",
  "version": "0.4.0",
  "checks": {
    "database": { "ok": true, "latency_ms": 12 },
    "event_weights": { "ok": true, "latency_ms": 8 }
  },
  "timestamp": "2026-04-14T04:05:00.000Z",
  "latency_ms": 24
}
```

Returns `503` with `"status": "degraded"` if any check fails.

---

## POST /functions/v1/run-preference-updater

Cron wrapper that forwards to `preference-updater`.

**File:** `supabase/functions/run-preference-updater/index.ts`
**Auth:** `x-cron-secret` header OR service-role Bearer JWT

### Response
```json
{ "ok": true, "forwarded_to": "preference-updater", "result": { "users": 42, "rows": 318 }, "duration_ms": 1204 }
```

---

## POST /functions/v1/run-graph-sync

Triggers GitHub Actions `nightly-graph-sync.yml` via workflow_dispatch.

**File:** `supabase/functions/run-graph-sync/index.ts`
**Auth:** `x-cron-secret` header OR service-role Bearer JWT
**Required env vars:** `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO`

### Request body (optional)
```json
{ "skip_co_occurrences": false, "skip_cohort": false }
```

### Response
```json
{ "ok": true, "workflow": "nightly-graph-sync.yml", "duration_ms": 340 }
```

---

## POST /functions/v1/run-wealth-check

Scans `wealth_momentum_snapshots` for users with velocity attrition (>20% drop week-over-week).

**File:** `supabase/functions/run-wealth-check/index.ts`
**Auth:** `x-cron-secret` header OR service-role Bearer JWT

### Response
```json
{
  "ok": true,
  "users_checked": 148,
  "attrition_count": 7,
  "attrition_users": [
    { "user_id": "uuid", "current_velocity": 0.38, "baseline_velocity": 0.61, "drop_pct": 37 }
  ],
  "duration_ms": 520
}
```


---

## POST /functions/v1/run-ingestion-worker

Processes up to 3 queued ingestion jobs from `ingestion_jobs`. Runs the full pipeline inline: Gemini Vision extraction → `flyer_deal_staging` → `offer_sources` → `offer_matches` → `stack_candidates`.

**File:** `supabase/functions/run-ingestion-worker/index.ts`
**Auth:** `x-cron-secret` header OR service-role Bearer JWT
**Cron:** `*/30 * * * *` (every 30 minutes, job 39)

### Response
```json
{
  "ok": true,
  "processed": 2,
  "results": [
    { "job_id": "uuid", "status": "parsed", "deals_extracted": 47, "candidates_written": 41 },
    { "job_id": "uuid", "status": "retrying", "error": "Gemini API error 429" }
  ],
  "duration_ms": 8341
}
```

---

## POST /functions/v1/run-vertex-export

Exports 90-day labeled training data to Supabase Storage bucket `vertex-training-data` as JSONL.

**File:** `supabase/functions/run-vertex-export/index.ts`
**Auth:** `x-cron-secret` header OR service-role Bearer JWT
**Cron:** `0 3 * * 0` (every Sunday 03:00 UTC, job 41)

### Response
```json
{
  "ok": true,
  "rows_exported": 14823,
  "storage_path": "training_data/vertex_training_2026-04-14.jsonl",
  "started_at": "2026-04-14T03:00:01Z",
  "completed_at": "2026-04-14T03:02:47Z"
}
```


---

## RPC: get_weekly_plan

PostgreSQL RPC function — called via `supabase.rpc('get_weekly_plan', params)` from the app or via REST `POST /rest/v1/rpc/get_weekly_plan`.

**File:** `supabase/migrations/016_get_weekly_plan_fn.sql`
**Auth:** `authenticated` JWT (SECURITY DEFINER — executes as function owner)

### Parameters

| Parameter | Type | Default | Notes |
|---|---|---|---|
| `p_user_id` | uuid | required | Auth user's UUID — loads profile for allergen + calorie filters |
| `p_headcount` | integer | 4 | Number of people being fed |
| `p_nights` | integer | 5 | Number of dinner nights to plan (1–7) |
| `p_focus` | text | `'none'` | Scoring modifier: `'savings'`, `'protein'`, or `'none'` |
| `p_week_of` | date | `CURRENT_DATE` | Week start date — used to filter `valid_from`/`valid_to` on deals |

### Response shape (jsonb)

```json
{
  "week_of": "2026-04-14",
  "headcount": 4,
  "nights": 5,
  "focus": "none",
  "health_focus": "none",
  "weekly_budget": 15000,
  "meal_calorie_target_min": 1620,
  "meal_calorie_target_max": 1890,
  "dietary_modes": ["low_carb"],
  "dinners": [
    {
      "night": "Monday", "night_index": 1,
      "protein": { ...stack_candidates row },
      "side": { ...stack_candidates row },
      "pantry_item": { ...stack_candidates row }
    }
  ],
  "household_stack": [ ...up to 8 stack_candidates rows ],
  "totals": {
    "regular_total": 42.18,
    "sale_total": 31.55,
    "total_savings": 10.63
  },
  "data_source": "live"
}
```

### Filtering logic
- Excludes items where `allergen_tags` overlaps with `profiles.dietary_tags` using `?|` operator
- `focus='savings'`: sort score = `stack_rank_score × 1.5`
- `focus='protein'`: sort score = `protein_g / 50`
- `focus='none'`: sort score = `stack_rank_score`
- Dinner slots: protein from `meat/seafood/deli`, side from `produce`, pantry from `pantry/bakery/frozen/dairy`
- Household stack: top 8 from `household/health/personal_care` by `stack_rank_score`

---

## POST /functions/v1/initialize-agent

Saves the 7-step Concierge onboarding answers to `user_persona`, calculates a mock Initial Savings projection, and returns the Economic DNA reveal to the client. Called by `LogicScanScreen` during the 5-second processing animation.

**File:** `supabase/functions/initialize-agent/index.ts`
**Auth:** Bearer JWT (authenticated user)

### Request body
```json
{
  "mission":               "rent_killer | save_goal | find_deals",
  "monthly_budget_cents":  60000,
  "power_level":           "notify_only | ask_first | full_auto",
  "leak_category":         "amazon | food_apps | clothing",
  "style_vibe":            "casual_minimal | trend_forward | investment",
  "clothing_size":         "M",
  "shoe_size":             "10.5",
  "shop_frequency":        "daily | weekly | big_events"
}
```
`clothing_size` and `shoe_size` are optional.

### Response
```json
{
  "ok": true,
  "persona": { "...full user_persona row..." },
  "reveal": {
    "initial_savings_cents": 10800,
    "leak_savings_cents":    4500,
    "items_at_floor_price":  8,
    "mission_label":         "Rent-Killer",
    "leak_label":            "Amazon"
  }
}
```

### Savings calculation (mock)
| Factor | Values |
|---|---|
| Mission base rate | `rent_killer` 18% · `save_goal` 15% · `find_deals` 22% |
| Power multiplier | `notify_only` 0.70× · `ask_first` 1.00× · `full_auto` 1.35× |
| Formula | `monthly_budget_cents × rate × multiplier` |

### Error responses
| Status | Condition |
|---|---|
| 400 | Missing required field |
| 401 | Missing or invalid Bearer JWT |
| 405 | Non-POST method |
| 500 | DB upsert error |

---

## POST /functions/v1/slack-notify

Picks up unnotified rows from `retailer_policy_change_log` and posts a Block Kit message to the configured Slack webhook. Marks posted rows `notified_at`. Called automatically by the `snippd-slack-policy-notify` pg_cron job every 5 minutes; can also be called manually.

**File:** `supabase/functions/slack-notify/index.ts`

### Auth

| Method | Header | Used for |
|---|---|---|
| Cron secret | `x-cron-secret: <CRON_SECRET>` | pg_cron scheduled calls |
| Service role | `Authorization: Bearer <service_role_key>` | Manual / internal calls |

### Request body
```json
{ "source": "cron", "trigger": "policy_change_check" }
```
Body is informational only — the function always queries `retailer_policy_change_log` regardless of body content.

### Response — changes found and posted
```json
{ "ok": true, "notified": 3 }
```

### Response — no action needed
```json
{ "skipped": true, "reason": "no pending notifications" }
```
```json
{ "skipped": true, "reason": "slack webhook not configured — run scripts/setup-slack-webhook.sh" }
```

### Error responses
| Status | Condition |
|---|---|
| 401 | Missing or invalid `x-cron-secret` / Bearer token |
| 405 | Non-POST method |
| 500 | DB read error |
| 502 | Slack webhook returned non-200 |

### Slack message format
Uses Slack Block Kit. Groups changes by table. For UPDATE operations, shows field-level diffs (`old_value → new_value`). Capped at 5 change blocks per table per message, with a count of any additional changes.

### Setup
Configure the webhook URL by running:
```bash
bash scripts/setup-slack-webhook.sh "https://hooks.slack.com/services/..."
```
See [scripts/setup-slack-webhook.sh](../scripts/setup-slack-webhook.sh) for the full 5-step Slack app creation guide.

---

## POST /functions/v1/stripe-webhook

Receives Stripe webhook events and assigns paid waitlist positions. Called by Stripe, not by the app.

**File:** `supabase/functions/stripe-webhook/index.ts`

**Auth:** Stripe HMAC-SHA256 webhook signature (not Bearer JWT). The `Stripe-Signature` header is verified against `STRIPE_WEBHOOK_SECRET`.

### Setup (one-time, in Stripe Dashboard)

1. Go to **Developers → Webhooks → Add endpoint**
2. **URL:** `https://gsnbpfpekqqjlmkgvwvb.supabase.co/functions/v1/stripe-webhook`
3. **Events to subscribe:** `checkout.session.completed`
4. Copy the **Signing secret** (`whsec_...`) and add it to:
   - `.env` as `STRIPE_WEBHOOK_SECRET`
   - Supabase Dashboard → Project Settings → Edge Functions → Secrets as `STRIPE_WEBHOOK_SECRET`

5. On each payment link (Beta Pro and Founder), add **Metadata:**
   | Key | Value |
   |---|---|
   | `tier` | `beta_pro` (on the Beta Pro link) |
   | `tier` | `founder` (on the Founder link) |

### Event handled: `checkout.session.completed`

Stripe fires this when a user completes a Checkout session (including via Payment Links).

**Required fields from Stripe event:**
| Field | Used for |
|---|---|
| `data.object.payment_status` | Skips if not `'paid'` |
| `data.object.customer_details.email` | Looks up Snippd user by email |
| `data.object.payment_intent` | Stored as `stripe_payment_id` |
| `data.object.metadata.tier` | Stored as `stripe_tier` (`beta_pro` \| `founder`). Defaults to `beta_pro` if absent. |

**What happens:**
1. Verifies Stripe signature (rejects replays older than 5 minutes)
2. Looks up the Snippd `auth.users` record by `customer_details.email`
3. Calls `assign_paid_waitlist_position(user_id, payment_intent_id, stripe_tier)`
   - Assigns paid lane position (1, 2, 3 … in payment order)
   - Auto-approves if position ≤ 200 (`status = 'approved'`, `approved_at = now()`)
   - Updates `user_persona.status` → `'paid_beta'` (if approved) or `'waitlist'`

### Response behavior

| Condition | HTTP status | Stripe retries? |
|---|---|---|
| Success | 200 | No |
| `payment_status` ≠ `'paid'` | 200 | No |
| User not found by email | 200 | No — log for manual follow-up |
| DB error (assign_paid_waitlist_position) | 500 | Yes |
| Invalid signature | 400 | No |
| Missing env vars | 500 | Yes |

### Success response
```json
{ "received": true, "user_id": "uuid", "stripe_tier": "beta_pro" }
```

### Skipped response
```json
{ "received": true, "skipped": "payment_status=no_payment_required" }
```

### User not found response
```json
{ "received": true, "warning": "user not found", "email": "user@example.com" }
```
