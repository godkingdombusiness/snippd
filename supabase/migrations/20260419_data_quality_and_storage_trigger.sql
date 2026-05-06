-- ============================================================
-- Migration: 20260419_data_quality_and_storage_trigger.sql
--
-- PART 1 — Data quality fixes on stack_candidates
--   1a. Normalize all category values to lowercase
--   1b. Normalize meal_type derived from category
--   1c. Deactivate BOGO rows with base_price = 0 (no price data)
--   1d. Re-score rows where sale_savings > 0 but score is still 0.20
--
-- PART 2 — Storage trigger
--   Fires when a .pdf is uploaded to the deal-pdfs bucket.
--   Parses filename format: retailer-YYYY-MM-DD-type.pdf
--   Upserts into ingestion_jobs so the worker picks it up.
-- ============================================================

-- ── PART 1a: Normalize categories to lowercase ────────────────

UPDATE stack_candidates
SET
  category      = LOWER(category),
  primary_category = LOWER(primary_category)
WHERE category != LOWER(category)
   OR primary_category != LOWER(primary_category);

-- ── PART 1b: Fix meal_type now that categories are lowercase ──

UPDATE stack_candidates
SET meal_type = CASE LOWER(category)
  WHEN 'meat'      THEN 'dinner'
  WHEN 'seafood'   THEN 'dinner'
  WHEN 'produce'   THEN 'dinner'
  WHEN 'dairy'     THEN 'breakfast'
  WHEN 'breakfast' THEN 'breakfast'
  WHEN 'bakery'    THEN 'breakfast'
  WHEN 'deli'      THEN 'lunch'
  ELSE 'mixed'
END
WHERE meal_type != CASE LOWER(category)
  WHEN 'meat'      THEN 'dinner'
  WHEN 'seafood'   THEN 'dinner'
  WHEN 'produce'   THEN 'dinner'
  WHEN 'dairy'     THEN 'breakfast'
  WHEN 'breakfast' THEN 'breakfast'
  WHEN 'bakery'    THEN 'breakfast'
  WHEN 'deli'      THEN 'lunch'
  ELSE 'mixed'
END;

-- ── PART 1c: Deactivate unpriced BOGOs (no useful data) ──────

UPDATE stack_candidates
SET is_active = false
WHERE is_bogo = true
  AND base_price = 0
  AND sale_savings = 0;

-- ── PART 1d: Re-score rows that now have corrected categories ─
-- Items with only a sale price and no regular_price get 0.15
-- (honest — we know the price but not the savings).
-- Items where sale_savings > 0 get a proper percentage score.

UPDATE stack_candidates
SET stack_rank_score = CASE
  WHEN is_bogo
    THEN 0.85
  WHEN sale_savings > 0 AND base_price > 0
    THEN LEAST(0.80, 0.10 + (sale_savings / base_price) * 0.70)
  WHEN has_coupon
    THEN 0.65
  WHEN base_price > 0
    THEN 0.15   -- known price, unknown savings
  ELSE 0.10
END
WHERE is_active = true
  AND retailer_key IN ('keyfoods','walgreens','aldi');

-- ── Verification snapshot ─────────────────────────────────────

SELECT
  retailer_key,
  COUNT(*)                                              AS active_deals,
  COUNT(CASE WHEN sale_savings > 0 THEN 1 END)         AS with_savings,
  COUNT(CASE WHEN is_bogo THEN 1 END)                   AS bogos,
  COUNT(CASE WHEN meal_type = 'dinner' THEN 1 END)      AS dinner_items,
  COUNT(CASE WHEN meal_type = 'breakfast' THEN 1 END)   AS breakfast_items,
  COUNT(CASE WHEN meal_type = 'lunch' THEN 1 END)       AS lunch_items,
  ROUND(AVG(stack_rank_score)::numeric, 2)              AS avg_score
FROM stack_candidates
WHERE is_active = true
  AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
GROUP BY retailer_key
ORDER BY active_deals DESC;


-- ============================================================
-- PART 2 — Storage trigger: PDF upload → ingestion_jobs
-- ============================================================

