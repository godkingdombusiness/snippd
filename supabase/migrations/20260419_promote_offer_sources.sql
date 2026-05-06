-- ============================================================
-- Migration: 20260419_promote_offer_sources.sql
-- Promote valid offer_sources records directly into
-- stack_candidates, bypassing flyer_deal_staging.
-- Safe to run multiple times (ON CONFLICT DO UPDATE).
-- ============================================================

INSERT INTO stack_candidates (
  item_name,
  retailer,
  retailer_key,
  category,
  base_price,
  sale_savings,
  coupon_savings,
  is_bogo,
  has_coupon,
  is_active,
  valid_to,
  week_of,
  dedupe_key,
  stack_rank_score,
  dietary_tags,
  allergen_tags,
  meal_type
)
SELECT
  os.product_name                                             AS item_name,
  os.retailer_key                                             AS retailer,
  os.retailer_key                                             AS retailer_key,
  COALESCE(os.category, 'grocery')                            AS category,
  COALESCE(os.regular_price_cents, os.sale_price_cents, 0) / 100.0  AS base_price,
  GREATEST(
    0,
    (COALESCE(os.regular_price_cents, 0) - COALESCE(os.sale_price_cents, 0)) / 100.0
  )                                                           AS sale_savings,
  COALESCE(os.coupon_value_cents, 0) / 100.0                 AS coupon_savings,
  (os.reward_type = 'BOGO')                                  AS is_bogo,
  (os.coupon_value_cents > 0)                                AS has_coupon,
  true                                                        AS is_active,
  os.expires_on                                               AS valid_to,
  os.week_of                                                  AS week_of,
  'os_' || os.id::text                                        AS dedupe_key,
  CASE
    WHEN os.reward_type = 'BOGO'
      THEN 0.85
    WHEN COALESCE(os.coupon_value_cents, 0) > 0
     AND COALESCE(os.sale_price_cents, 0) < COALESCE(os.regular_price_cents, 0)
      THEN 0.75
    WHEN COALESCE(os.coupon_value_cents, 0) > 0
      THEN 0.65
    WHEN COALESCE(os.sale_price_cents, 0) < COALESCE(os.regular_price_cents, 0)
      THEN 0.55
    ELSE 0.10
  END                                                         AS stack_rank_score,
  '[]'::jsonb                                                 AS dietary_tags,
  '[]'::jsonb                                                 AS allergen_tags,
  CASE os.category
    WHEN 'meat'      THEN 'dinner'
    WHEN 'seafood'   THEN 'dinner'
    WHEN 'produce'   THEN 'dinner'
    WHEN 'dairy'     THEN 'breakfast'
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'bakery'    THEN 'breakfast'
    WHEN 'deli'      THEN 'lunch'
    ELSE 'mixed'
  END                                                         AS meal_type
FROM offer_sources os
WHERE os.is_active = true
  AND (os.expires_on IS NULL OR os.expires_on >= CURRENT_DATE)
  AND os.retailer_key IN (
    'publix', 'dollar_general', 'aldi',
    'walgreens', 'target', 'sprouts', 'cvs'
  )
  AND (
    os.sale_price_cents < os.regular_price_cents
    OR os.coupon_value_cents > 0
    OR os.reward_type IN ('BOGO', 'DIGITAL_COUPON', 'REBATE')
  )
ON CONFLICT (dedupe_key) DO UPDATE SET
  item_name        = EXCLUDED.item_name,
  retailer         = EXCLUDED.retailer,
  retailer_key     = EXCLUDED.retailer_key,
  category         = EXCLUDED.category,
  base_price       = EXCLUDED.base_price,
  sale_savings     = EXCLUDED.sale_savings,
  coupon_savings   = EXCLUDED.coupon_savings,
  is_bogo          = EXCLUDED.is_bogo,
  has_coupon       = EXCLUDED.has_coupon,
  is_active        = EXCLUDED.is_active,
  valid_to         = EXCLUDED.valid_to,
  week_of          = EXCLUDED.week_of,
  stack_rank_score = EXCLUDED.stack_rank_score,
  dietary_tags     = EXCLUDED.dietary_tags,
  allergen_tags    = EXCLUDED.allergen_tags,
  meal_type        = EXCLUDED.meal_type;

-- Verify: count promoted records
SELECT COUNT(*) AS promoted
FROM stack_candidates
WHERE dedupe_key LIKE 'os_%';
