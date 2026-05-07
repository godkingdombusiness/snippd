-- ============================================================
-- Snippd - Stack Thinking Engine
-- Migration: 20260507_stack_thinking_engine
--
-- Backend-only stack math and budget optimization.
-- Additive only: no existing tables, columns, routes, functions, or naming
-- conventions are renamed, deleted, replaced, or restructured.
-- ============================================================

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS deal_title text,
  ADD COLUMN IF NOT EXISTS deal_type text,
  ADD COLUMN IF NOT EXISTS items_needed jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS customer_instructions text,
  ADD COLUMN IF NOT EXISTS budget_fit boolean,
  ADD COLUMN IF NOT EXISTS budget_cents int;

ALTER TABLE public.app_home_feed
  ADD COLUMN IF NOT EXISTS deal_title text,
  ADD COLUMN IF NOT EXISTS deal_type text,
  ADD COLUMN IF NOT EXISTS items_needed jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS customer_instructions text,
  ADD COLUMN IF NOT EXISTS budget_fit boolean,
  ADD COLUMN IF NOT EXISTS budget_cents int;

CREATE INDEX IF NOT EXISTS idx_stack_candidates_deal_type
  ON public.stack_candidates (deal_type, stack_rank_score DESC)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_app_home_feed_deal_type
  ON public.app_home_feed (deal_type, savings_percent DESC)
  WHERE is_active = true;

INSERT INTO public.stack_generation_rules
  (rule_key, rule_version, rule_type, rule_body, created_by)
VALUES
  (
    'stack_thinking_engine_order_of_operations',
    1,
    'scoring',
    '{
      "order_of_operations": [
        "regular_price",
        "sale_clearance_bogo_or_promo",
        "valid_store_coupon_if_allowed",
        "valid_manufacturer_coupon_if_allowed",
        "threshold_or_basket_discount",
        "rebate_after_checkout",
        "final_oop_net_savings_budget_fit",
        "beginner_customer_instructions"
      ],
      "supported_stack_types": [
        "BOGO_STACK",
        "CLEARANCE_COUPON_STACK",
        "DIGITAL_COUPON_STACK",
        "REBATE_STACK",
        "THRESHOLD_STACK",
        "BASKET_ENGINEERED_STACK"
      ]
    }'::jsonb,
    'system'
  )
ON CONFLICT (rule_key, rule_version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.fn_stack_cents_from_json(
  p_json jsonb,
  p_key text,
  p_default int DEFAULT 0
)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(p_json->>p_key, '')::numeric::int, p_default);
$$;

CREATE OR REPLACE FUNCTION public.fn_stack_money(p_cents int)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT '$' || to_char(COALESCE(p_cents, 0)::numeric / 100, 'FM999999990.00');
$$;

CREATE OR REPLACE FUNCTION public.rpc_run_stack_thinking_engine(
  p_retailer_key text DEFAULT NULL,
  p_week_of date DEFAULT date_trunc('week', now())::date,
  p_budget_cents int DEFAULT NULL,
  p_publish boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_run_id uuid;
  v_model text := 'rpc_run_stack_thinking_engine:v1';
  v_week_of date := COALESCE(p_week_of, date_trunc('week', now())::date);
  v_source_tables text[] := ARRAY[
    'normalized_offers',
    'digital_coupons',
    'retailer_rules',
    'retailer_coupon_parameters',
    'stack_candidates',
    'app_home_feed'
  ];
  v_rules jsonb := '[
    {"step":1,"rule":"start_with_regular_price"},
    {"step":2,"rule":"apply_sale_clearance_bogo_or_promo"},
    {"step":3,"rule":"apply_valid_store_coupon_if_allowed"},
    {"step":4,"rule":"apply_valid_manufacturer_coupon_if_allowed"},
    {"step":5,"rule":"apply_threshold_basket_discount_if_applicable"},
    {"step":6,"rule":"apply_rebate_after_checkout_as_net_savings"},
    {"step":7,"rule":"calculate_oop_net_savings_and_budget_fit"},
    {"step":8,"rule":"generate_beginner_customer_instructions"}
  ]'::jsonb;
  r record;
  v_candidate_id uuid;
  v_home_id uuid;
  v_updated_home_id uuid;
  v_generated int := 0;
  v_published int := 0;
  v_needs_review int := 0;
  v_rejected int := 0;
  v_results jsonb := '[]'::jsonb;
  v_error text;
