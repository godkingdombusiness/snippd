-- Behavioral spine and cart engine support

-- 1. Preference weighting config for event stream processing
CREATE TABLE IF NOT EXISTS public.event_weight_config (
  event_name text PRIMARY KEY,
  weight numeric NOT NULL DEFAULT 0
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

-- 2. Extend user preference scores to capture category/brand/retailer context
ALTER TABLE public.user_preference_scores
  ADD COLUMN IF NOT EXISTS category text DEFAULT '',
  ADD COLUMN IF NOT EXISTS brand text DEFAULT '',
  ADD COLUMN IF NOT EXISTS retailer_key text DEFAULT '';

UPDATE public.user_preference_scores
SET category = ''
WHERE category IS NULL;

UPDATE public.user_preference_scores
SET brand = ''
WHERE brand IS NULL;

UPDATE public.user_preference_scores
SET retailer_key = ''
WHERE retailer_key IS NULL;

ALTER TABLE public.user_preference_scores
  ALTER COLUMN category SET NOT NULL,
  ALTER COLUMN brand SET NOT NULL,
  ALTER COLUMN retailer_key SET NOT NULL;

ALTER TABLE public.user_preference_scores
  DROP CONSTRAINT IF EXISTS user_preference_scores_user_id_preference_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preference_scores_context
  ON public.user_preference_scores (user_id, preference_key, category, brand, retailer_key);

-- 3. Core offer and stack tables for WealthEngine
CREATE TABLE IF NOT EXISTS public.retailer_coupon_parameters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key text NOT NULL,
  policy_key text NOT NULL,
  policy_value jsonb NOT NULL DEFAULT '{}',
  effective_from date DEFAULT current_date,
  effective_to date,
  inserted_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_retailer_policy_key
  ON public.retailer_coupon_parameters (retailer_key, policy_key);

CREATE TABLE IF NOT EXISTS public.offer_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  retailer_key text NOT NULL,
  candidates jsonb NOT NULL,
  budget_cents numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offer_matches_user
  ON public.offer_matches (user_id, retailer_key);

CREATE TABLE IF NOT EXISTS public.stack_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  retailer_key text NOT NULL,
  model_version text NOT NULL,
  variant_type text NOT NULL,
  candidate jsonb NOT NULL,
  budget_fit numeric NOT NULL,
  preference_fit numeric NOT NULL,
  simplicity_score numeric NOT NULL,
  score numeric NOT NULL,
  feature_vector jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_results_user
  ON public.stack_results (user_id, retailer_key, variant_type, created_at DESC);

-- 4. Event stream trigger wiring to preference scores
CREATE OR REPLACE FUNCTION public.fn_event_stream_preference_upsert()
RETURNS trigger AS $$
DECLARE
  weight numeric := 0;
BEGIN
  SELECT weight INTO weight
  FROM public.event_weight_config
  WHERE event_name = lower(NEW.event_name);

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
    lower(NEW.event_name),
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
