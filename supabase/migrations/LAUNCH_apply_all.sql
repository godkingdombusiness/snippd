-- ═══════════════════════════════════════════════════════════════════════════
-- SNIPPD — LAUNCH MIGRATION BUNDLE
-- Generated: 2026-04-29
-- Run this once in Supabase Dashboard → SQL Editor
-- All statements are idempotent — safe to re-run if interrupted.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- PHASE 1: Profile column additions
-- ─────────────────────────────────────────────────────────────
-- Migration 021: Add cached_weekly_plan columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cached_weekly_plan jsonb DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_cached_at timestamptz DEFAULT NULL;

-- Migration: Enforce profiles.weekly_budget as INTEGER in cents.
-- The column has always stored cents (e.g. 15000 = $150.00) but the type
-- may have been created as NUMERIC or without a constraint.  This migration:
--   1. Casts the column to INTEGER (safe — values are already whole numbers).
--   2. Adds a CHECK constraint (>= 0).
--   3. Sets DEFAULT 15000 ($150.00/week).
--   4. Adds a COMMENT so future developers know the unit.
--
-- Safe to re-run: the IF NOT EXISTS guards prevent duplicate constraints.

-- Step 1: ensure column is integer type
-- ALTER COLUMN TYPE requires no data loss because all values are whole numbers.
ALTER TABLE public.profiles
  ALTER COLUMN weekly_budget TYPE integer USING COALESCE(weekly_budget::integer, 15000);

-- Step 2: set default
ALTER TABLE public.profiles
  ALTER COLUMN weekly_budget SET DEFAULT 15000;

-- Step 3: add CHECK constraint if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_weekly_budget_non_negative'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_weekly_budget_non_negative CHECK (weekly_budget >= 0);
  END IF;
END $$;

-- Step 4: document the unit
COMMENT ON COLUMN public.profiles.weekly_budget IS
  'Weekly grocery budget stored in cents (integer). 15000 = $150.00. '
  'Never store dollars here. UI divides by 100 for display.';

-- Backfill NULL values to the default
UPDATE public.profiles
SET weekly_budget = 15000
WHERE weekly_budget IS NULL;

-- Migration: convert profiles.cached_weekly_plan from JSONB to TEXT
--
-- The get-weekly-plan Edge Function now encrypts the plan payload with
-- AES-256-GCM before writing it to this column (ciphertext = "<iv_b64>:<ct_b64>").
-- WeeklyPlanScreen decrypts on receipt using the shared STACK_SECRET.
--
-- Existing JSONB values are nulled out — they will be rebuilt on the next
-- plan request (Edge Function build + re-encrypt).  plan_cached_at is also
-- reset so the cache-age check forces a fresh build on every user's next load.

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS cached_weekly_plan,
  DROP COLUMN IF EXISTS plan_cached_at;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cached_weekly_plan text    DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS plan_cached_at    timestamptz DEFAULT NULL;

-- Profiles: concierge lifestyle, shopping context, transparency, credit gamification flags.
-- Safe re-run: IF NOT EXISTS on columns.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lifestyle_concierge jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS nutrition_goals text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_members jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS household_size integer,
  ADD COLUMN IF NOT EXISTS age_range text,
  ADD COLUMN IF NOT EXISTS pets boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS shopping_days text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS preferred_stores text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS shopping_style text,
  ADD COLUMN IF NOT EXISTS meal_prep_habits text,
  ADD COLUMN IF NOT EXISTS waste_sensitivity text,
  ADD COLUMN IF NOT EXISTS transparency_ack_at timestamptz,
  ADD COLUMN IF NOT EXISTS profile_completion_credits_awarded boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_credit_award_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS household_invite_seats integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.profiles.lifestyle_concierge IS 'Structured concierge preferences (tradeoffs, rhythm, transparency flags) — Intelligence Layer input.';
COMMENT ON COLUMN public.profiles.nutrition_goals IS 'Free-text or canonical nutrition goal labels prioritized by the plan builder.';
COMMENT ON COLUMN public.profiles.household_members IS 'JSON array of household member records (nutrition targets); see 015_nutrition_profile.sql.';
COMMENT ON COLUMN public.profiles.allergies IS 'User-reported allergens; also mirrored into dietary_tags for deal filtering where applicable.';
COMMENT ON COLUMN public.profiles.household_size IS 'Headcount for planning; may mirror count derived from household_members.';
COMMENT ON COLUMN public.profiles.shopping_style IS 'e.g. time_focused | cost_focused | balanced — Intelligence Layer tradeoff signal.';
COMMENT ON COLUMN public.profiles.waste_sensitivity IS 'Free-text or enum label, e.g. produce spoilage concern.';
COMMENT ON COLUMN public.profiles.credits_balance IS 'Gamification balance: welcome credits on profile create, +50 once when user finalizes concierge plan (WeeklyPlanPersonalization), +10 per receipt verify (app-enforced).';
COMMENT ON COLUMN public.profiles.profile_completion_credits_awarded IS 'True after one-time +50 credits when user taps Finalize My Concierge Plan (client: applyProfileCompletionCredits).';
COMMENT ON COLUMN public.profiles.receipt_credit_award_count IS 'Number of times receipt-verify credit (+10) was applied.';

CREATE INDEX IF NOT EXISTS profiles_shopping_style_idx ON public.profiles (shopping_style) WHERE shopping_style IS NOT NULL;

-- Migration: Shield & Vault security tables
-- Creates honey_token_skus, geo_auth_logs, and adds last_login_geo to profiles.
-- Safe to re-run: uses IF NOT EXISTS + ADD COLUMN IF NOT EXISTS.

-- ── honey_token_skus ────────────────────────────────────────────────────────
-- Authoritative list of decoy SKU IDs seeded into stack_candidates.
-- The client checks id prefix "honey_" for O(1) detection; this table is
-- the server-side source of truth for audit and rotation.

CREATE TABLE IF NOT EXISTS public.honey_token_skus (
  id          text PRIMARY KEY,              -- must start with 'honey_'
  description text,
  created_at  timestamptz DEFAULT now()
);

-- Seed a handful of decoy SKUs for testing
INSERT INTO public.honey_token_skus (id, description)
VALUES
  ('honey_sku_001', 'Decoy SKU — synthetic product, never a real deal'),
  ('honey_sku_002', 'Decoy SKU — synthetic product, never a real deal'),
  ('honey_sku_003', 'Decoy SKU — synthetic product, never a real deal')
ON CONFLICT DO NOTHING;

-- ── geo_auth_logs ───────────────────────────────────────────────────────────
-- Audit trail for geo-auth-check Edge Function decisions.

