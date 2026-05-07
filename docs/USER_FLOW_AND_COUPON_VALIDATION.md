# Snippd — Complete User Flow & Coupon Validation Reference

**For engineers.** This document traces every step a user takes from first open through their first verified savings — including all the backend systems that fire at each step, what data is written and where, and the full coupon/savings validation pipeline from discovery through receipt verification.

---

## PART 1: FULL USER FLOW

---

### STAGE 0 — App Opens (Cold Start)

Every app open, before any screen is shown, executes this sequence:

**File:** `App.js → startup()`

1. Native splash screen is held open by `SplashScreen.preventAutoHideAsync()`
2. **Self-Healing Health Monitor** runs (4-second timeout race):
   - Phase 1 (parallel): SecureStore integrity, AsyncStorage integrity, stale cache sweep
   - Phase 2: Supabase connectivity ping (`HEAD /rest/v1/`)
   - Phase 3: Session JWT expiry check + auto-refresh if needed
   - If any check returns `forcedSignOut: true` → all sessions cleared, route to Auth
3. `supabase.auth.getSession()` — check for saved session
4. If no session → **route to `Auth` (SignInScreen)**
5. If session exists:
   - Event tracker initialized with user JWT
   - `trackAppOpened` event queued
   - Phase 4 health check: verify `user_persona` row exists
   - `resolveUserStatus()` called → determines start screen
6. Splash hidden when fonts load + startup completes
7. **6-second global safety timer** — if startup hangs for any reason, forces route to Auth

**`resolveUserStatus()` decision tree:**
```
user_persona.status = 'launched' AND briefing_completed = false
  → 'ConciergeOnboarding'   (deep brief not done yet)

everything else
  → 'MainApp'
```

**Trial gate check (after resolveUserStatus):**
```
if trial expired (isPaused = true) AND would go to MainApp
  → override to 'TrialGate'
```

---

### STAGE 1 — Sign In / Sign Up

**Screen:** `SignInScreen` (`screens/SignInScreen.js`)  
**Route:** `Auth` in root stack

#### IMPORTANT — Current Code State

The **committed** version (`SNIPPD_BETA_HERO_REBUILD_V1`, last committed in `fd0033f`) has full features.  
The **working copy** has an uncommitted redesign that **removed** the rate limiter, OAuth, and tracker.  
**The committed version's behavior is documented here. The working copy must be reconciled.**

#### What happens on this screen:

**Email / Password Sign In:**
1. Rate limiter checked first: reads `@snippd/auth_attempts` from AsyncStorage
   - If 5+ failed attempts within 15 minutes → locked out, shows countdown timer
2. `supabase.auth.signInWithPassword({ email, password })`
3. On success → `onAuthStateChange('SIGNED_IN')` fires in `App.js`
4. `rl_record(true)` → clears rate limit counter
5. `tracker.trackSignIn()` event queued

**Email Sign Up:**
1. `supabase.auth.signUp({ email, password })`
2. Supabase sends confirmation email (if email confirmation is enabled)
3. On success → `onAuthStateChange('SIGNED_IN')` fires
4. `tracker.trackSignUp()` event queued

**Google / Apple OAuth (committed version only):**
1. `supabase.auth.signInWithOAuth({ provider: 'google' | 'apple' })`
2. Opens `expo-web-browser` session (iOS: in-app modal; Android: system browser)
3. After OAuth redirects to `snippd://auth/callback`
4. `Linking.addEventListener('url')` in `App.js` catches the deep link
5. `supabase.auth.exchangeCodeForSession(url)` called
6. `onAuthStateChange('SIGNED_IN')` fires

**After any successful auth event (`onAuthStateChange`):**
- `tracker.setAccessToken(session.access_token)`
- `tracker.setDefaultUserId(session.user.id)`
- `resolveUserStatus(session.user.id)` called
- `resetToScreen(route)` — navigates to `MainApp` or `ConciergeOnboarding`

