# Snippd — Event Tracking Reference

> All behavioral events flow through `SnippdEventTracker` (client) → `ingest-event` (Edge Function) → `event_stream` (DB) → preference trigger → `user_preference_scores`.

---

## How Events Flow

```
User action in app
  → tracker.trackXxx(payload)          (src/lib/eventTracker.ts)
  → auto-batching queue (flush ≤10 events or ≤2.5s)
  → POST /functions/v1/ingest-event  { events: [...] }
  → ingest-event validates + inserts into event_stream
  → trg_event_stream_preference fires (AFTER INSERT):
      weight = event_weight_config[event_name]
      UPSERT user_preference_scores: score += weight
  → nightly preferenceUpdater.ts:
      applies 30-day half-life decay to all scores
      normalizes to 0–1 per user
      writes user_state_snapshots
```

---

## SnippdEventTracker (src/lib/eventTracker.ts)

Singleton exported as `tracker`. Initialize once per session:

```typescript
import { tracker } from '../lib/eventTracker';

tracker.setAccessToken(supabaseSession.access_token);
tracker.setDefaultUserId(supabaseSession.user.id);
tracker.setDefaultSessionId(sessionId);  // uuid you generate per app session
```

### Auto-batching behavior
- Flushes when queue reaches **10 events** OR **2.5 seconds** have elapsed
- Retry on failure: up to **3 retries** with exponential backoff (`1.5s, 3s, 6s`)
- Token required — events are silently dropped if `setAccessToken()` not called

### Manual flush
```typescript
await tracker.flushNow();  // use before app backgrounding
```

---

## All 40 Tracked Events

### App Lifecycle (no object required)

| Event | Tracker method | Notes |
|---|---|---|
| `APP_OPENED` | `trackAppOpened()` | |
| `APP_CLOSED` | `trackAppClosed()` | |
| `APP_FOREGROUNDED` | `trackEvent({ event_name: 'APP_FOREGROUNDED', ... })` | No convenience method |
| `ONBOARDING_STARTED` | `trackEvent(...)` | No convenience method |
| `ONBOARDING_COMPLETED` | `trackOnboardingCompleted()` | |

### Item Interactions (object_id required)

| Event | Tracker method | Notes |
|---|---|---|
| `ITEM_VIEWED` | `trackItemViewed({ object_id })` | |
| `ITEM_ADDED_TO_CART` | `trackItemAddedToCart({ object_id })` | |
| `ITEM_REMOVED_FROM_CART` | `trackItemRemovedFromCart({ object_id })` | Negative signal |
| `ITEM_SUBSTITUTED` | `trackItemSubstituted({ object_id })` | |

### Checkout & Purchase

| Event | Tracker method | Notes |
|---|---|---|
| `CHECKOUT_STARTED` | `trackCheckoutStarted(payload)` | |
| `CHECKOUT_COMPLETED` | `trackCheckoutCompleted(payload)` | |
| `PURCHASE_COMPLETED` | `trackPurchaseCompleted(payload)` | Strongest signal (+1.00) |
| `RECEIPT_UPLOADED` | `trackReceiptUploaded(payload)` | |
| `RECEIPT_PARSED` | `trackEvent(...)` | No convenience method |
| `PURCHASE_COMPLETED` (server) | fired by `process-receipt` Edge Function | Written directly to `event_stream` after OCR + wealth computation |

### Cart Decisions

| Event | Tracker method | Notes |
|---|---|---|
| `CART_ACCEPTED` | `trackCartAccepted(payload)` | User accepted Snippd's cart recommendation |
| `CART_REJECTED` | `trackCartRejected(payload)` | Negative signal (-0.60) |

### Search

| Event | Tracker method | Notes |
|---|---|---|
| `SEARCH_PERFORMED` | `trackSearchPerformed({ metadata: { query } })` | |
| `SEARCH_FILTER_APPLIED` | `trackEvent(...)` | No convenience method |

### Preferences & Profile

| Event | Tracker method | Notes |
|---|---|---|
| `PREFERENCE_CHANGED` | `trackPreferenceChanged(payload)` | |
| `PROFILE_UPDATED` | `trackEvent(...)` | No convenience method |
| `BUDGET_SET` | `trackBudgetSet({ metadata: { budget_cents } })` | |
| `BUDGET_EXCEEDED` | `trackEvent(...)` | No convenience method — triggers budget_stress |

### Coupons (object_id required)

| Event | Tracker method | Notes |
|---|---|---|
| `COUPON_VIEWED` | `trackCouponViewed({ object_id })` | |
| `COUPON_CLIPPED` | `trackCouponClipped({ object_id })` | +0.40 weight |
| `COUPON_REDEEMED` | `trackCouponRedeemed({ object_id })` | +0.80 weight |
| `COUPON_EXPIRED` | `trackEvent(...)` | No convenience method — negative signal |

### Stacks (object_id required)

| Event | Tracker method | Notes |
|---|---|---|
| `STACK_VIEWED` | `trackStackViewed({ object_id })` | |
| `STACK_APPLIED` | `trackStackApplied({ object_id })` | +0.65 weight |
| `STACK_DISMISSED` | `trackStackDismissed({ object_id })` | -0.40 weight |
| `STACK_COMPUTED` | `trackEvent(...)` | Server-side only |

### Recommendations (object_id required)

