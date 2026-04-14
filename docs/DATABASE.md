# Snippd — Database Reference

> All tables live in the `public` schema of the Supabase PostgreSQL instance.
> Row Level Security (RLS) is enabled on every user-facing table.
> Source of truth migration: `supabase/migrations/001_behavioral_intelligence_safe.sql`

---

## Tables

### event_stream

Append-only log of every behavioral event from the app.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `household_id` | uuid | FK → `public.households(id)` |
| `session_id` | uuid NOT NULL | Client-generated session identifier |
| `event_name` | text NOT NULL | e.g. `COUPON_CLIPPED`, `STACK_APPLIED` |
| `timestamp` | timestamptz | Defaults to `now()` |
| `screen_name` | text | Screen where event occurred |
| `object_type` | text | `coupon`, `item`, `stack`, `recommendation`, `alert` |
| `object_id` | uuid | ID of the object interacted with |
| `retailer_key` | text | e.g. `publix`, `target`, `walmart` |
| `category` | text | Product category |
| `brand` | text | Product brand |
| `rank_position` | int | Position in a list (for recommendation tracking) |
| `model_version` | text | Model that generated the recommendation |
| `explanation_shown` | boolean | Whether AI explanation was shown (default false) |
| `metadata` | jsonb | Freeform event-specific data |
| `context` | jsonb | App context (screen, session info) |

**Indexes**
- `idx_es_user_time` — `(user_id, timestamp DESC)` — primary lookup for per-user event history
- `idx_es_event_name` — `(event_name, timestamp DESC)` — funnel analysis by event type

**RLS**
- `event_stream_select_own` — authenticated users can SELECT their own rows (`auth.uid() = user_id`)
- `event_stream_insert_own` — authenticated users can INSERT their own rows

**Trigger**
- `trg_event_stream_preference` (AFTER INSERT) → calls `fn_event_stream_preference_upsert()`
  - Looks up `event_weight_config[event_name]`
  - UPSERTs `user_preference_scores`: increments score by weight

---

### event_weight_config

Configurable weights for each event type. Read by both the DB trigger (real-time) and `preferenceUpdater.ts` (batch).

| Column | Type | Notes |
|---|---|---|
| `event_name` | text PK | Lowercase, e.g. `coupon_clipped` |
| `weight` | numeric NOT NULL | Positive = affinity signal, negative = aversion |
| `created_at` | timestamptz | |

**Seeded values (30 events)**

| Event | Weight | Meaning |
|---|---|---|
| `purchase_completed` | +1.00 | Strongest positive signal |
| `cart_accepted` | +0.70 | User accepted Snippd's cart recommendation |
| `checkout_completed` | +0.75 | Completed checkout |
| `coupon_redeemed` | +0.80 | Redeemed a coupon |
| `stack_applied` | +0.65 | Applied a coupon stack |
| `item_added_to_cart` | +0.55 | Added item to cart |
| `onboarding_completed` | +0.30 | Completed onboarding |
| `coupon_clipped` | +0.40 | Clipped a coupon |
| `recommendation_clicked` | +0.25 | Clicked recommendation |
| `item_substituted` | +0.20 | Substituted an item |
| `budget_set` | +0.15 | Set a budget |
| `stack_viewed` | +0.15 | Viewed a stack |
| `store_selected` | +0.10 | Selected a store |
| `coupon_viewed` | +0.10 | Viewed a coupon |
| `receipt_uploaded` | +0.10 | Uploaded a receipt |
| `recommendation_shown` | +0.05 | Impression (low signal) |
| `preference_changed` | +0.05 | Changed a preference |
| `checkout_started` | +0.05 | Started checkout |
| `wealth_snapshot_viewed` | +0.05 | Viewed wealth screen |
| `smart_alert_shown` | +0.02 | Smart alert shown |
| `search_performed` | +0.02 | Performed a search |
| `smart_alert_dismissed` | -0.02 | Dismissed an alert |
| `coupon_expired` | -0.05 | Coupon expired unused |
| `store_deselected` | -0.05 | Deselected a store |
| `budget_exceeded` | -0.20 | Went over budget |
| `item_removed_from_cart` | -0.30 | Removed item from cart |
| `recommendation_dismissed` | -0.10 | Dismissed recommendation |
| `stack_dismissed` | -0.40 | Dismissed a stack |
| `cart_rejected` | -0.60 | Rejected Snippd's cart |

