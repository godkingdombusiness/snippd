-- ============================================================
-- Snippd — Deal Intelligence, Validation, Confidence Scoring
--           Dynamic Pricing Defense + Regional Layer
-- Migration: 20260429_deal_intelligence_layer.sql
-- Safe to re-run: fully idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS)
-- No destructive changes — additive only
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- PHASE 1: ENUMS
-- ─────────────────────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE public.validation_status_enum AS ENUM (
    'pending', 'auto_approved', 'approved_with_caution',
    'needs_review', 'blocked', 'expired', 'retracted'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.offer_scope_enum AS ENUM (
    'national', 'state', 'region', 'zip', 'store_specific', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.actor_type_enum AS ENUM (
    'ai', 'human', 'user', 'system'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.deal_type_enum AS ENUM (
    'sale', 'bogo', 'multibuy', 'clearance', 'digital_coupon',
    'rebate', 'bundle', 'loyalty', 'manufacturer_coupon', 'store_coupon'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.stack_type_enum AS ENUM (
    'sale_only', 'coupon_only', 'sale_plus_coupon', 'sale_plus_bogo',
    'sale_plus_coupon_plus_rebate', 'full_stack', 'unknown'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_facing_badge_enum AS ENUM (
    'confirmed', 'likely', 'verify_locally', 'needs_review',
    'expired', 'price_may_vary'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 2: EXTEND offer_sources WITH INTELLIGENCE COLUMNS
-- All additive — no existing columns touched
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.offer_sources
  ADD COLUMN IF NOT EXISTS source_url              text,
  ADD COLUMN IF NOT EXISTS source_type             text,  -- 'flyer'|'influencer'|'manual'|'api'|'promo_source'
  ADD COLUMN IF NOT EXISTS offer_scope             text   DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS state                   text,
  ADD COLUMN IF NOT EXISTS zip_code                text,
  ADD COLUMN IF NOT EXISTS market_region           text,
  ADD COLUMN IF NOT EXISTS store_id                text,
  ADD COLUMN IF NOT EXISTS store_location_text     text,
  ADD COLUMN IF NOT EXISTS observed_price_cents    int,
  ADD COLUMN IF NOT EXISTS regular_price_cents_v2  int,   -- mirrors regular_price_cents, adds new name
  ADD COLUMN IF NOT EXISTS final_estimated_cents   int,
  ADD COLUMN IF NOT EXISTS coupon_value_cents      int,
  ADD COLUMN IF NOT EXISTS stack_type              text   DEFAULT 'unknown',
  -- Confidence subscores (0.0–1.0 each)
  ADD COLUMN IF NOT EXISTS confidence_score_v2     numeric(4,3) DEFAULT 0,  -- 0–1 computed
  ADD COLUMN IF NOT EXISTS accuracy_score          numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS availability_score      numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stack_success_score     numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiration_reliability  numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS volatility_score        numeric(4,3) DEFAULT 1,  -- 1=stable, 0=volatile
  ADD COLUMN IF NOT EXISTS source_reliability      numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS product_match_quality   numeric(4,3) DEFAULT 0,
  -- Validation
  ADD COLUMN IF NOT EXISTS validation_status       text   DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS user_badge              text   DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS reason_codes            text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_json           jsonb  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at        timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by             text,
  -- Price tracking
  ADD COLUMN IF NOT EXISTS price_at_recommendation int,
  ADD COLUMN IF NOT EXISTS latest_observed_price   int,
  ADD COLUMN IF NOT EXISTS price_observed_at       timestamptz,
  ADD COLUMN IF NOT EXISTS price_source            text,
  ADD COLUMN IF NOT EXISTS price_variance_detected boolean DEFAULT false,
  -- Publishing
  ADD COLUMN IF NOT EXISTS published_at            timestamptz,
  ADD COLUMN IF NOT EXISTS auto_published          boolean DEFAULT false,
  -- Coupon-specific
  ADD COLUMN IF NOT EXISTS coupon_terms_text       text,
  ADD COLUMN IF NOT EXISTS coupon_exclusions       text,
  ADD COLUMN IF NOT EXISTS coupon_usage_limit      int,
  ADD COLUMN IF NOT EXISTS quantity_requirement    int,
  ADD COLUMN IF NOT EXISTS is_digital_only         boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_app_only             boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_loyalty_required     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manufacturer_coupon  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS bogo_terms_clear        boolean DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_offer_sources_confidence
  ON public.offer_sources (confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_offer_sources_validation
  ON public.offer_sources (validation_status, published_at);
CREATE INDEX IF NOT EXISTS idx_offer_sources_scope_state
  ON public.offer_sources (offer_scope, state, zip_code);
CREATE INDEX IF NOT EXISTS idx_offer_sources_expires
  ON public.offer_sources (expires_on, validation_status);

-- ─────────────────────────────────────────────────────────────
-- PHASE 3: EXTEND flyer_deal_staging
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.flyer_deal_staging
  ADD COLUMN IF NOT EXISTS source_url          text,
  ADD COLUMN IF NOT EXISTS source_type         text  DEFAULT 'flyer',
  ADD COLUMN IF NOT EXISTS offer_scope         text  DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS state               text,
  ADD COLUMN IF NOT EXISTS zip_code            text,
  ADD COLUMN IF NOT EXISTS market_region       text,
  ADD COLUMN IF NOT EXISTS store_id            text,
  ADD COLUMN IF NOT EXISTS observed_price      numeric,
  ADD COLUMN IF NOT EXISTS coupon_value        numeric,
  ADD COLUMN IF NOT EXISTS stack_type          text,
  ADD COLUMN IF NOT EXISTS coupon_terms_text   text,
  ADD COLUMN IF NOT EXISTS coupon_exclusions   text,
  ADD COLUMN IF NOT EXISTS quantity_requirement int,
  ADD COLUMN IF NOT EXISTS bogo_terms_clear    boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS validation_status   text   DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS reason_codes        text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS evidence_json       jsonb  DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at    timestamptz,
  ADD COLUMN IF NOT EXISTS expires_on          date;

CREATE INDEX IF NOT EXISTS idx_fds_validation
  ON public.flyer_deal_staging (validation_status);
CREATE INDEX IF NOT EXISTS idx_fds_expires
  ON public.flyer_deal_staging (expires_on);

-- ─────────────────────────────────────────────────────────────
-- PHASE 4: EXTEND stack_candidates
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS confidence_score      numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status     text   DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS user_badge            text   DEFAULT 'needs_review',
  ADD COLUMN IF NOT EXISTS stack_type            text   DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS final_estimated_cents int,
  ADD COLUMN IF NOT EXISTS price_at_rec          int,
  ADD COLUMN IF NOT EXISTS offer_scope           text   DEFAULT 'national',
  ADD COLUMN IF NOT EXISTS state                 text,
  ADD COLUMN IF NOT EXISTS zip_code              text,
  ADD COLUMN IF NOT EXISTS reason_codes          text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS needs_review          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at          timestamptz;

CREATE INDEX IF NOT EXISTS idx_stack_candidates_confidence
  ON public.stack_candidates (confidence_score DESC, validation_status);

-- ─────────────────────────────────────────────────────────────
-- PHASE 5: EXTEND digital_coupons
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.digital_coupons
  ADD COLUMN IF NOT EXISTS coupon_terms_text    text,
  ADD COLUMN IF NOT EXISTS coupon_exclusions    text,
  ADD COLUMN IF NOT EXISTS usage_limit          int,
  ADD COLUMN IF NOT EXISTS is_digital_only      boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_app_only          boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_loyalty_required  boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_manufacturer      boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS offer_scope          text    DEFAULT 'national',
  ADD COLUMN IF NOT EXISTS state                text,
  ADD COLUMN IF NOT EXISTS zip_code             text,
  ADD COLUMN IF NOT EXISTS confidence_score     numeric(4,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS validation_status    text    DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS evidence_json        jsonb   DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_verified_at     timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at           timestamptz DEFAULT now();

-- ─────────────────────────────────────────────────────────────
-- PHASE 6: NEW TABLE — price_observations
-- Tracks price for every product/retailer/store/zip over time
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.price_observations (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_source_id      uuid        REFERENCES public.offer_sources(id) ON DELETE SET NULL,
  retailer_key         text        NOT NULL,
  normalized_key       text        NOT NULL,
  product_name         text        NOT NULL,
  brand                text,
  size                 text,
  observed_price_cents int         NOT NULL,
  regular_price_cents  int,
  sale_price_cents     int,
  coupon_value_cents   int,
  final_price_cents    int,
  -- Location
  store_id             text,
  store_location_text  text,
  zip_code             text,
  state                text,
  market_region        text,
  -- Source
  source_type          text        NOT NULL DEFAULT 'flyer',
  source_url           text,
  observed_by          text        NOT NULL DEFAULT 'system',
  -- Flags
  is_verified          boolean     NOT NULL DEFAULT false,
  verified_by_receipt  boolean     NOT NULL DEFAULT false,
  -- Timestamps
  observed_at          timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_obs_offer_source
  ON public.price_observations (offer_source_id, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_obs_retailer_product
  ON public.price_observations (retailer_key, normalized_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_obs_zip_retailer
  ON public.price_observations (zip_code, retailer_key, observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_obs_state_retailer
  ON public.price_observations (state, retailer_key, observed_at DESC);

ALTER TABLE public.price_observations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY price_obs_admin_all ON public.price_observations FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY price_obs_system_insert ON public.price_observations FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY price_obs_public_read ON public.price_observations FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 7: NEW TABLE — validation_events
-- Full audit trail for every offer status change
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.validation_events (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What changed
  offer_source_id  uuid        REFERENCES public.offer_sources(id) ON DELETE CASCADE,
  stack_candidate_id uuid      REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  coupon_id        uuid        REFERENCES public.digital_coupons(id) ON DELETE SET NULL,
  -- Event
  event_type       text        NOT NULL,
    -- 'ingested'|'normalized'|'scored'|'approved'|'flagged'|'blocked'|
    -- 'published'|'retracted'|'price_changed'|'expired'|'user_confirmed'|'user_rejected'
  old_status       text,
  new_status       text,
  old_score        numeric(4,3),
  new_score        numeric(4,3),
  -- Who
  actor_type       text        NOT NULL DEFAULT 'system',
  actor_id         text,
  -- Evidence
  notes            text,
  reason_codes     text[]      DEFAULT '{}',
  evidence_json    jsonb       DEFAULT '{}',
  -- Timestamps
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_val_events_offer
  ON public.validation_events (offer_source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_val_events_event_type
  ON public.validation_events (event_type, created_at DESC);

ALTER TABLE public.validation_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY val_events_admin ON public.validation_events FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY val_events_system_insert ON public.validation_events FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY val_events_public_read ON public.validation_events FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 8: NEW TABLE — user_deal_feedback
-- Did this deal actually work at the store?
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.user_deal_feedback (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  offer_source_id       uuid        REFERENCES public.offer_sources(id) ON DELETE SET NULL,
  stack_candidate_id    uuid        REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  trip_id               uuid        REFERENCES public.user_trips(id) ON DELETE SET NULL,
  -- What happened
  outcome               text        NOT NULL,
    -- 'worked'|'coupon_failed'|'out_of_stock'|'wrong_price'|
    -- 'substituted'|'quantity_not_met'|'exclusion_hit'|'register_rejected'
  predicted_savings_cents int,
  actual_savings_cents    int,
  receipt_price_cents     int,
  -- Details
  notes                   text,
  store_id                text,
  zip_code                text,
  state                   text,
  -- Meta
  submitted_at            timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_feedback_offer
  ON public.user_deal_feedback (offer_source_id, outcome);
CREATE INDEX IF NOT EXISTS idx_deal_feedback_user
  ON public.user_deal_feedback (user_id, submitted_at DESC);

ALTER TABLE public.user_deal_feedback ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY deal_feedback_own ON public.user_deal_feedback FOR ALL USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY deal_feedback_admin ON public.user_deal_feedback FOR SELECT USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 9: NEW TABLE — source_reliability
-- Per-source trust score, updated by feedback loop
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.source_reliability (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type           text        NOT NULL,  -- 'flyer'|'influencer'|'manual'|'api'|'promo'
  source_key            text        NOT NULL,  -- e.g. retailer_key or influencer handle
  -- Scores (0.0–1.0)
  reliability_score     numeric(4,3) NOT NULL DEFAULT 0.5,
  accuracy_score        numeric(4,3) NOT NULL DEFAULT 0.5,
  freshness_score       numeric(4,3) NOT NULL DEFAULT 0.5,
  -- Counts
  total_deals           int         NOT NULL DEFAULT 0,
  confirmed_deals       int         NOT NULL DEFAULT 0,
  failed_deals          int         NOT NULL DEFAULT 0,
  -- When
  last_ingested_at      timestamptz,
  last_confirmed_at     timestamptz,
  -- Metadata
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_key)
);

CREATE INDEX IF NOT EXISTS idx_source_reliability_type_score
  ON public.source_reliability (source_type, reliability_score DESC);

ALTER TABLE public.source_reliability ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY source_rel_admin ON public.source_reliability FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY source_rel_system_upsert ON public.source_reliability FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY source_rel_public_read ON public.source_reliability FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed known source types
INSERT INTO public.source_reliability (source_type, source_key, reliability_score, accuracy_score, freshness_score)
VALUES
  ('flyer',      'publix',       0.90, 0.85, 0.90),
  ('flyer',      'kroger',       0.85, 0.80, 0.85),
  ('flyer',      'walmart',      0.80, 0.75, 0.85),
  ('flyer',      'target',       0.82, 0.78, 0.85),
  ('flyer',      'aldi',         0.88, 0.85, 0.90),
  ('api',        'ibotta',       0.88, 0.85, 0.80),
  ('api',        'fetch',        0.82, 0.80, 0.75),
  ('promo',      'generic',      0.60, 0.55, 0.60),
  ('influencer', 'unknown',      0.45, 0.40, 0.50),
  ('manual',     'admin',        0.95, 0.92, 0.80)
ON CONFLICT (source_type, source_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PHASE 10: NEW TABLE — retailer_coverage
-- Market readiness by retailer + state + zip
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.retailer_coverage (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key          text        NOT NULL,
  state                 text,
  zip_code              text,
  market_region         text,
  store_id              text,
  -- Status
  coverage_status       text        NOT NULL DEFAULT 'partial',
    -- 'full'|'partial'|'none'|'demo_only'
  -- Counts
  active_offer_count    int         NOT NULL DEFAULT 0,
  verified_price_count  int         NOT NULL DEFAULT 0,
  coupon_count          int         NOT NULL DEFAULT 0,
  -- Scores
  confidence_average    numeric(4,3) DEFAULT 0,
  market_readiness_score numeric(4,3) DEFAULT 0,
  -- When
  last_ingested_at      timestamptz,
  last_verified_at      timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retailer_coverage_unique
  ON public.retailer_coverage (retailer_key, COALESCE(state,''), COALESCE(zip_code,''), COALESCE(store_id,''));

CREATE INDEX IF NOT EXISTS idx_retailer_coverage_state
  ON public.retailer_coverage (state, retailer_key, market_readiness_score DESC);
CREATE INDEX IF NOT EXISTS idx_retailer_coverage_zip
  ON public.retailer_coverage (zip_code, retailer_key);

ALTER TABLE public.retailer_coverage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY retailer_cov_admin ON public.retailer_coverage FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY retailer_cov_system ON public.retailer_coverage FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY retailer_cov_public_read ON public.retailer_coverage FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed Florida demo markets
INSERT INTO public.retailer_coverage
  (retailer_key, state, market_region, coverage_status)
VALUES
  ('publix',  'FL', 'Florida',    'full'),
  ('walmart', 'FL', 'Florida',    'partial'),
  ('target',  'FL', 'Florida',    'partial'),
  ('aldi',    'FL', 'Florida',    'partial'),
  ('publix',  'TN', 'Tennessee',  'demo_only'),
  ('kroger',  'TN', 'Tennessee',  'demo_only'),
  ('walmart', 'TN', 'Tennessee',  'demo_only'),
  ('kroger',  'OH', 'Ohio',       'demo_only'),
  ('walmart', 'OH', 'Ohio',       'demo_only'),
  ('giant',   'OH', 'Ohio',       'demo_only')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PHASE 11: NEW TABLE — deal_review_queue
-- Centralized human/AI review pipeline
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deal_review_queue (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  offer_source_id     uuid        REFERENCES public.offer_sources(id) ON DELETE CASCADE,
  stack_candidate_id  uuid        REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  -- Why it's here
  trigger_reason      text        NOT NULL,
    -- 'low_confidence'|'missing_terms'|'high_savings'|'bogo_unclear'|
    -- 'price_conflict'|'duplicate'|'low_product_match'|'unknown_scope'|
    -- 'stale_price'|'quantity_missing'|'retailer_rule_conflict'
  reason_codes        text[]      DEFAULT '{}',
  confidence_score    numeric(4,3),
  -- Review
  review_type         text        NOT NULL DEFAULT 'human',  -- 'human'|'ai'|'both'
  review_status       text        NOT NULL DEFAULT 'pending',
    -- 'pending'|'in_progress'|'approved'|'rejected'|'escalated'
  reviewed_by         text,
  reviewed_at         timestamptz,
  review_notes        text,
  -- Priority
  priority            int         NOT NULL DEFAULT 5,  -- 1=urgent, 10=low
  -- Meta
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status_priority
  ON public.deal_review_queue (review_status, priority ASC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_review_queue_offer
  ON public.deal_review_queue (offer_source_id);

ALTER TABLE public.deal_review_queue ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY review_queue_admin ON public.deal_review_queue FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY review_queue_system_insert ON public.deal_review_queue FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 12: NEW TABLE — validation_rules
-- Configurable rule registry — no hardcoded rules in code
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.validation_rules (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_code       text        NOT NULL UNIQUE,
  category        text        NOT NULL,
    -- 'retailer'|'product'|'coupon'|'deal'|'stack'|'regional'|'pricing'|'evidence'
  rule_name       text        NOT NULL,
  description     text,
  is_blocking     boolean     NOT NULL DEFAULT false,  -- blocks publishing if fails
  sends_to_review boolean     NOT NULL DEFAULT true,   -- queues for review if fails
  score_penalty   numeric(4,3) NOT NULL DEFAULT 0,     -- subtracted from confidence
  is_active       boolean     NOT NULL DEFAULT true,
  applies_to      text[]      DEFAULT '{offer,stack,coupon}',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.validation_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY val_rules_admin ON public.validation_rules FOR ALL USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY val_rules_public_read ON public.validation_rules FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed validation rules
INSERT INTO public.validation_rules (rule_code, category, rule_name, is_blocking, sends_to_review, score_penalty, applies_to)
VALUES
  -- Retailer rules
  ('R001', 'retailer',  'retailer_key_required',          true,  false, 0,     '{offer,stack,coupon}'),
  ('R002', 'retailer',  'unsupported_retailer_no_autopublish', true, true, 0.3, '{offer,stack}'),
  ('R003', 'retailer',  'retailer_rules_checked_for_stack', true, true, 0.2,   '{stack}'),
  -- Product rules
  ('P001', 'product',   'product_name_required',          true,  false, 0,     '{offer,stack}'),
  ('P002', 'product',   'brand_required_for_coupon',      false, true,  0.15,  '{coupon}'),
  ('P003', 'product',   'size_required_for_sized_coupon', false, true,  0.15,  '{coupon}'),
  ('P004', 'product',   'low_product_match_confidence',   false, true,  0.25,  '{offer,stack}'),
  -- Coupon rules
  ('C001', 'coupon',    'coupon_type_required',           true,  false, 0,     '{coupon}'),
  ('C002', 'coupon',    'coupon_value_required',          true,  false, 0,     '{coupon}'),
  ('C003', 'coupon',    'terms_required_for_coupon_stack',true,  true,  0.2,   '{stack,coupon}'),
  ('C004', 'coupon',    'expiration_required_where_available', false, true, 0.1, '{coupon}'),
  ('C005', 'coupon',    'vague_bogo_terms',               false, true,  0.2,   '{coupon,stack}'),
  ('C006', 'coupon',    'exclusions_must_be_stored',      false, true,  0.1,   '{coupon}'),
  ('C007', 'coupon',    'usage_limit_must_be_labeled',    false, true,  0.05,  '{coupon}'),
  -- Deal rules
  ('D001', 'deal',      'deal_type_required',             true,  false, 0,     '{offer}'),
  ('D002', 'deal',      'regular_and_sale_price_required',true,  false, 0,     '{offer}'),
  ('D003', 'deal',      'quantity_required_for_multibuy', true,  true,  0.3,   '{offer}'),
  ('D004', 'deal',      'quantity_required_for_bogo',     true,  true,  0.3,   '{offer}'),
  ('D005', 'deal',      'unusually_high_savings',         false, true,  0,     '{offer,stack}'),
  -- Stack rules
  ('S001', 'stack',     'stack_type_required',            false, true,  0.1,   '{stack}'),
  ('S002', 'stack',     'cannot_confirm_stack_without_evidence', true, true, 0.3, '{stack}'),
  ('S003', 'stack',     'retailer_rule_conflict',         true,  true,  0.4,   '{stack}'),
  -- Regional rules
  ('G001', 'regional',  'offer_scope_required',           true,  false, 0,     '{offer,stack}'),
  ('G002', 'regional',  'no_exact_savings_without_location', false, true, 0.2, '{offer}'),
  ('G003', 'regional',  'unknown_scope_needs_verify_badge', false, false, 0.15,'{offer}'),
  -- Pricing rules
  ('PR001','pricing',   'price_at_recommendation_stored', false, false, 0.05,  '{offer,stack}'),
  ('PR002','pricing',   'stale_price_needs_recheck',      false, true,  0.2,   '{offer,stack}'),
  ('PR003','pricing',   'price_variance_detected',        false, true,  0.15,  '{offer}'),
  -- Evidence rules
  ('E001', 'evidence',  'source_url_or_reference_required', false, true, 0.1,  '{offer}'),
  ('E002', 'evidence',  'observed_at_required',           false, false, 0.05,  '{offer}'),
  ('E003', 'evidence',  'expired_offer_blocked',          true,  false, 1.0,   '{offer,stack,coupon}')
ON CONFLICT (rule_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- PHASE 13: CONFIDENCE SCORING FUNCTION
-- Returns 0–100 for any offer_source_id
-- Formula weights (must sum to 1.0):
--   product_match_quality   0.15
--   source_reliability      0.15
--   coupon_clarity          0.12
--   retailer_rule_compat    0.10
--   location_match          0.08
--   price_freshness         0.12
--   price_stability         0.10
--   expiration_certainty    0.08
--   stack_success_history   0.05
--   user_feedback_score     0.05
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_confidence_score(
  p_offer_source_id uuid
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_offer           public.offer_sources%ROWTYPE;
  v_src_rel         numeric(4,3) := 0.5;
  v_product_match   numeric(4,3) := 0.5;
  v_coupon_clarity  numeric(4,3) := 0.5;
  v_retailer_compat numeric(4,3) := 0.7;
  v_location_match  numeric(4,3) := 0.5;
  v_price_freshness numeric(4,3) := 0.7;
  v_price_stability numeric(4,3) := 1.0;
  v_expiry_cert     numeric(4,3) := 0.7;
  v_stack_success   numeric(4,3) := 0.5;
  v_user_feedback   numeric(4,3) := 0.5;
  v_raw_score       numeric;
  v_feedback_count  int := 0;
  v_worked_count    int := 0;
  v_hours_since_price numeric;
BEGIN
  SELECT * INTO v_offer FROM public.offer_sources WHERE id = p_offer_source_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Source reliability
  SELECT reliability_score INTO v_src_rel
  FROM public.source_reliability
  WHERE source_type = COALESCE(v_offer.source_type, 'flyer')
    AND source_key = v_offer.retailer_key
  LIMIT 1;
  v_src_rel := COALESCE(v_src_rel, 0.5);

  -- Product match quality (use stored value or infer)
  v_product_match := COALESCE(v_offer.product_match_quality, 0.5);

  -- Coupon clarity: requires terms + no vague BOGO
  IF v_offer.coupon_terms_text IS NOT NULL AND
     COALESCE(v_offer.bogo_terms_clear, true) = true THEN
    v_coupon_clarity := 0.9;
  ELSIF v_offer.coupon_terms_text IS NOT NULL THEN
    v_coupon_clarity := 0.65;
  ELSE
    v_coupon_clarity := 0.3;
  END IF;

  -- Retailer rule compatibility: if retailer_rules row exists → higher score
  SELECT CASE WHEN COUNT(*) > 0 THEN 0.9 ELSE 0.5 END
  INTO v_retailer_compat
  FROM public.retailer_rules
  WHERE retailer_key = v_offer.retailer_key;

  -- Location match: national=high, unknown=low
  v_location_match := CASE v_offer.offer_scope
    WHEN 'national'       THEN 0.9
    WHEN 'state'          THEN 0.75
    WHEN 'region'         THEN 0.70
    WHEN 'zip'            THEN 0.85  -- precise
    WHEN 'store_specific' THEN 0.85
    ELSE 0.35
  END;

  -- Price freshness: how many hours since last observed
  IF v_offer.price_observed_at IS NOT NULL THEN
    v_hours_since_price := EXTRACT(EPOCH FROM (now() - v_offer.price_observed_at)) / 3600;
    v_price_freshness := GREATEST(0, 1.0 - (v_hours_since_price / 168.0));  -- degrades over 1 week
  ELSE
    v_price_freshness := 0.5;
  END IF;

  -- Price stability: inverse of volatility
  v_price_stability := COALESCE(v_offer.volatility_score, 1.0);

  -- Expiration certainty
  IF v_offer.expires_on IS NULL THEN
    v_expiry_cert := 0.4;  -- unknown expiry = low certainty
  ELSIF v_offer.expires_on < CURRENT_DATE THEN
    v_expiry_cert := 0.0;  -- expired
  ELSIF v_offer.expires_on - CURRENT_DATE <= 2 THEN
    v_expiry_cert := 0.5;  -- expiring soon
  ELSE
    v_expiry_cert := 0.95;
  END IF;

  -- Stack success from stored value
  v_stack_success := COALESCE(v_offer.stack_success_score, 0.5);

  -- User feedback score
  SELECT COUNT(*), SUM(CASE WHEN outcome = 'worked' THEN 1 ELSE 0 END)
  INTO v_feedback_count, v_worked_count
  FROM public.user_deal_feedback
  WHERE offer_source_id = p_offer_source_id;

  IF v_feedback_count >= 3 THEN
    v_user_feedback := v_worked_count::numeric / v_feedback_count::numeric;
  ELSE
    v_user_feedback := 0.5;  -- not enough signal yet
  END IF;

  -- Weighted composite (weights sum to 1.0)
  v_raw_score :=
    (v_product_match   * 0.15) +
    (v_src_rel         * 0.15) +
    (v_coupon_clarity  * 0.12) +
    (v_retailer_compat * 0.10) +
    (v_location_match  * 0.08) +
    (v_price_freshness * 0.12) +
    (v_price_stability * 0.10) +
    (v_expiry_cert     * 0.08) +
    (v_stack_success   * 0.05) +
    (v_user_feedback   * 0.05);

  RETURN ROUND(v_raw_score * 100, 1);  -- returns 0–100
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 14: VALIDATION FUNCTION
-- Runs all rules, returns: status + badge + reason_codes
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.validate_offer(
  p_offer_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_offer       public.offer_sources%ROWTYPE;
  v_reasons     text[] := '{}';
  v_is_blocked  boolean := false;
  v_to_review   boolean := false;
  v_score       numeric;
  v_status      text;
  v_badge       text;
  v_penalty     numeric := 0;
BEGIN
  SELECT * INTO v_offer FROM public.offer_sources WHERE id = p_offer_source_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'offer_not_found');
  END IF;

  -- R001: retailer_key required
  IF v_offer.retailer_key IS NULL OR v_offer.retailer_key = '' THEN
    v_is_blocked := true; v_reasons := v_reasons || 'R001_retailer_key_missing';
  END IF;

  -- P001: product_name required
  IF v_offer.product_name IS NULL OR v_offer.product_name = '' THEN
    v_is_blocked := true; v_reasons := v_reasons || 'P001_product_name_missing';
  END IF;

  -- D001: deal type / offer_type required
  IF v_offer.offer_type IS NULL OR v_offer.offer_type = '' THEN
    v_is_blocked := true; v_reasons := v_reasons || 'D001_deal_type_missing';
  END IF;

  -- D002: regular + sale price required
  IF v_offer.regular_price_cents IS NULL OR v_offer.sale_price_cents IS NULL THEN
    v_is_blocked := true; v_reasons := v_reasons || 'D002_prices_missing';
  END IF;

  -- G001: offer_scope required
  IF v_offer.offer_scope IS NULL THEN
    v_is_blocked := true; v_reasons := v_reasons || 'G001_offer_scope_missing';
  END IF;

  -- E003: expired offer blocked
  IF v_offer.expires_on IS NOT NULL AND v_offer.expires_on < CURRENT_DATE THEN
    v_is_blocked := true; v_reasons := v_reasons || 'E003_offer_expired';
  END IF;

  -- D003/D004: quantity required for BOGO/multibuy
  IF v_offer.offer_type IN ('BOGO','bogo','multibuy','MULTIBUY') AND
     v_offer.quantity_required IS NULL AND v_offer.quantity_requirement IS NULL THEN
    v_is_blocked := true; v_reasons := v_reasons || 'D003_quantity_missing_for_bogo';
  END IF;

  -- C003: terms required for coupon stacks
  IF v_offer.stack_type IN ('sale_plus_coupon','full_stack') AND
     v_offer.coupon_terms_text IS NULL THEN
    v_is_blocked := true; v_reasons := v_reasons || 'C003_coupon_terms_missing_for_stack';
  END IF;

  -- S002: cannot confirm stack without evidence
  IF v_offer.stack_type NOT IN ('sale_only','unknown') AND
     (v_offer.evidence_json IS NULL OR v_offer.evidence_json = '{}') THEN
    v_is_blocked := true; v_reasons := v_reasons || 'S002_stack_unconfirmed_no_evidence';
  END IF;

  -- S003: retailer rule conflict — check retailer_rules.allow_stacking
  PERFORM 1 FROM public.retailer_rules
  WHERE retailer_key = v_offer.retailer_key
    AND (allow_stacking = false OR allow_stacking IS NULL)
  LIMIT 1;
  IF FOUND AND v_offer.stack_type NOT IN ('sale_only','unknown') THEN
    v_is_blocked := true; v_reasons := v_reasons || 'S003_retailer_rule_conflict';
  END IF;

  -- D005: unusually high savings (>70% off regular price)
  IF v_offer.regular_price_cents > 0 AND v_offer.sale_price_cents IS NOT NULL THEN
    IF (v_offer.regular_price_cents - v_offer.sale_price_cents)::numeric /
        v_offer.regular_price_cents > 0.70 THEN
      v_to_review := true; v_reasons := v_reasons || 'D005_unusually_high_savings';
    END IF;
  END IF;

  -- C005: vague BOGO terms
  IF v_offer.bogo_terms_clear = false THEN
    v_to_review := true; v_reasons := v_reasons || 'C005_vague_bogo_terms';
  END IF;

  -- PR002: stale price (>7 days)
  IF v_offer.price_observed_at IS NOT NULL AND
     now() - v_offer.price_observed_at > INTERVAL '7 days' THEN
    v_to_review := true; v_reasons := v_reasons || 'PR002_price_stale';
  END IF;

  -- PR003: price variance
  IF v_offer.price_variance_detected = true THEN
    v_to_review := true; v_reasons := v_reasons || 'PR003_price_variance';
  END IF;

  -- G003: unknown scope gets verify_locally badge
  IF v_offer.offer_scope = 'unknown' THEN
    v_to_review := true; v_reasons := v_reasons || 'G003_scope_unknown';
  END IF;

  -- P004: low product match
  IF COALESCE(v_offer.product_match_quality, 0) < 0.4 THEN
    v_to_review := true; v_reasons := v_reasons || 'P004_low_product_match';
  END IF;

  -- Compute final score
  v_score := public.compute_confidence_score(p_offer_source_id);

  -- Determine status + badge
  IF v_is_blocked OR v_score < 50 THEN
    v_status := 'blocked';
    v_badge  := 'needs_review';
  ELSIF v_to_review OR v_score < 70 THEN
    v_status := 'needs_review';
    v_badge  := CASE
      WHEN v_offer.offer_scope = 'unknown'  THEN 'verify_locally'
      WHEN v_offer.price_variance_detected  THEN 'price_may_vary'
      ELSE 'needs_review'
    END;
  ELSIF v_score < 85 THEN
    v_status := 'approved_with_caution';
    v_badge  := CASE
      WHEN v_offer.offer_scope IN ('state','region','zip') THEN 'verify_locally'
      WHEN v_offer.price_variance_detected               THEN 'price_may_vary'
      ELSE 'likely'
    END;
  ELSE
    v_status := 'auto_approved';
    v_badge  := 'confirmed';
  END IF;

  -- Persist validation result
  UPDATE public.offer_sources SET
    confidence_score_v2 = v_score / 100.0,
    confidence_score    = v_score / 100.0,
    validation_status   = v_status,
    user_badge          = v_badge,
    reason_codes        = v_reasons,
    last_verified_at    = now()
  WHERE id = p_offer_source_id;

  -- Log validation event
  INSERT INTO public.validation_events
    (offer_source_id, event_type, old_status, new_status, new_score, actor_type, reason_codes)
  VALUES
    (p_offer_source_id, 'scored', v_offer.validation_status, v_status,
     v_score/100.0, 'system', v_reasons);

  RETURN jsonb_build_object(
    'offer_id',        p_offer_source_id,
    'confidence_score', v_score,
    'validation_status', v_status,
    'user_badge',      v_badge,
    'reason_codes',    v_reasons,
    'is_blocked',      v_is_blocked,
    'needs_review',    v_to_review
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 15: PUBLISH GATE FUNCTION
-- Single entry point for all publishing decisions
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.publish_gate(
  p_offer_source_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_result  jsonb;
  v_status  text;
  v_score   numeric;
BEGIN
  -- Run full validation
  v_result := public.validate_offer(p_offer_source_id);
  v_status := v_result->>'validation_status';
  v_score  := (v_result->>'confidence_score')::numeric;

  -- Route to review queue if needed
  IF v_status IN ('needs_review', 'blocked') THEN
    INSERT INTO public.deal_review_queue
      (offer_source_id, trigger_reason, reason_codes, confidence_score, review_type, priority)
    VALUES (
      p_offer_source_id,
      CASE WHEN v_status = 'blocked' THEN 'low_confidence' ELSE 'validation_flags' END,
      ARRAY(SELECT jsonb_array_elements_text(v_result->'reason_codes')),
      v_score / 100.0,
      'human',
      CASE WHEN v_status = 'blocked' THEN 3 ELSE 5 END
    )
    ON CONFLICT DO NOTHING;
  END IF;

  -- Auto-publish if approved
  IF v_status = 'auto_approved' THEN
    UPDATE public.offer_sources SET
      published_at   = now(),
      auto_published = true
    WHERE id = p_offer_source_id;

    INSERT INTO public.validation_events
      (offer_source_id, event_type, new_status, actor_type, notes)
    VALUES (p_offer_source_id, 'published', 'auto_approved', 'system', 'auto-published by publish_gate');
  END IF;

  RETURN v_result || jsonb_build_object('publish_action',
    CASE v_status
      WHEN 'auto_approved'         THEN 'published'
      WHEN 'approved_with_caution' THEN 'published_with_badge'
      WHEN 'needs_review'          THEN 'queued_for_review'
      ELSE                              'blocked'
    END
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 16: PRICE VOLATILITY FUNCTION
-- Updates volatility_score + price_variance_detected
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_price_volatility(
  p_offer_source_id uuid,
  p_window_days     int DEFAULT 14
)
RETURNS numeric
LANGUAGE plpgsql
AS $$
DECLARE
  v_offer         public.offer_sources%ROWTYPE;
  v_min_price     int;
  v_max_price     int;
  v_avg_price     numeric;
  v_variance_pct  numeric;
  v_volatility    numeric;
BEGIN
  SELECT * INTO v_offer FROM public.offer_sources WHERE id = p_offer_source_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  SELECT
    MIN(observed_price_cents),
    MAX(observed_price_cents),
    AVG(observed_price_cents)
  INTO v_min_price, v_max_price, v_avg_price
  FROM public.price_observations
  WHERE normalized_key = v_offer.normalized_key
    AND retailer_key   = v_offer.retailer_key
    AND observed_at   >= now() - (p_window_days || ' days')::interval;

  IF v_avg_price IS NULL OR v_avg_price = 0 THEN
    RETURN 1.0;  -- no data = assume stable
  END IF;

  v_variance_pct := (v_max_price - v_min_price)::numeric / v_avg_price;

  -- volatility_score: 1.0 = perfectly stable, 0 = highly volatile
  v_volatility := GREATEST(0, 1.0 - (v_variance_pct * 3));

  -- Flag variance if > 10%
  UPDATE public.offer_sources SET
    volatility_score        = v_volatility,
    price_variance_detected = (v_variance_pct > 0.10),
    latest_observed_price   = (
      SELECT observed_price_cents FROM public.price_observations
      WHERE normalized_key = v_offer.normalized_key
        AND retailer_key   = v_offer.retailer_key
      ORDER BY observed_at DESC LIMIT 1
    ),
    price_observed_at = now()
  WHERE id = p_offer_source_id;

  RETURN v_volatility;
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 17: MARKET READINESS FUNCTION
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.compute_market_readiness(
  p_state       text,
  p_zip_code    text DEFAULT NULL,
  p_retailer    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  v_offer_count   int;
  v_verified      int;
  v_avg_conf      numeric;
  v_coupon_count  int;
  v_retailers     int;
  v_score         numeric;
  v_status        text;
BEGIN
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE validation_status = 'auto_approved'),
    AVG(confidence_score_v2)
  INTO v_offer_count, v_verified, v_avg_conf
  FROM public.offer_sources
  WHERE (state = p_state OR offer_scope = 'national')
    AND (p_retailer IS NULL OR retailer_key = p_retailer)
    AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
    AND validation_status NOT IN ('blocked','expired');

  SELECT COUNT(*) INTO v_coupon_count
  FROM public.digital_coupons
  WHERE is_active = true
    AND (offer_scope = 'national' OR state = p_state)
    AND (expires_at IS NULL OR expires_at > now());

  SELECT COUNT(DISTINCT retailer_key) INTO v_retailers
  FROM public.offer_sources
  WHERE (state = p_state OR offer_scope = 'national')
    AND validation_status NOT IN ('blocked','expired');

  -- Market readiness formula (0–100)
  v_score :=
    LEAST(100, (
      LEAST(30, v_offer_count * 0.5) +         -- up to 30 pts for offer volume
      LEAST(20, v_verified * 1.0) +             -- up to 20 pts for verified offers
      LEAST(20, COALESCE(v_avg_conf,0) * 20) +  -- up to 20 pts for confidence average
      LEAST(15, v_coupon_count * 0.3) +         -- up to 15 pts for coupon coverage
      LEAST(15, v_retailers * 3)                -- up to 15 pts for retailer variety
    ));

  v_status := CASE
    WHEN v_score >= 80 THEN 'demo_ready'
    WHEN v_score >= 60 THEN 'demo_with_caution'
    ELSE 'national_generic_only'
  END;

  -- Update retailer_coverage
  UPDATE public.retailer_coverage SET
    active_offer_count     = v_offer_count,
    confidence_average     = COALESCE(v_avg_conf, 0),
    market_readiness_score = v_score / 100.0,
    updated_at             = now()
  WHERE state = p_state AND (p_retailer IS NULL OR retailer_key = p_retailer);

  RETURN jsonb_build_object(
    'state',               p_state,
    'retailer',            p_retailer,
    'market_readiness_score', v_score,
    'status',              v_status,
    'active_offers',       v_offer_count,
    'verified_offers',     v_verified,
    'avg_confidence',      ROUND(COALESCE(v_avg_conf, 0) * 100, 1),
    'coupon_count',        v_coupon_count,
    'retailers_covered',   v_retailers,
    'demo_state',          p_state,
    'fallback_to_national', (v_score < 60)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 18: FEEDBACK LOOP FUNCTION
-- Called after user submits deal feedback — updates all scores
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.process_deal_feedback(
  p_user_id         uuid,
  p_offer_source_id uuid,
  p_outcome         text,
  p_actual_cents    int DEFAULT NULL,
  p_predicted_cents int DEFAULT NULL,
  p_store_id        text DEFAULT NULL,
  p_zip_code        text DEFAULT NULL,
  p_state           text DEFAULT NULL,
  p_notes           text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_total_feedback  int;
  v_worked          int;
  v_new_stack_score numeric;
BEGIN
  -- Insert feedback row
  INSERT INTO public.user_deal_feedback
    (user_id, offer_source_id, outcome, actual_savings_cents, predicted_savings_cents,
     store_id, zip_code, state, notes)
  VALUES
    (p_user_id, p_offer_source_id, p_outcome, p_actual_cents, p_predicted_cents,
     p_store_id, p_zip_code, p_state, p_notes);

  -- Recount outcomes for this offer
  SELECT COUNT(*), SUM(CASE WHEN outcome='worked' THEN 1 ELSE 0 END)
  INTO v_total_feedback, v_worked
  FROM public.user_deal_feedback
  WHERE offer_source_id = p_offer_source_id;

  -- Update stack_success_score on offer
  IF v_total_feedback >= 2 THEN
    v_new_stack_score := v_worked::numeric / v_total_feedback::numeric;
    UPDATE public.offer_sources SET
      stack_success_score = v_new_stack_score
    WHERE id = p_offer_source_id;
  END IF;

  -- Update source_reliability if outcome = 'worked' or failure
  IF p_outcome = 'worked' THEN
    UPDATE public.source_reliability SET
      confirmed_deals = confirmed_deals + 1,
      total_deals     = total_deals + 1,
      reliability_score = LEAST(0.98, (confirmed_deals + 1.0) / (total_deals + 1.0)),
      last_confirmed_at = now(),
      updated_at      = now()
    WHERE source_key IN (
      SELECT retailer_key FROM public.offer_sources WHERE id = p_offer_source_id
    );
  ELSIF p_outcome IN ('coupon_failed','wrong_price','register_rejected') THEN
    UPDATE public.source_reliability SET
      failed_deals  = failed_deals + 1,
      total_deals   = total_deals + 1,
      reliability_score = GREATEST(0.1,
        (confirmed_deals)::numeric / GREATEST(1, total_deals + 1)::numeric
      ),
      updated_at = now()
    WHERE source_key IN (
      SELECT retailer_key FROM public.offer_sources WHERE id = p_offer_source_id
    );
  END IF;

  -- Log validation event
  INSERT INTO public.validation_events
    (offer_source_id, event_type, actor_type, actor_id, notes, evidence_json)
  VALUES (
    p_offer_source_id,
    'user_' || p_outcome,
    'user',
    p_user_id::text,
    p_notes,
    jsonb_build_object(
      'actual_cents', p_actual_cents,
      'predicted_cents', p_predicted_cents,
      'store_id', p_store_id,
      'zip', p_zip_code
    )
  );

  -- Re-score the offer
  PERFORM public.validate_offer(p_offer_source_id);

  RETURN jsonb_build_object(
    'feedback_recorded', true,
    'offer_id', p_offer_source_id,
    'total_feedback', v_total_feedback,
    'new_stack_score', v_new_stack_score
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 19: VIEWS
-- Drop first so CREATE OR REPLACE can redefine column lists cleanly
-- ─────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS public.v_deal_review_dashboard CASCADE;
DROP VIEW IF EXISTS public.v_offer_price_history CASCADE;
DROP VIEW IF EXISTS public.v_active_offers CASCADE;

-- v_active_offers: display-ready, scored, filtered offers
CREATE OR REPLACE VIEW public.v_active_offers AS
SELECT
  os.id,
  os.retailer_key,
  os.product_name,
  os.brand,
  os.size,
  os.category,
  os.offer_type,
  os.sale_price_cents,
  os.regular_price_cents,
  os.coupon_value_cents,
  os.final_estimated_cents,
  os.stack_type,
  os.offer_scope,
  os.state,
  os.zip_code,
  os.market_region,
  os.expires_on,
  -- Scores
  ROUND(COALESCE(os.confidence_score_v2, os.confidence_score, 0) * 100, 1) AS confidence_pct,
  os.validation_status,
  os.user_badge,
  os.reason_codes,
  -- Price
  os.price_variance_detected,
  os.latest_observed_price,
  os.price_observed_at,
  -- Meta
  os.source_type,
  os.source_url,
  os.last_verified_at,
  os.published_at,
  os.created_at
FROM public.offer_sources os
WHERE
  os.validation_status IN ('auto_approved', 'approved_with_caution')
  AND (os.expires_on IS NULL OR os.expires_on >= CURRENT_DATE)
  AND os.published_at IS NOT NULL;

-- v_offer_price_history: trend view for a product/retailer
CREATE OR REPLACE VIEW public.v_offer_price_history AS
SELECT
  po.normalized_key,
  po.retailer_key,
  po.product_name,
  po.observed_price_cents,
  po.regular_price_cents,
  po.sale_price_cents,
  po.store_id,
  po.zip_code,
  po.state,
  po.source_type,
  po.observed_at,
  LAG(po.observed_price_cents) OVER (
    PARTITION BY po.normalized_key, po.retailer_key
    ORDER BY po.observed_at
  ) AS prev_price_cents,
  po.observed_price_cents -
    LAG(po.observed_price_cents) OVER (
      PARTITION BY po.normalized_key, po.retailer_key
      ORDER BY po.observed_at
    ) AS price_delta_cents
FROM public.price_observations po;

-- v_deal_review_dashboard: admin review queue with enriched data
CREATE OR REPLACE VIEW public.v_deal_review_dashboard AS
SELECT
  drq.id AS review_id,
  drq.trigger_reason,
  drq.reason_codes,
  ROUND(COALESCE(drq.confidence_score, 0) * 100, 1) AS confidence_pct,
  drq.review_type,
  drq.review_status,
  drq.priority,
  drq.created_at AS queued_at,
  os.retailer_key,
  os.product_name,
  os.brand,
  os.offer_type,
  os.sale_price_cents,
  os.regular_price_cents,
  os.offer_scope,
  os.state,
  os.user_badge,
  os.expires_on,
  os.source_url
FROM public.deal_review_queue drq
LEFT JOIN public.offer_sources os ON os.id = drq.offer_source_id
WHERE drq.review_status IN ('pending', 'in_progress')
ORDER BY drq.priority ASC, drq.created_at ASC;

-- ─────────────────────────────────────────────────────────────
-- PHASE 20: PRICE STALENESS AUTO-FLAG (pg_cron compatible)
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.flag_stale_prices()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- Mark offers where price_observed_at is > 7 days old
  UPDATE public.offer_sources SET
    validation_status = CASE
      WHEN validation_status = 'auto_approved' THEN 'needs_review'
      ELSE validation_status
    END,
    reason_codes = CASE
      WHEN NOT ('PR002_price_stale' = ANY(reason_codes))
      THEN reason_codes || ARRAY['PR002_price_stale']
      ELSE reason_codes
    END
  WHERE
    price_observed_at IS NOT NULL
    AND now() - price_observed_at > INTERVAL '7 days'
    AND validation_status NOT IN ('blocked', 'expired', 'retracted');

  -- Block expired offers
  UPDATE public.offer_sources SET
    validation_status = 'blocked',
    user_badge        = 'expired',
    reason_codes      = reason_codes || ARRAY['E003_offer_expired']
  WHERE
    expires_on IS NOT NULL
    AND expires_on < CURRENT_DATE
    AND validation_status NOT IN ('blocked','retracted','expired');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 21: RLS ON NEW TABLES (existing offer_sources RLS stays)
-- ─────────────────────────────────────────────────────────────

ALTER TABLE public.offer_sources ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY offer_sources_public_read
    ON public.offer_sources FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY offer_sources_admin_all
    ON public.offer_sources FOR ALL
    USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY offer_sources_system_insert
    ON public.offer_sources FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 22: INDEXES FOR PERFORMANCE
-- ─────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_offer_sources_retailer_badge
  ON public.offer_sources (retailer_key, user_badge, expires_on);
CREATE INDEX IF NOT EXISTS idx_offer_sources_state_badge
  ON public.offer_sources (state, user_badge, confidence_score DESC);
CREATE INDEX IF NOT EXISTS idx_offer_sources_published
  ON public.offer_sources (published_at DESC, validation_status);
CREATE INDEX IF NOT EXISTS idx_validation_events_created
  ON public.validation_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_outcome
  ON public.user_deal_feedback (outcome, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_retailer_coverage_readiness
  ON public.retailer_coverage (market_readiness_score DESC, state);

-- ─────────────────────────────────────────────────────────────
-- PHASE 23: VERIFICATION
-- ─────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_tables text[] := ARRAY[
    'offer_sources', 'flyer_deal_staging', 'stack_candidates', 'digital_coupons',
    'price_observations', 'validation_events', 'user_deal_feedback',
    'source_reliability', 'retailer_coverage', 'deal_review_queue', 'validation_rules'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY v_tables LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t) THEN
      RAISE EXCEPTION 'MISSING TABLE: %', t;
    END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'compute_confidence_score') THEN
    RAISE EXCEPTION 'MISSING FUNCTION: compute_confidence_score';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'validate_offer') THEN
    RAISE EXCEPTION 'MISSING FUNCTION: validate_offer';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'publish_gate') THEN
    RAISE EXCEPTION 'MISSING FUNCTION: publish_gate';
  END IF;

  RAISE NOTICE 'DEAL INTELLIGENCE LAYER ✓ — all tables, functions, and indexes verified.';
END;
$$;
