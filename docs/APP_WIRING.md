# Snippd — App Wiring & Technical Reference

**Purpose:** This document is a complete engineer-facing reference for the Snippd React Native app. It covers the navigation tree, every screen's purpose and data wiring, all context providers, the startup sequence, backend services, and known issues.

**Platform:** React Native / Expo (managed workflow)  
**Backend:** Supabase (Postgres + Edge Functions + Auth + Storage)  
**Supplementary backend:** Cloud Run (checkout math), Vertex AI (deal scoring), Neo4j (memory graph, planned)

---

## 1. Project Structure

```
snippd/
├── App.js                          # Root navigator, providers, startup
├── screens/                        # All screen components (75 files)
├── components/                     # Shared UI components
├── lib/                            # Core runtime utilities (auth, budget, health)
│   ├── supabase.js                 # Supabase client (SecureStore adapter)
│   ├── BudgetContext.js            # Global weekly budget state
│   ├── trialContext.js             # Trial/subscription status gate
│   ├── sessionGuard.js             # 30-min inactivity auto-logout
│   ├── healthMonitor.js            # 6-check self-healing startup
│   ├── healingLog.js               # Healing event persistence
│   ├── weeklyBudget.js             # Budget fetch/save helpers
│   ├── navigationRef.js            # Imperative navigation ref
│   ├── CartContext.js              # Cart state (in progress)
│   └── auditLogger.js              # Security audit trail
├── src/
│   ├── design/tokens.js            # Design system (colors, type, spacing)
│   ├── lib/
│   │   ├── eventTracker.ts         # Analytics event batching SDK
│   │   ├── generateStacks.ts       # Deal stack generation
│   │   ├── memoryEvents.js         # Neo4j memory event helpers
│   │   ├── experienceType.ts       # User experience classifier
│   │   └── ...
│   ├── services/                   # Business logic services
│   └── features/                   # Feature-flag–gated features (Studio, ChefStash, OmniStore)
├── supabase/
│   ├── functions/                  # 55+ Deno edge functions
│   └── migrations/                 # 50+ SQL migrations
├── services/                       # Python Cloud Run services (NOT bundled by Metro)
│   ├── checkout_math/              # Authoritative checkout math
│   └── generate_stacks/            # Stack generation service
└── web/                            # Next.js web app (Vercel, separate deploy)
```

---

## 2. Environment Variables Required

These must be set in `.env` / Expo EAS secrets before the app will run:

| Variable | Used By | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | `lib/supabase.js`, all screens | Supabase project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | `lib/supabase.js` | Supabase anon/public key |
| `EXPO_PUBLIC_CHECKOUT_MATH_URL` | `src/services/checkoutMathClient.ts` | Cloud Run URL |
| `EXPO_PUBLIC_FEATURE_STUDIO` | `src/features/registry.js` | Feature flag (true/false) |
| `EXPO_PUBLIC_FEATURE_CHEF_STASH` | `src/features/registry.js` | Feature flag |
| `EXPO_PUBLIC_FEATURE_OMNI_STORE_COMPARISON` | `src/features/registry.js` | Feature flag |
| `CHECKOUT_MATH_HMAC_SECRET` | Cloud Run service | 64-char hex, server-side only |

---

## 3. App Entry Point (`App.js`)

### Provider Hierarchy

```
AppErrorBoundary          ← catches render crashes, shows error in dev
  GestureHandlerRootView  ← required by react-native-gesture-handler
    SafeAreaProvider      ← safe area insets for all screens
      NavigationContainer ← react-navigation root (ref: lib/navigationRef.js)
        BudgetProvider    ← global weekly_budget_cents state
          TrialProvider   ← subscription/trial status state
            RootNavigator ← root Stack.Navigator
```

### Startup Sequence (`RootNavigator` → `startup()`)

1. `SplashScreen.preventAutoHideAsync()` — holds native splash while JS loads
2. 4-second timeout race: `HealthMonitor.runStartupChecks()` (6 checks, see §7)
3. `supabase.auth.getSession()` — check for existing session
4. If `health.forcedSignOut` → route to `Auth`
5. If session exists:
   - Set `tracker` access token, userId, sessionId
   - Fire `trackAppOpened` event
   - `HealthMonitor.runAuthChecks(userId)` — check `user_persona` row
   - `resolveUserStatus(userId)` — determine initial route
