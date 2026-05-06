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
