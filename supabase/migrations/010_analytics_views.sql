-- ============================================================
-- Snippd — Analytics Views
-- 010_analytics_views.sql
-- Idempotent: safe to re-run (CREATE OR REPLACE VIEW)
--
-- Views created:
--   v_recommendation_funnel   — exposure → click → accept → dismiss counts
--   v_stack_performance       — stack_candidates with score + savings breakdown
--   v_weekly_savings_summary  — per-user weekly savings from wealth_momentum_snapshots
-- ============================================================

-- ── 1. Recommendation Funnel ─────────────────────────────────
-- Aggregates recommendation_exposures outcomes by type and week.
-- recommendation_exposures stores outcome in outcome_status + clicked_at/accepted_at/dismissed_at.
CREATE OR REPLACE VIEW public.v_recommendation_funnel AS
SELECT
  date_trunc('week', re.shown_at)::date                         AS week_of,
  re.recommendation_type,
  COUNT(DISTINCT re.id)                                          AS exposures,
  COUNT(DISTINCT CASE WHEN re.clicked_at   IS NOT NULL THEN re.id END) AS clicks,
  COUNT(DISTINCT CASE WHEN re.accepted_at  IS NOT NULL THEN re.id END) AS accepts,
  COUNT(DISTINCT CASE WHEN re.dismissed_at IS NOT NULL THEN re.id END) AS dismissals,
  ROUND(
    COUNT(DISTINCT CASE WHEN re.clicked_at IS NOT NULL THEN re.id END)::numeric
    / NULLIF(COUNT(DISTINCT re.id), 0) * 100, 2
  )                                                              AS click_rate_pct,
  ROUND(
    COUNT(DISTINCT CASE WHEN re.accepted_at IS NOT NULL THEN re.id END)::numeric
    / NULLIF(COUNT(DISTINCT re.id), 0) * 100, 2
  )                                                              AS acceptance_rate_pct,
  AVG(re.score)                                                  AS avg_recommendation_score
FROM public.recommendation_exposures re
WHERE re.shown_at >= NOW() - INTERVAL '90 days'
GROUP BY 1, 2
ORDER BY 1 DESC, exposures DESC;

-- ── 2. Stack Performance ──────────────────────────────────────
-- stack_candidates with computed savings breakdown and scoring.
-- stack_results joined on trip_item_id when available for realized outcomes.
CREATE OR REPLACE VIEW public.v_stack_performance AS
SELECT
  sc.id                                                          AS candidate_id,
  sc.retailer_key,
  sc.category,
  sc.item_name,
  sc.brand,
  sc.stack_rank_score,
  sc.base_price,
  sc.final_price,
  sc.coupon_savings,
  sc.sale_savings,
  (COALESCE(sc.coupon_savings, 0) + COALESCE(sc.sale_savings, 0))
    AS total_savings,
  sc.has_coupon,
  sc.is_bogo,
  CASE
    WHEN sc.base_price > 0 THEN
      ROUND(
        (COALESCE(sc.coupon_savings, 0) + COALESCE(sc.sale_savings, 0))::numeric
        / sc.base_price::numeric * 100, 2
      )
    ELSE NULL
  END                                                            AS savings_pct,
  sr.final_price_cents                                           AS realized_final_price_cents,
  sr.total_savings_cents                                         AS realized_savings_cents,
  sc.created_at                                                  AS candidate_created_at,
  sr.created_at                                                  AS result_created_at
FROM public.stack_candidates sc
LEFT JOIN public.stack_results sr
  ON sr.trip_item_id = sc.id
WHERE sc.created_at >= NOW() - INTERVAL '90 days'
  AND sc.is_active   = true
ORDER BY sc.stack_rank_score DESC NULLS LAST, sc.created_at DESC;

-- ── 3. Weekly Savings Summary ─────────────────────────────────
-- Per-user weekly savings from wealth_momentum_snapshots.
-- wealth_momentum_snapshots columns: user_id, timestamp, realized_savings,
-- inflation_offset, velocity_score, wealth_momentum, projected_annual_wealth
CREATE OR REPLACE VIEW public.v_weekly_savings_summary AS
SELECT
  date_trunc('week', wms.timestamp)::date                       AS week_of,
  wms.user_id,
  SUM(wms.realized_savings)                                      AS total_savings_cents,
  AVG(wms.realized_savings)                                      AS avg_savings_per_receipt,
  MAX(wms.velocity_score)                                        AS peak_velocity_score,
  AVG(wms.velocity_score)                                        AS avg_velocity_score,
  SUM(wms.inflation_offset)                                      AS total_inflation_offset,
  COUNT(*)                                                       AS receipt_count,
  SUM(wms.projected_annual_wealth)
    / NULLIF(COUNT(*), 0)                                        AS avg_projected_annual
FROM public.wealth_momentum_snapshots wms
WHERE wms.timestamp >= NOW() - INTERVAL '52 weeks'
GROUP BY 1, 2
ORDER BY 1 DESC, total_savings_cents DESC;

-- ── Grants ────────────────────────────────────────────────────
GRANT SELECT ON public.v_recommendation_funnel  TO authenticated;
GRANT SELECT ON public.v_stack_performance       TO authenticated;
GRANT SELECT ON public.v_weekly_savings_summary  TO authenticated;

GRANT SELECT ON public.v_recommendation_funnel  TO service_role;
GRANT SELECT ON public.v_stack_performance       TO service_role;
GRANT SELECT ON public.v_weekly_savings_summary  TO service_role;