**Failed auth:**
1. `rl_record(false)` — increments failed count, sets lockout timer if at limit
2. Error message shown inline

**Data written:**
- `auth.users` row created (Supabase-managed) on sign up
- `profiles` row auto-created by Supabase trigger on user creation (if trigger exists)
- AsyncStorage `@snippd/auth_attempts` updated on every failure

---

### STAGE 2A — First-Time Onboarding (New Users)

**Trigger:** After sign-up, `resolveUserStatus` returns `'MainApp'` initially (no persona yet), but the `ConciergeOnboarding` path fires when `user_persona.status = 'launched' AND briefing_completed = false`.  
The quick onboarding (`OnboardingScreen`) is separate from the deep brief (`OnboardingConciergeScreen`).

---

#### STAGE 2A-1: Quick Onboarding — 7 Screens

**Screen:** `OnboardingScreen` (`screens/OnboardingScreen.js`)  
**Route:** `Onboarding` in root stack

This is a 7-step animated flow (90 seconds total):

| Step | Screen | What user does | Data captured |
|---|---|---|---|
| 0 | Hero | Sees brand animation, taps "Build My Intelligence Profile" | Nothing |
| 1 | Household | Selects who's at the table (Infant / Child / Adult / Senior) | `household_members: string[]` |
| 2 | Dietary | Selects dietary guardrails (Gluten-Free, Keto, etc.) | `health_constraints: string[]` |
| 2 (branch) | NutritionProfile | Navigates away to nutrition screen, returns to step 3 | nutrition data saved separately |
| 3 | Cooking Style | Picks Chef / Efficiency / Survival Mode | `cooking_style: string` |
| 4 | Never Again | Selects food dislikes blocklist | `dislikes: string[]` |
| 5 | Persona Reveal | Animated reveal of derived AI shopper DNA type | nothing — `derivePersona()` runs locally |
| 6 | Paywall | Selects Plus / Lifetime tier, accepts consent | final save |

**Persona derivation (`derivePersona()`) — runs client-side:**
```
infant + health constraints → Precision Nurturer
senior + health constraints → Wellness Optimizer
child + Survival Mode       → Speed Strategist
Chef Mode                   → Culinary Value Hunter
Survival + no child         → Efficiency Machine
health constraints only     → Conscious Saver
3+ dislikes                 → Selective Maximizer
default                     → Balanced Strategist
```

**Final save (Step 6 — PaywallStep `handleFinish`):**
- Requires consent checkbox to be checked
- Writes to `profiles` table:
  ```
  onboarding_complete: true
  credits_balance: 20          ← welcome credits
  household_members: [...]
  preferences: {
    health_constraints,
    cooking_style,
    dislikes,
    persona_type,
  }
  consent_accepted: true
  consent_accepted_at: ISO timestamp
  privacy_policy_version: '1.0'
  ```
- Navigates to `MainApp`

---

#### STAGE 2A-2: Deep Concierge Brief — 8 Chapters

**Screen:** `OnboardingConciergeScreen` (`screens/OnboardingConciergeScreen.js`)  
**Route:** `ConciergeOnboarding` in root stack  
**Triggers when:** `user_persona.status = 'launched' AND briefing_completed = false`

This is an 8-chapter deep behavioral profiling interview. Dark "war room" aesthetic. Takes ~5 minutes.

| Chapter | Title | Required fields | What it captures |
|---|---|---|---|
| 1 | Who's at Your Table? | Optional | `child_ages: number[]` |
| 2 | Shopping Archetype | `archetype` + `cartVsList` required | Shopping personality, cart discipline, BOGO impulse behavior |
| 3 | Kitchen DNA | `kitchenVibe` required | Cooking style (meal-prep/fresh/takeout/chef), weekly signature meal |
| 4 | Safety Net | Optional | Clinical allergies (8 types), medical diagnoses (8 types) |
| 5 | Pantry DNA | ≥1 anchor required | Pantry staples watched 24/7, custom products |
| 6 | Behavior Map | `priceCheckFreq` + `postShopFeeling` required | Price comparison habits, impulse categories, post-shop emotion |
| 7 | Money & Stores | `finGoal` + ≥1 store required | Financial goal, weekly spend, multi-store behavior, stores, loyalty cards |
| 8 | Your Mandate | `stressBehavior` + `autonomy` required | Stress food behavior, AI autonomy preference, one problem to solve |