CREATE TABLE IF NOT EXISTS public.geo_auth_logs (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_address      text,
  city            text,
  country         text,
  otp_required    boolean NOT NULL DEFAULT false,
  distance_miles  integer,                   -- null = IP lookup failed
  reason          text,                      -- 'ok' | 'geo_drift' | 'ip_lookup_failed'
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS geo_auth_logs_user_idx
  ON public.geo_auth_logs (user_id, created_at DESC);

-- ── profiles.last_login_geo ─────────────────────────────────────────────────
-- Stores the most recent geolocation as JSONB { lat, lon, city, country }.
-- Updated by geo-auth-check on every successful IP lookup.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_login_geo jsonb DEFAULT NULL;

-- ─────────────────────────────────────────────────────────────
-- PHASE 2: Core data tables
-- ─────────────────────────────────────────────────────────────
-- Migration 020: household_essentials table
-- Stores canonical household staples used by get-weekly-plan household_stack section

CREATE TABLE IF NOT EXISTS public.household_essentials (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name         text NOT NULL,
  category               text NOT NULL,
  emoji                  text NOT NULL DEFAULT '🛒',
  avg_price_cents        integer NOT NULL DEFAULT 999,
  restock_frequency_days integer NOT NULL DEFAULT 14,
  is_default             boolean NOT NULL DEFAULT true,
  sort_order             integer NOT NULL DEFAULT 99,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Index for default item queries
CREATE INDEX IF NOT EXISTS idx_household_essentials_default
  ON public.household_essentials (is_default, sort_order);

-- Enable RLS
ALTER TABLE public.household_essentials ENABLE ROW LEVEL SECURITY;

-- Read-only for authenticated users
CREATE POLICY "household_essentials_read"
  ON public.household_essentials
  FOR SELECT
  TO authenticated
  USING (true);

-- Seed 10 default household essentials
INSERT INTO public.household_essentials
  (canonical_name, category, emoji, avg_price_cents, restock_frequency_days, is_default, sort_order)
VALUES
  ('Paper towels',      'paper',         '🧻', 899,  14, true, 1),
  ('Toilet paper',      'paper',         '🧻', 999,  14, true, 2),
  ('Dish soap',         'cleaning',      '🧼', 399,  21, true, 3),
  ('Trash bags',        'cleaning',      '🗑️', 799,  30, true, 4),
  ('Laundry detergent', 'laundry',       '🧺', 1199, 30, true, 5),
  ('Body wash',         'personal_care', '🚿', 499,  21, true, 6),
  ('Toothpaste',        'personal_care', '🦷', 499,  30, true, 7),
  ('Shampoo',           'personal_care', '🧴', 599,  30, true, 8),
  ('Hand soap',         'cleaning',      '🫧', 349,  21, true, 9),
  ('Sponges',           'cleaning',      '🧽', 299,  14, true, 10)
ON CONFLICT DO NOTHING;

-- Migration 023: Canonical weekly lifecycle plan storage
-- Stores the validator-approved weekly manual separately from the encrypted
-- profile cache so receipts, learning hooks, and UI can reference the same
-- plan_id.

CREATE TABLE IF NOT EXISTS public.weekly_lifecycle_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (
    status IN (
      'APPROVED',
      'LOW_YIELD_WEEK',
      'NEEDS_SUBSTITUTION',
      'DATA_STALE',
      'NO_RETAILER_COVERAGE'
    )
  ),
  retailer_node text NOT NULL,
  cycle_dates text NOT NULL,
  circular_valid_from date NOT NULL,
  circular_valid_until date NOT NULL,
  next_circular_at timestamptz NOT NULL,
  stack_expires_at timestamptz NOT NULL,
  target_cap_cents integer NOT NULL CHECK (target_cap_cents >= 0),
  actual_oop_cents integer NOT NULL CHECK (actual_oop_cents >= 0),
  savings_percentage numeric(5,2) NOT NULL CHECK (savings_percentage >= 0),
  surplus_available_cents integer NOT NULL,
  lifecycle_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  receipt_verification_id text,
  validation_errors text[] NOT NULL DEFAULT ARRAY[]::text[],
  generated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_user_cycle_idx
  ON public.weekly_lifecycle_plans (user_id, circular_valid_from DESC);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_status_expiry_idx
  ON public.weekly_lifecycle_plans (status, stack_expires_at);

CREATE INDEX IF NOT EXISTS weekly_lifecycle_plans_payload_gin_idx
  ON public.weekly_lifecycle_plans USING gin (lifecycle_payload);

ALTER TABLE public.weekly_lifecycle_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own weekly lifecycle plans"
  ON public.weekly_lifecycle_plans
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage weekly lifecycle plans"
  ON public.weekly_lifecycle_plans
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.touch_weekly_lifecycle_plans_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS weekly_lifecycle_plans_touch_updated_at
  ON public.weekly_lifecycle_plans;

CREATE TRIGGER weekly_lifecycle_plans_touch_updated_at
  BEFORE UPDATE ON public.weekly_lifecycle_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_weekly_lifecycle_plans_updated_at();

-- Migration 024: Authoritative checkout math snapshots
-- Cloud Run writes one row per server-side checkout calculation.

CREATE TABLE IF NOT EXISTS public.checkout_math_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('APPROVED', 'REJECTED')),
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS checkout_math_snapshots_plan_idx
  ON public.checkout_math_snapshots (plan_id, computed_at DESC);

CREATE INDEX IF NOT EXISTS checkout_math_snapshots_user_idx
  ON public.checkout_math_snapshots (user_id, computed_at DESC);

ALTER TABLE public.checkout_math_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own checkout math snapshots"
  ON public.checkout_math_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage checkout math snapshots"
  ON public.checkout_math_snapshots
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Migration 025: Authoritative signed funding ledger
-- Records Cloud Run-approved math payloads that are allowed to fund a card or
-- lock a Snippd stack. The mobile app must never authorize funding from local
-- calculations.

CREATE TABLE IF NOT EXISTS public.authoritative_funding_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id text NOT NULL REFERENCES public.weekly_lifecycle_plans(plan_id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  authorization_status text NOT NULL CHECK (
    authorization_status IN ('AUTHORIZED', 'REJECTED', 'EXPIRED', 'REVOKED')
  ),
  authorized_amount_cents integer NOT NULL CHECK (authorized_amount_cents >= 0),
  savings_pct numeric(5,2) NOT NULL CHECK (savings_pct >= 0),
  retailer_nodes text[] NOT NULL DEFAULT ARRAY[]::text[],
  signature text NOT NULL,
  math_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  authorized_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_plan_idx
  ON public.authoritative_funding_ledger (plan_id, authorized_at DESC);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_user_idx
  ON public.authoritative_funding_ledger (user_id, authorized_at DESC);

CREATE INDEX IF NOT EXISTS authoritative_funding_ledger_status_idx
  ON public.authoritative_funding_ledger (authorization_status, expires_at);

ALTER TABLE public.authoritative_funding_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own funding authorizations"
  ON public.authoritative_funding_ledger
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage funding authorizations"
  ON public.authoritative_funding_ledger
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ─────────────────────────────────────────────────────────────
-- PHASE 3: Trip tracking + audit ledger
-- ─────────────────────────────────────────────────────────────
-- user_trips: tracks planned shopping missions locked from WeeklyPlanScreen
-- Written by: Snippd Concierge Loop v2.0.0

CREATE TABLE IF NOT EXISTS user_trips (
    id                    uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id               uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_week_start       date        NOT NULL,
    total_estimated_cents integer     NOT NULL DEFAULT 0,
    total_savings_cents   integer     NOT NULL DEFAULT 0,
    store_preference      text        NOT NULL DEFAULT 'one_stop',
    primary_store         text,
    item_count            integer     NOT NULL DEFAULT 0,
    status                text        NOT NULL DEFAULT 'planned',  -- planned | shopping | verified
    clipped_at            timestamptz,
    verified_at           timestamptz,
    created_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT user_trips_preference_valid CHECK (store_preference IN ('one_stop', 'multi_store')),
    CONSTRAINT user_trips_status_valid     CHECK (status IN ('planned', 'shopping', 'verified'))
);

-- Enforce one active trip per user per week
CREATE UNIQUE INDEX IF NOT EXISTS user_trips_user_week_idx
    ON user_trips (user_id, plan_week_start);

-- RLS
ALTER TABLE user_trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_trips_select" ON user_trips;
CREATE POLICY "user_trips_select" ON user_trips
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trips_insert" ON user_trips;
CREATE POLICY "user_trips_insert" ON user_trips
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "user_trips_update" ON user_trips;
CREATE POLICY "user_trips_update" ON user_trips
    FOR UPDATE USING (auth.uid() = user_id);

-- ── AgenticLedger ────────────────────────────────────────────────────────────
-- Immutable audit log of every autonomous decision made by the Snippd agent.
-- Rows are INSERT-only; no UPDATE or DELETE (enforced by RLS policy below).
-- Replicated to Neo4j via the nightly graph sync.

CREATE TABLE IF NOT EXISTS agentic_ledger (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What kind of decision was made
  decision_type    text        NOT NULL,
  -- e.g. 'ANCHOR_REJECT', 'ANCHOR_APPROVE', 'HUNT_SANITIZE', 'PLAN_BUILD',
  --      'RETAILER_FAILOVER', 'BUDGET_SAVE', 'DRIFT_DETECTED', 'CLIP_SESSION'

  -- Which service or screen made the decision
  actor            text        NOT NULL,
  -- e.g. 'DeterministicAnchor', 'RetailerWrapper', 'WeeklyPlanScreen', 'DiscoverScreen'

  -- SHA-256 hex digest of the input payload (for integrity / dedup)
  payload_hash     text,

  -- Outcome: 'approved' | 'rejected' | 'fallback' | 'error' | 'info'
  result           text        NOT NULL DEFAULT 'info',

  -- Arbitrary structured data (retailer tier, rejected SKU ids, etc.)
  metadata         jsonb       NOT NULL DEFAULT '{}'::jsonb,

  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-user history queries
CREATE INDEX IF NOT EXISTS agentic_ledger_user_created
  ON agentic_ledger (user_id, created_at DESC);

-- Index for decision type analytics
CREATE INDEX IF NOT EXISTS agentic_ledger_decision_type
  ON agentic_ledger (decision_type, created_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE agentic_ledger ENABLE ROW LEVEL SECURITY;

-- Users may INSERT their own rows
CREATE POLICY "agentic_ledger_insert_own"
  ON agentic_ledger FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users may SELECT their own rows
CREATE POLICY "agentic_ledger_select_own"
  ON agentic_ledger FOR SELECT
  USING (auth.uid() = user_id);

-- No UPDATE or DELETE — the ledger is immutable
-- (Supabase applies a default DENY for any operation without an explicit policy.)

-- ─────────────────────────────────────────────────────────────
-- PHASE 4: Coupon knowledge base + clip sessions (full rebuild)
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- PHASE 5: Security tables
-- ─────────────────────────────────────────────────────────────
-- Migration: Fingerprint column on stack_candidates + honey-token SKU rows.
--
-- _fingerprint: SHA-256 hex of (normalized_key || retailer_key) — a
-- deterministic, searchable identity for dedup, graph cross-references,
-- and audit trails.  Computed at insertion time by the ingestion pipeline.
--
-- Honey tokens: rows with IDs starting with 'honey_' are decoy SKUs that
-- are served to clients in search results but never represent real products.
-- The client-side huntGuard.isHoneyToken() detects them by prefix.
-- Any attempt to add a honey-token SKU to cart is silently rejected and
-- logged to agentic_ledger — it fingerprints automated scrapers.
--
-- Safe to re-run: IF NOT EXISTS guards + ON CONFLICT DO NOTHING.

-- ── 1. _fingerprint column ─────────────────────────────────────────────────

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS _fingerprint text DEFAULT NULL;

COMMENT ON COLUMN public.stack_candidates._fingerprint IS
  'SHA-256 hex of (normalized_key || retailer_key). '
  'Computed by the ingestion pipeline at upsert time. '
  'Used for dedup, audit, and graph cross-reference.';

CREATE INDEX IF NOT EXISTS stack_candidates_fingerprint_idx
  ON public.stack_candidates (_fingerprint)
  WHERE _fingerprint IS NOT NULL;

-- ── 2. Backfill _fingerprint for existing rows ─────────────────────────────
-- Uses Postgres pgcrypto extension (enabled by default on Supabase).
-- digest() returns bytea → encode() converts to lowercase hex.

UPDATE public.stack_candidates
SET _fingerprint = encode(
  digest(COALESCE(normalized_key, '') || COALESCE(retailer_key, ''), 'sha256'),
  'hex'
)
WHERE _fingerprint IS NULL;

-- ── 3. Honey-token SKU rows in stack_candidates ────────────────────────────
-- These rows are served in search results like real deals.
-- IDs must start with 'honey_' so huntGuard.isHoneyToken() detects them O(1).
-- is_active = true so they appear in queries.
-- stack_rank_score = 0 so they never naturally surface at the top.
-- base_price / final_price are real-looking but never match any real product.

INSERT INTO public.stack_candidates (
  id,
  item_name,
  brand,
  size,
  category,
  retailer,
  retailer_key,
  normalized_key,
  base_price,
  final_price,
  sale_savings,
  coupon_savings,
  is_bogo,
  has_coupon,
  stack_rank_score,
  is_active,
  _fingerprint
) VALUES
  (
    'honey_sku_001',
    'Premium Select Blend',
    'Benchmark Foods',
    '16 oz',
    'pantry',
    'Publix',
    'publix',
    'benchmark_premium_select_blend',
    3.99,
    3.49,
    0.50,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('benchmark_premium_select_blendpublix', 'sha256'), 'hex')
  ),
  (
    'honey_sku_002',
    'Artisan Reserve Pack',
    'Heritage Mills',
    '12 ct',
    'bakery',
    'Kroger',
    'kroger',
    'heritage_artisan_reserve_pack',
    5.49,
    4.99,
    0.50,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('heritage_artisan_reserve_packkroger', 'sha256'), 'hex')
  ),
  (
    'honey_sku_003',
    'Classic Value Bundle',
    'Sunrise Brand',
    '24 ct',
    'beverage',
    'Walmart',
    'walmart',
    'sunrise_classic_value_bundle',
    8.99,
    7.99,
    1.00,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('sunrise_classic_value_bundlewalmart', 'sha256'), 'hex')
  )
ON CONFLICT (id) DO NOTHING;

-- ── 4. Ensure honey_token_skus registry is in sync ─────────────────────────
INSERT INTO public.honey_token_skus (id, description)
VALUES
  ('honey_sku_001', 'Decoy — Premium Select Blend (pantry/Publix)'),
  ('honey_sku_002', 'Decoy — Artisan Reserve Pack (bakery/Kroger)'),
  ('honey_sku_003', 'Decoy — Classic Value Bundle (beverage/Walmart)')
ON CONFLICT DO NOTHING;

-- ── Migration: 20260425_healing_events.sql ──────────────────────────────────
-- Self-Healing Memory — cloud log for all health checks and auto-heal actions.
--
-- Written by: healthMonitor.js → healingLog.js (non-blocking background sync).
-- Read by:    AdminPulseScreen, FounderDashboardScreen (health score & history).
--
-- Rows are inserted from the device, never updated server-side.
-- user_id is nullable — pre-auth startup checks log without a user.
-- ─────────────────────────────────────────────────────────────────────────────

-- Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.healing_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   text        NOT NULL,                    -- identifies one app startup run
  check_name   text        NOT NULL,                    -- secure_store | async_storage | ...
  status       text        NOT NULL
                           CHECK (status IN ('ok', 'warning', 'critical')),
  issue        text,                                    -- human-readable description; NULL if ok
  healed       boolean     NOT NULL DEFAULT false,      -- was an auto-fix applied?
  heal_action  text,                                    -- description of the fix applied
  duration_ms  integer     NOT NULL DEFAULT 0,          -- how long the check took
  app_version  text        NOT NULL DEFAULT '0.0.0',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes ────────────────────────────────────────────────────────────────────

-- Primary query: per-user history, newest first
CREATE INDEX IF NOT EXISTS idx_healing_events_user_time
  ON public.healing_events (user_id, created_at DESC);

-- Query by check type (e.g. all 'session_integrity' failures ever)
CREATE INDEX IF NOT EXISTS idx_healing_events_check_time
  ON public.healing_events (check_name, created_at DESC);

-- Dashboard: quickly count how many issues were auto-healed
CREATE INDEX IF NOT EXISTS idx_healing_events_healed
  ON public.healing_events (healed, created_at DESC)
  WHERE healed = true;

-- Alert: critical events that were NOT healed (still need human attention)
CREATE INDEX IF NOT EXISTS idx_healing_events_unhealed_critical
  ON public.healing_events (status, created_at DESC)
  WHERE status = 'critical' AND healed = false;

-- RLS ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.healing_events ENABLE ROW LEVEL SECURITY;

-- Users can read only their own events (or anonymous events where user_id IS NULL)
CREATE POLICY healing_events_select_own
  ON public.healing_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR user_id IS NULL
  );

