# Snippd — Database Reference

> All tables live in the `public` schema of the Supabase PostgreSQL instance.
> Row Level Security (RLS) is enabled on every user-facing table.
> Source of truth migration: `supabase/migrations/001_behavioral_intelligence_safe.sql`

---

## Quick Start Flow Columns (added 2026-05-05)
Migration: `supabase/migrations/20260504_quick_start_flow.sql`
**Status: Pending — apply in Supabase Dashboard → SQL Editor**

### user_persona additions

| Column | Type | Default | Notes |
|---|---|---|---|
| `quick_start_completed` | boolean | `false` | Set true after 3-question QuickStartScreen |
| `quick_start_budget_range` | text | null | `'<75'` \| `'75-125'` \| `'125-200'` \| `'200+'` |
| `quick_start_goal` | text | null | `'save_money'` \| `'eat_healthier'` \| `'save_time'` \| `'manage_allergies'` \| `'nutrition_program'` \| `'athletic_fuel'` |
| `quick_start_household` | smallint | null | 1 / 2 / 4 / 6 (representative household size) |
| `beta_unlocked` | boolean | `false` | Set true on valid promo code or after Stripe payment confirmed |
| `promo_unlocked` | boolean | `false` | Set true specifically for promo code path |
| `unlock_source` | text | null | `'promo'` \| `'stripe_beta_pro'` \| `'stripe_founder'` |

### profiles additions

| Column | Type | Default | Notes |
|---|---|---|---|
| `profile_completion_percent` | numeric | `0` | Computed client-side from 8 key fields; stored for persistence |
| `progressive_profile` | jsonb | `'{}'` | Stores progressive prompt completion flags (e.g. `soft_personalization_done`) |
| `last_profile_prompt_at` | timestamptz | null | When the last profile prompt was shown |
| `next_profile_prompt_key` | text | null | Which profile module to ask next (e.g. `'safety'`, `'store'`, `'meal'`) |

---

## Barcode Scanning Cache (added 2026-05-03)
Migration: `supabase/migrations/20260503_scanned_products.sql`
**Status: Pending — apply in Supabase Dashboard → SQL Editor**

### scanned_products
Barcode lookup cache. Populated by `lookup-barcode` Edge Function. No RLS — server-side only (barcode data is not user-specific).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `barcode` | text NOT NULL UNIQUE | UPC-A, UPC-E, EAN-13, EAN-8 |
| `name` | text NOT NULL | Product name from Open Food Facts |
| `brand` | text | |
| `image_url` | text | Front product image |
| `ingredients_text` | text | Raw ingredients list |
| `allergens` | text[] NOT NULL DEFAULT '{}' | Plain-English allergen list (e.g. `['gluten', 'milk']`) |
| `nutrition_json` | jsonb | `{ calories, protein, carbs, fat, fiber, sugar, sodium }` per 100g |
| `source` | text CHECK | `'OFF'` (Open Food Facts) \| `'USDA'` \| `'manual'` |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

Indexes: `idx_scanned_products_barcode` on `(barcode)`, `idx_scanned_products_source` on `(source)`

### user_preferences additions (2026-05-03)
New columns added via `20260503_scanned_products.sql`:

| Column | Type | Default | Notes |
|---|---|---|---|
| `dietary_preferences` | text[] | `'{}'` | e.g. `['vegetarian', 'keto']` |
| `allergies` | text[] | `'{}'` | e.g. `['dairy', 'gluten']` — drives allergen warnings in cart |
| `household_size` | smallint | `1` | Set by QuickOnboardingModal |
| `primary_goal` | text | `'save_money'` | `'save_money'` \| `'eat_healthier'` \| `'save_time'` |
| `quick_onboarding_done` | boolean | `false` | Set to `true` when QuickOnboardingModal completes or is skipped with answers saved |

---

## Savings Loop Tables (added 2026-05-04)
Migration: `supabase/migrations/20260504_savings_loop.sql`
**Status: Pending — apply in Supabase Dashboard → SQL Editor**

### weekly_plans
One row per user per week. Created when user taps "Add All to My List" in WeeklyPlanScreen.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → auth.users ON DELETE CASCADE |
| `week_start` | date NOT NULL | UNIQUE with user_id |
| `budget_target` | numeric | User's weekly grocery budget |
| `household_size` | smallint | |
| `preferred_stores` | text[] | |
| `projected_total` | numeric | Planned Snippd cost |
| `baseline_without_snippd_total` | numeric | Estimated full-price cost |
| `estimated_snippd_savings` | numeric | baseline - projected |
| `meals_covered` | integer | Estimated total meals |
| `nutrition_summary` | jsonb | |
| `allergy_flags` | jsonb | |
| `created_at` | timestamptz | |

### weekly_plan_days
7 rows per weekly_plans row.

| Column | Type | Notes |
|---|---|---|
| `weekly_plan_id` | uuid FK | ON DELETE CASCADE |
| `day_name` | text | Monday–Sunday |
| `day_index` | smallint | 0–6 |
| `breakfast` | jsonb | `{ name, total_cents, note }` |
| `lunch` | jsonb | `{ name, total_cents, note }` |
| `dinner` | jsonb | `{ name, ingredients[], total_cents, cal, coupon }` |
| `daily_total` | numeric | Sum of B+L+D in dollars |

### coupon_checklist
Coupons the user needs to clip for their weekly plan.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `weekly_plan_id` | uuid FK | |
| `store` | text | |
| `item_name` | text | |
| `coupon_description` | text | |
| `estimated_value` | numeric | |
| `clip_url` | text | |
| `status` | text CHECK | `not_clipped`\|`clipped`\|`used`\|`expired` |

### receipt_outcomes
One row per receipt scan. Core savings comparison result.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid | |
| `weekly_plan_id` | uuid FK | Nullable — comparison works without a plan |
| `store` | text | |
| `planned_total` | numeric | From weekly_plans.projected_total |
| `actual_total` | numeric | From receipt scan |
| `baseline_without_snippd_total` | numeric | Estimated full-price cost |
| `planned_savings` | numeric | baseline - planned |
| `actual_savings` | numeric | baseline - actual |
| `plan_accuracy_percent` | numeric | 0–100 |
| `budget_target` | numeric | |
| `budget_result` | numeric | budget_target - actual_total |
| `was_under_budget` | boolean | |
| `matched_items_count` | integer | |
| `missing_items_count` | integer | |
| `coupons_expected` | integer | |
| `coupons_confirmed` | integer | |
| `meals_covered` | integer | |
| `bonus_savings` | jsonb | Fetch/Ibotta optional |
| `raw_receipt_payload` | jsonb | |

### optional_bonus_savings
Fetch/Ibotta bonus savings. Never blocks core flow.

| Column | Type | Notes |
|---|---|---|
| `source` | text CHECK | `fetch`\|`ibotta`\|`other` |
| `status` | text CHECK | `available`\|`claimed`\|`missed`\|`expired` |
| `estimated_value` | numeric | |
| `claimed_value` | numeric | |

---

## Adaptive Memory Layer (added 2026-05-03)
Migration: `supabase/migrations/20260503_adaptive_memory.sql`
**Status: Pending — apply in Supabase Dashboard → SQL Editor**

### memory_events
Supabase-backed store for every user action that feeds the Neo4j memory graph. Rows with `neo4j_synced=false` are replayed by `sync-memory-events`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | FK → auth.users |
| `event_type` | text NOT NULL | e.g. `survey_completed`, `cart_completed`, `barcode_scanned` |
| `entity_type` | text | `product`, `deal`, `meal`, `store`, `trip` |
| `entity_id` | text | ID of the entity |
| `store_id` | text | |
| `product_id` | text | |
| `deal_id` | text | |
| `meal_id` | text | |
| `trip_id` | text | |
| `barcode` | text | |
| `cost` | numeric | Spend in cents |
| `savings` | numeric | Savings in cents |
| `nutrition_summary` | jsonb | `{ calories, protein, carbs, fat }` |
| `allergy_flags` | jsonb | Triggered allergens |
| `diet_flags` | jsonb | Dietary labels |
| `survey_response` | jsonb | `{ saved_money, matched_store, use_again }` |
| `metadata` | jsonb | Freeform extra context |
| `neo4j_synced` | boolean NOT NULL DEFAULT false | |
| `neo4j_synced_at` | timestamptz | |
| `error` | text | Neo4j error message if sync failed |
| `created_at` | timestamptz NOT NULL DEFAULT NOW() | |

RLS: users insert/select own rows; service_role manages all.
Indexes: `(user_id, created_at DESC)`, `(neo4j_synced) WHERE NOT neo4j_synced`