6. If no session → route to `Auth`
7. 6-second global safety timer forces `Auth` if startup hangs
8. `supabase.auth.onAuthStateChange` listener wired for live session events
9. `Linking.addEventListener` for OAuth deep-link callback (`auth/callback`)

### `resolveUserStatus(userId)` Logic

```
user_persona.status === 'launched' AND briefing_completed === false
  → 'ConciergeOnboarding'
everything else (beta, lifetime, launched+completed, errors)
  → 'MainApp'
```

### Trial Gate Override

After `resolveUserStatus`, if `TrialProvider.isPaused === true` AND route would be `MainApp`, the route is overridden to `TrialGate`.

---

## 4. Navigation Architecture

### Root Stack (always present, full-screen)

| Screen Name | Component | When Shown |
|---|---|---|
| `Auth` | `SignInScreen` | Unauthenticated; after sign-out |
| `Onboarding` | `OnboardingScreen` | First-run after signup |
| `InstantForecast` | `InstantForecastScreen` | Onboarding step |
| `SoftPersonalization` | `SoftPersonalizationScreen` | Onboarding step |
| `UnlockBeta` | `UnlockBetaScreen` | Beta code unlock flow |
| `DeepPersonalization` | `DeepPersonalizationScreen` | Extended onboarding |
| `PersonaReveal` | `PersonaRevealScreen` | Post-onboarding reveal |
| `HowItWorks` | `HowItWorksScreen` | Explainer, reachable from onboarding |
| `WaitlistForecast` | `WaitlistForecastScreen` | Legacy (no longer in routing) |
| `ConciergeOnboarding` | `OnboardingConciergeScreen` | New users with `launched` status |
| `LogicScan` | `LogicScanScreen` | AI scan flow |
| `FounderDashboard` | `FounderDashboardScreen` | Beta/lifetime founders |
| `MainApp` | `MainTabs` | All authenticated users |
| `TrialGate` | `TrialGateScreen` | When trial is paused/expired |
| `MFAVerify` | `MFAVerifyScreen` | MFA challenge |
| `SnippdPro` | `SnippdProScreen` | Paywall modal |
| `PrivacyPolicy` | `PrivacyPolicyScreen` | Legal |
| `TermsOfUse` | `TermsOfUseScreen` | Legal |

### Bottom Tab Navigator (`MainTabs`)

Tabs are driven by `filterEnabledItems()` which respects feature flags.

| Tab Name | Icon | Component Stack |
|---|---|---|
| `HomeTab` | home | `HomeStack` |
| `DiscoverTab` | compass | `DiscoverStack` |
| `PlanTab` | calendar | `PlanStack` |
| `SnippdTab` | (custom FAB — diamond logo) | `CartStack` |
| `StudioTab` | (feature-flagged) | `StudioStack` |
| `ProfileTab` | user | `ProfileStack` |

The center FAB (`SnippdTab`) is visually elevated above the tab bar with `marginBottom: 35`. It shows the Snippd logo and routes to the Cart/shopping flow.

**Trial Banner:** A persistent green banner above the tab bar shows trial day/days remaining when `trialStatus === 'active'`. Turns amber on the last day.

---

## 5. Tab Stacks — Screen Details

### HomeStack

| Route | Screen | Purpose |
|---|---|---|
| `Home` | `HomeScreen` | Main feed: top stack card, deal list, budget, scan CTA |
| `ChefStash` | `ChefStashScreen` | Chef-curated meal deals (feature-flagged) |
| `Kitchen` | `KitchenScreen` | Kitchen/pantry management |
| `Pantry` | `PantryScreen` | Pantry inventory |
| `List` | `ListScreen` | Shopping list with coupon/rebate breakdown |
| `ShoppingPlan` | `ShoppingPlanScreen` | Weekly shopping plan |
| `TripResults` | `TripResultsScreen` | Post-receipt upload results + Fresh Start |
| `ReceiptUpload` | `ReceiptUploadScreen` | Camera/gallery receipt upload |
| `VerifyReceipt` | `ReceiptVerifiedScreen` | Receipt verification status |
| `Wins` | `WinsScreen` | Verified savings history (signed by Cloud Run) |
| `FamilySharing` | `FamilySharingScreen` | Family plan management |
| `BudgetPreferences` | `BudgetPreferencesScreen` | Set/edit weekly budget |
| `BudgetDashboard` | `BudgetDashboardScreen` | Budget analytics |
| `CategoryInsight` | `CategoryInsightScreen` | Per-category spending insight |
| `BarcodeScanner` | `BarcodeScannerScreen` | Barcode lookup |
| `PrivacyPolicy` | `PrivacyPolicyScreen` | Legal |
| `QuickDeals` | `QuickDealsScreen` | Fast deal browsing with sort/filter |
| `MealDetail` | `MealDetailScreen` | Individual meal detail |
| `ShoppingList` | `ShoppingListScreen` | Generated shopping list from plan |
| `Outcome` | `OutcomeScreen` | Post-trip outcome summary |
| `SavingsAction` | `SavingsActionScreen` | Savings allocation (Save/Bill/Debt/Donate) |
| `NextWeekBuilder` | `NextWeekBuilderScreen` | Next-week plan builder |

