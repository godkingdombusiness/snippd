-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260503_trip_feedback
-- Adds: trip_feedback table (post-trip micro-survey + outcome storage)
--
-- Columns match TripSummaryFeedbackScreen.js existing inserts (rating, issue,
-- savings_action, planned_total_cents…) PLUS new adaptive-memory spec columns
-- (saved_money_response, store_accuracy_response, reuse_intent,
--  improvement_area, was_under_budget…) as nullable — zero breaking changes.
--
-- SAFE: IF NOT EXISTS. Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_feedback (
  -- Primary key
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL,

  -- Trip identifiers
  trip_id                 TEXT,
  store                   TEXT,
  store_id                TEXT,

  -- Financial outcome (cents — matches existing screen inserts)
  planned_total_cents     NUMERIC,
  receipt_total_cents     NUMERIC,
  verified_savings_cents  NUMERIC,
  coupons_clipped         INTEGER,
  plan_followed_pct       NUMERIC,

  -- Financial outcome (decimal dollars — new spec; nullable for backwards compat)
  planned_total           NUMERIC,
  actual_total            NUMERIC,
  estimated_savings       NUMERIC,
  actual_savings          NUMERIC,
  was_under_budget        BOOLEAN,

  -- Nutrition outcome (null when not enriched)
  meals_covered           INTEGER,
  total_protein           NUMERIC,
  total_calories          NUMERIC,
  allergy_safe            BOOLEAN,

  -- Existing screen fields
  rating                  TEXT CHECK (rating IN ('perfect','good','okay','frustrating')),
  issue                   TEXT,
  savings_action          TEXT,

  -- 3-question adaptive survey (new spec; nullable)
  saved_money_response    TEXT,    -- 'yes' | 'somewhat' | 'not really'
  store_accuracy_response TEXT,    -- 'yes' | 'mostly' | 'no'
  reuse_intent            TEXT,    -- 'yes' | 'maybe' | 'no'
  improvement_area        TEXT,    -- 'cheaper options' | 'better substitutions' | 'more meals' | 'better store accuracy' | null

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_user_created
  ON trip_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_rating
  ON trip_feedback (rating) WHERE rating IS NOT NULL;

ALTER TABLE trip_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own trip feedback"
  ON trip_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own trip feedback"
  ON trip_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage trip feedback"
  ON trip_feedback FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS trip_feedback_rows FROM trip_feedback;
