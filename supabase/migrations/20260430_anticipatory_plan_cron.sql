-- ============================================================
-- Snippd — Anticipatory Plan pg_cron Job
-- Migration: 20260430_anticipatory_plan_cron.sql
-- Idempotent: safe to re-run
--
-- Schedules the anticipatory-plan Edge Function every Monday
-- at 11:00 UTC (6:00 AM EST / 7:00 AM EDT — user's morning).
--
-- Prerequisites (run ONCE in Dashboard SQL Editor if not set):
--   ALTER DATABASE postgres SET app.supabase_url = 'https://<ref>.supabase.co';
--   ALTER DATABASE postgres SET app.ingest_key   = '<your-INGEST_KEY-secret>';
--
-- Both must also be set as Edge Function secrets in:
--   Dashboard → Edge Functions → anticipatory-plan → Secrets
--     INGEST_KEY = <same secret>
--
-- Verify after apply:
--   SELECT jobid, schedule, command FROM cron.job
--   WHERE jobname = 'anticipatory-plan-monday';
-- ============================================================

DO $$
BEGIN
  -- Guard: skip silently if pg_cron extension is not installed.
  -- Enable it in Dashboard → Database → Extensions → pg_cron.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE NOTICE 'pg_cron not installed — anticipatory-plan cron NOT scheduled. Enable pg_cron in Dashboard first.';
    RETURN;
  END IF;

  -- Guard: skip silently if pg_net is not installed (required for net.http_post).
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE NOTICE 'pg_net not installed — anticipatory-plan cron NOT scheduled. Enable pg_net in Dashboard first.';
    RETURN;
  END IF;

  -- Idempotent: remove any existing schedule before recreating.
  BEGIN
    PERFORM cron.unschedule('anticipatory-plan-monday');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist — safe to ignore
  END;

  -- Schedule: every Monday at 11:00 UTC (6 AM EST / 7 AM EDT).
  -- Cron syntax: minute hour day-of-month month day-of-week
  --   1 = Monday in pg_cron
  PERFORM cron.schedule(
    'anticipatory-plan-monday',
    '0 11 * * 1',
    $$
      SELECT net.http_post(
        url     := current_setting('app.supabase_url') || '/functions/v1/anticipatory-plan',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-ingest-key', current_setting('app.ingest_key')
        ),
        body    := '{}'::jsonb
      )
    $$
  );

  RAISE NOTICE 'anticipatory-plan-monday scheduled: every Monday 11:00 UTC (6 AM EST).';
END;
$$;

-- ── Reflexion agent cron (6-hour self-healing loop) ───────────
-- Add here if not already scheduled by a previous migration.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RETURN;
  END IF;

  -- Only schedule reflexion-agent if not already present
  IF NOT EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'reflexion-agent-6h'
  ) THEN
    PERFORM cron.schedule(
      'reflexion-agent-6h',
      '0 */6 * * *',
      $$
        SELECT net.http_post(
          url     := current_setting('app.supabase_url') || '/functions/v1/reflexion-agent',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ingest-key', current_setting('app.ingest_key')
          ),
          body    := '{}'::jsonb
        )
      $$
    );
    RAISE NOTICE 'reflexion-agent-6h scheduled.';
  ELSE
    RAISE NOTICE 'reflexion-agent-6h already exists — skipped.';
  END IF;
END;
$$;

-- ── Verify ────────────────────────────────────────────────────
-- Run this query after applying to confirm both jobs are live:
--
-- SELECT jobid, jobname, schedule, active
-- FROM   cron.job
-- WHERE  jobname IN ('anticipatory-plan-monday', 'reflexion-agent-6h');
--
-- Expected output:
--   anticipatory-plan-monday  | 0 11 * * 1 | true
--   reflexion-agent-6h        | 0 */6 * * * | true

SELECT 'anticipatory_plan_cron OK' AS status;
