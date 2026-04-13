-- ============================================================
-- Weekly Refresh Schedule
-- Sets up pg_cron jobs to call the weekly-refresh Edge Function
-- on Sundays and Wednesdays at 06:00 UTC.
--
-- HOW TO RUN:
--   Paste this into the Supabase SQL Editor and click Run.
--   Requires the pg_cron extension (enabled in Supabase by default).
--
-- AFTER RUNNING:
--   1. Deploy the weekly-refresh Edge Function:
--        supabase functions deploy weekly-refresh
--   2. Set the secret in Supabase Dashboard → Edge Functions → Secrets:
--        WEEKLY_REFRESH_CRON_SECRET  →  <generate a random 32-char string>
--   3. Replace <YOUR_CRON_SECRET> and <YOUR_PROJECT_REF> below before running.
-- ============================================================

-- ── Enable pg_cron if not already active ────────────────────────────────────
create extension if not exists pg_cron;

-- ── cron_audit_log table (idempotent) ───────────────────────────────────────
create table if not exists cron_audit_log (
  id          bigserial primary key,
  job_name    text        not null,
  triggered_by text       not null default 'pg_cron',
  result      text,
  ran_at      timestamptz not null default now()
);

-- ── home_payload_cache table (idempotent) ───────────────────────────────────
create table if not exists home_payload_cache (
  cache_key   text primary key,
  payload     jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

-- ── Helper RPC: reset chef_stash_weekly_uses for ALL users on Sundays ───────
create or replace function reset_weekly_chef_uses()
returns void
language plpgsql
security definer
as $$
begin
  update profiles
  set preferences = jsonb_set(
    coalesce(preferences, '{}'::jsonb),
    '{chef_stash_weekly_uses}',
    '0'::jsonb
  );
end;
$$;

-- ── Ensure profiles has last_budget_update column ───────────────────────────
alter table profiles add column if not exists last_budget_update timestamptz;

-- ── pg_cron jobs ─────────────────────────────────────────────────────────────
-- Replace the two placeholders before running:
--   <YOUR_CRON_SECRET>  : value of WEEKLY_REFRESH_CRON_SECRET secret
--   <YOUR_PROJECT_REF>  : your Supabase project ref (e.g. xyzcompanyref)

-- Remove old jobs if they exist (safe to re-run)
select cron.unschedule('snippd-weekly-refresh-sunday')  where exists (select 1 from cron.job where jobname = 'snippd-weekly-refresh-sunday');
select cron.unschedule('snippd-weekly-refresh-wednesday') where exists (select 1 from cron.job where jobname = 'snippd-weekly-refresh-wednesday');

-- Sunday 06:00 UTC
select cron.schedule(
  'snippd-weekly-refresh-sunday',
  '0 6 * * 0',
  $$
  select net.http_post(
    url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/weekly-refresh',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<YOUR_CRON_SECRET>"}',
    body    := '{"triggered_by":"pg_cron_sunday"}'
  );
  $$
);

-- Wednesday 06:00 UTC
select cron.schedule(
  'snippd-weekly-refresh-wednesday',
  '0 6 * * 3',
  $$
  select net.http_post(
    url     := 'https://<YOUR_PROJECT_REF>.supabase.co/functions/v1/weekly-refresh',
    headers := '{"Content-Type":"application/json","x-cron-secret":"<YOUR_CRON_SECRET>"}',
    body    := '{"triggered_by":"pg_cron_wednesday"}'
  );
  $$
);

-- ── Verify scheduled jobs ────────────────────────────────────────────────────
select jobname, schedule, command from cron.job
where jobname like 'snippd-%';
