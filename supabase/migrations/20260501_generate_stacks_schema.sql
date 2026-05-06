-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260501_generate_stacks_schema
-- Extends app_home_feed + stack_candidates with columns needed by the
-- generate-stacks Cloud Run service and the new 3-screen flow.
-- All ADD COLUMN IF NOT EXISTS — safe to run multiple times.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── app_home_feed extensions ─────────────────────────────────────────────────

ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS stack_type               TEXT,
  ADD COLUMN IF NOT EXISTS trigger_coupon           TEXT,
  ADD COLUMN IF NOT EXISTS instructions             JSONB,
  ADD COLUMN IF NOT EXISTS best_shop_window         TEXT,
  ADD COLUMN IF NOT EXISTS confidence               TEXT,
  ADD COLUMN IF NOT EXISTS savings_percent          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS final_out_of_pocket_cents INTEGER,
  ADD COLUMN IF NOT EXISTS subtotal_cents           INTEGER,
  ADD COLUMN IF NOT EXISTS total_discounts_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS item_count               INTEGER;

-- Index for the ShoppingListScreen and HomeScreen queries
CREATE INDEX IF NOT EXISTS idx_ahf_stack_type
  ON app_home_feed(stack_type)
  WHERE stack_type IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ahf_savings_pct
  ON app_home_feed(savings_percent DESC)
  WHERE status = 'active';

-- ── stack_candidates extensions ───────────────────────────────────────────────

ALTER TABLE stack_candidates
  ADD COLUMN IF NOT EXISTS trigger_coupon           TEXT,
  ADD COLUMN IF NOT EXISTS instructions             JSONB,
  ADD COLUMN IF NOT EXISTS best_shop_window         TEXT,
  ADD COLUMN IF NOT EXISTS final_out_of_pocket_cents INTEGER,
  ADD COLUMN IF NOT EXISTS total_discounts_cents    INTEGER,
  ADD COLUMN IF NOT EXISTS savings_percent          NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS item_count               INTEGER;

-- ── Ensure authenticated users can read app_home_feed ────────────────────────
-- (Should already exist — adds it if missing)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'app_home_feed'
      AND policyname = 'app_home_feed_public_read'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY "app_home_feed_public_read"
        ON app_home_feed FOR SELECT
        USING (status = 'active')
    $policy$;
  END IF;
END $$;

COMMENT ON COLUMN app_home_feed.stack_type IS
  'Stack classification: BOGO_STACK | THRESHOLD_STACK | PROMO_TRIGGER_STACK | DIGITAL_COUPON_STACK | BASKET_ENGINEERED_STACK | OVERAGE_STACK';

COMMENT ON COLUMN app_home_feed.instructions IS
  'Ordered array of human-readable step strings for the STACK_DETAIL screen';

COMMENT ON COLUMN app_home_feed.best_shop_window IS
  'Human-readable shopping window, e.g. "Shop by Saturday, May 4"';
