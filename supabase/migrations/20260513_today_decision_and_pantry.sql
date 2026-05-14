-- ============================================================
-- Snippd — Today Decision Flow + Pantry + FatSecret Cache
-- Idempotent: safe to run on fresh or existing DB
-- ============================================================

-- ── 1. PROFILES — Today setup fields ────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS billing_plan           text    DEFAULT 'trial',
  ADD COLUMN IF NOT EXISTS people_eating_today    integer,
  ADD COLUMN IF NOT EXISTS grocery_shopped_status text,   -- 'yes' | 'no' | 'partially'
  ADD COLUMN IF NOT EXISTS time_before_dinner_text text,  -- 'under_15' | '15_30' | '30_45' | 'over_45'
  ADD COLUMN IF NOT EXISTS pantry_preference      text,   -- 'use_first' | 'shop_or_order' | 'not_sure'
  ADD COLUMN IF NOT EXISTS today_goal             text,   -- 'spend_least' | 'high_protein' | etc.
  ADD COLUMN IF NOT EXISTS allergy_acknowledgment_status text DEFAULT 'pending'; -- 'pending' | 'on_file' | 'skipped'

-- ── 2. PANTRY ITEMS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pantry_items (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users NOT NULL,
  item_name   text        NOT NULL,
  quantity    text,
  unit        text,
  confidence  text        NOT NULL DEFAULT 'likely',  -- 'confirmed' | 'likely' | 'needs_review'
  category    text,
  source      text        NOT NULL DEFAULT 'scan',    -- 'scan' | 'manual' | 'seeded'
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pantry_items_user
  ON public.pantry_items (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pantry_items_confidence
  ON public.pantry_items (user_id, confidence);

-- RLS
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own pantry" ON public.pantry_items;
CREATE POLICY "Users manage own pantry"
  ON public.pantry_items
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 3. FATSECRET NUTRITION CACHE ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.fatsecret_nutrition_cache (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  food_id              text        NOT NULL UNIQUE,
  food_name            text        NOT NULL,
  calories_per_serving numeric,
  protein_g            numeric,
  carbs_g              numeric,
  fat_g                numeric,
  sodium_mg            numeric,
  sugar_g              numeric,
  serving_description  text,
  source               text        NOT NULL DEFAULT 'fatsecret',
  cached_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fatsecret_cache_name
  ON public.fatsecret_nutrition_cache (lower(food_name));

-- ── 4. TODAY SETUP LOG (optional: track per-day setup completions) ───────────
CREATE TABLE IF NOT EXISTS public.today_setup_log (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid        REFERENCES auth.users NOT NULL,
  setup_date          date        NOT NULL DEFAULT CURRENT_DATE,
  weekly_budget_cents integer,
  household_size      integer,
  people_eating_today integer,
  grocery_status      text,
  time_before_dinner  text,
  pantry_preference   text,
  today_goal          text,
  skipped             boolean     DEFAULT false,
  created_at          timestamptz DEFAULT now(),
  UNIQUE (user_id, setup_date)
);

CREATE INDEX IF NOT EXISTS idx_today_setup_user_date
  ON public.today_setup_log (user_id, setup_date DESC);

ALTER TABLE public.today_setup_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own today setup" ON public.today_setup_log;
CREATE POLICY "Users manage own today setup"
  ON public.today_setup_log
  FOR ALL
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 5. SEED: Pantry items for demo user (ON CONFLICT DO NOTHING) ─────────────
-- Only seeds if a demo user exists; safe to run on production (no-op if no match)
-- INSERT INTO public.pantry_items (user_id, item_name, quantity, confidence, category, source)
-- SELECT id, 'White rice', '2 cups', 'confirmed', 'Grains', 'seeded'
-- FROM auth.users WHERE email = 'demo@snippd.app'
-- ON CONFLICT DO NOTHING;
-- (Uncomment and adjust for demo seeding if needed)
