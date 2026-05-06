-- ============================================================
-- Migration: 20260419_promote_staging_to_candidates.sql
-- Promote staged deals from flyer_deal_staging directly into
-- stack_candidates for keyfoods, walgreens, and aldi —
-- bypassing the Gemini re-extraction step.
-- Only touches rows with status IN ('staged','pending') that
-- have not already been published.
-- Safe to re-run: ON CONFLICT (dedupe_key) DO UPDATE.
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
  meal_type,
  -- legacy worker columns (kept for RPC compatibility)
  primary_category,
  primary_brand,
  savings_pct,
  ingestion_id
)
SELECT
  fds.product_name                                                  AS item_name,
  fds.retailer_key                                                  AS retailer,
  fds.retailer_key                                                  AS retailer_key,
  COALESCE(fds.category, 'grocery')                                 AS category,

  -- base_price: prefer regular_price, fall back to sale_price
  COALESCE(fds.regular_price, fds.sale_price, 0)                   AS base_price,

  -- sale_savings: only positive when regular > sale
  GREATEST(0, COALESCE(fds.regular_price, 0) - COALESCE(fds.sale_price, 0))
                                                                    AS sale_savings,
  0.0                                                               AS coupon_savings,

  COALESCE(fds.is_bogo, false)                                      AS is_bogo,
  false                                                             AS has_coupon,
  true                                                              AS is_active,

  -- valid_to: end of the week_of date
  (fds.week_of + INTERVAL '6 days')::date                          AS valid_to,
  fds.week_of                                                       AS week_of,

  -- dedupe_key matches worker format: retailer::normalized::week
  fds.retailer_key || '::' ||
    LOWER(REGEXP_REPLACE(
      COALESCE(fds.brand || '_', '') || fds.product_name,
      '[^a-z0-9_]', '', 'g'
    )) || '::' || fds.week_of::text                                 AS dedupe_key,

  -- stack_rank_score
  CASE
    WHEN COALESCE(fds.is_bogo, false)
      THEN 0.85
    WHEN fds.deal_type IN ('DIGITAL_COUPON','MANUFACTURER_COUPON','REBATE')
      THEN 0.65
    WHEN fds.regular_price IS NOT NULL
     AND fds.sale_price IS NOT NULL
     AND fds.regular_price > 0
     AND fds.sale_price < fds.regular_price
      THEN LEAST(0.80,
             0.10 + ((fds.regular_price - fds.sale_price) / fds.regular_price) * 0.70
           )
    ELSE 0.20
  END                                                               AS stack_rank_score,

  '[]'::jsonb                                                       AS dietary_tags,
  '[]'::jsonb                                                       AS allergen_tags,

  CASE COALESCE(fds.category, 'grocery')
    WHEN 'meat'      THEN 'dinner'
    WHEN 'seafood'   THEN 'dinner'
    WHEN 'produce'   THEN 'dinner'
    WHEN 'dairy'     THEN 'breakfast'
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'bakery'    THEN 'breakfast'
    WHEN 'deli'      THEN 'lunch'
    ELSE 'mixed'
  END                                                               AS meal_type,

  -- legacy columns
  COALESCE(fds.category, 'grocery')                                 AS primary_category,
  COALESCE(fds.brand, '')                                           AS primary_brand,
  CASE
    WHEN fds.regular_price IS NOT NULL AND fds.regular_price > 0
     AND fds.sale_price IS NOT NULL
      THEN GREATEST(0, (fds.regular_price - fds.sale_price) / fds.regular_price)
    ELSE 0
  END                                                               AS savings_pct,
  fds.ingestion_id                                                  AS ingestion_id

FROM (
  SELECT DISTINCT ON (
    fds_inner.retailer_key,
    LOWER(REGEXP_REPLACE(
      COALESCE(fds_inner.brand || '_', '') || fds_inner.product_name,
      '[^a-z0-9_]', '', 'g'
    )),
    fds_inner.week_of
  )
  fds_inner.*
  FROM flyer_deal_staging fds_inner
  WHERE fds_inner.retailer_key IN ('keyfoods', 'walgreens', 'aldi')
    AND fds_inner.status IN ('staged', 'pending')
    AND fds_inner.product_name IS NOT NULL
    AND fds_inner.product_name <> ''
    AND COALESCE(fds_inner.confidence_score, 0.75) >= 0.7
    AND (
      fds_inner.sale_price IS NOT NULL
      OR fds_inner.is_bogo = true
      OR fds_inner.deal_type IN ('DIGITAL_COUPON','MANUFACTURER_COUPON','REBATE','BOGO')
    )
  ORDER BY
    fds_inner.retailer_key,
    LOWER(REGEXP_REPLACE(
      COALESCE(fds_inner.brand || '_', '') || fds_inner.product_name,
      '[^a-z0-9_]', '', 'g'
    )),
    fds_inner.week_of,
    fds_inner.confidence_score DESC NULLS LAST,
    fds_inner.created_at DESC
) fds

ON CONFLICT (dedupe_key) DO UPDATE SET
  item_name        = EXCLUDED.item_name,
  category         = EXCLUDED.category,
  base_price       = EXCLUDED.base_price,
  sale_savings     = EXCLUDED.sale_savings,
  is_bogo          = EXCLUDED.is_bogo,
  stack_rank_score = EXCLUDED.stack_rank_score,
  meal_type        = EXCLUDED.meal_type,
  primary_category = EXCLUDED.primary_category,
  primary_brand    = EXCLUDED.primary_brand,
  savings_pct      = EXCLUDED.savings_pct,
  is_active        = true,
  valid_to         = EXCLUDED.valid_to;

-- Mark promoted rows as published in staging
UPDATE flyer_deal_staging
SET status = 'published'
WHERE retailer_key IN ('keyfoods', 'walgreens', 'aldi')
  AND status IN ('staged', 'pending');

-- Final count
SELECT
  retailer_key,
  COUNT(*) AS candidates,
  COUNT(CASE WHEN is_bogo THEN 1 END) AS bogos,
  ROUND(AVG(stack_rank_score)::numeric, 2) AS avg_score
FROM stack_candidates
WHERE retailer_key IN ('keyfoods', 'walgreens', 'aldi')
  AND is_active = true
GROUP BY retailer_key
ORDER BY retailer_key;
