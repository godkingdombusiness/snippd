# Snippd — Node.js Services Reference

> Background services that run outside of the Supabase Edge Functions runtime.
> All require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` environment variables.
> All services are in `src/services/` and use CommonJS (`tsconfig.test.json`).

---

## preferenceUpdater

**File:** `src/services/preferenceUpdater.ts`
**Purpose:** Nightly batch job that applies temporal decay to preference scores, normalizes them, and writes `user_state_snapshots`.

### What it does

1. Loads all event weights from `event_weight_config`
2. Loads recent events from `event_stream` (up to 50,000 rows, descending)
3. Loads existing `user_preference_scores` for all active users
4. Applies **30-day half-life temporal decay** to stale scores:
   - `DECAY_PER_DAY = 0.5^(1/30) ≈ 0.9772`
   - `decayed_score = score × DECAY_PER_DAY^(age_in_days)`
5. Accumulates new event weights on top of decayed scores
6. Normalizes scores per user: `normalized_score = score / user_max_abs_score`
7. Upserts all rows to `user_preference_scores`
8. Builds `user_state_snapshots` per user:
   - `budget_stress_level` — from `budget_exceeded` + `item_removed_from_cart` events
   - `shopping_mode` — inferred from score distribution (see below)
   - `coupon_responsiveness` — from `coupon_clipped`, `coupon_redeemed`, `coupon_viewed`
   - `bogo_responsiveness` — from `stack_applied`, `stack_viewed`, `item_added_to_cart`
   - `multi_store_responsiveness` — from `store_selected`
   - `substitution_responsiveness` — from `item_substituted`

### Shopping mode inference

| Mode | Winning signals |
|---|---|
| `deal_hunter` | `coupon_clipped` + `coupon_redeemed` + `stack_applied` + `stack_viewed` |
| `convenience` | `cart_accepted` + `checkout_completed` + `purchase_completed` (× 0.8) |
| `budget_conscious` | `budget_set` + `item_removed_from_cart` + `budget_exceeded` |
| `loyal_brand` | High brand-specific scores (brand ≠ '') |
| `variety_seeker` | High category diversity (unique categories count × 0.3) |
| `unknown` | No dominant signal |

### Exported API
```typescript
export async function runPreferenceUpdater(db: SupabaseClient): Promise<{
  users: number;    // distinct users processed
  rows: number;     // preference score rows upserted
  snapshots: number; // user_state_snapshots written
}>
```

### How to run
```bash
# One-time run
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
npx ts-node --project tsconfig.test.json src/services/preferenceUpdater.ts

# Scheduled (recommended: nightly at 2am UTC)
# Use a cron job, Supabase scheduled function, or Cloud Scheduler
```

### Required env vars
| Var | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) |

### Recommended schedule
**Nightly at 02:00 UTC.** Processes up to 50,000 events per run. Idempotent — safe to re-run.

---

## vertexFeatureBuilder

**File:** `src/services/vertexFeatureBuilder.ts`
**Purpose:** Builds Vertex AI feature vectors from user state, scores stacks, and detects wealth attrition.

### Exported functions

#### buildFeatureVector(userId, supabase) → VertexFeatureVector
Reads `user_state_snapshots` + `user_preference_scores` + `wealth_momentum_snapshots` (last 4).

Returns:
```typescript
{
  user_id: string;
  budget_stress_level: number;        // 0–1
  shopping_mode: ShoppingMode;
  coupon_responsiveness: number;      // 0–1
  bogo_responsiveness: number;        // 0–1
  multi_store_responsiveness: number; // 0–1
  substitution_responsiveness: number;// 0–1
  avg_weekly_spend_cents: number;     // 0 until purchase pipeline runs
  avg_weekly_savings_cents: number;   // from last 4 wealth snapshots
  preferred_categories: string[];     // top 5 by score
  preferred_brands: string[];         // top 5 by score
  preferred_retailers: string[];      // top 5 by score
  snapshot_at: string;
}
```

#### scoreStackForUser(userId, stack, supabase) → number (0–1)
1. Calls `buildFeatureVector()`
2. If `VERTEX_ENDPOINT_URL` set: POSTs feature vector to Vertex AI, returns prediction score
3. Fallback (Vertex unavailable): heuristic formula:
   ```
   savings_ratio        × 0.40
   coupon_responsiveness × 0.25
   bogo_responsiveness   × 0.15
   (1 - budget_stress)   × 0.10
   relevance_boost        = 0.10 if preferred retailer or category match
   warning_penalty        = clamp(1 - warnings×0.05) × 0.10
   ```

#### checkWealthAttrition(userId, supabase) → WealthAttritionResult
Reads last 4 `wealth_momentum_snapshots`. Computes:
```
probability = avg_stress×0.40 + (1-avg_velocity)×0.30
            + stress_alert_rate×0.20 + savings_decline×0.10
