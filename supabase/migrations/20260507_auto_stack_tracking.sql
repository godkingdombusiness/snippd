-- ============================================================
-- Snippd - Automatic stack tracking and admin feedback
-- Migration: 20260507_auto_stack_tracking
--
-- Additive only. Existing stack/deal tables, columns, functions, routes,
-- environment variables, and naming conventions are preserved.
-- ============================================================

-- Audit metadata on the existing deal surfaces.
ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS source_tables_used text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rules_applied jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS model_function_used text,
  ADD COLUMN IF NOT EXISTS generation_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS regular_price_cents int,
  ADD COLUMN IF NOT EXISTS sale_price_cents int,
  ADD COLUMN IF NOT EXISTS promo_discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebate_value_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_price_after_rebate_cents int;

ALTER TABLE public.app_home_feed
  ADD COLUMN IF NOT EXISTS stack_candidate_id uuid REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_tables_used text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS rules_applied jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS model_function_used text,
  ADD COLUMN IF NOT EXISTS generation_timestamp timestamptz,
  ADD COLUMN IF NOT EXISTS review_status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS error_reason text,
  ADD COLUMN IF NOT EXISTS regular_price_cents int,
  ADD COLUMN IF NOT EXISTS sale_price_cents int,
  ADD COLUMN IF NOT EXISTS promo_discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_discount_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebate_value_cents int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_price_after_rebate_cents int;