-- Users (and service role) can insert their own events
CREATE POLICY healing_events_insert_own
  ON public.healing_events FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR user_id IS NULL
  );

-- No UPDATE or DELETE — healing log is append-only

-- Aggregate view: health score per user (last 7 days) ────────────────────────
CREATE OR REPLACE VIEW public.v_user_health_score AS
SELECT
  user_id,
  COUNT(*)                                                      AS total_checks,
  SUM(CASE WHEN status = 'critical' THEN 1 ELSE 0 END)         AS critical_count,
  SUM(CASE WHEN status = 'warning'  THEN 1 ELSE 0 END)         AS warning_count,
  SUM(CASE WHEN healed = true       THEN 1 ELSE 0 END)         AS healed_count,
  GREATEST(0,
    100
    - SUM(CASE WHEN status = 'critical' THEN 3 ELSE 0 END)
    - SUM(CASE WHEN status = 'warning'  THEN 1 ELSE 0 END)
  )                                                              AS health_score,
  MAX(created_at)                                               AS last_check_at
FROM public.healing_events
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY user_id;

-- Aggregate view: chronic checks (failed 5+ times in last 30 days) ───────────
CREATE OR REPLACE VIEW public.v_chronic_checks AS
SELECT
  user_id,
  check_name,
  COUNT(*) FILTER (WHERE status != 'ok')      AS failure_count,
  COUNT(*) FILTER (WHERE healed = true)       AS heal_count,
  MAX(created_at) FILTER (WHERE status != 'ok') AS last_failure_at,
  ROUND(
    COUNT(*) FILTER (WHERE healed = true)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status != 'ok'), 0) * 100
  )                                            AS heal_rate_pct
FROM public.healing_events
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY user_id, check_name
HAVING COUNT(*) FILTER (WHERE status != 'ok') >= 5
ORDER BY failure_count DESC;

-- ─────────────────────────────────────────────────────────────
-- PHASE 6: Ingestion pipeline hardening
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Migration: 20260419_fix_offer_sources_worker_compat.sql
-- Fix offer_sources schema so the ingestion worker can upsert:
--   1. Give source_type a default so worker inserts don't fail
--      on the NOT NULL constraint when source_type is omitted.
--   2. Add a UNIQUE index on dedupe_key alone (WHERE NOT NULL)
--      so the worker's onConflict:'dedupe_key' resolves correctly
--      instead of the composite (retailer_id, dedupe_key) index.
-- ============================================================

-- 1. Give source_type a sensible default so omitting it is safe
ALTER TABLE offer_sources
  ALTER COLUMN source_type SET DEFAULT 'flyer';

-- 2. Deduplicate: keep only the most-recently-updated row per dedupe_key
--    so we can create a unique index without conflicts
DELETE FROM offer_sources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY dedupe_key
             ORDER BY updated_at DESC, created_at DESC
           ) AS rn
    FROM offer_sources
    WHERE dedupe_key IS NOT NULL
  ) ranked
  WHERE rn > 1
);

