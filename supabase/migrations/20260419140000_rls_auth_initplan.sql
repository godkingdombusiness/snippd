-- Lint 0003 (auth_rls_initplan): wrap auth.uid() / auth.role() in scalar subqueries so the
-- value is evaluated once per statement, not per row.
-- Policies already using "(select auth.uid())" / "( SELECT auth.uid() )" are unchanged.
--
-- Source: https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan

-- ---------------------------------------------------------------------------
-- public
-- ---------------------------------------------------------------------------

alter policy "Users can insert own logs" on public.agentic_ledger
  with check ((select auth.uid()) = user_id);

alter policy "Users can view own logs" on public.agentic_ledger
  using ((select auth.uid()) = user_id);

alter policy "quota_insert_own" on public.api_rate_limit_log
  with check ((select auth.uid()) = user_id);

alter policy "rate_limit_insert_own" on public.api_rate_limit_log
  with check ((select auth.uid()) = user_id);

alter policy "cart_delete_own" on public.approved_cart
  using ((select auth.uid()) = user_id);

alter policy "cart_insert_own" on public.approved_cart
  with check ((select auth.uid()) = user_id);

alter policy "cart_select_own" on public.approved_cart
  using ((select auth.uid()) = user_id);

alter policy "cart_update_own" on public.approved_cart
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "auth_read_bundles" on public.bundles
  using ((select auth.role()) = 'authenticated'::text);

alter policy "Users can manage own cart items" on public.cart_items
  using (
    cart_id in (
      select carts.id
      from carts
      where carts.user_id = (select auth.uid())
    )
  );

alter policy "cart_items: own rows" on public.cart_items
  using (
    exists (
      select 1
      from carts c
      where c.id = cart_items.cart_id
        and c.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from carts c
      where c.id = cart_items.cart_id
        and c.user_id = (select auth.uid())
    )
  );

alter policy "carts: own rows" on public.carts
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "user_clip_session_items" on public.clip_session_items
  using (
    session_id in (
      select clip_sessions.id
      from clip_sessions
      where clip_sessions.user_id = (select auth.uid())
    )
  );

alter policy "user_clip_sessions" on public.clip_sessions
  using ((select auth.uid()) = user_id);

alter policy "auth_read_coupon_opportunities" on public.coupon_opportunities
  using ((select auth.role()) = 'authenticated'::text);

alter policy "creator_content: own rows" on public.creator_content
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Users manage own mission" on public.current_mission
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "auth_read_diet_staple_mapping" on public.diet_staple_mapping
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_edamam_product_intelligence" on public.edamam_product_intelligence
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_event_calendar" on public.event_calendar
  using ((select auth.role()) = 'authenticated'::text);

alter policy "event_stream_insert_own" on public.event_stream
  with check ((select auth.uid()) = user_id);

alter policy "event_stream_select_own" on public.event_stream
  using ((select auth.uid()) = user_id);

alter policy "auth_read_feature_usage_limits" on public.feature_usage_limits
  using ((select auth.role()) = 'authenticated'::text);

alter policy "Service and Admin Insert" on public.flyer_deal_staging
  with check (
    (select auth.role()) = 'service_role'::text
    or (select auth.role()) = 'authenticated'::text
  );

alter policy "food_waste_log: own rows" on public.food_waste_log
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "Household members access" on public.household_members
  using ((select auth.uid()) = user_id);

alter policy "households: owner full access" on public.households
  using ((select auth.uid()) = primary_user_id)
  with check ((select auth.uid()) = primary_user_id);

alter policy "Users delete own navigator items" on public.instore_navigator
  using ((select auth.uid()) = user_id);

alter policy "Users insert own navigator items" on public.instore_navigator
  with check ((select auth.uid()) = user_id);

alter policy "Users see own navigator items" on public.instore_navigator
  using ((select auth.uid()) = user_id);

alter policy "Users update own navigator items" on public.instore_navigator
  using ((select auth.uid()) = user_id);

alter policy "auth_read_meals" on public.meals
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_nutritional_cache" on public.nutritional_cache
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_price_drift_tracker" on public.price_drift_tracker
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_pricing_tiers" on public.pricing_tiers
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_product_intelligence" on public.product_intelligence
  using ((select auth.role()) = 'authenticated'::text);

alter policy "profiles_delete_own" on public.profiles
  using ((select auth.uid()) = user_id);

alter policy "profiles_insert_own" on public.profiles
  with check ((select auth.uid()) = user_id);

alter policy "profiles_select_own" on public.profiles
  using ((select auth.uid()) = user_id);

alter policy "profiles_update_own" on public.profiles
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "recommendation_exposures_select_own" on public.recommendation_exposures
  using ((select auth.uid()) = user_id);

alter policy "recommendation_exposures_update_own" on public.recommendation_exposures
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "auth_read_retail_insights" on public.retail_insights
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_retailer_coupon_parameters" on public.retailer_coupon_parameters
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_retailer_programs" on public.retailer_programs
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_retailers" on public.retailers
  using ((select auth.role()) = 'authenticated'::text);

alter policy "shopping_list_items: own rows" on public.shopping_list_items
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

alter policy "auth_read_stack_candidates" on public.stack_candidates
  using ((select auth.role()) = 'authenticated'::text);

alter policy "auth_read_store_deals" on public.store_deals
  using ((select auth.role()) = 'authenticated'::text);

alter policy "trip_results: own rows insert" on public.trip_results
  with check ((select auth.uid()) = user_id);

alter policy "trip_results: own rows read" on public.trip_results
  using ((select auth.uid()) = user_id);

alter policy "auth_read_ugc_bounties" on public.ugc_bounties
  using ((select auth.role()) = 'authenticated'::text);

alter policy "Users manage own completions" on public.user_challenge_completions
  using ((select auth.uid()) = user_id);

alter policy "user_preference_scores_select_own" on public.user_preference_scores
  using ((select auth.uid()) = user_id);

alter policy "user_state_snapshots_select_own" on public.user_state_snapshots
  using ((select auth.uid()) = user_id);

alter policy "auth_read_verified_stacks" on public.verified_stacks
  using ((select auth.role()) = 'authenticated'::text);

alter policy "wealth_momentum_snapshots_select_own" on public.wealth_momentum_snapshots
  using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- storage
-- ---------------------------------------------------------------------------

alter policy "receipts_upload_own" on storage.objects
  with check (
    bucket_id = 'receipts'::text
    and (split_part(name, '/'::text, 1))::uuid = (select auth.uid())
  );

alter policy "vertex_training_service_role_only" on storage.objects
  using (
    bucket_id = 'vertex-training-data'::text
    and (select auth.role()) = 'service_role'::text
  );
