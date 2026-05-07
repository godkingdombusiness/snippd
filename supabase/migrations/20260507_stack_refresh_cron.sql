-- 20260507_stack_refresh_cron.sql
-- Daily cron: call run-stack-refresh edge function at 7:15 AM EDT (11:15 UTC).
-- Requires pg_cron + pg_net extensions enabled in Supabase Dashboard.
-- CRON_SECRET and SUPABASE_URL must be set as Vault secrets.

-- Remove stale job if it exists from any prior migration attempt
SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname = 'daily-stack-refresh'
   AND jobid IS NOT NULL;

SELECT cron.schedule(
  'daily-stack-refresh',
  '15 11 * * *',   -- 11:15 UTC = 7:15 AM EDT
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/run-stack-refresh',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-ingest-key', current_setting('app.cron_secret')
      ),
      body    := '{}'
    );
  $$
);