**No RLS** — service role reads this table. Client cannot access directly.

---

### recommendation_exposures

Tracks every recommendation shown to a user, with click/accept/dismiss outcomes.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `session_id` | uuid NOT NULL | |
| `recommendation_type` | text NOT NULL | e.g. `stack`, `coupon`, `item` |
| `object_type` | text NOT NULL | `coupon`, `item`, `stack` |
| `object_id` | uuid NOT NULL | ID of the recommended object |
| `rank_position` | int | |
| `score` | numeric | Model confidence score |
| `model_version` | text | |
| `explanation` | text | Human-readable explanation shown to user |
| `reason_codes` | jsonb | Array of reason code strings |
| `shown_at` | timestamptz | Defaults to `now()` |
| `clicked_at` | timestamptz | Populated when outcome_status = clicked |
| `accepted_at` | timestamptz | Populated when outcome_status = accepted |
| `dismissed_at` | timestamptz | Populated when outcome_status = dismissed |
| `outcome_status` | text | `shown` → `clicked` → `accepted` or `dismissed` |

**Indexes**
- `idx_rec_exp_user` — `(user_id, shown_at DESC)`

**RLS**
- `recommendation_exposures_select_own` — SELECT own rows only
- `recommendation_exposures_update_own` — UPDATE own rows only (added in migration 002; used by client SDK to mark outcomes)

**Analytics view**
- `v_recommendation_funnel` — groups by `recommendation_type + model_version`, shows click/accept/dismiss rates

---

### user_preference_scores