### user_priority_profiles
One row per user. Stores 9 learned behavioral priority scores (0–1). Updated by `record-memory-event` on every event.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | FK → auth.users ON DELETE CASCADE |
| `savings_priority` | numeric CHECK 0-1 | Default 0.5 |
| `nutrition_priority` | numeric CHECK 0-1 | Default 0.3 |
| `convenience_priority` | numeric CHECK 0-1 | Default 0.4 |
| `allergy_safety_priority` | numeric CHECK 0-1 | Default 0.5 |
| `store_loyalty_priority` | numeric CHECK 0-1 | Default 0.4 |
| `novelty_priority` | numeric CHECK 0-1 | Default 0.2 |
| `budget_pressure_priority` | numeric CHECK 0-1 | Default 0.3 |
| `scan_compare_priority` | numeric CHECK 0-1 | Default 0.2 |
| `store_accuracy_warning_priority` | numeric CHECK 0-1 | Default 0.1 |
| `updated_at` | timestamptz NOT NULL DEFAULT NOW() | Auto-updated by trigger |

SQL helper: `clamp_priority(value numeric) RETURNS numeric` — clamps any value to [0, 1].
Trigger: `touch_updated_at()` fires BEFORE UPDATE to set `updated_at = NOW()`.
RLS: users read own row; service_role manages all.

### trip_feedback
Migration: `supabase/migrations/20260503_trip_feedback.sql`
Post-trip micro-survey + outcome storage. Backward-compatible: existing `TripSummaryFeedbackScreen.js` inserts continue without schema changes; new adaptive-memory columns are nullable.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL | |
| `trip_id` | text | |
| `store` | text | |
| `store_id` | text | |
| `planned_total_cents` | numeric | Existing screen field |
| `receipt_total_cents` | numeric | Existing screen field |
| `verified_savings_cents` | numeric | Existing screen field |
| `coupons_clipped` | integer | Existing screen field |
| `plan_followed_pct` | numeric | Existing screen field |
| `planned_total` | numeric | Dollar-unit alternative (nullable) |
| `actual_total` | numeric | Dollar-unit alternative (nullable) |
| `estimated_savings` | numeric | Dollar-unit (nullable) |
| `actual_savings` | numeric | Dollar-unit (nullable) |
| `was_under_budget` | boolean | Nullable |
| `meals_covered` | integer | Nutrition enrichment (nullable) |
| `total_protein` | numeric | Nutrition enrichment (nullable) |
| `total_calories` | numeric | Nutrition enrichment (nullable) |
| `allergy_safe` | boolean | Nullable |
| `rating` | text CHECK | `'perfect'`\|`'good'`\|`'okay'`\|`'frustrating'` |
| `issue` | text | Existing screen field |
| `savings_action` | text | Existing screen field |
| `saved_money_response` | text | Adaptive-memory spec: `'yes'`\|`'somewhat'`\|`'not really'` |
| `store_accuracy_response` | text | `'yes'`\|`'mostly'`\|`'no'` |
| `reuse_intent` | text | `'yes'`\|`'maybe'`\|`'no'` |
| `improvement_area` | text | Nullable freeform |
| `created_at` | timestamptz NOT NULL | |

RLS: users insert/select own rows; service_role manages all.
Indexes: `(user_id, created_at DESC)`, `(rating) WHERE rating IS NOT NULL`

---

## Nutrition Intelligence Layer (added 2026-05-03)
Migration: `supabase/migrations/20260503_nutrition_intelligence.sql`
**Status: Pending — apply in Supabase Dashboard → SQL Editor**

### nutrition_cache
Stores USDA FoodData Central nutrition data keyed by FDC food ID. Populated by `usda-search-food` Edge Function. No RLS — server-side only.

| Column | Type | Notes |
|---|---|---|
| `usda_food_id` | integer PK | FDC food ID from USDA API |
| `description` | text NOT NULL | USDA food description |
| `calories` | numeric | kcal per 100g |
| `protein` | numeric | g per 100g |
| `carbs` | numeric | g per 100g |
| `fat` | numeric | g per 100g |
| `fiber` | numeric | g per 100g |
| `sugar` | numeric | g per 100g |
| `sodium` | numeric | mg per 100g |
| `serving_size` | numeric | grams per serving (if USDA provides it) |
| `serving_unit` | text | |
| `last_updated` | timestamptz NOT NULL DEFAULT NOW() | |

Indexes: `idx_nutrition_cache_updated` on `(last_updated DESC)`

### product_nutrition_map
Maps product names (from `normalized_offers` / `app_home_feed`) to USDA food IDs. `usda_food_id` is nullable — a mapping can exist before nutrition is cached.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK DEFAULT gen_random_uuid() | |
| `product_name` | text NOT NULL | Lookup key; matches `product_name` or `query` |
| `retailer` | text | NULL = any retailer |
| `usda_food_id` | integer FK → nutrition_cache | ON DELETE SET NULL |
| `confidence_score` | numeric NOT NULL DEFAULT 0.5 | 0.0–1.0; word-overlap score + 0.2 |
| `created_at` | timestamptz NOT NULL DEFAULT NOW() | |

Indexes: `idx_product_nutrition_map_name` on `(product_name)`, `idx_product_nutrition_map_usda` on `(usda_food_id)`
Unique: `uq_product_nutrition_map` on `(product_name, COALESCE(retailer, ''))`

### user_variation_state
Tracks recently seen deals/meals per user to drive the rotation/novelty engine. RLS: user reads/writes only their own row.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK FK → auth.users | ON DELETE CASCADE |
| `last_seen_deals` | text[] NOT NULL DEFAULT '{}' | Offer IDs seen recently (max 40, ring buffer) |
| `last_seen_meals` | text[] NOT NULL DEFAULT '{}' | Bundle IDs (max 10) |
| `rotation_seed` | integer NOT NULL DEFAULT 0 | Increments each rotation cycle |
| `updated_at` | timestamptz NOT NULL DEFAULT NOW() | |

RLS policy: `uvs_own_row` — `auth.uid() = user_id`

### get_scored_deals() SQL function
```sql
get_scored_deals(p_stores TEXT[] DEFAULT NULL, p_limit INTEGER DEFAULT 60)
```
SECURITY DEFINER. Returns `normalized_offers` joined with nutrition data via LATERAL join on `product_nutrition_map` + `nutrition_cache`. Called by `score-deals` Edge Function. Filters: `confidence_score >= 0.5`, `price_cents IS NOT NULL`, optional store filter. Orders by `savings_cents DESC NULLS LAST`.

---

## Normalized Offer Engine (added 2026-05-02)
Migration: `supabase/migrations/20260502_normalized_offers.sql`

### normalized_offers
Canonical normalized form of any offer from any retailer. Fed by `normalizeAndSaveOffers()` in `src/services/normalizedOffersService.ts`. READ by `BestSavingsPreview` component. Does NOT modify or reference any existing table.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK DEFAULT gen_random_uuid() | |
| `source_offer_id` | text | Nullable. Unique when not null (partial index). Enables upsert. |
| `retailer` | text NOT NULL | |
| `product_name` | text NOT NULL | |
| `brand` | text | |
| `category` | text | |
| `size_text` | text | Raw size string e.g. "16 oz" |
| `normalized_size` | numeric | Parsed numeric size e.g. 16 |
| `normalized_unit` | text | Canonical unit: 'oz', 'lb', 'g', 'kg', 'ml', 'l', 'ct', 'fl oz', etc. |
| `price_cents` | integer | Sale/multibuy total price; for coupon = discount amount |
| `regular_price_cents` | integer | Regular (non-sale) price for savings calculation |
| `deal_type` | text CHECK | 'sale' \| 'bogo' \| 'multibuy' \| 'coupon' \| 'regular' \| 'unknown' |
| `quantity_required` | integer NOT NULL DEFAULT 1 | Units to buy to activate the deal |
| `quantity_received` | integer NOT NULL DEFAULT 1 | Units received (>1 for BOGO/multibuy) |
| `final_unit_price_cents` | integer | Effective per-unit price after deal |
| `savings_cents` | integer | Savings vs regular; null if regular price unknown |
| `confidence_score` | numeric NOT NULL DEFAULT 0.5 | 0.0–1.0; blended from price + size parse confidence |
| `raw_source` | jsonb NOT NULL DEFAULT '{}' | Original source payload for audit/debug |
| `created_at` | timestamptz NOT NULL DEFAULT NOW() | |
| `updated_at` | timestamptz NOT NULL DEFAULT NOW() | |