### DiscoverStack

| Route | Screen | Purpose |
|---|---|---|
| `Discover` | `DiscoverScreen` | Deal discovery with store filter; Add→cart + shopping_list_items |
| `StackDetail` | `StackDetailScreen` | Full deal stack detail, Add All Items |
| `Catalog` | `CatalogScreen` | Full product catalog |
| `Cart` | `CartScreen` | Cart (modal presentation) |
| `ChefStash` | `ChefStashScreen` | (feature-flagged) |
| `OmniStoreComparison` | `OmniStoreComparisonScreen` | Cross-store price comparison (feature-flagged) |

### PlanStack

| Route | Screen | Purpose |
|---|---|---|
| `WeeklyPlanPersonalization` | `WeeklyPlanPersonalizationScreen` | Plan preferences entry |
| `WeeklyPlan` | `WeeklyPlanScreen` | 14-step / 21-meal weekly plan |
| `MealDetail` | `MealDetailScreen` | Meal detail |
| `ShoppingList` | `ShoppingListScreen` | Generated shopping list |
| `NutritionProfile` | `NutritionProfileScreen` | User nutrition goals |
| `RecipeDetail` | `RecipeDetailScreen` | Recipe steps |
| `QuickDeals` | `QuickDealsScreen` | Deals in plan context |
| `SavingsAction` | `SavingsActionScreen` | Savings allocation |
| `NextWeekBuilder` | `NextWeekBuilderScreen` | Next-week builder |

### CartStack (SnippdTab)

| Route | Screen | Purpose |
|---|---|---|
| `CartMain` | `CartScreen` | Active cart with stack comparison |
| `ReceiptUpload` | `ReceiptUploadScreen` | Upload receipt |
| `ShoppingPlan` | `ShoppingPlanScreen` | Shopping plan view |
| `TripResults` | `TripResultsScreen` | Trip results |
| `List` | `ListScreen` | Shopping list |
| `MyList` | `MyListScreen` | Saved lists |
| `CouponClipping` | `CouponClippingScreen` | Clip coupons for cart |
| `CheckoutBreakdown` | `CheckoutBreakdownScreen` | Authoritative checkout math breakdown |
| `VerifyReceipt` | `ReceiptVerifiedScreen` | Receipt verified |
| `CartOptions` | `CartOptionsScreen` | Store cart options comparison |
| `CartOptionDetail` | `CartOptionDetailScreen` | Individual store cart detail |
| `WealthMomentum` | `WealthMomentumScreen` | Savings momentum display |
| `Outcome` | `OutcomeScreen` | Trip outcome |
| `SavingsAction` | `SavingsActionScreen` | Savings allocation |
| `NextWeekBuilder` | `NextWeekBuilderScreen` | Next-week plan |

### ProfileStack

