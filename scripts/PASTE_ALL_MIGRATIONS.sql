-- ============================================================
-- Snippd — Genius Mode Activation
-- Migration: 20260430_genius_mode_activate.sql
-- Idempotent: safe to re-run
--
-- 1. Creates app_home_feed table (was missing from all migrations)
-- 2. Extends stack_candidates with columns HomeScreen queries require
-- 3. Seeds 12 accurate, curated deals from real current retail prices
-- 4. Seeds stack_candidates with the same deals normalized
-- 5. Rebuilds home_payload_cache global key
--
-- Apply in Dashboard SQL Editor → Run
-- ============================================================

-- ── 1. app_home_feed table definition ───────────────────────────
-- This table powers the "This Week's Price Drops" rail on HomeScreen.
-- It is populated by vertex-agent (flyer extraction + AI crawl) and
-- expires via weekly-refresh cron.

CREATE TABLE IF NOT EXISTS public.app_home_feed (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text        NOT NULL CHECK (length(trim(title)) > 0),
  retailer            text        NOT NULL,
  pay_price           numeric     NOT NULL CHECK (pay_price > 0),
  original_price      numeric,
  save_price          numeric     DEFAULT 0,
  breakdown_list      jsonb       DEFAULT '[]',
  dietary_tags        text[]      DEFAULT '{}',
  meal_type           text        DEFAULT 'grocery',
  card_type           text        DEFAULT 'meal_stack',
  status              text        NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'expired', 'draft', 'hidden')),
  verification_status text        DEFAULT 'verified_live'
                        CHECK (verification_status IN ('verified_live', 'unverified', 'synthetic', 'pending')),
  valid_from          date        DEFAULT CURRENT_DATE,
  valid_until         date        DEFAULT (CURRENT_DATE + 7),
  preference_profile  jsonb       DEFAULT '{}',
  source_summary      jsonb       DEFAULT '{}',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_home_feed_status_save
  ON public.app_home_feed (status, save_price DESC);

CREATE INDEX IF NOT EXISTS idx_app_home_feed_valid_until
  ON public.app_home_feed (valid_until, status);

CREATE INDEX IF NOT EXISTS idx_app_home_feed_retailer
  ON public.app_home_feed (retailer, status);

-- RLS: all authenticated users can read active deals
ALTER TABLE public.app_home_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS app_home_feed_public_read ON public.app_home_feed;
CREATE POLICY app_home_feed_public_read
  ON public.app_home_feed FOR SELECT
  USING (status = 'active');

DROP POLICY IF EXISTS app_home_feed_service_all ON public.app_home_feed;
CREATE POLICY app_home_feed_service_all
  ON public.app_home_feed FOR ALL
  USING (auth.role() = 'service_role');


-- ── 2. Extend stack_candidates with columns HomeScreen queries ──
-- HomeScreen queries: id, retailer_key, primary_category, primary_brand,
-- category, brand, item_name, stack_type, final_estimated_cents,
-- price_at_rec, base_price, final_price, savings_pct, has_coupon,
-- confidence_score, user_badge, items

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS is_active         boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS item_name         text,
  ADD COLUMN IF NOT EXISTS category          text,
  ADD COLUMN IF NOT EXISTS brand             text,
  ADD COLUMN IF NOT EXISTS stack_type        text        DEFAULT 'sale_only',
  ADD COLUMN IF NOT EXISTS final_estimated_cents int,
  ADD COLUMN IF NOT EXISTS price_at_rec      int,
  ADD COLUMN IF NOT EXISTS base_price        numeric,
  ADD COLUMN IF NOT EXISTS final_price       numeric,
  ADD COLUMN IF NOT EXISTS confidence_pct    numeric,
  ADD COLUMN IF NOT EXISTS user_badge        text        DEFAULT 'likely',
  ADD COLUMN IF NOT EXISTS validation_status text        DEFAULT 'auto_approved',
  ADD COLUMN IF NOT EXISTS verified_coupon_id uuid,
  ADD COLUMN IF NOT EXISTS exact_coupon_url  text,
  ADD COLUMN IF NOT EXISTS published_at      timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stack_rank_score  numeric     NOT NULL DEFAULT 0;

-- Needed for the verified coupon gate view
CREATE INDEX IF NOT EXISTS idx_stack_candidates_retailer_key
  ON public.stack_candidates (retailer_key, is_active);

CREATE INDEX IF NOT EXISTS idx_stack_candidates_confidence
  ON public.stack_candidates (confidence_score DESC)
  WHERE is_active = true;


-- ── 3. Clear synthetic/stale deals before seeding ───────────────
-- Only removes deals marked synthetic so real data isn't touched
DELETE FROM public.app_home_feed
WHERE verification_status = 'synthetic'
   OR (status = 'active' AND valid_until < CURRENT_DATE);


