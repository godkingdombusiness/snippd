# Snippd — System Architecture

> Autonomous Shopping Intelligence platform. Maximizes grocery savings through behavioral tracking, coupon stacking, and wealth momentum analysis.
> Stack: React Native / Expo · Supabase (PostgreSQL) · Vertex AI · Neo4j (memory graph — active).

---

## Three-Plane Model

```
┌────────────────────────────────────────────────────────────────────┐
│  DELIVERY PLANE                                                     │
│  React Native / Expo app                                           │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐ │
│  │  30+ screens │  │  tracker SDK │  │  components / theme.js   │ │
│  │  (screens/)  │  │  eventTrack  │  │  Mint/Navy brand palette  │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────────────────────┘ │
│         │                 │                                         │
│         │  All writes go through Edge Functions                     │
└─────────┼─────────────────┼───────────────────────────────────────┘
          │                 │
          ▼                 ▼
┌────────────────────────────────────────────────────────────────────┐
│  DATA PLANE — Supabase (source of truth)                           │
│                                                                    │
│  Edge Functions (Deno, supabase/functions/)                        │
│  ┌─────────────────┐  ┌────────────────────────────────────────┐  │
│  │  ingest-event   │  │  stack-compute                         │  │
│  │  POST events    │  │  POST basket → StackResult             │  │
│  └────────┬────────┘  └────────────────┬───────────────────────┘  │
│           │                            │                           │
│  PostgreSQL (public schema)            │                           │
│  ┌─────────────────────────────────────▼──────────────────────┐   │
│  │  event_stream         recommendation_exposures             │   │
│  │  user_preference_scores  user_state_snapshots              │   │
│  │  model_predictions    wealth_momentum_snapshots            │   │
│  │  event_weight_config  retailer_coupon_parameters           │   │
│  │  retailer_rules       offer_matches   stack_results        │   │
│  │  smart_alerts         profiles  households  budgets        │   │
│  │  receipt_uploads  receipt_items  retailers  stores         │   │
│  │  trips  trip_items  trip_results  user_trips               │   │
│  │  stack_candidates  offer_sources  digital_coupons          │   │
│  │  weekly_lifecycle_plans  checkout_math_snapshots           │   │
│  │  authoritative_funding_ledger  household_cart_items        │   │
│  │  geo_auth_logs  honey_token_skus  healing_events           │   │
│  │  agent_initialization  agentic_ledger                      │   │
│  │  ── Deal Intelligence ──  price_observations               │   │
│  │  validation_events  user_deal_feedback  source_reliability │   │
│  │  retailer_coverage  deal_review_queue  validation_rules    │   │
│  │  ── Waitlist ──  waitlist_positions  waitlist_actions      │   │
│  └─────────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
          │
          ▼
┌────────────────────────────────────────────────────────────────────┐
│  INTELLIGENCE PLANE — Node.js background services (src/services/)  │
│                                                                    │
│  ┌───────────────────────┐  ┌──────────────────────────────────┐  │
│  │  preferenceUpdater.ts │  │  vertexFeatureBuilder.ts         │  │
│  │  Nightly cron         │  │  On-demand or scheduled          │  │
│  │  Decay + normalize    │  │  Vertex AI / heuristic scoring   │  │
│  │  Write snapshots      │  │  Wealth attrition detection      │  │
│  └───────────────────────┘  └──────────────────────────────────┘  │
│                                                                    │
│  Stacking engine (src/services/stacking/)                          │
│  ┌───────────────┐  ┌───────────────┐  ┌──────────────────────┐  │
│  │ policyLoader  │  │ stackValidator│  │  stackCalculator     │  │
│  │ 15-min cache  │  │ 11 rules      │  │  8-step canonical    │  │
│  └───────────────┘  └───────────────┘  └──────────────────────┘  │
│                                                                    │
│  Neo4j memory graph (src/lib/neo4jClient + src/services/graph/)   │
│  ┌────────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ graphSync.ts   │  │graphSchema.ts│  │ graphRetrieval.ts    │  │
│  │ Nightly sync   │  │ Constraints  │  │ getUserGraphContext   │  │
│  │ PREFERS/BUYS/  │  │ + indexes    │  │ (+15% pref cat,      │  │
│  │ CO_OCCURS_WITH │  │              │  │ skip rejected,       │  │
│  └────────────────┘  └──────────────┘  │ +20% buy history,   │  │
│                                        │ +10% co-occurrence) │  │
│                                        └──────────────────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow: Event Ingestion → Preference Learning

```
User taps "Clip coupon"
  → tracker.trackCouponClipped({ object_id, retailer_key, category, brand })
  → SnippdEventTracker enqueues event
  → auto-flush: POST /functions/v1/ingest-event  { events: [...] }
  → ingest-event Edge Function:
      validates auth (Bearer JWT or x-ingest-key)
      inserts row into event_stream
      if RECOMMENDATION_EXPOSED: inserts into recommendation_exposures
      if outcome_status set: updates recommendation_exposures
  → PostgreSQL trigger trg_event_stream_preference fires:
      looks up weight in event_weight_config (coupon_clipped = +0.40)
      UPSERT user_preference_scores:
          (user_id, 'coupon_clipped', category, brand, retailer_key)
          score += 0.40
  → nightly: preferenceUpdater.ts runs:
      loads event_stream (last 50k rows)
      applies 30-day half-life decay to existing scores
      accumulates new event weights
      normalizes scores 0–1 per user
      writes user_state_snapshots (shopping_mode, responsiveness scores)
