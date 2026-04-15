# Snippd — Change Log
Auto-maintained by Claude Code. Updated after every change.
Format: [version] — YYYY-MM-DD

## [Unreleased]

### Added
- `screens/SignInScreen.js` — New two-panel sign-in/sign-up screen matching updated brand design. Left panel: forest green gradient with Sublima wordmark, hero headline "Stack every deal. Miss nothing.", animated blobs, stat chips (avg savings / stores tracked / autonomous). Right panel: tab toggle (Sign In / Create Account), Google and Apple (iOS only) OAuth via `supabase.auth.signInWithOAuth`, email/password form with focus-glow fields, inline error display (no Alert.alert), forgot password via `supabase.auth.resetPasswordForEmail`. Two-panel on tablets (width > 768), single panel on phones. Auth success handled entirely by `App.js onAuthStateChange` — no manual navigation.

### Changed
- `App.js` — Auth route now uses `SignInScreen` instead of `AuthScreen`. `AuthScreen` kept as fallback import but no longer the default.
- `screens/CartScreen.js` — Full rewrite. Primary data source is now `snippd_cart` AsyncStorage key (personal cart from weekly plan + explore adds). Shows item list with BOGO-aware math (qty=2, pay for 1, save 50%), deal-type badges, at-register savings, order summary receipt, coupon checklist, "Verify Receipt" button navigating to `ReceiptUpload` with cart totals params. Empty state offers "View Weekly Plan" and "Browse Deals" shortcuts.
- `screens/WeeklyPlanScreen.js` — "Lock in this week's plan" button now saves all meal ingredients to AsyncStorage `snippd_cart` (BOGO items get `quantity: 2`), tracks `cart_accepted` event, then navigates to `SnippdTab` (cart). Previously navigated to `List`.
- `screens/DiscoverScreen.js` — Added "Add to cart" button to every bundle card. Appends bundle items to AsyncStorage `snippd_cart` without overwriting existing items. Checks for duplicates by bundle ID. Shows in-screen "Added" state after success. Added `refreshAddedIds()` on focus to sync badge state with cart.

### Fixed
- BOGO math enforced in CartScreen: quantity=2, you_pay = unit_price × 1, savings = unit_price × 1, savings_pct = 50%. Never 0 for total, never 100% for savings.
- All price displays use `(cents / 100).toFixed(2)` for consistent 2 decimal places.
- Savings never shown as negative — clamped with `Math.max(0, ...)`.
- `npx tsc --noEmit` — 0 errors ✓

### Added
- `supabase/migrations/017_ingestion_schema_alignment.sql` — Schema alignment migration: adds `started_at`, `error_message`, `parsed_at`, `deal_count` to `ingestion_jobs`; adds `savings_amount`, `is_bogo`, `dietary_flags`, `deal_description`, `confidence_score` to `flyer_deal_staging`; adds `normalized_key`, `offer_type`, `confidence_score`, `source`, `raw_text`, `ingestion_id` to `offer_sources`; adds `offer_source_id`, `normalized_key`, `coupon_savings_cents`, `match_mode` + unique index to `offer_matches`; adds `week_of`, `normalized_key`, `dedupe_key` (UNIQUE constraint), `primary_category`, `primary_brand`, `items`, `savings_pct`, `ingestion_id` to `stack_candidates`; adds `retailer_key`, `week_of`, `deals_staged`, `deals_published`, `coupons_matched`, `candidates_written` to `flyer_publish_log`. Creates `sync_stack_candidate_columns()` BEFORE INSERT OR UPDATE trigger to bridge worker-written columns to RPC-read columns.
- `supabase/migrations/017b_ingestion_jobs_fixes.sql` — Adds `'parsed'` to `ingestion_jobs_status_check` constraint; adds UNIQUE index on `ingestion_jobs.storage_path`; seeds 6 circular jobs (publix, aldi, cvs, dollargeneral, keyfoods, walgreens) as `queued`.

### Changed
- `supabase/functions/run-ingestion-worker/index.ts` — Multiple fixes: upgraded Gemini model to `gemini-2.5-flash`; replaced char-by-char base64 with chunked `uint8ToBase64()`; fixed MIME type from `image/jpeg` → `application/pdf`; added `thinkingConfig: { thinkingBudget: 0 }` to suppress thinking tokens; added Gemini Files API path for PDFs > 3 MB (multipart upload + ACTIVE state polling); fixed parts extraction to collect all non-`thought` parts; added `gemini_raw` debug log entry; added `parseStoragePath()` utility that handles both flat format (`retailer-YYYY-MM-DD-type.pdf`) and legacy folder format.
- `screens/AdminCircularUploadScreen.js` — Changed storage path construction to flat format: `retailerKey-weekOf-type.pdf` (e.g. `publix-2026-04-16-weekly-flyer.pdf`). Previously used folder format `retailer/weekOf/type.pdf`.

### Fixed
- Dropped FK constraint `flyer_deal_staging_ingestion_id_fkey` (referenced non-existent `flyer_ingestions.id`).
- Dropped NOT NULL on `offer_sources.retailer_id` (worker does not write this column).
- `stack_candidates` now populated with 189 active deals from 8 retailers (walgreens=51, dollargeneral=47, keyfoods=36, aldi=34, publix=14, target=4, cvs=3) via direct INSERT from `flyer_deal_staging`.
- `npx tsc --noEmit` — 0 errors ✓

---

## [1.5.1] — 2026-04-14

### Fixed
- Patch: cart navigation, sign-in screen redesign, BOGO math, Explore add-to-cart. (See [Unreleased] above — items moved here on release.)

---

## [1.5.0] — 2026-04-14