**Final save (`handleComplete`):**
All data written to `user_persona` via **upsert** (conflict: `user_id`):
```sql
user_id, child_ages, shopping_archetype, cart_vs_list_behavior, deal_impulse,
kitchen_vibe, weekly_signature_meal, clinical_allergies, clinical_diagnoses,
pantry_anchors, price_check_frequency, impulse_category, post_shop_feeling,
financial_goal, preferred_stores, loyalty_cards, weekly_grocery_cents,
multi_store_shopper, stress_behavior, autonomy_level, snippd_solve_for,
persona_notes, briefing_completed = true
```

**Navigation after save:** `navigation.replace('LogicScan')` → then routes to `MainApp`

---

### STAGE 3 — Main App (Authenticated)

User arrives at `MainTabs`. Tab bar appears with:
- **Home** — deals + budget
- **Explore** (Discover) — deal discovery
- **Plan** — weekly meal plan
- **Snippd FAB** (center) — cart/shopping
- **Profile** — settings + admin

**Trial banner** shown above tabs if on active trial (green) or last day (amber).  
**Budget refresh** fires on app open: `BudgetContext.refreshBudget()` pulls `profiles.weekly_budget_cents`.

---

### STAGE 4 — Home Screen

**Screen:** `HomeScreen` (`screens/HomeScreen.js`)

**On every focus (`useFocusEffect`):**
1. Load user preferences (display_name, stash_credits, weekly_budget_cents) from `profiles`
2. `queryVerifiedHomeFeed(6)` — fetch top deals from `app_home_feed` table
   - Filter: `is_active = true`, not blocked/needs_review/rejected
   - Order: confidence_score DESC, published_at DESC
   - Fallback: any active row if primary filter returns 0
3. `readActiveCart()` — load cart totals from AsyncStorage for budget bar
4. `fetchTop3StoreEngine()` — per-store totals
5. `get-dynamic-home-layout` edge function — personalised section ordering
6. `buildMomentumTicker()` — wealth momentum ticker data
7. `createGeofenceWatcher()` — nearby store detection (if location permission granted)

**What user sees:**
- Greeting header (Good morning/afternoon/evening) + credits pill
- **TopStackCard** — featured deal: store color circle, deal title, "TODAY ONLY" badge, Pay vs Save numbers, "Start This Stack →" button
- **StackListRow** list — next 3 deals as compact rows (colored store circles)
- **Budget card** — progress bar showing week spent / budget remaining
- **Scan Receipt & Earn** — CTA row linking to receipt upload

**Navigation from Home:**
- Stack card → `StackDetail` (in Discover tab)
- Budget card → `BudgetPreferences`
- Scan Receipt → `ReceiptUpload`

---

### STAGE 5 — Discover & Deal Stacking

**Screen:** `DiscoverScreen` (`screens/DiscoverScreen.js`)

**Data source:** `stack_candidates` table  
**Filter:** store filter pills at top; stack cards show per-retailer stacking opportunities

**Add a deal to cart:**
1. Tap "Add" on a stack card
2. `addStackToCart(stack)` — adds to local `CartContext` state
3. `supabase.rpc('upsert_shopping_list_items', { p_user_id, p_items })` — persists all stack items to `shopping_list_items` table
4. `ListScreen` (real-time subscription) picks up new items immediately

**View full deal:**
1. Tap stack card → `StackDetailScreen`
2. See full item list, coupon layers, rebates, checkout instructions
3. "Add All Items" → same `upsert_shopping_list_items` RPC