| Event | Tracker method | Notes |
|---|---|---|
| `RECOMMENDATION_SHOWN` | `trackRecommendationShown({ object_id, recommendation_type? })` | Preferred method |
| `RECOMMENDATION_EXPOSED` | Triggers exposure record when sent to ingest-event | Use for ML training data |
| `RECOMMENDATION_CLICKED` | `trackRecommendationClicked({ object_id })` | +0.25 weight |
| `RECOMMENDATION_DISMISSED` | `trackRecommendationDismissed({ object_id })` | -0.10 weight |
| `RECOMMENDATION_OUTCOME` | `trackEvent(...)` | No convenience method |

### Stores

| Event | Tracker method | Notes |
|---|---|---|
| `STORE_SELECTED` | `trackStoreSelected({ retailer_key })` | Updates multi_store_responsiveness |
| `STORE_DESELECTED` | `trackStoreDeselected({ retailer_key })` | -0.05 weight |

### Wealth / Alerts (object_id required for alerts)

| Event | Tracker method | Notes |
|---|---|---|
| `WEALTH_SNAPSHOT_VIEWED` | `trackWealthSnapshotViewed()` | |
| `SMART_ALERT_SHOWN` | `trackSmartAlertShown({ object_id })` | object_id = alert UUID |
| `SMART_ALERT_DISMISSED` | `trackSmartAlertDismissed({ object_id })` | -0.02 weight |

---

## event_weight_config Table Values

| Event | Weight | Preference dimension |
|---|---|---|
| `purchase_completed` | +1.00 | category, brand, retailer |
| `coupon_redeemed` | +0.80 | coupon/deal affinity |
| `cart_accepted` | +0.70 | cart_type affinity |
| `stack_applied` | +0.65 | deal_type affinity |
| `checkout_completed` | +0.75 | category, brand |
| `item_added_to_cart` | +0.55 | category, brand |
| `onboarding_completed` | +0.30 | global |
| `coupon_clipped` | +0.40 | coupon affinity, category, brand |
| `recommendation_clicked` | +0.25 | category, brand, retailer |
| `item_substituted` | +0.20 | category |
| `budget_set` | +0.15 | global |
| `stack_viewed` | +0.15 | deal_type affinity |
| `store_selected` | +0.10 | retailer affinity |
| `coupon_viewed` | +0.10 | coupon/deal affinity |
| `receipt_uploaded` | +0.10 | global |
| `recommendation_shown` | +0.05 | category, brand, retailer |
| `preference_changed` | +0.05 | global |
| `checkout_started` | +0.05 | category, brand |
| `wealth_snapshot_viewed` | +0.05 | global |
| `smart_alert_shown` | +0.02 | global |
| `search_performed` | +0.02 | global |
| `smart_alert_dismissed` | -0.02 | global |
| `coupon_expired` | -0.05 | coupon affinity |
| `store_deselected` | -0.05 | retailer affinity |
| `budget_exceeded` | -0.20 | budget stress |
| `item_removed_from_cart` | -0.30 | category, brand (negative) |
| `recommendation_dismissed` | -0.10 | category, brand (negative) |
| `stack_dismissed` | -0.40 | deal_type (negative) |
| `cart_rejected` | -0.60 | cart_type (negative) |

---

## Five Preference Dimensions

Preference scores accumulate along 5 dimensions per event row:

| Dimension | Column(s) | How populated |
|---|---|---|
| **Category** | `category` | From event `category` field (e.g. `dairy`, `meat`) |
| **Brand** | `brand` | From event `brand` field |
| **Retailer** | `retailer_key` | From event `retailer_key` field |
| **Deal type** | `preference_key` | The event name itself (e.g. `coupon_clipped`) |
| **Cart type** | `preference_key` | `cart_accepted` / `cart_rejected` |

Each unique `(user_id, preference_key, category, brand, retailer_key)` tuple is one row.

---

## Temporal Decay Logic

`preferenceUpdater.ts` applies exponential decay before processing new events:

```
HALF_LIFE_DAYS = 30
DECAY_PER_DAY  = 0.5^(1/30) ≈ 0.9772

decayed_score = current_score × DECAY_PER_DAY^(age_in_days)
```

A score earned 30 days ago is worth half its original value. A score earned 90 days ago is worth 12.5%.

After decay, new event weights are added, then all scores for a user are normalized:
```
normalized_score = score / max(abs(all scores for user))
```

---

## Example: What happens when a user clips a coupon

```
User clips Yoplait yogurt coupon at Publix

tracker.trackCouponClipped({
  object_id: coupon_uuid,
  retailer_key: 'publix',
  category: 'dairy',
  brand: 'Yoplait',
})

→ POST /ingest-event:
    event_name: 'COUPON_CLIPPED'
    retailer_key: 'publix'
    category: 'dairy'
    brand: 'Yoplait'

→ event_stream INSERT

→ trg_event_stream_preference fires:
    weight = 0.40 (from event_weight_config)
    UPSERT user_preference_scores:
        (user_id, 'coupon_clipped', 'dairy', 'Yoplait', 'publix')
        score += 0.40

→ nightly preferenceUpdater:
    - decays existing score: 0.40 × 0.9772^1 = 0.391
    - adds new 0.40: score = 0.791
    - normalizes: if max abs score for this user is 3.2,
        normalized_score = 0.791 / 3.2 = 0.247
    - writes user_state_snapshots:
        coupon_responsiveness increases
        shopping_mode may shift toward deal_hunter
```
