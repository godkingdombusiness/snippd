-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260502_normalized_offers
-- Adds the normalized_offers table for the Normalized Offer Engine.
--
-- SAFE: Does NOT modify any existing table.
-- Existing tables untouched: app_home_feed, offer_sources, stack_candidates,
--   digital_coupons, rebate_offers, user_preferences, profiles.
--
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS normalized_offers (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_offer_id        TEXT,
  retailer               TEXT        NOT NULL,
  product_name           TEXT        NOT NULL,
  brand                  TEXT,
  category               TEXT,
  size_text              TEXT,
  normalized_size        NUMERIC,
  normalized_unit        TEXT,
  price_cents            INTEGER,
  regular_price_cents    INTEGER,
  deal_type              TEXT        CHECK (deal_type IN ('sale','bogo','multibuy','coupon','regular','unknown')),
  quantity_required      INTEGER     NOT NULL DEFAULT 1,
  quantity_received      INTEGER     NOT NULL DEFAULT 1,
  final_unit_price_cents INTEGER,
  savings_cents          INTEGER,
  confidence_score       NUMERIC     NOT NULL DEFAULT 0.5,
  raw_source             JSONB       NOT NULL DEFAULT '{}',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Partial unique index: enables upsert by source_offer_id when one is provided.
-- WHERE clause means null source_offer_ids are never blocked.
CREATE UNIQUE INDEX IF NOT EXISTS uq_normalized_offers_source_id
  ON normalized_offers (source_offer_id)
  WHERE source_offer_id IS NOT NULL;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_normalized_offers_retailer
  ON normalized_offers (retailer);

CREATE INDEX IF NOT EXISTS idx_normalized_offers_product_name
  ON normalized_offers (product_name);

CREATE INDEX IF NOT EXISTS idx_normalized_offers_deal_type
  ON normalized_offers (deal_type);

CREATE INDEX IF NOT EXISTS idx_normalized_offers_category
  ON normalized_offers (category);

-- Index for the getBestSavingsOffers() query pattern
CREATE INDEX IF NOT EXISTS idx_normalized_offers_savings
  ON normalized_offers (savings_cents DESC, confidence_score DESC)
  WHERE savings_cents IS NOT NULL;

-- Verify
SELECT
  COUNT(*)                                                AS total_rows,
  COUNT(*) FILTER (WHERE source_offer_id IS NOT NULL)     AS with_source_id,
  COUNT(*) FILTER (WHERE savings_cents IS NOT NULL)        AS with_savings
FROM normalized_offers;
