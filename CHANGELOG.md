# Snippd — Change Log
Auto-maintained by Claude Code. Updated after every change.
Format: [version] — YYYY-MM-DD

## [Unreleased]
### Fixed
- `supabase/migrations/002_rls_hardening.sql` — Rewritten after live DB audit revealed all tables already have RLS and the correct schema. Migration now only does the two things actually missing: drops `model_predictions_select_own` and adds `recommendation_exposures_update_own` UPDATE policy.
- `supabase/functions/ingest-event/index.ts` — `api_rate_limit_log` insert now uses `endpoint` column (the live table column name), not `function_name`.

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