-- Helper function: parse retailer-YYYY-MM-DD-type.pdf filenames
CREATE OR REPLACE FUNCTION storage_path_to_job(storage_path text)
RETURNS TABLE (
  retailer_key text,
  week_of      date,
  source_type  text
)
LANGUAGE plpgsql
AS $$
DECLARE
  filename   text;
  parts      text[];
  type_map   jsonb := '{
    "weekly-flyer":  "pdf_weekly_ad",
    "weekly":        "pdf_weekly_ad",
    "flyer":         "pdf_weekly_ad",
    "extra-savings": "pdf_extra_savings",
    "extra":         "pdf_extra_savings",
    "bogo":          "pdf_bogo",
    "coupons":       "pdf_extra_savings"
  }'::jsonb;
  raw_type   text;
BEGIN
  -- Strip folder prefix if present, take only filename
  filename := regexp_replace(storage_path, '^.+/', '');
  -- Remove .pdf extension
  filename := regexp_replace(filename, '\.pdf$', '', 'i');

  -- Match flat format: retailer-YYYY-MM-DD-type  (e.g. publix-2026-04-16-weekly-flyer)
  IF filename ~ '^([a-z_]+)-(\d{4}-\d{2}-\d{2})-(.+)$' THEN
    parts      := regexp_match(filename, '^([a-z_]+)-(\d{4}-\d{2}-\d{2})-(.+)$');
    raw_type   := parts[3];

    retailer_key := parts[1];
    week_of      := parts[2]::date;
    source_type  := COALESCE(type_map ->> raw_type, 'pdf_weekly_ad');
    RETURN NEXT;
    RETURN;
  END IF;

  -- Match legacy folder format: retailer/YYYY-MM-DD/type.pdf
  IF storage_path ~ '^([^/]+)/(\d{4}-\d{2}-\d{2})/(.+)$' THEN
    parts      := regexp_match(storage_path, '^([^/]+)/(\d{4}-\d{2}-\d{2})/(.+)$');
    raw_type   := parts[3];

    retailer_key := parts[1];
    week_of      := parts[2]::date;
    source_type  := COALESCE(type_map ->> raw_type, 'pdf_weekly_ad');
    RETURN NEXT;
    RETURN;
  END IF;

  -- Unparseable — return nothing (trigger will skip)
END;
$$;

-- Trigger function: runs after a new object is inserted in storage
CREATE OR REPLACE FUNCTION handle_pdf_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_row record;
BEGIN
  -- Only act on the deal-pdfs bucket
  IF NEW.bucket_id != 'deal-pdfs' THEN
    RETURN NEW;
  END IF;

  -- Only act on PDF files
  IF NEW.name NOT ILIKE '%.pdf' THEN
    RETURN NEW;
  END IF;

  -- Parse the filename into job fields
  SELECT * INTO job_row
  FROM storage_path_to_job(NEW.name)
  LIMIT 1;

  IF job_row IS NULL THEN
    RAISE WARNING '[handle_pdf_upload] Could not parse storage path: %', NEW.name;
    RETURN NEW;
  END IF;

  -- Upsert into ingestion_jobs
  -- ON CONFLICT on storage_path means re-uploading the same PDF
  -- resets the job to queued so it re-processes cleanly.
  INSERT INTO ingestion_jobs (
    retailer_key,
    week_of,
    storage_path,
    source_type,
    status,
    attempts
  )
  VALUES (
    job_row.retailer_key,
    job_row.week_of,
    NEW.name,
    job_row.source_type,
    'queued',
    0
  )
  ON CONFLICT (storage_path) DO UPDATE
    SET status   = 'queued',
        attempts = 0,
        error    = NULL,
        updated_at = now()
  WHERE ingestion_jobs.status IN ('failed', 'parsed', 'done');
  -- ^ Don't reset a job that's currently processing or already queued

  RAISE LOG '[handle_pdf_upload] Queued ingestion job for %  retailer=% week=%',
    NEW.name, job_row.retailer_key, job_row.week_of;

  RETURN NEW;
END;
$$;

-- Attach trigger to storage.objects
DROP TRIGGER IF EXISTS on_pdf_upload ON storage.objects;

CREATE TRIGGER on_pdf_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_pdf_upload();

-- Confirm trigger is live
SELECT
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_pdf_upload';
