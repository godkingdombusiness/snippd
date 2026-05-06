-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260503_scanned_products
-- Adds: scanned_products table + dietary/allergy columns to user_preferences
--
-- SAFE: Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS on everything.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. scanned_products ───────────────────────────────────────────────────────
-- Barcode lookup cache. Populated by lookup-barcode Edge Function.
-- source: 'OFF' (Open Food Facts) | 'USDA' (manual USDA match)
-- No RLS — server-side only (barcode data is not user-specific).

CREATE TABLE IF NOT EXISTS scanned_products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode          TEXT        NOT NULL UNIQUE,
  name             TEXT        NOT NULL,
  brand            TEXT,
  image_url        TEXT,
  ingredients_text TEXT,
  ingredients      TEXT,
  allergens        TEXT[]      NOT NULL DEFAULT '{}',
  nutrition_json   JSONB,                    -- { calories, protein, carbs, fat, fiber, sugar, sodium } per 100g
  calories         NUMERIC,
  protein          NUMERIC,
  carbs            NUMERIC,
  fat              NUMERIC,
  sodium           NUMERIC,
  raw_payload      JSONB,
  source           TEXT        NOT NULL DEFAULT 'open_food_facts',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE scanned_products
  ADD COLUMN IF NOT EXISTS ingredients TEXT,
  ADD COLUMN IF NOT EXISTS calories NUMERIC,
  ADD COLUMN IF NOT EXISTS protein NUMERIC,
  ADD COLUMN IF NOT EXISTS carbs NUMERIC,
  ADD COLUMN IF NOT EXISTS fat NUMERIC,
  ADD COLUMN IF NOT EXISTS sodium NUMERIC,
  ADD COLUMN IF NOT EXISTS raw_payload JSONB;

ALTER TABLE scanned_products
  ALTER COLUMN source SET DEFAULT 'open_food_facts';

ALTER TABLE scanned_products
  DROP CONSTRAINT IF EXISTS scanned_products_source_check;

CREATE INDEX IF NOT EXISTS idx_scanned_products_barcode ON scanned_products (barcode);
CREATE INDEX IF NOT EXISTS idx_scanned_products_source  ON scanned_products (source);

-- ── 2. user_preferences additions ────────────────────────────────────────────
-- Adds dietary/allergy/onboarding columns to the existing user_preferences table.
-- These columns are set by QuickOnboardingModal.

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS dietary_preferences TEXT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS allergies            TEXT[]    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_size       SMALLINT  DEFAULT 1,
  ADD COLUMN IF NOT EXISTS primary_goal         TEXT      DEFAULT 'save_money'
    CHECK (primary_goal IN ('save_money', 'eat_healthier', 'save_time', NULL)),
  ADD COLUMN IF NOT EXISTS quick_onboarding_done BOOLEAN  DEFAULT FALSE;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM scanned_products)  AS scanned_product_rows,
  (SELECT COUNT(*) FROM user_preferences WHERE quick_onboarding_done = TRUE) AS onboarding_done_rows;
