-- ============================================================
-- Migration: 20260420_ingestion_file_uri_cache.sql
--
-- Adds gemini_file_uri to ingestion_jobs so the worker can
-- reuse a previously-uploaded Gemini Files API URI on retries
-- instead of re-downloading and re-uploading the PDF each time.
--
-- The Gemini Files API keeps files for 48 hours, so any job
-- that has been retrying for less than 2 days can skip the
-- upload step entirely and go straight to generateContent.
-- ============================================================

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS gemini_file_uri text;

COMMENT ON COLUMN ingestion_jobs.gemini_file_uri IS
  'Cached Gemini Files API URI (files/abc123). Populated on first upload for PDFs > 3MB. Valid for 48h. Lets retries skip the re-upload step.';