Indexes:
- `uq_normalized_offers_source_id` — UNIQUE partial on `(source_offer_id) WHERE source_offer_id IS NOT NULL`
- `idx_normalized_offers_retailer` — on `(retailer)`
- `idx_normalized_offers_product_name` — on `(product_name)`
- `idx_normalized_offers_deal_type` — on `(deal_type)`
- `idx_normalized_offers_category` — on `(category)`
- `idx_normalized_offers_savings` — partial on `(savings_cents DESC, confidence_score DESC) WHERE savings_cents IS NOT NULL`

RLS: none (server-side only; not user-facing data).

---

## Personalization (added 2026-05-02)
Migration: `supabase/migrations/20260502_user_preferences.sql`

### user_preferences
Per-user behavior model. Written by the HomeScreen on every deal/meal interaction (debounced). Drives `experience_type` calculation and section ordering.

| Column | Type | Notes |
|---|---|---|
| `user_id` | uuid PK | References `auth.users(id)` ON DELETE CASCADE |
| `budget_range` | int NOT NULL DEFAULT 150 | Weekly budget in dollars |
| `preferred_stores` | text[] NOT NULL DEFAULT '{}' | User-selected store preferences |
| `category_clicks` | jsonb NOT NULL DEFAULT '{}' | `{ "protein": 5, "snacks": 2 }` — incremented per interaction |
| `last_actions` | jsonb NOT NULL DEFAULT '{}' | `{ recent: [{ action, category, at }] }` — last 5 actions |
| `experience_type` | text NOT NULL DEFAULT 'saver' | Derived: 'saver' \| 'convenience' \| 'explorer' |
| `updated_at` | timestamptz NOT NULL DEFAULT NOW() | Last write timestamp |

RLS: enabled. Users can only SELECT/UPDATE their own row.
Index: `idx_user_preferences_experience` on `(experience_type)`.

---

## Genius Mode — Core Deal Tables (added 2026-04-30)
Migration: `supabase/migrations/20260430_genius_mode_activate.sql`

### app_home_feed
Powers the "This Week's Price Drops" horizontal rail on HomeScreen. Populated by `vertex-agent` (flyer extraction or AI crawl). Expires via `weekly-refresh` cron.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `title` | text NOT NULL | Stack/deal title e.g. "Publix Chicken & Greens Meal Prep" |
| `retailer` | text NOT NULL | Display name e.g. "Publix" |
| `pay_price` | numeric NOT NULL | Sum of all item sale prices (what customer pays) |
| `original_price` | numeric | Sum of regular shelf prices |
| `save_price` | numeric | `original_price - pay_price` |
| `breakdown_list` | jsonb | Array of `{name, brand, size, price, regular_price, savings, deal_type, qty, coupon}` |
| `dietary_tags` | text[] | e.g. `['BOGO','FRESH','FAMILY']` |
| `meal_type` | text | `dinner`, `breakfast`, `produce`, `household`, etc |
| `card_type` | text | `meal_stack` |
| `status` | text | `active`, `expired`, `draft`, `hidden` |
| `verification_status` | text | `verified_live`, `unverified`, `synthetic`, `pending` |
| `valid_from` | date | First day of validity |
| `valid_until` | date | Expiry — weekly-refresh sets `status='expired'` after this date |
| `preference_profile` | jsonb | `{region, source, file_uri, retailer_key}` |
| `source_summary` | jsonb | `{description}` — one-sentence benefit statement |
| `created_at` | timestamptz | |

**RLS:** Public read for `status = 'active'` rows. Service role for writes.
**Indexes:** (status, save_price DESC), (valid_until, status), (retailer, status)

`stack_candidates` extended with new columns (see migration for full list): `is_active`, `item_name`, `category`, `brand`, `stack_type`, `final_estimated_cents`, `price_at_rec`, `base_price`, `final_price`, `confidence_pct`, `user_badge`, `validation_status`, `verified_coupon_id`, `exact_coupon_url`, `published_at`.

---

## Anticipatory Intelligence Layer (added 2026-04-30)
Migration: `supabase/migrations/20260430_anticipatory_intelligence.sql`

### anticipatory_plans
One row per user per week. Stores the AI-generated Monday morning savings plan.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK | → `auth.users` ON DELETE CASCADE |
| `week_of` | date NOT NULL | Monday of the plan week |
| `plan_items` | jsonb NOT NULL | `[{item_name, retailer_key, deal_type, savings_cents, normalized_key}]` |
| `total_savings_cents` | int | Sum of all deal savings |
| `item_count` | int | Total plan items |
| `essentials_matched` | int | Household essentials with a deal this week |
| `status` | text | `ready` \| `viewed` \| `clipped_all` \| `dismissed` |
| `push_sent_at` | timestamptz | When Expo push was fired |
| `push_token` | text | Token used for this push |

**Unique:** `(user_id, week_of)` — one plan per user per week. Upsert-safe.
**RLS:** user reads own rows; service_role manages all.
**Cron:** `anticipatory-plan-monday` — every Monday 11:00 UTC (6 AM EST) via pg_cron.