| Route | Screen | Purpose |
|---|---|---|
| `Profile` | `ProfileScreen` | User profile, settings, admin menu |
| `EditProfile` | `EditProfileScreen` | Edit name/bio/avatar |
| `PreferredStores` | `PreferredStoresScreen` | Manage preferred store list |
| `BudgetPreferences` | `BudgetPreferencesScreen` | Weekly budget setting |
| `BudgetDashboard` | `BudgetDashboardScreen` | Budget analytics |
| `CategoryInsight` | `CategoryInsightScreen` | Category breakdown |
| `FamilySharing` | `FamilySharingScreen` | Family plan |
| `InviteFriends` | `InviteFriendsScreen` | Referral / invite |
| `PromoCodes` | `PromoCodesScreen` | Promo code entry |
| `Help` | `HelpScreen` | Help & support |
| `AdminPulse` | `AdminPulseScreen` | Admin: system health (admin only) |
| `TestAgent` | `AppTestAgent` | Admin: test agent runner |
| `TripResults` | `TripResultsScreen` | View past trips |
| `ReceiptUpload` | `ReceiptUploadScreen` | Upload receipt |
| `VerifyReceipt` | `ReceiptVerifiedScreen` | Verification status |
| `MFASetup` | `MFASetupScreen` | Set up 2FA |
| `WealthMomentum` | `WealthMomentumScreen` | Savings momentum |
| `AdminGraph` | `AdminGraphScreen` | Admin: Neo4j graph viewer |
| `PrivacyPolicy` | `PrivacyPolicyScreen` | Legal |
| `TermsOfUse` | `TermsOfUseScreen` | Legal |
| `SnippdPro` | `SnippdProScreen` | Paywall (modal) |
| `AdminCircularUpload` | `AdminCircularUploadScreen` | Admin: circular/ad upload |
| `AdminAnalytics` | `AdminAnalyticsDashboardScreen` | Admin: analytics dashboard |
| `AdminDealReview` | `AdminDealReviewScreen` | Admin: review deal quality |
| `StackReviewTraining` | `StackReviewTrainingScreen` | Admin: stack labeling |
| `NutritionProfile` | `NutritionProfileScreen` | Nutrition goals |

---

## 6. Screen Wiring Details

### `SignInScreen` (Auth)

**File:** `screens/SignInScreen.js`  
**WARNING:** Working copy has uncommitted redesign (`SNIPPD_INSTACART_PREMIUM_V1`) that **removed** the rate limiter, OAuth (Google/Apple), and event tracker. The committed version (`SNIPPD_BETA_HERO_REBUILD_V1`) has all of those. The file must be resolved before deploying.

**Committed version features:**
- Email/password sign in & sign up
- Google OAuth via `supabase.auth.signInWithOAuth` + `expo-web-browser`
- Apple OAuth (same flow)
- Client-side rate limiter: 5 failed attempts → 15-minute lockout (persisted in AsyncStorage key `@snippd/auth_attempts`)
- `tracker.trackSignIn()` / `tracker.trackSignUp()` on success
- Tablet layout (width > 768): left hero panel + right form; Phone: stacked

**Navigation out:** Auth state change in `App.js` handles routing after success — screen does not call `navigation.navigate` on success.

---

### `HomeScreen`

**File:** `screens/HomeScreen.js`  
**Data sources:**
- `app_home_feed` table → `queryVerifiedHomeFeed()` — deals shown in Top Stack card and list
- `profiles` table → `weekly_budget_cents`, `stash_credits`, `display_name`
- `get-dynamic-home-layout` edge function → personalised section order
- `readActiveCart()` → `cartSpendCents` for budget progress bar
- `fetchTop3StoreEngine()` → per-store totals for budget display
- `buildMomentumTicker()` → scrolling savings ticker
- `createGeofenceWatcher()` → nearby store detection

**Key computed values:**
- `topDeal` = first deal from verified feed → shown in `TopStackCard`
- `moreDeals` = next 3 deals → shown as `StackListRow` list
- `budgetUsedPct` = `cartSpendCents / weeklyBudgetCents`
- `remainingCents` = `max(0, weeklyBudgetCents - cartSpendCents)`
- `greetingWord` = morning/afternoon/evening
- `todayBadge` = e.g. "THURSDAY ONLY"

**Sub-components (module-level, NOT inside function):**
- `TopStackCard({ stack, todayBadge, onPress })` — featured deal card
- `StackListRow({ stack, onPress })` — compact deal list row
- `storeInitials(name)` — e.g. "Dollar General" → "DG"
- `storeLogoColor(name)` — store brand color (Publix green, Walgreens red, etc.)

**Navigation out:**
- Stack card tap → `StackDetail` (DiscoverTab)
- Stack list row tap → `StackDetail`
- Budget card tap → `BudgetPreferences`
- Scan receipt row tap → `ReceiptUpload`

**Known bug:** `isVerifiedSystemStack()` filter was previously too strict (required `system_generated_verified` + `SNIPPD_GENERATED`), resulting in 0 deals shown. Now relaxed to reject only `blocked`, `needs_review`, `rejected` statuses. Falls back to all active rows if filter returns 0.

---

### `DiscoverScreen`

**File:** `screens/DiscoverScreen.js`  
**Data sources:**
- `stack_candidates` table → deal stacks
- `CartContext` → `addStackToCart`

**Add button flow:**
1. Calls `addStackToCart(stack)` — adds to local cart state
2. Calls `supabase.rpc('upsert_shopping_list_items', { p_user_id, p_items })` — persists to DB

