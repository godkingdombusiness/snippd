-- Migration 017b: Fix ingestion_jobs status constraint + add storage_path unique index
-- Worker uses status='parsed' but constraint only allows: queued, processing, done, failed
-- 2026-04-14

-- Add 'parsed' to the status check constraint
ALTER TABLE public.ingestion_jobs
  DROP CONSTRAINT IF EXISTS ingestion_jobs_status_check;

ALTER TABLE public.ingestion_jobs
  ADD CONSTRAINT ingestion_jobs_status_check
    CHECK (status = ANY (ARRAY[
      'queued'::text,
      'processing'::text,
      'parsed'::text,
      'done'::text,
      'failed'::text
    ]));

-- Add unique index on storage_path so ON CONFLICT works
CREATE UNIQUE INDEX IF NOT EXISTS ingestion_jobs_storage_path_uniq
  ON public.ingestion_jobs (storage_path);

-- Insert the 6 circular files as queued jobs (skip if already present)
INSERT INTO public.ingestion_jobs (storage_path, retailer_key, week_of, source_type, status)
VALUES
  ('publix-2026-04-15-weekly-flyer.pdf',                   'publix',        '2026-04-15', 'pdf_weekly_ad', 'queued'),
  ('aldi-2026-04-14-weekly-flyer.pdf',                     'aldi',          '2026-04-14', 'pdf_weekly_ad', 'queued'),
  ('cvs-2026-04-18-weekly-flyer_compressed.pdf',           'cvs',           '2026-04-18', 'pdf_weekly_ad', 'queued'),
  ('dollargeneral-2026-04-18-weekly-flyer_compressed.pdf', 'dollargeneral', '2026-04-18', 'pdf_weekly_ad', 'queued'),
  ('keyfoods-2026-04-18-weekly-flyer.pdf',                 'keyfoods',      '2026-04-18', 'pdf_weekly_ad', 'queued'),
  ('walgreens-2026-04-18-weekly-flyer.pdf',                'walgreens',     '2026-04-18', 'pdf_weekly_ad', 'queued')
ON CONFLICT (storage_path) DO UPDATE
  SET status = 'queued', error = null, last_error = null, attempts = 0
  WHERE ingestion_jobs.status IN ('failed', 'queued');
