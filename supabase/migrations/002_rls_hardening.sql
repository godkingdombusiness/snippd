-- ============================================================
-- Snippd — RLS Hardening + Edge Function Schema
-- 002_rls_hardening.sql
-- Idempotent: safe to re-run (DROP POLICY IF EXISTS / IF NOT EXISTS)
-- Run after: 001_behavioral_intelligence_safe.sql,
--            20260413_ingestion_pipeline.sql
-- ============================================================

-- ============================================================
-- 1. api_rate_limit_log
--    Enforces 200 req/user/hour in ingest-event.
--    Created here if not present; safe no-op if already exists.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.api_rate_limit_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL,
  function_name text        NOT NULL DEFAULT 'ingest-event',
  request_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limit_user_time
  ON public.api_rate_limit_log (user_id, request_at DESC);

-- Service role bypasses RLS by default; no user-facing select needed.
ALTER TABLE public.api_rate_limit_log ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. stack_results — enable RLS (was missing from migration 001)
-- ============================================================

ALTER TABLE public.stack_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "stack_results_select_own" ON public.stack_results;
CREATE POLICY "stack_results_select_own"
  ON public.stack_results
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================
-- 3. model_predictions — service role only
--    Remove the authenticated SELECT policy so only service_role
--    (which bypasses RLS) can read prediction rows.
-- ============================================================

DROP POLICY IF EXISTS "model_predictions_select_own" ON public.model_predictions;
-- No replacement: service_role bypasses RLS by default.

-- ============================================================
-- 4. recommendation_exposures — add INSERT policy
--    service_role inserts (already bypasses RLS),
--    but authenticated users may also update their own outcomes
--    (e.g. marking clicked/dismissed via the client SDK).
-- ============================================================

DROP POLICY IF EXISTS "recommendation_exposures_update_own" ON public.recommendation_exposures;
CREATE POLICY "recommendation_exposures_update_own"
  ON public.recommendation_exposures
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- 5. ingestion_run_log — add Edge Function logging columns
--    week_of was NOT NULL for pipeline use; Edge Function log
--    rows do not have a week_of so we make it nullable.
-- ============================================================

ALTER TABLE public.ingestion_run_log
  ALTER COLUMN week_of DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS source_key text,
  ADD COLUMN IF NOT EXISTS stage      text,
  ADD COLUMN IF NOT EXISTS metadata   jsonb DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_ingestion_run_log_source_stage
  ON public.ingestion_run_log (source_key, stage, created_at DESC)
  WHERE source_key IS NOT NULL;