---

### STAGE 6 — Building a Clip Session (Pre-Trip)

A "clip session" is the step-by-step coupon preparation checklist before a shopping trip.

**Screen:** `ClipSessionScreen` (`screens/ClipSessionScreen.js`)  
**Service:** `src/services/clipSessionService.ts`

**How it's built:**  
`buildClipSession(supabase, userId, stack)` processes the `SnippdStack` object and sorts all coupon actions in the optimal order:

| Sort Range | Type | When to do it |
|---|---|---|
| 0 | Loyalty card confirmation | Critical — must confirm before any deal unlocks |
| 1–99 | MFR (Manufacturer) coupons | Before leaving home — clip from Coupons.com, P&G Everyday, SmartSource, Haleon Huddle |
| 100–199 | Ibotta offers | Before leaving home — load offers in Ibotta app |
| 200–299 | Publix store / ESF coupons | Before leaving home — clip from Publix app |
| 300–399 | Store digital coupons | Before checkout — loaded to loyalty card |
| 400–419 | Fetch receipt snap | After checkout — snap receipt in Fetch app |
| 420–439 | Swagbucks receipt snap | After checkout — snap receipt in Swagbucks |
| 440+ | Other rebate platforms | After checkout |

**Written to DB:**
- `clip_sessions` row: `{ user_id, stack_id, retailer_key, trip_date, status='pending', total_coupons, savings_at_build }`
- `clip_session_items` rows: one per coupon action, sorted by `sort_order`

**Pre-trip validation (`validateSessionBeforeTrip`):**
- Checks for expired coupons (marks them `expired`, warns user)
- Returns: `{ ready, total, done, pending_items, expired_count, warnings }`
- `ready = true` only when all pre-store items are marked `done`
- Warning if loyalty card is pending: "Critical loyalty card not yet confirmed — deal price may not unlock"

**User actions in `ClipSessionScreen`:**
- Taps each action → `markItemActioned(sb, itemId, 'clipped')`
  - Sets item `status = 'done'`, records `actioned_at` timestamp
  - Updates parent session `clipped_count` + `ibotta_loaded_count`
- Deep links provided for each coupon source (Ibotta, Fetch, Coupons.com, etc.)

**Post-trip completion (`completePostTrip`):**
- Sets `clip_sessions.status = 'completed'`
- Records `fetch_snapped`, `swagbucks_snapped`, `savings_at_shop`

---

### STAGE 7 — At Checkout

**Screen:** `CheckoutBreakdownScreen` (`screens/CheckoutBreakdownScreen.js`)  
**Service:** `src/services/checkoutMathClient.ts` + Cloud Run `checkout_math`

**What happens:**
1. Cart items + coupon stack sent to Cloud Run checkout math service
2. Cloud Run calculates the authoritative breakdown:
   - Regular price per item
   - Sale price applied
   - Each coupon layer deducted (MFR, store, loyalty, digital)
   - Each rebate noted (post-checkout)
   - Final OOP (out-of-pocket) at register
   - Net cost after post-checkout rebates
3. Response is **HMAC-signed** with `CHECKOUT_MATH_HMAC_SECRET`
4. Signed result written to `checkout_math_snapshots` table
5. CheckoutBreakdownScreen displays: per-item breakdown, total savings, "You pay $X · signed by Cloud Run"

**Security:**
- HMAC signature prevents any client-side manipulation of savings figures
- The signature is verified by `src/services/hmacVerifier.ts` before any credits are awarded

---

### STAGE 8 — Receipt Upload & Verification

**Screen:** `ReceiptUploadScreen` (`screens/ReceiptUploadScreen.js`)  
**Flow:**

