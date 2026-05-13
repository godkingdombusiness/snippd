-- Migration: add pantry_item_count to profiles
-- Supports the food decision engine's pantry-fit scoring factor.
-- buildContextFromProfile() reads this column; defaults to 5 if null.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS pantry_item_count integer DEFAULT 5;

COMMENT ON COLUMN profiles.pantry_item_count IS
  'Estimated number of usable pantry items the household has on hand. Updated when user confirms pantry or scans a receipt. Used by decisionEngineService for pantry_fit scoring.';
