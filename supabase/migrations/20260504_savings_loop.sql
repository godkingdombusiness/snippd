-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260504_savings_loop
-- Adds: weekly_plans, weekly_plan_days, coupon_checklist,
--       receipt_outcomes, optional_bonus_savings
--
-- SAFE: IF NOT EXISTS throughout. No existing tables modified.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. weekly_plans ───────────────────────────────────────────────────────────
-- One row per user per week. Created when the user locks in their weekly plan.

CREATE TABLE IF NOT EXISTS weekly_plans (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_start                    DATE        NOT NULL,
  budget_target                 NUMERIC     NOT NULL DEFAULT 150,
  household_size                SMALLINT    NOT NULL DEFAULT 2,
  preferred_stores              TEXT[]      NOT NULL DEFAULT '{}',
  projected_total               NUMERIC,                    -- planned Snippd cost
  baseline_without_snippd_total NUMERIC,                    -- estimated full-price cost
  estimated_snippd_savings      NUMERIC,                    -- baseline - projected
  meals_covered                 INTEGER     DEFAULT 21,
  nutrition_summary             JSONB       NOT NULL DEFAULT '{}',
  allergy_flags                 JSONB       NOT NULL DEFAULT '{}',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, week_start)
);

-- ── 2. weekly_plan_days ───────────────────────────────────────────────────────
-- 7 rows per weekly_plans row (one per day).

CREATE TABLE IF NOT EXISTS weekly_plan_days (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  weekly_plan_id    UUID        NOT NULL REFERENCES weekly_plans(id) ON DELETE CASCADE,
  day_name          TEXT        NOT NULL,
  day_index         SMALLINT    NOT NULL, -- 0=Monday … 6=Sunday
  breakfast         JSONB       NOT NULL DEFAULT '{}',
  lunch             JSONB       NOT NULL DEFAULT '{}',
  dinner            JSONB       NOT NULL DEFAULT '{}',
  daily_total       NUMERIC,
  nutrition_summary JSONB       NOT NULL DEFAULT '{}'
);

-- ── 3. coupon_checklist ───────────────────────────────────────────────────────
-- Coupons the user needs to clip for their weekly plan.

CREATE TABLE IF NOT EXISTS coupon_checklist (
  id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID        NOT NULL,
  weekly_plan_id     UUID        REFERENCES weekly_plans(id) ON DELETE CASCADE,
  store              TEXT,
  item_name          TEXT,
  coupon_description TEXT,
  estimated_value    NUMERIC,
  clip_url           TEXT,
  status             TEXT        NOT NULL DEFAULT 'not_clipped'
    CHECK (status IN ('not_clipped','clipped','used','expired')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 4. receipt_outcomes ───────────────────────────────────────────────────────
-- One row per receipt scan. Stores the full savings comparison result.

CREATE TABLE IF NOT EXISTS receipt_outcomes (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                       UUID        NOT NULL,
  weekly_plan_id                UUID        REFERENCES weekly_plans(id),
  trip_id                       TEXT,
  store_id                      TEXT,
  store                         TEXT,
  planned_total                 NUMERIC,
  actual_total                  NUMERIC,
  baseline_without_snippd_total NUMERIC,
  planned_savings               NUMERIC,
  actual_savings                NUMERIC,
  plan_accuracy_percent         NUMERIC,
  budget_target                 NUMERIC,
  budget_result                 NUMERIC,
  was_under_budget              BOOLEAN,
  matched_items_count           INTEGER     DEFAULT 0,
  missing_items_count           INTEGER     DEFAULT 0,
  substituted_items_count       INTEGER     DEFAULT 0,
  coupons_expected              INTEGER     DEFAULT 0,
  coupons_confirmed             INTEGER     DEFAULT 0,
  meals_covered                 INTEGER,
  nutrition_summary             JSONB       NOT NULL DEFAULT '{}',
  allergy_safe                  BOOLEAN,
  bonus_savings                 JSONB       NOT NULL DEFAULT '{}',
  raw_receipt_payload           JSONB       NOT NULL DEFAULT '{}',
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── 5. optional_bonus_savings ─────────────────────────────────────────────────
-- Fetch/Ibotta bonus savings. Optional — never blocks core savings calculation.

CREATE TABLE IF NOT EXISTS optional_bonus_savings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID        NOT NULL,
  weekly_plan_id    UUID        REFERENCES weekly_plans(id),
  item_id           TEXT,
  source            TEXT        NOT NULL DEFAULT 'other'
    CHECK (source IN ('fetch','ibotta','other')),
  offer_description TEXT,
  estimated_value   NUMERIC,
  claimed_value     NUMERIC,
  status            TEXT        NOT NULL DEFAULT 'available'
    CHECK (status IN ('available','claimed','missed','expired')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_weekly_plans_user_week      ON weekly_plans (user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_plan_days_plan       ON weekly_plan_days (weekly_plan_id, day_index);
CREATE INDEX IF NOT EXISTS idx_coupon_checklist_plan       ON coupon_checklist (weekly_plan_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_checklist_user       ON coupon_checklist (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_outcomes_user       ON receipt_outcomes (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_outcomes_plan       ON receipt_outcomes (weekly_plan_id);
CREATE INDEX IF NOT EXISTS idx_optional_bonus_user         ON optional_bonus_savings (user_id, status);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE weekly_plans           ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_plan_days       ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupon_checklist       ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipt_outcomes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE optional_bonus_savings ENABLE ROW LEVEL SECURITY;

-- weekly_plans
CREATE POLICY "wp_own"     ON weekly_plans FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "wp_service" ON weekly_plans FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- weekly_plan_days (access via parent plan ownership)
CREATE POLICY "wpd_own" ON weekly_plan_days FOR ALL
  USING (EXISTS (SELECT 1 FROM weekly_plans w WHERE w.id = weekly_plan_id AND w.user_id = auth.uid()));
CREATE POLICY "wpd_service" ON weekly_plan_days FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- coupon_checklist
CREATE POLICY "cc_own"     ON coupon_checklist FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cc_service" ON coupon_checklist FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- receipt_outcomes
CREATE POLICY "ro_own"     ON receipt_outcomes FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ro_service" ON receipt_outcomes FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- optional_bonus_savings
CREATE POLICY "obs_own"    ON optional_bonus_savings FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "obs_service" ON optional_bonus_savings FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM weekly_plans)           AS weekly_plans_rows,
  (SELECT COUNT(*) FROM weekly_plan_days)       AS weekly_plan_days_rows,
  (SELECT COUNT(*) FROM coupon_checklist)       AS coupon_checklist_rows,
  (SELECT COUNT(*) FROM receipt_outcomes)       AS receipt_outcomes_rows,
  (SELECT COUNT(*) FROM optional_bonus_savings) AS optional_bonus_rows;