```
If `probability > 0.70`: inserts a `smart_alerts` row of type `wealth_attrition`.

Returns: `{ probability, alert_created, alert_id? }`

### How to run
```bash
# Build feature vector for a user
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
npx ts-node --project tsconfig.test.json \
  src/services/vertexFeatureBuilder.ts <user_id>
```

### Required env vars
| Var | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `VERTEX_ENDPOINT_URL` | (Optional) Vertex AI prediction endpoint. If unset, heuristic fallback is used. |

### Recommended schedule
**On-demand** during stack scoring, or nightly batch to pre-compute attrition alerts.

---

## cartEngine

**File:** `src/services/cartEngine.ts`
**Purpose:** Core product service. Generates 3 personalised cart options (MAX_SAVINGS, BALANCED, CONVENIENCE) for a user at a retailer for a given week.

### What it does

1. Loads `user_state_snapshots` (budget_stress, shopping_mode, responsiveness scores)
2. Loads `user_preference_scores` (top 200 by normalized_score)
3. Loads `budgets` (weekly_budget_cents)
4. Loads `stack_candidates` for retailerKey × weekOf (limit 40, ordered by `stack_rank_score DESC`)
5. Runs `CouponStackingEngine.compute()` on each candidate
6. Scores each candidate by preferences:
   - Category score × 0.40
   - Retailer score × 0.30
   - Brand score × 0.20
   - Deal type score × 0.10
7. Selects items for each cart type:
   - **MAX_SAVINGS**: sorted by `savingsPct DESC`, up to 25 items, cross-store allowed
   - **BALANCED**: `(savingsPct × 0.50 + prefScore × 0.50)`, single store, up to 18 items
   - **CONVENIENCE**: sorted by `prefScore DESC`, single store, up to 12 items
8. Calls `scoreStackForUser()` for cart acceptance probability (Vertex or heuristic)
9. Logs a `recommendation_exposure` for each cart shown
10. Returns all 3 carts sorted: max_savings → balanced → convenience

### Exported API
```typescript
export async function buildCartOptions(
  userId: string,
  retailerKey: string,
  weekOf: string,        // 'YYYY-MM-DD'
  db: SupabaseClient,
  sessionId?: string,
): Promise<BuildCartOptionsResult>

export type CartType = 'max_savings' | 'balanced' | 'convenience';

export interface CartOption {
  cart_id: string;
  cart_type: CartType;
  retailer_set: string[];
  items: CartItem[];
  subtotal_before_savings_cents: number;
  subtotal_after_savings_cents: number;
  total_savings_cents: number;
  savings_pct: number;
  store_count: number;
  item_count: number;
  explanation: string[];
  reason_codes: string[];
  budget_fit: boolean;
  model_version: string;
  cart_acceptance_probability: number;
}
```

### How to run
```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
npx ts-node --project tsconfig.test.json \
  src/services/cartEngine.ts <user_id> [retailer_key] [week_of]