1. User takes photo (camera) or picks from gallery
2. Image uploaded to Supabase Storage (`receipt_uploads` bucket)
3. A `receipt_uploads` row is created with the storage path
4. `process-receipt` edge function called with `{ receipt_upload_id, image_url }`
5. Cloud Run or Gemini processes the OCR
6. Receipt data matched against the user's `shopping_list_items` and `clip_session`
7. On success → navigate to `TripResultsScreen`

**`verify-receipt` edge function (The Logic Lock):**

Called after OCR succeeds. This is the single gatekeeper for credit awards.

**5 Security Controls:**

| Control | What it does |
|---|---|
| [1] JWT auth | Verifies caller is the owner of the receipt. User-scoped Supabase client enforces RLS. |
| [2] Duplicate detection | `receipt_upload_id` already claimed → returns `already_claimed` (idempotent 200) |
| [3] Content hash dedup | Same physical receipt uploaded twice (same hash) → rejected |
| [4] Velocity check | ≥3 receipts in 5 minutes → fraud flag, returns 429 `velocity_limit_exceeded` |
| [5] Atomic DB transaction | `process_receipt_verification()` RPC uses `SELECT FOR UPDATE` — eliminates race conditions. Credits + streak updated in one transaction. |

**`process_receipt_verification()` RPC returns:**
```json
{
  "ok": true,
  "credits_earned": 10,
  "bonus_credits": 0,          // variable reward: 0 | 10 | 25
  "total_credits_earned": 10,
  "streak_weeks": 3,
  "longest_streak": 5,
  "was_extended": false,
  "shield_used": false,
  "already_counted_this_week": false,
  "badges_earned": []
}
```

**After successful verification:**
- `RECEIPT_VERIFIED_CREDITS_AWARDED` event logged to `event_stream`
- User's `credits_balance` increased in `profiles`
- Streak updated in `user_trips` / `checkout_math_snapshots`

---

### STAGE 9 — Trip Results

**Screen:** `TripResultsScreen` (`screens/TripResultsScreen.js`)

**`runFreshStart()` executes:**
1. Calculates `savingsThisWeek` (from `checkout_math_snapshots` this week)
2. Loads `lifetimeSavings` (sum of all approved snapshots)
3. Computes `streak` (distinct weeks with verified trips)
4. Determines `creditsAwarded` from verify-receipt response
5. Checks if user leveled up (`leveledUp`, `levelBefore`, `levelAfter`)
6. Refreshes personalised feed
7. Loads `wealthSnapshot`

**Navigation out:**  
`navigation.navigate('Wins', { freshStart: { storeName, savingsThisWeek, creditsAwarded, streak, leveledUp, levelBefore, levelAfter } })`

---

### STAGE 10 — Wins Screen

**Screen:** `WinsScreen` (`screens/WinsScreen.js`)

**What user sees:**

1. **Fresh Start celebration banner** (if arriving from TripResults):
   - "Fresh Start!" with refresh-cw icon
   - Store name + "trip complete"
   - 3-stat row: Saved this week / +Credits / Week streak
   - Level-up badge (amber) if leveled up

2. **Hero stats card** (dark forest green):
   - "VERIFIED SAVINGS" eyebrow
   - Lifetime savings total (large)
   - "Signed by Cloud Run · never estimated"
   - 3-stat row: Verified trips / Active weeks / Annual pace

3. **Trip history**: one `WinCard` per `checkout_math_snapshots` row
   - Retailer name, date, "Saved $X.XX" badge
   - "You paid $X.XX · signed by Cloud Run"

4. **Empty state**: "No verified wins yet" + Upload Receipt CTA

**Data source:** `checkout_math_snapshots` WHERE `user_id = X AND status = 'APPROVED'` ORDER BY `computed_at` DESC LIMIT 50

---

## PART 2: COUPON VALIDATION PIPELINE

---

### How Coupons Enter the System

There are three distinct ways coupons appear for a user:

```
1. Ingestion pipeline → stack_candidates / app_home_feed → shown on Home / Discover
2. CouponClippingService → live matching against user's cart items
3. Clip session → structured pre-trip checklist from a SnippdStack object
```