### store_locations
Real-world store GPS coordinates for geofencing. 10 FL demo market stores seeded.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer_key` | text | e.g. `publix`, `target` |
| `store_name` | text | Display name |
| `latitude` | numeric(10,7) | GPS lat |
| `longitude` | numeric(10,7) | GPS lng |
| `radius_meters` | int | Geofence radius (default 150m) |
| `address`, `city`, `state`, `zip_code` | text | For display |
| `is_active` | boolean | Soft delete |

**RLS:** Public SELECT (no user data). Service_role writes.
**Coverage:** 56 stores across 8 states after applying both migration files (FL, TN, OH, GA, TX, NY, CA, IL). Retailers: Publix, Kroger, Target, Walmart, Aldi, Whole Foods, Costco, Trader Joe's, H-E-B, Wegmans, Jewel-Osco, Mariano's, Ralphs, Vons, Meijer. GeofenceService reads this table directly — add rows here to activate new markets with zero code changes.

### profiles additions (2026-04-30)
- `expo_push_token text` — Expo Push Token for Monday morning plan notifications.
- `push_notifications_on boolean` — True when user has granted and token is stored.
- `push_token_updated_at timestamptz` — Last registration time.

### receipt_items additions (2026-04-30) — Self-Correcting OCR audit trail
- `ocr_confidence numeric(4,3)` — Gemini confidence 0.0–1.0. Below 0.6 triggers ghost match.
- `is_ghost_match boolean` — True when app suggested item from household_cart_items.
- `ghost_source text` — `'household_cart'` | `'weekly_plan'` | `'trip_history'`.
- `ghost_match_key text` — normalized_key of the matched item.
- `user_confirmed boolean` — null=pending, true=confirmed, false=user corrected.
- `user_corrected_name text` — What user said the item actually was.

### SQL Functions (2026-04-30)
- `get_this_week_anticipatory_plan(user_id uuid)` — Returns the current week's `ready` plan for a user, or empty. SECURITY DEFINER. GRANT to authenticated.
- `mark_plan_viewed(plan_id uuid, user_id uuid)` — Sets plan status `ready → viewed`. SECURITY DEFINER. GRANT to authenticated.

---

## Digital Coupon SQL Functions (added 2026-04-29)
Migration: `supabase/migrations/20260429_digital_savings.sql`

Additive functions only — no schema changes to existing tables.

### calculate_digital_savings(p_user_id uuid, p_normalized_keys text[])
Returns total potential digital savings in cents for a cart.

**Returns:** `(savings_cents bigint, matched_count int)`

- Reads user's `preferred_stores` from `user_persona` to scope results to their retailers.
- Falls back to 8 common retailers if user has no preferred stores.
- Matches `digital_coupons` where `is_active = true`, `normalized_key = ANY(keys)`, `retailer_key = ANY(preferred)`, and `expires_at > now()`.
- For pct-off coupons with no fixed discount_cents, estimates 15% off a $4.00 average item (60¢).
- GRANT EXECUTE to `authenticated`. SECURITY DEFINER.

### get_clippable_coupons(p_user_id uuid, p_normalized_keys text[])
Returns matching coupon rows for Checkout Shield display.

**Returns:** `(coupon_id, retailer_key, product_name, brand, normalized_key, discount_cents, discount_pct, coupon_type, is_loyalty_req, is_app_only, expires_at, savings_label)`

- Same retailer scoping logic as `calculate_digital_savings`.
- `savings_label` is a formatted string: `"$1.00 off"` or `"20% off"`.
- Ordered by `discount_cents DESC, discount_pct DESC` (biggest savings first).
- GRANT EXECUTE to `authenticated`. SECURITY DEFINER.

---

## SOC2 Fortress Layer (added 2026-04-29)
Migration: `supabase/migrations/20260429_soc2_fortress.sql`

### credit_ledger
Immutable audit trail. Every `credits_balance` change produces one row. Never deleted. SOC2 Processing Integrity proof — no one (including admins) can change balances without a ledger entry.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK | → `auth.users` ON DELETE CASCADE |
| `delta` | integer NOT NULL | positive = earn, negative = spend |
| `balance_after` | integer NOT NULL | balance after this transaction |
| `reason` | text NOT NULL | `RECEIPT_VERIFY`, `STREAK_SHIELD`, `UNAUTHORIZED_DIRECT_UPDATE`, etc. |
| `ref_id` | text | optional — `receipt_upload_id`, item key, etc. |
| `txn_source` | text NOT NULL DEFAULT `'rpc'` | `'rpc'` or `'UNAUTHORIZED_DIRECT_UPDATE'` |
| `created_at` | timestamptz NOT NULL DEFAULT now() | |

**RLS:** user reads own rows; service_role manages all. anon REVOKED.
**Trigger:** `credit_ledger_guard` on `profiles.credits_balance` — auto-inserts a row on every change. If the update bypassed the RPCs, `txn_source = 'UNAUTHORIZED_DIRECT_UPDATE'` fires an alert.

### receipt_hashes
Deduplication + velocity window for receipt credit awards. Prevents replay attacks and credit farming.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid NOT NULL FK | → `auth.users` |
| `receipt_upload_id` | text NOT NULL UNIQUE | idempotency key |
| `content_hash` | text | SHA-256 of store_name+date+total — catches same receipt re-uploaded |
| `credits_awarded` | integer NOT NULL DEFAULT 0 | base credits |
| `bonus_credits` | integer NOT NULL DEFAULT 0 | variable reward bonus |
| `fraud_flagged` | boolean NOT NULL DEFAULT false | set true on velocity violation |
| `fraud_reason` | text | `velocity_limit_exceeded` etc. |
| `created_at` | timestamptz NOT NULL DEFAULT now() | also used for velocity window |

**Constraints:** `UNIQUE (receipt_upload_id)`, `UNIQUE (user_id, content_hash)`

### SQL Functions (SOC2 Fortress)

| Function | Purpose |
|---|---|
| `earn_credits(user_id, amount, reason, ref_id)` → jsonb | Atomic credit addition with `SELECT FOR UPDATE` row lock |
| `spend_credits(user_id, amount, reason, ref_id)` → jsonb | Atomic deduction — returns `insufficient_credits` if balance too low |
| `redeem_store_item(user_id, item_key)` → jsonb | Atomic store purchase for all 5 item types, locked, audited |
| `process_receipt_verification(user_id, upload_id, content_hash)` → jsonb | Full gatekeeper: dedup + velocity + credits + streak + badges in one transaction |
| `credit_ledger_guard()` | Trigger function — logs all `credits_balance` changes to `credit_ledger` |

### healing_events — reflexion columns (added)
| Column | Type | Notes |
|---|---|---|
| `reflexion_analyzed` | boolean NOT NULL DEFAULT false | Set true after agent analysis |
| `reflexion_at` | timestamptz | When agent analyzed this event |
| `reflexion_notes` | text | Root cause + fix result from Gemini |

---

## Credits Economy + Streak Mechanics (added 2026-04-29)
Migration: `supabase/migrations/20260429_streak_achievements.sql`

### profiles — streak columns (added)
| Column | Type | Notes |
|---|---|---|
| `savings_streak_weeks` | int NOT NULL DEFAULT 0 | Consecutive ISO weeks with ≥1 verified receipt |
| `longest_streak_weeks` | int NOT NULL DEFAULT 0 | All-time record streak length |
| `last_streak_week` | text | ISO week string `YYYY-Www` of last verified receipt |
| `streak_shield_count` | int NOT NULL DEFAULT 1 | Shields held (max 5). Each absorbs one missed week. Starts at 1 (welcome gift). |
| `streak_updated_at` | timestamptz | Timestamp of last streak update |

### user_achievements
Badge unlock ledger. One row per user per badge (idempotent by UNIQUE constraint).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL FK | → `auth.users` ON DELETE CASCADE |
| `badge_key` | text NOT NULL | `STREAK_4`, `STREAK_8`, `STREAK_26`, `STREAK_52`, `CENTURY`, `FIRST_100`, `HALF_GRAND`, `FOUR_FIGURES`, `FIVE_GRAND` |
| `earned_at` | timestamptz NOT NULL DEFAULT now() | |
| `metadata` | jsonb NOT NULL DEFAULT `{}` | `{ streak_weeks: N }` or `{ lifetime_cents: N }` |

**Constraints:** `UNIQUE (user_id, badge_key)` — safe to `upsert` with `ignoreDuplicates: true`
**Indexes:** `(user_id, earned_at DESC)`
**RLS:** users read own rows; service_role manages all.

---

## Deal Intelligence Layer (added 2026-04-29)
Migration: `supabase/migrations/20260429_deal_intelligence_layer.sql`

### price_observations
Price history per product/retailer/store/ZIP. Feeds volatility scoring.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `offer_source_id` | uuid FK | → `offer_sources`. Nullable. |
| `retailer_key` | text NOT NULL | |
| `normalized_key` | text NOT NULL | Product dedupe key |
| `product_name` | text NOT NULL | |
| `observed_price_cents` | int NOT NULL | |
| `store_id` | text | |
| `zip_code` | text | |
| `state` | text | |
| `source_type` | text | `flyer`\|`user`\|`receipt`\|`api` |
| `is_verified` | boolean | Verified by receipt? |
| `observed_at` | timestamptz | |

**Indexes:** `(offer_source_id, observed_at DESC)`, `(retailer_key, normalized_key, observed_at DESC)`, `(zip_code, retailer_key)`, `(state, retailer_key)`

### validation_events
Full audit trail for every offer status change.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `offer_source_id` | uuid FK | |
| `event_type` | text | `ingested`\|`normalized`\|`scored`\|`approved`\|`flagged`\|`blocked`\|`published`\|`retracted`\|`price_changed`\|`expired`\|`user_confirmed`\|`user_rejected` |
| `old_status` / `new_status` | text | |
| `old_score` / `new_score` | numeric | 0.0–1.0 |
| `actor_type` | text | `ai`\|`human`\|`user`\|`system` |
| `reason_codes` | text[] | |
| `evidence_json` | jsonb | |

### user_deal_feedback
User outcome reports — feeds back into confidence scoring.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `user_id` | uuid FK | auth.users — RLS own rows |
| `offer_source_id` | uuid FK | |
| `outcome` | text | `worked`\|`coupon_failed`\|`out_of_stock`\|`wrong_price`\|`substituted`\|`quantity_not_met`\|`exclusion_hit`\|`register_rejected` |
| `predicted_savings_cents` | int | What we predicted |
| `actual_savings_cents` | int | What actually happened |
| `store_id` | text | |
| `zip_code` | text | |
| `state` | text | |

### source_reliability
Per-source trust scores, updated by feedback loop. 10 sources seeded.

| Column | Type | Notes |
|---|---|---|
| `source_type` | text | `flyer`\|`influencer`\|`manual`\|`api`\|`promo` |
| `source_key` | text | e.g. `publix`, `ibotta` |
| `reliability_score` | numeric | 0.0–1.0 |
| `accuracy_score` | numeric | 0.0–1.0 |
| `confirmed_deals` / `failed_deals` | int | Running counts |

### retailer_coverage
Market readiness by retailer/state/ZIP. 10 markets seeded (FL, TN, OH).

| Column | Type | Notes |
|---|---|---|
| `retailer_key` | text | |
| `state` | text | |
| `coverage_status` | text | `full`\|`partial`\|`none`\|`demo_only` |
| `market_readiness_score` | numeric | 0.0–1.0, updated by `compute_market_readiness()` |
| `active_offer_count` | int | |

### deal_review_queue
Human/AI review pipeline. Populated by `publish_gate()`.

| Column | Type | Notes |
|---|---|---|
| `offer_source_id` | uuid FK | |
| `trigger_reason` | text | `low_confidence`\|`missing_terms`\|`high_savings`\|`bogo_unclear`\|... |
| `review_status` | text | `pending`\|`in_progress`\|`approved`\|`rejected`\|`escalated` |
| `priority` | int | 1=urgent, 10=low |

### validation_rules
33 configurable rules — all rule logic lives here, not in code.

| Column | Type | Notes |
|---|---|---|
| `rule_code` | text UNIQUE | e.g. `R001`, `C003`, `E003` |
| `category` | text | `retailer`\|`product`\|`coupon`\|`deal`\|`stack`\|`regional`\|`pricing`\|`evidence` |
| `is_blocking` | boolean | Blocks publishing if fails |
| `sends_to_review` | boolean | Queues review if fails |
| `score_penalty` | numeric | Subtracted from confidence |

### SQL Functions (RPC)

| Function | Returns | Purpose |
|---|---|---|
| `compute_confidence_score(offer_source_id)` | numeric 0–100 | 10-factor weighted formula |
| `validate_offer(offer_source_id)` | jsonb | Runs all 33 rules + persists result |
| `publish_gate(offer_source_id)` | jsonb | Single publishing decision point |
| `compute_price_volatility(offer_source_id, window_days)` | numeric | Price variance → volatility_score |
| `compute_market_readiness(state, zip, retailer)` | jsonb | Market readiness 0–100 |
| `process_deal_feedback(...)` | jsonb | Records outcome, updates scores |
| `flag_stale_prices()` | void | pg_cron daily — marks stale/expired |

### Views

| View | Purpose |
|---|---|
| `v_active_offers` | Display-ready, filtered, scored offers for the app |
| `v_offer_price_history` | Price trend with LAG delta per product/retailer |
| `v_deal_review_dashboard` | Admin review queue enriched with offer data |

---

## healing_events

Self-healing memory log. Written on every app startup by `lib/healthMonitor.js` (via `lib/healingLog.js`). Append-only — no UPDATE or DELETE policies.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid | Nullable FK → `auth.users`. NULL for pre-auth startup checks. |
| `session_id` | text NOT NULL | Identifies one app startup run (e.g. `hm_1714000000_abc123`) |
| `check_name` | text NOT NULL | `secure_store` \| `async_storage` \| `cache_staleness` \| `supabase_connectivity` \| `session_integrity` \| `user_persona` |
| `status` | text NOT NULL | `ok` \| `warning` \| `critical` |
| `issue` | text | Human-readable description of the issue. NULL if `status = ok`. |
| `healed` | boolean | `true` if an auto-fix was applied |
| `heal_action` | text | Description of the fix applied |
| `duration_ms` | integer | How long the check took (milliseconds) |
| `app_version` | text | Semver string from `expo-constants` |
| `created_at` | timestamptz | Defaults to `now()` |

**Indexes**
- `idx_healing_events_user_time` — `(user_id, created_at DESC)`
- `idx_healing_events_check_time` — `(check_name, created_at DESC)`
- `idx_healing_events_healed` — partial on `healed = true`
- `idx_healing_events_unhealed_critical` — partial on `status = 'critical' AND healed = false`

**RLS**
- `healing_events_select_own` — users SELECT their own rows OR rows where `user_id IS NULL`
- `healing_events_insert_own` — users INSERT their own rows OR rows where `user_id IS NULL`

**Views**
- `v_user_health_score` — health score (0–100) per user, last 7 days
- `v_chronic_checks` — checks that failed 5+ times in last 30 days (chronic pattern detection)

**Migration:** `supabase/migrations/20260425_healing_events.sql`

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

One row per weekly-ad PDF to be processed. Created by `trigger-ingestion` Edge Function or seeded manually.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer_key` | text NOT NULL | e.g. `publix` |
| `week_of` | date NOT NULL | Monday of the deal week |
| `storage_path` | text NOT NULL UNIQUE | Flat filename in `deal-pdfs` bucket (e.g. `publix-2026-04-15-weekly-flyer.pdf`) |
| `source_type` | text | `pdf_weekly_ad` |
| `status` | text NOT NULL | `queued` \| `processing` \| `parsed` \| `done` \| `failed` |
| `attempts` | int NOT NULL | Incremented on each worker run |
| `deal_count` | int | Populated after Gemini OCR completes |
| `error` | text | Last failure message (original column) |
| `last_error` | text | Alias used by earlier code |
| `error_message` | text | Used by worker (migration 017) |
| `started_at` | timestamptz | Set when worker picks up job (migration 017) |
| `parsed_at` | timestamptz | Set after Gemini OCR completes (migration 017) |
| `completed_at` | timestamptz | |
| `processing_started_at` | timestamptz | Original column |
| `gemini_file_uri` | text | Cached Gemini Files API URI (valid 48h). Set after first upload for PDFs > 3MB. Retry invocations reuse it to skip re-upload. (migration 20260420_ingestion_file_uri_cache) |