```

### Run tests
```bash
npx ts-node --project tsconfig.test.json src/services/cartEngine.test.ts
```
9 tests. No Supabase required — uses mock DB.

### Required env vars
| Var | Description |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key |
| `VERTEX_ENDPOINT_URL` | (Optional) Vertex AI endpoint for acceptance scoring |
| `MODEL_VERSION` | (Optional) Model version tag, defaults to `v1.0.0` |

### Recommended schedule
Called on-demand by the `get-cart-options` Edge Function, or run nightly to pre-compute carts into `stack_candidates` for fast retrieval.

---

## receiptParser

**File:** `src/services/receiptParser.ts`
**Purpose:** OCRs receipt images using Gemini Vision (or GPT-4V) and returns structured `ParsedReceipt` data. Called by the `process-receipt` Edge Function.

### Exported API
```typescript
export async function parseReceipt(
  imageUrl: string,      // Supabase storage path (bucket: 'receipts')
  retailerKey: string,
  supabase: SupabaseClient,
): Promise<ParsedReceipt>
```

### What it does
1. Downloads image from Supabase storage bucket `receipts`
2. Converts blob to base64
3. POSTs to Gemini Vision (`gemini-1.5-flash`) or GPT-4V with a structured extraction prompt
4. Parses JSON response into `ParsedReceiptItem[]`
5. Normalizes each `product_name` → `normalized_key` via `toLowerCase().trim()`
6. Converts dollar amounts to cents
7. Estimates tax at 8% if not on receipt

### Env vars
| Var | Description |
|---|---|
| `GEMINI_API_KEY` | Gemini Vision API key (primary) |
| `OPENAI_API_KEY` | GPT-4V key (fallback) |
| `VISION_API` | `gemini` (default) or `openai` |

---

## wealthEngine

**File:** `src/services/wealthEngine.ts`
**Purpose:** Calculates wealth momentum from a processed receipt, stores snapshots, and generates transparency reports. Called by `process-receipt` Edge Function.

### Exported functions

#### calculateInflationShield(receiptItems, usdaData) → number (cents)
For each receipt item with a matching USDA category: `(USDA_avg - unit_price) × qty`. Sum positives only.

#### calculateSmartStackingSavings(receiptItems) → number (cents)
Sum of all `promo_savings_cents` on receipt items.

#### calculateVelocityScore(userId, currentWeekSavings, supabase) → number (0–1)
Fetches last 4 weeks of `wealth_momentum_snapshots`. Returns `clamp(current / 4-week-avg / 2, 0, 1)`. Returns `0.5` if insufficient history.

#### calculateWealthMomentum(shield, stacking, velocity) → number (cents)
```
momentum = (shield + stacking) × (1 + velocity/10)
```

#### projectAnnualWealth(weeklyMomentum) → number (cents)
`weeklyMomentum × 52`

#### generateTransparencyReport(shield, stacking, velocity, inputs)
Returns object with `math_version`, `data_sources[]`, `formula` string, and `breakdown[]` array explaining each component.

#### computeAndSave(userId, receiptId, supabase) → WealthMomentumResult
Orchestrates all functions:
1. Reads `receipt_items` for the receipt
2. Fetches USDA benchmarks from `app_config` key `usda_category_benchmarks`
3. Runs all calculations
4. Writes row to `wealth_momentum_snapshots`
5. Returns `WealthMomentumResult`

### Recommended schedule
Called on-demand by `process-receipt`. Also safe to call nightly as a batch for active users.

---

## Ingestion pipeline

All files in `src/services/ingestion/`. Together they form the pipeline that converts raw weekly-ad PDFs into live `stack_candidates` consumed by the cart engine.

```
trigger-ingestion Edge Function
  → ingestion_jobs (status='queued')
  → ingestionWorker polls every 30 min
      → flyerParser.parseFlyer()        downloads PDF, Gemini OCR, writes flyer_deal_staging
      → offerNormalizer.normalizeAndPublish()  upserts offer_sources + stack_candidates
      → couponIngester.ingestDigitalCoupons()  matches digital coupons, updates stack_rank_score
      → ingestion_run_log (one row per job run)
