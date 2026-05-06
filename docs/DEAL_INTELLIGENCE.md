# Snippd — Deal Intelligence Architecture

> Built: 2026-04-29
> Migration: `supabase/migrations/20260429_deal_intelligence_layer.sql`

---

## A. Backend Gap Analysis

### What Existed (Reused)

| Table | Purpose |
|---|---|
| `flyer_deal_staging` | Raw deal extraction from flyers |
| `offer_sources` | Normalized weekly-ad offers |
| `stack_candidates` | Pre-computed deal stacks |
| `digital_coupons` | Digital coupon inventory |
| `ingestion_jobs` | One row per PDF ingestion job |
| `offer_matches` | offer_source ↔ coupon match links |
| `retailer_rules` | Stacking allowed/denied by retailer |
| `retailer_coupon_parameters` | Per-retailer coupon policy |
| `publix_store_coupon_kb` | Publix Extra Savings Flyer KB |
| `mfr_coupon_kb` | Manufacturer coupon knowledge base |
| `clip_sessions` / `clip_session_items` | Coupon prep sessions |
| `rebate_offers` | Rebate inventory |
| `checkout_math_snapshots` | Verified savings (authoritative) |
| `agentic_ledger` | Decision audit log |
| `user_trips` | Shopping trips |

### What Was Added

| Table | Purpose |
|---|---|
| `price_observations` | Price history per product/store/zip — feeds volatility |
| `validation_events` | Full audit trail for every offer status change |
| `user_deal_feedback` | User outcome reports — feeds back into scoring |
| `source_reliability` | Per-source trust score, updated by feedback loop |
| `retailer_coverage` | Market readiness by retailer/state/zip |
| `deal_review_queue` | Human/AI review pipeline |
| `validation_rules` | 33 configurable rules — no hardcoded logic in code |

---

## B. Confidence Scoring Formula

**Function:** `compute_confidence_score(offer_source_id)` → returns 0–100

| Factor | Weight | Source |
|---|---|---|
| Product match quality | 15% | `offer_sources.product_match_quality` |
| Source reliability | 15% | `source_reliability.reliability_score` |
| Coupon clarity | 12% | `coupon_terms_text` + `bogo_terms_clear` |
| Retailer rule compatibility | 10% | `retailer_rules.allow_stacking` |
| Location match | 8% | `offer_scope` (national=0.9, unknown=0.35) |
| Price freshness | 12% | Hours since `price_observed_at` (degrades over 1 week) |
| Price stability | 10% | `volatility_score` (1=stable, 0=volatile) |
| Expiration certainty | 8% | Days to `expires_on` (expired=0, ≥3 days=0.95) |
| Stack success history | 5% | `stack_success_score` (from feedback loop) |
| User feedback | 5% | `user_deal_feedback` worked/total ratio (≥3 responses) |

### Publishing Thresholds

| Score | Action | Badge |
|---|---|---|
| 85–100 | Auto-publish | `confirmed` |
| 70–84 | Publish with caution badge | `likely` or `verify_locally` |
| 50–69 | Queue for review | `needs_review` |
| < 50 | Block | `needs_review` |

---

## C. Blocking Rules (Never Publish If)

Enforced by `validate_offer()`:

| Rule | Code | Blocks |
|---|---|---|
| No `retailer_key` | R001 | Yes |
| No `product_name` | P001 | Yes |
| No `offer_type` | D001 | Yes |
| Missing regular + sale price | D002 | Yes |
| No `offer_scope` | G001 | Yes |
| Offer is expired | E003 | Yes |
| BOGO/multibuy with no quantity | D003/D004 | Yes |
| Coupon stack with no terms | C003 | Yes |
| Stack with no evidence | S002 | Yes |
| Retailer rules prohibit stacking | S003 | Yes |

## D. Review Queue Rules (Send to Review If)

| Condition | Code | Badge |
|---|---|---|
| Confidence < 70 | — | `needs_review` |
| >70% savings off regular price | D005 | `needs_review` |
| Vague BOGO terms | C005 | `needs_review` |
| Price >7 days stale | PR002 | `needs_review` |
| Price variance detected (>10%) | PR003 | `price_may_vary` |
| Unknown offer scope | G003 | `verify_locally` |
| Low product match (<0.4) | P004 | `needs_review` |

---

## E. Dynamic Pricing Defense

**Function:** `compute_price_volatility(offer_source_id, window_days=14)`

- Queries `price_observations` for the product/retailer over the window
- Calculates `(max_price - min_price) / avg_price`
- `volatility_score = max(0, 1.0 - variance_pct × 3)` → 1=stable, 0=volatile
- If variance > 10%: sets `price_variance_detected = true` → triggers review queue
- **pg_cron job** `flag_stale_prices()` runs daily — marks stale and expired offers

**User-facing protection:**
- Any offer with `price_variance_detected = true` → badge: `price_may_vary`
- Any offer with `offer_scope = 'unknown'` → badge: `verify_locally`
- Savings never shown as exact unless `offer_scope` is `national` or `zip`/`store_specific` with verified price