---

### Pipeline A: Deal Ingestion + Validation

**How deals get into `stack_candidates` / `app_home_feed`:**

**Step 1 — Source ingestion**  
Data arrives via:
- `ingest-publix-esf` edge function — Publix digital coupons
- `run-ingestion-worker` edge function — general retailer feed
- `trigger-ingestion` — manual trigger
- Admin uploads via `AdminCircularUploadScreen`

All raw data lands in `offer_sources` (staging table).

**Step 2 — `validate_offer()` SQL function**  
Called by `deal-validator` edge function (`POST /deal-validator/validate`).  
Runs **33 validation rules** across categories:

| Category | Examples of rules |
|---|---|
| Price math | OOP price must be ≥ 0; savings must be > 0; total discounts cannot exceed original price |
| Date validity | Expiration must be future; start date must be ≤ expiration |
| Data completeness | retailer_key required; product_name required; at least one price point |
| Stacking logic | MFR + store coupons cannot both be 100% off; loyalty requirement must be flagged |
| Regional | Price must be reasonable for ZIP/region |
| Confidence | Score 0–100 based on evidence quality |

Each rule produces a pass/fail flag and a confidence delta. Final `confidence_score` is the aggregate.

**Step 3 — `publish_gate()` SQL function**  
Called by `deal-validator` edge function (`POST /deal-validator/publish`).  
An offer is published to `app_home_feed` only if:
- `confidence_score >= 80`
- All critical validation rules pass
- Not expired
- Not flagged by admin
- Not in `needs_review` or `blocked` status

**Step 4 — `refresh_app_home_feed()` SQL function**  
Called daily at **11:15 UTC (7:15 AM EDT)** by pg_cron job `daily-stack-refresh` via `run-stack-refresh` edge function.  
- Publishes newly eligible stacks (confidence ≥ 80)
- Expires stale items (past expiration_date)
- Logs run stats (published count, skipped count, errors)

**Step 5 — Score with Vertex AI**  
`score-deals` / `run-deal-scoring` edge functions call Vertex AI for additional ML scoring on top of the rule-based confidence score.

---

### Pipeline B: Cart-Based Coupon Matching (`CouponClippingService`)

**File:** `src/services/CouponClippingService.ts`  
**Called from:** `HomeScreen`, `CartScreen`, background effects

**Full flow:**

**Step 1 — Cache check (5-min TTL)**  
AsyncStorage key: `snippd_digital_coupons_{userId}`  
If cache is fresh, return immediately without hitting DB.

**Step 2 — Load cart from AsyncStorage**  
Key: `snippd_cart_{userId}` — array of cart items with product_name, brand, retailer_key.

**Step 3 — Normalize product names to keys**  
```
"Tide PODS 16ct" → "tide-pods"
"Lay's Classic Chips (8 oz)" → "lays-classic-chips"
```
Normalization: lowercase → strip sizes/counts → replace non-alphanumeric with hyphens.
Also generates brand-only fallback keys.

**Step 4 — DB lookup (two parallel RPCs)**

Both RPCs read from `v_live_verified_digital_coupons` — a view that:
- Only includes coupons with a valid `verified_at` timestamp
- Filters out expired coupons
- Requires `exact_coupon_url` AND `source_page_url` (evidence of real clip link)

```
get_verified_clippable_coupons(p_user_id, p_normalized_keys)
  → returns matching ClippableCoupon[] with clip URLs, discount amounts, expiry

calculate_verified_digital_savings(p_user_id, p_normalized_keys)
  → returns { savings_cents, matched_count }
```

**Step 5 — Hard gate (client-side filter)**  
Even after DB returns results, service filters them:
```typescript
coupons.filter(coupon =>
  Boolean(coupon.exact_coupon_url) &&
  Boolean(coupon.source_page_url) &&
  coupon.exact_coupon_url !== coupon.source_page_url
)
```
A coupon without both a clip URL AND a source page is **not shown to the user**.

