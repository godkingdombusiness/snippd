-- ============================================================
-- Snippd — Ingestion Pipeline Tables
-- Idempotent: safe to re-run (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- ============================================================

-- ── 1. ingestion_jobs ─────────────────────────────────────────
-- One row per weekly-ad PDF to be processed.

CREATE TABLE IF NOT EXISTS public.ingestion_jobs (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key   text        NOT NULL,
  week_of        date        NOT NULL,
  storage_path   text        NOT NULL,   -- path in 'deal-pdfs' bucket
  status         text        NOT NULL DEFAULT 'queued',
    -- 'queued' | 'processing' | 'parsed' | 'completed' | 'failed'
  attempts       int         NOT NULL DEFAULT 0,
  deal_count     int,                   -- populated after parseFlyer()
  error_message  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  parsed_at      timestamptz,
  completed_at   timestamptz
);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status
  ON public.ingestion_jobs (status, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_retailer_week
  ON public.ingestion_jobs (retailer_key, week_of);

-- ── 2. flyer_deal_staging ─────────────────────────────────────
-- Raw deals extracted from a flyer, before normalization.

CREATE TABLE IF NOT EXISTS public.flyer_deal_staging (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id      uuid        NOT NULL REFERENCES public.ingestion_jobs(id) ON DELETE CASCADE,
  retailer_key      text        NOT NULL,
  week_of           date        NOT NULL,
  product_name      text        NOT NULL,
  brand             text,
  size              text,
  sale_price        numeric,              -- dollars
  regular_price     numeric,              -- dollars
  deal_type         text        NOT NULL DEFAULT 'SALE',
  quantity_required int,
  category          text,
  raw_text          text,
  confidence_score  numeric     NOT NULL DEFAULT 0,
  needs_review      boolean     NOT NULL DEFAULT false,
  status            text        NOT NULL DEFAULT 'staged',
    -- 'staged' | 'published' | 'rejected'
  published_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flyer_staging_job
  ON public.flyer_deal_staging (ingestion_id, status);

CREATE INDEX IF NOT EXISTS idx_flyer_staging_retailer_week
  ON public.flyer_deal_staging (retailer_key, week_of, status);

-- ── 3. offer_sources ──────────────────────────────────────────
-- Normalized weekly-ad offers (one row per deal, deduped by week).

CREATE TABLE IF NOT EXISTS public.offer_sources (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key         text        NOT NULL,
  week_of              date        NOT NULL,
  normalized_key       text        NOT NULL,
  dedupe_key           text        NOT NULL,   -- retailer_key::normalized_key::week_of
  product_name         text        NOT NULL,
  brand                text,
  size                 text,
  category             text,
  offer_type           text        NOT NULL DEFAULT 'SALE',
  sale_price_cents     int,
  regular_price_cents  int,
  quantity_required    int,
  expires_on           date,
  confidence_score     numeric,
  source               text        NOT NULL DEFAULT 'flyer',
  raw_text             text,
  ingestion_id         uuid        REFERENCES public.ingestion_jobs(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_sources_dedupe
  ON public.offer_sources (dedupe_key);

CREATE INDEX IF NOT EXISTS idx_offer_sources_retailer_week
  ON public.offer_sources (retailer_key, week_of);

CREATE INDEX IF NOT EXISTS idx_offer_sources_normalized_key
  ON public.offer_sources (normalized_key);

-- ── 4. digital_coupons ────────────────────────────────────────
-- Digital coupon inventory, loaded separately from flyers.

CREATE TABLE IF NOT EXISTS public.digital_coupons (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key    text        NOT NULL,
  product_name    text        NOT NULL,
  brand           text,
  normalized_key  text        NOT NULL,
  discount_cents  int         NOT NULL DEFAULT 0,
  discount_pct    numeric,                     -- 0.0–1.0
  coupon_type     text        NOT NULL DEFAULT 'digital',
    -- 'manufacturer' | 'store' | 'digital'
  expires_at      timestamptz,
  is_active       boolean     NOT NULL DEFAULT true,
  source_url      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_digital_coupons_retailer
  ON public.digital_coupons (retailer_key, is_active);

CREATE INDEX IF NOT EXISTS idx_digital_coupons_normalized
  ON public.digital_coupons (normalized_key);

-- ── 5. offer_matches ──────────────────────────────────────────
-- Links a weekly-ad offer_source to a matching digital_coupon.
-- Replaces the old shape (which was user-facing); this is system-facing.

DROP INDEX IF EXISTS idx_offer_matches_user;

ALTER TABLE public.offer_matches
  ADD COLUMN IF NOT EXISTS offer_source_id    uuid REFERENCES public.offer_sources(id),
  ADD COLUMN IF NOT EXISTS coupon_source_id   uuid REFERENCES public.digital_coupons(id),
  ADD COLUMN IF NOT EXISTS week_of            date,
  ADD COLUMN IF NOT EXISTS normalized_key     text,
  ADD COLUMN IF NOT EXISTS final_price_cents  int,
  ADD COLUMN IF NOT EXISTS coupon_savings_cents int,
  ADD COLUMN IF NOT EXISTS match_mode         text,
  ADD COLUMN IF NOT EXISTS match_confidence   numeric;

CREATE UNIQUE INDEX IF NOT EXISTS idx_offer_matches_source_coupon
  ON public.offer_matches (offer_source_id, coupon_source_id)
  WHERE offer_source_id IS NOT NULL AND coupon_source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_offer_matches_retailer_week
  ON public.offer_matches (retailer_key, week_of);

-- ── 6. stack_candidates ───────────────────────────────────────
-- Pre-computed deal candidates consumed by cartEngine.

CREATE TABLE IF NOT EXISTS public.stack_candidates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key     text        NOT NULL,
  week_of          date        NOT NULL,
  normalized_key   text,
  dedupe_key       text,
  primary_category text,
  primary_brand    text,
  stack_rank_score numeric     NOT NULL DEFAULT 0,
  savings_pct      numeric     NOT NULL DEFAULT 0,
  has_coupon       boolean     NOT NULL DEFAULT false,
  items            jsonb       NOT NULL DEFAULT '[]',
  ingestion_id     uuid        REFERENCES public.ingestion_jobs(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_candidates_dedupe
  ON public.stack_candidates (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stack_candidates_retailer_week_rank
  ON public.stack_candidates (retailer_key, week_of, stack_rank_score DESC);

-- ── 7. flyer_publish_log ──────────────────────────────────────
-- Audit log written after normalizeAndPublish() completes.

CREATE TABLE IF NOT EXISTS public.flyer_publish_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id        uuid        NOT NULL REFERENCES public.ingestion_jobs(id),
  retailer_key        text        NOT NULL,
  week_of             date        NOT NULL,
  deals_staged        int         NOT NULL DEFAULT 0,
  deals_published     int         NOT NULL DEFAULT 0,
  coupons_matched     int         NOT NULL DEFAULT 0,
  candidates_written  int         NOT NULL DEFAULT 0,
  published_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_flyer_publish_log_job
  ON public.flyer_publish_log (ingestion_id);

-- ── 8. ingestion_run_log ──────────────────────────────────────
-- One row per worker run (success or failure).

CREATE TABLE IF NOT EXISTS public.ingestion_run_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ingestion_id        uuid        REFERENCES public.ingestion_jobs(id),
  retailer_key        text        NOT NULL,
  week_of             date        NOT NULL,
  status              text        NOT NULL,   -- 'completed' | 'failed' | 'retryable'
  deals_extracted     int         NOT NULL DEFAULT 0,
  deals_published     int         NOT NULL DEFAULT 0,
  coupons_matched     int         NOT NULL DEFAULT 0,
  candidates_written  int         NOT NULL DEFAULT 0,
  started_at          timestamptz,
  completed_at        timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ingestion_run_log_job
  ON public.ingestion_run_log (ingestion_id, created_at DESC);

-- ── 9. app_config (if not exists) ────────────────────────────
-- Generic key/value config store used by wealthEngine for USDA benchmarks.

CREATE TABLE IF NOT EXISTS public.app_config (
  config_key   text        PRIMARY KEY,
  config_value jsonb       NOT NULL DEFAULT '{}',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Seed default USDA category benchmarks
INSERT INTO public.app_config (config_key, config_value) VALUES (
  'usda_category_benchmarks',
  '[
    {"category":"produce","avg_price_per_unit":1.80,"unit":"lb","reference_date":"2026-01-01"},
    {"category":"meat","avg_price_per_unit":6.50,"unit":"lb","reference_date":"2026-01-01"},
    {"category":"dairy","avg_price_per_unit":3.20,"unit":"each","reference_date":"2026-01-01"},
    {"category":"pantry","avg_price_per_unit":3.50,"unit":"each","reference_date":"2026-01-01"},
    {"category":"frozen","avg_price_per_unit":4.00,"unit":"each","reference_date":"2026-01-01"},
    {"category":"beverages","avg_price_per_unit":2.50,"unit":"each","reference_date":"2026-01-01"},
    {"category":"snacks","avg_price_per_unit":3.75,"unit":"each","reference_date":"2026-01-01"},
    {"category":"household","avg_price_per_unit":5.00,"unit":"each","reference_date":"2026-01-01"},
    {"category":"pharmacy","avg_price_per_unit":8.00,"unit":"each","reference_date":"2026-01-01"}
  ]'
) ON CONFLICT (config_key) DO NOTHING;

-- Seed retailer coupon_match_mode policies
INSERT INTO public.retailer_coupon_parameters (retailer_key, policy_key, policy_value) VALUES
  ('publix',  'coupon_match_mode', '{"coupon_match_mode":"token_overlap"}'),
  ('kroger',  'coupon_match_mode', '{"coupon_match_mode":"exact_name"}'),
  ('target',  'coupon_match_mode', '{"coupon_match_mode":"brand_or_name"}'),
  ('walmart', 'coupon_match_mode', '{"coupon_match_mode":"token_overlap"}'),
  ('cvs',     'coupon_match_mode', '{"coupon_match_mode":"brand_or_name"}')
ON CONFLICT DO NOTHING;
