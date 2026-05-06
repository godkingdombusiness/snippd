-- Profiles: concierge lifestyle, shopping context, transparency, credit gamification flags.
-- Safe re-run: IF NOT EXISTS on columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifestyle_concierge jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_members jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_size integer,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS pets boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopping_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_stores text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shopping_style text,
  ADD COLUMN IF NOT EXISTS meal_prep_habits text,
  ADD COLUMN IF NOT EXISTS waste_sensitivity text,
  ADD COLUMN IF NOT EXISTS transparency_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_completion_credits_awarded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_credit_award_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS household_invite_seats integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.profiles.lifestyle_concierge IS 'Structured concierge preferences (tradeoffs, rhythm, transparency flags) — Intelligence Layer input.';
COMMENT ON COLUMN public.profiles.nutrition_goals IS 'Free-text or canonical nutrition goal labels prioritized by the plan builder.';
COMMENT ON COLUMN public.profiles.household_members IS 'JSON array of household member records (nutrition targets); see 015_nutrition_profile.sql.';
COMMENT ON COLUMN public.profiles.allergies IS 'User-reported allergens; also mirrored into dietary_tags for deal filtering where applicable.';
COMMENT ON COLUMN public.profiles.household_size IS 'Headcount for planning; may mirror count derived from household_members.';
COMMENT ON COLUMN public.profiles.shopping_style IS 'e.g. time_focused | cost_focused | balanced — Intelligence Layer tradeoff signal.';
COMMENT ON COLUMN public.profiles.waste_sensitivity IS 'Free-text or enum label, e.g. produce spoilage concern.';
COMMENT ON COLUMN public.profiles.credits_balance IS 'Gamification balance: welcome credits on profile create, +50 once when user finalizes concierge plan (WeeklyPlanPersonalization), +10 per receipt verify (app-enforced).';
COMMENT ON COLUMN public.profiles.profile_completion_credits_awarded IS 'True after one-time +50 credits when user taps Finalize My Concierge Plan (client: applyProfileCompletionCredits).';
COMMENT ON COLUMN public.profiles.receipt_credit_award_count IS 'Number of times receipt-verify credit (+10) was applied.';

CREATE INDEX IF NOT EXISTS profiles_shopping_style_idx ON public.profiles (shopping_style) WHERE shopping_style IS NOT NULL;