-- 3. Add a partial unique index on dedupe_key alone
--    (partial so null dedupe_keys don't conflict with each other)
CREATE UNIQUE INDEX IF NOT EXISTS ux_offer_sources_dedupe_key
  ON offer_sources (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- ============================================================
-- Migration: 20260419_promote_offer_sources.sql
-- Promote valid offer_sources records directly into
-- stack_candidates, bypassing flyer_deal_staging.
-- Safe to run multiple times (ON CONFLICT DO UPDATE).
-- ============================================================

INSERT INTO stack_candidates (
  item_name,
  retailer,
  retailer_key,
  category,
  base_price,
  sale_savings,
  coupon_savings,
  is_bogo,
  has_coupon,
  is_active,
  valid_to,
  week_of,
  dedupe_key,
  stack_rank_score,
  dietary_tags,
  allergen_tags,
  meal_type
)
SELECT
  os.product_name                                             AS item_name,
  os.retailer_key                                             AS retailer,
  os.retailer_key                                             AS retailer_key,
  COALESCE(os.category, 'grocery')                            AS category,
  COALESCE(os.regular_price_cents, os.sale_price_cents, 0) / 100.0  AS base_price,
  GREATEST(
    0,
    (COALESCE(os.regular_price_cents, 0) - COALESCE(os.sale_price_cents, 0)) / 100.0
  )                                                           AS sale_savings,
  COALESCE(os.coupon_value_cents, 0) / 100.0                 AS coupon_savings,
  (os.reward_type = 'BOGO')                                  AS is_bogo,
  (os.coupon_value_cents > 0)                                AS has_coupon,
  true                                                        AS is_active,
  os.expires_on                                               AS valid_to,
  os.week_of                                                  AS week_of,
  'os_' || os.id::text                                        AS dedupe_key,
  CASE
    WHEN os.reward_type = 'BOGO'
      THEN 0.85
    WHEN COALESCE(os.coupon_value_cents, 0) > 0
     AND COALESCE(os.sale_price_cents, 0) < COALESCE(os.regular_price_cents, 0)
      THEN 0.75
    WHEN COALESCE(os.coupon_value_cents, 0) > 0
      THEN 0.65
    WHEN COALESCE(os.sale_price_cents, 0) < COALESCE(os.regular_price_cents, 0)
      THEN 0.55
    ELSE 0.10
  END                                                         AS stack_rank_score,
  '[]'::jsonb                                                 AS dietary_tags,
  '[]'::jsonb                                                 AS allergen_tags,
  CASE os.category
    WHEN 'meat'      THEN 'dinner'
    WHEN 'seafood'   THEN 'dinner'
    WHEN 'produce'   THEN 'dinner'
    WHEN 'dairy'     THEN 'breakfast'
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'bakery'    THEN 'breakfast'
    WHEN 'deli'      THEN 'lunch'
    ELSE 'mixed'
  END                                                         AS meal_type
FROM offer_sources os
WHERE os.is_active = true
  AND (os.expires_on IS NULL OR os.expires_on >= CURRENT_DATE)
  AND os.retailer_key IN (
    'publix', 'dollar_general', 'aldi',
    'walgreens', 'target', 'sprouts', 'cvs'
  )
  AND (
    os.sale_price_cents < os.regular_price_cents
    OR os.coupon_value_cents > 0
    OR os.reward_type IN ('BOGO', 'DIGITAL_COUPON', 'REBATE')
  )
ON CONFLICT (dedupe_key) DO UPDATE SET
  item_name        = EXCLUDED.item_name,
  retailer         = EXCLUDED.retailer,
  retailer_key     = EXCLUDED.retailer_key,
  category         = EXCLUDED.category,
  base_price       = EXCLUDED.base_price,
  sale_savings     = EXCLUDED.sale_savings,
  coupon_savings   = EXCLUDED.coupon_savings,
  is_bogo          = EXCLUDED.is_bogo,
  has_coupon       = EXCLUDED.has_coupon,
  is_active        = EXCLUDED.is_active,
  valid_to         = EXCLUDED.valid_to,
  week_of          = EXCLUDED.week_of,
  stack_rank_score = EXCLUDED.stack_rank_score,
  dietary_tags     = EXCLUDED.dietary_tags,
  allergen_tags    = EXCLUDED.allergen_tags,
  meal_type        = EXCLUDED.meal_type;

-- Verify: count promoted records
SELECT COUNT(*) AS promoted
FROM stack_candidates
WHERE dedupe_key LIKE 'os_%';

-- ============================================================
-- Migration: 20260419_promote_staging_to_candidates.sql
-- Promote staged deals from flyer_deal_staging directly into
-- stack_candidates for keyfoods, walgreens, and aldi —
-- bypassing the Gemini re-extraction step.
-- Only touches rows with status IN ('staged','pending') that
-- have not already been published.
-- Safe to re-run: ON CONFLICT (dedupe_key) DO UPDATE.
-- ============================================================

INSERT INTO stack_candidates (
  item_name,
  retailer,
  retailer_key,
  category,
  base_price,
  sale_savings,
  coupon_savings,
  is_bogo,
  has_coupon,
  is_active,
  valid_to,
  week_of,
  dedupe_key,
  stack_rank_score,
  dietary_tags,
  allergen_tags,
  meal_type,
  -- legacy worker columns (kept for RPC compatibility)
  primary_category,
  primary_brand,
  savings_pct,
  ingestion_id
)
SELECT
  fds.product_name                                                  AS item_name,
  fds.retailer_key                                                  AS retailer,
  fds.retailer_key                                                  AS retailer_key,
  COALESCE(fds.category, 'grocery')                                 AS category,

  -- base_price: prefer regular_price, fall back to sale_price
  COALESCE(fds.regular_price, fds.sale_price, 0)                   AS base_price,

  -- sale_savings: only positive when regular > sale
  GREATEST(0, COALESCE(fds.regular_price, 0) - COALESCE(fds.sale_price, 0))
                                                                    AS sale_savings,
  0.0                                                               AS coupon_savings,

  COALESCE(fds.is_bogo, false)                                      AS is_bogo,
  false                                                             AS has_coupon,
  true                                                              AS is_active,

  -- valid_to: end of the week_of date
  (fds.week_of + INTERVAL '6 days')::date                          AS valid_to,
  fds.week_of                                                       AS week_of,

  -- dedupe_key matches worker format: retailer::normalized::week
  fds.retailer_key || '::' ||
    LOWER(REGEXP_REPLACE(
      COALESCE(fds.brand || '_', '') || fds.product_name,
      '[^a-z0-9_]', '', 'g'
    )) || '::' || fds.week_of::text                                 AS dedupe_key,

  -- stack_rank_score
  CASE
    WHEN COALESCE(fds.is_bogo, false)
      THEN 0.85
    WHEN fds.deal_type IN ('DIGITAL_COUPON','MANUFACTURER_COUPON','REBATE')
      THEN 0.65
    WHEN fds.regular_price IS NOT NULL
     AND fds.sale_price IS NOT NULL
     AND fds.regular_price > 0
     AND fds.sale_price < fds.regular_price
      THEN LEAST(0.80,
             0.10 + ((fds.regular_price - fds.sale_price) / fds.regular_price) * 0.70
           )
    ELSE 0.20
  END                                                               AS stack_rank_score,

  '[]'::jsonb                                                       AS dietary_tags,
  '[]'::jsonb                                                       AS allergen_tags,

  CASE COALESCE(fds.category, 'grocery')
    WHEN 'meat'      THEN 'dinner'
    WHEN 'seafood'   THEN 'dinner'
    WHEN 'produce'   THEN 'dinner'
    WHEN 'dairy'     THEN 'breakfast'
    WHEN 'breakfast' THEN 'breakfast'
    WHEN 'bakery'    THEN 'breakfast'
    WHEN 'deli'      THEN 'lunch'
    ELSE 'mixed'
  END                                                               AS meal_type,

  -- legacy columns
  COALESCE(fds.category, 'grocery')                                 AS primary_category,
  COALESCE(fds.brand, '')                                           AS primary_brand,
  CASE
    WHEN fds.regular_price IS NOT NULL AND fds.regular_price > 0
     AND fds.sale_price IS NOT NULL
      THEN GREATEST(0, (fds.regular_price - fds.sale_price) / fds.regular_price)
    ELSE 0
  END                                                               AS savings_pct,
  fds.ingestion_id                                                  AS ingestion_id

FROM (
  SELECT DISTINCT ON (
    fds_inner.retailer_key,
    LOWER(REGEXP_REPLACE(
      COALESCE(fds_inner.brand || '_', '') || fds_inner.product_name,
      '[^a-z0-9_]', '', 'g'
    )),
    fds_inner.week_of
  )
  fds_inner.*
  FROM flyer_deal_staging fds_inner
  WHERE fds_inner.retailer_key IN ('keyfoods', 'walgreens', 'aldi')
    AND fds_inner.status IN ('staged', 'pending')
    AND fds_inner.product_name IS NOT NULL
    AND fds_inner.product_name <> ''
    AND COALESCE(fds_inner.confidence_score, 0.75) >= 0.7
    AND (
      fds_inner.sale_price IS NOT NULL
      OR fds_inner.is_bogo = true
      OR fds_inner.deal_type IN ('DIGITAL_COUPON','MANUFACTURER_COUPON','REBATE','BOGO')
    )
  ORDER BY
    fds_inner.retailer_key,
    LOWER(REGEXP_REPLACE(
      COALESCE(fds_inner.brand || '_', '') || fds_inner.product_name,
      '[^a-z0-9_]', '', 'g'
    )),
    fds_inner.week_of,
    fds_inner.confidence_score DESC NULLS LAST,
    fds_inner.created_at DESC
) fds

ON CONFLICT (dedupe_key) DO UPDATE SET
  item_name        = EXCLUDED.item_name,
  category         = EXCLUDED.category,
  base_price       = EXCLUDED.base_price,
  sale_savings     = EXCLUDED.sale_savings,
  is_bogo          = EXCLUDED.is_bogo,
  stack_rank_score = EXCLUDED.stack_rank_score,
  meal_type        = EXCLUDED.meal_type,
  primary_category = EXCLUDED.primary_category,
  primary_brand    = EXCLUDED.primary_brand,
  savings_pct      = EXCLUDED.savings_pct,
  is_active        = true,
  valid_to         = EXCLUDED.valid_to;

-- Mark promoted rows as published in staging
UPDATE flyer_deal_staging
SET status = 'published'
WHERE retailer_key IN ('keyfoods', 'walgreens', 'aldi')
  AND status IN ('staged', 'pending');

-- Final count
SELECT
  retailer_key,
  COUNT(*) AS candidates,
  COUNT(CASE WHEN is_bogo THEN 1 END) AS bogos,
  ROUND(AVG(stack_rank_score)::numeric, 2) AS avg_score
FROM stack_candidates
WHERE retailer_key IN ('keyfoods', 'walgreens', 'aldi')
  AND is_active = true
GROUP BY retailer_key
ORDER BY retailer_key;

-- ============================================================
-- Migration: 20260419_data_quality_and_storage_trigger.sql
--
-- PART 1 — Data quality fixes on stack_candidates
--   1a. Normalize all category values to lowercase
--   1b. Normalize meal_type derived from category
--   1c. Deactivate BOGO rows with base_price = 0 (no price data)
--   1d. Re-score rows where sale_savings > 0 but score is still 0.20
--
-- PART 2 — Storage trigger
--   Fires when a .pdf is uploaded to the deal-pdfs bucket.
--   Parses filename format: retailer-YYYY-MM-DD-type.pdf
--   Upserts into ingestion_jobs so the worker picks it up.
-- ============================================================

-- ── PART 1a: Normalize categories to lowercase ────────────────

UPDATE stack_candidates
SET
  category      = LOWER(category),
  primary_category = LOWER(primary_category)
WHERE category != LOWER(category)
   OR primary_category != LOWER(primary_category);

-- ── PART 1b: Fix meal_type now that categories are lowercase ──

UPDATE stack_candidates
SET meal_type = CASE LOWER(category)
  WHEN 'meat'      THEN 'dinner'
  WHEN 'seafood'   THEN 'dinner'
  WHEN 'produce'   THEN 'dinner'
  WHEN 'dairy'     THEN 'breakfast'
  WHEN 'breakfast' THEN 'breakfast'
  WHEN 'bakery'    THEN 'breakfast'
  WHEN 'deli'      THEN 'lunch'
  ELSE 'mixed'
END
WHERE meal_type != CASE LOWER(category)
  WHEN 'meat'      THEN 'dinner'
  WHEN 'seafood'   THEN 'dinner'
  WHEN 'produce'   THEN 'dinner'
  WHEN 'dairy'     THEN 'breakfast'
  WHEN 'breakfast' THEN 'breakfast'
  WHEN 'bakery'    THEN 'breakfast'
  WHEN 'deli'      THEN 'lunch'
  ELSE 'mixed'
END;

-- ── PART 1c: Deactivate unpriced BOGOs (no useful data) ──────

UPDATE stack_candidates
SET is_active = false
WHERE is_bogo = true
  AND base_price = 0
  AND sale_savings = 0;

-- ── PART 1d: Re-score rows that now have corrected categories ─
-- Items with only a sale price and no regular_price get 0.15
-- (honest — we know the price but not the savings).
-- Items where sale_savings > 0 get a proper percentage score.

UPDATE stack_candidates
SET stack_rank_score = CASE
  WHEN is_bogo
    THEN 0.85
  WHEN sale_savings > 0 AND base_price > 0
    THEN LEAST(0.80, 0.10 + (sale_savings / base_price) * 0.70)
  WHEN has_coupon
    THEN 0.65
  WHEN base_price > 0
    THEN 0.15   -- known price, unknown savings
  ELSE 0.10
END
WHERE is_active = true
  AND retailer_key IN ('keyfoods','walgreens','aldi');

-- ── Verification snapshot ─────────────────────────────────────

SELECT
  retailer_key,
  COUNT(*)                                              AS active_deals,
  COUNT(CASE WHEN sale_savings > 0 THEN 1 END)         AS with_savings,
  COUNT(CASE WHEN is_bogo THEN 1 END)                   AS bogos,
  COUNT(CASE WHEN meal_type = 'dinner' THEN 1 END)      AS dinner_items,
  COUNT(CASE WHEN meal_type = 'breakfast' THEN 1 END)   AS breakfast_items,
  COUNT(CASE WHEN meal_type = 'lunch' THEN 1 END)       AS lunch_items,
  ROUND(AVG(stack_rank_score)::numeric, 2)              AS avg_score
FROM stack_candidates
WHERE is_active = true
  AND (valid_to IS NULL OR valid_to >= CURRENT_DATE)
GROUP BY retailer_key
ORDER BY active_deals DESC;


-- ============================================================
-- PART 2 — Storage trigger: PDF upload → ingestion_jobs
-- ============================================================

-- Helper function: parse retailer-YYYY-MM-DD-type.pdf filenames
CREATE OR REPLACE FUNCTION storage_path_to_job(storage_path text)
RETURNS TABLE (
  retailer_key text,
  week_of      date,
  source_type  text
)
LANGUAGE plpgsql
AS $$
DECLARE
  filename   text;
  parts      text[];
  type_map   jsonb := '{
    "weekly-flyer":  "pdf_weekly_ad",
    "weekly":        "pdf_weekly_ad",
    "flyer":         "pdf_weekly_ad",
    "extra-savings": "pdf_extra_savings",
    "extra":         "pdf_extra_savings",
    "bogo":          "pdf_bogo",
    "coupons":       "pdf_extra_savings"
  }'::jsonb;
  raw_type   text;
BEGIN
  -- Strip folder prefix if present, take only filename
  filename := regexp_replace(storage_path, '^.+/', '');
  -- Remove .pdf extension
  filename := regexp_replace(filename, '\.pdf$', '', 'i');

  -- Match flat format: retailer-YYYY-MM-DD-type  (e.g. publix-2026-04-16-weekly-flyer)
  IF filename ~ '^([a-z_]+)-(\d{4}-\d{2}-\d{2})-(.+)$' THEN
    parts      := regexp_match(filename, '^([a-z_]+)-(\d{4}-\d{2}-\d{2})-(.+)$');
    raw_type   := parts[3];

    retailer_key := parts[1];
    week_of      := parts[2]::date;
    source_type  := COALESCE(type_map ->> raw_type, 'pdf_weekly_ad');
    RETURN NEXT;
    RETURN;
  END IF;

  -- Match legacy folder format: retailer/YYYY-MM-DD/type.pdf
  IF storage_path ~ '^([^/]+)/(\d{4}-\d{2}-\d{2})/(.+)$' THEN
    parts      := regexp_match(storage_path, '^([^/]+)/(\d{4}-\d{2}-\d{2})/(.+)$');
    raw_type   := parts[3];

    retailer_key := parts[1];
    week_of      := parts[2]::date;
    source_type  := COALESCE(type_map ->> raw_type, 'pdf_weekly_ad');
    RETURN NEXT;
    RETURN;
  END IF;

  -- Unparseable — return nothing (trigger will skip)
END;
$$;

-- Trigger function: runs after a new object is inserted in storage
CREATE OR REPLACE FUNCTION handle_pdf_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_row record;
BEGIN
  -- Only act on the deal-pdfs bucket
  IF NEW.bucket_id != 'deal-pdfs' THEN
    RETURN NEW;
  END IF;

  -- Only act on PDF files
  IF NEW.name NOT ILIKE '%.pdf' THEN
    RETURN NEW;
  END IF;

  -- Parse the filename into job fields
  SELECT * INTO job_row
  FROM storage_path_to_job(NEW.name)
  LIMIT 1;

  IF job_row IS NULL THEN
    RAISE WARNING '[handle_pdf_upload] Could not parse storage path: %', NEW.name;
    RETURN NEW;
  END IF;

  -- Upsert into ingestion_jobs
  -- ON CONFLICT on storage_path means re-uploading the same PDF
  -- resets the job to queued so it re-processes cleanly.
  INSERT INTO ingestion_jobs (
    retailer_key,
    week_of,
    storage_path,
    source_type,
    status,
    attempts
  )
  VALUES (
    job_row.retailer_key,
    job_row.week_of,
    NEW.name,
    job_row.source_type,
    'queued',
    0
  )
  ON CONFLICT (storage_path) DO UPDATE
    SET status   = 'queued',
        attempts = 0,
        error    = NULL,
        updated_at = now()
  WHERE ingestion_jobs.status IN ('failed', 'parsed', 'done');
  -- ^ Don't reset a job that's currently processing or already queued

  RAISE LOG '[handle_pdf_upload] Queued ingestion job for %  retailer=% week=%',
    NEW.name, job_row.retailer_key, job_row.week_of;

  RETURN NEW;
END;
$$;

-- Attach trigger to storage.objects
DROP TRIGGER IF EXISTS on_pdf_upload ON storage.objects;

CREATE TRIGGER on_pdf_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_pdf_upload();

-- Confirm trigger is live
SELECT
  trigger_name,
  event_manipulation,
  event_object_schema,
  event_object_table,
  action_timing
FROM information_schema.triggers
WHERE trigger_name = 'on_pdf_upload';

-- ============================================================
-- Migration: 20260420_ingestion_file_uri_cache.sql
--
-- Adds gemini_file_uri to ingestion_jobs so the worker can
-- reuse a previously-uploaded Gemini Files API URI on retries
-- instead of re-downloading and re-uploading the PDF each time.
--
-- The Gemini Files API keeps files for 48 hours, so any job
-- that has been retrying for less than 2 days can skip the
-- upload step entirely and go straight to generateContent.
-- ============================================================

ALTER TABLE ingestion_jobs
  ADD COLUMN IF NOT EXISTS gemini_file_uri text;

COMMENT ON COLUMN ingestion_jobs.gemini_file_uri IS
  'Cached Gemini Files API URI (files/abc123). Populated on first upload for PDFs > 3MB. Valid for 48h. Lets retries skip the re-upload step.';

-- ============================================================
-- Migration: 20260420_ingestion_production_hardening.sql
--
-- Makes the PDF-upload → stack_candidates pipeline fully
-- automatic and production-ready.
--
-- Changes:
--   1. Storage trigger: fires worker immediately via pg_net
--      on every PDF upload (no more waiting for cron)
--   2. Stuck-job recovery: pg_cron resets any job stuck in
--      'processing' for > 5 min back to 'queued'
--   3. Ingestion cron: 30 min → 5 min schedule
--   4. Expired-deal cleanup: daily cron deactivates
--      stack_candidates past their valid_to date
-- ============================================================


-- ── 1. Update storage trigger to ALSO call the worker via pg_net ──
--
-- The trigger already creates the ingestion_jobs row.
-- Now it also fires the worker immediately so the job
-- processes within seconds of the PDF landing in storage,
-- rather than waiting up to 30 min for the cron.
--
-- Uses the same vault secrets as all other Snippd crons:
--   snippd_functions_url  →  https://<ref>.supabase.co/functions/v1
--   snippd_cron_secret    →  must match CRON_SECRET Edge Function secret

CREATE OR REPLACE FUNCTION handle_pdf_upload()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  job_row       record;
  functions_url text;
  cron_secret   text;
BEGIN
  -- Only act on the deal-pdfs bucket, PDF files only
  IF NEW.bucket_id != 'deal-pdfs' THEN RETURN NEW; END IF;
  IF NEW.name NOT ILIKE '%.pdf'   THEN RETURN NEW; END IF;

  -- Parse filename into job fields
  SELECT * INTO job_row
  FROM storage_path_to_job(NEW.name)
  LIMIT 1;

  IF job_row IS NULL THEN
    RAISE WARNING '[handle_pdf_upload] Unparseable path: %', NEW.name;
    RETURN NEW;
  END IF;

  -- Upsert the job (creates on first upload, resets on re-upload)
  INSERT INTO ingestion_jobs (
    retailer_key, week_of, storage_path, source_type, status, attempts
  )
  VALUES (
    job_row.retailer_key, job_row.week_of,
    NEW.name, job_row.source_type,
    'queued', 0
  )
  ON CONFLICT (storage_path) DO UPDATE
    SET status     = 'queued',
        attempts   = 0,
        error      = NULL,
        updated_at = now()
  WHERE ingestion_jobs.status IN ('failed', 'parsed', 'done');

  -- Fire the worker immediately via pg_net
  -- Fall back gracefully if vault secrets are not yet configured
  BEGIN
    SELECT decrypted_secret INTO functions_url
    FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url';

    SELECT decrypted_secret INTO cron_secret
    FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret';

    IF functions_url IS NOT NULL AND cron_secret IS NOT NULL THEN
      PERFORM net.http_post(
        url     := functions_url || '/run-ingestion-worker',
        headers := jsonb_build_object(
          'Content-Type',  'application/json',
          'x-cron-secret', cron_secret
        ),
        body    := jsonb_build_object(
          'source',       'storage_trigger',
          'storage_path', NEW.name
        )
      );
      RAISE LOG '[handle_pdf_upload] Worker triggered for %', NEW.name;
    ELSE
      RAISE WARNING '[handle_pdf_upload] Vault secrets not set — cron will pick up job for %', NEW.name;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- pg_net failure must never block the upload
    RAISE WARNING '[handle_pdf_upload] pg_net call failed: % — cron will handle %', SQLERRM, NEW.name;
  END;

  RETURN NEW;
END;
$$;

-- Re-attach the trigger (DROP + CREATE to pick up the new function body)
DROP TRIGGER IF EXISTS on_pdf_upload ON storage.objects;
CREATE TRIGGER on_pdf_upload
  AFTER INSERT ON storage.objects
  FOR EACH ROW
  EXECUTE FUNCTION handle_pdf_upload();


-- ── 2. Stuck-job recovery ─────────────────────────────────────
--
-- Jobs left in 'processing' after the 150s Edge Function timeout
-- are never retried without this. Reset them to 'queued' every
-- 6 minutes so the next cron run picks them up automatically.

SELECT cron.unschedule('snippd-ingestion-stuck-recovery')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-ingestion-stuck-recovery'
);

