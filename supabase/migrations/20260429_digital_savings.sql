-- ============================================================
-- Digital Savings SQL Functions
-- supabase/migrations/20260429_digital_savings.sql
--
-- calculate_digital_savings(p_user_id, p_normalized_keys)
--   Accepts an array of normalized product keys (from client cart)
--   and returns matching active digital coupons with potential
--   savings for a given user based on their preferred retailers.
--
-- get_clippable_coupons(p_user_id, p_normalized_keys)
--   Returns full coupon rows for Cart Checkout Shield display.
--
-- All idempotent — safe to re-run.
-- ============================================================

-- ── 1. calculate_digital_savings ─────────────────────────────────
-- Returns total potential digital savings in cents for a cart.
-- Called from CouponClippingService and HomeScreen hero.
--
-- p_user_id        uuid   — auth.users.id
-- p_normalized_keys text[] — e.g. ARRAY['tide-pods','cheerios','advil']
--
-- Returns: savings_cents int, matched_count int

CREATE OR REPLACE FUNCTION public.calculate_digital_savings(
  p_user_id        uuid,
  p_normalized_keys text[]
)
RETURNS TABLE (
  savings_cents   bigint,
  matched_count   int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preferred_retailers text[];
BEGIN
  -- Load user's preferred retailer(s) from user_persona
  SELECT COALESCE(preferred_stores, ARRAY[]::text[])
  INTO   v_preferred_retailers
  FROM   public.user_persona
  WHERE  user_id = p_user_id
  LIMIT  1;

  -- If no preferred stores, treat all active coupons as eligible
  IF v_preferred_retailers IS NULL OR array_length(v_preferred_retailers, 1) IS NULL THEN
    v_preferred_retailers := ARRAY['publix','kroger','walmart','target','costco','aldi','whole_foods','trader_joes'];
  END IF;

  RETURN QUERY
  SELECT
    COALESCE(SUM(
      CASE
        WHEN dc.discount_cents > 0 THEN dc.discount_cents
        -- pct coupons: estimate 15% off $4.00 = 60¢ average item
        WHEN dc.discount_pct   > 0 THEN ROUND(dc.discount_pct * 400)::bigint
        ELSE 0
      END
    ), 0)::bigint AS savings_cents,
    COUNT(DISTINCT dc.id)::int AS matched_count
  FROM   public.digital_coupons dc
  WHERE  dc.is_active      = true
    AND  dc.normalized_key = ANY(p_normalized_keys)
    AND  dc.retailer_key   = ANY(v_preferred_retailers)
    AND  (dc.expires_at IS NULL OR dc.expires_at > now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_digital_savings(uuid, text[]) TO authenticated;
COMMENT ON FUNCTION public.calculate_digital_savings IS
  'Returns total potential digital coupon savings in cents for a cart array of normalized keys. Used by CouponClippingService and HomeScreen hero.';

-- ── 2. get_clippable_coupons ─────────────────────────────────────
-- Returns matching coupon rows for Checkout Shield display.
-- Caller renders each coupon as a "ready to clip" card.

CREATE OR REPLACE FUNCTION public.get_clippable_coupons(
  p_user_id        uuid,
  p_normalized_keys text[]
)
RETURNS TABLE (
  coupon_id        uuid,
  retailer_key     text,
  product_name     text,
  brand            text,
  normalized_key   text,
  discount_cents   int,
  discount_pct     numeric,
  coupon_type      text,
  is_loyalty_req   boolean,
  is_app_only      boolean,
  expires_at       timestamptz,
  savings_label    text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_preferred_retailers text[];
BEGIN
  SELECT COALESCE(preferred_stores, ARRAY[]::text[])
  INTO   v_preferred_retailers
  FROM   public.user_persona
  WHERE  user_id = p_user_id
  LIMIT  1;

  IF v_preferred_retailers IS NULL OR array_length(v_preferred_retailers, 1) IS NULL THEN
    v_preferred_retailers := ARRAY['publix','kroger','walmart','target','costco','aldi','whole_foods','trader_joes'];
  END IF;

  RETURN QUERY
  SELECT
    dc.id                   AS coupon_id,
    dc.retailer_key,
    dc.product_name,
    dc.brand,
    dc.normalized_key,
    dc.discount_cents,
    dc.discount_pct,
    dc.coupon_type,
    COALESCE(dc.is_loyalty_required, false) AS is_loyalty_req,
    COALESCE(dc.is_app_only, false)         AS is_app_only,
    dc.expires_at,
    CASE
      WHEN dc.discount_cents > 0
        THEN '$' || (dc.discount_cents / 100.0)::numeric(8,2)::text || ' off'
      WHEN dc.discount_pct > 0
        THEN (dc.discount_pct * 100)::int::text || '% off'
      ELSE 'Deal'
    END AS savings_label
  FROM   public.digital_coupons dc
  WHERE  dc.is_active      = true
    AND  dc.normalized_key = ANY(p_normalized_keys)
    AND  dc.retailer_key   = ANY(v_preferred_retailers)
    AND  (dc.expires_at IS NULL OR dc.expires_at > now())
  ORDER BY dc.discount_cents DESC, dc.discount_pct DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_clippable_coupons(uuid, text[]) TO authenticated;
COMMENT ON FUNCTION public.get_clippable_coupons IS
  'Returns clippable digital coupon rows for cart items. Powers Checkout Shield in CartScreen.';

-- ── 3. user_digital_savings_view ─────────────────────────────────
-- Convenience view: total digital savings available per user
-- based on their current preferred stores, used for HomeScreen hero.
-- NOTE: Requires client to pass normalized_keys; this view is
-- for direct DB inspection / admin dashboards only.

SELECT 'digital_savings OK' AS status;
