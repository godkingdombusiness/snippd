-- ============================================================
-- Streak tracking + user achievements
-- Run via Supabase Dashboard → SQL Editor
-- All statements are idempotent — safe to re-run
-- ============================================================

-- ── Streak columns on profiles ───────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS savings_streak_weeks  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS longest_streak_weeks  integer      NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_streak_week      text,          -- ISO week 'YYYY-Www'
  ADD COLUMN IF NOT EXISTS streak_shield_count   integer      NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS streak_updated_at     timestamptz;

COMMENT ON COLUMN public.profiles.savings_streak_weeks IS
  'Consecutive weeks with at least one verified receipt. Resets to 1 on a missed week (unless a shield is consumed).';
COMMENT ON COLUMN public.profiles.longest_streak_weeks IS
  'All-time record streak length for this user.';
COMMENT ON COLUMN public.profiles.last_streak_week IS
  'ISO week string (YYYY-Www) of the last week a receipt was verified. Used to detect continuity.';
COMMENT ON COLUMN public.profiles.streak_shield_count IS
  'Number of Streak Shields held. Each shield absorbs one missed week. Max 5. Starts at 1 (welcome gift).';

-- ── user_achievements ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_achievements (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_key  text        NOT NULL,
  earned_at  timestamptz NOT NULL DEFAULT now(),
  metadata   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (user_id, badge_key)
);

CREATE INDEX IF NOT EXISTS user_achievements_user_idx
  ON public.user_achievements (user_id, earned_at DESC);

ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "users_read_own_achievements" ON public.user_achievements
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "service_role_manage_achievements" ON public.user_achievements
    FOR ALL USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

SELECT 'streak_achievements OK' AS status;
