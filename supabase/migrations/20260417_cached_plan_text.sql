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
