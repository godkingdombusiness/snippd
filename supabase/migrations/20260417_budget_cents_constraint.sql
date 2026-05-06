-- Migration: Enforce profiles.weekly_budget as INTEGER in cents.
-- The column has always stored cents (e.g. 15000 = $150.00) but the type
-- may have been created as NUMERIC or without a constraint.  This migration:
--   1. Casts the column to INTEGER (safe — values are already whole numbers).
--   2. Adds a CHECK constraint (>= 0).
--   3. Sets DEFAULT 15000 ($150.00/week).
--   4. Adds a COMMENT so future developers know the unit.
--
-- Safe to re-run: the IF NOT EXISTS guards prevent duplicate constraints.

-- Step 1: ensure column is integer type
-- ALTER COLUMN TYPE requires no data loss because all values are whole numbers.
ALTER TABLE public.profiles
  ALTER COLUMN weekly_budget TYPE integer USING COALESCE(weekly_budget::integer, 15000);

-- Step 2: set default
ALTER TABLE public.profiles
  ALTER COLUMN weekly_budget SET DEFAULT 15000;

-- Step 3: add CHECK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_weekly_budget_non_negative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_weekly_budget_non_negative CHECK (weekly_budget >= 0);
  END IF;
END $$;

-- Step 4: document the unit
COMMENT ON COLUMN public.profiles.weekly_budget IS
  'Weekly grocery budget stored in cents (integer). 15000 = $150.00. '
  'Never store dollars here. UI divides by 100 for display.';

-- Backfill NULL values to the default
UPDATE public.profiles
SET weekly_budget = 15000
WHERE weekly_budget IS NULL;