```

---

## Data Flow: Stack Computation

```
User views basket at Publix
  → POST /functions/v1/stack-compute
      body: { retailer_key: "publix", basket_id, items: [...] }
      auth: Bearer JWT
  → stack-compute Edge Function:
      loads RetailerPolicy from retailer_coupon_parameters + retailer_rules
        (inline cache, 15-min TTL)
      validateOfferSet(items, policy):
          11 checks in order (expiry → qty → exclusion → type → combination rules)
          returns validItems + rejectedOfferIds + warnings
      for each valid item: calculateStackLine(item, policy):
          sorts offers: SALE → BOGO → MULTI → LOYALTY → STORE → MFR → DIGITAL → REBATE
          applies each offer to running per-unit price
          tracks rebate separately (does not reduce line total)
      aggregates basket totals
      builds explanation summary
      if persist=true: inserts into stack_results
  → returns StackResult to client
```

---

## Data Flow: Intelligence / Scoring

```
Background (scheduled or on-demand):
  vertexFeatureBuilder.buildFeatureVector(userId)
    → reads user_state_snapshots (1 row per user)
    → reads user_preference_scores (top 100 by score)
    → reads wealth_momentum_snapshots (last 4)
    → returns VertexFeatureVector

  vertexFeatureBuilder.scoreStackForUser(userId, stack)
    → calls buildFeatureVector()
    → if VERTEX_ENDPOINT_URL set: POST to Vertex AI
    → fallback: heuristic formula:
        savings_ratio * 0.40
        + coupon_responsiveness * 0.25
        + bogo_responsiveness  * 0.15
        + (1 - budget_stress)  * 0.10
        + relevance_boost      (0.10 if preferred retailer/category)
        + (1 - warning_penalty * 0.05) * 0.10
    → returns score 0–1

  vertexFeatureBuilder.checkWealthAttrition(userId)
    → reads last 4 wealth_momentum_snapshots
    → computes attrition probability:
        avg_stress * 0.40 + (1 - avg_velocity) * 0.30
        + stress_alert_rate * 0.20 + savings_decline * 0.10
    → if probability > 0.70: INSERT smart_alerts