Running preference scores per user × event × category × brand × retailer. Updated in real-time by trigger, batch-decayed by `preferenceUpdater.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `preference_key` | text NOT NULL | Lowercase event name, e.g. `coupon_clipped` |
| `category` | text NOT NULL DEFAULT '' | Product category (empty string = global) |
| `brand` | text NOT NULL DEFAULT '' | Brand (empty string = global) |
| `retailer_key` | text NOT NULL DEFAULT '' | Retailer (empty string = global) |
| `score` | numeric NOT NULL DEFAULT 0 | Raw accumulated weighted score |
| `normalized_score` | numeric NOT NULL DEFAULT 0 | Score ÷ user's max absolute score (0–1) |
| `last_updated` | timestamptz NOT NULL | When score was last written |

**Unique constraint**
- `idx_user_preference_scores_context` — UNIQUE on `(user_id, preference_key, category, brand, retailer_key)`

**RLS**
- `user_preference_scores_select_own` — SELECT own rows only

**Analytics view**
- `v_user_preference_summary` — adds `preference_rank` (ROW_NUMBER by score DESC per user)

---

### user_state_snapshots

One row per user. Written by `preferenceUpdater.ts` after each batch run. Contains derived behavioral state.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL UNIQUE | FK → `auth.users` (one row per user) |
| `snapshot` | jsonb NOT NULL | Full state object (see below) |
| `snapshot_at` | timestamptz NOT NULL | When snapshot was computed |

**snapshot JSON shape**
```json
{
  "updated_at": "ISO timestamp",
  "budget_stress_level": 0.0,
  "shopping_mode": "deal_hunter",
  "coupon_responsiveness": 0.85,
  "bogo_responsiveness": 0.42,
  "multi_store_responsiveness": 0.20,
  "substitution_responsiveness": 0.15,
  "preferences": [ ...PreferenceScore[] ]
}
```

**shopping_mode values**: `deal_hunter` | `convenience` | `budget_conscious` | `loyal_brand` | `variety_seeker` | `unknown`

**RLS**
- `user_state_snapshots_select_own` — SELECT own rows only

---

### model_predictions

Stores raw model prediction scores for audit and training.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `prediction_type` | text NOT NULL | e.g. `stack_score`, `attrition` |
| `object_id` | uuid | Stack or item the prediction is about |
| `score` | numeric NOT NULL | 0–1 |
| `model_version` | text NOT NULL | |
| `input_snapshot` | jsonb | Feature vector used as input |
| `created_at` | timestamptz | |

**Indexes**
- `idx_model_pred_user` — `(user_id, created_at DESC)`

**RLS**
- RLS is enabled. **No user-facing policy** — service role only (reads bypass RLS by default). Authenticated users cannot read prediction rows directly. (Migration 002 removed the previous `model_predictions_select_own` policy.)

**RLS**
- `model_predictions_select_own` — SELECT own rows only

---

### wealth_momentum_snapshots

Periodic savings performance snapshots. Used by `vertexFeatureBuilder` for attrition detection.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `timestamp` | timestamptz | |
| `realized_savings` | numeric(12,2) | Actual savings in cents |
| `inflation_offset` | numeric(12,2) | Savings attributed to beating inflation |
| `waste_reduction_score` | numeric(5,2) | |
| `velocity_score` | numeric(5,2) | Savings rate trend (0–100) |
| `projected_annual_wealth` | numeric(12,2) | Projected annual savings in cents |
| `budget_stress_alert` | boolean NOT NULL DEFAULT false | True when over budget |
| `budget_stress_score` | numeric(5,2) NOT NULL DEFAULT 0 | 0–100 |
| `math_version` | text | Version of the wealth formula used |
| `usda_cpi_reference_date` | date | CPI date used for inflation calculation |

**Indexes**
- `idx_wealth_user_time` — `(user_id, timestamp DESC)`

**RLS**
- `wealth_momentum_snapshots_select_own` — SELECT own rows only

---

### retailer_coupon_parameters

Per-retailer coupon policy parameters. Loaded by `policyLoader.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer_key` | text NOT NULL | e.g. `publix`, `target`, `walmart` |
| `policy_key` | text NOT NULL | e.g. `max_stack_items`, `allowed_coupon_types` |
| `policy_value` | jsonb NOT NULL | `{ "value": <typed value> }` |
| `effective_from` | date | Policy start date |
| `effective_to` | date | Policy end date (null = active) |
| `inserted_at` | timestamptz | |

**Indexes**
- `idx_retailer_policy_key` — `(retailer_key, policy_key)`

**Seeded policy keys per retailer**
- `max_stack_items` — integer
- `allowed_coupon_types` — string array: `["manufacturer", "store", "digital"]`
- `max_total_coupon_value` — integer (cents)
- `max_manufacturer_coupons` — integer
- `max_store_coupons` — integer
- `rounding_mode` — `"floor"` | `"round"` | `"ceil"`

**No RLS** — loaded by service role in Edge Functions.

---

### retailer_rules

Granular boolean stacking rules per retailer. Loaded by `policyLoader.ts`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer_key` | text NOT NULL | |
| `rule_key` | text NOT NULL | e.g. `block_bogo_and_coupon` |
| `rule_value` | jsonb NOT NULL | `{ "value": true/false }` |
| `priority` | int NOT NULL DEFAULT 0 | Higher priority wins on conflict |
| `effective_from` | date | |
| `effective_to` | date | null = active |
| `inserted_at` | timestamptz | |

**Unique index**
- `idx_retailer_rules_key` — UNIQUE on `(retailer_key, rule_key)`

