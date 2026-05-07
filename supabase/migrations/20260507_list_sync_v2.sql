-- 20260507_list_sync_v2.sql
-- Extend shopping_list_items with full stack/coupon/rebate data fields.
-- Enable Postgres realtime for instant cross-view sync.
-- Add batch upsert RPC used by WeeklyPlanScreen and other add-to-list surfaces.

-- ── 1. Extend shopping_list_items ────────────────────────────────────────────
ALTER TABLE public.shopping_list_items
  ADD COLUMN IF NOT EXISTS quantity               INTEGER         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regular_price_cents    INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_cents       INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_code            TEXT,
  ADD COLUMN IF NOT EXISTS coupon_value_cents     INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebate_app             TEXT,
  ADD COLUMN IF NOT EXISTS rebate_value_cents     INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_oop_cents    INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_after_rebate_cents INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS savings_percent        NUMERIC(5,2)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stack_type             TEXT,
  ADD COLUMN IF NOT EXISTS stack_breakdown        JSONB,
  ADD COLUMN IF NOT EXISTS customer_instructions  TEXT,
  ADD COLUMN IF NOT EXISTS budget_fit             BOOLEAN         NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS confidence_score       NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS stack_candidate_id     UUID,
  ADD COLUMN IF NOT EXISTS source                 TEXT            NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS synced_at              TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS expiration_date        DATE;

-- ── 2. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user_synced
  ON public.shopping_list_items (user_id, synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_source
  ON public.shopping_list_items (user_id, source);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_stack_candidate
  ON public.shopping_list_items (stack_candidate_id)
  WHERE stack_candidate_id IS NOT NULL;

-- ── 3. Enable realtime ────────────────────────────────────────────────────────
-- Ensures Supabase realtime broadcasts INSERT/UPDATE/DELETE on this table.
ALTER TABLE public.shopping_list_items REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename  = 'shopping_list_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.shopping_list_items;
  END IF;
END $$;

-- ── 4. Batch upsert RPC ───────────────────────────────────────────────────────
-- Called by WeeklyPlanScreen, cartStorage, and any other add-to-list surface.
-- Idempotent: uses id as the conflict key.
CREATE OR REPLACE FUNCTION public.upsert_shopping_list_items(
  p_user_id UUID,
  p_items   JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item JSONB;
  v_count INTEGER := 0;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO public.shopping_list_items (
      id, user_id, name, store, price_cents, checked, from_stack, category,
      quantity, regular_price_cents, sale_price_cents,
      coupon_code, coupon_value_cents,
      rebate_app, rebate_value_cents,
      estimated_oop_cents, net_after_rebate_cents, savings_percent,
      stack_type, stack_breakdown, customer_instructions,
      budget_fit, confidence_score, stack_candidate_id,
      source, expiration_date, synced_at
    )
    VALUES (
      COALESCE((v_item->>'id')::TEXT, gen_random_uuid()::TEXT),
      p_user_id,
      v_item->>'name',
      COALESCE(v_item->>'store', 'any'),
      COALESCE((v_item->>'price_cents')::INTEGER, 0),
      COALESCE((v_item->>'checked')::BOOLEAN, FALSE),
      COALESCE((v_item->>'from_stack')::BOOLEAN, FALSE),
      COALESCE(v_item->>'category', 'general'),
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      COALESCE((v_item->>'regular_price_cents')::INTEGER, 0),
      COALESCE((v_item->>'sale_price_cents')::INTEGER, 0),
      v_item->>'coupon_code',
      COALESCE((v_item->>'coupon_value_cents')::INTEGER, 0),
      v_item->>'rebate_app',
      COALESCE((v_item->>'rebate_value_cents')::INTEGER, 0),
      COALESCE((v_item->>'estimated_oop_cents')::INTEGER, COALESCE((v_item->>'price_cents')::INTEGER, 0)),
      COALESCE((v_item->>'net_after_rebate_cents')::INTEGER, 0),
      COALESCE((v_item->>'savings_percent')::NUMERIC, 0),
      v_item->>'stack_type',
      CASE WHEN v_item->'stack_breakdown' IS NOT NULL AND v_item->>'stack_breakdown' != 'null'
           THEN v_item->'stack_breakdown' ELSE NULL END,
      v_item->>'customer_instructions',
      COALESCE((v_item->>'budget_fit')::BOOLEAN, TRUE),
      CASE WHEN v_item->>'confidence_score' IS NOT NULL
           THEN (v_item->>'confidence_score')::NUMERIC ELSE NULL END,
      CASE WHEN v_item->>'stack_candidate_id' IS NOT NULL
           THEN (v_item->>'stack_candidate_id')::UUID ELSE NULL END,
      COALESCE(v_item->>'source', 'manual'),
      CASE WHEN v_item->>'expiration_date' IS NOT NULL
           THEN (v_item->>'expiration_date')::DATE ELSE NULL END,
      NOW()
    )
    ON CONFLICT (id) DO UPDATE SET
      name                    = EXCLUDED.name,
      store                   = EXCLUDED.store,
      price_cents             = EXCLUDED.price_cents,
      quantity                = EXCLUDED.quantity,
      regular_price_cents     = EXCLUDED.regular_price_cents,
      sale_price_cents        = EXCLUDED.sale_price_cents,
      coupon_code             = EXCLUDED.coupon_code,
      coupon_value_cents      = EXCLUDED.coupon_value_cents,
      rebate_app              = EXCLUDED.rebate_app,
      rebate_value_cents      = EXCLUDED.rebate_value_cents,
      estimated_oop_cents     = EXCLUDED.estimated_oop_cents,
      net_after_rebate_cents  = EXCLUDED.net_after_rebate_cents,
      savings_percent         = EXCLUDED.savings_percent,
      stack_type              = EXCLUDED.stack_type,
      stack_breakdown         = COALESCE(EXCLUDED.stack_breakdown, shopping_list_items.stack_breakdown),
      customer_instructions   = COALESCE(EXCLUDED.customer_instructions, shopping_list_items.customer_instructions),
      budget_fit              = EXCLUDED.budget_fit,
      confidence_score        = COALESCE(EXCLUDED.confidence_score, shopping_list_items.confidence_score),
      stack_candidate_id      = COALESCE(EXCLUDED.stack_candidate_id, shopping_list_items.stack_candidate_id),
      source                  = EXCLUDED.source,
      expiration_date         = EXCLUDED.expiration_date,
      synced_at               = NOW();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

-- ── 5. Budget-aware list summary view ────────────────────────────────────────
-- Used by BudgetContext and budget views to get live totals from list.
CREATE OR REPLACE VIEW public.v_user_list_budget_summary AS
SELECT
  user_id,
  COUNT(*)                                            AS item_count,
  SUM(CASE WHEN NOT checked THEN 1 ELSE 0 END)        AS unchecked_count,
  SUM(estimated_oop_cents * quantity)                  AS total_oop_cents,
  SUM(net_after_rebate_cents * quantity)               AS total_net_cents,
  SUM((regular_price_cents - estimated_oop_cents) * quantity)
    FILTER (WHERE regular_price_cents > 0)             AS total_savings_cents,
  SUM(coupon_value_cents * quantity)                   AS total_coupon_value_cents,
  SUM(rebate_value_cents * quantity)                   AS total_rebate_value_cents,
  BOOL_AND(budget_fit)                                 AS all_budget_fit,
  MAX(synced_at)                                       AS last_synced_at
FROM public.shopping_list_items
WHERE NOT checked
GROUP BY user_id;

GRANT SELECT ON public.v_user_list_budget_summary TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_shopping_list_items(UUID, JSONB) TO authenticated;