```

### flyerParser

**File:** `src/services/ingestion/flyerParser.ts`

```typescript
export async function parseFlyer(
  ingestionJobId: string,
  supabase: SupabaseClient,
): Promise<number>   // returns deal count
```

1. Reads `ingestion_jobs` for `storage_path` and `retailer_key`
2. Downloads PDF from Supabase storage bucket `deal-pdfs`
3. Sends base64 image to `gemini-1.5-flash` with structured deal extraction prompt
4. Scores each deal for confidence (0–1): product_name + sale_price + regular_price + category + brand
5. Writes rows to `flyer_deal_staging` (status=`staged`, `needs_review=true` if confidence < 0.7)
6. Updates `ingestion_jobs` status → `parsed` with `deal_count`

### offerNormalizer

**File:** `src/services/ingestion/offerNormalizer.ts`

```typescript
export async function normalizeAndPublish(
  ingestionJobId: string,
  supabase: SupabaseClient,
): Promise<{ published: number; matched: number; candidates: number }>
```

For each staged deal:
- Builds `normalized_key`: `lowercase(brand + '_' + product_name)`, spaces → underscores
- Maps `deal_type` string → `OfferType` enum
- Converts dollar amounts to cents
- `expires_on` = Sunday of `week_of` week
- `dedupe_key` = `retailer_key::normalized_key::week_of`
- Upserts `offer_sources` on `dedupe_key`
- Matches against `digital_coupons` using retailer's `coupon_match_mode`
- Writes `offer_matches` (coupon + offer joined)
- Writes `stack_candidates`: `stack_rank_score = savings_pct×0.6 + has_coupon×0.4`
- Marks staging rows `published`, writes `flyer_publish_log`

### couponIngester

**File:** `src/services/ingestion/couponIngester.ts`

```typescript
export async function ingestDigitalCoupons(
  retailerKey: string,
  weekOf: string,
  supabase: SupabaseClient,
): Promise<{ coupons_processed: number; new_matches: number; candidates_updated: number }>
```

Matching modes (from `retailer_coupon_parameters.coupon_match_mode`):

| Mode | Logic |
|---|---|
| `exact_name` | `coupon.normalized_key === offer.normalized_key` |
| `brand_or_name` | Brand string match OR product name prefix overlap |
| `token_overlap` | ≥2 shared tokens (words > 2 chars) between normalized keys |

Default: `token_overlap`

### ingestionWorker

**File:** `src/services/ingestion/ingestionWorker.ts`

```typescript
export async function startIngestionWorker(db: SupabaseClient): Promise<void>
```

- Polls every **30 minutes** via `setInterval`
- Batch size: **5 jobs**
- Max attempts per job: **3** (marks `failed` after 3rd failure)
- Writes `ingestion_run_log` on every run (success or failure)

### How to run
```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
GEMINI_API_KEY=xxx \
npx ts-node --project tsconfig.test.json src/services/ingestion/ingestionWorker.ts
```

---

---

## Neo4j Memory Graph Services

The graph services sync Supabase behavioral data into Neo4j and retrieve context for cart scoring. Neo4j is optional — all retrieval functions degrade gracefully to empty defaults when `NEO4J_URI` is not set.

### Required env vars

| Var | Example | Description |
|---|---|---|
| `NEO4J_URI` | `neo4j+s://xxxx.databases.neo4j.io` | Neo4j Aura or self-hosted URI |
| `NEO4J_USER` | `neo4j` | Database user (default: `neo4j`) |
| `NEO4J_PASSWORD` | `<password>` | Database password |
| `NEO4J_DATABASE` | `neo4j` | Database name. On AuraDB Free set this to the instance ID (it differs from `'neo4j'`). Defaults to `'neo4j'` if unset. |

### neo4jClient

**File:** `src/lib/neo4jClient.ts`

```typescript
export function getSession(database?: string): Session
export async function verifyConnectivity(): Promise<void>
export async function closeDriver(): Promise<void>
export function isNeo4jConfigured(): boolean
```

Singleton driver. Pool size: 10 connections, 5 s acquisition timeout.

### graphSchema

**File:** `src/services/graph/graphSchema.ts`

```typescript
export async function initializeSchema(session: Session): Promise<void>
```

Run once at setup or on deploy. Creates 7 uniqueness constraints and 6 property/relationship indexes (`IF NOT EXISTS`).

### graphSync

**File:** `src/services/graph/graphSync.ts`

```typescript
export async function syncUserPreferences(userId, db, neo4jSession): Promise<void>
export async function syncPurchaseHistory(userId, db, neo4jSession): Promise<void>
export async function syncCartAcceptance(userId, db, neo4jSession): Promise<void>
export async function syncCoOccurrences(db, neo4jSession): Promise<number>
export async function runGraphSync(db, neo4jSession, options?): Promise<{users, pairs}>
```

- `syncUserPreferences`: writes `PREFERS` (score ≥ 0.35) / `REJECTS` edges for Category, Brand, Store nodes.
- `syncPurchaseHistory`: aggregates `receipt_items` from last 90 days into `BUYS` edges with purchase count.
- `syncCartAcceptance`: reads `event_stream` for `cart_accepted`/`cart_rejected`, writes `ACCEPTS`/`DISMISSES` edges.
- `syncCoOccurrences`: pairs all products in each `stack_candidates.items` array → `CO_OCCURS_WITH` edges.
- `runGraphSync`: orchestrator — finds active users (event in last 30 days), runs all 3 per-user syncs, then runs co-occurrence sync.

