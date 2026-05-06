-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: 20260501_waitlist_grants
-- Grants missing SELECT permissions on waitlist views so the live count
-- and leaderboard are readable by authenticated (and anonymous) clients.
-- Also grants EXECUTE on the position-assignment functions so they can be
-- called directly from the React Native client as a reliable fallback.
-- ─────────────────────────────────────────────────────────────────────────────

-- Allow any authenticated user (and anon) to read the aggregate stats view.
-- v_waitlist_stats is a SECURITY DEFINER view so it aggregates all rows safely
-- without leaking per-user PII.
GRANT SELECT ON v_waitlist_stats        TO authenticated, anon;
GRANT SELECT ON v_waitlist_leaderboard  TO authenticated, anon;

-- Allow authenticated users to call assign_free_waitlist_position directly
-- from the client as a reliable fallback in case ingest-event's side effect
-- call fails. The function is SECURITY DEFINER + idempotent (ON CONFLICT DO NOTHING).
GRANT EXECUTE ON FUNCTION assign_free_waitlist_position(uuid) TO authenticated;

-- Allow authenticated users to call record_waitlist_action for social share claims.
GRANT EXECUTE ON FUNCTION record_waitlist_action(uuid, text, integer, boolean, uuid, text) TO authenticated;
