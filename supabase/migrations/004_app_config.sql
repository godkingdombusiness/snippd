-- ============================================================
-- Snippd — App Configuration Seed
-- 004_app_config.sql
-- Idempotent: safe to re-run
--
-- Live table schema: key text PK, value text, created_at, updated_at
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_config (
  key        text        PRIMARY KEY,
  value      text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: service_role only (no client access)
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- ── App version ───────────────────────────────────────────────
INSERT INTO public.app_config (key, value) VALUES
  ('app_version', '0.5.0')
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      updated_at = now();

-- ── USDA food plan benchmarks (2024, monthly per person, USD) ─
-- Source: USDA Official CNPP Food Plans
-- Thrifty plan used as lower bound; moderate as default target.
INSERT INTO public.app_config (key, value) VALUES
  ('usda_monthly_food_thrifty_1',      '244.90'),
  ('usda_monthly_food_thrifty_2',      '502.50'),
  ('usda_monthly_food_thrifty_4',      '882.20'),
  ('usda_monthly_food_moderate_1',     '386.00'),
  ('usda_monthly_food_moderate_2',     '793.90'),
  ('usda_monthly_food_moderate_4',    '1390.30'),
  ('usda_weekly_food_thrifty_1',        '56.52'),
  ('usda_weekly_food_thrifty_2',       '115.96'),
  ('usda_weekly_food_thrifty_4',       '203.58'),
  ('usda_weekly_food_moderate_1',       '89.08'),
  ('usda_weekly_food_moderate_2',      '183.21'),
  ('usda_weekly_food_moderate_4',      '320.84')
ON CONFLICT (key) DO NOTHING;

-- ── Inflation index baseline (Jan 2024 CPI Food at Home = 100) ─
INSERT INTO public.app_config (key, value) VALUES
  ('inflation_baseline_cpi_food_2024', '100.0'),
  ('inflation_current_cpi_food',       '102.3')
ON CONFLICT (key) DO NOTHING;

-- ── Stacking engine tuning ────────────────────────────────────
INSERT INTO public.app_config (key, value) VALUES
  ('stack_max_offers_per_cart',    '10'),
  ('stack_min_savings_threshold',  '0.50'),
  ('recommendation_window_days',   '30')
ON CONFLICT (key) DO NOTHING;
