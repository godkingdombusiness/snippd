# Snippd Launch Readiness Audit

Date: 2026-05-10  
Branch: `frontend-v2-launch`  
Scope: React Native/Expo app launch and beta readiness. This is an audit report only; no app behavior was changed.

## Working

- Repo state was clean, on `frontend-v2-launch`, and up to date with `origin`.
- Core root route files imported by `App.js` exist. `Auth`, `Onboarding`, `PersonalityResult`, `SoftPersonalization`, and `MainApp` are registered in the root stack.
- The intended onboarding continuation is mostly wired:
  - `OnboardingScreen` navigates to `PersonalityResult`.
  - `PersonalityResultScreen` replaces to `SoftPersonalization` with `fromPersonalityReveal: true`.
  - `SoftPersonalizationScreen` replaces to `MainApp` when launched from the personality reveal.
- `SoftPersonalizationScreen` saves preferred stores, allergies, dietary preference, favorite foods, and coupon comfort into `profiles` / `profiles.lifestyle_concierge`.
- `HomeScreen` queries `app_home_feed` and shows an empty state when no stack is available.
- `HomeScreen` Intelligence Profile reads real profile fields from Supabase: `preferred_stores`, `lifestyle_concierge.dietary_preference`, `lifestyle_concierge.favorite_foods`, `lifestyle_concierge.coupon_comfort`, and budget/profile preferences.
- `WeeklyPlanScreen` writes Lock In/Add All data to both AsyncStorage cart via `addItemsToActiveCart` and Supabase `shopping_list_items` via `upsert_shopping_list_items`.
- `CartScreen` reads the active per-user AsyncStorage cart via `readActiveCart`, groups by store and store area, shows meal connections via `meal_name`, and loads weekly budget with `fetchWeeklyBudgetCents`.
- `CouponClippingScreen` filters matched coupons to rows with `exact_coupon_url`, opens exact verified URLs, and only falls back to safe retailer coupon hub URLs in the link-by-link retailer prompt.
- `CheckoutBreakdownScreen` has the correct intended posture: when it owns the math call, it calls `fetchAuthorizedCheckoutMath` and withholds totals when authority is unavailable.

## Broken

- `DiscoverTab` is referenced but not registered in `MainTabs`.
  - Registered tabs are `HomeTab`, `PlanTab`, `SnippdTab`, Studio, and `ProfileTab` in `App.js`.
  - Broken callers include `HomeScreen.goToExplore`, `CartScreen` empty-state Browse Deals, `CategoryInsightScreen`, and `BarcodeScannerScreen`.
  - `DiscoverStack` exists but is not mounted as a tab, so Discover routes are effectively orphaned.
- `ReceiptUploadScreen` navigates to `OutcomeScreen`, but App.js registers the route as `Outcome`.
- `ShoppingListScreen` navigates to `TripSummaryFeedback`, but `TripSummaryFeedbackScreen` is not registered in App.js.
- `ProfileScreen` has a `CreditsStore` menu item, but `CreditsStoreScreen` is not imported or registered in App.js.
- `CheckoutBreakdownScreen` and `ReceiptVerifiedScreen` trust `route.params.totals` directly. `CartScreen` passes `authorizedTotals || engineTotals`, so engine estimates can be displayed as if they were signed checkout authority.
- `OnboardingScreen` saves the first onboarding answers only into `profiles.preferences`; it does not save top-level `profiles.preferred_stores`, `profiles.allergies`, `profiles.weekly_budget`, `profiles.nutrition_goals`, or explicit `foods_liked` / `foods_disliked`.
- `HomeScreen` Intelligence Profile reads top-level `preferred_stores`, but first-pass onboarding only writes `preferences.preferred_stores`; users who do not complete SoftPersonalization may see an incomplete profile card.
- `HomeScreen` displays `budgetRange` using `Math.round(data.weekly_budget ?? data.preferences?.budget_range ?? 0)`. If only the onboarding string budget range exists, this can become `NaN`; if `weekly_budget` is cents, it displays cents as dollars.

