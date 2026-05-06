-- ============================================================
-- Anticipatory Intelligence Layer
-- supabase/migrations/20260430_anticipatory_intelligence.sql
--
-- Supports 4 ahead-of-its-time features:
--   1. Zero-Tap Planning  — anticipatory_plans table
--   2. Geofenced Intelligence — store_locations table
--   3. Push Notifications — expo_push_token on profiles
--   4. Self-Correcting OCR — ghost_matches on receipt_items
--
-- All idempotent — safe to re-run.
-- ============================================================

-- ── 1. Push token on profiles ─────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS expo_push_token        text,
  ADD COLUMN IF NOT EXISTS push_notifications_on  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS push_token_updated_at  timestamptz;

COMMENT ON COLUMN public.profiles.expo_push_token IS
  'Expo Push Token (ExponentPushToken[...]) stored after user grants notification permission';
COMMENT ON COLUMN public.profiles.push_notifications_on IS
  'True if user has granted and we have a valid push token';

-- ── 2. anticipatory_plans ─────────────────────────────────────
-- One per user per week. Stores the AI-generated savings plan
-- that is sent Monday morning as a push notification.

CREATE TABLE IF NOT EXISTS public.anticipatory_plans (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  week_of             date NOT NULL,                         -- Monday of the plan week
  plan_items          jsonb NOT NULL DEFAULT '[]',           -- [{item_name, retailer_key, deal_type, savings_cents, normalized_key}]
  total_savings_cents int  NOT NULL DEFAULT 0,              -- sum of all deal savings
  item_count          int  NOT NULL DEFAULT 0,
  essentials_matched  int  NOT NULL DEFAULT 0,              -- household essentials that have a deal this week
  status              text NOT NULL DEFAULT 'ready'
                         CHECK (status IN ('ready','viewed','clipped_all','dismissed')),
  push_sent_at        timestamptz,                          -- when push notification was fired
  push_token          text,                                  -- token used for this push
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_of)                                 -- one plan per user per week
);

CREATE INDEX IF NOT EXISTS idx_anticipatory_user_week
  ON public.anticipatory_plans (user_id, week_of DESC);
CREATE INDEX IF NOT EXISTS idx_anticipatory_status
  ON public.anticipatory_plans (status) WHERE status = 'ready';

ALTER TABLE public.anticipatory_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_own_anticipatory_plans" ON public.anticipatory_plans
  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "service_role_anticipatory_plans" ON public.anticipatory_plans
  FOR ALL USING (auth.role() = 'service_role');

-- ── 3. store_locations ───────────────────────────────────────
-- Real-world store coordinates for geofencing.
-- Seeded with major chain approximate coordinates (FL demo market).