### How to run
```bash
SUPABASE_URL=https://xxx.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=xxx \
NEO4J_URI=neo4j+s://xxx.databases.neo4j.io \
NEO4J_USER=neo4j \
NEO4J_PASSWORD=xxx \
npx ts-node --project tsconfig.test.json src/services/graph/graphSync.ts
```

Recommended schedule: **nightly at 2 AM** (co-occurrences are expensive — limit 500 candidates).

### graphRetrieval

**File:** `src/services/graph/graphRetrieval.ts`

```typescript
export async function getUserGraphContext(userId: string): Promise<UserGraphContext>
export async function getRelatedProducts(normalizedKey: string): Promise<RelatedProduct[]>
```

`UserGraphContext` shape:
- `preferredCategories` — top 5 categories by PREFERS score
- `preferredStores` — top 3 stores by PREFERS score
- `preferredBrands` — top 10 brands by PREFERS score
- `rejectedCategories` — string array of REJECTS category names
- `buyHistory` — `Map<normalized_key, purchase_count>` (top 100)
- `coOccurrenceKeys` — `Set<normalized_key>` of all co-occurring products
- `cohortCategories` — `Set<category_name>` — categories peers prefer, user doesn't yet
- `cohortBrands` — `Set<brand_name>` — brands peers prefer, user hasn't tried

Returns `EMPTY_CONTEXT` (all empty) if Neo4j is unavailable — never throws.

### graphCohort

**File:** `src/services/graph/graphCohort.ts`

```typescript
export async function syncCohortSimilarity(
  neo4jSession: Session,
): Promise<{ usersProcessed: number; edgesWritten: number }>

export async function getCohortPreferences(
  userId: string,
  neo4jSession: Session,
): Promise<Set<string>>  // → cohortCategories in UserGraphContext

export async function getCohortBrandPreferences(
  userId: string,
  neo4jSession: Session,
): Promise<Set<string>>  // → cohortBrands in UserGraphContext
```

**Algorithm:**
1. Loads category preference vectors for all users with ≥ 3 category `PREFERS` edges (capped at 2 000 users)
2. Computes pairwise cosine similarity in Node.js memory
3. For each user, keeps the top 10 most similar peers (similarity ≥ 0.50)
4. Writes `(u)-[:SHOWS_PATTERN {similarity, computed_at}]->(v)` edges

**`getCohortPreferences`:** returns category names where a peer has `PREFERS.score ≥ 0.5` and the requesting user has `score < 0.35` (or no PREFERS edge). Used for the +0.08 collaborative filtering boost in `cartEngine.ts`.

**Called by:** `runGraphSync` (nightly, after co-occurrence sync). Can also be run standalone.

**Tuning constants** (in `graphCohort.ts`):

| Constant | Default | Meaning |
|---|---|---|
| `MIN_SIMILARITY` | 0.50 | Minimum cosine similarity for SHOWS_PATTERN edge |
| `MIN_PREF_DIMENSIONS` | 3 | User needs ≥ N category preferences to participate |
| `MAX_USERS` | 2 000 | Safety cap for in-memory pairwise computation |
| `MAX_PEERS_PER_USER` | 10 | Top-N peers kept per user |
| `WEAK_PREF_THRESHOLD` | 0.35 | Score below this qualifies for cohort boost |

---

## Stacking engine (library, not a service)

The stacking engine is used by both the `stack-compute` Edge Function and the cart engine. It is not a standalone service but can be invoked from Node.js:

```typescript
import { CouponStackingEngine, DEFAULT_POLICY } from './stacking/stackingEngine';

// With Supabase (loads policy from DB)
const engine = new CouponStackingEngine(supabaseClient);
const result = await engine.compute(basketId, items, 'publix');

// Without Supabase (for testing)
const result = await engine.computeWithPolicy(basketId, items, DEFAULT_POLICY);
```

### Run tests
```bash
npx ts-node --project tsconfig.test.json \
  src/services/stacking/__tests__/stackingEngine.test.ts
```
All 16 tests must pass before shipping stacking engine changes.

### Run type check
```bash
npx tsc --noEmit --project tsconfig.test.json
```