### Added
- `supabase/migrations/015_nutrition_profile.sql` — Adds 7 columns to `profiles`: `household_members` (jsonb), `daily_calorie_target_min/max` (integer), `meal_calorie_target_min/max` (integer), `dietary_modes` (text[]), `nutrition_profile_set` (boolean).
- `supabase/migrations/016_get_weekly_plan_fn.sql` — PostgreSQL RPC function `get_weekly_plan(p_user_id, p_headcount, p_nights, p_focus, p_week_of)`. Returns jsonb with dinners array (protein + produce side + pantry item per night), household_stack (top 8 household/health items), totals, dietary modes, and calorie targets. Allergen filter uses `sc.allergen_tags ?| v_dietary_tags`. Dinner slots scored by savings (focus=savings), protein (focus=protein), or stack_rank_score (default).
- `src/constants/nutritionTargets.ts` — USDA Dietary Guidelines 2020–2025 reference data. Exports `CALORIE_TARGETS`, `MEMBER_OPTIONS` (12 life stages), `DIETARY_MODES` (8 modes), `computeHouseholdCalorieTarget()`, `getMemberCalorieLabel()`, `memberOptionToRecord()`, `DIETARY_MODE_CONFLICTS`.
- `src/services/geniusStackEngine.ts` — Dietary mode scoring engine. `applyDietaryScoring(deals, profile)` applies boosts/penalties/exclusions for 8 modes (plant_based, low_carb, keto, low_sodium, healthy_fats, high_protein, mediterranean, diabetic_friendly) plus calorie alignment scoring. Scores capped [0, 2.0]. Includes CLI entry point and `runGeniusStackEngine(supabase, userId)` for server use.
- `screens/NutritionProfileScreen.js` — Full household nutrition profile screen. Member cards with expand/collapse, USDA life-stage type grid, live calorie table (`computeHouseholdCalorieTarget`), dietary mode 2-col grid with conflict resolution (plant_based deselects keto/high_protein), household calorie summary card, USDA disclaimer. Saves to `profiles` via `.eq('user_id', user.id)`. Works in onboarding context (`fromOnboarding: true` → returns to step 3) and profile settings context.
- `screens/WeeklyPlanPersonalizationScreen.js` — 3-question pre-filter flow (headcount → nights → focus) with 7-day AsyncStorage skip logic. Animated card slide-in, auto-advance on steps 0+1, "Build my plan" + "Skip" handlers. Saves answers to `plan_personalization` AsyncStorage key and navigates to WeeklyPlan with `{ headcount, nights, focus, personalized }` params.

### Changed
- `screens/OnboardingScreen.js` — Added `route` prop + `useEffect` to resume at `route.params.resumeAtStep` (used when returning from NutritionProfileScreen). Continue button on step 2 now navigates to `NutritionProfile` with `{ fromOnboarding: true }` instead of advancing inline.
- `screens/ProfileScreen.js` — Added "Nutrition profile" row to My Account section. Dynamic subtitle: "Calorie targets set" if `profile.nutrition_profile_set`, "Set up household calories" otherwise. Navigates to `NutritionProfile` screen.
- `App.js` — Added `PlanStackNav` + `PlanStack` (WeeklyPlanPersonalization root → WeeklyPlan + NutritionProfile). Added `PlanTab` between DiscoverTab and SnippdTab. Removed WeeklyPlan from HomeStack. Added `NutritionProfile` to root Stack (for onboarding) and ProfileStack (for settings).

### Database
- `profiles` table: 7 new columns — `household_members`, `daily_calorie_target_min`, `daily_calorie_target_max`, `meal_calorie_target_min`, `meal_calorie_target_max`, `dietary_modes`, `nutrition_profile_set`.

### API
- New RPC: `get_weekly_plan(p_user_id uuid, p_headcount int, p_nights int, p_focus text, p_week_of date)` → `jsonb`. GRANT to `authenticated` + `service_role`.

### Changed (continued — same session)
- `screens/WeeklyPlanScreen.js` — Wired to live `get_weekly_plan` RPC. Accepts `route.params` (`headcount`, `nights`, `focus`). Replaced `buildSampleMeals` with RPC call + `buildMealCard()` mapper (converts RPC dinner slots to ingredient format, prices via `toCents()`). Added skeleton pulse loading, noDeals empty state (with admin "Upload circulars now" button for `ddavis@getsnippd.com`), error state with 7-day AsyncStorage cache fallback. Hero title, section label, receipt row, and takeout copy now use `nights` param. Calorie status badges (on_target/near target/above target) shown per meal when `meal_calorie_target_min/max` are set. Tracks view to `weekly_plan_last_viewed` AsyncStorage key.
- `screens/HomeScreen.js` — Added weekly plan banner (forest green left border). Shows Wed–Fri or if user has never viewed the plan. Throttled to once/24h via `plan_banner_shown_at` AsyncStorage. Tapping marks shown and navigates to `PlanTab`.
- `screens/StudioScreen.js` — Added weekly plan card between CREATE BUTTON and EARNINGS INFO sections. Mint green background, calendar icon, navigates to `PlanTab`.

### Fixed (continued)
- `npx tsc --noEmit` — 0 errors ✓

---

## [1.2.1] — 2026-04-14

### Added
- `screens/WeeklyPlanScreen.js` — New screen: 7-section weekly dinner plan layout. Hero block (forest green, deal-count chips), anchor pricing bar (restaurant range vs Snippd range), 5-meal list with day/price column + ingredient chips + deal-type badges + save row + optional coupon note, week receipt with line items + FOREST footer + strikethrough + teal total, takeout comparison (red tint, diff savings), Lock In button. Price computations use ingredient sale_cents summed per meal (total for household, not per person). Zero instances of the word "serving". Data backed by `buildSampleMeals()` with a TODO hook for live `meal_plans` query.
- Registered `WeeklyPlanScreen` in `App.js` HomeStack as route `"WeeklyPlan"`.

### Fixed
- TypeScript: `npx tsc --noEmit` — 0 errors ✓

---

## [1.2.0] — 2026-04-14

### Added
- `screens/OnboardingScreen.js` — Full premium rebuild. 7-screen architecture replacing the previous 6-step flow. New screens: (0) cinematic hero with LinearGradient + animated logo entrance, (5) AI persona generation with pulsing loading ring + Shopper DNA reveal card, (6) upgraded paywall with credit welcome banner. All 5 question screens upgraded with Reanimated spring animations and Haptics on every selection.
- `babel.config.js` — Created with `babel-preset-expo` + `react-native-reanimated/plugin` (required by Reanimated 3).

### Changed
- `OnboardingScreen` persona engine — derives one of 8 shopper archetypes (Precision Nurturer, Wellness Optimizer, Speed Strategist, Culinary Value Hunter, Efficiency Machine, Conscious Saver, Selective Maximizer, Balanced Strategist) from household + dietary + cooking style data. Persona type saved to `profiles.preferences.persona_type`.
- `OnboardingScreen` progress bar — replaced static `Animated.View` width with Reanimated `interpolate` spring animation over step index.
- `OnboardingScreen` step transitions — replaced `Animated.timing` fade with Reanimated `withTiming` + `withSpring` slide-fade combo via `translateX` + `opacity` shared values.
- `OnboardingScreen` pill selections — each SelectPill uses `withSequence(withSpring(0.92), withSpring(1.0))` for tactile bounce.
- `OnboardingScreen` cooking style options — per-option Reanimated `scale` shared value with `FadeIn` entering animation on checkmark.
- `OnboardingScreen` consent checkbox — spring scale pulse on toggle; saves `persona_type` alongside existing profile fields.

### Services
- Installed `react-native-reanimated@3.x` (SDK 55 compatible) + `expo-haptics` + `expo-document-picker`.

---

## [1.1.0] — 2026-04-14