CREATE INDEX IF NOT EXISTS idx_stack_candidates_review_status
  ON public.stack_candidates (review_status, generation_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_app_home_feed_stack_candidate
  ON public.app_home_feed (stack_candidate_id)
  WHERE stack_candidate_id IS NOT NULL;

-- One row per automated generation run.
CREATE TABLE IF NOT EXISTS public.stack_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retailer_key text,
  week_of date NOT NULL DEFAULT date_trunc('week', now())::date,
  model_function_used text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  source_tables_used text[] NOT NULL DEFAULT '{}',
  rules_applied jsonb NOT NULL DEFAULT '[]',
  generated_count int NOT NULL DEFAULT 0,
  approved_count int NOT NULL DEFAULT 0,
  needs_review_count int NOT NULL DEFAULT 0,
  rejected_count int NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_stack_generation_runs_recent
  ON public.stack_generation_runs (started_at DESC, retailer_key);

-- Row-level audit trail for every generated or rejected stack.
CREATE TABLE IF NOT EXISTS public.stack_candidate_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid REFERENCES public.stack_generation_runs(id) ON DELETE SET NULL,
  stack_candidate_id uuid REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  app_home_feed_id uuid REFERENCES public.app_home_feed(id) ON DELETE SET NULL,
  source_offer_id text,
  normalized_offer_id uuid REFERENCES public.normalized_offers(id) ON DELETE SET NULL,
  digital_coupon_id uuid REFERENCES public.digital_coupons(id) ON DELETE SET NULL,
  retailer_key text,
  product_name text,
  source_tables_used text[] NOT NULL DEFAULT '{}',
  rules_applied jsonb NOT NULL DEFAULT '[]',
  model_function_used text NOT NULL,
  generation_timestamp timestamptz NOT NULL DEFAULT now(),
  confidence_score numeric(5,4),
  review_status text NOT NULL DEFAULT 'pending',
  error_reason text,
  price_math jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_candidate_audit_candidate
  ON public.stack_candidate_audit (stack_candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stack_candidate_audit_review
  ON public.stack_candidate_audit (review_status, created_at DESC);

-- Versioned rules/prompts for future scoring changes. Never overwrite old behavior.
CREATE TABLE IF NOT EXISTS public.stack_generation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key text NOT NULL,
  rule_version int NOT NULL DEFAULT 1,
  rule_type text NOT NULL DEFAULT 'scoring',
  rule_body jsonb NOT NULL DEFAULT '{}',
  prompt_text text,
  is_active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL DEFAULT 'system',
  created_at timestamptz NOT NULL DEFAULT now(),
  supersedes_rule_id uuid REFERENCES public.stack_generation_rules(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_stack_generation_rules_version
  ON public.stack_generation_rules (rule_key, rule_version);

INSERT INTO public.stack_generation_rules
  (rule_key, rule_version, rule_type, rule_body, created_by)
VALUES
  (
    'automatic_stack_scoring',
    1,
    'scoring',
    '{
      "min_auto_approve_confidence": 0.85,
      "min_publish_savings_percent": 15,
      "normalized_offer_weight": 0.55,
      "coupon_verified_weight": 0.20,
      "retailer_rules_weight": 0.15,
      "price_completeness_weight": 0.10
    }'::jsonb,
    'system'
  )
ON CONFLICT (rule_key, rule_version) DO NOTHING;

-- Admin feedback references stack/deal IDs instead of duplicating stack data.
CREATE TABLE IF NOT EXISTS public.stack_training_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stack_candidate_id uuid REFERENCES public.stack_candidates(id) ON DELETE SET NULL,
  app_home_feed_id uuid REFERENCES public.app_home_feed(id) ON DELETE SET NULL,
  audit_id uuid REFERENCES public.stack_candidate_audit(id) ON DELETE SET NULL,
  action text NOT NULL,
  note text,
  previous_review_status text,
  new_review_status text,
  actor_id uuid,
  actor_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stack_training_feedback_candidate
  ON public.stack_training_feedback (stack_candidate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_stack_training_feedback_action
  ON public.stack_training_feedback (action, created_at DESC);

ALTER TABLE public.stack_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stack_candidate_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stack_generation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stack_training_feedback ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY stack_generation_runs_admin_all
    ON public.stack_generation_runs FOR ALL
    USING (auth.jwt()->>'email' IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY stack_candidate_audit_admin_all
    ON public.stack_candidate_audit FOR ALL
    USING (auth.jwt()->>'email' IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY stack_generation_rules_admin_all
    ON public.stack_generation_rules FOR ALL
    USING (auth.jwt()->>'email' IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY stack_generation_rules_admin_read
    ON public.stack_generation_rules FOR SELECT
    USING (auth.jwt()->>'email' IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY stack_training_feedback_admin_all
    ON public.stack_training_feedback FOR ALL
    USING (auth.jwt()->>'email' IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.fn_stack_product_key(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT trim(both '_' FROM regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '_', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.rpc_generate_auto_stack_candidates(
  p_retailer_key text DEFAULT NULL,
  p_week_of date DEFAULT date_trunc('week', now())::date,
  p_publish boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_generated int := 0;
  v_approved int := 0;
  v_needs_review int := 0;
  v_rejected int := 0;
  v_model text := 'rpc_generate_auto_stack_candidates:v1';
  v_source_tables text[] := ARRAY[
    'normalized_offers',
    'digital_coupons',
    'retailer_rules',
    'retailer_coupon_parameters',
    'stack_candidates',
    'app_home_feed'
  ];
  v_rules jsonb := '[
    {"rule":"normalized_offer_price_complete","source":"normalized_offers"},
    {"rule":"active_coupon_match","source":"digital_coupons"},
    {"rule":"retailer_rules_checked_for_stack","source":"retailer_rules"},
    {"rule":"retailer_coupon_parameters_checked","source":"retailer_coupon_parameters"},
    {"rule":"high_confidence_loads_home_feed","threshold":0.85}
  ]'::jsonb;
  r record;
  v_candidate_id uuid;
  v_home_id uuid;
  v_dedupe_key text;
  v_review_status text;
  v_validation_status text;
  v_regular int;
  v_sale int;
  v_coupon int;
  v_promo int;
  v_rebate int;
  v_final_oop int;
  v_net int;
  v_savings_pct numeric;
  v_confidence numeric;
  v_items jsonb;
  v_rules_for_row jsonb;
  v_source_offer_id text;
  v_week_of date := COALESCE(p_week_of, date_trunc('week', now())::date);
BEGIN
  INSERT INTO public.stack_generation_runs
    (retailer_key, week_of, model_function_used, status, source_tables_used, rules_applied)
  VALUES
    (p_retailer_key, v_week_of, v_model, 'running', v_source_tables, v_rules)
  RETURNING id INTO v_run_id;

  FOR r IN
    SELECT
      no.*,
      public.fn_stack_product_key(no.retailer) AS retailer_key_norm,
      dc.id AS coupon_id,
      dc.discount_cents AS matched_coupon_cents,
      dc.validation_status AS coupon_validation_status,
      EXISTS (
        SELECT 1
        FROM public.retailer_rules rr
        WHERE rr.retailer_key = public.fn_stack_product_key(no.retailer)
          AND (rr.effective_to IS NULL OR rr.effective_to >= CURRENT_DATE)
      ) AS has_retailer_rules,
      EXISTS (
        SELECT 1
        FROM public.retailer_coupon_parameters rcp
        WHERE rcp.retailer_key = public.fn_stack_product_key(no.retailer)
      ) AS has_coupon_parameters
    FROM public.normalized_offers no
    LEFT JOIN LATERAL (
      SELECT dc.*
      FROM public.digital_coupons dc
      WHERE dc.is_active = true
        AND (dc.expires_at IS NULL OR dc.expires_at > now())
        AND (
          dc.retailer_key = public.fn_stack_product_key(no.retailer)
          OR public.fn_stack_product_key(dc.retailer_key) = public.fn_stack_product_key(no.retailer)
        )
        AND (
          dc.normalized_key = public.fn_stack_product_key(no.product_name)
          OR public.fn_stack_product_key(dc.product_name) = public.fn_stack_product_key(no.product_name)
          OR lower(no.product_name) LIKE '%' || lower(dc.product_name) || '%'
          OR lower(dc.product_name) LIKE '%' || lower(no.product_name) || '%'
        )
      ORDER BY dc.discount_cents DESC NULLS LAST, dc.created_at DESC
      LIMIT 1
    ) dc ON true
    WHERE (p_retailer_key IS NULL OR public.fn_stack_product_key(no.retailer) = public.fn_stack_product_key(p_retailer_key))
  LOOP
    BEGIN
      v_source_offer_id := COALESCE(r.source_offer_id, r.id::text);
      v_regular := COALESCE(r.regular_price_cents, r.price_cents, r.final_unit_price_cents, 0);
      v_sale := COALESCE(r.final_unit_price_cents, r.price_cents, v_regular, 0);
      v_promo := GREATEST(COALESCE(v_regular, 0) - COALESCE(v_sale, 0), 0);
      v_coupon := GREATEST(COALESCE(r.matched_coupon_cents, 0), 0);
      v_rebate := GREATEST(COALESCE(
        NULLIF(r.raw_source->>'rebate_value_cents', '')::int,
        NULLIF(r.raw_source->>'rebate_cents', '')::int,
        0
      ), 0);
      v_final_oop := GREATEST(COALESCE(v_sale, 0) - v_coupon, 0);
      v_net := GREATEST(v_final_oop - v_rebate, 0);
      v_savings_pct := CASE WHEN v_regular > 0 THEN ROUND(((v_regular - v_net)::numeric / v_regular::numeric) * 100, 2) ELSE 0 END;

      v_confidence := LEAST(0.99, GREATEST(0,
        (COALESCE(r.confidence_score, 0.5) * 0.55) +
        (CASE WHEN r.coupon_id IS NOT NULL THEN 0.20 ELSE 0 END) +
        (CASE WHEN r.has_retailer_rules THEN 0.15 ELSE 0.05 END) +
        (CASE WHEN v_regular > 0 AND v_sale > 0 THEN 0.10 ELSE 0 END)
      ));

      v_review_status := CASE
        WHEN v_regular <= 0 OR v_sale <= 0 THEN 'rejected'
        WHEN v_confidence >= 0.85 AND v_savings_pct >= 15 THEN 'approved'
        ELSE 'needs_review'
      END;

      v_validation_status := CASE
        WHEN v_review_status = 'approved' THEN 'auto_approved'
        WHEN v_review_status = 'rejected' THEN 'blocked'
        ELSE 'needs_review'
      END;

      v_rules_for_row := v_rules || jsonb_build_array(jsonb_build_object(
        'coupon_id', r.coupon_id,
        'coupon_matched', r.coupon_id IS NOT NULL,
        'retailer_rules_found', r.has_retailer_rules,
        'coupon_parameters_found', r.has_coupon_parameters,
        'min_publish_savings_percent', 15
      ));

      IF v_review_status = 'rejected' THEN
        v_rejected := v_rejected + 1;
        INSERT INTO public.stack_candidate_audit
          (run_id, source_offer_id, normalized_offer_id, digital_coupon_id, retailer_key, product_name,
           source_tables_used, rules_applied, model_function_used, confidence_score, review_status,
           error_reason, price_math)
        VALUES
          (v_run_id, v_source_offer_id, r.id, r.coupon_id, r.retailer_key_norm, r.product_name,
           v_source_tables, v_rules_for_row, v_model, v_confidence, 'rejected',
           'missing_regular_or_sale_price',
           jsonb_build_object(
             'regular_price_cents', v_regular,
             'sale_price_cents', v_sale,
             'promo_discount_cents', v_promo,
             'coupon_discount_cents', v_coupon,
             'rebate_value_cents', v_rebate,
             'final_out_of_pocket_cents', v_final_oop,
             'net_price_after_rebate_cents', v_net,
             'savings_percent', v_savings_pct
           ));
        CONTINUE;
      END IF;

      v_items := jsonb_build_array(jsonb_build_object(
        'display_name', trim(concat_ws(' ', r.brand, r.product_name)),
        'product_name', r.product_name,
        'brand', r.brand,
        'category', r.category,
        'regular_price_cents', v_regular,
        'sale_price_cents', v_sale,
        'promo_discount_cents', v_promo,
        'coupon_discount_cents', v_coupon,
        'rebate_value_cents', v_rebate,
        'final_price_cents', v_final_oop,
        'net_price_after_rebate_cents', v_net,
        'coupon_id', r.coupon_id
      ));

      v_dedupe_key := concat_ws('::', 'auto_stack', r.retailer_key_norm, v_source_offer_id, v_week_of::text);

      INSERT INTO public.stack_candidates
        (retailer_key, week_of, normalized_key, dedupe_key, primary_category, primary_brand,
         stack_rank_score, savings_pct, has_coupon, items, confidence_score, confidence_pct,
         validation_status, user_badge, stack_type, final_estimated_cents, price_at_rec,
         is_active, published_at, final_out_of_pocket_cents, total_discounts_cents,
         savings_percent, item_count, source_tables_used, rules_applied, model_function_used,
         generation_timestamp, review_status, error_reason, regular_price_cents, sale_price_cents,
         promo_discount_cents, coupon_discount_cents, rebate_value_cents, net_price_after_rebate_cents)
      VALUES
        (r.retailer_key_norm, v_week_of, public.fn_stack_product_key(r.product_name), v_dedupe_key,
         r.category, r.brand, v_savings_pct, v_savings_pct, v_coupon > 0, v_items,
         v_confidence, ROUND(v_confidence * 100, 1), v_validation_status,
         CASE WHEN v_review_status = 'approved' THEN 'confirmed' ELSE 'needs_review' END,
         CASE WHEN v_coupon > 0 AND v_rebate > 0 THEN 'sale_plus_coupon_plus_rebate'
              WHEN v_coupon > 0 THEN 'sale_plus_coupon'
              ELSE COALESCE(r.deal_type, 'sale') END,
         v_net, v_sale, true,
         CASE WHEN v_review_status = 'approved' THEN now() ELSE NULL END,
         v_final_oop, v_promo + v_coupon + v_rebate, v_savings_pct, 1,
         v_source_tables, v_rules_for_row, v_model, now(), v_review_status, NULL,
         v_regular, v_sale, v_promo, v_coupon, v_rebate, v_net)
      ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO UPDATE SET
        stack_rank_score = EXCLUDED.stack_rank_score,
        savings_pct = EXCLUDED.savings_pct,
        has_coupon = EXCLUDED.has_coupon,
        items = EXCLUDED.items,
        confidence_score = EXCLUDED.confidence_score,
        confidence_pct = EXCLUDED.confidence_pct,
        validation_status = EXCLUDED.validation_status,
        user_badge = EXCLUDED.user_badge,
        stack_type = EXCLUDED.stack_type,
        final_estimated_cents = EXCLUDED.final_estimated_cents,
        price_at_rec = EXCLUDED.price_at_rec,
        published_at = EXCLUDED.published_at,
        final_out_of_pocket_cents = EXCLUDED.final_out_of_pocket_cents,
        total_discounts_cents = EXCLUDED.total_discounts_cents,
        savings_percent = EXCLUDED.savings_percent,
        source_tables_used = EXCLUDED.source_tables_used,
        rules_applied = EXCLUDED.rules_applied,
        model_function_used = EXCLUDED.model_function_used,
        generation_timestamp = EXCLUDED.generation_timestamp,
        review_status = EXCLUDED.review_status,
        error_reason = EXCLUDED.error_reason,
        regular_price_cents = EXCLUDED.regular_price_cents,
        sale_price_cents = EXCLUDED.sale_price_cents,
        promo_discount_cents = EXCLUDED.promo_discount_cents,
        coupon_discount_cents = EXCLUDED.coupon_discount_cents,
        rebate_value_cents = EXCLUDED.rebate_value_cents,
        net_price_after_rebate_cents = EXCLUDED.net_price_after_rebate_cents,
        updated_at = now()
      RETURNING id INTO v_candidate_id;

      v_generated := v_generated + 1;
      IF v_review_status = 'approved' THEN
        v_approved := v_approved + 1;
      ELSE
        v_needs_review := v_needs_review + 1;
      END IF;

      INSERT INTO public.stack_candidate_audit
        (run_id, stack_candidate_id, source_offer_id, normalized_offer_id, digital_coupon_id,
         retailer_key, product_name, source_tables_used, rules_applied, model_function_used,
         confidence_score, review_status, price_math)
      VALUES
        (v_run_id, v_candidate_id, v_source_offer_id, r.id, r.coupon_id,
         r.retailer_key_norm, r.product_name, v_source_tables, v_rules_for_row, v_model,
         v_confidence, v_review_status,
         jsonb_build_object(
           'regular_price_cents', v_regular,
           'sale_price_cents', v_sale,
           'promo_discount_cents', v_promo,
           'coupon_discount_cents', v_coupon,
           'rebate_value_cents', v_rebate,
           'final_out_of_pocket_cents', v_final_oop,
           'net_price_after_rebate_cents', v_net,
           'savings_percent', v_savings_pct
         ));

      IF p_publish AND v_review_status = 'approved' THEN
        INSERT INTO public.app_home_feed
          (stack_candidate_id, title, retailer, pay_price, original_price, save_price,
           breakdown_list, card_type, status, verification_status, validation_status,
           source_type, is_active, valid_from, valid_until, source_summary,
           stack_type, instructions, confidence, savings_percent,
           final_out_of_pocket_cents, subtotal_cents, total_discounts_cents, item_count,
           stack_rank_score, source_tables_used, rules_applied, model_function_used,
           generation_timestamp, review_status, regular_price_cents, sale_price_cents,
           promo_discount_cents, coupon_discount_cents, rebate_value_cents,
           net_price_after_rebate_cents)
        VALUES
          (v_candidate_id, initcap(replace(r.retailer_key_norm, '_', ' ')) || ' Deal Stack',
           r.retailer_key_norm, ROUND(v_final_oop::numeric / 100, 2),
           ROUND(v_regular::numeric / 100, 2),
           ROUND((v_promo + v_coupon + v_rebate)::numeric / 100, 2),
           v_items, 'stack', 'active', 'verified_live', 'system_generated_verified',
           'SNIPPD_GENERATED', true, CURRENT_DATE, CURRENT_DATE + 7,
           'SNIPPD_GENERATED', 'sale_plus_coupon',
           '["Review deal details","Clip any matching digital coupon","Verify shelf price before checkout"]'::jsonb,
           CASE WHEN v_confidence >= 0.85 THEN 'HIGH' WHEN v_confidence >= 0.65 THEN 'MEDIUM' ELSE 'LOW' END,
           v_savings_pct, v_final_oop, v_regular, v_promo + v_coupon + v_rebate, 1,
           v_savings_pct, v_source_tables, v_rules_for_row, v_model, now(), 'approved',
           v_regular, v_sale, v_promo, v_coupon, v_rebate, v_net)
        RETURNING id INTO v_home_id;

        UPDATE public.stack_candidate_audit
        SET app_home_feed_id = v_home_id
        WHERE stack_candidate_id = v_candidate_id
          AND run_id = v_run_id
          AND app_home_feed_id IS NULL;
      END IF;
    EXCEPTION WHEN others THEN
      v_rejected := v_rejected + 1;
      INSERT INTO public.stack_candidate_audit
        (run_id, source_offer_id, normalized_offer_id, retailer_key, product_name,
         source_tables_used, rules_applied, model_function_used, review_status, error_reason)
      VALUES
        (v_run_id, COALESCE(r.source_offer_id, r.id::text), r.id, public.fn_stack_product_key(r.retailer), r.product_name,
         v_source_tables, v_rules, v_model, 'rejected', SQLERRM);
    END;
  END LOOP;

  UPDATE public.stack_generation_runs
  SET status = 'completed',
      generated_count = v_generated,
      approved_count = v_approved,
      needs_review_count = v_needs_review,
      rejected_count = v_rejected,
      completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'generated_count', v_generated,
    'approved_count', v_approved,
    'needs_review_count', v_needs_review,
    'rejected_count', v_rejected
  );
EXCEPTION WHEN others THEN
  UPDATE public.stack_generation_runs
  SET status = 'failed',
      error_message = SQLERRM,
      completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object('ok', false, 'run_id', v_run_id, 'error', SQLERRM);
END;
$$;

CREATE OR REPLACE FUNCTION public.rpc_record_stack_training_feedback(
  p_stack_candidate_id uuid DEFAULT NULL,
  p_app_home_feed_id uuid DEFAULT NULL,
  p_audit_id uuid DEFAULT NULL,
  p_action text DEFAULT 'add_note',
  p_note text DEFAULT NULL,
  p_actor_id uuid DEFAULT auth.uid(),
  p_actor_email text DEFAULT auth.jwt()->>'email'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_previous text;
  v_new text;
  v_feedback_id uuid;
BEGIN
  IF p_actor_email NOT IN ('ddavis@getsnippd.com','dina@getsnippd.com','admin@getsnippd.com') THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT review_status INTO v_previous
  FROM public.stack_candidates
  WHERE id = p_stack_candidate_id;

  v_new := CASE p_action
    WHEN 'approve' THEN 'approved'
    WHEN 'reject' THEN 'rejected'
    WHEN 'needs_review' THEN 'needs_review'
    WHEN 'mark_price_wrong' THEN COALESCE(v_previous, 'needs_review')
    WHEN 'mark_coupon_missing' THEN COALESCE(v_previous, 'needs_review')
    ELSE COALESCE(v_previous, 'pending')
  END;

  INSERT INTO public.stack_training_feedback
    (stack_candidate_id, app_home_feed_id, audit_id, action, note,
     previous_review_status, new_review_status, actor_id, actor_email)
  VALUES
    (p_stack_candidate_id, p_app_home_feed_id, p_audit_id, p_action, p_note,
     v_previous, v_new, p_actor_id, p_actor_email)
  RETURNING id INTO v_feedback_id;

  IF p_action IN ('approve', 'reject', 'needs_review') AND p_stack_candidate_id IS NOT NULL THEN
    UPDATE public.stack_candidates
    SET review_status = v_new,
        validation_status = CASE
          WHEN p_action = 'approve' THEN 'auto_approved'
          WHEN p_action = 'reject' THEN 'blocked'
          ELSE 'needs_review'
        END,
        user_badge = CASE WHEN p_action = 'approve' THEN 'confirmed' ELSE 'needs_review' END,
        error_reason = CASE WHEN p_action = 'reject' THEN COALESCE(p_note, error_reason) ELSE error_reason END,
        updated_at = now()
    WHERE id = p_stack_candidate_id;
  END IF;

  IF p_action IN ('approve', 'reject', 'needs_review') AND p_app_home_feed_id IS NOT NULL THEN
    UPDATE public.app_home_feed
    SET review_status = v_new,
        validation_status = CASE
          WHEN p_action = 'approve' THEN 'system_generated_verified'
          WHEN p_action = 'reject' THEN 'rejected'
          ELSE 'pending_review'
        END,
        status = CASE WHEN p_action = 'reject' THEN 'inactive' ELSE status END,
        is_active = CASE WHEN p_action = 'reject' THEN false ELSE is_active END,
        error_reason = CASE WHEN p_action = 'reject' THEN COALESCE(p_note, error_reason) ELSE error_reason END
    WHERE id = p_app_home_feed_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'feedback_id', v_feedback_id, 'new_review_status', v_new);
END;
$$;

CREATE OR REPLACE VIEW public.v_stack_review_training_dashboard AS
SELECT
  sca.id AS audit_id,
  sca.run_id,
  sca.stack_candidate_id,
  sca.app_home_feed_id,
  sca.retailer_key,
  sca.product_name,
  sca.source_tables_used,
  sca.rules_applied,
  sca.model_function_used,
  sca.generation_timestamp,
  sca.confidence_score,
  sca.review_status,
  sca.error_reason,
  sca.price_math,
  sc.validation_status,
  sc.user_badge,
  sc.stack_type,
  sc.items,
  ahf.title AS home_feed_title,
  ahf.status AS home_feed_status,
  ahf.validation_status AS home_feed_validation_status,
  ahf.source_type AS home_feed_source_type,
  (
    SELECT count(*)
    FROM public.stack_training_feedback stf
    WHERE stf.audit_id = sca.id
       OR stf.stack_candidate_id = sca.stack_candidate_id
       OR stf.app_home_feed_id = sca.app_home_feed_id
  ) AS feedback_count,
  (
    SELECT stf.note
    FROM public.stack_training_feedback stf
    WHERE stf.audit_id = sca.id
       OR stf.stack_candidate_id = sca.stack_candidate_id
       OR stf.app_home_feed_id = sca.app_home_feed_id
    ORDER BY stf.created_at DESC
    LIMIT 1
  ) AS latest_feedback_note
FROM public.stack_candidate_audit sca
LEFT JOIN public.stack_candidates sc ON sc.id = sca.stack_candidate_id
LEFT JOIN public.app_home_feed ahf ON ahf.id = sca.app_home_feed_id
ORDER BY sca.created_at DESC;

GRANT EXECUTE ON FUNCTION public.rpc_generate_auto_stack_candidates(text, date, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_record_stack_training_feedback(uuid, uuid, uuid, text, text, uuid, text) TO authenticated, service_role;