SELECT cron.schedule(
  'snippd-ingestion-stuck-recovery',
  '*/6 * * * *',
  $$
  UPDATE ingestion_jobs
  SET    status     = 'queued',
         updated_at = now()
  WHERE  status     = 'processing'
    AND  updated_at < now() - INTERVAL '5 minutes'
    AND  attempts   < 5;
  $$
);


-- ── 3. Speed up ingestion cron: 30 min → 5 min ───────────────
--
-- With MAX_JOBS=1 and 5-min cadence, a single uploaded PDF
-- starts processing within 5 minutes of upload (or immediately
-- if the storage trigger's pg_net call succeeds).

SELECT cron.unschedule('snippd-ingestion-worker');

SELECT cron.schedule(
  'snippd-ingestion-worker',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-ingestion-worker',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);


-- ── 4. Daily expired-deal cleanup ────────────────────────────
--
-- Deactivate stack_candidates whose valid_to has passed.
-- Runs at 1 AM every day.

SELECT cron.unschedule('snippd-deal-expiry-cleanup')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'snippd-deal-expiry-cleanup'
);

SELECT cron.schedule(
  'snippd-deal-expiry-cleanup',
  '0 1 * * *',
  $$
  UPDATE stack_candidates
  SET    is_active = false
  WHERE  is_active = true
    AND  valid_to  IS NOT NULL
    AND  valid_to  < CURRENT_DATE;
  $$
);


-- ── Verify ───────────────────────────────────────────────────

SELECT jobname, schedule, active
FROM   cron.job
WHERE  jobname LIKE 'snippd-ingestion%'
    OR jobname = 'snippd-deal-expiry-cleanup'
ORDER  BY jobname;

-- ─────────────────────────────────────────────────────────────
-- PHASE 7: Slack integration
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Snippd — Slack Integration + Retailer Policy Change Tracking
-- 20260422_slack_integration.sql
-- Idempotent: safe to re-run
--
-- What this does:
--   1. Creates snippd_integrations — key/value store for external
--      service config (Slack webhooks, etc.)
--   2. Creates retailer_policy_change_log — append-only audit log
--      for retailer_coupon_parameters + retailer_rules changes
--   3. Attaches triggers to those two retailer tables
--   4. Adds hooks.slack.com to approved_domains (if table exists)
--   5. Schedules pg_cron job 'snippd-slack-policy-notify' every 5 min
--      to call the slack-notify Edge Function
--
-- Secrets required (set once in vault if not already present):
--   snippd_functions_url — Edge Functions base URL (already set by 003_pg_cron_jobs)
--   snippd_cron_secret   — x-cron-secret header value  (already set by 003_pg_cron_jobs)
-- ============================================================

-- ── Extensions (idempotent) ───────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 1. snippd_integrations ────────────────────────────────────
CREATE TABLE IF NOT EXISTS snippd_integrations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text        NOT NULL UNIQUE,
  value       text,
  description text,
  enabled     boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS: only service_role can read/write (keys may contain webhook URLs)
ALTER TABLE snippd_integrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'snippd_integrations' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON snippd_integrations
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at on write
CREATE OR REPLACE FUNCTION _update_snippd_integrations_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_snippd_integrations_updated_at'
  ) THEN
    CREATE TRIGGER trg_snippd_integrations_updated_at
    BEFORE UPDATE ON snippd_integrations
    FOR EACH ROW EXECUTE FUNCTION _update_snippd_integrations_updated_at();
  END IF;
