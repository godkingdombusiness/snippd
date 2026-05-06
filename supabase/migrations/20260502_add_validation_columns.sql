-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_add_validation_columns
-- Adds validation_status, source_type, is_active to app_home_feed.
-- These are the three columns the HomeScreen spec uses for verified-only display.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add columns
ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS validation_status TEXT DEFAULT 'system_generated_verified';

ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'SNIPPD_GENERATED';

ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Populate from current status for all existing rows
UPDATE app_home_feed
SET
  validation_status = 'system_generated_verified',
  source_type       = 'SNIPPD_GENERATED',
  is_active         = (status = 'active');

-- 3. Add check constraint on the new column (separate from verification_status)
ALTER TABLE app_home_feed
  DROP CONSTRAINT IF EXISTS chk_validation_status;

ALTER TABLE app_home_feed
  ADD CONSTRAINT chk_validation_status
  CHECK (validation_status IN ('system_generated_verified', 'pending_review', 'rejected'));

-- 4. Also update the existing verification_status constraint to include new value
ALTER TABLE app_home_feed
  DROP CONSTRAINT IF EXISTS chk_app_home_feed_verification_status;

ALTER TABLE app_home_feed
  ADD CONSTRAINT chk_app_home_feed_verification_status
  CHECK (verification_status IN (
    'pending',
    'verified_live',
    'rejected',
    'system_generated_verified'
  ));

-- 5. Also add source_type constraint
ALTER TABLE app_home_feed
  DROP CONSTRAINT IF EXISTS chk_source_type;

ALTER TABLE app_home_feed
  ADD CONSTRAINT chk_source_type
  CHECK (source_type IN ('SNIPPD_GENERATED', 'MANUAL', 'GENIUS_CRAWL', 'VERTEX_AI'));

-- 6. Fast index for the new verified-only query pattern
CREATE INDEX IF NOT EXISTS idx_app_home_feed_triple_gate
  ON app_home_feed (validation_status, source_type, is_active, savings_percent DESC)
  WHERE is_active = true;

-- 7. Verify
SELECT
  COUNT(*) FILTER (WHERE is_active = true AND validation_status = 'system_generated_verified') AS verified_active,
  COUNT(*) FILTER (WHERE is_active = false) AS inactive,
  COUNT(*) AS total
FROM app_home_feed;