## Risky For App Store

- `WeeklyPlanScreen` includes hardcoded sample meals without a `DEMO_MODE` flag and can show them when unauthenticated or when daily meal input is empty.
- `WeeklyPlanScreen` still uses placeholder financial math:
  - household stack = 8% of dinner total
  - refill items = 12% of dinner total
  - post-register credits = 15% of savings
  - takeout comparison = $18-$28 per person per night
- `WeeklyPlanScreen` nutrition tab derives protein/carbs/fat from calories using fixed macro ratios, not real item nutrition.
- `ReceiptUploadScreen` estimates savings as 15% for list-matched stack items when no verified deal match exists.
- `ReceiptUploadScreen` inserts `trip_results.verified = true` from local OCR/review flow, before authoritative receipt verification.
- `ReceiptVerifiedScreen` invokes `verify-receipt` with a synthetic fallback receipt id when no `receiptUploadId` exists, which risks false verification states or noisy failed verification.
- Several files contain mojibake-rendered text in comments/UI strings from encoding drift. This is not necessarily a runtime blocker, but it is polish-risky and may surface as broken characters in UI.

## Must Fix Before Beta

1. Mount `DiscoverStack` as `DiscoverTab` or change all `DiscoverTab` navigations to a registered route.
2. Fix broken route names/registrations:
   - `OutcomeScreen` should navigate to `Outcome`, or App.js should register `OutcomeScreen`.
   - Register `TripSummaryFeedbackScreen` or remove/update the navigation.
   - Register `CreditsStoreScreen` or remove/update the profile menu item.
3. Prevent non-authoritative checkout totals from entering `CheckoutBreakdownScreen` / `ReceiptVerifiedScreen` as `totals`.
   - Only pass `totals` when `authorizedTotalsForRoute(...)` returned a signed authority.
   - Pass engine estimates under a different name if the UI needs them, and keep them labeled as estimates.
4. Remove or gate all `WeeklyPlanScreen` sample meals behind a clearly named `DEMO_MODE` flag.
5. Remove placeholder weekly-plan financial math from launch UI, or label it explicitly as an estimate and keep it out of “you saved” / checkout claims.
6. Remove the 15% receipt savings estimate and only show receipt savings from receipt OCR promo lines, signed checkout math, or verified backend comparison.
7. Stop marking locally parsed receipts as `verified: true`; use the receipt verification function or a verified backend status.
8. Save first-pass onboarding preferences to the same profile fields the rest of the app reads, including stores, budget, diet, allergies, foods liked/disliked, coupon comfort, and nutrition goals.

## Must Fix Before Public Launch

1. Normalize profile schema usage across onboarding, SoftPersonalization, Home, WeeklyPlan, Cart, and recommendation services.
2. Replace fixed macro-ratio nutrition math with cached/verified nutrition data, or suppress macro totals when unavailable.
3. Make `app_home_feed` empty state more premium and action-oriented. Current copy is safe but too thin for launch.
4. Ensure cart and shopping-list sync have retry/error UI when `upsert_shopping_list_items` fails; the current RPC write is fire-and-forget after AsyncStorage succeeds.
5. Require a real `receiptUploadId` for `ReceiptVerifiedScreen` verification flow and connect it to `receipt_uploads` / `process-receipt` consistently.
6. Audit all user-visible financial claims in marketing-style copy, including community savings, savings floors, annualized savings, and restaurant comparisons.
7. Add automated route-registration tests for all `navigation.navigate(...)` route names used by screens.
8. Add a launch smoke test for the exact happy path:
   `SignInScreen -> OnboardingScreen -> PersonalityResultScreen -> SoftPersonalizationScreen -> MainApp -> WeeklyPlanScreen -> CartScreen -> CouponClippingScreen -> CheckoutBreakdownScreen -> ReceiptUpload/ReceiptVerified`.