---

### `WinsScreen`

**File:** `screens/WinsScreen.js`  
**Props:** `{ route, navigation }`  
**Data sources:**
- `checkout_math_snapshots` table, filtered by `status = 'APPROVED'`, ordered by `computed_at` desc, limit 50

**Route params:**
- `route.params.freshStart` — if present, shows a "Fresh Start!" celebration banner at the top. Object shape:
  ```js
  {
    storeName: string,
    savingsThisWeek: number,   // cents
    creditsAwarded: number,
    streak: number,
    leveledUp: boolean,
    levelBefore: string,
    levelAfter: string,
  }
  ```
  Set by `TripResultsScreen` when navigating here after a successful trip.

**Displays:**
- Fresh Start banner (conditional)
- Hero card: lifetime savings, verified trip count, active weeks, annual pace
- Trip history: `WinCard` per snapshot showing retailer, date, savings badge
- Empty state: "No verified wins yet" with Upload Receipt CTA

---

### `TripResultsScreen`

**File:** `screens/TripResultsScreen.js`  
**Purpose:** After receipt upload is processed, shows trip summary and routes to WinsScreen with freshStart params.  
**Key function:** `runFreshStart()` — returns `{ savingsThisWeek, lifetimeSavings, streak, streakBroken, creditsAwarded, leveledUp, levelBefore, levelAfter, personalizedFeed, wealthSnapshot, storeName }`  
**Navigation out:** `navigation.navigate('Wins', { freshStart: { ... } })`

---

### `WeeklyPlanScreen`

**File:** `screens/WeeklyPlanScreen.js`  
**Data source:** `get-weekly-plan` edge function (24h AsyncStorage cache under key `cached_weekly_plan`)  
**Budget:** Reads from `BudgetContext` via `useBudget()` — `effectiveBudget = weeklyBudgetCents ?? DEFAULT_BUDGET_CENTS ($150)`  
**Cache invalidation:** `BudgetContext.broadcastBudgetChange()` removes `cached_weekly_plan` key and fires `get-weekly-plan?refresh=true`

---

### `CartScreen`

**File:** `screens/CartScreen.js`  
**Data sources:**
- `CartContext` — local cart state
- `get-cart-options` edge function — per-store cart totals
- `CartContext` / `readActiveCart()` from `cartStorage.js`

---

### `ReceiptUploadScreen`

**File:** `screens/ReceiptUploadScreen.js`  
**Flow:**
1. User picks image (camera or gallery)
2. Image uploaded to Supabase Storage
3. `process-receipt` edge function called with image URL
4. On success → navigate to `TripResults`

---

### `ProfileScreen`

**File:** `screens/ProfileScreen.js`  
**Data sources:**
- `profiles` table → display_name, avatar_url, stash_credits, preferred_stores
- `user_persona` table → status, level

**Admin menu:** Shown only when `email` matches admin email addresses. Exposes `AdminPulse`, `AdminGraph`, `AdminAnalytics`, `AdminCircularUpload`, `AdminDealReview`, `StackReviewTraining`.

---

### `CheckoutBreakdownScreen`

**File:** `screens/CheckoutBreakdownScreen.js`  
**Purpose:** Displays authoritative checkout math from Cloud Run — HMAC-signed breakdown of every discount applied.

---

### `CouponClippingScreen`

**File:** `screens/CouponClippingScreen.js`  
**Data sources:**
- `coupon_kb` table — coupon knowledge base
- `clip_sessions` table — active clip sessions
- `run-coupon-refresh` edge function

---

### `StackDetailScreen`

**File:** `screens/StackDetailScreen.js`  
**Data source:** Stack object passed via `route.params.stack`  
**Add All Items:** Calls `supabase.rpc('upsert_shopping_list_items', { p_user_id, p_items })`

---

### `QuickDealsScreen`

**File:** `screens/QuickDealsScreen.js`  
**Sort toggles:** Price / Savings  
**Tags:** Within Plan / Budget Stretch  
**Budget alert icon:** When item would exceed weekly budget  
**Data source:** `profiles.preferences.weekly_budget_cents`

---

### `SavingsActionScreen`

**File:** `screens/SavingsActionScreen.js`  
**Actions:** Save / Pay Bill / Pay Debt / Donate  
**On action select:** Calls `recordMemoryEvent` to write a `COMMITTED_TO` edge in Neo4j  
**Navigation out:** `NextWeekBuilder`

