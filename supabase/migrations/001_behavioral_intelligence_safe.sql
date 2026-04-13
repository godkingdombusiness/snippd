-- ============================================================
-- Snippd — Behavioral Intelligence Safe Migration
-- Idempotent: safe to run on a fresh DB or over existing tables
-- Consolidates: 001_behavioral_intelligence.sql +
--               20260412_behavioral_cart_engine.sql
-- Plus new: retailer_rules table, smart_alerts, analytics views
-- ============================================================

-- ============================================================
-- 1. CORE EVENT STREAM
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_stream (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        REFERENCES auth.users NOT NULL,
  household_id  uuid        REFERENCES public.households(id),
  session_id    uuid        NOT NULL,
  event_name    text        NOT NULL,
  timestamp     timestamptz DEFAULT now(),
  screen_name   text,
  object_type   text,
  object_id     uuid,
  retailer_key  text,
  category      text,
  brand         text,
  rank_position int,
  model_version text,
  explanation_shown boolean DEFAULT false,
  metadata      jsonb       DEFAULT '{}',
  context       jsonb       DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_es_user_time
  ON public.event_stream (user_id, timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_es_event_name
  ON public.event_stream (event_name, timestamp DESC);

-- ============================================================
-- 2. RECOMMENDATION EXPOSURES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.recommendation_exposures (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        REFERENCES auth.users NOT NULL,
  session_id          uuid        NOT NULL,
  recommendation_type text        NOT NULL,
  object_type         text        NOT NULL,
  object_id           uuid        NOT NULL,
  rank_position       int,
  score               numeric,
  model_version       text,
  explanation         text,
  reason_codes        jsonb       DEFAULT '[]',
  shown_at            timestamptz DEFAULT now(),
  clicked_at          timestamptz,
  accepted_at         timestamptz,
  dismissed_at        timestamptz,
  outcome_status      text        DEFAULT 'shown'
);

CREATE INDEX IF NOT EXISTS idx_rec_exp_user
  ON public.recommendation_exposures (user_id, shown_at DESC);

-- ============================================================
-- 3. MODEL PREDICTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.model_predictions (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users NOT NULL,
  prediction_type text        NOT NULL,
  object_id       uuid,
  score           numeric     NOT NULL,
  model_version   text        NOT NULL,
  input_snapshot  jsonb       DEFAULT '{}',
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_model_pred_user
  ON public.model_predictions (user_id, created_at DESC);

-- ============================================================
-- 4. USER PREFERENCE SCORES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_preference_scores (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        REFERENCES auth.users NOT NULL,
  preference_key  text        NOT NULL,
  category        text        NOT NULL DEFAULT '',
  brand           text        NOT NULL DEFAULT '',
  retailer_key    text        NOT NULL DEFAULT '',
  score           numeric     NOT NULL DEFAULT 0,
  normalized_score numeric    NOT NULL DEFAULT 0,
  last_updated    timestamptz NOT NULL DEFAULT now()
);

-- Add normalized_score if table existed without it
ALTER TABLE public.user_preference_scores
  ADD COLUMN IF NOT EXISTS normalized_score numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preference_scores_context
  ON public.user_preference_scores (user_id, preference_key, category, brand, retailer_key);

-- Drop old single-column unique constraint if present
ALTER TABLE public.user_preference_scores
  DROP CONSTRAINT IF EXISTS user_preference_scores_user_id_preference_key_key;

-- ============================================================
-- 5. USER STATE SNAPSHOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_state_snapshots (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users NOT NULL UNIQUE,
  snapshot    jsonb       NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 6. WEALTH MOMENTUM SNAPSHOTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.wealth_momentum_snapshots (
  id                       uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid          REFERENCES auth.users NOT NULL,
  timestamp                timestamptz   DEFAULT now(),
  realized_savings         numeric(12,2),
  inflation_offset         numeric(12,2),
  waste_reduction_score    numeric(5,2),
  velocity_score           numeric(5,2),
  projected_annual_wealth  numeric(12,2),
  budget_stress_alert      boolean       NOT NULL DEFAULT false,
  budget_stress_score      numeric(5,2)  NOT NULL DEFAULT 0,
  math_version             text,
  usda_cpi_reference_date  date
);

CREATE INDEX IF NOT EXISTS idx_wealth_user_time
  ON public.wealth_momentum_snapshots (user_id, timestamp DESC);

-- ============================================================
-- 7. EVENT WEIGHT CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS public.event_weight_config (
  event_name text        PRIMARY KEY,
  weight     numeric     NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_weight_config (event_name, weight) VALUES
  ('recommendation_shown',      0.05),
  ('recommendation_clicked',    0.25),
  ('recommendation_dismissed', -0.10),
  ('coupon_viewed',             0.10),
  ('coupon_clipped',            0.40),
  ('coupon_redeemed',           0.80),
  ('coupon_expired',           -0.05),
  ('item_viewed',               0.03),
  ('item_added_to_cart',        0.55),
  ('item_removed_from_cart',   -0.30),
  ('item_substituted',          0.20),
  ('checkout_started',          0.05),
  ('checkout_completed',        0.75),
  ('purchase_completed',        1.00),
  ('cart_accepted',             0.70),
  ('cart_rejected',            -0.60),
  ('stack_viewed',              0.15),
  ('stack_applied',             0.65),
  ('stack_dismissed',          -0.40),
  ('receipt_uploaded',          0.10),
  ('search_performed',          0.02),
  ('preference_changed',        0.05),
  ('store_selected',            0.10),
  ('store_deselected',         -0.05),
  ('budget_set',                0.15),
  ('budget_exceeded',          -0.20),
  ('wealth_snapshot_viewed',    0.05),
  ('smart_alert_shown',         0.02),
  ('smart_alert_dismissed',    -0.02),
  ('onboarding_completed',      0.30)
ON CONFLICT (event_name) DO NOTHING;

-- ============================================================
-- 8. RETAILER COUPON PARAMETERS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.retailer_coupon_parameters (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key   text        NOT NULL,
  policy_key     text        NOT NULL,
  policy_value   jsonb       NOT NULL DEFAULT '{}',
  effective_from date        DEFAULT current_date,
  effective_to   date,
  inserted_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retailer_policy_key
  ON public.retailer_coupon_parameters (retailer_key, policy_key);

-- ============================================================
-- 9. RETAILER RULES (granular stacking rules)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.retailer_rules (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key   text        NOT NULL,
  rule_key       text        NOT NULL,
  rule_value     jsonb       NOT NULL DEFAULT '{}',
  priority       int         NOT NULL DEFAULT 0,
  effective_from date        DEFAULT current_date,
  effective_to   date,
  inserted_at    timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_retailer_rules_key
  ON public.retailer_rules (retailer_key, rule_key);

-- ============================================================
-- 10. OFFER MATCHES + STACK RESULTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.offer_matches (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users NOT NULL,
  retailer_key text        NOT NULL,
  candidates   jsonb       NOT NULL,
  budget_cents numeric     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_matches_user
  ON public.offer_matches (user_id, retailer_key);

CREATE TABLE IF NOT EXISTS public.stack_results (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        REFERENCES auth.users NOT NULL,
  retailer_key     text        NOT NULL,
  model_version    text        NOT NULL,
  variant_type     text        NOT NULL,
  candidate        jsonb       NOT NULL,
  budget_fit       numeric     NOT NULL,
  preference_fit   numeric     NOT NULL,
  simplicity_score numeric     NOT NULL,
  score            numeric     NOT NULL,
  feature_vector   jsonb       DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_results_user
  ON public.stack_results (user_id, retailer_key, variant_type, created_at DESC);

-- ============================================================
-- 11. SMART ALERTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.smart_alerts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users NOT NULL,
  alert_type   text        NOT NULL,
  message      text        NOT NULL,
  metadata     jsonb       DEFAULT '{}',
  shown_at     timestamptz,
  dismissed_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_smart_alerts_user
  ON public.smart_alerts (user_id, created_at DESC);

-- ============================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.event_stream ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "event_stream_select_own" ON public.event_stream;
CREATE POLICY "event_stream_select_own"
  ON public.event_stream FOR SELECT TO authenticated USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "event_stream_insert_own" ON public.event_stream;
CREATE POLICY "event_stream_insert_own"
  ON public.event_stream FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.recommendation_exposures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "recommendation_exposures_select_own" ON public.recommendation_exposures;
CREATE POLICY "recommendation_exposures_select_own"
  ON public.recommendation_exposures FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "model_predictions_select_own" ON public.model_predictions;
CREATE POLICY "model_predictions_select_own"
  ON public.model_predictions FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.user_preference_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_preference_scores_select_own" ON public.user_preference_scores;
CREATE POLICY "user_preference_scores_select_own"
  ON public.user_preference_scores FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.user_state_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user_state_snapshots_select_own" ON public.user_state_snapshots;
CREATE POLICY "user_state_snapshots_select_own"
  ON public.user_state_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.wealth_momentum_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "wealth_momentum_snapshots_select_own" ON public.wealth_momentum_snapshots;
CREATE POLICY "wealth_momentum_snapshots_select_own"
  ON public.wealth_momentum_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);

ALTER TABLE public.smart_alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "smart_alerts_select_own" ON public.smart_alerts;
CREATE POLICY "smart_alerts_select_own"
  ON public.smart_alerts FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ============================================================
-- 13. PREFERENCE UPSERT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_event_stream_preference_upsert()
RETURNS trigger AS $$
DECLARE
  v_weight       numeric := 0;
  normalized_evt text    := lower(NEW.event_name);
BEGIN
  SELECT weight INTO v_weight
  FROM public.event_weight_config
  WHERE event_name = normalized_evt;

  IF v_weight IS NULL THEN
    v_weight := 0;
  END IF;

  INSERT INTO public.user_preference_scores (
    user_id, preference_key, category, brand, retailer_key, score, last_updated
  ) VALUES (
    NEW.user_id,
    normalized_evt,
    COALESCE(NEW.category,     ''),
    COALESCE(NEW.brand,        ''),
    COALESCE(NEW.retailer_key, ''),
    v_weight,
    now()
  ) ON CONFLICT (user_id, preference_key, category, brand, retailer_key)
    DO UPDATE SET
      score        = public.user_preference_scores.score + EXCLUDED.score,
      last_updated = EXCLUDED.last_updated;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_stream_preference ON public.event_stream;
CREATE TRIGGER trg_event_stream_preference
  AFTER INSERT ON public.event_stream
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_event_stream_preference_upsert();

-- ============================================================
-- 14. ANALYTICS VIEWS
-- ============================================================

CREATE OR REPLACE VIEW public.v_user_preference_summary AS
SELECT
  user_id,
  preference_key,
  category,
  brand,
  retailer_key,
  score,
  normalized_score,
  last_updated,
  ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY score DESC) AS preference_rank
FROM public.user_preference_scores;

CREATE OR REPLACE VIEW public.v_stack_performance AS
SELECT
  retailer_key,
  variant_type,
  ROUND(AVG(score)::numeric,            4) AS avg_score,
  ROUND(AVG(budget_fit)::numeric,       4) AS avg_budget_fit,
  ROUND(AVG(preference_fit)::numeric,   4) AS avg_preference_fit,
  ROUND(AVG(simplicity_score)::numeric, 4) AS avg_simplicity,
  COUNT(*)                                 AS total_computed,
  MAX(created_at)                          AS last_computed_at
FROM public.stack_results
GROUP BY retailer_key, variant_type;

CREATE OR REPLACE VIEW public.v_recommendation_funnel AS
SELECT
  recommendation_type,
  model_version,
  COUNT(*)                                                                        AS total_shown,
  COUNT(clicked_at)                                                               AS total_clicked,
  COUNT(accepted_at)                                                              AS total_accepted,
  COUNT(dismissed_at)                                                             AS total_dismissed,
  ROUND(COUNT(clicked_at)::numeric  / NULLIF(COUNT(*), 0) * 100, 2)              AS click_rate_pct,
  ROUND(COUNT(accepted_at)::numeric / NULLIF(COUNT(*), 0) * 100, 2)              AS accept_rate_pct
FROM public.recommendation_exposures
GROUP BY recommendation_type, model_version;

-- ============================================================
-- 15. RETAILER COUPON PARAMETERS — SEED
-- ============================================================

INSERT INTO public.retailer_coupon_parameters (retailer_key, policy_key, policy_value)
VALUES
  ('target',  'max_stack_items',          '{"value": 8}'),
  ('target',  'allowed_coupon_types',     '{"value": ["manufacturer", "store", "digital"]}'),
  ('target',  'max_total_coupon_value',   '{"value": 15000}'),
  ('target',  'max_manufacturer_coupons', '{"value": 1}'),
  ('target',  'max_store_coupons',        '{"value": 1}'),
  ('target',  'rounding_mode',            '{"value": "floor"}'),

  ('walmart', 'max_stack_items',          '{"value": 10}'),
  ('walmart', 'allowed_coupon_types',     '{"value": ["manufacturer", "store"]}'),
  ('walmart', 'max_total_coupon_value',   '{"value": 12000}'),
  ('walmart', 'max_manufacturer_coupons', '{"value": 1}'),
  ('walmart', 'max_store_coupons',        '{"value": 1}'),
  ('walmart', 'rounding_mode',            '{"value": "floor"}'),

  ('cvs',     'max_stack_items',          '{"value": 6}'),
  ('cvs',     'allowed_coupon_types',     '{"value": ["manufacturer", "digital"]}'),
  ('cvs',     'max_total_coupon_value',   '{"value": 9000}'),
  ('cvs',     'max_manufacturer_coupons', '{"value": 1}'),
  ('cvs',     'max_store_coupons',        '{"value": 0}'),
  ('cvs',     'rounding_mode',            '{"value": "floor"}'),

  ('publix',  'max_stack_items',          '{"value": 7}'),
  ('publix',  'allowed_coupon_types',     '{"value": ["manufacturer", "digital", "store"]}'),
  ('publix',  'max_total_coupon_value',   '{"value": 10000}'),
  ('publix',  'max_manufacturer_coupons', '{"value": 1}'),
  ('publix',  'max_store_coupons',        '{"value": 1}'),
  ('publix',  'rounding_mode',            '{"value": "round"}'),

  ('kroger',  'max_stack_items',          '{"value": 8}'),
  ('kroger',  'allowed_coupon_types',     '{"value": ["manufacturer", "store", "digital"]}'),
  ('kroger',  'max_total_coupon_value',   '{"value": 12000}'),
  ('kroger',  'max_manufacturer_coupons', '{"value": 1}'),
  ('kroger',  'max_store_coupons',        '{"value": 1}'),
  ('kroger',  'rounding_mode',            '{"value": "floor"}')
ON CONFLICT DO NOTHING;

-- ============================================================
-- 16. RETAILER RULES — SEED
-- ============================================================

INSERT INTO public.retailer_rules (retailer_key, rule_key, rule_value, priority)
VALUES
  -- Publix: BOGO + coupon blocked, everything else allowed
  ('publix',  'block_bogo_and_coupon',  '{"value": true}',  10),
  ('publix',  'block_sale_and_digital', '{"value": false}', 10),
  ('publix',  'block_sale_and_loyalty', '{"value": false}', 10),

  -- Walmart: sale + digital blocked
  ('walmart', 'block_sale_and_digital', '{"value": true}',  10),
  ('walmart', 'block_bogo_and_coupon',  '{"value": false}', 10),
  ('walmart', 'block_sale_and_loyalty', '{"value": false}', 10),

  -- CVS: everything allowed
  ('cvs',     'block_sale_and_digital', '{"value": false}', 10),
  ('cvs',     'block_bogo_and_coupon',  '{"value": false}', 10),
  ('cvs',     'block_sale_and_loyalty', '{"value": false}', 10),

  -- Target: everything allowed
  ('target',  'block_sale_and_digital', '{"value": false}', 10),
  ('target',  'block_bogo_and_coupon',  '{"value": false}', 10),
  ('target',  'block_sale_and_loyalty', '{"value": false}', 10),

  -- Kroger: BOGO + coupon allowed (BOGO stacks with coupons)
  ('kroger',  'block_sale_and_digital', '{"value": false}', 10),
  ('kroger',  'block_bogo_and_coupon',  '{"value": false}', 10),
  ('kroger',  'block_sale_and_loyalty', '{"value": false}', 10)
ON CONFLICT (retailer_key, rule_key) DO NOTHING;
