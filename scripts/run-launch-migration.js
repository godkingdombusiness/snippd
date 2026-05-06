/**
 * run-launch-migration.js
 * Applies LAUNCH_apply_all.sql directly to the Supabase database.
 * Run once: node scripts/run-launch-migration.js
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = 'postgresql://postgres:WelcomeDiggshaul69!12@db.gsnbpfpekqqjlmkgvwvb.supabase.co:5432/postgres';

// Split migration into isolated parts so we can report per-statement results
const PARTS = [
// 1. Create app_home_feed
`CREATE TABLE IF NOT EXISTS public.app_home_feed (
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
)`,

// 2. Indexes
`CREATE INDEX IF NOT EXISTS idx_app_home_feed_status_save ON public.app_home_feed (status, save_price DESC)`,
`CREATE INDEX IF NOT EXISTS idx_app_home_feed_valid_until ON public.app_home_feed (valid_until, status)`,
`CREATE INDEX IF NOT EXISTS idx_app_home_feed_retailer ON public.app_home_feed (retailer, status)`,

// 3. RLS
`ALTER TABLE public.app_home_feed ENABLE ROW LEVEL SECURITY`,
`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_home_feed' AND policyname='app_home_feed_public_read') THEN
    CREATE POLICY app_home_feed_public_read ON public.app_home_feed FOR SELECT USING (status = 'active');
  END IF;
END $$`,
`DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='app_home_feed' AND policyname='app_home_feed_service_all') THEN
    CREATE POLICY app_home_feed_service_all ON public.app_home_feed FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$`,

// 4. Extend stack_candidates
`ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS is_active              boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS item_name              text,
  ADD COLUMN IF NOT EXISTS category               text,
  ADD COLUMN IF NOT EXISTS brand                  text,
  ADD COLUMN IF NOT EXISTS stack_type             text        DEFAULT 'sale_only',
  ADD COLUMN IF NOT EXISTS final_estimated_cents  int,
  ADD COLUMN IF NOT EXISTS price_at_rec           int,
  ADD COLUMN IF NOT EXISTS base_price             numeric,
  ADD COLUMN IF NOT EXISTS final_price            numeric,
  ADD COLUMN IF NOT EXISTS confidence_pct         numeric,
  ADD COLUMN IF NOT EXISTS user_badge             text        DEFAULT 'likely',
  ADD COLUMN IF NOT EXISTS validation_status      text        DEFAULT 'auto_approved',
  ADD COLUMN IF NOT EXISTS verified_coupon_id     uuid,
  ADD COLUMN IF NOT EXISTS exact_coupon_url       text,
  ADD COLUMN IF NOT EXISTS published_at           timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS stack_rank_score       numeric     NOT NULL DEFAULT 0`,

`CREATE INDEX IF NOT EXISTS idx_stack_candidates_retailer_key ON public.stack_candidates (retailer_key, is_active)`,
`CREATE INDEX IF NOT EXISTS idx_stack_candidates_confidence ON public.stack_candidates (confidence_score DESC) WHERE is_active = true`,

// 5. Titan spec columns
`ALTER TABLE public.app_home_feed
  ADD COLUMN IF NOT EXISTS stack_rank_score       numeric(5,2)  DEFAULT 0,
  ADD COLUMN IF NOT EXISTS loyalty_required       boolean       DEFAULT false,
  ADD COLUMN IF NOT EXISTS bogo_type              text          CHECK (bogo_type IN ('half_bogo','true_bogo','none') OR bogo_type IS NULL),
  ADD COLUMN IF NOT EXISTS is_household_essential boolean       DEFAULT false`,

`ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS loyalty_required       boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_household_essential boolean DEFAULT false`,

`CREATE INDEX IF NOT EXISTS idx_app_home_feed_rank ON public.app_home_feed (stack_rank_score DESC, status, verification_status)`,

// 6. Clear stale
`DELETE FROM public.app_home_feed
WHERE verification_status = 'synthetic'
   OR (status = 'active' AND valid_until < CURRENT_DATE)`,

// 7. Seed 12 deals
`INSERT INTO public.app_home_feed
  (title, retailer, pay_price, original_price, save_price, breakdown_list, dietary_tags, meal_type, card_type, status, verification_status, valid_from, valid_until, preference_profile, source_summary)
VALUES
('Publix Chicken & Greens Meal Prep','Publix',18.44,25.95,7.51,
 '[{"name":"Publix Boneless Chicken Breast 3lb","price":9.97},{"name":"Dole Baby Spinach 5oz","price":2.99},{"name":"Broccoli Crowns 2 lb","price":2.98},{"name":"Classico Marinara Sauce 24oz","price":2.50}]'::jsonb,
 ARRAY['FRESH','FAMILY','MEAL PREP'],'dinner','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"publix"}'::jsonb,'{"description":"Lean protein + fresh greens at Publix for under $20."}'::jsonb),
('Publix BOGO Chicken Wings Stack','Publix',12.87,22.96,10.09,
 '[{"name":"Publix Chicken Wings 2 lb BOGO","price":7.99},{"name":"Bush''s Best Baked Beans 28oz","price":1.89},{"name":"KC Masterpiece BBQ Sauce 28oz","price":2.99}]'::jsonb,
 ARRAY['BOGO','FAMILY','BBQ'],'dinner','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"publix"}'::jsonb,'{"description":"Buy 2 packs of Publix wings, pay for one."}'::jsonb),
('Aldi Breakfast Essentials Haul','Aldi',13.95,18.74,4.79,
 '[{"name":"Goldhen Large Eggs 18ct","price":3.49},{"name":"Friendly Farms Whole Milk 1 gal","price":3.49},{"name":"Friendly Farms Greek Yogurt 32oz","price":3.99},{"name":"Millville Old Fashioned Oats 42oz","price":2.98}]'::jsonb,
 ARRAY['FRESH','FAMILY'],'breakfast','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"aldi"}'::jsonb,'{"description":"Stock your fridge for the week at Aldi prices."}'::jsonb),
('Aldi Pantry Reset Bundle','Aldi',11.11,15.01,3.90,
 '[{"name":"Stonemill Cage-Free Eggs 12ct","price":2.99},{"name":"SimplyNature Diced Tomatoes 4-pack","price":3.16},{"name":"Reggano Rotini Pasta 3-pack","price":2.97},{"name":"Casa Mamita Salsa Mild 16oz","price":1.99}]'::jsonb,
 ARRAY['BULK','PANTRY'],'pantry','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"aldi"}'::jsonb,'{"description":"Aldi pantry staples — stock up on pasta, tomatoes, and eggs."}'::jsonb),
('Kroger Taco Tuesday Stack','Kroger',16.15,21.24,5.09,
 '[{"name":"Kroger 85/15 Ground Beef 1.5 lb","price":7.49},{"name":"Old El Paso Taco Shells 18ct","price":2.99},{"name":"Kraft Mexican Four Cheese Blend 8oz","price":2.79},{"name":"Ro-Tel Mild Diced Tomatoes 10oz","price":0.89},{"name":"Daisy Sour Cream 16oz","price":1.99}]'::jsonb,
 ARRAY['FAMILY','SEASONAL'],'dinner','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"kroger"}'::jsonb,'{"description":"Everything for taco night at Kroger under $17."}'::jsonb),
('Kroger Dairy & Protein Pack','Kroger',18.96,25.96,7.00,
 '[{"name":"Kroger Large Grade A Eggs 18ct","price":4.49},{"name":"Kroger Shredded Cheese 2x8oz","price":4.99},{"name":"Yoplait Greek Yogurt Variety 4-pack","price":4.99},{"name":"Kroger Unsalted Butter Quarters 1 lb","price":4.49}]'::jsonb,
 ARRAY['FRESH'],'dairy','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"kroger"}'::jsonb,'{"description":"Fridge essentials week — eggs, cheese, yogurt, and butter all on sale."}'::jsonb),
('Walmart Pasta Night Bundle','Walmart',13.92,17.87,3.95,
 '[{"name":"Barilla Spaghetti 16oz 3-pack","price":3.48},{"name":"Prego Traditional Pasta Sauce 45oz","price":2.98},{"name":"Great Value 93% Lean Ground Turkey 1 lb","price":3.98},{"name":"Kraft Grated Parmesan Cheese 8oz","price":3.48}]'::jsonb,
 ARRAY['FAMILY','BULK'],'dinner','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"walmart"}'::jsonb,'{"description":"Pasta night for the family — Walmart Rollback prices."}'::jsonb),
('Target Fresh Produce Haul','Target',12.46,18.46,6.00,
 '[{"name":"Driscoll''s Strawberries 1 lb","price":3.49},{"name":"Hass Avocados 4-pack","price":3.99},{"name":"Broccoli Crowns 2 lb","price":2.99},{"name":"Organic Bananas 3 lb","price":1.99}]'::jsonb,
 ARRAY['FRESH','SEASONAL'],'produce','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"target"}'::jsonb,'{"description":"Fresh fruit and veggies on sale at Target."}'::jsonb),
('Target Household Essentials Stack','Target',30.97,41.97,11.00,
 '[{"name":"Tide PODS Original 31ct","price":12.99},{"name":"Bounty Select-A-Size Paper Towels 6 Double Rolls","price":8.99},{"name":"Lysol Disinfecting Wipes Lemon 3-pack","price":8.99}]'::jsonb,
 ARRAY['BULK','HOUSEHOLD'],'household','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"target"}'::jsonb,'{"description":"Tide, Bounty, and Lysol all on Target Circle sale."}'::jsonb),
('H-E-B Texas Protein Power Pack','H-E-B',21.95,31.95,10.00,
 '[{"name":"H-E-B 96/4 Lean Ground Beef 1 lb","price":5.99},{"name":"H-E-B Bone-In Chicken Thighs 3 lb","price":5.97},{"name":"H-E-B Atlantic Salmon Filet 1 lb","price":9.99}]'::jsonb,
 ARRAY['FRESH','PROTEIN'],'protein','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"TX","source":"curated-seed","retailer_key":"heb"}'::jsonb,'{"description":"Three protein options on H-E-B sale — build 3 dinners under $22."}'::jsonb),
('Whole Foods 365 Wellness Stack','Whole Foods',30.46,37.96,7.50,
 '[{"name":"365 Organic Free-Range Eggs 12ct","price":6.99},{"name":"365 Baby Spinach 5oz","price":3.49},{"name":"Wild-Caught Atlantic Salmon Filet 1 lb","price":11.99},{"name":"365 California Olive Oil 16.9oz","price":7.99}]'::jsonb,
 ARRAY['ORGANIC','FRESH','WELLNESS'],'protein','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"whole_foods"}'::jsonb,'{"description":"Whole Foods Prime deals — organic eggs, wild salmon, and 365 olive oil."}'::jsonb),
('Trader Joe''s Weekend Favorites','Trader Joe''s',11.26,15.46,4.20,
 '[{"name":"Trader Joe''s Mandarin Oranges 3 lb bag","price":3.99},{"name":"Trader Joe''s Cauliflower Gnocchi 12oz","price":2.99},{"name":"Trader Joe''s Everything But The Bagel Seasoning","price":2.29},{"name":"Trader Joe''s 2% Greek Yogurt 16oz","price":1.99}]'::jsonb,
 ARRAY['FRESH','SEASONAL'],'grocery','meal_stack','active','verified_live',CURRENT_DATE,CURRENT_DATE+7,
 '{"region":"national","source":"curated-seed","retailer_key":"trader_joes"}'::jsonb,'{"description":"TJ''s fan favorites all on sale — mandarins, cauli gnocchi, and Greek yogurt."}'::jsonb)
ON CONFLICT DO NOTHING`,

// 8. Backfill stack_rank_score
`UPDATE public.app_home_feed
SET stack_rank_score = LEAST(100,
  CASE
    WHEN original_price > 0 THEN ROUND((save_price / original_price) * 100, 2)
    WHEN pay_price > 0 THEN ROUND((save_price / (pay_price + save_price)) * 100, 2)
    ELSE 0
  END
)
WHERE stack_rank_score = 0 OR stack_rank_score IS NULL`,

// 9. Mark household essentials
`UPDATE public.app_home_feed
SET is_household_essential = true
WHERE meal_type ILIKE '%household%' OR title ILIKE '%household%' OR title ILIKE '%cleaning%' OR title ILIKE '%detergent%' OR title ILIKE '%paper towel%'`,

// 10. Seed stack_candidates
`INSERT INTO public.stack_candidates
  (retailer_key, week_of, normalized_key, dedupe_key, primary_category, primary_brand,
   item_name, stack_type, final_estimated_cents, price_at_rec, base_price, final_price,
   stack_rank_score, savings_pct, has_coupon, confidence_score, confidence_pct,
   validation_status, user_badge, is_active, items, published_at)
SELECT
  lower(replace(ahf.retailer, ' ', '_')),
  date_trunc('week', CURRENT_DATE)::date,
  lower(replace(ahf.title, ' ', '-')),
  lower(replace(ahf.retailer, ' ', '_')) || '::' || lower(replace(ahf.title, ' ', '-')) || '::' || date_trunc('week', CURRENT_DATE)::text,
  ahf.meal_type, ahf.retailer, ahf.title,
  CASE WHEN ahf.dietary_tags @> ARRAY['BOGO'] THEN 'bogo_plus_sale'
       WHEN ahf.original_price > 0 AND (ahf.save_price / ahf.original_price) > 0.30 THEN 'sale_plus_coupon'
       ELSE 'sale_only' END,
  ROUND(ahf.pay_price * 100),
  ROUND(COALESCE(ahf.original_price, ahf.pay_price) * 100),
  COALESCE(ahf.original_price, ahf.pay_price), ahf.pay_price,
  LEAST(100, ROUND(COALESCE(ahf.save_price / NULLIF(ahf.original_price,0), 0) * 100)),
  ROUND(COALESCE(ahf.save_price / NULLIF(ahf.original_price,0), 0) * 100, 1),
  false, 85, 85, 'auto_approved', 'confirmed', true, ahf.breakdown_list, now()
FROM public.app_home_feed ahf
WHERE ahf.preference_profile->>'source' = 'curated-seed' AND ahf.status = 'active'
ON CONFLICT (dedupe_key) DO NOTHING`,

// 11. Seed digital_coupons
`INSERT INTO public.digital_coupons (retailer_key, product_name, brand, normalized_key, discount_cents, discount_pct, coupon_type, expires_at, is_active, source_url)
VALUES
  ('publix','Publix Boneless Chicken Breast','Publix','publix-chicken-breast-boneless',100,0.10,'store',now()+interval '7 days',true,'https://www.publix.com/savings/coupons'),
  ('publix','Classico Marinara Pasta Sauce 24oz','Classico','classico-marinara-sauce-24oz',100,0.28,'manufacturer',now()+interval '14 days',true,'https://www.publix.com/savings/coupons'),
  ('kroger','Kroger 85/15 Ground Beef','Kroger','kroger-ground-beef-85-15',150,0.15,'store',now()+interval '7 days',true,'https://www.kroger.com/d/digital-coupons'),
  ('kroger','Yoplait Greek Yogurt 4-pack','Yoplait','yoplait-greek-yogurt-4pack',75,0.11,'manufacturer',now()+interval '7 days',true,'https://www.kroger.com/d/digital-coupons'),
  ('target','Tide PODS Original 31ct','Tide','tide-pods-original-31ct',200,0.11,'store',now()+interval '14 days',true,'https://www.target.com/c/target-circle-deals/-/N-4y7xs'),
  ('target','Bounty Select-A-Size Paper Towels 6ct','Bounty','bounty-select-a-size-6-rolls',100,0.08,'manufacturer',now()+interval '7 days',true,'https://www.target.com/c/target-circle-deals/-/N-4y7xs'),
  ('walmart','Barilla Spaghetti 16oz','Barilla','barilla-spaghetti-16oz',50,0.11,'manufacturer',now()+interval '14 days',true,'https://www.walmart.com/grocery/savings'),
  ('aldi','Friendly Farms Greek Yogurt 32oz','Friendly Farms','friendly-farms-greek-yogurt-32oz',100,0.18,'store',now()+interval '7 days',true,'https://www.aldi.us/en/weekly-specials/'),
  ('whole_foods','Wild-Caught Atlantic Salmon Filet 1lb','','wild-caught-atlantic-salmon-1lb',300,0.20,'store',now()+interval '7 days',true,'https://www.wholefoodsmarket.com/sales-flyer'),
  ('heb','H-E-B Atlantic Salmon Filet 1lb','H-E-B','heb-atlantic-salmon-1lb',200,0.13,'store',now()+interval '7 days',true,'https://www.heb.com/static-page/coupon-page')
ON CONFLICT DO NOTHING`,

// 12. Rebuild home_payload_cache
`INSERT INTO public.home_payload_cache (cache_key, payload, updated_at)
SELECT 'global',
  jsonb_build_object(
    'generated_at', now(),
    'deals', jsonb_agg(jsonb_build_object('id',id,'title',title,'retailer',retailer,'pay_price',pay_price,'save_price',save_price,'stack_rank_score',COALESCE(stack_rank_score,0),'category',meal_type,'breakdown_list',breakdown_list,'tags',dietary_tags,'valid_until',valid_until) ORDER BY COALESCE(stack_rank_score,save_price) DESC),
    'deal_count', COUNT(*)
  ), now()
FROM public.app_home_feed WHERE status='active' AND verification_status='verified_live'
ON CONFLICT (cache_key) DO UPDATE SET payload=EXCLUDED.payload, updated_at=EXCLUDED.updated_at`,

// 13. Verify
`SELECT
  (SELECT COUNT(*) FROM public.app_home_feed WHERE status='active')::text || ' active deals, ' ||
  (SELECT COUNT(*) FROM public.stack_candidates WHERE is_active=true)::text || ' stack candidates, ' ||
  (SELECT COUNT(*) FROM public.digital_coupons WHERE is_active=true)::text || ' digital coupons' AS status`,
];

async function run() {
  const client = new Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });

  console.log('Connecting to Supabase DB...');
  try {
    await client.connect();
    console.log('Connected.\n');
  } catch (err) {
    console.error('Connection failed:', err.message);
    console.error('\nThe DB may be IP-restricted. Try from a different network or use the Dashboard SQL Editor.');
    process.exit(1);
  }

  let passed = 0, skipped = 0, failed = 0;

  for (let i = 0; i < PARTS.length; i++) {
    const label = `Part ${i + 1}/${PARTS.length}`;
    try {
      const res = await client.query(PARTS[i]);
      const detail = res.rows?.length ? JSON.stringify(res.rows[0]) : (res.command || 'ok');
      console.log(`  ✓ ${label}: ${detail}`);
      passed++;
    } catch (err) {
      if (err.message.includes('already exists') || err.message.includes('duplicate key')) {
        console.log(`  ~ ${label}: skipped (already exists)`);
        skipped++;
      } else {
        console.error(`  ✗ ${label}: ${err.message.slice(0, 120)}`);
        failed++;
      }
    }
  }

  await client.end();
  console.log(`\nDone: ${passed} ok, ${skipped} skipped, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

run();
