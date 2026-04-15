-- ============================================================
-- Snippd — Background Jobs via pg_cron + Vault
-- 003_pg_cron_jobs.sql
-- Idempotent: safe to re-run
--
-- Secrets (stored once in vault.secrets, never in DB params):
--   snippd_functions_url  — Edge Functions base URL
--   snippd_cron_secret    — x-cron-secret header value
--
-- Store via SQL editor if not already present:
--   SELECT vault.create_secret(
--     'https://<ref>.supabase.co/functions/v1',
--     'snippd_functions_url',
--     'Snippd Edge Functions base URL for pg_cron'
--   );
--   SELECT vault.create_secret(
--     '<hex-secret>',
--     'snippd_cron_secret',
--     'Snippd x-cron-secret header value for Edge Function auth'
--   );
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Remove existing schedules (idempotent) ───────────────────
DO $$ BEGIN PERFORM cron.unschedule('snippd-preference-updater'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('snippd-graph-sync');         EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('snippd-wealth-check');       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('snippd-rate-limit-cleanup'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 1. Preference Updater — every hour at :05 ────────────────
SELECT cron.schedule(
  'snippd-preference-updater',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-preference-updater',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);

-- ── 2. Graph Sync — daily at 01:50 UTC ───────────────────────
SELECT cron.schedule(
  'snippd-graph-sync',
  '50 1 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-graph-sync',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);

-- ── 3. Wealth Check — daily at 04:00 UTC ─────────────────────
SELECT cron.schedule(
  'snippd-wealth-check',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-wealth-check',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);

-- ── 4. Rate Limit Log Cleanup — daily at 05:00 UTC ───────────
-- Pure SQL — no Edge Function needed.
SELECT cron.schedule(
  'snippd-rate-limit-cleanup',
  '0 5 * * *',
  $$
  DELETE FROM public.api_rate_limit_log
  WHERE request_at < now() - INTERVAL '2 hours'
  $$
);
