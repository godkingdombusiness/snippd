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
