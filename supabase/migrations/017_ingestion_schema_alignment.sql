-- Migration 017: Align ingestion pipeline tables with run-ingestion-worker column expectations
-- The Edge Function worker writes columns that differ from the original DB schema.
-- This migration adds the missing columns and a trigger to bridge worker writes
-- to the columns queried by get_weekly_plan RPC.
-- 2026-04-14

-- ── ingestion_jobs ────────────────────────────────────────────────────────────
-- Worker writes: started_at, error_message, parsed_at, deal_count
-- Table has: processing_started_at, last_error (no parsed_at, no deal_count)
ALTER TABLE public.ingestion_jobs
  ADD COLUMN IF NOT EXISTS started_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_message   TEXT,
  ADD COLUMN IF NOT EXISTS parsed_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deal_count      INTEGER DEFAULT 0;

-- ── flyer_deal_staging ────────────────────────────────────────────────────────
-- Worker writes: savings_amount, is_bogo, dietary_flags, deal_description, confidence_score
-- Table has: confidence (not confidence_score), no is_bogo, no dietary_flags, etc.
ALTER TABLE public.flyer_deal_staging
  ADD COLUMN IF NOT EXISTS savings_amount   NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS is_bogo          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dietary_flags    TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS deal_description TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3);

-- ── offer_sources ─────────────────────────────────────────────────────────────
-- Worker writes: normalized_key, offer_type, confidence_score, source, raw_text, ingestion_id
-- onConflict: 'dedupe_key' — dedupe_key already exists ✓
ALTER TABLE public.offer_sources
  ADD COLUMN IF NOT EXISTS normalized_key  TEXT,
  ADD COLUMN IF NOT EXISTS offer_type      TEXT,
  ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4,3),
  ADD COLUMN IF NOT EXISTS source          TEXT,
  ADD COLUMN IF NOT EXISTS raw_text        TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_id    UUID;

-- ── offer_matches ─────────────────────────────────────────────────────────────
-- Worker writes: offer_source_id, normalized_key, coupon_savings_cents, match_mode
-- onConflict: 'offer_source_id,coupon_source_id' — needs unique constraint
ALTER TABLE public.offer_matches
  ADD COLUMN IF NOT EXISTS offer_source_id      UUID,
  ADD COLUMN IF NOT EXISTS normalized_key        TEXT,
  ADD COLUMN IF NOT EXISTS coupon_savings_cents  INTEGER,
  ADD COLUMN IF NOT EXISTS match_mode            TEXT;

-- Unique index for upsert conflict resolution (partial: only non-null offer_source_id)
-- Uses full index (not partial) so ON CONFLICT (offer_source_id, coupon_source_id) works
CREATE UNIQUE INDEX IF NOT EXISTS offer_matches_offer_coupon_uniq
  ON public.offer_matches (offer_source_id, coupon_source_id);