**Step 6 — Cache result and return**  
```typescript
{
  coupons: ClippableCoupon[],  // only verified, clippable coupons
  savingsCents: number,
  matchedCount: number,
  fromCache: boolean,
  generatedAt: ISO string
}
```

**Important:** `clearCouponCache(userId)` must be called whenever cart contents change so the next request picks up fresh matches.

---

### Pipeline C: Stack Spec Engine (`stackSpecEngine.ts`)

**File:** `src/services/stackSpecEngine.ts`  
**Purpose:** Validates a raw stack candidate against 12 stacking rules before it's shown in `ClipSessionScreen`.

**12 validation rules:**

| Rule | What it checks |
|---|---|
| 1. SALE_REQUIRED | Sale price must be present before any coupon is applied |
| 2. MFR_EXCLUSIVE | Only one manufacturer coupon per item (mutual exclusion) |
| 3. MFR_ONE_PER_TRANSACTION | MFR coupons with qty_limit = 1 cannot be doubled |
| 4. STORE_EXCLUSIVE | Only one store coupon per item |
| 5. MFR_STORE_STACK_ALLOWED | MFR + store can stack only if retailer allows it (reads `retailer_coupon_parameters`) |
| 6. LOYALTY_REQUIRED | If `requires_loyalty = true`, card must be confirmed before deal unlocks |
| 7. DIGITAL_EXCLUSION | Digital coupons cannot stack with certain store coupon types |
| 8. OOP_FLOOR | Out-of-pocket price cannot go below $0.00 |
| 9. REBATE_INDEPENDENT | Rebates are always post-checkout — never counted as discount at register |
| 10. IBOTTA_VERIFY | Ibotta offers require in-app verification before shopping |
| 11. BOGO_SPLIT | BOGO stacks require even quantity (can't apply BOGO to 1 item) |
| 12. EXPIRY_CHECK | All coupons must have expiry_date ≥ today or expiry = null |

**Canonical stacking order:**
```
SALE → BOGO → LOYALTY → STORE → MFR → DIGITAL → REBATE
```
This order is enforced. Rebates are always last (post-checkout), never at-register.

**Stack types in `stack_candidates.stack_type`:**
1. `bogo_stack` — buy-one-get-one + MFR coupon
2. `sale_plus_mfr` — sale price + manufacturer coupon
3. `digital_clip_stack` — digital store coupon + rebate
4. `loyalty_unlock` — loyalty card unlocks sale price
5. `triple_stack` — sale + store coupon + MFR coupon
6. `rebate_only` — post-checkout rebate with no in-store discount

---

### Pipeline D: Receipt Verification (Savings Authentication)

After checkout, the final validation loop:

**Step 1 — Image OCR**  
`process-receipt` edge function:
- Receives `receipt_upload_id`
- Calls Gemini / Cloud Vision to OCR the image
- Extracts: store name, date, line items, subtotal, total, tax, discounts applied

**Step 2 — Match against expected cart**  
OCR output compared to `shopping_list_items` for this user:
- Item names fuzzy-matched (normalized key comparison)
- Prices compared against expected OOP
- Discounts confirmed applied

**Step 3 — Write `checkout_math_snapshots`**  
Cloud Run signs the result with HMAC. Written to DB:
```
{
  user_id,
  plan_id,
  status: 'APPROVED' | 'PENDING' | 'REJECTED',
  request_payload: { retailer, items, expected_savings },
  response_payload: {
    savings_cents,
    at_register_savings_cents,
    you_pay_cents,
    retailer_node,
    items_verified
  },
  computed_at,
  hmac_signature   ← prevents tampering
}
```

**Step 4 — `verify-receipt` edge function**  
The logic lock (see Stage 8 above). Only runs if HMAC is valid.  
Awards credits via `process_receipt_verification()` atomic RPC.

**Step 5 — Show on WinsScreen**  
Only rows with `status = 'APPROVED'` shown. The HMAC signature is visible ("signed by Cloud Run") — users can see their savings are mathematically proven, not estimated.

---

## PART 3: DATA WRITTEN AT EACH STAGE

| Stage | Table | Data Written |
|---|---|---|
| Sign Up | `auth.users` | email, id, created_at (Supabase-managed) |
| Sign Up trigger | `profiles` | id, display_name (from email prefix) |
| Quick Onboarding | `profiles` | onboarding_complete, credits_balance=20, household_members, preferences, consent |
| Deep Brief | `user_persona` | 20+ behavioral fields, briefing_completed=true |
| Add to Cart | `shopping_list_items` | item rows with all stack/coupon/price fields |
| Build Clip Session | `clip_sessions` | session header row |
| Build Clip Session | `clip_session_items` | one row per coupon action, sorted |
| Mark Coupon Done | `clip_session_items` | status='done', actioned_at timestamp |
| Receipt Upload | `receipt_uploads` | storage path, status |
| Receipt OCR | `user_trips` | raw trip data, items detected |
| Receipt Verified | `checkout_math_snapshots` | HMAC-signed savings result (APPROVED) |
| Credits Award | `profiles` | credits_balance += earned credits |
| Streak Update | `user_trips` | consecutive week count |
| Memory Event | `memory_events` | COMMITTED_TO edge (savings action chosen) |
| Analytics | `event_stream` | all trackable events via ingest-event |
| Healing Events | `healing_events` | startup check results |

---

## PART 4: KNOWN GAPS IN THE VALIDATION PIPELINE

**Engineer action items:**

### 1. `upsert_shopping_list_items` RPC must exist
Used by DiscoverScreen, StackDetailScreen, WeeklyPlanScreen. Created by migration `20260507_list_sync_v2.sql`.  
**Verify:** Run `SELECT routine_name FROM information_schema.routines WHERE routine_name = 'upsert_shopping_list_items'` in Supabase SQL Editor.

### 2. `process_receipt_verification` RPC must exist
Called by `verify-receipt` edge function. Created by migration `20260504_savings_loop.sql` or similar.  
**Verify:** Same check as above.

### 3. `v_live_verified_digital_coupons` view must exist
Used by `CouponClippingService` RPCs `get_verified_clippable_coupons` and `calculate_verified_digital_savings`.  
**Verify:** `SELECT * FROM v_live_verified_digital_coupons LIMIT 1` — should not throw.

### 4. `retailer_coupon_parameters` must be seeded
The stacking rules in `stackSpecEngine` read `MFR_STORE_STACK_ALLOWED` from this table.  
If empty → MFR+store stacking defaults to "not allowed" → underreports savings.  
**Verify:** `SELECT * FROM retailer_coupon_parameters` — should have rows per retailer.

### 5. `app_home_feed` must have active rows
HomeScreen shows empty state if 0 rows. Run `refresh_app_home_feed()` manually after ensuring `stack_candidates` has confident stacks.

### 6. pg_cron must be enabled for daily stack refresh
Migration `20260507_stack_refresh_cron.sql` registers the cron. Also requires:
- `pg_net` extension enabled
- `app.supabase_url` Vault setting set
- `app.cron_secret` Vault setting set
- `ALTER DATABASE postgres SET cron.timezone TO 'America/New_York'` (optional but recommended)

### 7. SignInScreen working copy is broken
Rate limiter and OAuth were removed in uncommitted local changes.  
`git checkout -- screens/SignInScreen.js` restores the committed working version.

### 8. Cloud Run HMAC secret must match
`CHECKOUT_MATH_HMAC_SECRET` in `.env` / EAS secrets must match the secret deployed to Cloud Run and stored in `src/services/hmacVerifier.ts`. If mismatched, all receipt verifications will fail HMAC check and return `REJECTED`.

---

*Last updated: 2026-05-07*