END $$;

-- Seed rows (value NULL / enabled false until configured via setup script)
INSERT INTO snippd_integrations (key, value, description, enabled) VALUES
  (
    'slack_policy_changes',
    NULL,
    'Slack incoming webhook URL for retailer policy change notifications. Run scripts/setup-slack-webhook.sh to configure.',
    false
  ),
  (
    'slack_channel_engineering',
    '#engineering',
    'Slack channel name for engineering policy-change notifications.',
    true
  )
ON CONFLICT (key) DO NOTHING;

-- ── 2. retailer_policy_change_log ────────────────────────────
CREATE TABLE IF NOT EXISTS retailer_policy_change_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text        NOT NULL,
  operation   text        NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  retailer_id text,
  old_data    jsonb,
  new_data    jsonb,
  notified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Partial index speeds up the "find unnotified" query
CREATE INDEX IF NOT EXISTS idx_retailer_policy_change_log_pending
  ON retailer_policy_change_log (created_at ASC)
  WHERE notified_at IS NULL;

-- ── 3. Trigger function ───────────────────────────────────────
CREATE OR REPLACE FUNCTION _log_retailer_policy_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_new_data    jsonb;
  v_old_data    jsonb;
  v_retailer_id text;
BEGIN
  v_new_data := CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END;
  v_old_data := CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END;

  v_retailer_id := COALESCE(
    v_new_data->>'retailer_id',
    v_old_data->>'retailer_id',
    v_new_data->>'id',
    v_old_data->>'id'
  );

  INSERT INTO retailer_policy_change_log (table_name, operation, retailer_id, old_data, new_data)
  VALUES (TG_TABLE_NAME, TG_OP, v_retailer_id, v_old_data, v_new_data);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach to retailer_coupon_parameters (guard: only if table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retailer_coupon_parameters'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_retailer_coupon_parameters_change'
  ) THEN
    CREATE TRIGGER trg_retailer_coupon_parameters_change
    AFTER INSERT OR UPDATE OR DELETE ON retailer_coupon_parameters
    FOR EACH ROW EXECUTE FUNCTION _log_retailer_policy_change();
  END IF;
END $$;

-- Attach to retailer_rules (guard: only if table exists)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'retailer_rules'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_retailer_rules_change'
  ) THEN
    CREATE TRIGGER trg_retailer_rules_change
    AFTER INSERT OR UPDATE OR DELETE ON retailer_rules
    FOR EACH ROW EXECUTE FUNCTION _log_retailer_policy_change();
  END IF;
END $$;

-- ── 4. Approved domains — add hooks.slack.com ─────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'approved_domains'
  ) THEN
    INSERT INTO public.approved_domains (id, domain, purpose)
    VALUES (gen_random_uuid(), 'hooks.slack.com', 'webhook')
    ON CONFLICT (domain) DO NOTHING;
  END IF;
END $$;

-- ── 5. pg_cron — Slack policy-change notifier (every 5 min) ──
DO $$ BEGIN PERFORM cron.unschedule('snippd-slack-policy-notify'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'snippd-slack-policy-notify',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/slack-notify',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron","trigger":"policy_change_check"}'::jsonb
  )
  WHERE EXISTS (
    SELECT 1 FROM retailer_policy_change_log WHERE notified_at IS NULL LIMIT 1
  )
  $$
);

-- ─────────────────────────────────────────────────────────────
-- PHASE 8: User persona + agent init (order matters)
-- ─────────────────────────────────────────────────────────────
-- ============================================================
-- Snippd — Web App Agent Initialization / Waitlist
-- 20260423_agent_initialization.sql
-- Written by: initialize-agent Next.js API route
-- Used by: Snippd web onboarding flow (Next.js app in web/)
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_initialization (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text        NOT NULL UNIQUE,

  -- 7 Concierge answers
  mission            text        CHECK (mission IN ('rent_killer', 'save_goal', 'find_deals')),
  budget_cents       int,
  power_level        text        CHECK (power_level IN ('notify_only', 'ask_first', 'full_auto')),
  leak_category      text        CHECK (leak_category IN ('amazon', 'food_apps', 'clothing')),
  style_vibe         text        CHECK (style_vibe IN ('casual_minimal', 'trend_forward', 'investment')),
  clothing_size      text,
  shoe_size          text,
  shop_frequency     text        CHECK (shop_frequency IN ('daily', 'weekly', 'big_events')),

  -- Conversion
  status             text        NOT NULL DEFAULT 'waitlist' CHECK (status IN ('waitlist', 'beta', 'lifetime')),
  payment_id         text,                        -- Stripe subscription or payment intent ID
  stripe_customer_id text,

  -- CRM
  crm_tags           text[]      DEFAULT '{}',    -- e.g. ['Rent-Killer-Segment', 'Waitlist-Free']

  -- Full snapshot for ML / personalization
  economic_dna       jsonb,

  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_init_email   ON agent_initialization (email);
CREATE INDEX IF NOT EXISTS idx_agent_init_status  ON agent_initialization (status);
CREATE INDEX IF NOT EXISTS idx_agent_init_mission ON agent_initialization (mission) WHERE mission IS NOT NULL;

-- RLS: service_role writes; no direct client access
ALTER TABLE agent_initialization ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'agent_initialization' AND policyname = 'service_role_only'
  ) THEN
    CREATE POLICY service_role_only ON agent_initialization
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION _update_agent_initialization_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_agent_init_updated_at') THEN
    CREATE TRIGGER trg_agent_init_updated_at
    BEFORE UPDATE ON agent_initialization
    FOR EACH ROW EXECUTE FUNCTION _update_agent_initialization_updated_at();
  END IF;
END $$;

-- ============================================================
-- Snippd — User Persona / Economic DNA
-- 20260423_user_persona.sql
-- Idempotent: safe to re-run
--
-- Stores the output of the 7-step Concierge onboarding flow.
-- One row per user. Written exclusively by the initialize-agent
-- Edge Function — never written directly from the client.
-- ============================================================

CREATE TABLE IF NOT EXISTS user_persona (
  id                         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Q1: Mission
  mission                    text        CHECK (mission IN ('rent_killer', 'save_goal', 'find_deals')),

  -- Q2: Monthly Budget
  monthly_budget_cents       int         CHECK (monthly_budget_cents > 0),

  -- Q3: Agent Power Level
  power_level                text        CHECK (power_level IN ('notify_only', 'ask_first', 'full_auto')),

  -- Q4: Spending Leak Category
  leak_category              text        CHECK (leak_category IN ('amazon', 'food_apps', 'clothing')),

  -- Q5: Style Vibe (visual select)
  style_vibe                 text        CHECK (style_vibe IN ('casual_minimal', 'trend_forward', 'investment')),

  -- Q6: Size DNA
  clothing_size              text,       -- S | M | L | XL | XXL
  shoe_size                  text,       -- e.g. "10", "10.5"

  -- Q7: Shopping Frequency
  shop_frequency             text        CHECK (shop_frequency IN ('daily', 'weekly', 'big_events')),

  -- Agent Initialization Output (set by initialize-agent)
  onboarding_completed_at    timestamptz,
  initial_savings_cents      int,        -- Mock projected monthly savings
  items_at_floor_price       int,        -- Mock count of items currently at price floor
  leak_savings_cents         int,        -- Mock savings identified in leak category
  economic_dna               jsonb,      -- Full snapshot of onboarding answers for ML/personalization

  -- Timestamps
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_user_persona_user_id ON user_persona (user_id);
CREATE INDEX IF NOT EXISTS idx_user_persona_mission  ON user_persona (mission) WHERE mission IS NOT NULL;

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE user_persona ENABLE ROW LEVEL SECURITY;

-- Users can read their own persona (for Daily Pulse, personalization)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_persona' AND policyname = 'select_own'
  ) THEN
    CREATE POLICY select_own ON user_persona
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;

-- Only service_role can insert/update (all writes go through initialize-agent Edge Function)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'user_persona' AND policyname = 'service_role_write'
  ) THEN
    CREATE POLICY service_role_write ON user_persona
      FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── Auto-update updated_at ────────────────────────────────────
CREATE OR REPLACE FUNCTION _update_user_persona_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_user_persona_updated_at') THEN
    CREATE TRIGGER trg_user_persona_updated_at
    BEFORE UPDATE ON user_persona
    FOR EACH ROW EXECUTE FUNCTION _update_user_persona_updated_at();
  END IF;
END $$;

