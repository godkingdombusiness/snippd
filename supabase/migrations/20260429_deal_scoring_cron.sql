-- ============================================================
-- Snippd — Deal Scoring pg_cron jobs
-- Migration: 20260429_deal_scoring_cron.sql
-- Idempotent: safe to re-run
-- Requires: pg_cron extension enabled in Dashboard
-- ============================================================

-- Guard: only schedule if pg_cron extension is available
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN

    -- Daily deal scoring: flag stale prices + score all pending offers
    -- Runs at 3:00 AM UTC every day
    PERFORM cron.schedule(
      'daily-deal-scoring',
      '0 3 * * *',
      $$
        SELECT net.http_post(
          url    := current_setting('app.supabase_url') || '/functions/v1/run-deal-scoring',
          body   := '{}',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'x-ingest-key', current_setting('app.ingest_key')
          )
        )
      $$
    );

    -- Expire old review queue items (resolved >7 days ago)
    PERFORM cron.schedule(
      'cleanup-review-queue',
      '0 4 * * *',
      $$
        UPDATE public.deal_review_queue SET
          review_status = 'resolved',
          updated_at    = now()
        WHERE review_status IN ('approved','rejected')
          AND updated_at < now() - INTERVAL '7 days'
      $$
    );

    -- Update market readiness scores for demo markets (weekly Sunday 2am)
    PERFORM cron.schedule(
      'weekly-market-readiness',
      '0 2 * * 0',
      $$
        SELECT public.compute_market_readiness('FL', NULL, NULL),
               public.compute_market_readiness('TN', NULL, NULL),
               public.compute_market_readiness('OH', NULL, NULL)
      $$
    );

    RAISE NOTICE 'Deal scoring cron jobs scheduled.';
  ELSE
    RAISE NOTICE 'pg_cron not installed — skipping cron job setup. Enable pg_cron in Dashboard first.';
  END IF;
END;
$$;
