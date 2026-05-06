-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_verified_stack_constraint
-- Adds 'system_generated_verified' to the verification_status check constraint
-- on app_home_feed so Cloud Run can write verified stacks with this value.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop and recreate the check constraint with the new allowed value
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

-- Add source_type column (used by Cloud Run to tag generated stacks)
ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'MANUAL';

-- Index for fast verified-only queries
CREATE INDEX IF NOT EXISTS idx_app_home_feed_verified
  ON app_home_feed (verification_status, status, savings_percent DESC)
  WHERE status = 'active';

COMMENT ON COLUMN app_home_feed.source_type IS
  'Origin of the stack: MANUAL | SNIPPD_GENERATED | GENIUS_CRAWL';

COMMENT ON COLUMN app_home_feed.verification_status IS
  'Quality gate: verified_live = curated | system_generated_verified = Cloud Run verified';
