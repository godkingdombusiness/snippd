-- Migration 022 — pg_cron: weekly plan cache invalidation
-- Runs every Wednesday at 10:00am ET (15:00 UTC) to coincide with new circular ingestion.
-- Nulls plan_cached_at for all users who have opened the app in the last 30 days.
-- On next app open, get-weekly-plan will rebuild their plan from fresh stack_candidates.
--
-- Requires: pg_cron extension enabled in Supabase Dashboard
-- Run: npx supabase db query --linked -f supabase/migrations/022_plan_rebuild_cron.sql

-- Remove existing job if present (idempotent re-run)
SELECT cron.unschedule('snippd-weekly-plan-rebuild')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-weekly-plan-rebuild'
);

-- Schedule Wednesday 10am ET (15:00 UTC)
SELECT cron.schedule(
  'snippd-weekly-plan-rebuild',
  '0 15 * * 3',
  $$
  UPDATE public.profiles
  SET plan_cached_at = NULL
  WHERE last_app_opened_at >= NOW() - INTERVAL '30 days';
  $$
);
