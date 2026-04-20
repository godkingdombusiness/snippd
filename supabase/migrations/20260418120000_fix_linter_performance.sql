-- Performance migration: PK on creator_profiles, FK indexes, unused index cleanup.
-- Fixes: creator_profiles has no user_id; smart_alerts may use product_id/store_id instead of product_fk/store_fk.

-- 1. PRIMARY KEY on public.creator_profiles (first matching column that exists; skips user_id)
DO $creator_profiles_pk$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    JOIN pg_namespace n ON t.relnamespace = n.oid
    WHERE n.nspname = 'public'
      AND t.relname = 'creator_profiles'
      AND c.contype = 'p'
  ) THEN
    NULL;
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'id'
  ) THEN
    EXECUTE 'ALTER TABLE public.creator_profiles ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (id)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'creator_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.creator_profiles ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (creator_id)';
  ELSIF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'creator_profiles'
      AND column_name = 'profile_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.creator_profiles ADD CONSTRAINT creator_profiles_pkey PRIMARY KEY (profile_id)';
  ELSE
    RAISE EXCEPTION
      'public.creator_profiles has no primary key and none of id, creator_id, profile_id exist. Add a PK manually after inspecting the table.';
  END IF;
END;
$creator_profiles_pk$;

-- 2. smart_alerts: index FK columns using actual names (product_fk/store_fk may not exist)
DO $smart_alerts_ix$
DECLARE
  col text;
  cols text[] := ARRAY['product_id', 'product_fk', 'store_id', 'store_fk'];
BEGIN
  FOREACH col IN ARRAY cols LOOP
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'smart_alerts'
        AND column_name = col
    ) THEN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_smart_alerts_%I ON public.smart_alerts(%I)',
        col,
        col
      );
    END IF;
  END LOOP;
END;
$smart_alerts_ix$;