### Added
- `src/services/ingestion/flyerParser.ts` — Replaced DEAL_EXTRACTION_PROMPT with GEMINI_PROMPT including confidence, is_bogo, dietary_flags, savings_amount, deal_description fields and stricter category/deal_type enums. Added Promise.all parallel processing of up to 3 pages simultaneously. Added JSON-parse retry with simplified fallback prompt. Added fire-and-forget logging to ingestion_run_log per page.
- `src/services/ingestion/offerNormalizer.ts` — Added `computeStackRankScore()` replacing old linear formula. New score: savings_pct (up to 0.50) + is_bogo bonus (0.25) + MULTI/BUY_X_GET_Y bonus (0.10) + confidence > 0.9 bonus (0.10) + essential category bonus (0.05), capped at 1.0. Added `savings_amount` and `is_bogo` to `StagedDeal` interface.
- `supabase/functions/run-ingestion-worker/index.ts` — New Deno Edge Function. Processes up to 3 queued ingestion_jobs per invocation. Inline Gemini Vision extraction, flyer_deal_staging write, offer_sources upsert, digital_coupon matching, offer_matches + stack_candidates write. Auth: x-cron-secret or service-role Bearer. Retry up to 3 attempts before marking failed.
- `screens/AdminCircularUploadScreen.js` — New admin screen for uploading weekly circulars. 12-retailer store picker, week-of date stepper (defaults next Wednesday), source-type pills (flyer/digital/combo), expo-document-picker PDF upload to 'deal-pdfs' storage bucket, trigger-ingestion call, job status list with auto-refresh every 30s.
- `src/services/vertexTrainingExport.ts` — New Node.js service. Joins event_stream + recommendation_exposures + user_state_snapshots + stack_results over 90-day rolling window. Labels by outcome (purchased=1.0, accepted=0.8, clicked=0.4, dismissed=0.0). Exports JSONL to 'vertex-training-data' bucket. Paginated in batches of 500.
- `supabase/functions/run-vertex-export/index.ts` — Deno wrapper for Vertex training export. Same auth as run-ingestion-worker. Streams batches to storage JSONL file.
- `docs/VERTEX_TRAINING.md` — Full guide: label schema, training row schema, storage layout, cron schedule, Vertex AI integration next steps.
- `screens/AdminAnalyticsDashboardScreen.js` — New admin screen with 6 sections: deal pipeline health (queued/parsing/complete/failed), recommendation funnel (exposures/clicks/purchases, CTR + conversion), user savings velocity (total saved, avg velocity, receipt count), behavioral signal health (mini bar chart top 8 events), Vertex training readiness (progress bars: events/exposures/snapshots vs targets), anonymized market signals (by category + trend).

### Changed
- `screens/AdminPulseScreen.js` — Added nav buttons for AdminCircularUpload and AdminAnalytics screens.
- `App.js` — Registered AdminCircularUploadScreen and AdminAnalyticsDashboardScreen in ProfileStack.

### Database
- `supabase/migrations/008_ingestion_cron.sql` — Added `snippd-ingestion-worker` cron (*/30 * * * *) and `snippd-circular-reminder` cron (0 14 * * 2, inserts to email_alert_queue). Deployed to production (jobids 39, 40).
- `supabase/migrations/009_vertex_export_cron.sql` — Created `vertex-training-data` storage bucket + RLS policy + `snippd-vertex-export` cron (0 3 * * 0). Deployed to production (jobid 41).
- `supabase/migrations/010_analytics_views.sql` — Created `v_recommendation_funnel`, `v_stack_performance`, `v_weekly_savings_summary` views. GRANT SELECT to authenticated + service_role. Deployed to production.

### API
- `POST /functions/v1/run-ingestion-worker` — New endpoint. Processes queued ingestion jobs inline.
- `POST /functions/v1/run-vertex-export` — New endpoint. Exports Vertex AI training JSONL to storage.

### Services
- `src/services/vertexTrainingExport.ts` — New service. Vertex AI training data pipeline.

---

## [1.0.0] — 2026-04-14

### Production Release — All systems verified

### Fixed
- `supabase/functions/process-receipt/index.ts` — Rewrote to be fully Deno-compatible. Removed imports of Node.js services (`src/services/receiptParser.ts`, `src/services/wealthEngine.ts`) that used bare `@supabase/supabase-js` imports and `process.env`. Inlined Gemini Vision API call (direct fetch to Gemini 1.5 Flash) and simplified wealth snapshot computation. Function now self-contained with no local bundled dependencies.
- `supabase/functions/get-cart-options/index.ts` — Added `ingestion_run_log` logging; fixed dead-code `return response` (previously `logRequest` was after `return json(...)` and never reached). Now correctly assigns response to variable before logging.
- `supabase/functions/get-wealth-momentum/index.ts` — Added `ingestion_run_log` logging on success and error paths.
- `supabase/functions/process-receipt/index.ts` — Added `ingestion_run_log` logging.

### Verified
- TypeScript: `npx tsc --noEmit` — 0 errors ✓
- RLS: All 138 public tables have `rowsecurity: true` ✓
- Stacking engine: 16/16 tests pass ✓
- Health endpoint: `{"status":"ok","version":"0.5.0","checks":{"database":{"ok":true},"event_weights":{"ok":true}}}` ✓
- All 4 pg_cron jobs active, using Vault secrets ✓
- All 10 Edge Functions deployed to `gsnbpfpekqqjlmkgvwvb` ✓

### Edge Functions — All passing audit (CORS, auth, try/catch, logging, status codes)
- `ingest-event` ✓ `stack-compute` ✓ `get-cart-options` ✓ `process-receipt` ✓
- `get-wealth-momentum` ✓ `trigger-ingestion` ✓ `run-preference-updater` ✓
- `run-graph-sync` ✓ `run-wealth-check` ✓ `health` ✓

---

## [0.5.2] — 2026-04-14

### Fixed
- `supabase/migrations/003_pg_cron_jobs.sql` — Replaced `current_setting('app.*')` references (which require `ALTER DATABASE`, blocked on hosted Supabase) with `vault.decrypted_secrets` subqueries. Cron jobs now read `snippd_functions_url` and `snippd_cron_secret` from Vault at fire time. No `pg_reload_conf()` needed.
- Vault secrets `snippd_functions_url` and `snippd_cron_secret` stored in production via `vault.create_secret()`. All 4 cron jobs updated live.

## [0.5.1] — 2026-04-14

### Fixed
- `supabase/migrations/004_app_config.sql` — Corrected column names from `config_key`/`config_value` to `key`/`value` to match the live table schema. Also corrected `CREATE TABLE` definition to match: `key text PK`, `value text`, `created_at`, `updated_at`. Bumped seeded `app_version` value to `'0.5.0'`.
- `supabase/functions/health/index.ts` — Updated all `app_config` queries to use `key`/`value` column names (was `config_key`/`config_value`). Redeployed with `--no-verify-jwt` so the endpoint is publicly reachable without a Bearer token.