**Seeded rule keys**
- `block_sale_and_digital` — blocks DIGITAL_COUPON when SALE is present
- `block_sale_and_loyalty` — blocks LOYALTY_PRICE when SALE is present
- `block_bogo_and_coupon` — blocks all coupons when BOGO is present
- `block_coupon_and_loyalty` — blocks LOYALTY_PRICE when any coupon is present

**Seeded values by retailer**

| Retailer | block_bogo_and_coupon | block_sale_and_digital | block_sale_and_loyalty |
|---|---|---|---|
| publix | **true** | false | false |
| walmart | false | **true** | false |
| cvs | false | false | false |
| target | false | false | false |
| kroger | false | false | false |

---

### offer_matches

Snapshots of offer candidates generated for a user's basket before stack computation.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `retailer_key` | text NOT NULL | |
| `candidates` | jsonb NOT NULL | Array of candidate stacks |
| `budget_cents` | numeric NOT NULL DEFAULT 0 | User's budget at time of match |
| `created_at` | timestamptz NOT NULL | |

**Indexes**
- `idx_offer_matches_user` — `(user_id, retailer_key)`

---

### stack_results

Computed `StackResult` objects, optionally persisted by the stacking engine.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `retailer_key` | text NOT NULL | |
| `model_version` | text NOT NULL | |
| `variant_type` | text NOT NULL | e.g. `computed`, `max_savings`, `balanced` |
| `candidate` | jsonb NOT NULL | Full `StackResult` object |
| `budget_fit` | numeric NOT NULL | 0–1 score |
| `preference_fit` | numeric NOT NULL | 0–1 score |
| `simplicity_score` | numeric NOT NULL | 0–1 score |
| `score` | numeric NOT NULL | Composite score 0–1 |
| `feature_vector` | jsonb DEFAULT '{}' | Vertex feature vector at time of scoring |
| `created_at` | timestamptz NOT NULL | |

**Indexes**
- `idx_stack_results_user` — `(user_id, retailer_key, variant_type, created_at DESC)`

**RLS** *(added in migration 002)*
- `stack_results_select_own` — authenticated users can SELECT their own rows

**Analytics view**
- `v_stack_performance` — average scores by retailer_key + variant_type

---

### smart_alerts

User-facing alerts created by `checkWealthAttrition()` when attrition probability > 0.70.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → `auth.users` |
| `alert_type` | text NOT NULL | e.g. `wealth_attrition`, `budget_exceeded` |
| `message` | text NOT NULL | Human-readable alert message |
| `metadata` | jsonb DEFAULT '{}' | e.g. `{ probability, avg_stress, avg_velocity }` |
| `shown_at` | timestamptz | When the alert was shown to the user |
| `dismissed_at` | timestamptz | When the user dismissed it |
| `created_at` | timestamptz NOT NULL | |

**Indexes**
- `idx_smart_alerts_user` — `(user_id, created_at DESC)`

**RLS**
- `smart_alerts_select_own` — SELECT own rows only

---

## Analytics Views

### v_user_preference_summary
Shows all preference scores with a rank column (1 = highest score for that user).
```sql
SELECT user_id, preference_key, category, brand, retailer_key,
       score, normalized_score, last_updated,
       ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC) AS preference_rank
FROM user_preference_scores;
```

### v_stack_performance
Aggregates stack results by retailer and variant type.
```sql
SELECT retailer_key, variant_type,
       AVG(score) AS avg_score, AVG(budget_fit) AS avg_budget_fit,
       AVG(preference_fit) AS avg_preference_fit,
       AVG(simplicity_score) AS avg_simplicity,
       COUNT(*) AS total_computed, MAX(created_at) AS last_computed_at
FROM stack_results GROUP BY retailer_key, variant_type;
```

