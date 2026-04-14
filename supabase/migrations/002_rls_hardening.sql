-- ============================================================
-- Snippd — RLS Hardening
-- 002_rls_hardening.sql
-- Idempotent: safe to re-run
--
-- Remote DB audit (2026-04-14):
--   All tables already have RLS enabled.
--   api_rate_limit_log, ingestion_run_log already have the
--   correct schema. stack_results already has a read policy.
--   This migration only adds the two things that are missing.
-- ============================================================

-- ── 1. model_predictions — service role only ─────────────────
-- Remove the user-facing SELECT so only service_role
-- (which bypasses RLS) can read prediction rows.
DROP POLICY IF EXISTS "model_predictions_select_own" ON public.model_predictions;

-- ── 2. recommendation_exposures — add UPDATE policy ──────────
-- Allows authenticated clients to update their own outcome
-- status (clicked, accepted, dismissed) via the client SDK.
DROP POLICY IF EXISTS "recommendation_exposures_update_own" ON public.recommendation_exposures;
CREATE POLICY "recommendation_exposures_update_own"
  ON public.recommendation_exposures
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
