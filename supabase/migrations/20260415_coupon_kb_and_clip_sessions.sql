-- ============================================================
-- Migration: 20260415_coupon_kb_and_clip_sessions.sql
-- Purpose: Coupon knowledge bases (Publix store + MFR),
--          basket trigger coupons, clip sessions + items,
--          and rebate_offers table.
-- ============================================================

-- ----------------------------------------------------------------
-- 1. publix_store_coupon_kb
--    Publix "store coupons" — the ones with LU numbers that
--    scan first at register, stackable with MFR coupons.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS publix_store_coupon_kb (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lu_number        text NOT NULL,                 -- Publix LU barcode number
  title            text NOT NULL,
  brand            text,
  normalized_key   text,                          -- brand+product slug for matching
  discount_type    text NOT NULL DEFAULT 'fixed', -- 'fixed' | 'pct' | 'bogo'
  discount_value   numeric(8,2) NOT NULL DEFAULT 0,
  min_qty          int NOT NULL DEFAULT 1,
  requires_loyalty boolean NOT NULL DEFAULT true,
  valid_from       date,
  valid_to         date,
  source_url       text,
  raw_text         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_publix_kb_lu ON publix_store_coupon_kb (lu_number);
CREATE INDEX IF NOT EXISTS idx_publix_kb_nk ON publix_store_coupon_kb (normalized_key);
CREATE INDEX IF NOT EXISTS idx_publix_kb_brand ON publix_store_coupon_kb (brand);
CREATE INDEX IF NOT EXISTS idx_publix_kb_valid ON publix_store_coupon_kb (valid_to) WHERE valid_to IS NOT NULL;

ALTER TABLE publix_store_coupon_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_publix_kb" ON publix_store_coupon_kb
  USING (auth.role() = 'service_role');

-- Seeds — example Publix store coupons (iHeartPublix reference)
INSERT INTO publix_store_coupon_kb
  (lu_number, title, brand, normalized_key, discount_type, discount_value, min_qty, valid_from, valid_to)
VALUES
  ('4011001', 'Publix $1.00 off Tide PODS 16-32ct', 'Tide', 'tide-pods', 'fixed', 1.00, 1, '2026-04-13', '2026-04-19'),
  ('4011002', 'Publix $1.50 off Bounty Paper Towels 4ct+', 'Bounty', 'bounty-paper-towels', 'fixed', 1.50, 1, '2026-04-13', '2026-04-19'),
  ('4011003', 'Publix $2.00 off Advil 40ct+', 'Advil', 'advil', 'fixed', 2.00, 1, '2026-04-13', '2026-04-19'),
  ('4011004', 'Publix $1.00 off Cheerios any variety', 'Cheerios', 'cheerios', 'fixed', 1.00, 1, '2026-04-13', '2026-04-19'),
  ('4011005', 'Publix $0.75 off Wonder Bread any loaf', 'Wonder Bread', 'wonder-bread', 'fixed', 0.75, 1, '2026-04-13', '2026-04-19')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 2. mfr_coupon_kb
--    Manufacturer coupons — universal, one per item max.
--    Applied AFTER Publix store coupon at register.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mfr_coupon_kb (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barcode          text,                          -- UPC or coupon barcode if known
  title            text NOT NULL,
  brand            text,
  normalized_key   text,
  discount_type    text NOT NULL DEFAULT 'fixed', -- 'fixed' | 'pct' | 'bogo'
  discount_value   numeric(8,2) NOT NULL DEFAULT 0,
  min_qty          int NOT NULL DEFAULT 1,
  stackable_with   text[] DEFAULT ARRAY['store_coupon', 'digital_coupon'],
  source           text,                          -- 'coupons.com' | 'smartsource' | 'ibotta' | 'printable'
  valid_from       date,
  valid_to         date,
  raw_text         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mfr_kb_nk ON mfr_coupon_kb (normalized_key);
CREATE INDEX IF NOT EXISTS idx_mfr_kb_brand ON mfr_coupon_kb (brand);
CREATE INDEX IF NOT EXISTS idx_mfr_kb_barcode ON mfr_coupon_kb (barcode) WHERE barcode IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mfr_kb_valid ON mfr_coupon_kb (valid_to) WHERE valid_to IS NOT NULL;

ALTER TABLE mfr_coupon_kb ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_mfr_kb" ON mfr_coupon_kb
  USING (auth.role() = 'service_role');

-- Seeds
INSERT INTO mfr_coupon_kb
  (title, brand, normalized_key, discount_type, discount_value, min_qty, source, valid_from, valid_to)
VALUES
  ('$2.00 off any ONE Advil Product 40ct or larger', 'Advil', 'advil', 'fixed', 2.00, 1, 'coupons.com', '2026-04-01', '2026-04-30'),
  ('$1.00 off ONE Tide PODS Laundry Detergent 16ct or larger', 'Tide', 'tide-pods', 'fixed', 1.00, 1, 'smartsource', '2026-04-06', '2026-04-26'),
  ('$0.50 off ONE Cheerios cereals 8.9oz or larger', 'Cheerios', 'cheerios', 'fixed', 0.50, 1, 'smartsource', '2026-04-06', '2026-04-26'),
  ('$1.00 off TWO Bounty Paper Towel products', 'Bounty', 'bounty-paper-towels', 'fixed', 1.00, 2, 'coupons.com', '2026-04-01', '2026-04-30')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 3. basket_trigger_coupons
--    Spend-threshold coupons (e.g. P&G $5 off wyb $25).
--    Auto-detected when qualifying items in basket total >= threshold.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS basket_trigger_coupons (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title                text NOT NULL,
  sponsor              text,                          -- 'P&G' | 'Unilever' | etc.
  qualifying_brands    text[] NOT NULL DEFAULT '{}',  -- brands that count toward threshold
  spend_threshold_cents int NOT NULL,                 -- e.g. 2500 = $25.00
  discount_cents       int NOT NULL,                  -- e.g. 500 = $5.00
  discount_type        text NOT NULL DEFAULT 'fixed', -- 'fixed' only for now
  retailer_key         text,                          -- null = all retailers
  valid_from           date,
  valid_to             date,
  lu_number            text,                          -- Publix LU if applicable
  source_url           text,
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_basket_trigger_sponsor ON basket_trigger_coupons (sponsor);
CREATE INDEX IF NOT EXISTS idx_basket_trigger_retailer ON basket_trigger_coupons (retailer_key);
CREATE INDEX IF NOT EXISTS idx_basket_trigger_valid ON basket_trigger_coupons (valid_to) WHERE valid_to IS NOT NULL;

ALTER TABLE basket_trigger_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_basket_triggers" ON basket_trigger_coupons
  USING (auth.role() = 'service_role');

-- Seed: P&G $5 off wyb $25
INSERT INTO basket_trigger_coupons
  (title, sponsor, qualifying_brands, spend_threshold_cents, discount_cents, retailer_key, valid_from, valid_to, lu_number)
VALUES
  (
    'P&G $5.00 off when you buy $25.00 of participating P&G products',
    'P&G',
    ARRAY['Tide','Bounty','Charmin','Pampers','Gillette','Dawn','Febreze','Swiffer','Cascade','Crest','Oral-B','Pantene','Head & Shoulders','Old Spice','Secret','Always','Tampax','Vicks','Nyquil','Dayquil','Metamucil','Pepto-Bismol','Prilosec OTC','Puffs'],
    2500,
    500,
    'publix',
    '2026-04-13',
    '2026-04-19',
    '4099001'
  )
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 4. clip_sessions
--    One per user per shopping trip. Tracks state through 4 phases:
--    validating → pre_store → post_trip → completed
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clip_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  retailer_key    text NOT NULL,
  status          text NOT NULL DEFAULT 'validating'
                    CHECK (status IN ('validating','pre_store','post_trip','completed','abandoned')),
  stack_ids       uuid[] DEFAULT '{}',        -- stack_candidates IDs in this session
  total_pay_cents  int,                       -- computed at session build
  total_savings_cents int,                   -- computed at session build
  basket_trigger_id uuid REFERENCES basket_trigger_coupons(id),
  basket_trigger_activated boolean DEFAULT false,
  notes           text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  pre_store_at    timestamptz,
  post_trip_at    timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clip_sessions_user ON clip_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_clip_sessions_status ON clip_sessions (status);
CREATE INDEX IF NOT EXISTS idx_clip_sessions_retailer ON clip_sessions (retailer_key);

ALTER TABLE clip_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_clip_sessions" ON clip_sessions
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 5. clip_session_items
--    Line items within a clip session. One row per deal in the stack.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clip_session_items (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_session_id      uuid NOT NULL REFERENCES clip_sessions(id) ON DELETE CASCADE,
  user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stack_candidate_id   uuid,                 -- FK to stack_candidates.id (soft — no hard FK to avoid cross-schema issues)
  product_name         text NOT NULL,
  brand                text,
  normalized_key       text,

  -- Coupon layers (Layer A/B/C — never merged)
  publix_coupon_id     uuid REFERENCES publix_store_coupon_kb(id),
  publix_coupon_lu     text,
  publix_coupon_value  numeric(8,2) DEFAULT 0,

  mfr_coupon_id        uuid REFERENCES mfr_coupon_kb(id),
  mfr_coupon_value     numeric(8,2) DEFAULT 0,

  digital_coupon_clipped boolean DEFAULT false,
  digital_coupon_value   numeric(8,2) DEFAULT 0,

  -- Math (all in dollars, 2dp)
  original_price       numeric(8,2) NOT NULL,
  sale_price           numeric(8,2) NOT NULL,
  pay_price            numeric(8,2) NOT NULL,   -- what user pays at register
  total_savings        numeric(8,2) NOT NULL,   -- original - pay_price

  -- Rebate (post-purchase, never affects pay_price)
  rebate_source        text,                    -- 'ibotta'|'fetch'|'swagbucks'
  rebate_value         numeric(8,2) DEFAULT 0,
  true_cost            numeric(8,2),            -- pay_price - rebate_value

  -- Clip state
  is_clipped           boolean DEFAULT false,   -- user confirmed coupon is clipped
  is_purchased         boolean DEFAULT false,   -- post-trip mark
  is_bogo              boolean DEFAULT false,
  qty                  int NOT NULL DEFAULT 1,
  scan_order           int,                     -- register scan order (1=store coupon, 2=mfr, 3=digital)

  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_csi_session ON clip_session_items (clip_session_id);
CREATE INDEX IF NOT EXISTS idx_csi_user ON clip_session_items (user_id);
CREATE INDEX IF NOT EXISTS idx_csi_nk ON clip_session_items (normalized_key);

ALTER TABLE clip_session_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_clip_items" ON clip_session_items
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------
-- 6. rebate_offers
--    Ibotta / Fetch / Swagbucks rebates. Post-purchase only.
--    Never affects pay_price. Tracked in true_cost only.
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rebate_offers (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source           text NOT NULL,              -- 'ibotta'|'fetch'|'swagbucks'
  offer_id         text,                       -- platform's internal ID
  title            text NOT NULL,
  brand            text,
  normalized_key   text,
  upc              text,                       -- match by UPC if available
  rebate_value     numeric(8,2) NOT NULL,
  rebate_type      text NOT NULL DEFAULT 'fixed', -- 'fixed' | 'pct'
  min_qty          int NOT NULL DEFAULT 1,
  min_purchase     numeric(8,2),               -- minimum spend to qualify
  valid_from       date,
  valid_to         date,
  retailer_key     text,                       -- null = all retailers
  raw_json         jsonb,                      -- raw API payload
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rebate_nk ON rebate_offers (normalized_key);
CREATE INDEX IF NOT EXISTS idx_rebate_brand ON rebate_offers (brand);
CREATE INDEX IF NOT EXISTS idx_rebate_upc ON rebate_offers (upc) WHERE upc IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rebate_source ON rebate_offers (source);
CREATE INDEX IF NOT EXISTS idx_rebate_valid ON rebate_offers (valid_to) WHERE valid_to IS NOT NULL;

ALTER TABLE rebate_offers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_only_rebate_offers" ON rebate_offers
  USING (auth.role() = 'service_role');

-- Seed a few Ibotta/Fetch rebates for existing brands in DB
INSERT INTO rebate_offers
  (source, title, brand, normalized_key, rebate_value, valid_from, valid_to)
VALUES
  ('ibotta', '$1.50 cash back on any Kerrygold Butter product', 'Kerrygold', 'kerrygold-butter', 1.50, '2026-04-01', '2026-04-30'),
  ('ibotta', '$1.00 cash back on Ben & Jerry''s ice cream pint', 'Ben & Jerrys', 'ben-jerrys-ice-cream', 1.00, '2026-04-01', '2026-04-30'),
  ('fetch', '3x points on Advil products', 'Advil', 'advil', 0.50, '2026-04-01', '2026-04-30'),
  ('ibotta', '$0.50 cash back on Cheerios any variety', 'Cheerios', 'cheerios', 0.50, '2026-04-01', '2026-04-30'),
  ('ibotta', '$2.00 cash back on Tide PODS 16ct+', 'Tide', 'tide-pods', 2.00, '2026-04-01', '2026-04-30')
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------
-- 7. updated_at triggers for tables that need it
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all new tables that have updated_at
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'publix_store_coupon_kb',
    'mfr_coupon_kb',
    'clip_sessions',
    'clip_session_items',
    'rebate_offers'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_' || t || '_updated_at'
    ) THEN
      EXECUTE format(
        'CREATE TRIGGER trg_%I_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
        t, t
      );
    END IF;
  END LOOP;
END $$;