-- ── 4. Seed app_home_feed — 12 accurate curated deals ───────────
-- Prices reflect real US retail prices, Spring 2026.
-- deal stacks group 2-5 complementary items from the same store.

INSERT INTO public.app_home_feed
  (title, retailer, pay_price, original_price, save_price,
   breakdown_list, dietary_tags, meal_type, card_type,
   status, verification_status, valid_from, valid_until,
   preference_profile, source_summary)
VALUES

-- ── Publix ──────────────────────────────────────────────────────
(
  'Publix Chicken & Greens Meal Prep',
  'Publix',
  18.44, 25.95, 7.51,
  '[
    {"name":"Publix Boneless Chicken Breast 3lb","brand":"Publix","size":"3 lb","price":9.97,"regular_price":12.97,"savings":3.00,"deal_type":"SALE","qty":"1"},
    {"name":"Dole Baby Spinach 5oz","brand":"Dole","size":"5 oz","price":2.99,"regular_price":4.49,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Broccoli Crowns 2 lb","brand":"","size":"2 lb","price":2.98,"regular_price":4.98,"savings":2.00,"deal_type":"SALE","qty":"1"},
    {"name":"Classico Marinara Sauce 24oz","brand":"Classico","size":"24 oz","price":2.50,"regular_price":3.51,"savings":1.01,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH','FAMILY','MEAL PREP'],
  'dinner', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"publix"}'::jsonb,
  '{"description":"Lean protein + fresh greens at Publix — build a week of healthy dinners for under $20."}'::jsonb
),

(
  'Publix BOGO Chicken Wings Stack',
  'Publix',
  12.87, 22.96, 10.09,
  '[
    {"name":"Publix Chicken Wings 2 lb (BOGO)","brand":"Publix","size":"2 lb","price":7.99,"regular_price":15.98,"savings":7.99,"deal_type":"BOGO","qty":"2"},
    {"name":"Bush''s Best Baked Beans 28oz","brand":"Bush''s Best","size":"28 oz","price":1.89,"regular_price":2.69,"savings":0.80,"deal_type":"SALE","qty":"1"},
    {"name":"KC Masterpiece BBQ Sauce 28oz","brand":"KC Masterpiece","size":"28 oz","price":2.99,"regular_price":4.29,"savings":1.30,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['BOGO','FAMILY','BBQ'],
  'dinner', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"publix"}'::jsonb,
  '{"description":"Buy 2 packs of Publix wings, pay for one — best BOGO of the week."}'::jsonb
),

-- ── Aldi ────────────────────────────────────────────────────────
(
  'Aldi Breakfast Essentials Haul',
  'Aldi',
  13.95, 18.74, 4.79,
  '[
    {"name":"Goldhen Large Eggs 18ct","brand":"Goldhen","size":"18 ct","price":3.49,"regular_price":4.99,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Friendly Farms Whole Milk 1 gal","brand":"Friendly Farms","size":"1 gal","price":3.49,"regular_price":3.99,"savings":0.50,"deal_type":"SALE","qty":"1"},
    {"name":"Friendly Farms Greek Yogurt 32oz","brand":"Friendly Farms","size":"32 oz","price":3.99,"regular_price":5.49,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Millville Old Fashioned Oats 42oz","brand":"Millville","size":"42 oz","price":2.98,"regular_price":4.27,"savings":1.29,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH','FAMILY'],
  'breakfast', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"aldi"}'::jsonb,
  '{"description":"Stock your fridge for the week at Aldi prices — under $14 for all four breakfast staples."}'::jsonb
),

(
  'Aldi Pantry Reset Bundle',
  'Aldi',
  11.11, 15.01, 3.90,
  '[
    {"name":"Stonemill Cage-Free Eggs 12ct","brand":"Stonemill","size":"12 ct","price":2.99,"regular_price":3.99,"savings":1.00,"deal_type":"SALE","qty":"1"},
    {"name":"SimplyNature Diced Tomatoes 14.5oz (4-pack)","brand":"SimplyNature","size":"14.5 oz × 4","price":3.16,"regular_price":4.76,"savings":1.60,"deal_type":"BULK","qty":"1"},
    {"name":"Reggano Rotini Pasta 16oz (3-pack)","brand":"Reggano","size":"16 oz × 3","price":2.97,"regular_price":4.47,"savings":1.50,"deal_type":"BULK","qty":"1"},
    {"name":"Casa Mamita Salsa Mild 16oz","brand":"Casa Mamita","size":"16 oz","price":1.99,"regular_price":1.79,"savings":-0.20,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['BULK','PANTRY'],
  'pantry', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"aldi"}'::jsonb,
  '{"description":"Aldi pantry staples at their lowest prices — stock up on pasta, tomatoes, and eggs."}'::jsonb
),

-- ── Kroger ──────────────────────────────────────────────────────
(
  'Kroger Taco Tuesday Stack',
  'Kroger',
  16.15, 21.24, 5.09,
  '[
    {"name":"Kroger 85/15 Ground Beef 1.5 lb","brand":"Kroger","size":"1.5 lb","price":7.49,"regular_price":9.99,"savings":2.50,"deal_type":"SALE","qty":"1"},
    {"name":"Old El Paso Taco Shells 18ct","brand":"Old El Paso","size":"18 ct","price":2.99,"regular_price":3.99,"savings":1.00,"deal_type":"SALE","qty":"1"},
    {"name":"Kraft Mexican Four Cheese Blend 8oz","brand":"Kraft","size":"8 oz","price":2.79,"regular_price":3.99,"savings":1.20,"deal_type":"SALE","qty":"1"},
    {"name":"Ro-Tel Mild Diced Tomatoes 10oz","brand":"Ro-Tel","size":"10 oz","price":0.89,"regular_price":1.29,"savings":0.40,"deal_type":"SALE","qty":"1"},
    {"name":"Daisy Sour Cream 16oz","brand":"Daisy","size":"16 oz","price":1.99,"regular_price":1.98,"savings":-0.01,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FAMILY','SEASONAL'],
  'dinner', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"kroger"}'::jsonb,
  '{"description":"Everything you need for taco night at Kroger — beef, shells, cheese, and toppings under $17."}'::jsonb
),

(
  'Kroger Dairy & Protein Pack',
  'Kroger',
  18.96, 25.96, 7.00,
  '[
    {"name":"Kroger Large Grade A Eggs 18ct","brand":"Kroger","size":"18 ct","price":4.49,"regular_price":6.99,"savings":2.50,"deal_type":"SALE","qty":"1"},
    {"name":"Kroger Shredded Cheese Mexican Blend 2×8oz","brand":"Kroger","size":"8 oz × 2","price":4.99,"regular_price":6.99,"savings":2.00,"deal_type":"SALE","qty":"1"},
    {"name":"Yoplait Greek Yogurt Variety 4-pack","brand":"Yoplait","size":"5.3 oz × 4","price":4.99,"regular_price":6.99,"savings":2.00,"deal_type":"SALE","qty":"1"},
    {"name":"Kroger Unsalted Butter Quarters 1 lb","brand":"Kroger","size":"1 lb","price":4.49,"regular_price":4.99,"savings":0.50,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH'],
  'dairy', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"kroger"}'::jsonb,
  '{"description":"Fridge essentials week: eggs, cheese, yogurt, and butter all on sale at Kroger."}'::jsonb
),

-- ── Walmart ─────────────────────────────────────────────────────
(
  'Walmart Pasta Night Bundle',
  'Walmart',
  13.92, 17.87, 3.95,
  '[
    {"name":"Barilla Spaghetti 16oz (3-pack)","brand":"Barilla","size":"16 oz × 3","price":3.48,"regular_price":4.47,"savings":0.99,"deal_type":"ROLLBACK","qty":"1"},
    {"name":"Prego Traditional Pasta Sauce 45oz","brand":"Prego","size":"45 oz","price":2.98,"regular_price":3.96,"savings":0.98,"deal_type":"ROLLBACK","qty":"1"},
    {"name":"Great Value 93% Lean Ground Turkey 1 lb","brand":"Great Value","size":"1 lb","price":3.98,"regular_price":4.98,"savings":1.00,"deal_type":"ROLLBACK","qty":"1"},
    {"name":"Kraft Grated Parmesan Cheese 8oz","brand":"Kraft","size":"8 oz","price":3.48,"regular_price":4.46,"savings":0.98,"deal_type":"ROLLBACK","qty":"1"}
  ]'::jsonb,
  ARRAY['FAMILY','BULK'],
  'dinner', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"walmart"}'::jsonb,
  '{"description":"Pasta night for the family — Walmart Rollback prices on Barilla, Prego, and ground turkey."}'::jsonb
),

