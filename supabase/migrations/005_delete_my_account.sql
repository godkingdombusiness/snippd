-- ============================================================
-- Snippd — Account Deletion with Anonymized Signal Preservation
-- 005_delete_my_account.sql
-- Idempotent: safe to re-run
--
-- Creates:
--   1. public.anonymized_signals — privacy-safe aggregate table
--   2. public.delete_my_account() — RPC callable by authenticated
--      users to delete all their personal data while preserving
--      de-identified behavioral signals for model training.
-- ============================================================

-- ── 1. Anonymized signals table ───────────────────────────────
-- Stores de-identified aggregate counts of events per retailer/
-- category/week. No user_id column — unrelatable to individuals.
CREATE TABLE IF NOT EXISTS public.anonymized_signals (
  id           bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  retailer_key text,
  category     text          NOT NULL,
  event_name   text          NOT NULL,
  week_of      date          NOT NULL,
  signal_count integer       NOT NULL DEFAULT 1,
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  UNIQUE (retailer_key, category, event_name, week_of)
);

-- Service role only — no client access to aggregate data
ALTER TABLE public.anonymized_signals ENABLE ROW LEVEL SECURITY;

-- Index for efficient reads by ML training jobs
CREATE INDEX IF NOT EXISTS anonymized_signals_week_idx
  ON public.anonymized_signals (week_of DESC);
CREATE INDEX IF NOT EXISTS anonymized_signals_category_idx
  ON public.anonymized_signals (category, event_name);

-- ── 2. delete_my_account() function ──────────────────────────
-- Callable by the authenticated user via supabase.rpc('delete_my_account').
-- SECURITY DEFINER runs as postgres (superuser) so it can delete
-- from auth.users after the user's rows are gone.
--
-- Steps:
--   A. Aggregate the user's event signals into anonymized_signals
--      (preserves category/retailer/week counts without user_id)
--   B. Delete all personal data tables
--   C. Delete the auth.users record (terminates all sessions)
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated — call from a valid session';
  END IF;

  -- ── A. Preserve aggregate signals (no PII) ─────────────────
  INSERT INTO public.anonymized_signals (
    retailer_key,
    category,
    event_name,
    week_of,
    signal_count
  )
  SELECT
    retailer_key,
    category,
    event_name,
    date_trunc('week', timestamp)::date,
    count(*)
  FROM public.event_stream
  WHERE user_id = uid
    AND category IS NOT NULL
  GROUP BY retailer_key, category, event_name,
           date_trunc('week', timestamp)::date
  ON CONFLICT (retailer_key, category, event_name, week_of)
    DO UPDATE SET
      signal_count = anonymized_signals.signal_count + EXCLUDED.signal_count,
      updated_at   = now();

  -- ── B. Delete personal data tables ─────────────────────────
  DELETE FROM public.event_stream                WHERE user_id = uid;
  DELETE FROM public.user_preference_scores      WHERE user_id = uid;
  DELETE FROM public.user_state_snapshots        WHERE user_id = uid;
  DELETE FROM public.wealth_momentum_snapshots   WHERE user_id = uid;
  DELETE FROM public.recommendation_exposures    WHERE user_id = uid;
  DELETE FROM public.model_predictions           WHERE user_id = uid;
  DELETE FROM public.api_rate_limit_log          WHERE user_id = uid;
  DELETE FROM public.receipt_items               WHERE user_id = uid;
  DELETE FROM public.receipt_summaries           WHERE user_id = uid;
  DELETE FROM public.trip_results                WHERE user_id = uid;
  DELETE FROM public.profiles                    WHERE user_id = uid;

  -- ── C. Delete auth record (invalidates all sessions) ───────
  DELETE FROM auth.users WHERE id = uid;
END;
$$;

-- Restrict execution to authenticated users only
REVOKE ALL   ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
