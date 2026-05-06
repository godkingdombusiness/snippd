-- ─────────────────────────────────────────────────────────────────────────────
-- 20260501_titan_spec_gaps.sql
-- Titan Execution Engine — schema gaps
--
-- Apply in: Supabase Dashboard → SQL Editor → Run
--
-- Adds:
--   1. stack_rank_score column to app_home_feed (was missing; used for ordering)
--   2. loyalty_required flag on app_home_feed (Titan Golden Rule #4)
--   3. bogo_type on app_home_feed (Half-BOGO vs True-BOGO, Florida policy)
--   4. household_essential flag (Titan 7+1 Rule)
--   5. Backfills stack_rank_score from existing save_price / original_price data
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add Titan-required columns to app_home_feed
ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS stack_rank_score   numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_required   boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS bogo_type          text         CHECK (bogo_type IN ('half_bogo','true_bogo','none') OR bogo_type IS NULL),
  ADD COLUMN IF NOT EXISTS is_household_essential boolean  DEFAULT false;

-- 2. Backfill stack_rank_score for existing seeded deals
--    Formula: savings_pct capped at 100, using save_price / original_price
UPDATE app_home_feed
SET stack_rank_score = LEAST(100,
  CASE
    WHEN original_price > 0 THEN ROUND((save_price / original_price) * 100, 2)
    WHEN pay_price      > 0 THEN ROUND((save_price / (pay_price + save_price)) * 100, 2)
    ELSE 0
  END
)
WHERE stack_rank_score = 0 OR stack_rank_score IS NULL;

-- 3. Mark household essentials (cleaning / health / beauty) from existing seeds
UPDATE app_home_feed
SET is_household_essential = true
WHERE meal_type ILIKE '%household%'
   OR meal_type ILIKE '%clean%'
   OR meal_type ILIKE '%health%'
   OR meal_type ILIKE '%beauty%'
   OR title     ILIKE '%cleaning%'
   OR title     ILIKE '%household%'
   OR title     ILIKE '%detergent%'
   OR title     ILIKE '%paper towel%'
   OR title     ILIKE '%toilet%'
   OR title     ILIKE '%soap%'
   OR title     ILIKE '%shampoo%';

-- 4. Add stack_rank_score to stack_candidates if missing
ALTER TABLE stack_candidates
  ADD COLUMN IF NOT EXISTS loyalty_required        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_household_essential  boolean DEFAULT false;

-- 5. Create index for ordering by stack_rank_score
CREATE INDEX IF NOT EXISTS idx_app_home_feed_rank
  ON app_home_feed (stack_rank_score DESC, status, verification_status);

-- Verify
SELECT
  COUNT(*)                                    AS total_deals,
  COUNT(*) FILTER (WHERE stack_rank_score > 0) AS ranked,
  COUNT(*) FILTER (WHERE is_household_essential) AS household_essentials,
  ROUND(AVG(stack_rank_score), 1)             AS avg_rank_score
FROM app_home_feed
WHERE status = 'active';