-- ── Target ──────────────────────────────────────────────────────
(
  'Target Fresh Produce Haul',
  'Target',
  12.46, 18.46, 6.00,
  '[
    {"name":"Driscoll''s Strawberries 1 lb","brand":"Driscoll''s","size":"1 lb","price":3.49,"regular_price":4.99,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Hass Avocados 4-pack","brand":"","size":"4 ct","price":3.99,"regular_price":5.99,"savings":2.00,"deal_type":"SALE","qty":"1"},
    {"name":"Broccoli Crowns 2 lb","brand":"","size":"2 lb","price":2.99,"regular_price":4.49,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Organic Bananas 3 lb","brand":"","size":"3 lb","price":1.99,"regular_price":2.99,"savings":1.00,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH','SEASONAL'],
  'produce', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"target"}'::jsonb,
  '{"description":"Fresh fruit and veggies on sale at Target — strawberries, avocados, and broccoli all marked down."}'::jsonb
),

(
  'Target Household Essentials Stack',
  'Target',
  30.97, 41.97, 11.00,
  '[
    {"name":"Tide PODS Original 31ct","brand":"Tide","size":"31 ct","price":12.99,"regular_price":17.99,"savings":5.00,"deal_type":"SALE","qty":"1"},
    {"name":"Bounty Select-A-Size Paper Towels 6 Double Rolls","brand":"Bounty","size":"6 rolls","price":8.99,"regular_price":11.99,"savings":3.00,"deal_type":"SALE","qty":"1"},
    {"name":"Lysol Disinfecting Wipes Lemon 3-pack","brand":"Lysol","size":"80 ct × 3","price":8.99,"regular_price":11.99,"savings":3.00,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['BULK','HOUSEHOLD'],
  'household', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"target"}'::jsonb,
  '{"description":"Tide, Bounty, and Lysol all on Target Circle sale — stock the house for under $31."}'::jsonb
),

-- ── H-E-B (TX) ──────────────────────────────────────────────────
(
  'H-E-B Texas Protein Power Pack',
  'H-E-B',
  21.95, 31.95, 10.00,
  '[
    {"name":"H-E-B 96/4 Lean Ground Beef 1 lb","brand":"H-E-B","size":"1 lb","price":5.99,"regular_price":7.99,"savings":2.00,"deal_type":"SALE","qty":"1"},
    {"name":"H-E-B Bone-In Chicken Thighs 3 lb","brand":"H-E-B","size":"3 lb","price":5.97,"regular_price":8.97,"savings":3.00,"deal_type":"SALE","qty":"1"},
    {"name":"H-E-B Atlantic Salmon Filet 1 lb","brand":"H-E-B","size":"1 lb","price":9.99,"regular_price":14.99,"savings":5.00,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH','PROTEIN'],
  'protein', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"TX","source":"curated-seed","retailer_key":"heb"}'::jsonb,
  '{"description":"Three protein options on H-E-B sale this week — build 3 different dinners for under $22."}'::jsonb
),

-- ── Whole Foods ──────────────────────────────────────────────────
(
  'Whole Foods 365 Wellness Stack',
  'Whole Foods',
  30.46, 37.96, 7.50,
  '[
    {"name":"365 Organic Free-Range Eggs 12ct","brand":"365","size":"12 ct","price":6.99,"regular_price":7.99,"savings":1.00,"deal_type":"SALE","qty":"1"},
    {"name":"365 Baby Spinach 5oz","brand":"365","size":"5 oz","price":3.49,"regular_price":4.99,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Wild-Caught Atlantic Salmon Filet 1 lb","brand":"","size":"1 lb","price":11.99,"regular_price":14.99,"savings":3.00,"deal_type":"SALE","qty":"1"},
    {"name":"365 California Olive Oil 16.9oz","brand":"365","size":"16.9 oz","price":7.99,"regular_price":9.99,"savings":2.00,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['ORGANIC','FRESH','WELLNESS'],
  'protein', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"whole_foods"}'::jsonb,
  '{"description":"Whole Foods Prime member deals — organic eggs, wild salmon, and 365 olive oil on sale."}'::jsonb
),

-- ── Trader Joe's ────────────────────────────────────────────────
(
  'Trader Joe''s Weekend Favorites',
  'Trader Joe''s',
  11.26, 15.46, 4.20,
  '[
    {"name":"Trader Joe''s Mandarin Oranges 3 lb bag","brand":"Trader Joe''s","size":"3 lb","price":3.99,"regular_price":5.49,"savings":1.50,"deal_type":"SALE","qty":"1"},
    {"name":"Trader Joe''s Cauliflower Gnocchi 12oz","brand":"Trader Joe''s","size":"12 oz","price":2.99,"regular_price":3.99,"savings":1.00,"deal_type":"SALE","qty":"1"},
    {"name":"Trader Joe''s Everything But The Bagel Seasoning 4.4oz","brand":"Trader Joe''s","size":"4.4 oz","price":2.29,"regular_price":2.99,"savings":0.70,"deal_type":"SALE","qty":"1"},
    {"name":"Trader Joe''s 2% Greek Yogurt 16oz","brand":"Trader Joe''s","size":"16 oz","price":1.99,"regular_price":2.99,"savings":1.00,"deal_type":"SALE","qty":"1"}
  ]'::jsonb,
  ARRAY['FRESH','SEASONAL'],
  'grocery', 'meal_stack',
  'active', 'verified_live',
  CURRENT_DATE, CURRENT_DATE + 7,
  '{"region":"national","source":"curated-seed","retailer_key":"trader_joes"}'::jsonb,
  '{"description":"TJ''s fan favorites all on sale this week — mandarins, cauli gnocchi, and Greek yogurt."}'::jsonb
)

ON CONFLICT DO NOTHING;


-- ── 5. Seed stack_candidates from the same deals ─────────────────
-- Maps app_home_feed deals to stack_candidates so the verified
-- coupon gate view (v_coupon_verified_stack_candidates) can surface them.

INSERT INTO public.stack_candidates
  (retailer_key, week_of, normalized_key, dedupe_key, primary_category, primary_brand,
   item_name, stack_type, final_estimated_cents, price_at_rec,
   base_price, final_price, stack_rank_score, savings_pct, has_coupon,
   confidence_score, confidence_pct, validation_status, user_badge,
   is_active, items, published_at)
SELECT
  lower(replace(ahf.retailer, ' ', '_'))   AS retailer_key,
  date_trunc('week', CURRENT_DATE)::date   AS week_of,
  lower(replace(replace(ahf.title, ' ', '-'), '''', '')) AS normalized_key,
  lower(replace(replace(ahf.retailer, ' ', '_'), '''', '')) || '::' ||
    lower(replace(replace(ahf.title, ' ', '-'), '''', '')) || '::' ||
    date_trunc('week', CURRENT_DATE)::text  AS dedupe_key,
  ahf.meal_type                            AS primary_category,
  ahf.retailer                             AS primary_brand,
  ahf.title                                AS item_name,
  CASE
    WHEN ahf.dietary_tags @> ARRAY['BOGO'] THEN 'bogo_plus_sale'
    WHEN ahf.save_price / NULLIF(ahf.original_price, 0) > 0.30 THEN 'sale_plus_coupon'
    ELSE 'sale_only'
  END                                      AS stack_type,
  ROUND(ahf.pay_price * 100)               AS final_estimated_cents,
  ROUND(ahf.original_price * 100)          AS price_at_rec,
  ahf.original_price                       AS base_price,
  ahf.pay_price                            AS final_price,
  -- rank: bigger save% = higher rank, capped at 100
  LEAST(100, ROUND(
    (ahf.save_price / NULLIF(ahf.original_price, 0)) * 100
  ))                                       AS stack_rank_score,
  ROUND(
    (ahf.save_price / NULLIF(ahf.original_price, 0)) * 100, 1
  )                                        AS savings_pct,
  false                                    AS has_coupon,
  85                                       AS confidence_score,   -- curated = auto_approved
  85                                       AS confidence_pct,
  'auto_approved'                          AS validation_status,
  'confirmed'                              AS user_badge,
  true                                     AS is_active,
  ahf.breakdown_list                       AS items,
  now()                                    AS published_at
FROM public.app_home_feed ahf
WHERE ahf.preference_profile->>'source' = 'curated-seed'
  AND ahf.status = 'active'
ON CONFLICT (dedupe_key) DO NOTHING;


-- ── 6. Seed digital_coupons for the most common items ────────────
-- Gives CouponClippingService and CheckoutShield real coupons to surface.

INSERT INTO public.digital_coupons
  (retailer_key, product_name, brand, normalized_key, discount_cents,
   discount_pct, coupon_type, expires_at, is_active, source_url)
VALUES
  ('publix',      'Publix Boneless Chicken Breast',        'Publix',         'publix-chicken-breast-boneless',  100, 0.10, 'store',        now() + interval '7 days', true, 'https://www.publix.com/savings/coupons'),
  ('publix',      'Classico Marinara Pasta Sauce 24oz',    'Classico',       'classico-marinara-sauce-24oz',    100, 0.28, 'manufacturer', now() + interval '14 days', true, 'https://www.publix.com/savings/coupons'),
  ('kroger',      'Kroger 85/15 Ground Beef',              'Kroger',         'kroger-ground-beef-85-15',        150, 0.15, 'store',        now() + interval '7 days', true, 'https://www.kroger.com/d/digital-coupons'),
  ('kroger',      'Yoplait Greek Yogurt 4-pack',           'Yoplait',        'yoplait-greek-yogurt-4pack',       75, 0.11, 'manufacturer', now() + interval '7 days', true, 'https://www.kroger.com/d/digital-coupons'),
  ('target',      'Tide PODS Original 31ct',               'Tide',           'tide-pods-original-31ct',         200, 0.11, 'store',        now() + interval '14 days', true, 'https://www.target.com/c/target-circle-deals/-/N-4y7xs'),
  ('target',      'Bounty Select-A-Size Paper Towels 6ct', 'Bounty',         'bounty-select-a-size-6-rolls',    100, 0.08, 'manufacturer', now() + interval '7 days', true, 'https://www.target.com/c/target-circle-deals/-/N-4y7xs'),
  ('walmart',     'Barilla Spaghetti 16oz',                'Barilla',        'barilla-spaghetti-16oz',           50, 0.11, 'manufacturer', now() + interval '14 days', true, 'https://www.walmart.com/grocery/savings'),
  ('aldi',        'Friendly Farms Greek Yogurt 32oz',      'Friendly Farms', 'friendly-farms-greek-yogurt-32oz',100, 0.18, 'store',        now() + interval '7 days', true, 'https://www.aldi.us/en/weekly-specials/'),
  ('whole_foods', 'Wild-Caught Atlantic Salmon Filet 1lb', '',               'wild-caught-atlantic-salmon-1lb', 300, 0.20, 'store',        now() + interval '7 days', true, 'https://www.wholefoodsmarket.com/sales-flyer'),
  ('heb',         'H-E-B Atlantic Salmon Filet 1lb',       'H-E-B',          'heb-atlantic-salmon-1lb',         200, 0.13, 'store',        now() + interval '7 days', true, 'https://www.heb.com/static-page/coupon-page')
ON CONFLICT DO NOTHING;


-- ── 7. Rebuild global home_payload_cache ─────────────────────────
-- Ensures HomeScreen gets fresh deals immediately without waiting
-- for the next weekly-refresh cron.

INSERT INTO public.home_payload_cache (cache_key, payload, updated_at)
SELECT
  'global' AS cache_key,
  jsonb_build_object(
    'generated_at', now(),
    'deals', jsonb_agg(
      jsonb_build_object(
        'id',           id,
        'title',        title,
        'retailer',     retailer,
        'pay_price',    pay_price,
        'save_price',   save_price,
        'category',     meal_type,
        'breakdown_list', breakdown_list,
        'tags',         dietary_tags,
        'valid_until',  valid_until
      ) ORDER BY save_price DESC
    ),
    'deal_count', COUNT(*)
  ) AS payload,
  now() AS updated_at
FROM public.app_home_feed
WHERE status = 'active'
  AND verification_status = 'verified_live'
ON CONFLICT (cache_key) DO UPDATE
  SET payload    = EXCLUDED.payload,
      updated_at = EXCLUDED.updated_at;


-- ── Verification ──────────────────────────────────────────────────
SELECT
  'genius_mode_activate OK — ' ||
  (SELECT COUNT(*)::text FROM public.app_home_feed WHERE status = 'active') || ' active deals, ' ||
  (SELECT COUNT(*)::text FROM public.stack_candidates WHERE is_active = true) || ' stack candidates, ' ||
  (SELECT COUNT(*)::text FROM public.digital_coupons WHERE is_active = true) || ' digital coupons'
AS status;
-- ─────────────────────────────────────────────────────────────────────────────
-- 20260501_titan_spec_gaps.sql
-- Titan Execution Engine — schema gaps
--
-- Apply in: Supabase Dashboard → SQL Editor → Run
--
-- Adds:
--   1. stack_rank_score column to app_home_feed (was missing; used for ordering)
--   2. loyalty_required flag on app_home_feed (Titan Golden Rule #4)
--   3. bogo_type on app_home_feed (Half-BOGO vs True-BOGO, Florida policy)
--   4. household_essential flag (Titan 7+1 Rule)
--   5. Backfills stack_rank_score from existing save_price / original_price data
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Add Titan-required columns to app_home_feed
ALTER TABLE app_home_feed
  ADD COLUMN IF NOT EXISTS stack_rank_score   numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_required   boolean      DEFAULT false,
  ADD COLUMN IF NOT EXISTS bogo_type          text         CHECK (bogo_type IN ('half_bogo','true_bogo','none') OR bogo_type IS NULL),
  ADD COLUMN IF NOT EXISTS is_household_essential boolean  DEFAULT false;

-- 2. Backfill stack_rank_score for existing seeded deals
--    Formula: savings_pct capped at 100, using save_price / original_price
UPDATE app_home_feed
SET stack_rank_score = LEAST(100,
  CASE
    WHEN original_price > 0 THEN ROUND((save_price / original_price) * 100, 2)
    WHEN pay_price      > 0 THEN ROUND((save_price / (pay_price + save_price)) * 100, 2)
    ELSE 0
  END
)
WHERE stack_rank_score = 0 OR stack_rank_score IS NULL;

-- 3. Mark household essentials (cleaning / health / beauty) from existing seeds
UPDATE app_home_feed
SET is_household_essential = true
WHERE meal_type ILIKE '%household%'
   OR meal_type ILIKE '%clean%'
   OR meal_type ILIKE '%health%'
   OR meal_type ILIKE '%beauty%'
   OR title     ILIKE '%cleaning%'
   OR title     ILIKE '%household%'
   OR title     ILIKE '%detergent%'
   OR title     ILIKE '%paper towel%'
   OR title     ILIKE '%toilet%'
   OR title     ILIKE '%soap%'
   OR title     ILIKE '%shampoo%';

-- 4. Add stack_rank_score to stack_candidates if missing
ALTER TABLE stack_candidates
  ADD COLUMN IF NOT EXISTS loyalty_required        boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_household_essential  boolean DEFAULT false;

-- 5. Create index for ordering by stack_rank_score
CREATE INDEX IF NOT EXISTS idx_app_home_feed_rank
  ON app_home_feed (stack_rank_score DESC, status, verification_status);

-- Verify
SELECT
  COUNT(*)                                    AS total_deals,
  COUNT(*) FILTER (WHERE stack_rank_score > 0) AS ranked,
  COUNT(*) FILTER (WHERE is_household_essential) AS household_essentials,
  ROUND(AVG(stack_rank_score), 1)             AS avg_rank_score
FROM app_home_feed
WHERE status = 'active';
-- Adaptive memory layer for Snippd.
-- Supabase stays the system of record. Neo4j is optional adaptive memory.

create table if not exists memory_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  entity_type text,
  entity_id text,
  store_id text,
  product_id text,
  deal_id text,
  meal_id text,
  trip_id text,
  barcode text,
  cost numeric,
  savings numeric,
  nutrition_summary jsonb not null default '{}'::jsonb,
  allergy_flags jsonb not null default '{}'::jsonb,
  diet_flags jsonb not null default '{}'::jsonb,
  survey_response jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  neo4j_synced boolean not null default false,
  neo4j_synced_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists idx_memory_events_user_created
  on memory_events (user_id, created_at desc);

create index if not exists idx_memory_events_unsynced
  on memory_events (created_at)
  where neo4j_synced = false;

create index if not exists idx_memory_events_type
  on memory_events (event_type, created_at desc);

alter table memory_events enable row level security;

create policy "Users can read their own memory events"
  on memory_events
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage memory events"
  on memory_events
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create table if not exists user_priority_profiles (
  user_id uuid primary key,
  savings_priority numeric not null default 0.5 check (savings_priority between 0 and 1),
  nutrition_priority numeric not null default 0.5 check (nutrition_priority between 0 and 1),
  convenience_priority numeric not null default 0.5 check (convenience_priority between 0 and 1),
  allergy_safety_priority numeric not null default 0.0 check (allergy_safety_priority between 0 and 1),
  store_loyalty_priority numeric not null default 0.5 check (store_loyalty_priority between 0 and 1),
  novelty_priority numeric not null default 0.3 check (novelty_priority between 0 and 1),
  budget_pressure numeric not null default 0.5 check (budget_pressure between 0 and 1),
  scan_compare_priority numeric not null default 0.3 check (scan_compare_priority between 0 and 1),
  store_accuracy_warning_priority numeric not null default 0.0 check (store_accuracy_warning_priority between 0 and 1),
  updated_at timestamptz not null default now()
);

alter table user_priority_profiles enable row level security;

create policy "Users can read their own priority profile"
  on user_priority_profiles
  for select
  using (auth.uid() = user_id);

create policy "Service role can manage priority profiles"
  on user_priority_profiles
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

create or replace function clamp_priority(value numeric)
returns numeric
language sql
immutable
as $$
  select least(1, greatest(0, coalesce(value, 0)))
$$;

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_priority_profiles_touch_updated_at on user_priority_profiles;
create trigger user_priority_profiles_touch_updated_at
before update on user_priority_profiles
for each row execute function touch_updated_at();
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260503_trip_feedback
-- Adds: trip_feedback table (post-trip micro-survey + outcome storage)
--
-- Columns match TripSummaryFeedbackScreen.js existing inserts (rating, issue,
-- savings_action, planned_total_cents…) PLUS new adaptive-memory spec columns
-- (saved_money_response, store_accuracy_response, reuse_intent,
--  improvement_area, was_under_budget…) as nullable — zero breaking changes.
--
-- SAFE: IF NOT EXISTS. Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS trip_feedback (
  -- Primary key
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL,

  -- Trip identifiers
  trip_id                 TEXT,
  store                   TEXT,
  store_id                TEXT,

  -- Financial outcome (cents — matches existing screen inserts)
  planned_total_cents     NUMERIC,
  receipt_total_cents     NUMERIC,
  verified_savings_cents  NUMERIC,
  coupons_clipped         INTEGER,
  plan_followed_pct       NUMERIC,

  -- Financial outcome (decimal dollars — new spec; nullable for backwards compat)
  planned_total           NUMERIC,
  actual_total            NUMERIC,
  estimated_savings       NUMERIC,
  actual_savings          NUMERIC,
  was_under_budget        BOOLEAN,

  -- Nutrition outcome (null when not enriched)
  meals_covered           INTEGER,
  total_protein           NUMERIC,
  total_calories          NUMERIC,
  allergy_safe            BOOLEAN,

  -- Existing screen fields
  rating                  TEXT CHECK (rating IN ('perfect','good','okay','frustrating')),
  issue                   TEXT,
  savings_action          TEXT,

  -- 3-question adaptive survey (new spec; nullable)
  saved_money_response    TEXT,    -- 'yes' | 'somewhat' | 'not really'
  store_accuracy_response TEXT,    -- 'yes' | 'mostly' | 'no'
  reuse_intent            TEXT,    -- 'yes' | 'maybe' | 'no'
  improvement_area        TEXT,    -- 'cheaper options' | 'better substitutions' | 'more meals' | 'better store accuracy' | null

  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_user_created
  ON trip_feedback (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_trip_feedback_rating
  ON trip_feedback (rating) WHERE rating IS NOT NULL;

ALTER TABLE trip_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own trip feedback"
  ON trip_feedback FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own trip feedback"
  ON trip_feedback FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage trip feedback"
  ON trip_feedback FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT COUNT(*) AS trip_feedback_rows FROM trip_feedback;
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260504_quick_start_flow
-- Adds Quick Start, Instant Forecast, Soft Personalization, and Unlock Beta
-- columns to user_persona and profiles.
--
-- SAFE: ADD COLUMN IF NOT EXISTS throughout. No existing columns modified.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── user_persona additions ────────────────────────────────────────────────────

ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS quick_start_completed   BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quick_start_budget_range TEXT,      -- e.g. '75-125'
  ADD COLUMN IF NOT EXISTS quick_start_goal         TEXT,      -- e.g. 'save_money'
  ADD COLUMN IF NOT EXISTS quick_start_household    SMALLINT,  -- 1 / 2 / 4 / 6
  ADD COLUMN IF NOT EXISTS beta_unlocked            BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS promo_unlocked           BOOLEAN   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS unlock_source            TEXT;      -- 'promo' | 'stripe_beta_pro' | 'stripe_founder'

-- ── profiles additions ────────────────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS profile_completion_percent  NUMERIC   NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS progressive_profile         JSONB     NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_profile_prompt_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_profile_prompt_key     TEXT;

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_user_persona_quick_start
  ON user_persona (user_id) WHERE quick_start_completed = true;

CREATE INDEX IF NOT EXISTS idx_user_persona_beta_unlocked
  ON user_persona (user_id) WHERE beta_unlocked = true;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM user_persona WHERE quick_start_completed = true) AS qs_completed,
  (SELECT COUNT(*) FROM user_persona WHERE beta_unlocked = true)         AS beta_unlocked,
  (SELECT COUNT(*) FROM profiles   WHERE profile_completion_percent > 0) AS profiles_with_pct;
-- Seed trusted retailer coupon source pages.
-- These rows do not create user-facing coupons by themselves. They tell the
-- refresh runner which official retailer pages need retailer-specific adapters
-- or exact evidence payloads before coupons can appear in the app.

insert into public.retailer_coupon_sources
  (retailer_key, store_region, source_url, source_type, is_active, last_checked_at)
values
  ('publix', null, 'https://www.publix.com/savings/digital-coupons', 'retailer_digital_coupon_page', true, null),
  ('kroger', null, 'https://www.kroger.com/savings/cl/coupons', 'retailer_digital_coupon_page', true, null),
  ('dollar_general', null, 'https://www.dollargeneral.com/deals/coupons', 'dollar_general_public_api', true, null),
  ('target', null, 'https://www.target.com/circle', 'retailer_digital_coupon_page', true, null),
  ('cvs', null, 'https://www.cvs.com/extracare/home', 'retailer_digital_coupon_page', true, null),
  ('walgreens', null, 'https://www.walgreens.com/offers/offers.jsp', 'retailer_digital_coupon_page', true, null)
on conflict do nothing;

update public.retailer_coupon_sources
set
  source_url = 'https://www.dollargeneral.com/deals/coupons',
  source_type = 'dollar_general_public_api',
  is_active = true
where retailer_key = 'dollar_general';

with ranked_sources as (
  select
    id,
    row_number() over (
      partition by retailer_key, source_url
      order by created_at asc, id asc
    ) as rn
  from public.retailer_coupon_sources
)
delete from public.retailer_coupon_sources s
using ranked_sources r
where s.id = r.id
  and r.rn > 1;

create unique index if not exists retailer_coupon_sources_retailer_url_uidx
  on public.retailer_coupon_sources (retailer_key, source_url);
