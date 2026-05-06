-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260501_trip_feedback
-- Creates trip_feedback table for post-trip micro-survey + savings action data.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_feedback (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store                   TEXT,
  planned_total_cents     INTEGER DEFAULT 0,
  receipt_total_cents     INTEGER DEFAULT 0,
  verified_savings_cents  INTEGER DEFAULT 0,
  coupons_clipped         INTEGER DEFAULT 0,
  plan_followed_pct       NUMERIC(5,2) DEFAULT 0,
  rating                  TEXT CHECK (rating IN ('perfect','good','okay','frustrating')),
  issue                   TEXT,
  savings_action          TEXT CHECK (savings_action IN ('savings','bill','credit_card','donate','split')),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_user_id ON trip_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_feedback_created ON trip_feedback(created_at DESC);

-- RLS
ALTER TABLE trip_feedback ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'trip_feedback' AND policyname = 'trip_feedback_self'
  ) THEN
    EXECUTE $p$
      CREATE POLICY "trip_feedback_self" ON trip_feedback
        FOR ALL USING (auth.uid() = user_id)
    $p$;
  END IF;
END $$;

COMMENT ON TABLE trip_feedback IS
  'Post-trip micro-survey: rating, issue, savings action. One row per trip feedback submission.';