BEGIN
  INSERT INTO public.stack_generation_runs
    (retailer_key, week_of, model_function_used, status, source_tables_used, rules_applied)
  VALUES
    (p_retailer_key, v_week_of, v_model, 'running', v_source_tables, v_rules)
  RETURNING id INTO v_run_id;

  FOR r IN
    WITH offer_base AS (
      SELECT
        no.*,
        public.fn_stack_product_key(no.retailer) AS retailer_key_norm,
        GREATEST(1, COALESCE(no.quantity_required, 1)) AS qty_needed,
        lower(COALESCE(no.deal_type, 'unknown')) AS normalized_deal_type,
        COALESCE(no.raw_source, '{}'::jsonb) AS raw_json
      FROM public.normalized_offers no
      WHERE p_retailer_key IS NULL
         OR public.fn_stack_product_key(no.retailer) = public.fn_stack_product_key(p_retailer_key)
    )
    SELECT
      ob.*,
      store_coupon.id AS store_coupon_id,
      COALESCE(store_coupon.discount_cents, 0) AS store_coupon_cents,
      manufacturer_coupon.id AS manufacturer_coupon_id,
      COALESCE(manufacturer_coupon.discount_cents, 0) AS manufacturer_coupon_cents,
      COALESCE(threshold_params.threshold_cents, public.fn_stack_cents_from_json(ob.raw_json, 'threshold_cents', 0)) AS threshold_cents,
      COALESCE(threshold_params.threshold_discount_cents, public.fn_stack_cents_from_json(ob.raw_json, 'threshold_discount_cents', 0)) AS threshold_discount_cents,
      EXISTS (
        SELECT 1
        FROM public.retailer_rules rr
        WHERE rr.retailer_key = ob.retailer_key_norm
          AND (rr.effective_to IS NULL OR rr.effective_to >= CURRENT_DATE)
      ) AS has_retailer_rules,
      COALESCE(coupon_policy.allowed_types, ARRAY['digital','store','manufacturer']) AS allowed_coupon_types
    FROM offer_base ob
    LEFT JOIN LATERAL (
      SELECT array_agg(lower(policy_allowed.value) ORDER BY lower(policy_allowed.value)) AS allowed_types
      FROM public.retailer_coupon_parameters rcp,
           jsonb_array_elements_text(COALESCE(rcp.policy_value->'value', rcp.policy_value->'allowed_coupon_types', '[]'::jsonb)) AS policy_allowed(value)
      WHERE rcp.retailer_key = ob.retailer_key_norm
        AND rcp.policy_key = 'allowed_coupon_types'
    ) coupon_policy ON true
    LEFT JOIN LATERAL (
      SELECT
        MAX(CASE WHEN rcp.policy_key = 'threshold_cents'
          THEN COALESCE(NULLIF(rcp.policy_value->>'value','')::numeric::int, 0) ELSE 0 END) AS threshold_cents,
        MAX(CASE WHEN rcp.policy_key = 'threshold_discount_cents'
          THEN COALESCE(NULLIF(rcp.policy_value->>'value','')::numeric::int, 0) ELSE 0 END) AS threshold_discount_cents
      FROM public.retailer_coupon_parameters rcp
      WHERE rcp.retailer_key = ob.retailer_key_norm
        AND rcp.policy_key IN ('threshold_cents', 'threshold_discount_cents')
    ) threshold_params ON true
    LEFT JOIN LATERAL (
      SELECT dc.*
      FROM public.digital_coupons dc
      WHERE dc.is_active = true
        AND (dc.expires_at IS NULL OR dc.expires_at > now())
        AND public.fn_stack_product_key(dc.retailer_key) = ob.retailer_key_norm
        AND lower(COALESCE(dc.coupon_type, 'digital')) IN ('digital','store')
        AND lower(COALESCE(dc.coupon_type, 'digital')) = ANY(COALESCE(coupon_policy.allowed_types, ARRAY['digital','store','manufacturer']))
        AND (
          dc.normalized_key = public.fn_stack_product_key(ob.product_name)
          OR public.fn_stack_product_key(dc.product_name) = public.fn_stack_product_key(ob.product_name)
          OR lower(ob.product_name) LIKE '%' || lower(dc.product_name) || '%'
          OR lower(dc.product_name) LIKE '%' || lower(ob.product_name) || '%'
        )
      ORDER BY dc.discount_cents DESC NULLS LAST, dc.created_at DESC
      LIMIT 1
    ) store_coupon ON true
    LEFT JOIN LATERAL (
      SELECT dc.*
      FROM public.digital_coupons dc
      WHERE dc.is_active = true
        AND (dc.expires_at IS NULL OR dc.expires_at > now())
        AND public.fn_stack_product_key(dc.retailer_key) = ob.retailer_key_norm
        AND lower(COALESCE(dc.coupon_type, 'digital')) = 'manufacturer'
        AND 'manufacturer' = ANY(COALESCE(coupon_policy.allowed_types, ARRAY['digital','store','manufacturer']))
        AND (
          dc.normalized_key = public.fn_stack_product_key(ob.product_name)
          OR public.fn_stack_product_key(dc.product_name) = public.fn_stack_product_key(ob.product_name)
          OR lower(ob.product_name) LIKE '%' || lower(dc.product_name) || '%'
          OR lower(dc.product_name) LIKE '%' || lower(ob.product_name) || '%'
        )
      ORDER BY dc.discount_cents DESC NULLS LAST, dc.created_at DESC
      LIMIT 1
    ) manufacturer_coupon ON true
  LOOP
    DECLARE
      v_source_offer_id text := COALESCE(r.source_offer_id, r.id::text);
      v_unit_regular int := COALESCE(r.regular_price_cents, r.price_cents, r.final_unit_price_cents, 0);
      v_unit_sale int := COALESCE(r.final_unit_price_cents, r.price_cents, r.regular_price_cents, 0);
      v_quantity int := CASE WHEN r.normalized_deal_type = 'bogo' THEN GREATEST(2, r.qty_needed) ELSE r.qty_needed END;
      v_regular int;
      v_sale int;
      v_sale_discount int;
      v_promo_discount int;
      v_store_coupon int;
      v_manufacturer_coupon int;
      v_coupon_value int;
      v_threshold_discount int;
      v_rebate int;
      v_final_oop int;
      v_net int;
      v_savings_pct numeric;
      v_stack_type text;
      v_deal_title text;
      v_budget_fit boolean;
      v_confidence numeric;
      v_review_status text;
      v_validation_status text;
      v_items_needed jsonb;
      v_customer_instructions text;
      v_result jsonb;
      v_dedupe_key text;
      v_rules_for_row jsonb;
    BEGIN
      v_regular := GREATEST(v_unit_regular * v_quantity, 0);
      v_sale := CASE
        WHEN r.normalized_deal_type = 'bogo' THEN GREATEST(v_unit_regular * (v_quantity - 1), 0)
        ELSE GREATEST(v_unit_sale * v_quantity, 0)
      END;
      v_sale_discount := GREATEST(v_regular - v_sale, 0);
      v_promo_discount := GREATEST(public.fn_stack_cents_from_json(r.raw_json, 'promo_discount_cents', 0), 0);
      v_store_coupon := GREATEST(COALESCE(r.store_coupon_cents, 0), 0);
      v_manufacturer_coupon := GREATEST(COALESCE(r.manufacturer_coupon_cents, 0), 0);
      v_coupon_value := v_store_coupon + v_manufacturer_coupon;
      v_threshold_discount := CASE
        WHEN COALESCE(r.threshold_cents, 0) > 0
         AND COALESCE(r.threshold_discount_cents, 0) > 0
         AND v_sale >= r.threshold_cents
        THEN r.threshold_discount_cents
        ELSE 0
      END;
      v_rebate := GREATEST(COALESCE(
        NULLIF(r.raw_json->>'rebate_value_cents', '')::numeric::int,
        NULLIF(r.raw_json->>'rebate_cents', '')::numeric::int,
        0
      ), 0);
      v_final_oop := GREATEST(v_sale - v_promo_discount - v_store_coupon - v_manufacturer_coupon - v_threshold_discount, 0);
      v_net := GREATEST(v_final_oop - v_rebate, 0);
      v_savings_pct := CASE WHEN v_regular > 0 THEN ROUND(((v_regular - v_net)::numeric / v_regular::numeric) * 100, 2) ELSE 0 END;
      v_budget_fit := CASE WHEN p_budget_cents IS NULL THEN NULL ELSE v_final_oop <= p_budget_cents END;

      v_stack_type := CASE
        WHEN r.normalized_deal_type = 'bogo' THEN 'BOGO_STACK'
        WHEN r.normalized_deal_type = 'clearance' AND v_coupon_value > 0 THEN 'CLEARANCE_COUPON_STACK'
        WHEN v_rebate > 0 THEN 'REBATE_STACK'
        WHEN v_threshold_discount > 0 THEN 'THRESHOLD_STACK'
        WHEN v_coupon_value > 0 THEN 'DIGITAL_COUPON_STACK'
        ELSE 'BASKET_ENGINEERED_STACK'
      END;

      v_deal_title := initcap(replace(r.retailer_key_norm, '_', ' ')) || ' ' ||
        CASE
          WHEN v_stack_type = 'BOGO_STACK' THEN 'BOGO Deal Stack'
          WHEN v_stack_type = 'CLEARANCE_COUPON_STACK' THEN 'Clearance Coupon Stack'
          WHEN v_stack_type = 'REBATE_STACK' THEN 'Rebate Deal Stack'
          WHEN v_stack_type = 'THRESHOLD_STACK' THEN 'Threshold Deal Stack'
          WHEN v_stack_type = 'DIGITAL_COUPON_STACK' THEN 'Digital Coupon Stack'
          ELSE 'Basket Engineered Stack'
        END;

      v_items_needed := jsonb_build_array(jsonb_build_object(
        'product_name', r.product_name,
        'brand', r.brand,
        'category', r.category,
        'quantity', v_quantity,
        'regular_price_cents', v_regular,
        'sale_price_cents', v_sale,
        'store_coupon_id', r.store_coupon_id,
        'manufacturer_coupon_id', r.manufacturer_coupon_id
      ));

      v_customer_instructions := concat(
        'Buy ', v_quantity, ' ', trim(concat_ws(' ', r.brand, r.product_name)), ', ',
        CASE WHEN v_coupon_value > 0 THEN 'clip the matching digital coupon, ' ELSE 'use the sale price, ' END,
        'use your loyalty account',
        CASE WHEN v_rebate > 0 THEN ', submit to the listed rebate app' ELSE '' END,
        ', final price is ', public.fn_stack_money(v_final_oop), '.'
      );

      v_confidence := LEAST(0.99, GREATEST(0,
        (COALESCE(r.confidence_score, 0.5) * 0.45) +
        (CASE WHEN v_regular > 0 AND v_sale > 0 THEN 0.20 ELSE 0 END) +
        (CASE WHEN r.has_retailer_rules THEN 0.10 ELSE 0.04 END) +
        (CASE WHEN v_coupon_value > 0 THEN 0.15 ELSE 0 END) +
        (CASE WHEN v_savings_pct > 0 THEN 0.10 ELSE 0 END)
      ));

      v_review_status := CASE
        WHEN v_regular <= 0 OR v_sale <= 0 THEN 'rejected'
        WHEN v_confidence >= 0.85 AND v_savings_pct >= 10 THEN 'approved'
        ELSE 'needs_review'
      END;
      v_validation_status := CASE
        WHEN v_review_status = 'approved' THEN 'auto_approved'
        WHEN v_review_status = 'rejected' THEN 'blocked'
        ELSE 'needs_review'
      END;
      v_error := CASE WHEN v_review_status = 'rejected' THEN 'missing_regular_or_sale_price' ELSE NULL END;
      v_dedupe_key := concat_ws('::', 'stack_thinking_engine', r.retailer_key_norm, v_source_offer_id, v_week_of::text);
      v_rules_for_row := v_rules || jsonb_build_array(jsonb_build_object(
        'stack_type', v_stack_type,
        'allowed_coupon_types', r.allowed_coupon_types,
        'store_coupon_id', r.store_coupon_id,
        'manufacturer_coupon_id', r.manufacturer_coupon_id,
        'threshold_discount_cents', v_threshold_discount
      ));

      v_result := jsonb_build_object(
        'store', r.retailer_key_norm,
        'deal_title', v_deal_title,
        'deal_type', v_stack_type,
        'items_needed', v_items_needed,
        'regular_price', ROUND(v_regular::numeric / 100, 2),
        'sale_price', ROUND(v_sale::numeric / 100, 2),
        'coupon_value', ROUND(v_coupon_value::numeric / 100, 2),
        'rebate_value', ROUND(v_rebate::numeric / 100, 2),
        'final_out_of_pocket', ROUND(v_final_oop::numeric / 100, 2),
        'net_price_after_rebate', ROUND(v_net::numeric / 100, 2),
        'savings_percent', v_savings_pct,
        'confidence_score', ROUND(v_confidence, 4),
        'expiration_date', COALESCE(NULLIF(r.raw_json->>'expiration_date', '')::date, NULLIF(r.raw_json->>'valid_until', '')::date, CURRENT_DATE + 7),
        'budget_fit', v_budget_fit,
        'customer_instructions', v_customer_instructions
      );

      IF v_review_status = 'rejected' THEN
        v_rejected := v_rejected + 1;
        INSERT INTO public.stack_candidate_audit
          (run_id, source_offer_id, normalized_offer_id, digital_coupon_id, retailer_key, product_name,
           source_tables_used, rules_applied, model_function_used, confidence_score, review_status,
           error_reason, price_math)
        VALUES
          (v_run_id, v_source_offer_id, r.id, COALESCE(r.store_coupon_id, r.manufacturer_coupon_id),
           r.retailer_key_norm, r.product_name, v_source_tables, v_rules_for_row, v_model,
           v_confidence, v_review_status, v_error, v_result);
        CONTINUE;
      END IF;

      INSERT INTO public.stack_candidates
        (retailer_key, week_of, normalized_key, dedupe_key, primary_category, primary_brand,
         stack_rank_score, savings_pct, has_coupon, items, confidence_score, confidence_pct,
         validation_status, user_badge, stack_type, deal_type, deal_title, items_needed,
         customer_instructions, final_estimated_cents, price_at_rec, is_active, published_at,
         final_out_of_pocket_cents, total_discounts_cents, savings_percent, item_count,
         source_tables_used, rules_applied, model_function_used, generation_timestamp,
         review_status, error_reason, regular_price_cents, sale_price_cents,
         promo_discount_cents, coupon_discount_cents, rebate_value_cents,
         net_price_after_rebate_cents, budget_fit, budget_cents)
      VALUES
        (r.retailer_key_norm, v_week_of, public.fn_stack_product_key(r.product_name), v_dedupe_key,
         r.category, r.brand, v_savings_pct, v_savings_pct, v_coupon_value > 0, v_items_needed,
         v_confidence, ROUND(v_confidence * 100, 1), v_validation_status,
         CASE WHEN v_review_status = 'approved' THEN 'confirmed' ELSE 'needs_review' END,
         v_stack_type, v_stack_type, v_deal_title, v_items_needed, v_customer_instructions,
         v_net, v_sale, true, CASE WHEN v_review_status = 'approved' THEN now() ELSE NULL END,
         v_final_oop, v_sale_discount + v_promo_discount + v_coupon_value + v_threshold_discount + v_rebate,
         v_savings_pct, v_quantity, v_source_tables, v_rules_for_row, v_model, now(),
         v_review_status, v_error, v_regular, v_sale, v_promo_discount,
         v_coupon_value, v_rebate, v_net, v_budget_fit, p_budget_cents)
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
        deal_type = EXCLUDED.deal_type,
        deal_title = EXCLUDED.deal_title,
        items_needed = EXCLUDED.items_needed,
        customer_instructions = EXCLUDED.customer_instructions,
        final_estimated_cents = EXCLUDED.final_estimated_cents,
        price_at_rec = EXCLUDED.price_at_rec,
        published_at = EXCLUDED.published_at,
        final_out_of_pocket_cents = EXCLUDED.final_out_of_pocket_cents,
        total_discounts_cents = EXCLUDED.total_discounts_cents,
        savings_percent = EXCLUDED.savings_percent,
        item_count = EXCLUDED.item_count,
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
        budget_fit = EXCLUDED.budget_fit,
        budget_cents = EXCLUDED.budget_cents,
        updated_at = now()
      RETURNING id INTO v_candidate_id;

      v_generated := v_generated + 1;
      IF v_review_status = 'approved' THEN
        v_published := v_published + 1;
      ELSE
        v_needs_review := v_needs_review + 1;
      END IF;

      INSERT INTO public.stack_candidate_audit
        (run_id, stack_candidate_id, source_offer_id, normalized_offer_id, digital_coupon_id,
         retailer_key, product_name, source_tables_used, rules_applied, model_function_used,
         confidence_score, review_status, error_reason, price_math)
      VALUES
        (v_run_id, v_candidate_id, v_source_offer_id, r.id, COALESCE(r.store_coupon_id, r.manufacturer_coupon_id),
         r.retailer_key_norm, r.product_name, v_source_tables, v_rules_for_row, v_model,
         v_confidence, v_review_status, v_error, v_result);

      IF p_publish AND v_review_status = 'approved' THEN
        v_updated_home_id := NULL;
        UPDATE public.app_home_feed
        SET title = v_deal_title,
            deal_title = v_deal_title,
            deal_type = v_stack_type,
            retailer = r.retailer_key_norm,
            pay_price = ROUND(v_final_oop::numeric / 100, 2),
            original_price = ROUND(v_regular::numeric / 100, 2),
            save_price = ROUND((v_regular - v_net)::numeric / 100, 2),
            breakdown_list = v_items_needed,
            items_needed = v_items_needed,
            customer_instructions = v_customer_instructions,
            card_type = 'stack',
            status = 'active',
            verification_status = 'verified_live',
            validation_status = 'system_generated_verified',
            source_type = 'SNIPPD_GENERATED',
            is_active = true,
            valid_from = CURRENT_DATE,
            valid_until = COALESCE(NULLIF(r.raw_json->>'expiration_date', '')::date, NULLIF(r.raw_json->>'valid_until', '')::date, CURRENT_DATE + 7),
            source_summary = 'SNIPPD_GENERATED',
            stack_type = v_stack_type,
            instructions = jsonb_build_array(v_customer_instructions),
            confidence = CASE WHEN v_confidence >= 0.85 THEN 'HIGH' WHEN v_confidence >= 0.65 THEN 'MEDIUM' ELSE 'LOW' END,
            savings_percent = v_savings_pct,
            final_out_of_pocket_cents = v_final_oop,
            subtotal_cents = v_regular,
            total_discounts_cents = v_regular - v_net,
            item_count = v_quantity,
            stack_rank_score = v_savings_pct,
            source_tables_used = v_source_tables,
            rules_applied = v_rules_for_row,
            model_function_used = v_model,
            generation_timestamp = now(),
            review_status = 'approved',
            error_reason = NULL,
            regular_price_cents = v_regular,
            sale_price_cents = v_sale,
            promo_discount_cents = v_promo_discount,
            coupon_discount_cents = v_coupon_value,
            rebate_value_cents = v_rebate,
            net_price_after_rebate_cents = v_net,
            budget_fit = v_budget_fit,
            budget_cents = p_budget_cents
        WHERE stack_candidate_id = v_candidate_id
        RETURNING id INTO v_updated_home_id;

        IF v_updated_home_id IS NULL THEN
          INSERT INTO public.app_home_feed
            (stack_candidate_id, title, deal_title, deal_type, retailer, pay_price,
             original_price, save_price, breakdown_list, items_needed,
             customer_instructions, card_type, status, verification_status,
             validation_status, source_type, is_active, valid_from, valid_until,
             source_summary, stack_type, instructions, confidence, savings_percent,
             final_out_of_pocket_cents, subtotal_cents, total_discounts_cents,
             item_count, stack_rank_score, source_tables_used, rules_applied,
             model_function_used, generation_timestamp, review_status,
             regular_price_cents, sale_price_cents, promo_discount_cents,
             coupon_discount_cents, rebate_value_cents, net_price_after_rebate_cents,
             budget_fit, budget_cents)
          VALUES
            (v_candidate_id, v_deal_title, v_deal_title, v_stack_type, r.retailer_key_norm,
             ROUND(v_final_oop::numeric / 100, 2), ROUND(v_regular::numeric / 100, 2),
             ROUND((v_regular - v_net)::numeric / 100, 2), v_items_needed,
             v_items_needed, v_customer_instructions, 'stack', 'active', 'verified_live',
             'system_generated_verified', 'SNIPPD_GENERATED', true, CURRENT_DATE,
             COALESCE(NULLIF(r.raw_json->>'expiration_date', '')::date, NULLIF(r.raw_json->>'valid_until', '')::date, CURRENT_DATE + 7),
             'SNIPPD_GENERATED', v_stack_type, jsonb_build_array(v_customer_instructions),
             CASE WHEN v_confidence >= 0.85 THEN 'HIGH' WHEN v_confidence >= 0.65 THEN 'MEDIUM' ELSE 'LOW' END,
             v_savings_pct, v_final_oop, v_regular, v_regular - v_net, v_quantity,
             v_savings_pct, v_source_tables, v_rules_for_row, v_model, now(),
             'approved', v_regular, v_sale, v_promo_discount, v_coupon_value,
             v_rebate, v_net, v_budget_fit, p_budget_cents)
          RETURNING id INTO v_home_id;
        ELSE
          v_home_id := v_updated_home_id;
        END IF;

        UPDATE public.stack_candidate_audit
        SET app_home_feed_id = v_home_id
        WHERE run_id = v_run_id
          AND stack_candidate_id = v_candidate_id
          AND app_home_feed_id IS NULL;
      END IF;

      v_results := v_results || jsonb_build_array(v_result);
    EXCEPTION WHEN others THEN
      v_rejected := v_rejected + 1;
      INSERT INTO public.stack_candidate_audit
        (run_id, source_offer_id, normalized_offer_id, retailer_key, product_name,
         source_tables_used, rules_applied, model_function_used, review_status, error_reason)
      VALUES
        (v_run_id, COALESCE(r.source_offer_id, r.id::text), r.id, r.retailer_key_norm,
         r.product_name, v_source_tables, v_rules, v_model, 'rejected', SQLERRM);
    END;
  END LOOP;

  UPDATE public.stack_generation_runs
  SET status = 'completed',
      generated_count = v_generated,
      approved_count = v_published,
      needs_review_count = v_needs_review,
      rejected_count = v_rejected,
      completed_at = now()
  WHERE id = v_run_id;

  RETURN jsonb_build_object(
    'ok', true,
    'run_id', v_run_id,
    'model_function_used', v_model,
    'generated_count', v_generated,
    'published_count', v_published,
    'needs_review_count', v_needs_review,
    'rejected_count', v_rejected,
    'results', v_results
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

CREATE OR REPLACE FUNCTION public.rpc_build_budget_stack_plan(
  p_budget_cents int DEFAULT 5000,
  p_retailer_key text DEFAULT NULL,
  p_limit int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r record;
  v_remaining int := GREATEST(COALESCE(p_budget_cents, 5000), 0);
  v_total_oop int := 0;
  v_total_net int := 0;
  v_total_regular int := 0;
  v_plan jsonb := '[]'::jsonb;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT
      sc.id,
      sc.retailer_key,
      sc.deal_title,
      sc.deal_type,
      sc.items_needed,
      sc.regular_price_cents,
      sc.sale_price_cents,
      sc.coupon_discount_cents,
      sc.rebate_value_cents,
      sc.final_out_of_pocket_cents,
      sc.net_price_after_rebate_cents,
      sc.savings_percent,
      sc.confidence_score,
      sc.customer_instructions
    FROM public.stack_candidates sc
    WHERE sc.is_active = true
      AND sc.review_status = 'approved'
      AND sc.validation_status IN ('auto_approved', 'approved')
      AND sc.final_out_of_pocket_cents IS NOT NULL
      AND (p_retailer_key IS NULL OR sc.retailer_key = public.fn_stack_product_key(p_retailer_key))
    ORDER BY sc.savings_percent DESC NULLS LAST, sc.confidence_score DESC NULLS LAST
    LIMIT GREATEST(COALESCE(p_limit, 20), 1)
  LOOP
    IF r.final_out_of_pocket_cents <= v_remaining THEN
      v_plan := v_plan || jsonb_build_array(jsonb_build_object(
        'stack_candidate_id', r.id,
        'store', r.retailer_key,
        'deal_title', r.deal_title,
        'deal_type', r.deal_type,
        'items_needed', r.items_needed,
        'regular_price', ROUND(COALESCE(r.regular_price_cents, 0)::numeric / 100, 2),
        'sale_price', ROUND(COALESCE(r.sale_price_cents, 0)::numeric / 100, 2),
        'coupon_value', ROUND(COALESCE(r.coupon_discount_cents, 0)::numeric / 100, 2),
        'rebate_value', ROUND(COALESCE(r.rebate_value_cents, 0)::numeric / 100, 2),
        'final_out_of_pocket', ROUND(COALESCE(r.final_out_of_pocket_cents, 0)::numeric / 100, 2),
        'net_price_after_rebate', ROUND(COALESCE(r.net_price_after_rebate_cents, r.final_out_of_pocket_cents, 0)::numeric / 100, 2),
        'savings_percent', r.savings_percent,
        'confidence_score', r.confidence_score,
        'budget_fit', true,
        'customer_instructions', r.customer_instructions
      ));
      v_remaining := v_remaining - r.final_out_of_pocket_cents;
      v_total_oop := v_total_oop + COALESCE(r.final_out_of_pocket_cents, 0);
      v_total_net := v_total_net + COALESCE(r.net_price_after_rebate_cents, r.final_out_of_pocket_cents, 0);
      v_total_regular := v_total_regular + COALESCE(r.regular_price_cents, 0);
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'budget_cents', p_budget_cents,
    'budget', ROUND(COALESCE(p_budget_cents, 0)::numeric / 100, 2),
    'remaining_cents', v_remaining,
    'remaining_budget', ROUND(v_remaining::numeric / 100, 2),
    'stack_count', v_count,
    'total_final_out_of_pocket', ROUND(v_total_oop::numeric / 100, 2),
    'total_net_after_rebates', ROUND(v_total_net::numeric / 100, 2),
    'total_regular_price', ROUND(v_total_regular::numeric / 100, 2),
    'total_savings_percent', CASE WHEN v_total_regular > 0 THEN ROUND(((v_total_regular - v_total_net)::numeric / v_total_regular::numeric) * 100, 2) ELSE 0 END,
    'shopping_plan', v_plan
  );
END;
$$;

CREATE OR REPLACE VIEW public.v_stack_thinking_engine_results AS
SELECT
  sc.retailer_key AS store,
  sc.deal_title,
  sc.deal_type,
  sc.items_needed,
  ROUND(COALESCE(sc.regular_price_cents, 0)::numeric / 100, 2) AS regular_price,
  ROUND(COALESCE(sc.sale_price_cents, 0)::numeric / 100, 2) AS sale_price,
  ROUND(COALESCE(sc.coupon_discount_cents, 0)::numeric / 100, 2) AS coupon_value,
  ROUND(COALESCE(sc.rebate_value_cents, 0)::numeric / 100, 2) AS rebate_value,
  ROUND(COALESCE(sc.final_out_of_pocket_cents, 0)::numeric / 100, 2) AS final_out_of_pocket,
  ROUND(COALESCE(sc.net_price_after_rebate_cents, sc.final_out_of_pocket_cents, 0)::numeric / 100, 2) AS net_price_after_rebate,
  sc.savings_percent,
  sc.confidence_score,
  COALESCE(ahf.valid_until, sc.week_of + 7) AS expiration_date,
  sc.customer_instructions,
  sc.budget_fit,
  sc.budget_cents,
  sc.id AS stack_candidate_id,
  ahf.id AS app_home_feed_id
FROM public.stack_candidates sc
LEFT JOIN public.app_home_feed ahf ON ahf.stack_candidate_id = sc.id
WHERE sc.is_active = true
  AND sc.review_status IN ('approved', 'needs_review')
ORDER BY sc.stack_rank_score DESC NULLS LAST, sc.confidence_score DESC NULLS LAST;

GRANT EXECUTE ON FUNCTION public.rpc_run_stack_thinking_engine(text, date, int, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rpc_build_budget_stack_plan(int, text, int) TO authenticated, service_role;
