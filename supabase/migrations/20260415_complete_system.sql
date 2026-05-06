-- ============================================================
-- Migration: 20260415_complete_system.sql
-- Purpose: Complete system tables with correct schemas.
--   1. Drop and recreate publix_store_coupon_kb with correct columns
--   2. Drop and recreate mfr_coupon_kb with correct columns
--   3. Drop and recreate basket_trigger_coupons with correct columns
--   4. Drop and recreate clip_sessions with correct columns
--   5. Drop and recreate clip_session_items with correct columns
--   6. Rebuild rebate_offers with columns savingsBreakdownEngine expects
--   7. Add is_active column to stack_candidates if missing
--   8. RLS policies
--   9. pg_cron jobs: expiry cleanup, ibotta stale flag, stack staleness
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. publix_store_coupon_kb (correct schema)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS publix_store_coupon_kb CASCADE;

CREATE TABLE publix_store_coupon_kb (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name_match     text NOT NULL,
  brand_match         text,
  size_qualifier      text,
  coupon_value        numeric(6,2) NOT NULL,
  coupon_description  text NOT NULL,
  source              text DEFAULT 'publix_extra_savings_flyer',
  lu_number           text,
  valid_from          date NOT NULL,
  valid_to            date NOT NULL,
  is_active           boolean DEFAULT true,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_publix_kb_active ON publix_store_coupon_kb (is_active, valid_to);
CREATE INDEX idx_publix_kb_name ON publix_store_coupon_kb (item_name_match);
CREATE INDEX idx_publix_kb_brand ON publix_store_coupon_kb (brand_match);

ALTER TABLE publix_store_coupon_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_publix_store_coupons
  ON publix_store_coupon_kb FOR SELECT USING (true);
CREATE POLICY admin_manage_publix_store_coupons
  ON publix_store_coupon_kb FOR ALL
  USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');

-- Seed: current ESF 4/4–4/17 (admin updates this manually every 2 weeks)
INSERT INTO publix_store_coupon_kb
  (item_name_match, brand_match, size_qualifier, coupon_value, coupon_description, valid_from, valid_to)
VALUES
  ('advil',         'Advil',       '72 ct or larger',    4.00, '$4/1 Advil or Excedrin 72ct+, ESF',                   '2026-04-04','2026-04-17'),
  ('excedrin',      'Excedrin',    '72 ct or larger',    4.00, '$4/1 Advil or Excedrin 72ct+, ESF',                   '2026-04-04','2026-04-17'),
  ('claritin',      'Claritin',    '30 to 70 ct',        4.00, '$4/1 Claritin 30-70ct, ESF',                          '2026-04-04','2026-04-17'),
  ('centrum',       'Centrum',     null,                  4.00, '$4/1 Centrum Caltrate or Emergen-C, ESF',             '2026-04-04','2026-04-17'),
  ('caltrate',      'Caltrate',    null,                  4.00, '$4/1 Centrum Caltrate or Emergen-C, ESF',             '2026-04-04','2026-04-17'),
  ('emergen-c',     'Emergen-C',   null,                  4.00, '$4/1 Centrum Caltrate or Emergen-C, ESF',             '2026-04-04','2026-04-17'),
  ('olay cleansing','Olay',        '32 to 33 ct',        2.00, '$2/1 Olay Cleansing Cloths 32-33ct, ESF',             '2026-04-04','2026-04-17'),
  ('chapstick',     'ChapStick',   '3 ct',               1.00, '$1/1 ChapStick 3ct, ESF',                             '2026-04-04','2026-04-17'),
  ('command',       '3M Command',  null,                  2.00, '$2/1 3M Command Product, ESF',                        '2026-04-04','2026-04-17'),
  ('filtrete',      '3M Filtrete', null,                  3.50, '$3.50/1 3M Filtrete Air Filter, ESF',                 '2026-04-04','2026-04-17')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 2. mfr_coupon_kb (correct schema)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS mfr_coupon_kb CASCADE;

CREATE TABLE mfr_coupon_kb (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name_match       text NOT NULL,
  brand_match           text,
  size_qualifier        text,
  coupon_value          numeric(6,2) NOT NULL,
  coupon_description    text NOT NULL,
  source                text NOT NULL,
  source_url            text,
  valid_from            date,
  valid_to              date,
  is_free_item          boolean DEFAULT false,
  limit_per_transaction int DEFAULT 1,
  limit_per_household   int,
  works_at_retailers    text[] DEFAULT ARRAY['all'],
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_mfr_kb_active ON mfr_coupon_kb (is_active, valid_to);
CREATE INDEX idx_mfr_kb_name ON mfr_coupon_kb (item_name_match);
CREATE INDEX idx_mfr_kb_brand ON mfr_coupon_kb (brand_match);

ALTER TABLE mfr_coupon_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_mfr_coupons
  ON mfr_coupon_kb FOR SELECT USING (true);
CREATE POLICY admin_manage_mfr_coupons
  ON mfr_coupon_kb FOR ALL
  USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');

INSERT INTO mfr_coupon_kb
  (item_name_match, brand_match, size_qualifier, coupon_value, coupon_description, source, source_url, valid_to)
VALUES
  ('advil',           'Advil',           '144ct or larger',  4.00, '$4/1 Advil 144ct+ or PM 80ct+',          'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-06-01'),
  ('advil',           'Advil',           '72ct or larger',   2.00, '$2/1 Advil 72ct+',                       'Haleon Huddle',  'https://haleonhuddle.com/en-us/everyday-health-coupons/',              '2026-06-01'),
  ('excedrin',        'Excedrin',        null,               1.50, '$1.50/1 Excedrin product',               'Haleon Huddle',  'https://haleonhuddle.com/en-us/everyday-health-coupons/',              '2026-06-01'),
  ('claritin',        'Claritin',        '56ct or larger',  10.00, '$10/1 Claritin 56ct+',                   'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-06-01'),
  ('claritin',        'Claritin',        '20ct or larger',   5.00, '$5/1 Claritin 20ct+',                    'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-06-01'),
  ('centrum',         'Centrum',         '60ct or larger',   3.00, '$3/1 Centrum 60ct+',                     'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-06-01'),
  ('emergen-c',       'Emergen-C',       '28ct or larger',   2.00, '$2/1 Emergen-C 28ct+',                   'Haleon Huddle',  'https://haleonhuddle.com/en-us/everyday-health-coupons/',              '2026-06-01'),
  ('tide',            'Tide',            null,               2.00, '$2/1 Tide product',                      'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('bounty',          'Bounty',          null,               0.50, '$0.50/1 Bounty product',                 'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('charmin',         'Charmin',         null,               1.00, '$1/1 Charmin product',                   'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('dawn',            'Dawn',            null,               0.50, '$0.50/1 Dawn product',                   'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('pantene',         'Pantene',         null,               2.00, '$2/1 Pantene product',                   'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('olay',            'Olay',            null,               2.00, '$2/1 Olay product',                      'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('gillette',        'Gillette',        null,               2.00, '$2/1 Gillette product',                  'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('oral-b',          'Oral-B',          null,               1.00, '$1/1 Oral-B product',                    'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('crest',           'Crest',           null,               1.00, '$1/1 Crest product',                     'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('head & shoulders','Head & Shoulders',null,               2.00, '$2/1 Head & Shoulders product',          'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('old spice',       'Old Spice',       null,               1.00, '$1/1 Old Spice product',                 'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('secret',          'Secret',          null,               1.00, '$1/1 Secret product',                    'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31'),
  ('colgate',         'Colgate',         null,               0.50, '$0.50/1 Colgate product',                'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('dove',            'Dove',            null,               1.00, '$1/1 Dove product',                      'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('wonder',          'Wonder',          null,               0.75, '$0.75/1 Wonder Bread',                   'SmartSource',   'https://www.smartsource.com',                                          '2026-06-01'),
  ('lipton',          'Lipton',          null,               1.00, '$1/1 Lipton Tea Bags',                   'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-06-01'),
  ('kraft',           'Kraft',           null,               0.75, '$0.75/1 Kraft product',                  'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-06-01'),
  ('nature made',     'Nature Made',     null,               2.00, '$2/1 Nature Made product',               'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('tylenol',         'Tylenol',         null,               1.00, '$1/1 Tylenol product',                   'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('zyrtec',          'Zyrtec',          null,               4.00, '$4/1 Zyrtec product 24ct+',              'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('flonase',         'Flonase',         null,               4.00, '$4/1 Flonase product',                   'Haleon Huddle',  'https://haleonhuddle.com/en-us/everyday-health-coupons/',              '2026-05-31'),
  ('tums',            'Tums',            null,               1.00, '$1/1 Tums product',                      'Coupons.com',    'https://www.coupons.com/printable',                                    '2026-05-31'),
  ('pepto',           'Pepto-Bismol',    null,               1.00, '$1/1 Pepto-Bismol product',              'P&G Everyday',  'https://www.pgeveryday.com/coupons',                                   '2026-05-31')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 3. basket_trigger_coupons (correct schema)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS basket_trigger_coupons CASCADE;

CREATE TABLE basket_trigger_coupons (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_description   text NOT NULL,
  qualifying_brands     text[] NOT NULL,
  spend_threshold       numeric(8,2) NOT NULL,
  coupon_value          numeric(6,2) NOT NULL,
  source                text NOT NULL,
  source_url            text,
  retailer_key          text DEFAULT 'publix',
  valid_to              date,
  is_active             boolean DEFAULT true,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX idx_basket_trigger_active ON basket_trigger_coupons (is_active, retailer_key);

ALTER TABLE basket_trigger_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_read_basket_triggers
  ON basket_trigger_coupons FOR SELECT USING (true);
CREATE POLICY admin_manage_basket_triggers
  ON basket_trigger_coupons FOR ALL
  USING (auth.jwt()->>'email' = 'ddavis@getsnippd.com');

INSERT INTO basket_trigger_coupons
  (trigger_description, qualifying_brands, spend_threshold, coupon_value, source, source_url, retailer_key, valid_to)
VALUES
  (
    '$5 off wyb $25 on P&G brands',
    ARRAY['align','always','aussie','crest','gillette','herbal essences','head & shoulders',
          'metamucil','native','olay','old spice','oral-b','pantene','pepto bismol',
          'secret','tampax','venus','vicks'],
    25.00, 5.00,
    'Publix Digital Coupon',
    'https://www.publix.com/savings/digital-coupons',
    'publix',
    '2026-04-30'
  )
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 4. clip_sessions (correct schema)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS clip_session_items CASCADE;
DROP TABLE IF EXISTS clip_sessions CASCADE;

CREATE TABLE clip_sessions (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stack_id                    text NOT NULL,
  retailer_key                text NOT NULL,
  trip_date                   date,
  status                      text DEFAULT 'pending',
  total_coupons               int DEFAULT 0,
  clipped_count               int DEFAULT 0,
  ibotta_loaded_count         int DEFAULT 0,
  fetch_snapped               boolean DEFAULT false,
  swagbucks_snapped           boolean DEFAULT false,
  savings_at_build            numeric(8,2),
  savings_at_shop             numeric(8,2),
  expired_coupons_removed     int DEFAULT 0,
  cashier_note                text,
  created_at                  timestamptz DEFAULT now(),
  updated_at                  timestamptz DEFAULT now()
);

CREATE INDEX idx_clip_sessions_user ON clip_sessions (user_id);
CREATE INDEX idx_clip_sessions_status ON clip_sessions (status);

ALTER TABLE clip_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_clip_sessions ON clip_sessions FOR ALL
  USING (auth.uid() = user_id);

-- ────────────────────────────────────────────────────────────
-- 5. clip_session_items (correct schema)
-- ────────────────────────────────────────────────────────────
CREATE TABLE clip_session_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id          uuid REFERENCES clip_sessions(id) ON DELETE CASCADE,
  coupon_type         text NOT NULL,
  item_name           text NOT NULL,
  brand               text,
  coupon_value        numeric(6,2),
  source              text NOT NULL,
  source_url          text,
  deep_link           text,
  timing              text NOT NULL,
  sort_order          int NOT NULL,
  status              text DEFAULT 'pending',
  actioned_at         timestamptz,
  expires_at          date,
  is_critical         boolean DEFAULT false,
  ibotta_verify_flag  boolean DEFAULT false,
  created_at          timestamptz DEFAULT now()
);

CREATE INDEX idx_csi_session ON clip_session_items (session_id);
CREATE INDEX idx_csi_status ON clip_session_items (status);
CREATE INDEX idx_csi_timing ON clip_session_items (timing, sort_order);

ALTER TABLE clip_session_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_clip_session_items ON clip_session_items FOR ALL
  USING (session_id IN (
    SELECT id FROM clip_sessions WHERE user_id = auth.uid()
  ));

-- ────────────────────────────────────────────────────────────
-- 6. rebate_offers — rebuild with correct columns
--    (savingsBreakdownEngine expects: platform, rebate_value_cents,
--     product_name, is_active, timing_hint)
-- ────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS rebate_offers CASCADE;

CREATE TABLE rebate_offers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform            text NOT NULL,         -- 'ibotta'|'fetch'|'swagbucks'|'checkout51'
  offer_id            text,                  -- platform's internal ID
  product_name        text NOT NULL,
  brand               text,
  upc                 text,
  normalized_key      text,
  rebate_value_cents  int NOT NULL,          -- integer cents
  rebate_type         text NOT NULL DEFAULT 'fixed',  -- 'fixed'|'pct'
  min_qty             int NOT NULL DEFAULT 1,
  min_purchase_cents  int,
  claim_url           text,
  timing_hint         text DEFAULT 'after_receipt',   -- 'before_shopping'|'after_receipt'
  valid_from          date,
  valid_to            date,
  retailer_key        text,                  -- null = all retailers
  is_active           boolean DEFAULT true,
  raw_json            jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_rebate_nk ON rebate_offers (normalized_key);
CREATE INDEX idx_rebate_brand ON rebate_offers (brand);
CREATE INDEX idx_rebate_upc ON rebate_offers (upc) WHERE upc IS NOT NULL;
CREATE INDEX idx_rebate_platform ON rebate_offers (platform);
CREATE INDEX idx_rebate_active ON rebate_offers (is_active, valid_to);

ALTER TABLE rebate_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_only_rebate_offers ON rebate_offers
  USING (auth.role() = 'service_role');

-- Seeds
INSERT INTO rebate_offers
  (platform, product_name, brand, normalized_key, rebate_value_cents, timing_hint, claim_url, valid_from, valid_to)
VALUES
  ('ibotta', 'Any Kerrygold Butter product',     'Kerrygold',    'kerrygold-butter',     150, 'after_receipt', 'https://ibotta.com/rebates', '2026-04-01','2026-04-30'),
  ('ibotta', 'Any Ben & Jerrys ice cream pint',  'Ben & Jerrys', 'ben-jerrys-ice-cream', 100, 'after_receipt', 'https://ibotta.com/rebates', '2026-04-01','2026-04-30'),
  ('fetch',  'Any Advil product',                'Advil',        'advil',                 50, 'after_receipt', 'https://fetchrewards.com',   '2026-04-01','2026-04-30'),
  ('ibotta', 'Any Cheerios variety',             'Cheerios',     'cheerios',              50, 'after_receipt', 'https://ibotta.com/rebates', '2026-04-01','2026-04-30'),
  ('ibotta', 'Tide PODS 16ct or larger',         'Tide',         'tide-pods',            200, 'after_receipt', 'https://ibotta.com/rebates', '2026-04-01','2026-04-30'),
  ('ibotta', 'Any Claritin product',             'Claritin',     'claritin',             200, 'before_shopping','https://ibotta.com/rebates','2026-04-01','2026-04-30'),
  ('ibotta', 'Any Centrum product',              'Centrum',      'centrum',              150, 'before_shopping','https://ibotta.com/rebates','2026-04-01','2026-04-30'),
  ('swagbucks','Any Bounty paper towels',        'Bounty',       'bounty-paper-towels',  100, 'after_receipt', 'https://swagbucks.com/shop/grocery','2026-04-01','2026-04-30'),
  ('checkout51','Any Dove body wash',            'Dove',         'dove-body-wash',       100, 'after_receipt', 'https://checkout51.com',     '2026-04-01','2026-04-30'),
  ('ibotta', 'Any Nature Made supplement',       'Nature Made',  'nature-made',          200, 'before_shopping','https://ibotta.com/rebates','2026-04-01','2026-04-30')
ON CONFLICT DO NOTHING;

-- ────────────────────────────────────────────────────────────
-- 7. stack_candidates — ensure is_active column exists
-- ────────────────────────────────────────────────────────────
ALTER TABLE stack_candidates
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;

-- ────────────────────────────────────────────────────────────
-- 8. updated_at trigger for clip_sessions and rebate_offers
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['publix_store_coupon_kb','rebate_offers','clip_sessions'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_' || t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- ────────────────────────────────────────────────────────────
-- 9. pg_cron jobs
-- ────────────────────────────────────────────────────────────

-- Unschedule existing jobs if present (idempotent)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-coupon-expiry-cleanup') THEN
    PERFORM cron.unschedule('snippd-coupon-expiry-cleanup');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-ibotta-stale-flag') THEN
    PERFORM cron.unschedule('snippd-ibotta-stale-flag');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-stack-staleness-check') THEN
    PERFORM cron.unschedule('snippd-stack-staleness-check');
  END IF;
END $$;

-- Nightly expiry cleanup — 2am daily
SELECT cron.schedule(
  'snippd-coupon-expiry-cleanup',
  '0 2 * * *',
  $$
  UPDATE publix_store_coupon_kb
    SET is_active = false, updated_at = now()
    WHERE valid_to < CURRENT_DATE AND is_active = true;

  UPDATE mfr_coupon_kb
    SET is_active = false
    WHERE valid_to < CURRENT_DATE AND is_active = true;

  UPDATE basket_trigger_coupons
    SET is_active = false
    WHERE valid_to < CURRENT_DATE AND is_active = true;

  UPDATE rebate_offers
    SET is_active = false, updated_at = now()
    WHERE valid_to < CURRENT_DATE AND is_active = true;

  UPDATE clip_session_items
    SET status = 'expired'
    WHERE expires_at < CURRENT_DATE AND status = 'pending';
  $$
);

-- Flag stale ibotta offers older than 48h — 6am daily
SELECT cron.schedule(
  'snippd-ibotta-stale-flag',
  '0 6 * * *',
  $$
  UPDATE clip_session_items
    SET ibotta_verify_flag = true
    WHERE coupon_type = 'ibotta'
      AND status = 'pending'
      AND created_at < now() - interval '48 hours';
  $$
);

-- Stack staleness check — 3am daily
SELECT cron.schedule(
  'snippd-stack-staleness-check',
  '0 3 * * *',
  $$
  UPDATE clip_sessions
    SET status = 'stale'
    WHERE status IN ('pending','in_progress')
      AND trip_date < CURRENT_DATE - interval '7 days';
  $$
);
