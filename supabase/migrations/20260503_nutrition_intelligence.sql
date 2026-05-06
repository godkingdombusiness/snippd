-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260503_nutrition_intelligence
-- Adds: nutrition_cache, product_nutrition_map, user_variation_state,
--       and get_scored_deals() SQL function.
--
-- SAFE: Does NOT modify any existing table.
-- Apply in Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. nutrition_cache ────────────────────────────────────────────────────────
-- Stores USDA FoodData Central nutrition data keyed by FDC food ID.
-- Populated by the usda-search-food Edge Function.
-- No RLS — server-side only.

CREATE TABLE IF NOT EXISTS nutrition_cache (
  usda_food_id    INTEGER     PRIMARY KEY,
  description     TEXT        NOT NULL,
  calories        NUMERIC,                  -- kcal per 100g
  protein         NUMERIC,                  -- g per 100g
  carbs           NUMERIC,                  -- g per 100g
  fat             NUMERIC,                  -- g per 100g
  fiber           NUMERIC,                  -- g per 100g
  sugar           NUMERIC,                  -- g per 100g
  sodium          NUMERIC,                  -- mg per 100g
  serving_size    NUMERIC,                  -- grams per serving (if available)
  serving_unit    TEXT,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nutrition_cache_updated
  ON nutrition_cache (last_updated DESC);

-- ── 2. product_nutrition_map ──────────────────────────────────────────────────
-- Maps product names (from normalized_offers / app_home_feed) to USDA food IDs.
-- usda_food_id is nullable — a mapping can exist before nutrition is cached.

CREATE TABLE IF NOT EXISTS product_nutrition_map (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_name     TEXT        NOT NULL,
  retailer         TEXT,                    -- NULL = any retailer
  usda_food_id     INTEGER     REFERENCES nutrition_cache (usda_food_id) ON DELETE SET NULL,
  confidence_score NUMERIC     NOT NULL DEFAULT 0.5 CHECK (confidence_score BETWEEN 0 AND 1),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_nutrition_map_name
  ON product_nutrition_map (product_name);

CREATE INDEX IF NOT EXISTS idx_product_nutrition_map_usda
  ON product_nutrition_map (usda_food_id);

-- Unique: one mapping per (product_name, retailer) pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_product_nutrition_map
  ON product_nutrition_map (product_name, COALESCE(retailer, ''));

-- ── 3. user_variation_state ───────────────────────────────────────────────────
-- Tracks recently seen deals/meals per user to drive the rotation engine.
-- RLS: user reads/writes only their own row.

CREATE TABLE IF NOT EXISTS user_variation_state (
  user_id          UUID        PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  last_seen_deals  TEXT[]      NOT NULL DEFAULT '{}',  -- normalized_offer IDs (last 20)
  last_seen_meals  TEXT[]      NOT NULL DEFAULT '{}',  -- bundle IDs (last 10)
  rotation_seed    INTEGER     NOT NULL DEFAULT 0,     -- increments each rotation cycle
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_variation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uvs_own_row" ON user_variation_state
  USING      (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ── 4. get_scored_deals() ─────────────────────────────────────────────────────
-- Returns normalized_offers joined with nutrition data in a single round-trip.
-- Called by the score-deals Edge Function.
-- SECURITY DEFINER so it can read all tables regardless of caller RLS.

CREATE OR REPLACE FUNCTION get_scored_deals(
  p_stores  TEXT[]  DEFAULT NULL,
  p_limit   INTEGER DEFAULT 60
)
RETURNS TABLE (
  id                     UUID,
  product_name           TEXT,
  retailer               TEXT,
  price_cents            INTEGER,
  final_unit_price_cents INTEGER,
  regular_price_cents    INTEGER,
  savings_cents          INTEGER,
  deal_type              TEXT,
  category               TEXT,
  confidence_score       NUMERIC,
  calories               NUMERIC,
  protein                NUMERIC,
  carbs                  NUMERIC,
  fat                    NUMERIC,
  fiber                  NUMERIC,
  sugar                  NUMERIC,
  sodium                 NUMERIC,
  usda_food_id           INTEGER,
  nutrition_confidence   NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    o.id,
    o.product_name,
    o.retailer,
    o.price_cents,
    o.final_unit_price_cents,
    o.regular_price_cents,
    o.savings_cents,
    o.deal_type,
    o.category,
    o.confidence_score,
    nc.calories,
    nc.protein,
    nc.carbs,
    nc.fat,
    nc.fiber,
    nc.sugar,
    nc.sodium,
    pnm.usda_food_id,
    pnm.confidence_score AS nutrition_confidence
  FROM normalized_offers o
  LEFT JOIN LATERAL (
    SELECT pnm2.usda_food_id, pnm2.confidence_score
    FROM   product_nutrition_map pnm2
    WHERE  pnm2.product_name = o.product_name
       OR  pnm2.product_name ILIKE '%' || split_part(o.product_name, ' ', 1) || '%'
    ORDER BY pnm2.confidence_score DESC
    LIMIT 1
  ) pnm ON TRUE
  LEFT JOIN nutrition_cache nc ON nc.usda_food_id = pnm.usda_food_id
  WHERE o.confidence_score >= 0.5
    AND o.price_cents IS NOT NULL
    AND (
      p_stores IS NULL
      OR array_length(p_stores, 1) = 0
      OR o.retailer = ANY(p_stores)
    )
  ORDER BY o.savings_cents DESC NULLS LAST
  LIMIT p_limit;
END;
$$;

-- ── Verify ────────────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM nutrition_cache)        AS nutrition_cache_rows,
  (SELECT COUNT(*) FROM product_nutrition_map)  AS product_map_rows,
  (SELECT COUNT(*) FROM user_variation_state)   AS variation_state_rows;