CREATE TABLE IF NOT EXISTS public.store_locations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key   text NOT NULL,
  store_name     text NOT NULL,
  address        text,
  city           text,
  state          char(2),
  zip_code       text,
  latitude       numeric(10,7) NOT NULL,
  longitude      numeric(10,7) NOT NULL,
  radius_meters  int  NOT NULL DEFAULT 150,    -- geofence radius
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_loc_retailer
  ON public.store_locations (retailer_key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_store_loc_state
  ON public.store_locations (state) WHERE is_active = true;

ALTER TABLE public.store_locations ENABLE ROW LEVEL SECURITY;
-- Store locations are public read — no user data
CREATE POLICY "store_locations_public_read" ON public.store_locations
  FOR SELECT USING (true);
CREATE POLICY "store_locations_service_write" ON public.store_locations
  FOR ALL USING (auth.role() = 'service_role');

-- Seed: Tampa Bay / Orlando demo market stores
INSERT INTO public.store_locations
  (retailer_key, store_name, address, city, state, zip_code, latitude, longitude, radius_meters)
VALUES
  ('publix',     'Publix Carrollwood',        '3451 W Bearss Ave',     'Tampa',       'FL', '33618', 28.0867100, -82.5092300, 150),
  ('publix',     'Publix South Tampa',        '3801 W Morrison Ave',   'Tampa',       'FL', '33629', 27.9218700, -82.5174800, 150),
  ('publix',     'Publix Lake Nona',          '10810 Narcoossee Rd',   'Orlando',     'FL', '32832', 28.3698100, -81.2441700, 150),
  ('target',     'Target Tampa Westshore',    '2505 N Rocky Point Dr', 'Tampa',       'FL', '33607', 27.9706300, -82.5510000, 200),
  ('target',     'Target Orlando South',      '4795 S Orange Ave',     'Orlando',     'FL', '32806', 28.4791200, -81.3689400, 200),
  ('walmart',    'Walmart Tampa',             '8320 Gunn Hwy',         'Tampa',       'FL', '33626', 28.0584800, -82.6117800, 200),
  ('aldi',       'Aldi Tampa',                '14925 N Dale Mabry Hwy','Tampa',       'FL', '33618', 28.0717800, -82.5086400, 120),
  ('whole_foods','Whole Foods Hyde Park',     '3802 Northdale Blvd',   'Tampa',       'FL', '33618', 27.9341200, -82.4808600, 150),
  ('costco',     'Costco Tampa',              '7302 Gall Blvd',        'Tampa',       'FL', '33637', 28.0671700, -82.4176900, 250),
  ('kroger',     'Kroger Orlando',            '5296 US-192',           'Kissimmee',   'FL', '34746', 28.3147900, -81.4797300, 150)
ON CONFLICT DO NOTHING;

-- ── 4. ghost_matches on receipt_items ────────────────────────
-- When OCR is uncertain, the self-correcting agent suggests a match.
-- User can confirm or correct it.

ALTER TABLE public.receipt_items
  ADD COLUMN IF NOT EXISTS ocr_confidence       numeric(4,3) DEFAULT 1.0,   -- 0.0–1.0
  ADD COLUMN IF NOT EXISTS is_ghost_match       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ghost_source         text,                        -- 'household_cart' | 'weekly_plan' | 'trip_history'
  ADD COLUMN IF NOT EXISTS ghost_match_key      text,                        -- normalized_key of the matched item
  ADD COLUMN IF NOT EXISTS user_confirmed       boolean,                     -- null = pending, true = confirmed, false = corrected
  ADD COLUMN IF NOT EXISTS user_corrected_name  text;                        -- if user corrects, what they said it was

COMMENT ON COLUMN public.receipt_items.is_ghost_match IS
  'True when OCR was low-confidence and the app suggested the item from household_cart_items or trip history';
COMMENT ON COLUMN public.receipt_items.ocr_confidence IS
  'Gemini confidence 0.0–1.0. Below 0.6 triggers ghost match logic.';

-- ── 5. get_this_week_anticipatory_plan() ─────────────────────
-- Returns the current week plan for a user, or NULL if none.

CREATE OR REPLACE FUNCTION public.get_this_week_anticipatory_plan(p_user_id uuid)
RETURNS TABLE (
  plan_id             uuid,
  total_savings_cents int,
  item_count          int,
  essentials_matched  int,
  status              text,
  plan_items          jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ap.id,
    ap.total_savings_cents,
    ap.item_count,
    ap.essentials_matched,
    ap.status,
    ap.plan_items
  FROM   public.anticipatory_plans ap
  WHERE  ap.user_id = p_user_id
    AND  ap.week_of = date_trunc('week', now() AT TIME ZONE 'UTC')::date
    AND  ap.status  = 'ready'
  LIMIT  1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_this_week_anticipatory_plan(uuid) TO authenticated;

-- ── 6. mark_plan_viewed(plan_id) ──────────────────────────────

CREATE OR REPLACE FUNCTION public.mark_plan_viewed(p_plan_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.anticipatory_plans
  SET    status     = 'viewed',
         updated_at = now()
  WHERE  id      = p_plan_id
    AND  user_id = p_user_id
    AND  status  = 'ready';
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_plan_viewed(uuid, uuid) TO authenticated;

SELECT 'anticipatory_intelligence OK' AS status;