---

### `NextWeekBuilderScreen`

**File:** `screens/NextWeekBuilderScreen.js`  
**Shows:** Last-week savings recap, plan accuracy ring, plan choice (Same / Refill / New)  
**Data source:** `get-dynamic-home-layout` edge function for lifetime savings  
**Navigation out:** `WeeklyPlan` (PlanTab)

---

## 7. Context Providers

### `BudgetContext` (`lib/BudgetContext.js`)

| Export | Type | Purpose |
|---|---|---|
| `BudgetProvider` | Component | Wrap root navigator |
| `useBudget()` | Hook | Access budget state |
| `weeklyBudgetCents` | `number\|null` | Current budget; null = not yet fetched |
| `budgetResolved` | `boolean` | True after first DB fetch completes |
| `refreshBudget()` | Function | Fetch from `profiles` table |
| `broadcastBudgetChange(cents)` | Function | Save + propagate + invalidate plan cache |

**`DEFAULT_BUDGET_CENTS`** = 15000 ($150) — used when `weeklyBudgetCents` is null.

---

### `TrialContext` (`lib/trialContext.js`)

| Export | Type | Purpose |
|---|---|---|
| `TrialProvider` | Component | Wrap root navigator |
| `useTrialStatus()` | Hook | Access trial state |
| `trialStatus` | `null\|'active'\|'paused'\|'premium'` | Current subscription state |
| `dayNum` | `number` | Current trial day (1–7) |
| `daysLeft` | `number` | Days remaining |
| `isPaused` | `boolean` | True when trial expired — gates MainApp |
| `isTrialUser` | `boolean` | True for active or paused trial |

**Data source:** `profiles.preferences.subscription_status`, `trial_started_at`, `trial_expires_at`  
**Daily reminder:** AsyncStorage key `snippd_trial_reminder_date` throttles once-per-day Alert.

---

## 8. Session Guard (`lib/sessionGuard.js`)

- `useSessionGuard()` hook → returns `panHandlers` attached to root View
- Tracks last touch timestamp via `PanResponder` (pass-through, never consumes event)
- On `AppState` change from background → active: if elapsed > 30 minutes → `supabase.auth.signOut({ scope: 'global' })`
- Logs to `AuditLogger.events.SESSION_TIMEOUT`

---

## 9. Health Monitor (`lib/healthMonitor.js`)

Runs on every app start. 6 checks across 4 phases:

| Phase | Check | What it tests | Healing action |
|---|---|---|---|
| 1 (parallel) | `secure_store` | SecureStore write/read/delete | Clears all Supabase auth keys on failure |
| 1 (parallel) | `async_storage` | JSON integrity of critical keys | Auto-removes corrupted keys |
| 1 (parallel) | `cache_staleness` | Age of weekly_plan (7d), cart (14d), stack_cache (3d) | Auto-clears stale caches |
| 2 | `supabase_connectivity` | HEAD ping to Supabase REST with 5s timeout | None (reports only) |
| 3 | `session_integrity` | JWT expiry check | Auto-refreshes; signs out if refresh fails |
| 4 (post-login) | `user_persona` | Row existence in `user_persona` table | Redirects to `ConciergeOnboarding` |

**Chronic pattern detection:** If a check fails 5+ times in 30 days, status is escalated to CRITICAL.

**Returns:** `{ sessionId, healthy, criticals, healed, forcedSignOut }`  
`forcedSignOut: true` → App.js must route to `Auth`.

---

## 10. Event Tracker (`src/lib/eventTracker.ts`)

Singleton `tracker` exported from `src/lib/eventTracker.ts`.

- Auto-batching queue: flush every 2.5s or when 10 events accumulate
- Endpoint: `{SUPABASE_URL}/functions/v1/ingest-event`
- Auth: `Authorization: Bearer {access_token}`
- Retry: exponential backoff, up to 3 retries, base delay 1.5s
- Methods: `setAccessToken()`, `setDefaultUserId()`, `setDefaultSessionId()`
- Typed convenience methods for 40+ events (trackAppOpened, trackSignIn, trackStackViewed, etc.)

**Critical:** `tracker.setAccessToken(session.access_token)` must be called on login. Events queued before this will fail authentication.

---

## 11. Key Database Tables

