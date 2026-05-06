-- ============================================================
-- Migration: 20260415_publix_esf_cron.sql
-- Purpose: pg_cron job to trigger ingest-publix-esf edge function
--          every Wednesday and Saturday at 9:00 AM ET (14:00 UTC).
-- ============================================================

-- Unschedule existing job if present (idempotent)
SELECT cron.unschedule('snippd-publix-esf-ingest')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-publix-esf-ingest'
);

-- Wednesday 14:00 UTC (9:00 AM ET)
SELECT cron.schedule(
  'snippd-publix-esf-ingest-wed',
  '0 14 * * 3',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/ingest-publix-esf',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', current_setting('app.ingest_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Saturday 14:00 UTC (9:00 AM ET)
SELECT cron.schedule(
  'snippd-publix-esf-ingest-sat',
  '0 14 * * 6',
  $$
  SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/ingest-publix-esf',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-ingest-key', current_setting('app.ingest_key')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- NOTE: You must set these in the Dashboard SQL Editor before cron fires:
-- ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
-- ALTER DATABASE postgres SET app.ingest_key = 'YOUR_INGEST_KEY_SECRET';