**Indexes**
- `idx_ingestion_jobs_status` — `(status, created_at ASC)` — worker polling
- `idx_ingestion_jobs_retailer_week` — `(retailer_key, week_of)`
- `ingestion_jobs_storage_path_uniq` — UNIQUE on `storage_path` (migration 017b)

**Constraint:** `ingestion_jobs_status_check` — `status IN ('queued','processing','parsed','done','failed')` (migration 017b added `parsed` and `done`)

---

### flyer_deal_staging

Raw deals extracted from a flyer PDF before normalization. FK to `ingestion_jobs` (not `flyer_ingestions`).

| Column | Type | Notes |
|---|---|---|
| `ingestion_id` | uuid | FK → `ingestion_jobs.id` (NOT NULL dropped — FK constraint removed in migration 017) |
| `retailer_key` | text NOT NULL | |
| `week_of` | date NOT NULL | |
| `product_name` | text NOT NULL | |
| `brand` | text | |
| `sale_price` | numeric | Dollars |
| `regular_price` | numeric | Dollars |
| `deal_type` | text | Raw string from Gemini |
| `quantity_required` | int | |
| `category` | text | |
| `confidence_score` | numeric(4,3) | 0–1 (migration 017) |
| `needs_review` | boolean | True if confidence < 0.7 |
| `status` | text | `staged` \| `published` \| `rejected` |
| `savings_amount` | numeric(10,2) | migration 017 |
| `is_bogo` | boolean | Default false (migration 017) |
| `dietary_flags` | text[] | Default `{}` (migration 017) |
| `deal_description` | text | migration 017 |

---

### offer_sources

Normalized deal catalog. One row per deal per week, deduped.

| Column | Type | Notes |
|---|---|---|
| `retailer_key` | text NOT NULL | |
| `retailer_id` | uuid | NOT NULL dropped (migration 017) — worker does not write this |
| `week_of` | date NOT NULL | |
| `normalized_key` | text | `brand_product_name` (migration 017) |
| `dedupe_key` | text NOT NULL | `retailer_key::normalized_key::week_of` |
| `offer_type` | text | Mapped to `OfferType` (migration 017) |
| `sale_price_cents` | int | |
| `regular_price_cents` | int | |
| `expires_on` | date | Sunday of `week_of` |
| `confidence_score` | numeric(4,3) | From staging (migration 017) |
| `source` | text | `flyer` (migration 017) |
| `raw_text` | text | migration 017 |
| `ingestion_id` | uuid | migration 017 |

**Note:** UNIQUE index on `dedupe_key` alone could not be added (existing duplicate rows). The composite UNIQUE `(retailer_id, dedupe_key)` remains. Worker upserts bypass this path; deals go directly from `flyer_deal_staging` → `stack_candidates`.

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

Pre-computed deal candidates consumed by `get_weekly_plan` RPC and `cartEngine.buildCartOptions()`. Populated by ingestion worker (via `offer_sources`) or directly from `flyer_deal_staging` via SQL INSERT.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `retailer` | text NOT NULL | Matches `retailer_key` |
| `retailer_key` | text | |
| `category` | text NOT NULL | Lowercase |
| `item_name` | text NOT NULL | |
| `brand` | text | |
| `meal_type` | text NOT NULL | CHECK: `breakfast\|lunch\|dinner\|snack\|mixed` |
| `base_price` | numeric NOT NULL | Regular price (dollars) |
| `coupon_savings` | numeric NOT NULL DEFAULT 0 | |
| `sale_savings` | numeric NOT NULL DEFAULT 0 | `regular_price - sale_price` |
| `final_price` | numeric **GENERATED** | `GREATEST(base_price - coupon_savings - sale_savings, 0)` |
| `has_coupon` | boolean NOT NULL DEFAULT false | |
| `is_bogo` | boolean NOT NULL DEFAULT false | |
| `is_active` | boolean NOT NULL DEFAULT true | |
| `valid_from` | date | DEFAULT `CURRENT_DATE` |
| `valid_to` | date | Sunday of deal week |
| `stack_rank_score` | numeric NOT NULL DEFAULT 0 | Savings % or computed score |
| `allergen_tags` | jsonb NOT NULL DEFAULT `[]` | |
| `dietary_tags` | jsonb NOT NULL DEFAULT `[]` | |
| `dedupe_key` | text UNIQUE | `retailer_key::normalized_key::week_of` (migration 017) |
| `normalized_key` | text | `brand_product` normalized (migration 017) |
| `week_of` | date | Monday of deal week (migration 017) |
| `primary_category` | text | Worker-written; bridged to `category` by trigger (migration 017) |
| `primary_brand` | text | Worker-written; bridged to `brand` by trigger (migration 017) |
| `items` | jsonb | `StackItem[]` array (migration 017) |
| `savings_pct` | numeric DEFAULT 0 | migration 017 |
| `ingestion_id` | uuid | FK → `ingestion_jobs.id` (migration 017) |