```

---

## Module Directory

| Path | Role |
|---|---|
| `src/lib/eventTracker.ts` | Client SDK — batches + sends events |
| `src/types/events.ts` | Event types, API-facing shapes (snake_case) |
| `src/types/stacking.ts` | Stacking types, computation-facing (camelCase) |
| `src/services/stacking/policyLoader.ts` | Loads + caches RetailerPolicy from DB |
| `src/services/stacking/stackValidator.ts` | Pure offer validation (no I/O) |
| `src/services/stacking/stackCalculator.ts` | Pure price calculation (no I/O) |
| `src/services/stacking/stackingEngine.ts` | CouponStackingEngine orchestrator |
| `src/services/preferenceUpdater.ts` | Nightly preference decay + snapshot writer |
| `src/services/vertexFeatureBuilder.ts` | Feature vectors + Vertex AI scoring |
| `supabase/functions/ingest-event/index.ts` | Event ingest Edge Function (Deno) |
| `supabase/functions/stack-compute/index.ts` | Stack computation Edge Function (Deno) |
| `supabase/migrations/001_behavioral_intelligence_safe.sql` | Idempotent schema migration |
| `screens/` | React Native screens |
| `components/` | Shared UI components |
| `theme.js` | Brand color constants |

---

## Deal Intelligence Layer (v0.4.0)

Added 2026-04-29. Sits between raw deal ingestion and `stack_candidates`. Runs 33 validation rules, confidence scoring 0–100, publish gating, regional pricing, and a user feedback loop.

### New Tables

| Table | Purpose |
|---|---|
| `price_observations` | Time-series price tracking per SKU/retailer — feeds accuracy engine |
| `validation_events` | Audit log of every validation rule execution (rule name, pass/fail, delta) |
| `user_deal_feedback` | User thumbs-up/down on deals; drives source reliability scores |
| `source_reliability` | Per-source accuracy rating (0–1); updated by validation outcomes |
| `retailer_coverage` | Regional availability flags (retailer × state × zip × store_id) |
| `deal_review_queue` | Deals flagged for human review (low confidence or failed validation) |
| `validation_rules` | Seeded table of 31 active validation rules with thresholds and weights |

### Key Edge Functions

| Function | Trigger | What it does |
|---|---|---|
| `deal-validator` | On demand / cron | Runs 33 validation rules against `offer_sources`; writes to `validation_events`; gates publish via `publish_gate` flag |
| `price-tracker` | On deal insert | Upserts `price_observations`; computes accuracy delta vs. historical median |

### Data Flow

```
offer_sources (raw ingestion)
  → deal-validator Edge Function
      runs 33 validation rules
      computes confidence_score 0–100
      sets publish_gate = true/false
      writes validation_events audit rows
      flags low-confidence rows to deal_review_queue
  → price-tracker Edge Function
      writes price_observations (time-series)
      updates source_reliability for the source
  → stack_candidates (only publish_gate = true rows promoted)
```

---

## Three-Lane Waitlist System (v0.4.0)

### Tables

| Table | Purpose |
|---|---|
| `waitlist_positions` | One row per waitlisted user: lane (paid/gifted/free), position number, gamified action status |
| `waitlist_actions` | Log of every completed gamified action (share, referral, forecast) per user |

### Lanes

| Lane | How assigned | Priority |
|---|---|---|
| `paid` | User completes subscription purchase before launch | 1 — first to convert |
| `gifted` | Admin manually assigns (influencer, partner, press) | 2 — second cohort |
| `free` | Default — position determined by waitlist action score | 3 — general queue |

### Stored Functions

- `assign_free_waitlist_position(user_id)` — atomically assigns next available free-lane position; idempotent (no-op if already assigned).
- `assign_paid_waitlist_position(user_id)` — moves user to paid lane and adjusts queue ordering.

---

## Key Constraints

- **All writes go to Supabase.** The React Native client never writes directly to the DB — always through Edge Functions.
- **No dark mode.** Brand palette migrating to Sovereign (`#050805` bg, `#0C9E54` green); see `docs/DESIGN.md`.
- **No hardcoded weights.** Event weights live in `event_weight_config`. Read from DB.
- **No hardcoded retailer rules.** Stacking rules live in `retailer_coupon_parameters` + `retailer_rules`. Never in code.
- **Deno for Edge Functions.** Use `https://esm.sh/` imports. No npm in Edge Functions.
- **CommonJS for Node.js services.** Use `@supabase/supabase-js` npm package.
