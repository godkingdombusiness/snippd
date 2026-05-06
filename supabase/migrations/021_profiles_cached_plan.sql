-- Migration 021: Add cached_weekly_plan columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cached_weekly_plan jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_cached_at timestamptz DEFAULT NULL;
