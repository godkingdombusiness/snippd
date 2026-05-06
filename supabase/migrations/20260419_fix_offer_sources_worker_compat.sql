-- ============================================================
-- Migration: 20260419_fix_offer_sources_worker_compat.sql
-- Fix offer_sources schema so the ingestion worker can upsert:
--   1. Give source_type a default so worker inserts don't fail
--      on the NOT NULL constraint when source_type is omitted.
--   2. Add a UNIQUE index on dedupe_key alone (WHERE NOT NULL)
--      so the worker's onConflict:'dedupe_key' resolves correctly
--      instead of the composite (retailer_id, dedupe_key) index.
-- ============================================================

-- 1. Give source_type a sensible default so omitting it is safe
ALTER TABLE offer_sources
  ALTER COLUMN source_type SET DEFAULT 'flyer';

-- 2. Deduplicate: keep only the most-recently-updated row per dedupe_key
--    so we can create a unique index without conflicts
DELETE FROM offer_sources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY dedupe_key
             ORDER BY updated_at DESC, created_at DESC
           ) AS rn
    FROM offer_sources
    WHERE dedupe_key IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 3. Add a partial unique index on dedupe_key alone
--    (partial so null dedupe_keys don't conflict with each other)
CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_sources_dedupe_key
  ON offer_sources (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
