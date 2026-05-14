-- ============================================================
-- Snippd — Paywall flow columns on profiles
-- Supports: PersonalizationSummary → FirstShopPaywall → redirect
-- Idempotent: safe to run on existing DB
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_shop_started        boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS paywall_seen              boolean  DEFAULT false,
  ADD COLUMN IF NOT EXISTS personalization_summary_viewed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS next_route_after_payment  text;
  -- next_route_after_payment: JSON string { route, params } — consumed by PaymentSuccessRedirectScreen
