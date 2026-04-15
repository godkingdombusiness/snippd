-- ============================================================
-- Snippd — Ingestion Cron Jobs
-- 008_ingestion_cron.sql
-- Idempotent: safe to re-run
--
-- Adds two pg_cron jobs:
--   1. snippd-ingestion-worker  — every 30 min, processes queued ingestion_jobs
--   2. snippd-circular-reminder — every Tuesday at 14:00 UTC, emails circular upload reminder
--
-- Prerequisites: vault secrets 'snippd_functions_url' + 'snippd_cron_secret' already set
-- (see 003_pg_cron_jobs.sql for vault setup instructions)
-- ============================================================

-- ── Remove existing schedules (idempotent) ───────────────────
DO $$ BEGIN PERFORM cron.unschedule('snippd-ingestion-worker');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('snippd-circular-reminder'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── 1. Ingestion Worker — every 30 minutes ───────────────────
--    Fires run-ingestion-worker which processes up to 3 queued jobs
SELECT cron.schedule(
  'snippd-ingestion-worker',
  '*/30 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-ingestion-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);

-- ── 2. Circular Reminder — every Tuesday at 14:00 UTC ────────
--    Queues a reminder email to upload the week's circular
--    Inserts to email_alert_queue which is processed by a separate mailer
SELECT cron.schedule(
  'snippd-circular-reminder',
  '0 14 * * 2',
  $$
  INSERT INTO public.email_alert_queue (
    alert_type,
    recipient_email,
    subject,
    body,
    metadata,
    created_at
  )
  SELECT
    'circular_reminder',
    'dina@getsnippd.com',
    'Snippd — Weekly Circular Upload Reminder',
    'This is your weekly reminder to upload new store circulars for the upcoming week. Log into Snippd Admin → Circular Upload to get started.',
    jsonb_build_object(
      'week_of',       to_char(date_trunc('week', NOW() + INTERVAL '1 week'), 'YYYY-MM-DD'),
      'triggered_at',  to_char(NOW(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
    ),
    NOW()
  WHERE NOT EXISTS (
    SELECT 1 FROM public.email_alert_queue
    WHERE alert_type = 'circular_reminder'
      AND created_at > NOW() - INTERVAL '7 days'
  )
  $$
);