**Generated column:** `final_price` — cannot be written directly; computed from `base_price - coupon_savings - sale_savings`.

**Trigger:** `trg_sync_stack_candidate_columns` (BEFORE INSERT OR UPDATE) — populates `category`, `brand`, `retailer`, `item_name`, `is_active`, `valid_to`, `base_price`, `sale_savings` from worker-written columns when RPC-read columns are blank.

**Indexes**
- `idx_stack_candidates_retailer_week_rank` — `(retailer_key, week_of, stack_rank_score DESC)`
- `stack_candidates_dedupe_key_unique` — UNIQUE on `dedupe_key` (migration 017)

**Current data:** 189 active deals from 8 retailers (walgreens=51, dollargeneral=47, keyfoods=36, aldi=34, publix=14, target=4, cvs=3, dollar_general=2) as of 2026-04-14.

---

### flyer_publish_log

Audit log written after `normalizeAndPublish()` completes.

| Column | Type | Notes |
|---|---|---|
| `ingestion_id` | uuid NOT NULL | FK → `ingestion_jobs` |
| `deals_staged` | int | migration 017 |
| `deals_published` | int | migration 017 |
| `coupons_matched` | int | migration 017 |
| `candidates_written` | int | migration 017 |
| `retailer_key` | text | migration 017 |
| `week_of` | date | migration 017 |
| `published_at` | timestamptz | |

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


---

### anonymized_signals

De-identified aggregate table populated by `delete_my_account()` before personal data deletion. Contains no `user_id` — cannot be related back to individuals.

| Column | Type | Notes |
|---|---|---|
| `id` | bigint PK | `GENERATED ALWAYS AS IDENTITY` |
| `retailer_key` | text | May be null |
| `category` | text NOT NULL | |
| `event_name` | text NOT NULL | |
| `week_of` | date NOT NULL | `date_trunc('week', timestamp)::date` |
| `signal_count` | integer | Accumulated via ON CONFLICT upsert |
| `updated_at` | timestamptz | |

**Unique constraint:** `(retailer_key, category, event_name, week_of)` — enables `ON CONFLICT DO UPDATE` accumulation.
**RLS:** Enabled, service role only. No user-facing read policy.

---

### delete_my_account() function

SECURITY DEFINER function callable by authenticated users via `supabase.rpc('delete_my_account')`.

1. Aggregates `event_stream` rows into `anonymized_signals` (preserves training signal without PII)
2. Deletes from: `event_stream`, `user_preference_scores`, `user_state_snapshots`, `wealth_momentum_snapshots`, `recommendation_exposures`, `model_predictions`, `api_rate_limit_log`, `receipt_items`, `receipt_summaries`, `trip_results`, `profiles`
3. Deletes from `auth.users` (terminates all sessions)



---

### profiles — consent columns (migration 006)

Added by `supabase/migrations/006_privacy_consent.sql`.

| Column | Type | Notes |
|---|---|---|
| `consent_accepted` | boolean NOT NULL DEFAULT false | Set to `true` at onboarding step 5 |
| `consent_accepted_at` | timestamptz | NULL until user accepts; written at onboarding |
| `privacy_policy_version` | text | Policy version string agreed to (e.g. `'1.0'`) |

