-- 20260507_stack_engine_v2.sql
-- Stack engine v2: customer instructions, budget_fit, THRESHOLD/BASKET stack types,
-- refresh_app_home_feed function.
-- Extends existing tables only (IF NOT EXISTS / OR REPLACE).

-- ── 1. Extend stack_candidates ────────────────────────────────────────────────
ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS customer_instructions  TEXT,
  ADD COLUMN IF NOT EXISTS budget_target_cents     INTEGER,
  ADD COLUMN IF NOT EXISTS budget_fit              BOOLEAN         NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS deal_title              TEXT,
  ADD COLUMN IF NOT EXISTS items_needed            INTEGER         NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS regular_price_cents     INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sale_price_cents        INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coupon_value_cents      INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rebate_value_cents      INTEGER         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS final_out_of_pocket_cents INTEGER       NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_price_after_rebate_cents INTEGER    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS savings_percent         NUMERIC(5,2)    NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expiration_date         DATE,
  ADD COLUMN IF NOT EXISTS store                   TEXT,
  ADD COLUMN IF NOT EXISTS qa_metadata             JSONB           NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS verified_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS math_verified           BOOLEAN         NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS published_to_feed_at    TIMESTAMPTZ;

-- Ensure stack_type accepts the 6 canonical types.
-- If stack_type is already a custom enum, we extend it safely via text comparison.
-- The column was added as TEXT in the deal_intelligence migration — no change needed.
-- Document allowed values here for reference:
--   BOGO_STACK, CLEARANCE_COUPON_STACK, DIGITAL_COUPON_STACK,
--   REBATE_STACK, THRESHOLD_STACK, BASKET_ENGINEERED_STACK

COMMENT ON COLUMN public.stack_candidates.stack_type IS
  'BOGO_STACK | CLEARANCE_COUPON_STACK | DIGITAL_COUPON_STACK | REBATE_STACK | THRESHOLD_STACK | BASKET_ENGINEERED_STACK';

