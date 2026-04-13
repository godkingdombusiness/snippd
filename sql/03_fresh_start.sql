-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — fn_close_week: Atomic week-close after a verified trip
-- Resets weekly_spent, compounds lifetime savings, updates streak, awards credits.
-- Called from lib/freshStart.js via supabase.rpc('close_week', { p_user_id })
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.close_week(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile         profiles%ROWTYPE;
  v_savings_this_week bigint;
  v_new_lifetime    bigint;
  v_new_streak      int;
  v_streak_broken   bool;
  v_credits_awarded int := 10;
  v_level_before    int;
  v_level_after     int;
  v_leveled_up      bool := false;
BEGIN
  -- Lock the profile row for this operation
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
  END IF;

  -- Savings this week = whatever was tracked in weekly_spent savings column
  -- We store this as the delta between budget and spent
  v_savings_this_week := COALESCE(v_profile.savings_total, 0);

  -- Compound into lifetime
  v_new_lifetime := COALESCE(v_profile.lifetime_savings_cents, 0) + v_savings_this_week;

  -- Streak logic: if last trip was within 8 days, streak continues; else resets to 1
  v_streak_broken := (
    v_profile.last_streak_at IS NULL OR
    (CURRENT_DATE - v_profile.last_streak_at) > 8
  );
  v_new_streak := CASE
    WHEN v_streak_broken THEN 1
    ELSE COALESCE(v_profile.streak_count, 0) + 1
  END;

  -- Level thresholds (in cents): mirrors the JS LEVELS array in WinsScreen
  v_level_before := CASE
    WHEN COALESCE(v_profile.lifetime_savings_cents, 0) < 10000  THEN 1
    WHEN COALESCE(v_profile.lifetime_savings_cents, 0) < 25000  THEN 2
    WHEN COALESCE(v_profile.lifetime_savings_cents, 0) < 50000  THEN 3
    WHEN COALESCE(v_profile.lifetime_savings_cents, 0) < 100000 THEN 4
    ELSE 5
  END;

  v_level_after := CASE
    WHEN v_new_lifetime < 10000  THEN 1
    WHEN v_new_lifetime < 25000  THEN 2
    WHEN v_new_lifetime < 50000  THEN 3
    WHEN v_new_lifetime < 100000 THEN 4
    ELSE 5
  END;

  v_leveled_up := v_level_after > v_level_before;

  -- Atomic update: reset weekly, compound lifetime, update streak, award credits
  UPDATE public.profiles SET
    weekly_spent         = 0,
    savings_total        = 0,
    lifetime_savings_cents = v_new_lifetime,
    streak_count         = v_new_streak,
    last_streak_at       = CURRENT_DATE,
    stash_credits        = COALESCE(stash_credits, 0) + v_credits_awarded,
    trips_verified       = COALESCE(trips_verified, 0) + 1,
    updated_at           = now()
  WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'success',           true,
    'savings_this_week', v_savings_this_week,
    'lifetime_savings',  v_new_lifetime,
    'streak',            v_new_streak,
    'streak_broken',     v_streak_broken,
    'credits_awarded',   v_credits_awarded,
    'leveled_up',        v_leveled_up,
    'level_before',      v_level_before,
    'level_after',       v_level_after
  );
END;
$$;

COMMENT ON FUNCTION public.close_week IS
  'Atomic week-close: resets weekly_spent, compounds lifetime savings, manages streak, awards 10 Stash Credits.';
