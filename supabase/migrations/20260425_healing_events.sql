-- ── Migration: 20260425_healing_events.sql ──────────────────────────────────
-- Self-Healing Memory — cloud log for all health checks and auto-heal actions.
--
-- Written by: healthMonitor.js → healingLog.js (non-blocking background sync).
-- Read by:    AdminPulseScreen, FounderDashboardScreen (health score & history).
--
-- Rows are inserted from the device, never updated server-side.
-- user_id is nullable — pre-auth startup checks log without a user.
-- ─────────────────────────────────────────────────────────────────────────────

-- Table ──────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.healing_events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid                    REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   text        NOT NULL,                    -- identifies one app startup run
  check_name   text        NOT NULL,                    -- secure_store | async_storage | ...
  status       text        NOT NULL
                           CHECK (status IN ('ok', 'warning', 'critical')),
  issue        text,                                    -- human-readable description; NULL if ok
  healed       boolean     NOT NULL DEFAULT false,      -- was an auto-fix applied?
  heal_action  text,                                    -- description of the fix applied
  duration_ms  integer     NOT NULL DEFAULT 0,          -- how long the check took
  app_version  text        NOT NULL DEFAULT '0.0.0',
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indexes ────────────────────────────────────────────────────────────────────

-- Primary query: per-user history, newest first
CREATE INDEX IF NOT EXISTS idx_healing_events_user_time
  ON public.healing_events (user_id, created_at DESC);

-- Query by check type (e.g. all 'session_integrity' failures ever)
CREATE INDEX IF NOT EXISTS idx_healing_events_check_time
  ON public.healing_events (check_name, created_at DESC);

-- Dashboard: quickly count how many issues were auto-healed
CREATE INDEX IF NOT EXISTS idx_healing_events_healed
  ON public.healing_events (healed, created_at DESC)
  WHERE healed = true;

-- Alert: critical events that were NOT healed (still need human attention)
CREATE INDEX IF NOT EXISTS idx_healing_events_unhealed_critical
  ON public.healing_events (status, created_at DESC)
  WHERE status = 'critical' AND healed = false;

-- RLS ─────────────────────────────────────────────────────────────────────────
ALTER TABLE public.healing_events ENABLE ROW LEVEL SECURITY;

-- Users can read only their own events (or anonymous events where user_id IS NULL)
CREATE POLICY healing_events_select_own
  ON public.healing_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR user_id IS NULL
  );

-- Users (and service role) can insert their own events
CREATE POLICY healing_events_insert_own
  ON public.healing_events FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR user_id IS NULL
  );

-- No UPDATE or DELETE — healing log is append-only

-- Aggregate view: health score per user (last 7 days) ────────────────────────
CREATE OR REPLACE VIEW public.v_user_health_score AS
SELECT
  user_id,
  COUNT(*)                                                      AS total_checks,
  SUM(CASE WHEN status = 'critical' THEN 1 ELSE 0 END)         AS critical_count,
  SUM(CASE WHEN status = 'warning'  THEN 1 ELSE 0 END)         AS warning_count,
  SUM(CASE WHEN healed = true       THEN 1 ELSE 0 END)         AS healed_count,
  GREATEST(0,
    100
    - SUM(CASE WHEN status = 'critical' THEN 3 ELSE 0 END)
    - SUM(CASE WHEN status = 'warning'  THEN 1 ELSE 0 END)
  )                                                              AS health_score,
  MAX(created_at)                                               AS last_check_at
FROM public.healing_events
WHERE created_at > now() - INTERVAL '7 days'
GROUP BY user_id;

-- Aggregate view: chronic checks (failed 5+ times in last 30 days) ───────────
CREATE OR REPLACE VIEW public.v_chronic_checks AS
SELECT
  user_id,
  check_name,
  COUNT(*) FILTER (WHERE status != 'ok')      AS failure_count,
  COUNT(*) FILTER (WHERE healed = true)       AS heal_count,
  MAX(created_at) FILTER (WHERE status != 'ok') AS last_failure_at,
  ROUND(
    COUNT(*) FILTER (WHERE healed = true)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE status != 'ok'), 0) * 100
  )                                            AS heal_rate_pct
FROM public.healing_events
WHERE created_at > now() - INTERVAL '30 days'
GROUP BY user_id, check_name
HAVING COUNT(*) FILTER (WHERE status != 'ok') >= 5
ORDER BY failure_count DESC;