---

## F. User Feedback Loop

**Function:** `process_deal_feedback(user_id, offer_id, outcome, ...)`

1. Inserts row into `user_deal_feedback`
2. Recounts worked/failed for offer → updates `stack_success_score` on `offer_sources`
3. Updates `source_reliability` (confirmed_deals or failed_deals + new ratio)
4. Logs to `validation_events` (actor_type = 'user')
5. Re-runs `validate_offer()` → score and status update automatically

---

## G. Agent Workflow Map

### Deal Ingestion Agent
- **Input:** PDFs in `deal-pdfs` bucket, flyer API calls, manual uploads
- **Output:** `ingestion_jobs`, `flyer_deal_staging`
- **Trigger:** `trigger-ingestion` Edge Function or pg_cron
- **Function:** `run-ingestion-worker`

### Normalization Agent
- **Input:** `flyer_deal_staging` (status=staged)
- **Output:** `offer_sources`, `offer_matches`, `flyer_publish_log`
- **Trigger:** After ingestion completes
- **Idempotency:** `dedupe_key` unique index on `offer_sources`

### Validation Agent
- **Input:** `offer_sources` (validation_status=pending)
- **Output:** `validation_events`, `deal_review_queue`, updated `offer_sources`
- **Trigger:** `deal-validator/validate` or batch via `run-deal-scoring`
- **Function:** `validate_offer()` SQL RPC

### Scoring Agent
- **Input:** `offer_sources` with all subscores populated
- **Output:** `confidence_score_v2`, `user_badge`, `validation_status`
- **Function:** `compute_confidence_score()` SQL RPC
- **Trigger:** Called inside `validate_offer()` automatically

### Publishing Agent
- **Input:** `offer_sources` (validation_status=auto_approved or approved_with_caution)
- **Output:** `v_active_offers` (view — no separate table needed)
- **Trigger:** `publish_gate()` — auto-sets `published_at` if score ≥ 85
- **Failure handling:** Routes to `deal_review_queue` on any failure

### Feedback Agent
- **Input:** `user_deal_feedback` (user submission via `deal-validator/feedback`)
- **Output:** Updated `stack_success_score`, `source_reliability`, re-scored `offer_sources`
- **Trigger:** User confirms/rejects a deal at checkout or after receipt scan

---

## H. Regional / National Pricing Layer

### offer_scope values

| Value | Meaning | Badge |
|---|---|---|
| `national` | Confirmed valid nationwide | `confirmed` (if score ≥85) |
| `state` | Confirmed for a state | `verify_locally` |
| `region` | Confirmed for a metro/region | `verify_locally` |
| `zip` | Confirmed for a specific ZIP | `confirmed` (high precision) |
| `store_specific` | Confirmed for one store | `confirmed` (high precision) |
| `unknown` | Cannot confirm scope | `verify_locally` always |

### Demo Markets (seeded in `retailer_coverage`)

| Market | Retailer | Status |
|---|---|---|
| Florida | Publix | `full` |
| Florida | Walmart, Target, ALDI | `partial` |
| Tennessee | Publix, Kroger, Walmart | `demo_only` |
| Ohio | Kroger, Walmart, Giant | `demo_only` |

### Market Readiness Score (0–100)

| Range | Action |
|---|---|
| 80–100 | Demo ready — show real local savings |
| 60–79 | Demo with caution — show with verification badge |
| < 60 | Fall back to national offers only |

---

## I. 30-Day Build Priority

| Day | Task |
|---|---|
| **1–2** | Apply migration in Supabase Dashboard SQL Editor |
| **2–3** | Deploy deal-validator, price-tracker, run-deal-scoring Edge Functions |
| **3–5** | Run `run-deal-scoring` on existing offer_sources — seed confidence scores |
| **5–7** | Hook `publish_gate()` into ingestion pipeline (after normalizeAndPublish) |
| **7–10** | Wire `price-tracker/observe` into flyer ingestion and receipt upload |
| **10–14** | Build admin review dashboard using `v_deal_review_dashboard` |
| **14–17** | Add `deal-validator/feedback` call to ReceiptVerifiedScreen |
| **17–21** | Set pg_cron job for `run-deal-scoring` (daily at 3am) and `flag_stale_prices` |
| **21–25** | Add regional filtering to Discover/Cart screens (state/zip from user profile) |
| **25–28** | Launch Florida demo — run `compute_market_readiness('FL')` to verify |
| **28–30** | Tennessee + Ohio demo prep — upload local flyer data for those markets |

---

## RLS Summary

| Table | User READ | User WRITE | Admin |
|---|---|---|---|
| `price_observations` | Public | System only | Full |
| `validation_events` | Public | System only | Full |
| `user_deal_feedback` | Own rows | Own rows | Read |
| `source_reliability` | Public | System only | Full |
| `retailer_coverage` | Public | System only | Full |
| `deal_review_queue` | — | System only | Full |
| `validation_rules` | Public | — | Full |
