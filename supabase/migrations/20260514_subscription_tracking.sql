-- ============================================================
-- Snippd — Subscription tracking columns on profiles
-- Idempotent: safe to run on existing DB
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_status      text DEFAULT 'none',
  -- 'none' | 'trialing' | 'active' | 'past_due' | 'cancelled'
  ADD COLUMN IF NOT EXISTS stripe_customer_id       text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id   text,
  ADD COLUMN IF NOT EXISTS subscription_period_end  timestamptz,
  ADD COLUMN IF NOT EXISTS trial_ends_at            timestamptz;
  -- billing_plan already added in 20260513 migration: 'trial' | 'monthly' | 'yearly'

-- Index for fast webhook lookups by stripe_customer_id
CREATE INDEX IF NOT EXISTS idx_profiles_stripe_customer
  ON public.profiles (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_stripe_sub
  ON public.profiles (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

-- View: users whose trial has expired but billing_plan is still 'trial'
-- Used by cron job to flag for follow-up
CREATE OR REPLACE VIEW public.v_expired_trials AS
SELECT
  user_id,
  full_name,
  stripe_customer_id,
  stripe_subscription_id,
  trial_ends_at,
  subscription_status,
  billing_plan
FROM public.profiles
WHERE billing_plan    = 'trial'
  AND trial_ends_at IS NOT NULL
  AND trial_ends_at  < now()
  AND subscription_status NOT IN ('active', 'cancelled');
