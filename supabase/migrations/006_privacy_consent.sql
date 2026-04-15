-- ============================================================
-- Snippd — Privacy Consent Columns
-- 006_privacy_consent.sql
-- Idempotent: safe to re-run
--
-- Adds consent tracking columns to the profiles table.
-- consent_accepted:         boolean flag (already may exist per spec)
-- consent_accepted_at:      timestamptz — when the user ticked the box
-- privacy_policy_version:   text — policy version they agreed to (e.g. '1.0')
-- ============================================================

-- consent_accepted may already exist — add safely
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_accepted boolean NOT NULL DEFAULT false;

-- Timestamp of acceptance — NULL means they have not yet accepted
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS consent_accepted_at timestamptz;

-- Policy version the user agreed to (matches docs/PRIVACY_POLICY.md version)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS privacy_policy_version text;

-- Index for compliance reporting: find users who have/haven't accepted
CREATE INDEX IF NOT EXISTS profiles_consent_accepted_idx
  ON public.profiles (consent_accepted, consent_accepted_at);