### API
- `GET /functions/v1/health` — Confirmed live: returns `{"status":"ok","version":"0.5.0","checks":{"database":{"ok":true},"event_weights":{"ok":true}}}`.

### Database (production)
- Migrations 003–006 applied to live DB (`gsnbpfpekqqjlmkgvwvb`).
- `cron.job` — 4 Snippd jobs now active: `snippd-preference-updater` (5 * * * *), `snippd-graph-sync` (50 1 * * *), `snippd-wealth-check` (0 4 * * *), `snippd-rate-limit-cleanup` (0 5 * * *).
- `profiles` — `consent_accepted`, `consent_accepted_at`, `privacy_policy_version` columns confirmed live.
- `anonymized_signals` — Table confirmed live.
- `app_config` — USDA benchmarks, inflation baseline, stack tuning, and version `0.5.0` seeded.

### Services
- `run-preference-updater`, `run-graph-sync`, `run-wealth-check`, `health` Edge Functions deployed to production.
- **Action required:** Set `app.supabase_functions_url` and `app.cron_secret` in Supabase Dashboard SQL Editor (see below — cannot be set via Management API).

## [0.5.0] — 2026-04-14

### Added
- `screens/PrivacyPolicyScreen.js` — Scrollable in-app privacy policy with 11 sections (Data We Collect, How We Use Your Data, Sharing, Retention, Your Rights, Security, Children's Privacy, Contact). Green contact pill opens `mailto:privacy@getsnippd.com`. Shows policy version 1.0 and last-updated date in footer.
- `docs/PRIVACY_POLICY.md` — Source-of-truth plain-text privacy policy (version 1.0). Matches content in PrivacyPolicyScreen.
- `supabase/migrations/006_privacy_consent.sql` — Adds `consent_accepted_at timestamptz`, `privacy_policy_version text`, and index `profiles_consent_accepted_idx` to `profiles`. `consent_accepted boolean` added idempotently.

### Changed
- `screens/OnboardingScreen.js` — Step 5 now shows a consent checkbox ("I agree to the Privacy Policy and Terms of Service") with an inline link that navigates to PrivacyPolicyScreen. "Continue" button is disabled until checkbox is ticked. On account creation, saves `consent_accepted: true`, `consent_accepted_at`, and `privacy_policy_version: '1.0'` to profile.
- `screens/ProfileScreen.js` — "Privacy Policy" menu item now navigates to `PrivacyPolicyScreen` (was an alert placeholder).
- `screens/HelpScreen.js` — Privacy Policy contact option now navigates to `PrivacyPolicyScreen` in-app.
- `App.js` — Registered `PrivacyPolicyScreen` in root Stack, HomeStack, and ProfileStack so all navigation paths (Onboarding → PrivacyPolicy, Profile → PrivacyPolicy, Help → PrivacyPolicy) resolve correctly.

### Database
- `profiles.consent_accepted_at` — New column `timestamptz`; NULL until user accepts.
- `profiles.privacy_policy_version` — New column `text`; stores the policy version string agreed to (e.g. '1.0').
- `profiles_consent_accepted_idx` — New index on `(consent_accepted, consent_accepted_at)` for compliance reporting.

## [0.4.1] — 2026-04-14

### Added
- `supabase/migrations/005_delete_my_account.sql` — Creates `anonymized_signals` table (retailer_key, category, event_name, week_of, signal_count — no user_id). Creates `delete_my_account()` SECURITY DEFINER RPC function: (A) aggregates user's event_stream into anonymized_signals before deletion, (B) deletes all personal data tables, (C) deletes auth.users record. Callable via `supabase.rpc('delete_my_account')`.

### Changed
- `screens/ProfileScreen.js` — `handleDeleteAccount` replaced: now calls `supabase.rpc('delete_my_account')` then `supabase.auth.signOut({ scope: 'local' })` then navigates to Auth. Removed dependency on `delete-account` Edge Function.
- `lib/sessionGuard.js` — `supabase.auth.signOut()` → `supabase.auth.signOut({ scope: 'global' })` to invalidate the session on all devices on inactivity timeout.
- `screens/ProfileScreen.js` — `handleSignOut` updated to `signOut({ scope: 'global' })`.
- `screens/TrialGateScreen.js` — `signOut()` → `signOut({ scope: 'global' })`.
- `screens/MFAVerifyScreen.js` — `signOut()` → `signOut({ scope: 'global' })` on "Back to sign in".

### Database
- `anonymized_signals` — New table: `retailer_key`, `category`, `event_name`, `week_of` (date), `signal_count` (integer). Unique constraint on (retailer_key, category, event_name, week_of) for ON CONFLICT upsert. RLS enabled, service role only.
- `delete_my_account()` — New SECURITY DEFINER function callable by `authenticated` role. Deletes 11 personal data tables + auth.users after aggregating signals.

## [0.4.0] — 2026-04-14

### Added
- `supabase/migrations/003_pg_cron_jobs.sql` — Enables `pg_cron` + `pg_net` extensions. Schedules 4 background jobs: `snippd-preference-updater` (hourly at :05), `snippd-graph-sync` (daily 01:50 UTC), `snippd-wealth-check` (daily 04:00 UTC), `snippd-rate-limit-cleanup` (daily 05:00 UTC, SQL-only). Jobs call Edge Functions via `net.http_post` using `x-cron-secret` auth. Config via `current_setting('app.cron_secret')` and `app.supabase_functions_url`.
- `supabase/migrations/004_app_config.sql` — Creates `app_config` table (`config_key` text PK, `config_value` jsonb). Seeds USDA food plan benchmarks (thrifty + moderate plans for 1/2/4-person households, weekly and monthly), inflation CPI baseline, stacking engine tuning values, and app version.
- `supabase/functions/run-preference-updater/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Forwards to `preference-updater` with service-role auth and logs result to `ingestion_run_log`.
- `supabase/functions/run-graph-sync/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Dispatches `nightly-graph-sync.yml` via GitHub API `workflow_dispatch` (204 = success). Reads `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO` env vars. Logs outcome to `ingestion_run_log`.
- `supabase/functions/run-wealth-check/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Queries `wealth_momentum_snapshots` for users with velocity_score drop > 20% week-over-week. Logs attrition summary (user count, drop %) to `ingestion_run_log`.
- `supabase/functions/health/index.ts` — GET `/functions/v1/health`. No auth. Returns `{ status, version, checks, timestamp, latency_ms }`. Checks: database connectivity, `event_weight_config` populated. Reads version from `app_config`. Returns 200 OK or 503 degraded.

### Changed
- `screens/HomeScreen.js` — Added `tracker` import. Tracks `HOME_FEED_VIEWED` event on every focus via `useFocusEffect`. Fires after `fetchProfile()`.
- `screens/CartScreen.js` — Added `CART_ACCEPTED` tracking in `cycleStatus`: fires when the last active item is marked purchased (all items complete).
- `screens/ReceiptUploadScreen.js` — Added `trackPurchaseCompleted` call in `confirmReceipt`, immediately after the existing `trackReceiptUploaded`. Includes `retailer_key`, `cart_value_cents`, `savings_cents`, `item_count`.
- `screens/ProfileScreen.js` — Added `wealthData` state; fetches `GET /functions/v1/get-wealth-momentum` on mount (non-critical, silently ignored if fails). Displays a 3-stat wealth card (Lifetime Saved, Velocity, Inflation Shield) above the menu sections.
- `App.js` — Added `tracker` import. On session load and `SIGNED_IN`: calls `tracker.setAccessToken`, `setDefaultUserId`, `setDefaultSessionId`, and tracks `APP_OPENED`. On `SIGNED_OUT`: clears `setAccessToken('')`.

### Fixed
- `supabase/migrations/002_rls_hardening.sql` — Rewritten after live DB audit: all tables already had RLS. Migration now only drops `model_predictions_select_own` and adds `recommendation_exposures_update_own` UPDATE policy.
- `supabase/functions/ingest-event/index.ts` — `api_rate_limit_log` insert now uses `endpoint` column (live table schema), not `function_name`.

### Database
- `app_config` — New table: `config_key text PK`, `config_value jsonb`, `updated_at timestamptz`. RLS enabled, service role only. Seeded with USDA benchmarks, CPI baseline, stack tuning, and version string.

### API
- `GET /functions/v1/health` — New endpoint. No auth. Returns system status, version from `app_config`, per-check latencies.
- `POST /functions/v1/run-preference-updater` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Forwards to `preference-updater`.
- `POST /functions/v1/run-graph-sync` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Triggers GitHub Actions `nightly-graph-sync.yml` via workflow_dispatch.
- `POST /functions/v1/run-wealth-check` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Returns attrition summary.

### Services
- pg_cron schedules active: `snippd-preference-updater` (hourly), `snippd-graph-sync` (01:50 UTC daily), `snippd-wealth-check` (04:00 UTC daily), `snippd-rate-limit-cleanup` (05:00 UTC daily).

## [0.3.0] — 2026-04-13

### Added
- `supabase/migrations/002_rls_hardening.sql` — Enables RLS on `stack_results` (read own policy); adds `api_rate_limit_log` table (service-role only, used for rate limiting); adds `recommendation_exposures` UPDATE policy for authenticated users; adds `source_key`, `stage`, `metadata` columns to `ingestion_run_log` and makes `week_of` nullable so Edge Functions can write request logs.
- `src/lib/neo4jClient.ts` — Neo4j driver singleton (`getSession`, `verifyConnectivity`, `closeDriver`, `isNeo4jConfigured`). Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` env vars.
- `src/services/graph/graphSchema.ts` — `initializeSchema(session)`: 7 node uniqueness constraints + 6 property/relationship indexes, all `IF NOT EXISTS`. Documents 10 relationship types.
- `src/services/graph/graphSync.ts` — `runGraphSync(db, session)`: syncs active users' preference scores, purchase history (90 days), cart acceptance events, and product co-occurrences into Neo4j nightly. Orchestrates `syncCohortSimilarity`.
- `src/services/graph/graphRetrieval.ts` — `getUserGraphContext(userId)`: 6 Cypher queries + 2 cohort lookups in parallel. Full graceful degradation. `getRelatedProducts(key)`: top-5 co-occurring products.
- `src/services/graph/graphCohort.ts` — `syncCohortSimilarity(session)`: pairwise cosine similarity, writes `SHOWS_PATTERN` edges. `getCohortPreferences` and `getCohortBrandPreferences`.

### Changed
- `supabase/functions/ingest-event/index.ts` — Added: rate limiting (200 req/user/hour via `api_rate_limit_log`, 1% cleanup of records > 2h old, 429 with `retry_after_seconds: 60`); strict input validation (event_name max 100 chars, session_id UUID, retailer_key alphanumeric+underscore max 50, category max 100, metadata max 10 keys depth ≤ 2, unknown field rejection); request logging to `ingestion_run_log` on every success and error with `source_key`, `stage`, `status`, `metadata`.
- `supabase/functions/stack-compute/index.ts` — Added: enhanced input validation (retailer_key pattern, items max 50, per-item UUID check, quantity 1–100, price ≤ 100 000 cents, offers max 10 per item); request logging to `ingestion_run_log`; supports `available_offers` as alias for `offers` in item payloads.
- `src/services/cartEngine.ts` — Integrated Neo4j graph context: rejected-category skip; category ×1.15; buy history +0.20; co-occurrence +0.10; cohort category +0.08; cohort brand +0.06.

### Fixed
- `.github/workflows/nightly-graph-sync.yml` — converted `options` from inline YAML array to block list format so GitHub Actions registers the workflow.

### Database
- `stack_results` — RLS enabled; `stack_results_select_own` policy added.
- `model_predictions` — Removed `model_predictions_select_own` policy; service role only.
- `recommendation_exposures` — Added `recommendation_exposures_update_own` policy (authenticated users can update their own rows).
- `api_rate_limit_log` — New table: `id`, `user_id`, `function_name`, `request_at`. RLS enabled, service role only.
- `ingestion_run_log` — Added columns: `source_key text`, `stage text`, `metadata jsonb`. `week_of` made nullable.

### API
- `POST /functions/v1/ingest-event` — Rate limited: 200 req/user/hour. Strict field whitelist. Validation errors return 400 with descriptive message. Rate limit returns 429 `{ error, retry_after_seconds: 60 }`.
- `POST /functions/v1/stack-compute` — Validates retailer_key pattern, items count (1–50), per-item fields (UUID, qty 1–100, price ≤ $1000). Supports `available_offers` alias.

### Added
- `.github/workflows/nightly-graph-sync.yml` — GitHub Actions cron at `0 2 * * *` (02:00 UTC). Steps: checkout → Node 20 setup → `npm ci` → Neo4j connectivity check → `graphSchema.ts` (idempotent schema check) → `graphSync.ts` (full sync). `workflow_dispatch` with `skip_co_occurrences` and `skip_cohort` inputs for manual partial runs. Posts run summary to GitHub Actions step summary.
- `scripts/set-github-secrets.sh` — reads `.env` and pushes all 6 required secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`) to GitHub Actions via `gh secret set`.
### Fixed
- `src/services/graph/graphSync.ts` — CLI entry point now reads `SKIP_CO_OCCURRENCES` and `SKIP_COHORT` env vars, passed by the GitHub Actions workflow dispatch inputs.
- `src/lib/neo4jClient.ts` — `getSession()` now reads `NEO4J_DATABASE` env var (falling back to `'neo4j'`). Required for AuraDB Free where the database name is the instance ID, not `'neo4j'`.
- `supabase/functions/admin-graph-stats/index.ts` — `runCypher()` reads `NEO4J_DATABASE` env var for the HTTP Transaction API path (`/db/{db}/tx/commit`). Was hardcoded to `/db/neo4j/...`.
- `supabase/functions/graph-insights/index.ts` — same `NEO4J_DATABASE` fix for HTTP Transaction API path.
- `src/services/graph/graphSync.ts` — `syncUserPreferences()` now falls back to `event_stream` derivation when `user_preference_scores` table doesn't exist (error code `42P01`). `syncPurchaseHistory()` handles both `normalized_key` and `normalized_name` column variants. `syncCoOccurrences()` rewritten to use `receipt_items` grouped by `receipt_id` (production schema) instead of `stack_candidates.items` which doesn't exist in production.
- `src/services/graph/graphCohort.ts` — `LIMIT` parameters wrapped with `neo4j.int()` to prevent `'2000.0' is not a valid INTEGER` error from Neo4j.
### Added
- `scripts/neo4j-setup.sh` — one-shot setup script: pushes `NEO4J_URI/USER/PASSWORD` to Supabase secrets, appends vars to `.env`, runs `graphSchema.ts` (schema init) then `graphSync.ts` (first data sync). Run once after provisioning Aura instance.
### Deployed
- `graph-insights` → ACTIVE v1 on project `gsnbpfpekqqjlmkgvwvb`
- `admin-graph-stats` → ACTIVE v1 on project `gsnbpfpekqqjlmkgvwvb`
- `supabase/functions/graph-insights/index.ts` — Edge Function `POST /functions/v1/graph-insights`. Auth: Bearer JWT. Accepts `{ items[] }` with product metadata. Runs 5 Cypher queries in parallel (preferred categories, preferred brands, buy history, cohort brands, co-occurrences). Returns `cart_insights[]` (up to 3 plain-language cart-level sentences) and `item_insights{}` (per-item signal + text keyed by `product_id`). Signal priority: buy_history → preferred_brand → preferred_category → cohort_brand → co_occurrence. Graceful degradation when Neo4j is unconfigured or unreachable.
### Changed
- `screens/CartOptionDetailScreen.js` — fetches `graph-insights` lazily after cart renders (won't block display). Renders "PERSONALISED FOR YOU" insights section (purple left-border card) with up to 3 cart-level insight bullets. Passes per-item `insight` prop to `ItemRow`, which now renders a coloured signal chip below each item's metadata line (icon + signal text, colour-coded by signal type).
### API
- New endpoint: `POST /functions/v1/graph-insights` — Neo4j-powered plain-language cart explainability. Returns per-item signals and cart-level insight sentences. Auth: Bearer JWT.
- `src/lib/neo4jClient.ts` — Neo4j driver singleton with `getSession()`, `verifyConnectivity()`, `closeDriver()`, `isNeo4jConfigured()`. Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` env vars; pool size 10, 5 s acquisition timeout.
- `src/services/graph/graphSchema.ts` — `initializeSchema(session)`: 7 uniqueness constraints + 6 property/relationship indexes, all `IF NOT EXISTS`. Documents full relationship vocabulary.
- `src/services/graph/graphSync.ts` — `runGraphSync(db, session)`: syncs active users' preference scores, purchase history (90 days), cart acceptance events, and product co-occurrences into Neo4j. Nightly CLI entry point.
- `src/services/graph/graphRetrieval.ts` — `getUserGraphContext(userId)`: runs 6 Cypher queries + 2 cohort lookups in parallel (preferred categories/stores/brands, rejected categories, buy history, co-occurrence keys, cohort categories, cohort brands). `UserGraphContext` now includes `cohortBrands: Set<string>`. Full graceful degradation. `getRelatedProducts(key)`: top-5 co-occurring products.
- `src/services/graph/graphCohort.ts` — `syncCohortSimilarity(session)`: loads per-user category preference vectors, computes pairwise cosine similarity in Node.js (capped at 2 000 users), writes `(u)-[:SHOWS_PATTERN {similarity}]->(v)` edges for pairs ≥ 0.50. `getCohortPreferences(userId, session)`: returns category names that high-similarity peers prefer but the user doesn't yet (used for +0.08 collaborative filtering boost in cart scoring).
- `docs/NEO4J_DEPLOY.md` — step-by-step runbook: Aura provisioning, env var setup, schema init, first data sync, nightly cron schedule, connectivity verification, scoring boost summary.
- `src/services/graph/graphCohort.ts` — added `getCohortBrandPreferences(userId, session)`: mirrors `getCohortPreferences` for Brand nodes; returns brand names peers prefer (PREFERS ≥ 0.5) but the user hasn't adopted (score < 0.35).
- `supabase/functions/admin-graph-stats/index.ts` — Edge Function `GET /functions/v1/admin-graph-stats`. Admin JWT auth. Queries Neo4j via HTTP Transaction API (no npm deps). Returns node counts (User/Product/Category/Brand/Store/Stack), relationship counts (PREFERS/BUYS/CO_OCCURS_WITH/SHOWS_PATTERN/REJECTS/ACCEPTS/DISMISSES), top categories, top brands, top co-occurring pairs, top cohort pairs. Degrades to zero counts if Neo4j not configured.
- `screens/AdminGraphScreen.js` — admin-only graph viewer screen. Connection status banner, 2×3 node/rel metric card grids, top-10 tables for categories/brands/co-occurrences/cohort pairs. Accessible from AdminPulseScreen → "Memory Graph" row.
### Changed
- `src/services/cartEngine.ts` — integrated Neo4j graph context into scoring: skips rejected categories; preferred-category ×1.15; buy history +0.20; co-occurrence +0.10; cohort category +0.08; cohort brand +0.06.
- `screens/AdminPulseScreen.js` — added "Memory Graph" nav row linking to `AdminGraphScreen`.
- `App.js` — registered `AdminGraphScreen` in ProfileStackNav.
- `screens/ProfileScreen.js` — added "Savings" menu section with "Wealth Momentum" entry → navigates to `WealthMomentum` screen.
- `App.js` — registered `WealthMomentum` screen in ProfileStackNav so it is reachable from the Profile tab.
- `src/services/cartEngine.ts` — `buildCartOptions(userId, retailerKey, weekOf, db)` generates 3 personalised cart options (MAX_SAVINGS / BALANCED / CONVENIENCE). Loads `user_state_snapshots`, `user_preference_scores`, `budgets`, `stack_candidates`; runs `CouponStackingEngine.compute()` on each candidate; scores by category 40% + retailer 30% + brand 20% + deal_type 10%; calls `scoreStackForUser` for acceptance probability; logs `recommendation_exposures`.
- `src/services/cartEngine.test.ts` — 9-test standalone ts-node suite covering all 3 cart types, ordering, max_savings savings_pct, convenience item_count, budget_fit true/false, non-empty items, retailer_set correctness, savings_pct calculation, empty-candidates case.
- `supabase/functions/get-cart-options/index.ts` — Edge Function `GET /functions/v1/get-cart-options?retailer_key=&week_of=`. Auth: Bearer JWT. Loads policy inline, scores candidates, builds 3 carts, logs exposures. Target: under 2 seconds.
- `screens/CartOptionsScreen.js` — swipeable cart options screen. Fetches from `get-cart-options`, renders 3 horizontal-scroll `CartCard` components with savings ring, stats row, explanation bullets, acceptance probability, and "Use This Cart" CTA. Fires `trackStackViewed` per impression, `trackCartRejected` on dismiss. Navigates to `CartOptionDetail`.
- `screens/CartOptionDetailScreen.js` — full item list detail for a selected cart. Shows summary bar (savings/total/pct/items), budget chip, store row, explanation bullets, AI match score, and scrollable `ItemRow` list. Sticky footer with "Try Another" (`trackCartRejected` → goBack) and "Accept This Cart" (`trackCartAccepted` + alert → popToTop).
- `src/services/receiptParser.ts` — `parseReceipt(imageUrl, retailerKey, supabase)`: downloads from Supabase storage, OCRs via Gemini Vision (`gemini-1.5-flash`) with GPT-4V fallback, normalizes item names to `normalized_key`, converts amounts to cents. Returns `ParsedReceipt`.
- `src/services/wealthEngine.ts` — `computeAndSave(userId, receiptId, supabase)`: runs `calculateInflationShield` (USDA benchmark delta), `calculateSmartStackingSavings` (promo cents), `calculateVelocityScore` (4-week trend, 0–1), `calculateWealthMomentum` `(shield+stacking)×(1+v/10)`, `projectAnnualWealth` (×52), `generateTransparencyReport` (formula + breakdown). Writes to `wealth_momentum_snapshots`.
- `supabase/functions/process-receipt/index.ts` — Edge Function `POST /functions/v1/process-receipt`. Auth: Bearer JWT. Reads `receipt_uploads`, calls `parseReceipt` + `computeAndSave`, writes `receipt_items`, updates upload status to `parsed`, fires `purchase_completed` event.
- `supabase/functions/get-wealth-momentum/index.ts` — Edge Function `GET /functions/v1/get-wealth-momentum`. Auth: Bearer JWT. Returns last 8 snapshots, current velocity, lifetime savings, inflation shield total, transparency report, and `time_series[]` for charting.
- `screens/WealthMomentumScreen.js` — dashboard screen: hero annual projection, lifetime savings + inflation shield stat cards, savings velocity gauge with label (Accelerating/Steady/Building), weekly bar chart (last 8 points), recent snapshots list, expandable transparency report accordion. Connects to `GET /get-wealth-momentum`. Fires `WEALTH_SNAPSHOT_VIEWED` event.
- `src/services/ingestion/flyerParser.ts` — `parseFlyer(ingestionJobId, supabase)`: reads `ingestion_jobs`, downloads PDF from `deal-pdfs` bucket, OCRs via `gemini-1.5-flash`, scores deal confidence, writes to `flyer_deal_staging`, updates job status to `parsed`. Returns deal count.
- `src/services/ingestion/offerNormalizer.ts` — `normalizeAndPublish(ingestionJobId, supabase)`: reads staged deals, maps to `OfferType`, converts to cents, upserts `offer_sources` on `dedupe_key`, matches digital coupons via configurable `coupon_match_mode`, writes `offer_matches` + `stack_candidates` (rank = `savings_pct×0.6 + hasCoupon×0.4`), writes `flyer_publish_log`.
- `src/services/ingestion/couponIngester.ts` — `ingestDigitalCoupons(retailerKey, weekOf, supabase)`: loads active `digital_coupons`, matches to `offer_sources` using retailer's `coupon_match_mode` (exact_name/brand_or_name/token_overlap), upserts `offer_matches`, updates `stack_candidates.stack_rank_score`.
- `src/services/ingestion/ingestionWorker.ts` — `startIngestionWorker(db)`: polls `ingestion_jobs` (status='queued', limit=5) every 30 minutes, runs `parseFlyer → normalizeAndPublish → ingestDigitalCoupons` per job, handles retries (max 3), writes `ingestion_run_log`.
- `supabase/functions/trigger-ingestion/index.ts` — Edge Function `POST /functions/v1/trigger-ingestion`. Service-role auth only. Accepts `{retailer_key, week_of, storage_path}`, creates `ingestion_jobs` row, returns `job_id`.
- `supabase/migrations/20260413_ingestion_pipeline.sql` — idempotent migration: `ingestion_jobs`, `flyer_deal_staging`, `offer_sources`, `digital_coupons` (with `is_active`, `normalized_key`), `offer_matches` (adds ingestion columns), `stack_candidates`, `flyer_publish_log`, `ingestion_run_log`, `app_config` (with USDA benchmark seed), retailer `coupon_match_mode` policy seeds.
- `docs/DECISIONS.md` — 8 architecture decision records with rationale (Supabase as source of truth, table-driven retailer rules, configurable event weights, rebate separation, normalized scores, 15-min policy cache, pure stacking functions, dual tsconfig).
- `docs/VERSION` — current version file.
- `.claude/CLAUDE.md` — standing session instructions with 7 rules including session summary format.
- `scripts/bump-version.sh` — version bumping script; takes `patch|minor|major` argument, rewrites CHANGELOG.md and docs/VERSION.
### Changed
- `App.js` — registered `CartOptionsScreen`, `CartOptionDetailScreen`, and `WealthMomentumScreen` in CartStackNav.
- `screens/CartScreen.js` — added Smart Carts banner (mint-green entry point) that navigates to `CartOptions` with `retailer_key='publix'`.
- `CHANGELOG.md` — restructured to match exact format spec (Snippd header, auto-maintained note, empty category placeholders under [Unreleased]).
- `docs/ARCHITECTURE.md` — full rewrite with three-plane diagram, all data flow sequences (ingestion, stacking, intelligence), complete module directory.
- `docs/DATABASE.md` — full rewrite documenting all behavioral intelligence tables with columns, indexes, RLS policies, seed values, and analytics views. Added app-layer tables list.
- `docs/API.md` — full rewrite with complete request/response examples, all offer type fields, all warning codes.
- `docs/SERVICES.md` — full rewrite with shopping mode inference table, all exported function signatures, env var tables, recommended schedules.
- `docs/STACKING_ENGINE.md` — full rewrite with BOGO model details, rounding mode table, all 11 validation rules, full policy table by retailer, example stack input/output.
- `docs/EVENT_TRACKING.md` — full rewrite with all 40 events, all 30 event_weight_config values, 5 preference dimensions, decay formula, step-by-step coupon clip example.
### Fixed
- `src/services/receiptParser.ts` — typed caught errors as `(e as Error).message` to resolve `TS18046: 'e' is of type 'unknown'`
- `src/services/wealthEngine.ts` — guarded optional `promo_savings_cents` with `?? 0` to resolve `TS18048: possibly undefined`
### Database
### Database
- New tables: `ingestion_jobs`, `flyer_deal_staging`, `offer_sources`, `digital_coupons`, `stack_candidates`, `flyer_publish_log`, `ingestion_run_log`, `app_config` — see `supabase/migrations/20260413_ingestion_pipeline.sql`
- `offer_matches` — extended with ingestion columns (`offer_source_id`, `coupon_source_id`, `final_price_cents`, etc.)
### API
- New endpoint: `POST /functions/v1/process-receipt` — receipt OCR + wealth computation pipeline. Auth: Bearer JWT.
- New endpoint: `GET /functions/v1/get-wealth-momentum` — wealth history, velocity, lifetime savings, time-series chart data. Auth: Bearer JWT.
- New endpoint: `POST /functions/v1/trigger-ingestion` — creates an `ingestion_jobs` row, service role auth only.
### Services
- `src/services/receiptParser.ts` — Gemini Vision / GPT-4V receipt OCR, returns `ParsedReceipt` with cents-normalized items.
- `src/services/wealthEngine.ts` — inflation shield, stacking savings, velocity score, wealth momentum, annual projection, transparency report; writes `wealth_momentum_snapshots`.
- `src/services/ingestion/flyerParser.ts` — PDF ingestion via Gemini Vision, writes `flyer_deal_staging`.
- `src/services/ingestion/offerNormalizer.ts` — normalizes staged deals → `offer_sources` + `stack_candidates`.
- `src/services/ingestion/couponIngester.ts` — matches active digital coupons to `offer_sources`, updates `stack_candidates`.
- `src/services/ingestion/ingestionWorker.ts` — 30-minute polling worker, processes `ingestion_jobs` queue.

---

## [0.2.0] — 2026-04-12

### Added
- `supabase/migrations/001_behavioral_intelligence_safe.sql` — safe/idempotent migration consolidating all behavioral intelligence tables. Adds `retailer_rules`, `smart_alerts` tables; adds `normalized_score` column; seeds 30 event weights; seeds Publix/Kroger/Walmart/Target/CVS coupon policies and stacking rules; creates 3 analytics views (`v_user_preference_summary`, `v_stack_performance`, `v_recommendation_funnel`).
- `supabase/functions/stack-compute/index.ts` — Edge Function. Loads retailer policy from DB, validates offer combinations, applies 8 offer types in canonical order, returns full `StackResult` with per-line breakdown, warnings, and explanation.
- `src/types/stacking.ts` — computation-facing TypeScript types: `OfferType`, `BogoModel`, `RoundingMode`, `WarningCode`, `StackOffer`, `StackItem`, `AppliedOffer`, `StackWarning`, `StackLineResult`, `StackExplanation`, `StackResult`, `RetailerPolicy`, `ValidationResult`, `StackEngineConfig`, `DEFAULT_POLICY`.
- `src/types/events.ts` — 40-event `EventName` union; `InboundEvent`, `StoredEvent`, `RecommendationExposure`, `PreferenceScore`, `UserStateSnapshot`, `VertexFeatureVector`, `WealthMomentumInput`, API-facing stacking types.
- `src/lib/eventTracker.ts` — `SnippdEventTracker` singleton with auto-batching queue, 3-retry exponential backoff, 30+ typed convenience methods.
- `src/services/preferenceUpdater.ts` — 30-day half-life temporal decay, shopping mode inference, 4 responsiveness scores written to `user_state_snapshots`.
- `src/services/stacking/policyLoader.ts` — loads `RetailerPolicy` from `retailer_coupon_parameters` + `retailer_rules`, 15-minute in-process cache.
- `src/services/stacking/stackValidator.ts` — `validateOfferSet()` with 11 validation checks in order.
- `src/services/stacking/stackCalculator.ts` — `calculateStackLine()` applies offers in canonical order with rounding and $0 floor.
- `src/services/stacking/stackingEngine.ts` — `CouponStackingEngine` class with `compute()` and `computeWithPolicy()`.
- `src/services/vertexFeatureBuilder.ts` — `buildFeatureVector()`, `scoreStackForUser()` with Vertex AI + heuristic fallback, `checkWealthAttrition()`.
- `src/services/stacking/__tests__/stackingEngine.test.ts` — 16 tests, all passing.
- `tsconfig.test.json` — CommonJS tsconfig for ts-node.
- `CHANGELOG.md` — auto-maintained change log.
- `CLAUDE.md` — mandatory session rules for Claude Code.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/SERVICES.md`, `docs/STACKING_ENGINE.md`, `docs/EVENT_TRACKING.md` — living documentation system.
- `docs/DECISIONS.md` — architecture decision records.
- `docs/VERSION` — current version file.
- `.claude/CLAUDE.md` — standing instructions with session summary rule.
- `scripts/bump-version.sh` — version bumping script.

### Database
- New table: `retailer_rules` — granular per-retailer stacking rules (UNIQUE on retailer_key + rule_key).
- New table: `smart_alerts` — wealth attrition and budget alerts.
- New column: `user_preference_scores.normalized_score` — 0–1 score relative to user max.
- New analytics views: `v_user_preference_summary`, `v_stack_performance`, `v_recommendation_funnel`.
- Preference upsert trigger: `trg_event_stream_preference` fires after INSERT on `event_stream`.
- Extended `event_weight_config` seed: 30 events weighted.

### API
- New endpoint: `POST /functions/v1/stack-compute` — coupon stacking engine. Auth: Bearer JWT.

### Services
- `src/services/preferenceUpdater.ts` — adds temporal decay, shopping mode, responsiveness scores.
- `src/services/vertexFeatureBuilder.ts` — Vertex AI integration with heuristic fallback.

---

## [0.1.0] — 2026-04-12

### Added
- Initial behavioral intelligence layer.
- `supabase/functions/ingest-event/index.ts` — event ingest Edge Function with batch support, JWT + API key auth, recommendation exposure logging.
- `event_stream` table with preference upsert trigger.
- `recommendation_exposures` table.
- `user_preference_scores` table.
- `user_state_snapshots` table.
- `model_predictions` table.
- `wealth_momentum_snapshots` table.
- `event_weight_config` table with 18 weighted events.
- `retailer_coupon_parameters` table.
- `offer_matches` table.
- `stack_results` table.
- React Native / Expo app with 30+ screens.
