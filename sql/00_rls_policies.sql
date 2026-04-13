-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — Zero-Trust Row-Level Security Policies
-- Run this in Supabase SQL Editor (or via supabase db push).
-- Idempotent: uses IF NOT EXISTS / DROP IF EXISTS where possible.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. PROFILES ───────────────────────────────────────────────────────────────
-- Users can only read/write their own profile row.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "profiles_delete_own" ON public.profiles;
CREATE POLICY "profiles_delete_own"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ── 2. APP_HOME_FEED ──────────────────────────────────────────────────────────
-- Public read for active + verified rows. No authenticated user can INSERT/UPDATE/DELETE
-- (that is admin-only via service role key, never from the client).
ALTER TABLE public.app_home_feed ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feed_select_public" ON public.app_home_feed;
CREATE POLICY "feed_select_public"
  ON public.app_home_feed FOR SELECT
  TO anon, authenticated
  USING (
    status = 'active'
    AND verification_status = 'verified_live'
  );

-- Explicitly block any client-side mutations (belt-and-suspenders):
DROP POLICY IF EXISTS "feed_no_insert" ON public.app_home_feed;
CREATE POLICY "feed_no_insert"
  ON public.app_home_feed FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "feed_no_update" ON public.app_home_feed;
CREATE POLICY "feed_no_update"
  ON public.app_home_feed FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "feed_no_delete" ON public.app_home_feed;
CREATE POLICY "feed_no_delete"
  ON public.app_home_feed FOR DELETE
  TO authenticated
  USING (false);


-- ── 3. APPROVED_CART (a.k.a. carts) ──────────────────────────────────────────
-- Replace "approved_cart" with your actual cart table name if different.
-- Users can only see and modify their own cart rows.
ALTER TABLE public.approved_cart ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cart_select_own" ON public.approved_cart;
CREATE POLICY "cart_select_own"
  ON public.approved_cart FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_insert_own" ON public.approved_cart;
CREATE POLICY "cart_insert_own"
  ON public.approved_cart FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_update_own" ON public.approved_cart;
CREATE POLICY "cart_update_own"
  ON public.approved_cart FOR UPDATE
  TO authenticated
  USING  (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "cart_delete_own" ON public.approved_cart;
CREATE POLICY "cart_delete_own"
  ON public.approved_cart FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);


-- ── 4. SYSTEM_AUDIT_LOGS ──────────────────────────────────────────────────────
-- RLS for system_audit_logs is applied at the END of 02_audit_triggers.sql,
-- after the table is created. Do not add it here — the table does not exist
-- yet when this file runs.
