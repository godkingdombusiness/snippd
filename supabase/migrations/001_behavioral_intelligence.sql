CREATE TABLE IF NOT EXISTS public.event_stream (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  household_id uuid REFERENCES public.households(id),
  session_id uuid NOT NULL,
  event_name text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  screen_name text,
  object_type text,
  object_id uuid,
  retailer_key text,
  category text,
  brand text,
  rank_position int,
  model_version text,
  explanation_shown boolean DEFAULT false,
  metadata jsonb DEFAULT '{}',
  context jsonb DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_es_user_time ON event_stream(user_id, timestamp DESC);

CREATE TABLE IF NOT EXISTS public.recommendation_exposures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  session_id uuid NOT NULL,
  recommendation_type text NOT NULL,
  object_type text NOT NULL,
  object_id uuid NOT NULL,
  rank_position int,
  score numeric,
  model_version text,
  explanation text,
  reason_codes jsonb DEFAULT '[]',
  shown_at timestamptz DEFAULT now(),
  clicked_at timestamptz,
  accepted_at timestamptz,
  dismissed_at timestamptz,
  outcome_status text DEFAULT 'shown'
);

CREATE TABLE IF NOT EXISTS public.model_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  prediction_type text NOT NULL,
  object_id uuid,
  score numeric NOT NULL,
  model_version text NOT NULL,
  input_snapshot jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_preference_scores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  preference_key text NOT NULL,
  category text NOT NULL DEFAULT '',
  brand text NOT NULL DEFAULT '',
  retailer_key text NOT NULL DEFAULT '',
  score numeric NOT NULL DEFAULT 0,
  last_updated timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, preference_key, category, brand, retailer_key)
);

CREATE TABLE IF NOT EXISTS public.user_state_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL UNIQUE,
  snapshot jsonb NOT NULL,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.wealth_momentum_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  timestamp timestamptz DEFAULT now(),
  realized_savings numeric(12,2),
  inflation_offset numeric(12,2),
  waste_reduction_score numeric(5,2),
  velocity_score numeric(5,2),
  projected_annual_wealth numeric(12,2),
  budget_stress_alert boolean NOT NULL DEFAULT false,
  budget_stress_score numeric(5,2) NOT NULL DEFAULT 0,
  math_version text,
  usda_cpi_reference_date date
);

CREATE INDEX IF NOT EXISTS idx_wealth_user_time ON wealth_momentum_snapshots(user_id, timestamp DESC);

ALTER TABLE public.event_stream ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "event_stream_select_own" ON public.event_stream;
CREATE POLICY "event_stream_select_own"
  ON public.event_stream FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "event_stream_insert_own" ON public.event_stream;
CREATE POLICY "event_stream_insert_own"
  ON public.event_stream FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.recommendation_exposures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recommendation_exposures_select_own" ON public.recommendation_exposures;
CREATE POLICY "recommendation_exposures_select_own"
  ON public.recommendation_exposures FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.model_predictions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "model_predictions_select_own" ON public.model_predictions;
CREATE POLICY "model_predictions_select_own"
  ON public.model_predictions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.user_preference_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_preference_scores_select_own" ON public.user_preference_scores;
CREATE POLICY "user_preference_scores_select_own"
  ON public.user_preference_scores FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.user_state_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_state_snapshots_select_own" ON public.user_state_snapshots;
CREATE POLICY "user_state_snapshots_select_own"
  ON public.user_state_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

ALTER TABLE public.wealth_momentum_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wealth_momentum_snapshots_select_own" ON public.wealth_momentum_snapshots;
CREATE POLICY "wealth_momentum_snapshots_select_own"
  ON public.wealth_momentum_snapshots FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.event_weight_config (
  event_name text PRIMARY KEY,
  weight numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.event_weight_config (event_name, weight) VALUES
  ('recommendation_shown', 0.05),
  ('recommendation_clicked', 0.25),
  ('coupon_clipped', 0.40),
  ('item_added_to_cart', 0.55),
  ('checkout_started', 0.05),
  ('checkout_completed', 0.75),
  ('purchase_completed', 1.00),
  ('receipt_uploaded', 0.10),
  ('search_performed', 0.02),
  ('preference_changed', 0.05),
  ('item_removed_from_cart', -0.30),
  ('stack_dismissed', -0.40),
  ('cart_rejected', -0.60)
ON CONFLICT (event_name) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_event_stream_preference_upsert()
RETURNS trigger AS $$
DECLARE
  weight numeric := 0;
  normalized_event text := lower(NEW.event_name);
BEGIN
  SELECT weight INTO weight
  FROM public.event_weight_config
  WHERE event_name = normalized_event;

  IF weight IS NULL THEN
    weight := 0;
  END IF;

  INSERT INTO public.user_preference_scores (
    user_id,
    preference_key,
    category,
    brand,
    retailer_key,
    score,
    last_updated
  ) VALUES (
    NEW.user_id,
    normalized_event,
    COALESCE(NEW.category, ''),
    COALESCE(NEW.brand, ''),
    COALESCE(NEW.retailer_key, ''),
    weight,
    now()
  ) ON CONFLICT (user_id, preference_key, category, brand, retailer_key)
  DO UPDATE SET
    score = public.user_preference_scores.score + EXCLUDED.score,
    last_updated = EXCLUDED.last_updated;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_event_stream_preference ON public.event_stream;
CREATE TRIGGER trg_event_stream_preference
AFTER INSERT ON public.event_stream
FOR EACH ROW
EXECUTE FUNCTION public.fn_event_stream_preference_upsert();