-- ── stack_candidates: add worker-expected columns ─────────────────────────────
-- Worker writes: week_of, normalized_key, dedupe_key, primary_category, primary_brand,
--                items (jsonb), savings_pct, ingestion_id
-- onConflict: 'dedupe_key' — needs unique constraint
-- get_weekly_plan reads: category, retailer, is_active, valid_to, valid_from,
--                        base_price, final_price, stack_rank_score, allergen_tags
ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS week_of          DATE,
  ADD COLUMN IF NOT EXISTS normalized_key   TEXT,
  ADD COLUMN IF NOT EXISTS dedupe_key       TEXT,
  ADD COLUMN IF NOT EXISTS primary_category TEXT,
  ADD COLUMN IF NOT EXISTS primary_brand    TEXT,
  ADD COLUMN IF NOT EXISTS items            JSONB,
  ADD COLUMN IF NOT EXISTS savings_pct      NUMERIC(5,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ingestion_id     UUID;

-- Unique constraint on dedupe_key for upsert ON CONFLICT support
-- PostgreSQL UNIQUE treats multiple NULLs as distinct, so existing null rows are safe
ALTER TABLE public.stack_candidates
  DROP CONSTRAINT IF EXISTS stack_candidates_dedupe_key_unique;
ALTER TABLE public.stack_candidates
  ADD CONSTRAINT stack_candidates_dedupe_key_unique UNIQUE (dedupe_key);

-- ── Trigger: sync worker-written columns → RPC-read columns ──────────────────
-- When the worker upserts via dedupe_key, it writes primary_category but the
-- get_weekly_plan RPC reads category, retailer, base_price, final_price, is_active,
-- valid_to, item_name, brand. This trigger bridges the two schemas.

CREATE OR REPLACE FUNCTION public.sync_stack_candidate_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item           jsonb;
  v_regular_cents  numeric;
  v_discount_cents numeric;
BEGIN
  -- category ← primary_category (only when category is blank)
  IF (NEW.category IS NULL OR NEW.category = '') AND NEW.primary_category IS NOT NULL THEN
    NEW.category := NEW.primary_category;
  END IF;

  -- brand ← primary_brand (only when brand is blank)
  IF (NEW.brand IS NULL OR NEW.brand = '') AND NEW.primary_brand IS NOT NULL THEN
    NEW.brand := NEW.primary_brand;
  END IF;

  -- retailer ← retailer_key (only when retailer is blank)
  IF (NEW.retailer IS NULL OR NEW.retailer = '') AND NEW.retailer_key IS NOT NULL THEN
    NEW.retailer := NEW.retailer_key;
  END IF;

  -- item_name ← items[0].name (only when item_name is blank)
  IF (NEW.item_name IS NULL OR NEW.item_name = '')
     AND NEW.items IS NOT NULL
     AND jsonb_array_length(NEW.items) > 0 THEN
    NEW.item_name := NEW.items->0->>'name';
  END IF;

  -- is_active = true for new inserts from worker (when not explicitly set)
  IF TG_OP = 'INSERT' AND NEW.is_active IS NULL THEN
    NEW.is_active := true;
  END IF;

  -- valid_to ← week_of + 6 days (end of deal week)
  IF NEW.valid_to IS NULL AND NEW.week_of IS NOT NULL THEN
    NEW.valid_to := (NEW.week_of + INTERVAL '6 days')::date;
  END IF;

  -- base_price and final_price ← derived from items[0] price data (in dollars)
  IF NEW.items IS NOT NULL AND jsonb_array_length(NEW.items) > 0 THEN
    v_item          := NEW.items->0;
    v_regular_cents := (v_item->>'regularPriceCents')::numeric;

    IF v_regular_cents IS NOT NULL AND v_regular_cents > 0 THEN
      -- base_price (dollars) only when not already set
      IF NEW.base_price IS NULL OR NEW.base_price = 0 THEN
        NEW.base_price := v_regular_cents / 100.0;
      END IF;

      -- final_price: subtract first offer's discountCents if present
      IF NEW.final_price IS NULL OR NEW.final_price = 0 THEN
        v_discount_cents := (v_item->'offers'->0->>'discountCents')::numeric;
        IF v_discount_cents IS NOT NULL AND v_discount_cents > 0 THEN
          NEW.final_price := GREATEST(0, (v_regular_cents - v_discount_cents)) / 100.0;
        ELSE
          NEW.final_price := v_regular_cents / 100.0;
        END IF;
      END IF;

      -- sale_savings (dollars) only when not set
      IF (NEW.sale_savings IS NULL OR NEW.sale_savings = 0)
         AND NEW.base_price IS NOT NULL AND NEW.final_price IS NOT NULL THEN
        NEW.sale_savings := GREATEST(0, NEW.base_price - NEW.final_price);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_stack_candidate_columns ON public.stack_candidates;
CREATE TRIGGER trg_sync_stack_candidate_columns
  BEFORE INSERT OR UPDATE ON public.stack_candidates
  FOR EACH ROW EXECUTE FUNCTION public.sync_stack_candidate_columns();

-- ── flyer_publish_log: add columns written by worker ──────────────────────────
-- Worker writes: ingestion_id, retailer_key, week_of, deals_staged, deals_published,
--                coupons_matched, candidates_written, published_at
-- Table has: ingestion_id ✓, published_at ✓, offers_upserted, deal_cards_upserted
ALTER TABLE public.flyer_publish_log
  ADD COLUMN IF NOT EXISTS retailer_key         TEXT,
  ADD COLUMN IF NOT EXISTS week_of              DATE,
  ADD COLUMN IF NOT EXISTS deals_staged         INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deals_published      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupons_matched      INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_written   INTEGER DEFAULT 0;
