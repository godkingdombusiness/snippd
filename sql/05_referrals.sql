-- ══════════════════════════════════════════════════════════════════════════════
-- Snippd — Referral System (Credit-Only, Fraud Guard)
-- Referral logic:
--   Friend (referee): 25 Stash Credits instantly on sign-up
--   Referrer:         50 Stash Credits PENDING until friend's first receipt
--                     is verified as physical and unique.
--   Fraud Guard:      50 credits blocked if device_id or IP matches referrer,
--                     or if receipt is not verified as physical.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── referrals table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.referrals (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referee_id        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  referral_code     text NOT NULL,

  -- Credit awards
  referee_credits_awarded   int  NOT NULL DEFAULT 0,    -- 25 on sign-up (instant)
  referrer_credits_amount   int  NOT NULL DEFAULT 50,   -- 50 pending receipt verify
  referrer_credits_status   text NOT NULL DEFAULT 'pending'
                              CHECK (referrer_credits_status IN ('pending','approved','blocked')),

  -- Fraud guard signals
  referee_device_id         text,
  referee_ip_hash           text,    -- SHA-256 of IP, never store raw
  fraud_flag                bool NOT NULL DEFAULT false,
  fraud_reason              text,

  -- Receipt verification gate
  first_receipt_id          uuid,
  first_receipt_verified_at timestamptz,
  receipt_is_physical       bool,

  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now(),

  UNIQUE(referee_id)   -- one referral per user
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer  ON public.referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_code      ON public.referrals(referral_code);
CREATE INDEX IF NOT EXISTS idx_referrals_pending   ON public.referrals(referrer_credits_status)
  WHERE referrer_credits_status = 'pending';

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "referral_referrer_read" ON public.referrals
  FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

CREATE POLICY "referral_insert_self" ON public.referrals
  FOR INSERT WITH CHECK (auth.uid() = referee_id);

-- ── fn_process_referral_signup ────────────────────────────────────────────────
-- Called when a new user completes sign-up with a referral code.
-- Awards 25 credits to referee immediately.
-- Referrer's 50 credits are HELD PENDING until first receipt is verified.
-- Blocks credits (not deleted) if device_id or ip_hash matches referrer.

CREATE OR REPLACE FUNCTION public.fn_process_referral_signup(
  p_referee_id    uuid,
  p_referral_code text,
  p_device_id     text DEFAULT NULL,
  p_ip_hash       text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referrer_id   uuid;
  v_referral_id   uuid;
  v_fraud_flag    bool := false;
  v_fraud_reason  text := NULL;
BEGIN
  -- 1. Look up referrer by code
  SELECT p.user_id INTO v_referrer_id
  FROM public.profiles p
  WHERE p.referral_code = upper(trim(p_referral_code))
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Referral code not found');
  END IF;

  -- 2. Self-referral check
  IF v_referrer_id = p_referee_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Self-referral not allowed');
  END IF;

  -- 3. Fraud Guard: device_id or IP matches referrer
  IF p_device_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.referrals
      WHERE referrer_id = v_referrer_id
        AND referee_device_id = p_device_id
    ) OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = v_referrer_id
        AND preferences->>'device_id' = p_device_id
    ) THEN
      v_fraud_flag   := true;
      v_fraud_reason := 'Device ID matches referrer';
    END IF;
  END IF;

  IF p_ip_hash IS NOT NULL AND NOT v_fraud_flag THEN
    IF EXISTS (
      SELECT 1 FROM public.referrals
      WHERE referrer_id = v_referrer_id
        AND referee_ip_hash = p_ip_hash
    ) THEN
      v_fraud_flag   := true;
      v_fraud_reason := 'IP address matches referrer';
    END IF;
  END IF;

  -- 4. Create referral record (referrer credits held pending)
  INSERT INTO public.referrals (
    referrer_id, referee_id, referral_code,
    referee_credits_awarded, referrer_credits_amount,
    referrer_credits_status,
    referee_device_id, referee_ip_hash,
    fraud_flag, fraud_reason
  ) VALUES (
    v_referrer_id, p_referee_id, upper(trim(p_referral_code)),
    25, 50,
    CASE WHEN v_fraud_flag THEN 'blocked' ELSE 'pending' END,
    p_device_id, p_ip_hash,
    v_fraud_flag, v_fraud_reason
  ) RETURNING id INTO v_referral_id;

  -- 5. Award referee 25 Stash Credits instantly
  UPDATE public.profiles
  SET stash_credits = COALESCE(stash_credits, 0) + 25,
      updated_at    = now()
  WHERE user_id = p_referee_id;

  -- 6. Referrer's 50 credits are NOT awarded here — held pending receipt verification

  -- 7. Log to audit
  INSERT INTO public.system_audit_logs (user_id, event_type, table_name, new_data)
  VALUES (
    p_referee_id,
    'REFERRAL_SIGNUP',
    'referrals',
    jsonb_build_object(
      'referral_id',             v_referral_id,
      'referrer_id',             v_referrer_id,
      'fraud_flagged',           v_fraud_flag,
      'credits_referee',         25,
      'referrer_credits_status', CASE WHEN v_fraud_flag THEN 'blocked' ELSE 'pending' END
    )
  );

  RETURN jsonb_build_object(
    'success',                 true,
    'referral_id',             v_referral_id,
    'referrer_id',             v_referrer_id,
    'referee_credits_awarded', 25,
    'fraud_flagged',           v_fraud_flag,
    'referrer_credits_status', CASE WHEN v_fraud_flag THEN 'blocked' ELSE 'pending' END
  );
