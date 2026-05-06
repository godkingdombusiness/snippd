-- ============================================================
-- Snippd Persona Expansion — 8-Chapter Deep Brief
-- supabase/migrations/20260429_persona_expansion.sql
--
-- Adds new user_persona columns for the expanded onboarding
-- (Shopping Archetype, Kitchen Vibe, Behavior Map, Coupon Psychology)
-- These feed the recommendation engine and Snippd Persona algorithm.
-- All idempotent — safe to re-run.
-- ============================================================

ALTER TABLE public.user_persona
  -- Chapter 2 — Shopping Archetype
  ADD COLUMN IF NOT EXISTS shopping_archetype     text,   -- 'hunter' | 'planner' | 'optimist' | 'improviser'
  ADD COLUMN IF NOT EXISTS cart_vs_list_behavior  text,   -- 'exact' | 'mostly_same' | 'different' | 'no_list'
  ADD COLUMN IF NOT EXISTS deal_impulse           text,   -- 'skip' | 'buy_one' | 'stock_up' | 'depends'

  -- Chapter 3 — Kitchen & Cooking Style
  ADD COLUMN IF NOT EXISTS kitchen_vibe           text,   -- 'meal_prep' | 'fresh_spontaneous' | 'takeout_backup' | 'chef_mode'
  ADD COLUMN IF NOT EXISTS weekly_signature_meal  text,   -- free text: "tacos", "pasta night"

  -- Chapter 6 — Behavior Map
  ADD COLUMN IF NOT EXISTS price_check_frequency  text,   -- 'never' | 'sometimes' | 'always' | 'switched_recently'
  ADD COLUMN IF NOT EXISTS impulse_category       text,   -- 'snacks' | 'beverages' | 'home_goods' | 'self_care' | 'none'
  ADD COLUMN IF NOT EXISTS post_shop_feeling      text,   -- 'accomplished' | 'guilty' | 'neutral' | 'irritated'
  ADD COLUMN IF NOT EXISTS checkout_anxiety       text,   -- 'high' | 'medium' | 'low' — derived from behavior map

  -- Chapter 7 — Money & Stores expanded
  ADD COLUMN IF NOT EXISTS multi_store_shopper    boolean,          -- shops multiple stores per week
  ADD COLUMN IF NOT EXISTS weekly_grocery_cents   integer,          -- self-reported weekly spend in cents

  -- Chapter 8 — Final reveal
  ADD COLUMN IF NOT EXISTS snippd_solve_for       text;             -- free text: what they most want solved

COMMENT ON COLUMN public.user_persona.shopping_archetype    IS 'Shopper personality from Chapter 2 personality test';
COMMENT ON COLUMN public.user_persona.kitchen_vibe          IS 'Cooking style archetype from Chapter 3';
COMMENT ON COLUMN public.user_persona.impulse_category      IS 'Category of impulse purchases from Behavior Map';
COMMENT ON COLUMN public.user_persona.snippd_solve_for      IS 'Free-text: the one thing the user most wants Snippd to solve';
COMMENT ON COLUMN public.user_persona.weekly_grocery_cents  IS 'Self-reported weekly grocery spend in cents';

SELECT 'persona_expansion OK' AS status;
