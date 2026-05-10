-- ============================================================
-- Snippd - Production stack generation pipeline
-- Migration: 20260510_production_stack_pipeline
--
-- Additive schema for Cloud Run offer ingestion, normalized coupons,
-- coupon activation links, generation run counters, and user feedback.
-- No live data is seeded here.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.retailer_data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key text NOT NULL,
  source_type text NOT NULL DEFAULT 'manual',
  source_url text,
  source_name text,
  schedule text,
  last_ingested_at timestamptz,
  last_status text,
  metadata jsonb NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retailer_data_sources_unique
  ON public.retailer_data_sources (retailer_key, source_type, coalesce(source_url, ''));

CREATE UNIQUE INDEX IF NOT EXISTS idx_retailer_data_sources_upsert
  ON public.retailer_data_sources (retailer_key, source_type, source_url);

ALTER TABLE public.normalized_offers
  ADD COLUMN IF NOT EXISTS retailer_key text,
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS valid_from date,
  ADD COLUMN IF NOT EXISTS valid_until date,
  ADD COLUMN IF NOT EXISTS ingestion_run_id uuid,
  ADD COLUMN IF NOT EXISTS source_hash text,
  ADD COLUMN IF NOT EXISTS canonical_product_key text;

UPDATE public.normalized_offers
SET
  retailer_key = coalesce(retailer_key, regexp_replace(lower(coalesce(retailer, '')), '[^a-z0-9]+', '_', 'g')),
  canonical_product_key = coalesce(canonical_product_key, regexp_replace(lower(coalesce(product_name, '')), '[^a-z0-9]+', '_', 'g'))
WHERE retailer_key IS NULL OR canonical_product_key IS NULL;

CREATE INDEX IF NOT EXISTS idx_normalized_offers_retailer_key
  ON public.normalized_offers (retailer_key, valid_until);

CREATE INDEX IF NOT EXISTS idx_normalized_offers_canonical_key
  ON public.normalized_offers (canonical_product_key);

CREATE TABLE IF NOT EXISTS public.normalized_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key text NOT NULL,
  coupon_id text,
  product_name text NOT NULL,
  brand text,
  canonical_product_key text,
  discount_cents int NOT NULL DEFAULT 0,
  discount_pct numeric,
  coupon_type text NOT NULL DEFAULT 'digital',
  link_url text,
  source_url text,
  valid_from date,
  expires_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  confidence_score numeric(5,4) NOT NULL DEFAULT 0.5000,
  raw_source jsonb NOT NULL DEFAULT '{}',
  ingestion_run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_normalized_coupons_dedupe
  ON public.normalized_coupons (retailer_key, coalesce(coupon_id, ''), canonical_product_key, discount_cents)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_normalized_coupons_live
  ON public.normalized_coupons (retailer_key, canonical_product_key, expires_at)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.coupon_activation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key text NOT NULL,
  normalized_coupon_id uuid REFERENCES public.normalized_coupons(id) ON DELETE SET NULL,
  digital_coupon_id uuid REFERENCES public.digital_coupons(id) ON DELETE SET NULL,
  product_name text,
  canonical_product_key text,
  link_type text NOT NULL CHECK (link_type IN ('item','search','hub','unavailable')),
  link_url text,
  source text NOT NULL DEFAULT 'resolver',
  confidence_score numeric(5,4) NOT NULL DEFAULT 0.5000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coupon_activation_links_lookup
  ON public.coupon_activation_links (retailer_key, canonical_product_key, link_type);

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS generation_run_id uuid,
  ADD COLUMN IF NOT EXISTS explanation text,
  ADD COLUMN IF NOT EXISTS confidence_explanation text,
  ADD COLUMN IF NOT EXISTS coupon_activation_links jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS normalized_coupon_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS retailer_rule_snapshot jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

ALTER TABLE public.app_home_feed
  ADD COLUMN IF NOT EXISTS coupon_activation_links jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS generation_run_id uuid,
  ADD COLUMN IF NOT EXISTS confidence_explanation text,
  ADD COLUMN IF NOT EXISTS is_fallback boolean NOT NULL DEFAULT false;

ALTER TABLE public.stack_generation_runs
  ADD COLUMN IF NOT EXISTS trigger_source text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS offers_ingested int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupons_matched int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_created int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_approved int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS candidates_rejected int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.user_stack_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  stack_candidate_id uuid REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  app_home_feed_id uuid REFERENCES public.app_home_feed(id) ON DELETE SET NULL,
  feedback_type text NOT NULL,
  rating int,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_stack_feedback_stack
  ON public.user_stack_feedback (stack_candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_stack_feedback_user
  ON public.user_stack_feedback (user_id, created_at DESC);

ALTER TABLE public.retailer_data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_activation_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stack_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY retailer_data_sources_service_all
    ON public.retailer_data_sources FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY normalized_coupons_service_all
    ON public.normalized_coupons FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY coupon_activation_links_service_all
    ON public.coupon_activation_links FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY user_stack_feedback_owner_insert
    ON public.user_stack_feedback FOR INSERT WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY user_stack_feedback_owner_read
    ON public.user_stack_feedback FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE VIEW public.v_normalized_coupon_inventory AS
SELECT
  nc.id,
  nc.retailer_key,
  nc.coupon_id,
  nc.product_name,
  nc.brand,
  coalesce(nc.canonical_product_key, regexp_replace(lower(nc.product_name), '[^a-z0-9]+', '_', 'g')) AS canonical_product_key,
  nc.discount_cents,
  nc.discount_pct,
  nc.coupon_type,
  nc.link_url,
  nc.source_url,
  nc.expires_at,
  nc.is_active,
  nc.confidence_score,
  nc.created_at
FROM public.normalized_coupons nc
WHERE nc.is_active = true
  AND (nc.expires_at IS NULL OR nc.expires_at > now())
UNION ALL
SELECT
  dc.id,
  dc.retailer_key,
  dc.id::text AS coupon_id,
  dc.product_name,
  dc.brand,
  dc.normalized_key AS canonical_product_key,
  dc.discount_cents,
  dc.discount_pct,
  dc.coupon_type,
  dc.source_url AS link_url,
  dc.source_url,
  dc.expires_at,
  dc.is_active,
  0.8000::numeric(5,4) AS confidence_score,
  dc.created_at
FROM public.digital_coupons dc
WHERE dc.is_active = true
  AND (dc.expires_at IS NULL OR dc.expires_at > now());

GRANT SELECT ON public.v_normalized_coupon_inventory TO authenticated, service_role;