END;
$$;

-- ── fn_release_referral_credits ───────────────────────────────────────────────
-- Called by the receipt-verification pipeline after AI confirms the friend's
-- first receipt is physical and unique.
-- Releases 50 Stash Credits to the referrer and marks status 'approved'.

CREATE OR REPLACE FUNCTION public.fn_release_referral_credits(
  p_referee_id       uuid,
  p_receipt_id       uuid DEFAULT NULL,
  p_receipt_physical bool DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref  public.referrals%ROWTYPE;
BEGIN
  SELECT * INTO v_ref
  FROM public.referrals
  WHERE referee_id = p_referee_id
    AND referrer_credits_status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'reason', 'No pending referral credits found');
  END IF;

  IF NOT p_receipt_physical THEN
    -- Block — receipt is not physical
    UPDATE public.referrals
    SET referrer_credits_status  = 'blocked',
        fraud_reason             = 'Receipt not verified as physical',
        receipt_is_physical      = false,
        first_receipt_id         = p_receipt_id,
        first_receipt_verified_at = now(),
        updated_at               = now()
    WHERE id = v_ref.id;

    RETURN jsonb_build_object('success', false, 'reason', 'Receipt not physical — credits not released');
  END IF;

  -- Release 50 credits to referrer
  UPDATE public.profiles
  SET stash_credits = COALESCE(stash_credits, 0) + v_ref.referrer_credits_amount,
      updated_at    = now()
  WHERE user_id = v_ref.referrer_id;

  UPDATE public.referrals
  SET referrer_credits_status  = 'approved',
      receipt_is_physical      = true,
      first_receipt_id         = p_receipt_id,
      first_receipt_verified_at = now(),
      updated_at               = now()
  WHERE id = v_ref.id;

  -- Audit log
  INSERT INTO public.system_audit_logs (user_id, event_type, table_name, new_data)
  VALUES (
    v_ref.referrer_id,
    'REFERRAL_CREDITS_RELEASED',
    'referrals',
    jsonb_build_object(
      'referral_id',   v_ref.id,
      'credits',       v_ref.referrer_credits_amount,
      'referee_id',    p_referee_id,
      'receipt_id',    p_receipt_id
    )
  );

  RETURN jsonb_build_object(
    'success',         true,
    'credits_awarded', v_ref.referrer_credits_amount,
    'referrer_id',     v_ref.referrer_id
  );
END;
$$;

-- ── Column additions to profiles (idempotent) ─────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'referral_code'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN referral_code text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'username'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN username text UNIQUE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'chef_persona'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN chef_persona text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'stash_credits'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN stash_credits int NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'household_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN household_id uuid REFERENCES public.households(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'household_role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN household_role text;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fn_process_referral_signup IS
  'Awards 25 credits to referee on sign-up. Holds 50 credits for referrer as PENDING until receipt verified.';
COMMENT ON FUNCTION public.fn_release_referral_credits IS
  'Releases 50 Stash Credits to the referrer after AI verifies the referee''s first receipt is physical and unique.';
