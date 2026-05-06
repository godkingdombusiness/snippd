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
