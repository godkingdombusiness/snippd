# Snippd — Architecture Decision Records

> Decisions made during system design and the reasoning behind them.
> Update this file when a significant architectural choice is made or revisited.

---

## ADR-001: Supabase is the source of truth (not Neo4j or Vertex AI)

**Decision:** All writes go to Supabase PostgreSQL. Neo4j (planned) and Vertex AI are read-only consumers of data that originates in Supabase.

**Why:**
- Supabase provides Row Level Security, allowing users to access only their own data without custom auth middleware.
- PostgreSQL's JSONB columns let us store flexible event payloads and snapshots without a schema migration for every new field.
- Supabase's built-in trigger system lets us update preference scores synchronously in the same transaction as event ingestion — no message queue needed.
- Neo4j as a primary store would require dual-write logic and eventual consistency handling, which adds failure modes. As a read-side enrichment layer it's lower risk.
- Vertex AI is a scoring/prediction layer only. Feature vectors are computed from Supabase data and sent to Vertex; predictions are returned and may be stored back in Supabase (`model_predictions`).

**Constraint:** The React Native client never writes directly to the DB. All mutations go through Edge Functions.

---

## ADR-002: Retailer rules live in a table, not in code

**Decision:** All per-retailer stacking rules (`block_bogo_and_coupon`, `block_sale_and_digital`, etc.) and policy parameters (`max_stack_items`, `allowed_coupon_types`, etc.) are stored in `retailer_coupon_parameters` and `retailer_rules`, not hardcoded in TypeScript.

**Why:**
- Retailer coupon policies change frequently (seasonal promotions, policy updates). A table change + cache invalidation is faster and safer than a code deploy.
- The same engine code serves all retailers. Adding a new retailer requires only a DB insert, not a code change.
- Product and operations teams can update policies without engineering involvement by editing Supabase table rows.
- The 15-minute in-process cache (`policyLoader.ts`) balances DB load with freshness — short enough that policy changes propagate within minutes.

**How to add a retailer:** Insert rows into `retailer_coupon_parameters` and `retailer_rules`. See `docs/STACKING_ENGINE.md` for the exact SQL.

---

## ADR-003: Event weights are configurable, not hardcoded

**Decision:** The weight assigned to each event type (e.g., `coupon_redeemed = +0.80`, `cart_rejected = -0.60`) lives in the `event_weight_config` table, not as constants in TypeScript.

**Why:**
- Weight tuning is a core part of the ML feedback loop. Weights should be adjustable based on A/B test results without a code deploy.
- The DB trigger (`trg_event_stream_preference`) reads from `event_weight_config` at insert time, so weight changes take effect immediately for new events.
- `preferenceUpdater.ts` also reads weights at runtime, not at compile time.

**Constraint:** Never hardcode a weight value in TypeScript. If a default is needed (e.g., for a new event type not yet in the table), default to `0` — do not invent a weight.

---

## ADR-004: Rebates are tracked separately from line totals

**Decision:** `REBATE` offers do not reduce the running per-unit price. Instead, they accumulate in `lineRebateCents` and are reported separately as `rebateCents` at the basket level.

**Why:**
- Rebates are not immediate discounts — they are paid back after the purchase (mail-in, app credit, receipt scan). The user pays full price at checkout.
- Including rebates in the line total would misrepresent the in-store savings and could cause the user to arrive at checkout expecting a lower total than what they'll actually pay.
- Separating them makes the savings breakdown accurate: `inStackSavingsCents` (what you save at the register) vs. `rebateCents` (what you get back later).
- The UI shows both: "Save $3.20 at checkout + get $1.50 back via rebate."

**Implementation:** In `stackCalculator.ts`, the `REBATE` case sets `lineRebateDelta` without changing `runningPrice`. The engine aggregates these into `result.rebateCents`.

---

## ADR-005: Preference scores use a normalized 0–1 range

**Decision:** Every `user_preference_scores` row stores both a raw `score` and a `normalized_score` (0–1 relative to that user's max absolute score).

**Why:**
- Raw scores grow unboundedly over time (a user who has clipped 200 coupons will have a score 200× higher than a new user). Comparing raw scores across users is meaningless.
- Normalized scores allow apples-to-apples comparison across users and across dimensions (category affinity vs. retailer affinity).
- Vertex AI feature vectors require bounded inputs. `VertexFeatureVector` uses `coupon_responsiveness`, `bogo_responsiveness`, etc., which are derived from normalized scores.
- The normalization formula is simple: `normalized_score = score / max(abs(all scores for user))`. This is computed by `preferenceUpdater.ts` nightly.

**Note:** Normalized scores are always relative to the user's own history, not a global max. A user with only 2 events can have a normalized_score of 1.0 on their dominant preference.

---

## ADR-006: The stacking engine has a 15-minute policy cache

**Decision:** `policyLoader.ts` caches `RetailerPolicy` objects in a `Map` with a 15-minute TTL per retailer key.

**Why:**
- The `stack-compute` Edge Function can receive hundreds of requests per minute. Fetching policy from Supabase on every request would add 50–100ms of latency per request and create unnecessary DB load.
- Retailer policy changes are rare (typically weekly or monthly). A 15-minute stale window is acceptable.
- The cache is in-process (not Redis or shared), so each Edge Function instance has its own cache. This is fine because policy rarely changes and each instance will refresh within 15 minutes.
- `invalidatePolicy(retailerKey)` and `clearPolicyCache()` allow forced invalidation when a policy update is made outside the normal rotation.

**Trade-off:** A policy change takes up to 15 minutes to propagate to all running Edge Function instances. This is acceptable because policy changes are planned, not emergency fixes.

---

## ADR-007: The stacking validator and calculator are pure functions

**Decision:** `stackValidator.ts` exports `validateOfferSet()` and `stackCalculator.ts` exports `calculateStackLine()` — both pure functions with no database calls, no side effects, and no async operations.

**Why:**
- Pure functions are deterministic and trivially testable. The 16-test suite runs in under 1 second with no DB setup.
- The Edge Function (Deno) and Node.js services can both use the same logic without worrying about environment differences.
- Separating validation from calculation makes it easy to run validation only (e.g., for a "dry run" check) without computing prices.
- All I/O is pushed to the edges: `policyLoader.ts` (DB read) and `stackingEngine.ts` (orchestration, optional DB write).

---

## ADR-008: Two TypeScript configs (tsconfig.json and tsconfig.test.json)

**Decision:** The project uses two separate tsconfig files: `tsconfig.json` (Expo/ESM for the React Native app) and `tsconfig.test.json` (CommonJS for ts-node services and tests).

**Why:**
- Expo's `tsconfig.base` uses ESM module resolution, which `ts-node` does not support without additional configuration.
- Background services (`preferenceUpdater.ts`, `vertexFeatureBuilder.ts`) and tests use CommonJS `require()` semantics via `@supabase/supabase-js`.
- Attempting to run these with the Expo tsconfig produces errors like "Cannot use import statement in a module."
- The solution: `tsconfig.test.json` sets `"module": "commonjs"` and `"moduleResolution": "node"` while keeping strict type checking (`"strict": true`).

**Rule:** All services in `src/services/` are compiled with `tsconfig.test.json` for CLI/test runs. The Expo bundler uses `tsconfig.json` for the app build.
