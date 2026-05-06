-- ============================================================
-- Migration: 20260420_ingestion_production_hardening.sql
--
-- Makes the PDF-upload → stack_candidates pipeline fully
-- automatic and production-ready.
--
-- Changes:
--   1. Storage trigger: fires worker immediately via pg_net
--      on every PDF upload (no more waiting for cron)
--   2. Stuck-job recovery: pg_cron resets any job stuck in
--      'processing' for > 5 min back to 'queued'
--   3. Ingestion cron: 30 min → 5 min schedule
--   4. Expired-deal cleanup: daily cron deactivates
--      stack_candidates past their valid_to date
-- ============================================================


-- ── 1. Update storage trigger to ALSO call the worker via pg_net ──
--
-- The trigger already creates the ingestion_jobs row.
-- Now it also fires the worker immediately so the job
-- processes within seconds of the PDF landing in storage,
-- rather than waiting up to 30 min for the cron.
--
-- Uses the same vault secrets as all other Snippd crons:
--   snippd_functions_url  →  https://<ref>.supabase.co/functions/v1
--   snippd_cron_secret    →  must match CRON_SECRET Edge Function secret

CREATE OR REPLACE FUNCTION handle_pdf_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_row       record;
  functions_url text;
  cron_secret   text;
BEGIN
  -- Only act on the deal-pdfs bucket, PDF files only
  IF NEW.bucket_id != 'deal-pdfs' THEN RETURN NEW; END IF;
  IF NEW.name NOT ILIKE '%.pdf'   THEN RETURN NEW; END IF;

  -- Parse filename into job fields
  SELECT * INTO job_row
  FROM storage_path_to_job(NEW.name)
  LIMIT 1;

  IF job_row IS NULL THEN
    RAISE WARNING '[handle_pdf_upload] Unparseable path: %', NEW.name;
    RETURN NEW;
  END IF;

  -- Upsert the job (creates on first upload, resets on re-upload)
  INSERT INTO ingestion_jobs (
    retailer_key, week_of, storage_path, source_type, status, attempts
  )
  VALUES (
    job_row.retailer_key, job_row.week_of,
    NEW.name, job_row.source_type,
    'queued', 0
  )
  ON CONFLICT (storage_path) DO UPDATE
    SET status     = 'queued',
        attempts   = 0,
        error      = NULL,
        updated_at = now()
  WHERE ingestion_jobs.status IN ('failed', 'parsed', 'done');

  -- Fire the worker immediately via pg_net
  -- Fall back gracefully if vault secrets are not yet configured
  BEGIN
    SELECT decrypted_secret INTO functions_url
    FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url';

    SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret';

    IF functions_url IS NOT NULL AND cron_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url     := functions_url || '/run-ingestion-worker',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'x-cron-secret', cron_secret
        ),
        body    := jsonb_build_object(
          'source',       'storage_trigger',
          'storage_path', NEW.name
        )
      );
      RAISE LOG '[handle_pdf_upload] Worker triggered for %', NEW.name;
    ELSE
      RAISE WARNING '[handle_pdf_upload] Vault secrets not set — cron will pick up job for %', NEW.name;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net failure must never block the upload
    RAISE WARNING '[handle_pdf_upload] pg_net call failed: % — cron will handle %', SQLERRM, NEW.name;
  END;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (DROP + CREATE to pick up the new function body)
DROP TRIGGER IF EXISTS on_pdf_upload ON storage.objects;
CREATE TRIGGER on_pdf_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_pdf_upload();


-- ── 2. Stuck-job recovery ─────────────────────────────────────
--
-- Jobs left in 'processing' after the 150s Edge Function timeout
-- are never retried without this. Reset them to 'queued' every
-- 6 minutes so the next cron run picks them up automatically.

SELECT cron.unschedule('snippd-ingestion-stuck-recovery')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-ingestion-stuck-recovery'
);

SELECT cron.schedule(
  'snippd-ingestion-stuck-recovery',
  '*/6 * * * *',
  $$
  UPDATE ingestion_jobs
  SET    status     = 'queued',
         updated_at = now()
  WHERE  status     = 'processing'
    AND  updated_at < now() - INTERVAL '5 minutes'
    AND  attempts   < 5;
  $$
);


-- ── 3. Speed up ingestion cron: 30 min → 5 min ───────────────
--
-- With MAX_JOBS=1 and 5-min cadence, a single uploaded PDF
-- starts processing within 5 minutes of upload (or immediately
-- if the storage trigger's pg_net call succeeds).

SELECT cron.unschedule('snippd-ingestion-worker');

SELECT cron.schedule(
  'snippd-ingestion-worker',
  '*/5 * * * *',
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


-- ── 4. Daily expired-deal cleanup ────────────────────────────
--
-- Deactivate stack_candidates whose valid_to has passed.
-- Runs at 1 AM every day.

SELECT cron.unschedule('snippd-deal-expiry-cleanup')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-deal-expiry-cleanup'
);

SELECT cron.schedule(
  'snippd-deal-expiry-cleanup',
  '0 1 * * *',
  $$
  UPDATE stack_candidates
  SET    is_active = false
  WHERE  is_active = true
    AND  valid_to  IS NOT NULL
    AND  valid_to  < CURRENT_DATE;
  $$
);


-- ── Verify ───────────────────────────────────────────────────

SELECT jobname, schedule, active
FROM   cron.job
WHERE  jobname LIKE 'snippd-ingestion%'
    OR jobname = 'snippd-deal-expiry-cleanup'
ORDER  BY jobname;