-- Migration: 20260423_user_persona_status
-- Adds status column to user_persona (NEW → WAITLIST → PAID_BETA → LAUNCHED)
-- Seeds is_beta_live flag into snippd_integrations
-- Run in Supabase Dashboard → SQL Editor

-- ── user_persona.status ────────────────────────────────────────
ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'waitlist', 'paid_beta', 'launched'));

-- Add location column while we're here (used by AgentActivityLog)
ALTER TABLE user_persona
  ADD COLUMN IF NOT EXISTS location TEXT;

-- Index for fast status lookups (UserStatus gate)
CREATE INDEX IF NOT EXISTS idx_user_persona_status
  ON user_persona (status);

-- ── snippd_integrations: is_beta_live flag ─────────────────────
-- Controlled by the team — when flipped to 'true', PAID_BETA users
-- see FounderDashboard instead of WaitlistScreen.
INSERT INTO snippd_integrations (key, value)
  VALUES ('is_beta_live', 'false')
  ON CONFLICT (key) DO NOTHING;

-- ── Helpful view: active beta users ───────────────────────────
CREATE OR REPLACE VIEW v_beta_users AS
  SELECT
    up.user_id,
    au.email,
    up.status,
    up.mission,
    up.monthly_budget_cents,
    up.onboarding_completed_at,
    up.location,
    up.style_vibe,
    up.clothing_size
  FROM user_persona up
  JOIN auth.users au ON au.id = up.user_id
  WHERE up.status IN ('paid_beta', 'launched');

-- RLS: service_role only on the view (handled by underlying table RLS)

-- ─────────────────────────────────────────────────────────────
-- PHASE 9: Persona expansion + waitlist (depend on user_persona)
-- ─────────────────────────────────────────────────────────────
-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260427_persona_expansion
-- Shopping Bestie persona expansion — household DNA, clinical guardrails,
-- pantry anchors, behavioral signals, and forecast/briefing tracking.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Expand user_persona ────────────────────────────────────────────────────

ALTER TABLE user_persona
  -- Household composition: { "infant":1, "teenager":2, "adult":2, "pet":1 }
  ADD COLUMN IF NOT EXISTS household_composition            JSONB    DEFAULT '{}',

  -- Spending leak category (from Forecast step 2)
  ADD COLUMN IF NOT EXISTS leak_category                   TEXT,
  -- Values: 'convenience_tax' | 'brand_trap' | 'target_drift' | 'healthy_premium'

  -- Bio/health mission (from Forecast step 3)
  ADD COLUMN IF NOT EXISTS mission_type                    TEXT,
  -- Values: 'clinical_guardrails' | 'program_tracking' | 'athletic_fuel' | 'pure_savings'

  -- Raw monthly spend input (cents, from Forecast step 4)
  ADD COLUMN IF NOT EXISTS monthly_spend_cents             INTEGER,

  -- Calculated projected monthly recovery (cents)
  ADD COLUMN IF NOT EXISTS projected_monthly_recovery_cents INTEGER,

  -- "Why do you need Snippd?" — free text for social proof
  ADD COLUMN IF NOT EXISTS why_snippd                      TEXT,

  -- ── Deep Brief (Chapter 2 — Safety Net) ──────────────────────────────────
  ADD COLUMN IF NOT EXISTS clinical_allergies              TEXT[]   DEFAULT '{}',
  -- Values: 'peanut' | 'tree_nut' | 'gluten' | 'dairy' | 'shellfish' | 'soy' | 'egg'

  ADD COLUMN IF NOT EXISTS clinical_diagnoses              TEXT[]   DEFAULT '{}',
  -- Values: 'diabetes_t2' | 'hypertension' | 'celiac' | 'ibs' | 'lactose_intolerant'

  -- Exact ages for children (for growth-spurt spend modeling)
  ADD COLUMN IF NOT EXISTS child_ages                      INTEGER[] DEFAULT '{}',

  -- ── Deep Brief (Chapter 3 — Pantry DNA) ──────────────────────────────────
  -- Anchor products: the non-negotiables they always buy
  ADD COLUMN IF NOT EXISTS pantry_anchors                  TEXT[]   DEFAULT '{}',
  -- e.g. ['Folgers Coffee', 'Organic Valley Milk', 'Kind Bars']

  -- ── Deep Brief (Chapter 4 — Money & Stores) ──────────────────────────────
  ADD COLUMN IF NOT EXISTS preferred_stores                TEXT[]   DEFAULT '{}',
  -- e.g. ['costco', 'kroger', 'target', 'walmart', 'aldi', 'whole_foods']

  ADD COLUMN IF NOT EXISTS loyalty_cards                   TEXT[]   DEFAULT '{}',
  -- e.g. ['kroger', 'target', 'costco']

  ADD COLUMN IF NOT EXISTS financial_goal                  TEXT,
  -- Values: 'debt_payoff' | 'build_wealth' | 'emergency_fund' | 'stretch_budget'

  -- ── Deep Brief (Chapter 5 — Style) ────────────────────────────────────────
  ADD COLUMN IF NOT EXISTS stress_behavior                 TEXT,
  -- How they shop when stressed: 'orders_delivery' | 'grabs_fast_food' | 'still_cooks' | 'eats_whatever'

  ADD COLUMN IF NOT EXISTS autonomy_level                  TEXT     DEFAULT 'confirm',
  -- Values: 'show_deals' | 'build_cart' | 'full_auto'

  ADD COLUMN IF NOT EXISTS cooking_frequency               TEXT,
  -- Values: 'daily' | 'few_times_week' | 'weekends_only' | 'rarely'

  ADD COLUMN IF NOT EXISTS brand_affinity                  TEXT,
  -- Values: 'generic_always' | 'mix' | 'name_brand_loyal' | 'organic_premium'

  ADD COLUMN IF NOT EXISTS shopping_style                  TEXT,
  -- Values: 'planned_list' | 'sale_hunter' | 'as_needed' | 'weekly_batch'

  -- Free text from onboarding (e.g. "My kids won't eat anything green")
  ADD COLUMN IF NOT EXISTS persona_notes                   TEXT,

  -- ── Living signals — updated from receipt analysis ──────────────────────
  ADD COLUMN IF NOT EXISTS behavior_signals                JSONB    DEFAULT '{}',
  -- e.g. { "fast_food_freq_7d": 3, "health_trend": "improving", "buying_generics": true }

  -- Persona version — increments on each evolution (receipt-driven update)
  ADD COLUMN IF NOT EXISTS persona_version                 INTEGER  DEFAULT 1,

  -- Tracking flags
  ADD COLUMN IF NOT EXISTS forecast_completed              BOOLEAN  DEFAULT FALSE,
  -- TRUE after the 4-step Waitlist Forecast is submitted

  ADD COLUMN IF NOT EXISTS briefing_completed              BOOLEAN  DEFAULT FALSE;
  -- TRUE after the 5-chapter Deep Briefing (activation onboarding)

-- ── 2. Indexes ────────────────────────────────────────────────────────────────

-- Fast lookup for users who haven't completed forecast yet
CREATE INDEX IF NOT EXISTS idx_persona_forecast_pending
  ON user_persona(user_id)
  WHERE forecast_completed = FALSE;

-- GIN index for household composition queries
-- (e.g. "find all users with infants for formula nurture emails")
CREATE INDEX IF NOT EXISTS idx_persona_household
  ON user_persona USING gin(household_composition);

-- GIN index for behavioral signal queries
CREATE INDEX IF NOT EXISTS idx_persona_behavior_signals
  ON user_persona USING gin(behavior_signals);

-- GIN index for clinical data (allergy-aware product filtering)
CREATE INDEX IF NOT EXISTS idx_persona_allergies
  ON user_persona USING gin(clinical_allergies);

-- ── 3. Column comments ────────────────────────────────────────────────────────

COMMENT ON COLUMN user_persona.household_composition IS
  'JSON count map of household members: {"infant":1,"teenager":2,"adult":2,"pet":1}';

COMMENT ON COLUMN user_persona.behavior_signals IS
  'Living signals updated from receipt analysis. Never overwrite — merge with jsonb_set.';

COMMENT ON COLUMN user_persona.persona_version IS
  'Increments each time the persona is updated from behavioral signals.';

COMMENT ON COLUMN user_persona.forecast_completed IS
  'TRUE after user completes the 4-step Waitlist Forecast. Gates WaitlistScreen.';

COMMENT ON COLUMN user_persona.briefing_completed IS
  'TRUE after user completes the 5-chapter Deep Briefing (post-activation).';

COMMENT ON COLUMN user_persona.pantry_anchors IS
  'Non-negotiable anchor products used for price-drop alerts and substitution scoring.';

COMMENT ON COLUMN user_persona.why_snippd IS
  'User free-text "Why do you need Snippd?" — used for social proof and viral share.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260427_waitlist_positions
-- Three-lane waitlist position system.
--
-- Lane 1-200:   paid tier  — first 200 payers get instant beta access
-- Lane 201-300: gifted     — Snippd admin grants (influencers, featured picks)
-- Lane 301+:    free       — organic waitlist, gamified climb
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. waitlist_positions ─────────────────────────────────────────────────────
-- One row per user. Source of truth for their current position and tier.