| Table | Purpose | Written by |
|---|---|---|
| `profiles` | User profile: display_name, avatar, preferences (budget, subscription, trial) | Client via Edge Functions |
| `user_persona` | Onboarding data: status, briefing_completed, location, style_vibe, clothing_size | Edge Functions |
| `app_home_feed` | Curated deals shown on Home and Discover | Admin + ingestion workers |
| `stack_candidates` | All deal stacks, validated and scored | Ingestion pipeline |
| `shopping_list_items` | User's shopping list (upserted via RPC) | `upsert_shopping_list_items` RPC |
| `checkout_math_snapshots` | HMAC-signed checkout math results from Cloud Run | Cloud Run |
| `user_trips` | Upload receipt trip records | `process-receipt` Edge Function |
| `trip_feedback` | Post-trip survey responses | `TripSummaryFeedbackScreen` |
| `memory_events` | Neo4j-bound memory events (COMMITTED_TO, etc.) | `record-memory-event` Edge Function |
| `coupon_kb` | Coupon knowledge base | Ingestion pipeline |
| `clip_sessions` | Coupon clip session state | `ClipSessionScreen` |
| `healing_events` | Self-healing log entries | `HealthMonitor` |
| `snippd_integrations` | Feature flags (key/value) | Admin |
| `retailer_coupon_parameters` | Per-retailer stacking rules | Admin (never hardcode) |
| `event_weight_config` | Event scoring weights | Admin (never hardcode) |

---

## 12. Supabase Edge Functions

All functions are at `{SUPABASE_URL}/functions/v1/{name}`.  
Auth: `Authorization: Bearer {user_jwt}` unless noted.

| Function | Trigger | Purpose |
|---|---|---|
| `ingest-event` | `tracker` SDK (batch) | Receives analytics events |
| `get-dynamic-home-layout` | HomeScreen focus | Personalised section order from memory |
| `get-weekly-plan` | WeeklyPlanScreen focus | 14-step weekly plan (24h cache) |
| `generate-weekly-plan` | Manual / cron | Generate/regenerate weekly plan |
| `process-receipt` | ReceiptUploadScreen | OCR + verify receipt, write to user_trips |
| `verify-receipt` | process-receipt downstream | Cloud Run HMAC verification |
| `record-memory-event` | SavingsActionScreen, elsewhere | Write Neo4j-bound memory event |
| `get-cart-options` | CartScreen | Per-store cart totals |
| `stack-compute` | WeeklyPlan, Discover | Compute coupon stacks |
| `get-omni-store-comparison` | OmniStoreComparisonScreen | Cross-store price comparison |
| `deal-validator` | Ingestion pipeline | Validate deals against 33 rules |
| `score-deals` | Cron / manual | Score deals with Vertex AI |
| `run-deal-scoring` | Cron | Scheduled deal scoring job |
| `run-coupon-refresh` | Cron | Refresh coupon data |
| `coupon-accuracy-health` | Monitoring | Coupon accuracy health check |
| `stripe-webhook` | Stripe | Handle payment events |
| `delete-account` | ProfileScreen | GDPR account deletion |
| `preference-updater` | Background | Update user preferences from behavior |
| `wealth-engine` | Cron | Compute wealth momentum scores |
| `wealth-momentum` | WealthMomentumScreen | Fetch wealth momentum data |
| `slack-notify` | Admin events | Slack webhook notifications |
| `admin-deal-review` | AdminDealReviewScreen | Admin deal quality review |
| `initialize-agent` | OnboardingConciergeScreen | Initialize AI concierge agent |
| `geo-auth-check` | Location events | Geo-based authorization check |

---

## 13. Feature Flags

Controlled by `src/features/registry.js` via `filterEnabledItems()`.

| Flag | Default | Controls |
|---|---|---|
| `EXPO_PUBLIC_FEATURE_STUDIO` | true | Studio tab in bottom nav |
| `EXPO_PUBLIC_FEATURE_CHEF_STASH` | true | ChefStash screen in Home + Discover stacks |
| `EXPO_PUBLIC_FEATURE_OMNI_STORE_COMPARISON` | false | OmniStore tab in Discover stack |

---

## 14. Local Storage Keys (AsyncStorage)

| Key | Content | Expires |
|---|---|---|
| `cached_weekly_plan` | Weekly plan JSON (`generated_at` timestamp) | 24h (manually invalidated by budget change) |
| `snippd_cart` | Cart items JSON | 14 days |
| `snippd_stack_cache` | Deal stack cache | 3 days |
| `snippd_user_prefs` | User preferences | Never (user-controlled) |
| `@snippd/auth_attempts` | Rate limiter state (`{ count, lockedUntil }`) | Clears on successful login |
| `snippd_trial_reminder_date` | Last trial reminder date string | Never (manual) |