-- 3. INDEX unindexed foreign keys (idx_[table]_[column])
CREATE INDEX IF NOT EXISTS idx_agentic_ledger_user_id ON public.agentic_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_deal_id ON public.cart_items(deal_id);
CREATE INDEX IF NOT EXISTS idx_creator_content_receipt_id ON public.creator_content(receipt_id);
CREATE INDEX IF NOT EXISTS idx_creator_content_stack_id ON public.creator_content(stack_id);
CREATE INDEX IF NOT EXISTS idx_creator_onboarding_user_id ON public.creator_onboarding(user_id);
CREATE INDEX IF NOT EXISTS idx_deal_cards_upc_code ON public.deal_cards(upc_code);
CREATE INDEX IF NOT EXISTS idx_event_stream_household_id ON public.event_stream(household_id);
CREATE INDEX IF NOT EXISTS idx_flyer_publish_log_ingestion_id ON public.flyer_publish_log(ingestion_id);
CREATE INDEX IF NOT EXISTS idx_flyer_review_queue_staging_id ON public.flyer_review_queue(staging_id);
CREATE INDEX IF NOT EXISTS idx_gamification_events_user_id ON public.gamification_events(user_id);
CREATE INDEX IF NOT EXISTS idx_global_mission_log_user_id ON public.global_mission_log(user_id);
CREATE INDEX IF NOT EXISTS idx_household_inventory_product_id ON public.household_inventory(product_id);
CREATE INDEX IF NOT EXISTS idx_household_members_household_id ON public.household_members(household_id);
CREATE INDEX IF NOT EXISTS idx_household_members_user_id ON public.household_members(user_id);
CREATE INDEX IF NOT EXISTS idx_households_primary_user_id ON public.households(primary_user_id);
CREATE INDEX IF NOT EXISTS idx_impact_ledger_trip_id ON public.impact_ledger(trip_id);
CREATE INDEX IF NOT EXISTS idx_impact_ledger_user_id ON public.impact_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_instore_navigator_stack_id ON public.instore_navigator(stack_id);
CREATE INDEX IF NOT EXISTS idx_instore_navigator_store_id ON public.instore_navigator(store_id);
CREATE INDEX IF NOT EXISTS idx_max_savings_rebates_offer_source_id ON public.max_savings_rebates(offer_source_id);
CREATE INDEX IF NOT EXISTS idx_meal_prep_strategies_base_stack_id ON public.meal_prep_strategies(base_stack_id);
CREATE INDEX IF NOT EXISTS idx_model_predictions_user_id ON public.model_predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_offer_batches_retailer_id ON public.offer_batches(retailer_id);
CREATE INDEX IF NOT EXISTS idx_offer_matches_coupon_source_id ON public.offer_matches(coupon_source_id);
CREATE INDEX IF NOT EXISTS idx_offer_matches_loyalty_source_id ON public.offer_matches(loyalty_source_id);
CREATE INDEX IF NOT EXISTS idx_offer_matches_weekly_ad_source_id ON public.offer_matches(weekly_ad_source_id);
CREATE INDEX IF NOT EXISTS idx_offer_products_product_id ON public.offer_products(product_id);
CREATE INDEX IF NOT EXISTS idx_offer_sources_batch_id ON public.offer_sources(batch_id);
CREATE INDEX IF NOT EXISTS idx_offers_product_id ON public.offers(product_id);
CREATE INDEX IF NOT EXISTS idx_offers_store_id ON public.offers(store_id);
CREATE INDEX IF NOT EXISTS idx_price_drift_tracker_deal_id ON public.price_drift_tracker(deal_id);
CREATE INDEX IF NOT EXISTS idx_product_price_history_retailer_id ON public.product_price_history(retailer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_budget_id ON public.profiles(active_budget_id);
CREATE INDEX IF NOT EXISTS idx_profiles_active_trip_id ON public.profiles(active_trip_id);
CREATE INDEX IF NOT EXISTS idx_promo_product_candidates_product_id ON public.promo_product_candidates(product_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_receipt_id ON public.receipt_items(receipt_id);
CREATE INDEX IF NOT EXISTS idx_receipt_items_retailer_id ON public.receipt_items(retailer_id);
CREATE INDEX IF NOT EXISTS idx_receipt_uploads_retailer_id ON public.receipt_uploads(retailer_id);
CREATE INDEX IF NOT EXISTS idx_receipt_validations_stack_id ON public.receipt_validations(stack_id);
CREATE INDEX IF NOT EXISTS idx_receipt_validations_user_id ON public.receipt_validations(user_id);
CREATE INDEX IF NOT EXISTS idx_recipe_ingredients_product_id ON public.recipe_ingredients(product_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_exposures_user_id ON public.recommendation_exposures(user_id);
CREATE INDEX IF NOT EXISTS idx_retail_insights_retailer_id ON public.retail_insights(retailer_id);
CREATE INDEX IF NOT EXISTS idx_retailer_products_product_id ON public.retailer_products(product_id);
CREATE INDEX IF NOT EXISTS idx_saved_meal_plans_user_id ON public.saved_meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_saved_recipes_recipe_id ON public.saved_recipes(recipe_id);
CREATE INDEX IF NOT EXISTS idx_savings_ledger_trip_id ON public.savings_ledger(trip_id);
CREATE INDEX IF NOT EXISTS idx_savings_ledger_user_id ON public.savings_ledger(user_id);
CREATE INDEX IF NOT EXISTS idx_stack_items_stack_id ON public.stack_items(stack_id);
CREATE INDEX IF NOT EXISTS idx_stack_results_trip_id ON public.stack_results(trip_id);
CREATE INDEX IF NOT EXISTS idx_stack_results_trip_item_id ON public.stack_results(trip_item_id);
CREATE INDEX IF NOT EXISTS idx_stack_results_user_id ON public.stack_results(user_id);
CREATE INDEX IF NOT EXISTS idx_stack_runs_budget_id ON public.stack_runs(budget_id);
CREATE INDEX IF NOT EXISTS idx_stack_runs_trip_id ON public.stack_runs(trip_id);
CREATE INDEX IF NOT EXISTS idx_stack_usage_stack_id ON public.stack_usage(stack_id);
CREATE INDEX IF NOT EXISTS idx_stacks_retailer_id ON public.stacks(retailer_id);
CREATE INDEX IF NOT EXISTS idx_support_messages_user_id ON public.support_messages(user_id);
CREATE INDEX IF NOT EXISTS idx_training_logs_deal_id ON public.training_logs(deal_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_offer_id ON public.trip_items(offer_id);
CREATE INDEX IF NOT EXISTS idx_trip_items_product_id ON public.trip_items(product_id);
CREATE INDEX IF NOT EXISTS idx_trips_budget_id ON public.trips(budget_id);
CREATE INDEX IF NOT EXISTS idx_trips_store_id ON public.trips(store_id);
CREATE INDEX IF NOT EXISTS idx_ugc_bounties_retailer_id ON public.ugc_bounties(retailer_id);
CREATE INDEX IF NOT EXISTS idx_ugc_bounties_stack_id ON public.ugc_bounties(stack_id);
CREATE INDEX IF NOT EXISTS idx_ugc_content_creator_id ON public.ugc_content(creator_id);
CREATE INDEX IF NOT EXISTS idx_ugc_content_stack_id ON public.ugc_content(stack_id);
CREATE INDEX IF NOT EXISTS idx_ugc_queue_deal_id ON public.ugc_queue(deal_id);
CREATE INDEX IF NOT EXISTS idx_ugc_queue_user_id ON public.ugc_queue(user_id);
CREATE INDEX IF NOT EXISTS idx_ugc_submissions_user_id ON public.ugc_submissions(user_id);
CREATE INDEX IF NOT EXISTS idx_upc_scan_logs_product_id ON public.upc_scan_logs(product_id);
CREATE INDEX IF NOT EXISTS idx_upc_scan_logs_trip_id ON public.upc_scan_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_upc_scan_logs_user_id ON public.upc_scan_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_behavior_logs_user_id ON public.user_behavior_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_user_cart_deal_id ON public.user_cart(deal_id);
CREATE INDEX IF NOT EXISTS idx_user_cart_user_id ON public.user_cart(user_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_completions_challenge_id ON public.user_challenge_completions(challenge_id);
CREATE INDEX IF NOT EXISTS idx_user_challenge_completions_user_id ON public.user_challenge_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_events_user_id ON public.user_events(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON public.user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_pantry_user_id ON public.user_pantry(user_id);
CREATE INDEX IF NOT EXISTS idx_user_restrictions_user_id ON public.user_restrictions(user_id);
CREATE INDEX IF NOT EXISTS idx_weekly_meals_stack_id ON public.weekly_meals(stack_id);

-- 4. Remove unused indexes
DROP INDEX IF EXISTS public.idx_staging_normalized_key_week;
DROP INDEX IF EXISTS public.idx_trip_items_trip_id;
DROP INDEX IF EXISTS public.idx_trips_user_id;
DROP INDEX IF EXISTS public.idx_recipes_diet_tags_gin;
DROP INDEX IF EXISTS public.idx_stack_candidates_verified;
DROP INDEX IF EXISTS public.idx_stack_candidates_dietary_tags_gin;
DROP INDEX IF EXISTS public.idx_stack_candidates_health_labels_gin;
DROP INDEX IF EXISTS public.idx_offers_raw_import_week;
DROP INDEX IF EXISTS public.idx_stack_candidates_allergen_tags_gin;
DROP INDEX IF EXISTS public.idx_stack_candidates_duplicate_key;
DROP INDEX IF EXISTS public.idx_stack_candidates_meal_role;
DROP INDEX IF EXISTS public.idx_raw_offer_ingest_retailer_week;
DROP INDEX IF EXISTS public.idx_trips_user_status_created;
DROP INDEX IF EXISTS public.idx_trip_items_trip_item_name;
DROP INDEX IF EXISTS public.idx_offers_retailer_key;
DROP INDEX IF EXISTS public.raw_deal_inputs_status_received_idx;
DROP INDEX IF EXISTS public.idx_raw_offer_ingest_retailer;
DROP INDEX IF EXISTS public.idx_budget_items_budget_id;
DROP INDEX IF EXISTS public.idx_ingestion_jobs_status_created;
DROP INDEX IF EXISTS public.idx_offers_retailer_week;
DROP INDEX IF EXISTS public.idx_ingestion_job_pages_job_page;
DROP INDEX IF EXISTS public.offers_idx_active_ends;
DROP INDEX IF EXISTS public.idx_raw_offer_ingest_week;
DROP INDEX IF EXISTS public.idx_cartelligence_recommendations_user_active;
DROP INDEX IF EXISTS public.smart_alerts_user_active_idx;
DROP INDEX IF EXISTS public.user_savings_goals_user_active_idx;
DROP INDEX IF EXISTS public.idx_deal_cards_home;
DROP INDEX IF EXISTS public.idx_flyer_deal_staging_week_of;
DROP INDEX IF EXISTS public.idx_flyer_deal_staging_retailer_key;
DROP INDEX IF EXISTS public.idx_flyer_deal_staging_product_price;
DROP INDEX IF EXISTS public.idx_offers_image_status;
DROP INDEX IF EXISTS public.offers_normalized_key_idx;
DROP INDEX IF EXISTS cartelligence.idx_scoring_weights_profile_key;
DROP INDEX IF EXISTS public.idx_instore_navigator_trip;
DROP INDEX IF EXISTS public.idx_instore_navigator_zone;
DROP INDEX IF EXISTS public.idx_edamam_health;
DROP INDEX IF EXISTS public.idx_edamam_diet;
DROP INDEX IF EXISTS public.idx_household_essentials_default;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_retailer;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_zone;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_stack_id;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_status;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_week_start;
DROP INDEX IF EXISTS public.idx_app_home_feed_v2_breakdown_list_gin;
DROP INDEX IF EXISTS public.idx_publix_kb_name;
DROP INDEX IF EXISTS public.anonymized_signals_week_idx;
DROP INDEX IF EXISTS public.anonymized_signals_category_idx;
DROP INDEX IF EXISTS public.idx_mfr_kb_name;
DROP INDEX IF EXISTS public.profiles_consent_accepted_idx;
DROP INDEX IF EXISTS public.idx_basket_trigger_active;
DROP INDEX IF EXISTS public.idx_cart_items_cart_id;
DROP INDEX IF EXISTS public.idx_affiliate_referrals_offer_id;
DROP INDEX IF EXISTS public.idx_carts_user_id;
DROP INDEX IF EXISTS public.idx_csi_session;
DROP INDEX IF EXISTS public.idx_profiles_shopping_style;
DROP INDEX IF EXISTS public.idx_api_rate_limit_user_endpoint_time;
DROP INDEX IF EXISTS public.idx_audit_table_event;
DROP INDEX IF EXISTS public.idx_rebate_platform;
DROP INDEX IF EXISTS public.idx_rebate_nk;
DROP INDEX IF EXISTS public.profiles_shopping_style_idx;
