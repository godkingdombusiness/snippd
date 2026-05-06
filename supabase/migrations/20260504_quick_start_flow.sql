-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260504_quick_start_flow
-- Adds Quick Start, Instant Forecast, Soft Personalization, and Unlock Beta
-- columns to user_persona and profiles.
--
-- SAFE: ADD COLUMN IF NOT EXISTS throughout. No existing columns modified.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── user_persona additions ────────────────────────────────────────────────────

ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS quick_start_completed   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_start_budget_range TEXT,      -- e.g. '75-125'
  ADD COLUMN IF NOT EXISTS quick_start_goal         TEXT,      -- e.g. 'save_money'
  ADD COLUMN IF NOT EXISTS quick_start_household    SMALLINT,  -- 1 / 2 / 4 / 6
  ADD COLUMN IF NOT EXISTS beta_unlocked            BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_unlocked           BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_source            TEXT;      -- 'promo' | 'stripe_beta_pro' | 'stripe_founder'

-- ── profiles additions ────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_completion_percent  NUMERIC   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progressive_profile         JSONB     NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_profile_prompt_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_profile_prompt_key     TEXT;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_persona_quick_start
  ON user_persona (user_id) WHERE quick_start_completed = true;

CREATE INDEX IF NOT EXISTS idx_user_persona_beta_unlocked
  ON user_persona (user_id) WHERE beta_unlocked = true;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM user_persona WHERE quick_start_completed = true) AS qs_completed,
  (SELECT COUNT(*) FROM user_persona WHERE beta_unlocked = true)         AS beta_unlocked,
  (SELECT COUNT(*) FROM profiles   WHERE profile_completion_percent > 0) AS profiles_with_pct;