---

## 15. Custom Tab Bar

**File:** `App.js → CustomTabBar`

- Custom pill tab bar (`borderRadius: 30`, dark navy background `#04361D`)
- Positioned absolute at bottom with `pointerEvents="box-none"` to prevent blocking scroll events on Android
- Active state: mint icon (`#C5FFBC`), white label, mint dot below
- Center FAB: diamond-rotated green button with Snippd logo, elevated via `marginBottom: 35`
- Heights: iOS 110pt, Android 100pt; inner bar 70pt

---

## 16. Known Issues & Things to Fix

### CRITICAL — SignInScreen has uncommitted redesign
- `screens/SignInScreen.js` working copy is `SNIPPD_INSTACART_PREMIUM_V1`
- The committed version is `SNIPPD_BETA_HERO_REBUILD_V1`
- The uncommitted version **removed** the rate limiter, Google/Apple OAuth, and event tracker
- **Action needed:** Decide which version to ship. If keeping new design, must port back: `rl_check()`/`rl_record()` rate limiter, `WebBrowser` OAuth, `tracker` calls

### HIGH — HomeScreen app_home_feed may return 0 rows
- Fixed in recent commit (relaxed `isVerifiedSystemStack` + fallback query)
- If `app_home_feed` table is empty, HomeScreen shows empty state
- **Action needed:** Ensure `app_home_feed` is seeded with at least some active deals in production

### HIGH — `upsert_shopping_list_items` RPC must exist in Supabase
- Used by DiscoverScreen and StackDetailScreen to persist list items
- Function signature: `upsert_shopping_list_items(p_user_id UUID, p_items JSONB)`
- Check migration `20260504_savings_loop.sql` or similar has been applied

### MEDIUM — `user_persona` row must exist for every user
- If missing, HealthMonitor returns `redirectTo: 'ConciergeOnboarding'` warning but does NOT hard-redirect (it's a non-blocking warning in Phase 4)
- `resolveUserStatus` then catches the missing row and falls back to `MainApp`
- **Action needed:** Ensure `initialize-agent` edge function creates the row on every signup

### MEDIUM — Weekly plan cache key mismatch risk
- HomeScreen uses `DEFAULT_BUDGET_CENTS = $150` as a fallback
- If user never saves a budget, plan is built on $150 and budget card shows $0 progress

### LOW — StudioStack is feature-flagged
- `EXPO_PUBLIC_FEATURE_STUDIO=true` adds a Studio tab; `false` removes it entirely
- If the Studio tab is not visible, all Studio navigation routes are also removed

### LOW — `SplashIntroScreen` registered but not routed to
- `SplashIntroScreen` is in the root stack but `resolveUserStatus` never returns `'SplashIntro'`
- Screen exists and is safe but is unreachable

---

## 17. Design System

All visual values are in `src/design/tokens.js`. **Never hardcode colors.**

| Token | Value | Use |
|---|---|---|
| `COLORS.canvas` | `#EAF9E7` | Primary background |
| `COLORS.navy` | `#172250` | Headers, dark surfaces |
| `COLORS.green` | `#0C9E54` | CTA buttons, success |
| `COLORS.coral` | `#FB5B5B` | Warnings, destructive |
| `COLORS.mint` | `#C5FFBC` | Accent on dark surfaces |
| `COLORS.white` | `#FFFFFF` | Cards |
| `COLORS.muted` | `#7A9B89` | Secondary text |

**Dark mode:** Explicitly rejected. Do not add it.

---

## 18. Auth Flow Summary

```
App opens
  │
  ├─ getSession() → no session → route to 'Auth' (SignInScreen)
  │     User enters email + password (or Google/Apple OAuth)
  │     supabase.auth.signInWithPassword / signUp
  │     onAuthStateChange fires 'SIGNED_IN'
  │     resolveUserStatus() → 'MainApp' or 'ConciergeOnboarding'
  │     resetToScreen(route)
  │
  └─ getSession() → session exists
        HealthMonitor.runStartupChecks()
          → if forcedSignOut: route to 'Auth'
          → else: resolveUserStatus() → route to MainApp/ConciergeOnboarding
        
        isPaused (trial expired) → override route to 'TrialGate'
```

---

*Last updated: 2026-05-07*  
*This document should be updated any time navigation routes, screen data sources, or startup logic changes.*