### v_recommendation_funnel
Click-through and acceptance rates by recommendation type and model version.
```sql
SELECT recommendation_type, model_version,
       COUNT(*) AS total_shown,
       COUNT(clicked_at) AS total_clicked,
       COUNT(accepted_at) AS total_accepted,
       COUNT(dismissed_at) AS total_dismissed,
       ROUND(COUNT(clicked_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS click_rate_pct,
       ROUND(COUNT(accepted_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2) AS accept_rate_pct
FROM recommendation_exposures GROUP BY recommendation_type, model_version;
```

---

---

## Ingestion Pipeline Tables

> Source migration: `supabase/migrations/20260413_ingestion_pipeline.sql`

### ingestion_jobs

One row per weekly-ad PDF to be processed. Created by `trigger-ingestion` Edge Function.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer_key` | text NOT NULL | e.g. `publix` |
| `week_of` | date NOT NULL | Monday of the deal week |
| `storage_path` | text NOT NULL | Path in `deal-pdfs` bucket |
| `status` | text NOT NULL | `queued` \| `processing` \| `parsed` \| `completed` \| `failed` |
| `attempts` | int NOT NULL | Incremented on each worker run |
| `deal_count` | int | Populated after `parseFlyer()` |
| `error_message` | text | Last failure message |
| `started_at` | timestamptz | |
| `parsed_at` | timestamptz | Set after Gemini OCR completes |
| `completed_at` | timestamptz | |

**Indexes**
- `idx_ingestion_jobs_status` — `(status, created_at ASC)` — worker polling
- `idx_ingestion_jobs_retailer_week` — `(retailer_key, week_of)`

---

### flyer_deal_staging

Raw deals extracted from a flyer PDF before normalization.

| Column | Type | Notes |
|---|---|---|
| `ingestion_id` | uuid NOT NULL | FK → `ingestion_jobs` |
| `retailer_key` | text NOT NULL | |
| `week_of` | date NOT NULL | |
| `product_name` | text NOT NULL | |
| `brand` | text | |
| `sale_price` | numeric | Dollars |
| `regular_price` | numeric | Dollars |
| `deal_type` | text | Raw string from Gemini |
| `quantity_required` | int | |
| `category` | text | |
| `confidence_score` | numeric | 0–1 |
| `needs_review` | boolean | True if confidence < 0.7 |
| `status` | text | `staged` \| `published` \| `rejected` |

---

### offer_sources

Normalized deal catalog. One row per deal per week, deduped.

| Column | Type | Notes |
|---|---|---|
| `retailer_key` | text NOT NULL | |
| `week_of` | date NOT NULL | |
| `normalized_key` | text NOT NULL | `brand_product_name` |
| `dedupe_key` | text NOT NULL UNIQUE | `retailer_key::normalized_key::week_of` |
| `offer_type` | text NOT NULL | Mapped to `OfferType` |
| `sale_price_cents` | int | |
| `regular_price_cents` | int | |
| `expires_on` | date | Sunday of `week_of` |
| `confidence_score` | numeric | From staging |
| `source` | text | `flyer` |

**Index:** `idx_offer_sources_dedupe` (UNIQUE on `dedupe_key`)

---

### digital_coupons

Digital coupon inventory, loaded separately from flyers.

| Column | Type | Notes |
|---|---|---|
| `retailer_key` | text NOT NULL | |
| `normalized_key` | text NOT NULL | Stable match key |
| `discount_cents` | int NOT NULL | Fixed discount |
| `discount_pct` | numeric | 0.0–1.0 |
| `coupon_type` | text | `manufacturer` \| `store` \| `digital` |
| `expires_at` | timestamptz | |
| `is_active` | boolean | Filtered in all queries |

---

### stack_candidates

Pre-computed deal candidates consumed by `cartEngine.buildCartOptions()`.

| Column | Type | Notes |
|---|---|---|
| `retailer_key` | text NOT NULL | |
| `week_of` | date NOT NULL | |
| `dedupe_key` | text UNIQUE | FK to `offer_sources.dedupe_key` |
| `stack_rank_score` | numeric NOT NULL | `savings_pct×0.6 + hasCoupon×0.4` (0–1) |
| `savings_pct` | numeric | |
| `has_coupon` | boolean | |
| `items` | jsonb NOT NULL | `StackItem[]` compatible array |

**Index:** `idx_stack_candidates_retailer_week_rank` — `(retailer_key, week_of, stack_rank_score DESC)` — primary query for cart engine

---

### flyer_publish_log

Audit log written after `normalizeAndPublish()` completes.

| Column | Type | Notes |
|---|---|---|
| `ingestion_id` | uuid NOT NULL | FK → `ingestion_jobs` |
| `deals_staged` | int | |
| `deals_published` | int | |
| `coupons_matched` | int | |
| `candidates_written` | int | |

---

### ingestion_run_log

One row per ingestion worker run **or Edge Function request**. Dual-purpose after migration 002: pipeline rows use `ingestion_id + week_of`; Edge Function rows use `source_key + stage`.

| Column | Type | Notes |
|---|---|---|
| `ingestion_id` | uuid | FK → `ingestion_jobs` (null for Edge Function rows) |
| `retailer_key` | text NOT NULL | Retailer context |
| `week_of` | date | Nullable since migration 002 (null for Edge Function rows) |
| `status` | text NOT NULL | Pipeline: `completed\|failed\|retryable`; Edge Function: HTTP status code e.g. `200`, `429` |
| `source_key` | text | `ingest-event` or `stack-compute` (null for pipeline rows) |
| `stage` | text | `success` or `error` (null for pipeline rows) |
| `metadata` | jsonb | `{ user_id, duration_ms, event_count or item_count }` |
| `deals_extracted` | int DEFAULT 0 | Pipeline only |
| `deals_published` | int DEFAULT 0 | Pipeline only |
| `coupons_matched` | int DEFAULT 0 | Pipeline only |
| `candidates_written` | int DEFAULT 0 | Pipeline only |
| `error_message` | text | Pipeline error detail |

**Indexes**
- `idx_ingestion_run_log_job` — `(ingestion_id, created_at DESC)`
- `idx_ingestion_run_log_source_stage` — `(source_key, stage, created_at DESC) WHERE source_key IS NOT NULL` *(migration 002)*

---

### api_rate_limit_log

One row per ingest-event request, used to enforce 200 req/user/hour rate limiting. Records older than 2 hours are pruned on ~1% of requests.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | JWT user being rate-limited |
| `function_name` | text NOT NULL DEFAULT 'ingest-event' | Source function |
| `request_at` | timestamptz NOT NULL DEFAULT now() | |

**Indexes**
- `idx_api_rate_limit_user_time` — `(user_id, request_at DESC)` — used for per-user hourly count queries

**RLS**
- RLS enabled. No user-facing policy — service role only.

---

### app_config

Generic key/value config table.

| Column | Type | Notes |
|---|---|---|
| `config_key` | text PK | |
| `config_value` | jsonb NOT NULL | |

**Seeded:** `usda_category_benchmarks` — 9 categories with USDA average prices used by `wealthEngine.calculateInflationShield()`.

---

## Other Tables (App Layer)

These tables support the React Native app and are not part of the behavioral intelligence layer.

| Table | Purpose |
|---|---|
| `profiles` | User profile data (name, avatar, dietary preferences) |
| `households` | Household grouping for shared shopping |
| `budgets` | Per-user or per-household weekly/monthly budget targets |
| `receipt_uploads` | Uploaded receipt images or PDF URLs |
| `receipt_items` | Parsed line items from receipts |
| `retailers` | Master retailer directory (name, logo, retailer_key) |
| `stores` | Individual store locations |
| `trips` | Shopping trip records |
| `trip_items` | Items within a trip |
| `offer_sources` | Source catalog of available offers/coupons |
| `digital_coupons` | Digital coupon inventory per retailer |
| `stack_candidates` | Pre-computed candidate stacks for display |