**Index:** `profiles_consent_accepted_idx ON profiles (consent_accepted, consent_accepted_at)` — used for compliance reporting (find users who have/haven't accepted).

Policy version `'1.0'` corresponds to `docs/PRIVACY_POLICY.md`.

---

### profiles — nutrition intelligence columns (migration 015)

Added by `supabase/migrations/015_nutrition_profile.sql`.

| Column | Type | Default | Notes |
|---|---|---|---|
| `household_members` | jsonb | `'[]'` | Array of `{ role, age_group, sex, kcal_min, kcal_max }` — life-stage records from `MEMBER_OPTIONS` |
| `daily_calorie_target_min` | integer | NULL | Sum of household members' minimum daily kcal |
| `daily_calorie_target_max` | integer | NULL | Sum of household members' maximum daily kcal |
| `meal_calorie_target_min` | integer | NULL | `daily_calorie_target_min × 0.30` (dinner = 30% of daily per USDA 2020–2025) |
| `meal_calorie_target_max` | integer | NULL | `daily_calorie_target_max × 0.30` |
| `dietary_modes` | text[] | `'{}'` | Active dietary modes — values: `plant_based`, `low_carb`, `low_sodium`, `healthy_fats`, `high_protein`, `mediterranean`, `keto`, `diabetic_friendly` |
| `nutrition_profile_set` | boolean | false | `true` once user saves NutritionProfileScreen for the first time |

**household_members shape:**
```json
[
  { "role": "adult_woman_19_50", "age_group": "19-50", "sex": "female", "kcal_min": 1800, "kcal_max": 2000 },
  { "role": "child_4_8", "age_group": "4-8", "sex": "either", "kcal_min": 1200, "kcal_max": 1600 }
]
```

**Dietary mode conflicts (enforced client-side):**
- `plant_based` deselects `keto` and `high_protein`
- `keto` deselects `low_carb` (keto is stricter)

**Source:** `src/constants/nutritionTargets.ts` — `MEMBER_OPTIONS`, `DIETARY_MODES`, `computeHouseholdCalorieTarget()`, `DIETARY_MODE_CONFLICTS`

---

### storage trigger — on_pdf_upload (migration 20260419)

Added by `supabase/migrations/20260419_data_quality_and_storage_trigger.sql`.

**Trigger:** `on_pdf_upload` — `AFTER INSERT ON storage.objects FOR EACH ROW`

Fires whenever a file is uploaded to the Supabase Storage `deal-pdfs` bucket. Skips non-PDF files and unknown filename formats.

**Supported filename formats:**
- Flat: `retailer-YYYY-MM-DD-type.pdf` (e.g. `publix-2026-04-20-weekly-flyer.pdf`)
- Legacy folder: `retailer/YYYY-MM-DD/type.pdf`

**Type mapping:**

| Filename suffix | `source_type` |
|---|---|
| `weekly-flyer`, `weekly`, `flyer` | `pdf_weekly_ad` |
| `extra-savings`, `extra`, `coupons` | `pdf_extra_savings` |
| `bogo` | `pdf_bogo` |
| anything else | `pdf_weekly_ad` |

**Behaviour:**
- Inserts a `queued` row in `ingestion_jobs` with `attempts = 0`
- On conflict (same `storage_path`), resets status to `queued` only when the existing job is `failed`, `parsed`, or `done` — does not interrupt a job currently `processing` or already `queued`
- The existing `pg_cron` job (`008_ingestion_cron.sql`) picks up queued jobs on its schedule; invoke `run-ingestion-worker` manually for immediate processing

**Helper function:** `storage_path_to_job(storage_path text)` — returns `(retailer_key, week_of, source_type)` from a storage path string.

---

### offer_sources — schema fixes (migration 20260419)

Added by `supabase/migrations/20260419_fix_offer_sources_worker_compat.sql`.

- `source_type` column now has default `'flyer'` — prevents NOT NULL violation when the ingestion worker omits it
- Duplicate `dedupe_key` rows removed (kept most-recently-updated per key)
- New partial unique index `ux_offer_sources_dedupe_key` on `(dedupe_key) WHERE dedupe_key IS NOT NULL` — allows `onConflict:'dedupe_key'` upserts from the worker

---

### stack_candidates — data quality fixes (migration 20260419)

Applied by `supabase/migrations/20260419_data_quality_and_storage_trigger.sql`.

- All `category` and `primary_category` values normalised to lowercase
- `meal_type` recomputed from normalised category values
- Unpriced BOGO rows (`base_price = 0`, `sale_savings = 0`) deactivated
- `stack_rank_score` for aldi/keyfoods/walgreens rows rescored: `0.15` for known-price/unknown-savings items (honest signal — Gemini returned sale price only, no regular price to diff against)

---

### agent_initialization

Web-app waitlist and paid beta signups. Written by the Next.js `initialize-agent` API route and updated by the Stripe webhook. One row per email address.

**Migration:** `supabase/migrations/20260423_agent_initialization.sql`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `email` | text NOT NULL UNIQUE | Primary key for web-app users |
| `mission` | text | `rent_killer` \| `save_goal` \| `find_deals` |
| `budget_cents` | int | Monthly spend budget |
| `power_level` | text | `notify_only` \| `ask_first` \| `full_auto` |
| `leak_category` | text | `amazon` \| `food_apps` \| `clothing` |
| `style_vibe` | text | `casual_minimal` \| `trend_forward` \| `investment` |
| `clothing_size` | text | Optional |
| `shoe_size` | text | Optional |
| `shop_frequency` | text | `daily` \| `weekly` \| `big_events` |
| `status` | text NOT NULL | `waitlist` \| `beta` \| `lifetime` — updated by Stripe webhook |
| `payment_id` | text | Stripe subscription or payment intent ID |
| `stripe_customer_id` | text | Stripe customer ID |
| `crm_tags` | text[] | e.g. `['Rent-Killer-Segment', 'Beta-Pro-Paid']` |
| `economic_dna` | jsonb | Full onboarding snapshot |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | Auto-updated by trigger |

**RLS** — `service_role_only`: no direct client access (web app uses Next.js API routes)

---

### user_persona

Living shopping persona — the central intelligence record for every user. Written by the `WaitlistForecastScreen` (initial 4-step capture), `OnboardingConciergeScreen` (Deep Brief), and receipt-analysis workers (behavioral signal updates). One row per user.

**Migrations:**
- `supabase/migrations/20260423_user_persona.sql` — initial schema
- `supabase/migrations/20260423_user_persona_status.sql` — added `status` column
- `supabase/migrations/20260427_persona_expansion.sql` — Shopping Bestie expansion (20 new columns)

#### Core identity
| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL UNIQUE | FK → `auth.users(id)` ON DELETE CASCADE |
| `status` | text DEFAULT `'new'` | `new` \| `waitlist` \| `paid_beta` \| `launched` |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | Auto-updated by trigger |

#### Waitlist Forecast (captured in WaitlistForecastScreen — 4 steps)
| Column | Type | Notes |
|---|---|---|
| `household_composition` | jsonb | Count map: `{"infant":1,"teenager":2,"adult":2,"pet":1}` |
| `leak_category` | text | `convenience_tax` \| `brand_trap` \| `target_drift` \| `healthy_premium` |
| `mission_type` | text | `clinical_guardrails` \| `program_tracking` \| `athletic_fuel` \| `pure_savings` |
| `monthly_spend_cents` | int | User's reported monthly grocery + dining spend |
| `projected_monthly_recovery_cents` | int | Calculated at forecast time. Base 18% + household/leak/mission multipliers. Capped at 40%. |
| `why_snippd` | text | Free-text social proof: "Why do you need Snippd?" (max 140 chars) |
| `forecast_completed` | boolean DEFAULT false | Set to `true` when Forecast is submitted |

#### Deep Brief (captured in ConciergeOnboarding — 5 chapters, on activation)
| Column | Type | Notes |
|---|---|---|
| `child_ages` | int[] | Exact ages of children for growth-spurt modeling |
| `clinical_allergies` | text[] | `peanut` \| `tree_nut` \| `gluten` \| `dairy` \| `shellfish` \| `soy` \| `egg` |
| `clinical_diagnoses` | text[] | `diabetes_t2` \| `hypertension` \| `celiac` \| `ibs` \| `lactose_intolerant` |
| `pantry_anchors` | text[] | Non-negotiable anchor products (e.g. `['Folgers Coffee','Organic Valley Milk']`) |
| `preferred_stores` | text[] | `costco` \| `kroger` \| `target` \| `walmart` \| `aldi` \| `whole_foods` \| … |
| `loyalty_cards` | text[] | Stores where user holds a loyalty card (powers deal matching) |
| `financial_goal` | text | `debt_payoff` \| `build_wealth` \| `emergency_fund` \| `stretch_budget` |
| `stress_behavior` | text | `orders_delivery` \| `grabs_fast_food` \| `still_cooks` \| `eats_whatever` |
| `autonomy_level` | text DEFAULT `'confirm'` | `show_deals` \| `build_cart` \| `full_auto` |
| `cooking_frequency` | text | `daily` \| `few_times_week` \| `weekends_only` \| `rarely` |
| `brand_affinity` | text | `generic_always` \| `mix` \| `name_brand_loyal` \| `organic_premium` |
| `shopping_style` | text | `planned_list` \| `sale_hunter` \| `as_needed` \| `weekly_batch` |
| `persona_notes` | text | Free text: "My kids won't eat anything green" |
| `briefing_completed` | boolean DEFAULT false | Set to `true` when Deep Brief is submitted |

#### Legacy Concierge columns (preserved for existing users)
| Column | Type | Notes |
|---|---|---|
| `mission` | text | Original 8-step concierge: `rent_killer` \| `save_goal` \| `find_deals` |
| `monthly_budget_cents` | int | Original budget field |
| `power_level` | text | Original autonomy field |
| `style_vibe` | text | Original style field |
| `economic_dna` | jsonb | Full snapshot of original onboarding answers |

#### Living signals (updated by receipt analysis workers)
| Column | Type | Notes |
|---|---|---|
| `behavior_signals` | jsonb | e.g. `{"fast_food_freq_7d":3,"health_trend":"improving","buying_generics":true}`. **Never overwrite — always merge with `jsonb_set`.** |
| `persona_version` | int DEFAULT 1 | Increments on each behavioral update |

**Indexes**
- `idx_user_persona_user_id` — primary lookup
- `idx_user_persona_status` — UserStatus gate
- `idx_persona_forecast_pending` — partial: `forecast_completed = false`
- `idx_persona_household` — GIN on `household_composition` (nurture email segmentation)
- `idx_persona_behavior_signals` — GIN on `behavior_signals`
- `idx_persona_allergies` — GIN on `clinical_allergies` (allergy-safe product filtering)

**RLS**
- `select_own` — users can SELECT their own row
- `service_role_write` — INSERT/UPDATE/DELETE via service role only

**Trigger**
- `trg_user_persona_updated_at` (BEFORE UPDATE) → sets `updated_at = now()`

**Savings multiplier reference** (used by `WaitlistForecastScreen` + recommendation engine)
| Trigger | Multiplier added |
|---|---|
| Base rate | +18% |
| Per Infant | +8% |
| Per Teenager | +7% (Caloric Surge) |
| Per Senior | +6% (Rx Optimizer) |
| Per Toddler/School Age | +4% each |
| Per Pet | +3% (Pet Cost Cutter) |
| Leak: Brand Trap | +15% |
| Leak: Convenience Tax | +12% |
| Leak: Healthy Premium | +10% |
| Leak: Target Drift | +8% |
| Mission: Pure Savings | +10% |
| Mission: Athletic Fuel | +8% |
| Mission: Program Tracking | +6% |
| Mission: Clinical Guardrails | +5% |
| **Maximum cap** | **40%** |

---

### snippd_integrations

Key/value store for external service configuration (Slack webhooks, future integrations). Only accessible via `service_role`.

**Migration:** `supabase/migrations/20260422_slack_integration.sql`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `key` | text NOT NULL UNIQUE | e.g. `slack_policy_changes` |
| `value` | text | Webhook URL or config value. NULL = not yet configured |
| `description` | text | Human-readable explanation |
| `enabled` | boolean NOT NULL | Default `true`. Set `false` to pause without deleting |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | Auto-updated by trigger on every write |

**Seeded values**
- `is_beta_live` — `'false'` (flip to `'true'` in Dashboard SQL Editor to open beta access)
- `slack_policy_changes` — Slack webhook URL (seeded by `setup-slack-webhook.sh`)

**RLS**
- `service_role_only` — only `service_role` can SELECT/INSERT/UPDATE/DELETE

---

### v_beta_users (view)

Read-only view of users with `status IN ('paid_beta', 'launched')`. Joins `user_persona` with `auth.users` to expose email alongside persona fields. Service-role only (inherited from table RLS).

**Created by:** `supabase/migrations/20260423_user_persona_status.sql`

**Trigger**
- `trg_snippd_integrations_updated_at` (BEFORE UPDATE) → sets `updated_at = now()`

**Seeded rows**

| key | Default value | Purpose |
|---|---|---|
| `slack_policy_changes` | NULL (disabled) | Slack incoming webhook URL for retailer policy change alerts |
| `slack_channel_engineering` | `#engineering` | Display name of target Slack channel |

---

### retailer_policy_change_log

Append-only audit log populated by triggers on `retailer_coupon_parameters` and `retailer_rules`. The `slack-notify` Edge Function reads this table to post Slack notifications, then marks rows `notified_at`.

**Migration:** `supabase/migrations/20260422_slack_integration.sql`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `table_name` | text NOT NULL | `retailer_coupon_parameters` or `retailer_rules` |
| `operation` | text NOT NULL | `INSERT`, `UPDATE`, or `DELETE` |
| `retailer_id` | text | Extracted from `retailer_id` or `id` column of changed row |
| `old_data` | jsonb | Full row before change (NULL for INSERT) |
| `new_data` | jsonb | Full row after change (NULL for DELETE) |
| `notified_at` | timestamptz | NULL = not yet posted to Slack |
| `created_at` | timestamptz | `now()` |

**Indexes**
- `idx_retailer_policy_change_log_pending` — partial index on `(created_at ASC) WHERE notified_at IS NULL` — used by `slack-notify` to find pending rows efficiently

**Triggers feeding this table**
- `trg_retailer_coupon_parameters_change` (AFTER INSERT/UPDATE/DELETE on `retailer_coupon_parameters`) → `_log_retailer_policy_change()`
- `trg_retailer_rules_change` (AFTER INSERT/UPDATE/DELETE on `retailer_rules`) → `_log_retailer_policy_change()`

---

## Waitlist System Tables

> Migration: `supabase/migrations/20260427_waitlist_positions.sql`
>
> Three-lane waitlist position system.
> Lane 1–200: **paid** — first 200 payers get instant beta access (auto-approved).
> Lane 201–300: **gifted** — Snippd admin grants (influencers, featured picks).
> Lane 301+: **free** — organic waitlist, gamified climb.

---

### waitlist_positions

One row per user. Source of truth for their current waitlist tier, position, and approval status. All writes are server-side (Edge Functions or webhooks) — no authenticated-user write policies.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL UNIQUE | FK → `auth.users(id)` ON DELETE CASCADE |
| `tier` | text NOT NULL | `paid` \| `gifted` \| `free` (default `free`) |
| `base_position` | integer NOT NULL | Assigned at join, **never changes**. Paid: 1, 2, 3… Gifted: 201–300. Free: 301 + join order. |
| `current_position` | integer NOT NULL | `base_position − spots_gained`. Updated by `record_waitlist_action()`. Floor: 1. |
| `spots_gained` | integer NOT NULL | Running total of spots moved up. Default 0. |
| `status` | text NOT NULL | `waiting` \| `approved` \| `declined`. Default `waiting`. Paid users ≤ 200 are auto-approved. |
| `stripe_payment_id` | text | Set on Stripe payment confirmation via webhook |
| `stripe_tier` | text | `beta_pro` \| `founder` |
| `approved_at` | timestamptz | Set when Snippd approves this user for beta |
| `created_at` | timestamptz | `now()` |
| `updated_at` | timestamptz | `now()`, updated by writes |

**Indexes**
- `idx_wlpos_user_id` — `(user_id)`
- `idx_wlpos_tier_position` — `(tier, current_position)`
- `idx_wlpos_status` — `(status)`
- `idx_wlpos_current_position` — `(current_position)`

**RLS**
- `waitlist_positions_select_own` — users SELECT their own row only
- No INSERT/UPDATE policy for authenticated users — all writes are server-side

---

### waitlist_actions

Append-only log of every move-up event. **Never update or delete rows.**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `user_id` | uuid NOT NULL | FK → `auth.users(id)` ON DELETE CASCADE |
| `action_type` | text NOT NULL | See action types below |
| `spots_awarded` | integer NOT NULL | Spots moved up. Default 0. |
| `verified` | boolean NOT NULL | `false` for honor-system shares (pending admin review); `true` for auto-verified actions |
| `referred_user_id` | uuid | FK → `auth.users`. Populated for `referral_join` and `referral_paid` actions. |
| `note` | text | Admin note for `admin_gift` or `why_featured` actions |
| `created_at` | timestamptz | `now()` |

**Action types**

| `action_type` | Spots | Verified | Trigger |
|---|---|---|---|
| `complete_briefing` | +10 | Auto | User completes 5-chapter ConciergeOnboarding |
| `share_ig` | +25 | Honor | User tags @getsnippd on Instagram |
| `share_tiktok` | +25 | Honor | User tags @getsnippd on TikTok |
| `share_x` | +25 | Honor | User tags @getsnippd on X |
| `referral_join` | +50 | Auto | A referred user completes forecast |
| `referral_paid` | +100 | Auto | A referred user pays for beta |
| `why_featured` | +50 | Admin | Snippd features this user's "Why" |
| `admin_gift` | variable | Admin | Manual admin grant |

**Indexes**
- `idx_wlact_user_id` — `(user_id)`
- `idx_wlact_action_type` — `(action_type)`
- `idx_wlact_verified` — `(verified)`

**RLS**
- `waitlist_actions_select_own` — users SELECT their own rows only
- No INSERT policy for authenticated users — all writes are server-side

---

### Stored Functions (waitlist)

#### assign_free_waitlist_position(p_user_id UUID) → INTEGER

Assigns a free-lane position (`MAX(base_position, 300) + 1`) and inserts a row in `waitlist_positions` with `tier = 'free'`. Uses `ON CONFLICT (user_id) DO NOTHING` — safe to call multiple times. Returns the assigned position.

**Called by:** `ingest-event` Edge Function after `forecast_completed = true` is set.

---

#### assign_paid_waitlist_position(p_user_id UUID, p_stripe_payment_id TEXT, p_stripe_tier TEXT) → INTEGER

Assigns the next paid position (`MAX(paid base_position) + 1`). Users with position ≤ 200 are auto-approved (`status = 'approved'`, `approved_at = NOW()`). Upserts on conflict. Also updates `user_persona.status` to `paid_beta` (if approved) or `waitlist`. Returns the assigned position.

**Called by:** Stripe webhook Edge Function after payment is confirmed.

---

#### record_waitlist_action(p_user_id UUID, p_action_type TEXT, p_spots INTEGER, p_verified BOOLEAN, p_referred_user_id UUID, p_note TEXT) → VOID

Inserts a row in `waitlist_actions` and updates `waitlist_positions`:
- `spots_gained += p_spots`
- `current_position = GREATEST(1, current_position − p_spots)` (floor at 1)

**Called by:** Edge Functions or server-side workers for verified actions (referrals, briefing completion). Admin UI for honor-system share verification.

---

### Views (waitlist)

#### v_waitlist_leaderboard

Anonymized leaderboard — no PII, no `user_id`. Safe for public display. Columns: `tier`, `current_position`, `status`, `spots_gained`, `created_at`. Ordered by `current_position ASC`.

#### v_waitlist_stats

Aggregate counts for community display.

| Column | Description |
|---|---|
| `total_on_waitlist` | All users in `waitlist_positions` |
| `paid_count` | Users with `tier = 'paid'` |
| `gifted_count` | Users with `tier = 'gifted'` |
| `free_count` | Users with `tier = 'free'` |
| `approved_count` | Users with `status = 'approved'` |
| `last_paid_position` | Highest paid `current_position` (i.e. how many paid spots are gone) |


---

### trip_feedback

Post-trip micro-survey results. One row per feedback submission.
Migration: `supabase/migrations/20260501_trip_feedback.sql`

| Column | Type | Description |
|---|---|---|
| `id` | uuid | Primary key |
| `user_id` | uuid | FK → auth.users |
| `store` | text | Store name from shopping list |
| `planned_total_cents` | integer | Backend-provided planned total |
| `receipt_total_cents` | integer | Actual receipt total (0 if not uploaded) |
| `verified_savings_cents` | integer | Savings confirmed by backend |
| `coupons_clipped` | integer | Count of verified coupons in the list |
| `plan_followed_pct` | numeric(5,2) | % of checklist items checked before View Summary |
| `rating` | text | perfect / good / okay / frustrating |
| `issue` | text | Selected issue when rating is okay/frustrating |
| `savings_action` | text | What user plans to do with savings |
| `created_at` | timestamptz | Submission timestamp |

RLS: user reads/writes own rows only (`auth.uid() = user_id`).