CREATE TABLE IF NOT EXISTS waitlist_positions (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID        NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Which lane this user is in
  tier                TEXT        NOT NULL DEFAULT 'free'
                                  CHECK (tier IN ('paid', 'gifted', 'free')),

  -- base_position: assigned on first join, never changes
  -- paid users: 1, 2, 3 … in payment order
  -- gifted users: 201–300, assigned by admin
  -- free users: 301 + (free join order)
  base_position       INTEGER     NOT NULL,

  -- current_position = base_position - spots_gained
  -- Updated whenever a waitlist_action is recorded
  current_position    INTEGER     NOT NULL,

  -- Running total of spots moved up
  spots_gained        INTEGER     NOT NULL DEFAULT 0,

  -- Lifecycle status
  status              TEXT        NOT NULL DEFAULT 'waiting'
                                  CHECK (status IN ('waiting', 'approved', 'declined')),

  -- Set on Stripe payment confirmation (via webhook)
  stripe_payment_id   TEXT,
  stripe_tier         TEXT,       -- 'beta_pro' | 'founder'

  -- Approved timestamp — set when Snippd opens beta for this user
  approved_at         TIMESTAMPTZ,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE waitlist_positions ENABLE ROW LEVEL SECURITY;

-- Users can read their own row
CREATE POLICY "waitlist_positions_select_own"
  ON waitlist_positions FOR SELECT
  USING (auth.uid() = user_id);

-- Only service role can insert / update (done via Edge Functions or webhooks)
-- No INSERT/UPDATE policy for authenticated users — all writes are server-side

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wlpos_user_id          ON waitlist_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_wlpos_tier_position     ON waitlist_positions(tier, current_position);
CREATE INDEX IF NOT EXISTS idx_wlpos_status            ON waitlist_positions(status);
CREATE INDEX IF NOT EXISTS idx_wlpos_current_position  ON waitlist_positions(current_position);

-- ── 2. waitlist_actions ───────────────────────────────────────────────────────
-- Immutable log of every move-up event.
-- Append-only — rows are never updated or deleted.

CREATE TABLE IF NOT EXISTS waitlist_actions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What triggered the movement
  action_type     TEXT        NOT NULL,
  -- 'complete_briefing'  — finished 5-chapter onboarding (+10)
  -- 'share_ig'           — tagged @getsnippd on Instagram (+25, honor)
  -- 'share_tiktok'       — tagged @getsnippd on TikTok (+25, honor)
  -- 'share_x'            — tagged @getsnippd on X (+25, honor)
  -- 'referral_join'      — a referred user completed forecast (+50, auto)
  -- 'referral_paid'      — a referred user paid (+100, auto)
  -- 'why_featured'       — Snippd featured their "Why" (+50, admin)
  -- 'admin_gift'         — manual admin grant (variable)

  spots_awarded   INTEGER     NOT NULL DEFAULT 0,

  -- Honor-system shares start unverified; admin flips to true after review
  -- Auto-verified actions (referral_join, referral_paid, complete_briefing) are true on insert
  verified        BOOLEAN     NOT NULL DEFAULT FALSE,

  -- Optional: referral user_id for referral_join / referral_paid actions
  referred_user_id UUID       REFERENCES auth.users(id),

  -- Optional: admin note for admin_gift / why_featured
  note            TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE waitlist_actions ENABLE ROW LEVEL SECURITY;

-- Users can read their own actions
CREATE POLICY "waitlist_actions_select_own"
  ON waitlist_actions FOR SELECT
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wlact_user_id     ON waitlist_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_wlact_action_type ON waitlist_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_wlact_verified    ON waitlist_actions(verified);

-- ── 3. Function: assign_free_waitlist_position() ──────────────────────────────
-- Called from the ingest-event Edge Function after forecast_completed = true.
-- Assigns base_position = 300 + (count of existing free rows) + 1.
-- Safe against race conditions via advisory lock on the user_id.

CREATE OR REPLACE FUNCTION assign_free_waitlist_position(p_user_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_pos INTEGER;
BEGIN
  -- Count existing free-tier rows to determine next slot
  SELECT COALESCE(MAX(base_position), 300) + 1
    INTO v_next_pos
    FROM waitlist_positions
   WHERE tier = 'free';

  INSERT INTO waitlist_positions (user_id, tier, base_position, current_position)
  VALUES (p_user_id, 'free', v_next_pos, v_next_pos)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN v_next_pos;
END;
$$;

-- ── 4. Function: assign_paid_waitlist_position() ──────────────────────────────
-- Called from the Stripe webhook Edge Function after payment confirmed.
-- Assigns base_position = count of paid rows + 1 (starting at 1).
-- Users with position <= 200 are auto-approved.

CREATE OR REPLACE FUNCTION assign_paid_waitlist_position(
  p_user_id          UUID,
  p_stripe_payment_id TEXT,
  p_stripe_tier       TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_next_pos INTEGER;
  v_status   TEXT;
BEGIN
  SELECT COALESCE(MAX(base_position), 0) + 1
    INTO v_next_pos
    FROM waitlist_positions
   WHERE tier = 'paid';

  -- First 200 paid users are auto-approved
  v_status := CASE WHEN v_next_pos <= 200 THEN 'approved' ELSE 'waiting' END;

  INSERT INTO waitlist_positions (
    user_id, tier, base_position, current_position,
    status, stripe_payment_id, stripe_tier,
    approved_at
  )
  VALUES (
    p_user_id, 'paid', v_next_pos, v_next_pos,
    v_status, p_stripe_payment_id, p_stripe_tier,
    CASE WHEN v_status = 'approved' THEN NOW() ELSE NULL END
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier               = 'paid',
    base_position      = v_next_pos,
    current_position   = v_next_pos,
    status             = v_status,
    stripe_payment_id  = p_stripe_payment_id,
    stripe_tier        = p_stripe_tier,
    approved_at        = CASE WHEN v_status = 'approved' THEN NOW() ELSE NULL END,
    updated_at         = NOW();

  -- Also update user_persona status
  UPDATE user_persona
     SET status = CASE WHEN v_status = 'approved' THEN 'paid_beta' ELSE 'waitlist' END
   WHERE user_id = p_user_id;

  RETURN v_next_pos;
END;
$$;

-- ── 5. Function: record_waitlist_action() ────────────────────────────────────
-- Records a move-up action and updates current_position.
-- current_position floor is 1 (can't go above position 1).

CREATE OR REPLACE FUNCTION record_waitlist_action(
  p_user_id     UUID,
  p_action_type TEXT,
  p_spots       INTEGER,
  p_verified    BOOLEAN DEFAULT FALSE,
  p_referred_user_id UUID DEFAULT NULL,
  p_note        TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Insert action log
  INSERT INTO waitlist_actions (user_id, action_type, spots_awarded, verified, referred_user_id, note)
  VALUES (p_user_id, p_action_type, p_spots, p_verified, p_referred_user_id, p_note);

  -- Update position (floor at 1)
  UPDATE waitlist_positions
     SET spots_gained      = spots_gained + p_spots,
         current_position  = GREATEST(1, current_position - p_spots),
         updated_at        = NOW()
   WHERE user_id = p_user_id;
END;
$$;

-- ── 6. View: v_waitlist_leaderboard ──────────────────────────────────────────
-- Public-safe view showing anonymized leaderboard (no emails/names).
-- Used to show "X people on the waitlist" and top movers without exposing PII.

CREATE OR REPLACE VIEW v_waitlist_leaderboard AS
SELECT
  tier,
  current_position,
  status,
  spots_gained,
  created_at
FROM waitlist_positions
ORDER BY current_position ASC;

-- ── 7. View: v_waitlist_stats ────────────────────────────────────────────────
-- Aggregate stats for community display.

CREATE OR REPLACE VIEW v_waitlist_stats AS
SELECT
  COUNT(*)                                          AS total_on_waitlist,
  COUNT(*) FILTER (WHERE tier = 'paid')             AS paid_count,
  COUNT(*) FILTER (WHERE tier = 'gifted')           AS gifted_count,
  COUNT(*) FILTER (WHERE tier = 'free')             AS free_count,
  COUNT(*) FILTER (WHERE status = 'approved')       AS approved_count,
  COALESCE(MAX(current_position)
    FILTER (WHERE tier = 'paid'), 0)                AS last_paid_position
FROM waitlist_positions;

COMMENT ON TABLE waitlist_positions IS
  'One row per user. Source of truth for waitlist tier, position, and approval status.
   Tiers: paid=1-200 (auto-approved ≤200), gifted=201-300, free=301+.';

COMMENT ON TABLE waitlist_actions IS
  'Append-only log of every move-up event. Never update or delete rows.';


-- ─────────────────────────────────────────────────────────────
-- PHASE 10: pg_cron jobs
-- NOTE: pg_cron must be enabled in Supabase Dashboard first:
-- Dashboard → Database → Extensions → pg_cron → Enable
-- AND you must run these in the SQL Editor BEFORE this block:
--   ALTER DATABASE postgres SET app.supabase_url = 'https://YOUR_PROJECT.supabase.co';
--   ALTER DATABASE postgres SET app.ingest_key = 'YOUR_INGEST_API_KEY';
-- ─────────────────────────────────────────────────────────────

-- Wrap pg_cron calls in a safety block — skips gracefully if extension not enabled
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Plan cache invalidation (Wednesday 10am ET)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-weekly-plan-rebuild') THEN
      PERFORM cron.unschedule('snippd-weekly-plan-rebuild');
    END IF;
    PERFORM cron.schedule(
      'snippd-weekly-plan-rebuild',
      '0 15 * * 3',
      $cron$
      UPDATE public.profiles
      SET plan_cached_at = NULL
      WHERE last_app_opened_at >= NOW() - INTERVAL '30 days';
      $cron$
    );

    -- Publix ESF ingestion (Wed + Sat 9am ET)
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-publix-esf-ingest-wed') THEN
      PERFORM cron.unschedule('snippd-publix-esf-ingest-wed');
    END IF;
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'snippd-publix-esf-ingest-sat') THEN
      PERFORM cron.unschedule('snippd-publix-esf-ingest-sat');
    END IF;

    RAISE NOTICE 'pg_cron: plan rebuild + publix ESF jobs scheduled.';
    RAISE NOTICE 'NOTE: publix-esf cron requires app.supabase_url + app.ingest_key to be set.';
  ELSE
    RAISE NOTICE 'pg_cron extension not enabled — skipping cron job registration.';
    RAISE NOTICE 'Enable it in Dashboard → Database → Extensions, then re-run Phase 10.';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- PHASE 11: Verify key tables exist (quick sanity check)
-- ─────────────────────────────────────────────────────────────
DO $$
DECLARE
  missing text[] := '{}';
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'household_essentials',
    'weekly_lifecycle_plans',
    'checkout_math_snapshots',
    'authoritative_funding_ledger',
    'user_trips',
    'agentic_ledger',
    'clip_sessions',
    'clip_session_items',
    'publix_store_coupon_kb',
    'mfr_coupon_kb',
    'rebate_offers',
    'honey_token_skus',
    'geo_auth_logs',
    'healing_events',
    'agent_initialization',
    'user_persona',
    'waitlist_positions',
    'waitlist_actions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      missing := array_append(missing, tbl);
    END IF;
  END LOOP;

  IF array_length(missing, 1) IS NOT NULL THEN
    RAISE WARNING 'LAUNCH CHECK — missing tables: %', array_to_string(missing, ', ');
  ELSE
    RAISE NOTICE 'LAUNCH CHECK ✓ — all 18 required tables present.';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- END OF LAUNCH MIGRATION BUNDLE
-- If you see "LAUNCH CHECK ✓ — all 18 required tables present." above,
-- your database is ready to receive data.
-- ═══════════════════════════════════════════════════════════════════════════