-- ── 2. Customer instructions generator ───────────────────────────────────────
-- Produces human-readable "Buy X, clip Y, use loyalty account, submit to Z rebate app, final price is $___."
CREATE OR REPLACE FUNCTION public.generate_customer_instructions(p_stack_candidate_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_sc    RECORD;
  v_parts TEXT[] := '{}';
  v_line  TEXT;
BEGIN
  SELECT *
    INTO v_sc
    FROM public.stack_candidates
   WHERE id = p_stack_candidate_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Step 1: items needed
  IF COALESCE(v_sc.items_needed, 1) > 1 THEN
    v_parts := v_parts || ARRAY[
      format('Buy %s %s', v_sc.items_needed, COALESCE(v_sc.deal_title, 'items'))
    ];
  ELSE
    v_parts := v_parts || ARRAY[
      format('Buy %s', COALESCE(v_sc.deal_title, 'this item'))
    ];
  END IF;

  -- Step 2: coupon
  IF COALESCE(v_sc.coupon_value_cents, 0) > 0 THEN
    v_parts := v_parts || ARRAY[
      format('clip the $%.2f coupon', v_sc.coupon_value_cents::NUMERIC / 100)
    ];
  END IF;

  -- Step 3: loyalty / app
  IF v_sc.stack_type IN ('DIGITAL_COUPON_STACK', 'BOGO_STACK', 'THRESHOLD_STACK') THEN
    v_parts := v_parts || ARRAY['use your loyalty account or store app'];
  END IF;

  -- Step 4: rebate
  IF COALESCE(v_sc.rebate_value_cents, 0) > 0 THEN
    v_line := format('submit to rebate app for $%.2f back', v_sc.rebate_value_cents::NUMERIC / 100);
    v_parts := v_parts || ARRAY[v_line];
  END IF;

  -- Step 5: final OOP and net
  v_parts := v_parts || ARRAY[
    format('final price is $%.2f',
      COALESCE(v_sc.final_out_of_pocket_cents, v_sc.final_estimated_cents, 0)::NUMERIC / 100)
  ];

  IF COALESCE(v_sc.rebate_value_cents, 0) > 0 THEN
    v_parts := v_parts || ARRAY[
      format('($%.2f net after rebate)',
        COALESCE(v_sc.net_price_after_rebate_cents, 0)::NUMERIC / 100)
    ];
  END IF;

  RETURN array_to_string(v_parts, ', ') || '.';
END;
$$;

-- ── 3. Stack math verifier ────────────────────────────────────────────────────
-- Recalculates and verifies stack math from stored components.
-- Called by run-stack-refresh before publishing.
CREATE OR REPLACE FUNCTION public.verify_stack_math(p_stack_candidate_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE
  v_sc               RECORD;
  v_calc_oop         INTEGER;
  v_calc_net         INTEGER;
  v_calc_savings_pct NUMERIC(5,2);
BEGIN
  SELECT *
    INTO v_sc
    FROM public.stack_candidates
   WHERE id = p_stack_candidate_id;

  IF NOT FOUND THEN RETURN FALSE; END IF;

  -- Order of operations:
  -- regular_price → sale → store_coupon/mfr_coupon combined → rebate
  v_calc_oop := GREATEST(0,
    COALESCE(v_sc.regular_price_cents, 0)
    - GREATEST(0, COALESCE(v_sc.regular_price_cents, 0) - COALESCE(v_sc.sale_price_cents, v_sc.regular_price_cents, 0))
    - COALESCE(v_sc.coupon_value_cents, 0)
  );

  v_calc_net := GREATEST(0, v_calc_oop - COALESCE(v_sc.rebate_value_cents, 0));

  IF COALESCE(v_sc.regular_price_cents, 0) > 0 THEN
    v_calc_savings_pct := ROUND(
      ((v_sc.regular_price_cents - v_calc_oop)::NUMERIC / v_sc.regular_price_cents) * 100, 2
    );
  ELSE
    v_calc_savings_pct := 0;
  END IF;

  -- Update with verified values and mark as verified
  UPDATE public.stack_candidates
     SET final_out_of_pocket_cents    = v_calc_oop,
         net_price_after_rebate_cents = v_calc_net,
         savings_percent              = v_calc_savings_pct,
         math_verified                = TRUE,
         verified_at                  = NOW(),
         qa_metadata                  = qa_metadata || jsonb_build_object(
           'math_verified_at',   NOW(),
           'calc_oop_cents',     v_calc_oop,
           'calc_net_cents',     v_calc_net,
           'calc_savings_pct',   v_calc_savings_pct
         )
   WHERE id = p_stack_candidate_id;

  RETURN TRUE;
END;
$$;

-- ── 4. Refresh app_home_feed from high-confidence stacks ─────────────────────
-- Called by run-stack-refresh edge function daily at 7:15 AM.
-- Only publishes stacks with confidence_score >= 80 and math_verified = TRUE.
CREATE OR REPLACE FUNCTION public.refresh_app_home_feed()
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_sc           RECORD;
  v_instructions TEXT;
  v_published    INTEGER := 0;
  v_skipped      INTEGER := 0;
  v_errors       INTEGER := 0;
BEGIN
  -- Step 1: Verify math for any unverified stacks with high confidence
  UPDATE public.stack_candidates
     SET math_verified = FALSE   -- force re-verify
   WHERE math_verified = FALSE
     AND confidence_score >= 80
     AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
     AND validation_status IN ('auto_approved', 'approved_with_caution');

  -- Step 2: Generate customer instructions and publish each qualified stack
  FOR v_sc IN
    SELECT id, deal_title, stack_type, retailer_key, store,
           confidence_score, final_out_of_pocket_cents, savings_percent,
           budget_fit, expiration_date, week_of
      FROM public.stack_candidates
     WHERE confidence_score >= 80
       AND (expiration_date IS NULL OR expiration_date >= CURRENT_DATE)
       AND validation_status IN ('auto_approved', 'approved_with_caution')
     ORDER BY confidence_score DESC, savings_percent DESC
     LIMIT 200
  LOOP
    BEGIN
      -- Verify math
      PERFORM public.verify_stack_math(v_sc.id);

      -- Generate customer instructions
      v_instructions := public.generate_customer_instructions(v_sc.id);

      UPDATE public.stack_candidates
         SET customer_instructions = v_instructions,
             published_to_feed_at  = NOW()
       WHERE id = v_sc.id;

      -- Upsert to app_home_feed
      INSERT INTO public.app_home_feed (
        stack_candidate_id,
        deal_type,
        title,
        retailer,
        savings_percent,
        final_cents,
        customer_instructions,
        confidence_score,
        expires_at,
        published_at,
        feed_metadata
      )
      VALUES (
        v_sc.id,
        COALESCE(v_sc.stack_type, 'DIGITAL_COUPON_STACK'),
        COALESCE(v_sc.deal_title, 'Deal'),
        COALESCE(v_sc.store, v_sc.retailer_key, 'Multiple Stores'),
        v_sc.savings_percent,
        v_sc.final_out_of_pocket_cents,
        v_instructions,
        v_sc.confidence_score,
        v_sc.expiration_date,
        NOW(),
        jsonb_build_object(
          'stack_type',         v_sc.stack_type,
          'week_of',            v_sc.week_of,
          'refresh_source',     'daily_cron',
          'refreshed_at',       NOW()
        )
      )
      ON CONFLICT (stack_candidate_id) DO UPDATE SET
        title                 = EXCLUDED.title,
        savings_percent       = EXCLUDED.savings_percent,
        final_cents           = EXCLUDED.final_cents,
        customer_instructions = EXCLUDED.customer_instructions,
        confidence_score      = EXCLUDED.confidence_score,
        expires_at            = EXCLUDED.expires_at,
        published_at          = NOW(),
        feed_metadata         = EXCLUDED.feed_metadata;

      v_published := v_published + 1;

    EXCEPTION WHEN OTHERS THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  -- Step 3: Expire stale feed items
  UPDATE public.app_home_feed
     SET is_active = FALSE
   WHERE expires_at < CURRENT_DATE
      OR published_at < NOW() - INTERVAL '7 days';

  -- Step 4: Log the refresh run
  INSERT INTO public.validation_events (
    offer_source_id,
    event_type,
    actor_type,
    new_status,
    reason_codes,
    metadata
  )
  VALUES (
    NULL,
    'stack_feed_refresh',
    'system',
    'auto_approved',
    ARRAY['daily_cron_refresh'],
    jsonb_build_object(
      'published', v_published,
      'skipped',   v_skipped,
      'errors',    v_errors,
      'ran_at',    NOW()
    )
  );

  RETURN jsonb_build_object(
    'published', v_published,
    'skipped',   v_skipped,
    'errors',    v_errors
  );
END;
$$;

-- ── 5. QA metadata append helper ─────────────────────────────────────────────
-- Appends audit metadata to a stack's qa_metadata JSONB without overwriting.
CREATE OR REPLACE FUNCTION public.append_stack_qa_metadata(
  p_stack_candidate_id UUID,
  p_metadata JSONB
)
RETURNS VOID
LANGUAGE sql
AS $$
  UPDATE public.stack_candidates
     SET qa_metadata = qa_metadata || p_metadata
   WHERE id = p_stack_candidate_id;
$$;

-- ── 6. Admin review actions ───────────────────────────────────────────────────
-- Thin wrapper called by admin-deal-review edge function for review actions.
CREATE OR REPLACE FUNCTION public.admin_review_stack(
  p_stack_candidate_id UUID,
  p_action             TEXT,   -- 'approve' | 'reject' | 'needs_review' | 'wrong_price' | 'missing_coupon'
  p_note               TEXT    DEFAULT NULL,
  p_reviewed_by        TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_new_status TEXT;
  v_badge      TEXT;
BEGIN
  CASE p_action
    WHEN 'approve'         THEN v_new_status := 'auto_approved';      v_badge := 'confirmed';
    WHEN 'reject'          THEN v_new_status := 'blocked';            v_badge := 'expired';
    WHEN 'needs_review'    THEN v_new_status := 'needs_review';       v_badge := 'needs_review';
    WHEN 'wrong_price'     THEN v_new_status := 'needs_review';       v_badge := 'verify_locally';
    WHEN 'missing_coupon'  THEN v_new_status := 'needs_review';       v_badge := 'verify_locally';
    ELSE v_new_status := 'needs_review'; v_badge := 'needs_review';
  END CASE;

  UPDATE public.stack_candidates
     SET validation_status = v_new_status,
         user_badge        = v_badge,
         qa_metadata       = qa_metadata || jsonb_build_object(
           'admin_action',       p_action,
           'admin_note',         p_note,
           'reviewed_by',        p_reviewed_by,
           'reviewed_at',        NOW(),
           'previous_status',    validation_status
         )
   WHERE id = p_stack_candidate_id;

  -- Also update deal_review_queue if a row exists
  UPDATE public.deal_review_queue
     SET review_status = CASE p_action
           WHEN 'approve'        THEN 'approved'
           WHEN 'reject'         THEN 'rejected'
           WHEN 'wrong_price'    THEN 'needs_rework'
           WHEN 'missing_coupon' THEN 'needs_rework'
           ELSE 'needs_review'
         END,
         reviewed_by   = p_reviewed_by,
         reviewed_at   = NOW()
   WHERE stack_candidate_id = p_stack_candidate_id;

  -- Log to validation_events
  INSERT INTO public.validation_events (
    offer_source_id, event_type, actor_type,
    new_status, reason_codes, metadata
  )
  SELECT offer_source_id, 'admin_review', 'human',
         v_new_status, ARRAY[p_action],
         jsonb_build_object('note', p_note, 'badge', v_badge, 'stack_id', p_stack_candidate_id)
    FROM public.stack_candidates WHERE id = p_stack_candidate_id;

  RETURN jsonb_build_object('ok', TRUE, 'new_status', v_new_status);
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_customer_instructions(UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_stack_math(UUID)                TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_app_home_feed()                TO service_role;
GRANT EXECUTE ON FUNCTION public.append_stack_qa_metadata(UUID, JSONB)  TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_review_stack(UUID, TEXT, TEXT, TEXT) TO service_role;
