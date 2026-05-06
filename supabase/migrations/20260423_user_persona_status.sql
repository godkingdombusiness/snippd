-- Migration: 20260423_user_persona_status
-- Adds status column to user_persona (NEW → WAITLIST → PAID_BETA → LAUNCHED)
-- Seeds is_beta_live flag into snippd_integrations
-- Run in Supabase Dashboard → SQL Editor

-- ── user_persona.status ────────────────────────────────────────
ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'waitlist', 'paid_beta', 'launched'));

-- Add location column while we're here (used by AgentActivityLog)
ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS location TEXT;

-- Index for fast status lookups (UserStatus gate)
CREATE INDEX IF NOT EXISTS idx_user_persona_status
  ON user_persona (status);

-- ── snippd_integrations: is_beta_live flag ─────────────────────
-- Controlled by the team — when flipped to 'true', PAID_BETA users
-- see FounderDashboard instead of WaitlistScreen.
INSERT INTO snippd_integrations (key, value)
  VALUES ('is_beta_live', 'false')
  ON CONFLICT (key) DO NOTHING;

-- ── Helpful view: active beta users ───────────────────────────
CREATE OR REPLACE VIEW v_beta_users AS
  SELECT
    up.user_id,
    au.email,
    up.status,
    up.mission,
    up.monthly_budget_cents,
    up.onboarding_completed_at,
    up.location,
    up.style_vibe,
    up.clothing_size
  FROM user_persona up
  JOIN auth.users au ON au.id = up.user_id
  WHERE up.status IN ('paid_beta', 'launched');

-- RLS: service_role only on the view (handled by underlying table RLS)
