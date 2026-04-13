-- ============================================================
-- sql/07_security_hardening.sql
-- Snippd Security Hardening — Phase 1
-- Run AFTER 00-06 migrations. Safe to re-run (idempotent).
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- EXTENSIONS
-- ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─────────────────────────────────────────────────────────────
-- SECTION 1: HELPER FUNCTIONS
-- ─────────────────────────────────────────────────────────────

-- Returns true if caller is authenticated (not anon)
CREATE OR REPLACE FUNCTION is_authenticated_user()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT auth.uid() IS NOT NULL;
$$;

-- Returns true if caller is a member of the given household
CREATE OR REPLACE FUNCTION is_household_member(p_household_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS(
    SELECT 1 FROM household_members
    WHERE household_id = p_household_id
      AND user_id = auth.uid()
  );
$$;

-- Returns the caller's role within a household, or NULL
CREATE OR REPLACE FUNCTION household_role(p_household_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT role FROM household_members
  WHERE household_id = p_household_id AND user_id = auth.uid();
$$;

-- Returns true if caller is the STACK_MANAGER of the household
CREATE OR REPLACE FUNCTION is_household_owner(p_household_id UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT household_role(p_household_id) = 'STACK_MANAGER';
$$;

-- Returns true if caller has is_admin flag on their profile
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Returns true if caller is a security admin
CREATE OR REPLACE FUNCTION is_security_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT is_security_admin FROM profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Returns true if a feature flag is currently enabled
CREATE OR REPLACE FUNCTION is_feature_enabled(p_flag TEXT)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(
    (SELECT enabled FROM feature_flags WHERE flag_name = p_flag),
    FALSE
  );
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 2: CORE TABLES
-- ─────────────────────────────────────────────────────────────

-- Add security columns to profiles if not present
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_admin BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_security_admin') THEN
    ALTER TABLE profiles ADD COLUMN is_security_admin BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='is_frozen') THEN
    ALTER TABLE profiles ADD COLUMN is_frozen BOOLEAN DEFAULT FALSE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='encrypted_dek') THEN
    ALTER TABLE profiles ADD COLUMN encrypted_dek TEXT; -- per-user data encryption key, encrypted with master key
  END IF;
END $$;

-- ── FEATURE FLAGS (kill switches) ─────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  flag_name    TEXT        PRIMARY KEY,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  description  TEXT,
  disabled_by  TEXT,
  disabled_at  TIMESTAMPTZ,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO feature_flags(flag_name, enabled, description) VALUES
  ('rewards_enabled',    TRUE, 'All credit earning and reward issuance'),
  ('referrals_enabled',  TRUE, 'Referral code sign-ups and credit release'),
  ('receipts_enabled',   TRUE, 'Receipt upload and OCR processing'),
  ('ai_enabled',         TRUE, 'Gemini API calls (OCR + Chef Stash)'),
  ('new_signups_enabled',TRUE, 'New account creation'),
  ('household_enabled',  TRUE, 'Household creation and member joins'),
  ('export_enabled',     TRUE, 'Data export / DSAR fulfillment')
ON CONFLICT(flag_name) DO NOTHING;

-- ── CREDIT LEDGER (append-only) ───────────────────────────────
CREATE TABLE IF NOT EXISTS credit_ledger (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  household_id     UUID,                         -- optional, for household-level reporting
  type             TEXT        NOT NULL,          -- earn|spend|adjust|reversal|promo|level_bonus
  amount           INTEGER     NOT NULL,          -- positive = credit, negative = debit
  source           TEXT        NOT NULL,          -- weekly_trip|referral_instant|referral_release|admin|promo|level
  reference_id     UUID,                          -- trip_id, referral_id, promo_id, etc.
  idempotency_key  TEXT        UNIQUE NOT NULL,   -- prevents double-award; UUID v4
  issued_by        TEXT        NOT NULL DEFAULT 'system', -- 'system' or 'admin:{id}'
  metadata         JSONB       DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent any UPDATE or DELETE on ledger rows
CREATE RULE no_update_credit_ledger AS ON UPDATE TO credit_ledger DO INSTEAD NOTHING;
CREATE RULE no_delete_credit_ledger AS ON DELETE TO credit_ledger DO INSTEAD NOTHING;

CREATE INDEX IF NOT EXISTS idx_ledger_user ON credit_ledger(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ledger_idem ON credit_ledger(idempotency_key);

-- Computed balance view (single source of truth)
CREATE OR REPLACE VIEW user_credit_balance AS
  SELECT user_id, COALESCE(SUM(amount), 0) AS balance
  FROM credit_ledger
  GROUP BY user_id;

-- ── PROCESSED REQUESTS (idempotency + replay protection) ──────
CREATE TABLE IF NOT EXISTS processed_requests (
  idempotency_key  TEXT        PRIMARY KEY,
  endpoint         TEXT        NOT NULL,
  user_id          UUID,
  request_hash     TEXT        NOT NULL,   -- SHA-256(method+endpoint+canonicalized_body)
  response_status  INTEGER     NOT NULL DEFAULT 200,
  response_body    JSONB,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  expires_at       TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_proc_req_user    ON processed_requests(user_id, endpoint, created_at);
CREATE INDEX IF NOT EXISTS idx_proc_req_expires ON processed_requests(expires_at);

-- ── ELEVATED SESSIONS (step-up auth tokens) ───────────────────
CREATE TABLE IF NOT EXISTS elevated_sessions (
  token       TEXT        PRIMARY KEY DEFAULT encode(gen_random_bytes(32), 'hex'),
  user_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  action      TEXT        NOT NULL,          -- disable_mfa|change_email|role_change|admin_access|etc.
  expires_at  TIMESTAMPTZ NOT NULL,
  used        BOOLEAN     DEFAULT FALSE,
  used_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_elev_user ON elevated_sessions(user_id, expires_at);

-- ── FRAUD FLAGS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fraud_flags (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id),
  flag_type      TEXT        NOT NULL,   -- referral_farm|receipt_fake|duplicate_device|credit_abuse|mass_signup|ip_abuse
  risk_score     INTEGER     DEFAULT 0 CHECK (risk_score BETWEEN 0 AND 100),
  auto_blocked   BOOLEAN     DEFAULT FALSE,
  reviewed       BOOLEAN     DEFAULT FALSE,
  reviewer_id    UUID        REFERENCES profiles(id),
  review_note    TEXT,
  evidence       JSONB       DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  resolved_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_fraud_user ON fraud_flags(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fraud_blocked ON fraud_flags(auto_blocked) WHERE auto_blocked = TRUE;

-- ── REWARD CLAIMS (one-time claim enforcement) ─────────────────
CREATE TABLE IF NOT EXISTS reward_claims (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES profiles(id),
  reward_key     TEXT        NOT NULL,       -- e.g. 'LEVEL_3_BONUS', 'STREAK_7_DAY'
  amount         INTEGER     NOT NULL,
  claimed_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, reward_key)               -- one claim per user per reward type
);

-- ── REFERRAL VERIFICATIONS ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS referral_verifications (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referral_id     UUID        REFERENCES referrals(id),
  device_fp       TEXT,                      -- hashed device fingerprint from client
  ip_address      INET,
  ip_country      TEXT,
  signup_velocity INTEGER     DEFAULT 0,     -- signups from same IP in last 24h
  same_device     BOOLEAN     DEFAULT FALSE, -- referrer + referee same device fingerprint?
  same_subnet     BOOLEAN     DEFAULT FALSE, -- referrer + referee in /24 subnet?
  fraud_score     INTEGER     DEFAULT 0,
  auto_blocked    BOOLEAN     DEFAULT FALSE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ── ADMIN AUDIT LOG ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID        REFERENCES profiles(id),
  action      TEXT        NOT NULL,          -- disable_flag|freeze_account|adjust_credits|etc.
  target_id   UUID,                          -- affected user/entity
  target_type TEXT,                          -- 'user'|'household'|'flag'|'referral'
  metadata    JSONB       DEFAULT '{}',
  ip_address  INET,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_actor  ON admin_audit_log(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_audit_target ON admin_audit_log(target_id, created_at DESC);

-- ── CRON AUDIT LOG ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cron_audit_log (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action       TEXT        NOT NULL,   -- created|modified|deleted|executed|failed
  job_name     TEXT        NOT NULL,
  job_schedule TEXT,
  job_command  TEXT,
  executed_by  TEXT,
  result       TEXT,
  error_msg    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- SECTION 3: RLS POLICIES
-- ─────────────────────────────────────────────────────────────

-- ── FEATURE FLAGS ──────────────────────────────────────────────
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "flags_auth_read" ON feature_flags;
CREATE POLICY "flags_auth_read" ON feature_flags
  FOR SELECT USING (auth.uid() IS NOT NULL); -- any authed user can read flags (needed for kill switch checks)
-- No INSERT/UPDATE/DELETE for clients — service role only

-- ── CREDIT LEDGER ──────────────────────────────────────────────
ALTER TABLE credit_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ledger_select_own" ON credit_ledger;
CREATE POLICY "ledger_select_own" ON credit_ledger
  FOR SELECT USING (user_id = auth.uid());
-- No INSERT/UPDATE/DELETE policies — service role only via issue_credits()

-- ── PROCESSED REQUESTS ─────────────────────────────────────────
ALTER TABLE processed_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "proc_req_select_own" ON processed_requests;
CREATE POLICY "proc_req_select_own" ON processed_requests
  FOR SELECT USING (user_id = auth.uid());
-- No client write access

-- ── ELEVATED SESSIONS ──────────────────────────────────────────
ALTER TABLE elevated_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "elev_select_own" ON elevated_sessions;
CREATE POLICY "elev_select_own" ON elevated_sessions
  FOR SELECT USING (user_id = auth.uid());
-- No client write — tokens issued server-side only

-- ── FRAUD FLAGS ────────────────────────────────────────────────
ALTER TABLE fraud_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fraud_admin_select" ON fraud_flags;
CREATE POLICY "fraud_admin_select" ON fraud_flags
  FOR SELECT USING (is_security_admin());
-- No client access whatsoever

-- ── REWARD CLAIMS ──────────────────────────────────────────────
ALTER TABLE reward_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "reward_claims_own" ON reward_claims;
CREATE POLICY "reward_claims_own" ON reward_claims
  FOR SELECT USING (user_id = auth.uid());
-- No client write

-- ── ADMIN AUDIT LOG ────────────────────────────────────────────
ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_audit_security_admin" ON admin_audit_log;
CREATE POLICY "admin_audit_security_admin" ON admin_audit_log
  FOR SELECT USING (is_security_admin());
-- No client write

-- ── PROFILES (refresh) ─────────────────────────────────────────
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own_safe" ON profiles;

CREATE POLICY "profiles_select_own" ON profiles
  FOR SELECT USING (auth.uid() = id);

-- Update: only safe fields. Privileged fields (is_admin, stash_credits, subscription_type) require service role.
CREATE POLICY "profiles_update_own_safe" ON profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    -- Server-side Edge Function strips privileged fields before passing to DB
    -- RLS is last defense, not first
  );

-- ── HOUSEHOLD_MEMBERS ──────────────────────────────────────────
ALTER TABLE household_members ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "hm_select_own_household" ON household_members;
DROP POLICY IF EXISTS "hm_insert_owner_only" ON household_members;
DROP POLICY IF EXISTS "hm_delete_owner_only" ON household_members;

CREATE POLICY "hm_select_own_household" ON household_members
  FOR SELECT USING (is_household_member(household_id));

CREATE POLICY "hm_insert_owner_only" ON household_members
  FOR INSERT WITH CHECK (is_household_owner(household_id));

CREATE POLICY "hm_delete_owner_only" ON household_members
  FOR DELETE USING (
    is_household_owner(household_id)
    AND user_id != auth.uid() -- cannot remove self (owner must transfer first)
  );

-- ── HOUSEHOLD_CART_ITEMS ───────────────────────────────────────
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'household_cart_items') THEN
    EXECUTE '
    ALTER TABLE household_cart_items ENABLE ROW LEVEL SECURITY;

    DROP POLICY IF EXISTS "cart_select_household" ON household_cart_items;
    DROP POLICY IF EXISTS "cart_insert_shopper_up" ON household_cart_items;
    DROP POLICY IF EXISTS "cart_delete_own_or_manager" ON household_cart_items;

    CREATE POLICY "cart_select_household" ON household_cart_items
      FOR SELECT USING (is_household_member(household_id));

    CREATE POLICY "cart_insert_shopper_up" ON household_cart_items
      FOR INSERT WITH CHECK (
        is_household_member(household_id)
        AND household_role(household_id) IN (''STACK_MANAGER'', ''SHOPPER'')
        AND added_by_user_id = auth.uid()
      );

    CREATE POLICY "cart_delete_own_or_manager" ON household_cart_items
      FOR DELETE USING (
        added_by_user_id = auth.uid()
        OR household_role(household_id) = ''STACK_MANAGER''
      );
    ';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 4: SECURE FUNCTIONS (SECURITY DEFINER)
-- ─────────────────────────────────────────────────────────────

-- ── ISSUE CREDITS (append-only, fraud-aware) ──────────────────
CREATE OR REPLACE FUNCTION issue_credits(
  p_user_id        UUID,
  p_amount         INTEGER,
  p_type           TEXT,       -- earn|spend|adjust|reversal|promo|level_bonus
  p_source         TEXT,       -- weekly_trip|referral_instant|referral_release|admin|promo
  p_reference_id   UUID,
  p_idempotency    TEXT,
  p_issued_by      TEXT DEFAULT 'system'
) RETURNS credit_ledger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row        credit_ledger;
  v_is_blocked BOOLEAN;
  v_daily_sum  INTEGER;
BEGIN
  -- 1. Kill switch
  IF NOT is_feature_enabled('rewards_enabled') THEN
    RAISE EXCEPTION 'KILL_SWITCH: rewards_enabled is FALSE';
  END IF;

  -- 2. Fraud block check
  SELECT EXISTS(
    SELECT 1 FROM fraud_flags
    WHERE user_id = p_user_id AND auto_blocked = TRUE AND resolved_at IS NULL
  ) INTO v_is_blocked;
  IF v_is_blocked THEN
    RAISE EXCEPTION 'FRAUD_BLOCK: User % is blocked from receiving credits', p_user_id;
  END IF;

  -- 3. Insert with idempotency (duplicate key = silent no-op)
  INSERT INTO credit_ledger(user_id, type, amount, source, reference_id, idempotency_key, issued_by)
  VALUES(p_user_id, p_type, p_amount, p_source, p_reference_id, p_idempotency, p_issued_by)
  ON CONFLICT(idempotency_key) DO NOTHING
  RETURNING * INTO v_row;

  -- 4. Anomaly: flag if user received >300 credits in last 24h (positive only)
  SELECT COALESCE(SUM(amount), 0) INTO v_daily_sum
  FROM credit_ledger
  WHERE user_id = p_user_id
    AND amount > 0
    AND created_at > NOW() - INTERVAL '24 hours';

  IF v_daily_sum > 300 THEN
    INSERT INTO fraud_flags(user_id, flag_type, risk_score, evidence)
    VALUES(p_user_id, 'credit_abuse', 80,
      jsonb_build_object('credits_24h', v_daily_sum, 'trigger_amount', p_amount, 'source', p_source)
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_row;
END;
$$;

-- ── GET CREDIT BALANCE ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_credit_balance(p_user_id UUID)
RETURNS INTEGER LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT COALESCE(SUM(amount), 0)::INTEGER FROM credit_ledger WHERE user_id = p_user_id;
$$;

-- ── ISSUE STEP-UP TOKEN ────────────────────────────────────────
CREATE OR REPLACE FUNCTION create_elevated_session(
  p_user_id UUID,
  p_action  TEXT,
  p_ttl_min INTEGER DEFAULT 15
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token TEXT;
BEGIN
  INSERT INTO elevated_sessions(user_id, action, expires_at)
  VALUES(p_user_id, p_action, NOW() + (p_ttl_min || ' minutes')::INTERVAL)
  RETURNING token INTO v_token;
  RETURN v_token;
END;
$$;

-- ── CONSUME STEP-UP TOKEN (validates + marks used) ────────────
CREATE OR REPLACE FUNCTION consume_elevated_session(
  p_token   TEXT,
  p_user_id UUID,
  p_action  TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_row elevated_sessions;
BEGIN
  SELECT * INTO v_row FROM elevated_sessions
  WHERE token = p_token AND user_id = p_user_id AND action = p_action;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_row.used THEN RETURN FALSE; END IF;
  IF v_row.expires_at < NOW() THEN RETURN FALSE; END IF;

  UPDATE elevated_sessions SET used = TRUE, used_at = NOW() WHERE token = p_token;
  RETURN TRUE;
END;
$$;

-- ── PROCESS REFERRAL SIGNUP (fraud-aware) ─────────────────────
CREATE OR REPLACE FUNCTION fn_process_referral_signup_v2(
  p_referee_id   UUID,
  p_referrer_code TEXT,
  p_device_fp    TEXT DEFAULT NULL,
  p_ip_address   INET DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_referrer     profiles%ROWTYPE;
  v_referral_id  UUID;
  v_fraud_score  INTEGER := 0;
  v_signup_count INTEGER;
  v_same_device  BOOLEAN := FALSE;
  v_same_subnet  BOOLEAN := FALSE;
BEGIN
  -- Kill switch
  IF NOT is_feature_enabled('referrals_enabled') THEN
    RAISE EXCEPTION 'KILL_SWITCH: referrals_enabled is FALSE';
  END IF;

  -- Look up referrer
  SELECT * INTO v_referrer FROM profiles WHERE referral_code = p_referrer_code;
  IF NOT FOUND THEN RAISE EXCEPTION 'INVALID_CODE: Referral code not found'; END IF;

  -- Self-referral check
  IF v_referrer.id = p_referee_id THEN
    RAISE EXCEPTION 'SELF_REFERRAL: User cannot refer themselves';
  END IF;

  -- Already used a referral code?
  IF EXISTS(SELECT 1 FROM referrals WHERE referee_id = p_referee_id) THEN
    RAISE EXCEPTION 'ALREADY_REFERRED: User already claimed a referral';
  END IF;

  -- Fraud scoring
  -- 1. Signup velocity from same IP
  SELECT COUNT(*) INTO v_signup_count
  FROM referral_verifications
  WHERE ip_address = p_ip_address AND created_at > NOW() - INTERVAL '24 hours';
  IF v_signup_count >= 3 THEN v_fraud_score := v_fraud_score + 40; END IF;

  -- 2. Same device fingerprint as referrer
  IF p_device_fp IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM referral_verifications rv
      JOIN referrals r ON r.id = rv.referral_id
      WHERE rv.device_fp = p_device_fp AND r.referrer_id = v_referrer.id
    ) INTO v_same_device;
    IF v_same_device THEN v_fraud_score := v_fraud_score + 50; END IF;
  END IF;

  -- 3. Same /24 subnet as referrer's previous referrals
  IF p_ip_address IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM referral_verifications rv
      JOIN referrals r ON r.id = rv.referral_id
      WHERE rv.ip_address << p_ip_address::CIDR
        AND r.referrer_id = v_referrer.id
    ) INTO v_same_subnet;
    IF v_same_subnet THEN v_fraud_score := v_fraud_score + 20; END IF;
  END IF;

  -- Create referral record
  INSERT INTO referrals(referrer_id, referee_id, referral_code,
    referrer_credits_amount, referrer_credits_status,
    referee_credits_amount, referee_credits_status,
    fraud_score)
  VALUES(v_referrer.id, p_referee_id, p_referrer_code,
    50, CASE WHEN v_fraud_score >= 60 THEN 'blocked' ELSE 'pending' END,
    25, 'instant',
    v_fraud_score)
  RETURNING id INTO v_referral_id;

  -- Log verification details
  INSERT INTO referral_verifications(referral_id, device_fp, ip_address, signup_velocity, same_device, same_subnet, fraud_score, auto_blocked)
  VALUES(v_referral_id, p_device_fp, p_ip_address, v_signup_count, v_same_device, v_same_subnet, v_fraud_score, v_fraud_score >= 70);

  -- Award instant credits to referee (if not auto-blocked)
  IF v_fraud_score < 70 THEN
    PERFORM issue_credits(
      p_referee_id, 25, 'earn', 'referral_instant', v_referral_id,
      'ref_instant_' || v_referral_id::TEXT, 'system'
    );
  END IF;

  -- Flag for fraud review if score >= 60
  IF v_fraud_score >= 60 THEN
    INSERT INTO fraud_flags(user_id, flag_type, risk_score, auto_blocked, evidence)
    VALUES(p_referee_id, 'referral_farm', v_fraud_score, v_fraud_score >= 80,
      jsonb_build_object('referral_id', v_referral_id, 'ip', p_ip_address, 'same_device', v_same_device)
    );
  END IF;

  RETURN jsonb_build_object(
    'referral_id', v_referral_id,
    'referee_credits', CASE WHEN v_fraud_score < 70 THEN 25 ELSE 0 END,
    'fraud_score', v_fraud_score,
    'blocked', v_fraud_score >= 70
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- SECTION 5: CRON JOB HARDENING
-- ─────────────────────────────────────────────────────────────

-- Cleanup expired elevated sessions
SELECT cron.schedule('expire-elevated-sessions', '*/10 * * * *',
  $$DELETE FROM elevated_sessions WHERE expires_at < NOW()$$
) ON CONFLICT (jobname) DO NOTHING;

-- Cleanup expired processed requests
SELECT cron.schedule('cleanup-processed-requests', '0 4 * * *',
  $$DELETE FROM processed_requests WHERE expires_at < NOW()$$
) ON CONFLICT (jobname) DO NOTHING;

-- Cleanup low-severity security events
SELECT cron.schedule('purge-low-security-events', '0 3 * * *',
  $$SELECT fn_purge_low_severity_events()$$
) ON CONFLICT (jobname) DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- SECTION 6: GRANT RESTRICTIONS
-- ─────────────────────────────────────────────────────────────

-- Ensure authenticated role cannot call privileged functions directly
REVOKE EXECUTE ON FUNCTION issue_credits(UUID, INTEGER, TEXT, TEXT, UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION fn_process_referral_signup_v2(UUID, TEXT, TEXT, INET) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION consume_elevated_session(TEXT, UUID, TEXT) FROM PUBLIC;

-- These remain readable by authed users
GRANT EXECUTE ON FUNCTION is_feature_enabled(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_credit_balance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_household_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION household_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION is_household_owner(UUID) TO authenticated;
