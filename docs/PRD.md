# Snippd™ — Product Requirements Document

**Version:** 1.3.0
**Last Updated:** April 9, 2026
**Platform:** iOS · Android · Web (Expo / React Native)
**Bundle ID:** `com.snippd.app`

---

## Changelog

| Version | Date | Summary |
|---|---|---|
| 1.3.0 | Apr 9 2026 | Onboarding overhaul (green canvas, hero images, energized copy); expo package updates; validator 8192 token fix; app.json schema cleanup |
| 1.2.0 | Apr 9 2026 | Stack validator agent deployed; breakdown section reorder; qty column; dock positioning fix; SALE/CLEARANCE clip removal; auth simplification; payment breakdown itemization; catalog PNGs; holiday expiry rule |
| 1.1.0 | Apr 2026 | Full Week Prep Stack meals-only filter; category presentation format; Clip All removed |
| 1.0.0 | Apr 2026 | Initial PRD |

---

## 1. Product Vision

### Mission
Snippd makes grocery savings effortless and intelligent. It transforms verified weekly deals from major retailers into structured, ready-to-execute shopping stacks — no coupon binders, no extreme couponing, no guesswork.

### Tagline
> *Real Savings. Real Simple.*

### Brand Voice — "Quiet Intelligence"
The tone is calm, trustworthy, and premium — like a personal financial advisor for groceries. Never loud. Never desperate. The app should feel like a Bloomberg terminal crossed with a great meal plan.

---

## 2. Target Users

| Persona | Description |
|---|---|
| **The Budget Builder** | Household of 2–4, $100–$250/week grocery budget, wants to reduce spend without effort |
| **The Meal Planner** | Plans meals weekly, cares about nutrition and variety, wants a structured weekly prep list |
| **The Deal Seeker** | Actively clips coupons today, wants a smarter/faster system |
| **The Busy Parent** | No time to research deals; trusts a curated, verified list they can execute in one trip |

---

## 3. Core Concepts

### Stacks
A **Stack** is a curated group of grocery items from a single retailer that have been verified to deliver measurable savings when bought together. Each stack has:
- A retailer (with official brand color for instant ID)
- A retail total, out-of-pocket total, and total savings
- A `breakdown_list` of individual line items with prices, deal types, coupon links
- A savings type breakdown: instant savings · coupons · BOGOs · gift cards · rewards

### Stack Intelligence
When a user opens a Stack, they see three payment tiers:
1. **At the Register** — exact card swipe amount after instant savings + clipped coupons
2. **Value Coming Back** — gift cards earned (itemized per product) + loyalty rewards/ExtraBucks
3. **True Net Cost** — At the Register minus all post-purchase value

### The 5-4-3-2-1 Grocery Method
A weekly haul engine that selects:
- 5 Vegetables · 4 Fruits · 3 Proteins · 2 Pantry items · 1 Treat

Items are picked from live stacks, sorted by best savings, within the user's weekly budget.

### Full Week Prep Stack
7 meal-prep stacks (one per day of the week), starting from today's day. Lineup refreshes every Sunday using a deterministic seeded shuffle — consistent all week, fresh every Sunday.

**Meals only** — stack `meal_type` must match: `dinner`, `breakfast`, `lunch`, `brunch`, `protein`, `produce`, `dairy`, `frozen`, `pantry`, `meal`, `recipe`. Non-meal stacks (`household`, `beauty`, `snacks`, `beverage`, `cleaning`, `health`, `baby`) go to Shop by Stack or Deal Hub.

---

## 4. Feature Requirements

### 4.1 Authentication

| Requirement | Detail |
|---|---|
| Sign In | Email + password via Supabase Auth |
| Sign Up | Email + password, profile auto-created on first login |
| Forgot Password | Supabase reset email flow |
| MFA | TOTP two-factor (setup + verify screens) |
| Session Security | Tokens stored via `expo-secure-store` (never in AsyncStorage) |
| Sign Out | Resets navigation to Auth screen via `navigation.getParent('root')` |
| Delete Account | Removes `profiles` row then signs out |

**Auth Screen Design (v1.2.0 — simplified):**
- Canvas: Mint `#C5FFBC`
- Hero section: Logo image + brand name + tagline "Real Savings. Real Simple." — no stats strip
- Form card: White, 28px radius, Navy shadow
- CTA button: Green `#0C9E54`, Coral `#FB5B5B` border-bottom depth
- Status bar: 3 live indicators (Verified Deals Only · No Extreme Couponing · Chef Stash AI) in Navy uppercase with green dot
- Input focus: Mint glow border, no system blue
- Toggle (Sign In / Create Account): 24px radius pill, active tab Navy
- Sign-up mode shows legal line: "By creating an account you agree to our Terms of Service and Privacy Policy"
- "Create one free" toggle text (not "Sign up")
- Stats row **removed** — replaced by single tagline

---

### 4.2 Home Screen

| Section | Requirement |
|---|---|
| Budget Tracker | Shows "Ready to Spend", progress bar, spent vs. goal. Pulls from `profiles.weekly_budget` + `profiles.weekly_spent` |
| This Week's Stacks | Horizontal scroll of live `app_home_feed` stacks ordered by savings. Refreshes on every focus (`useFocusEffect`). Each card shows store brand color chip |
| Quick Actions | My List · Deals · Wins · Studio |
| Plan Your Trip | Meal Prep · Best Deals · Fast Route · Share List |
| Fresh Start | Resets weekly spend to $0 (with confirmation) |

---

### 4.3 Explore / Discover Screen

| Section | Requirement |
|---|---|
| Full Week Prep Stack | 7 meal-prep stacks, meal types only. Non-meal stacks excluded. Refreshes every Sunday. |
| Shop by Stack | Category grid — holiday names removed once the holiday has passed |
| Deal Hub | Accordion tiers: Under $10 · Under $25 · Under $50. Each deal card shows store brand color chip. Tapping opens StackDetail. |
| Sunday Strategy (5-4-3-2-1) | Navy card with progress bar and category pills. Deploys to StackDetail with `_is54321: true`. |

**Meal filtering rules (Full Week Prep Stack):**
- INCLUDE: `dinner`, `breakfast`, `lunch`, `brunch`, `protein`, `produce`, `dairy`, `frozen`, `pantry`, `meal`, `recipe`
- EXCLUDE: `household`, `beauty`, `snacks`, `beverage`, `cleaning`, `health`, `baby`

**Holiday name rule:**
- Once a holiday date has passed, remove the holiday name from any stack title and set status to `expired`
- Example: After Easter Sunday, rename "Easter Brunch Ham & Fresh Sides" → "Brunch Ham & Fresh Sides", status → `expired`

**Discover Screen categories (current):**
- Spring BBQ · Spring Refresh · Fresh Finds · Pantry Staples
- Easter removed (April 6, 2026 — holiday passed)

---

### 4.4 Stack Detail Screen

#### Navigation Contract
All callers must pass a `stack` object with values in **cents**:
```js
{
  id, stack_name, store, retailer,
  retail_total,   // cents
  oop_total,      // cents
  total_savings,  // cents
  breakdown_list, // parsed array (never raw JSON string)
  item_ids,       // [] for app_home_feed stacks
  meal_type, card_type
}
```

#### Breakdown Screen Section Order (v1.2.0)
Sections appear in this exact order:
1. **What You'll Pay** — payment breakdown card
2. **Items to Buy (N)** — purchasable items list
3. **Coupons to Clip (N)** — clippable coupon list

#### Payment Breakdown Card
- Store header in official brand color
- Retail Total → Instant Savings → Coupons Applied
- **AT THE REGISTER** — large number, green background row
- **Rewards / Value Back** — itemized per product:
  - Gift cards earned per item (amber, `🎁  Product Name · +$X.XX · Issued at checkout`)
  - Loyalty rewards / ExtraBucks per item (purple)
- **TRUE NET COST** — Navy footer row, mint text
- Each rewards line shows product name + value; totals match "Coupons Applied" line

#### Items to Buy Section
- Header: `Items to Buy (N)` — N = count of purchasable items
- Each item row shows:
  - **Quantity badge**: `Nx` pill (teal when unselected, green when selected)
  - Product name with deal label in parentheses: `Coca-Cola 12-packs (BOGO)` / `Chicken Breast (Mfr Coupon)`
  - Price and savings info
- Quantity logic:
  - Reads `item.qty` field if present
  - BOGO/B1G1 items default to qty 2 if no explicit qty
  - All others default to qty 1
- Deal label rules:
  - `BOGO` / `B1G1` → `(BOGO)`
  - `MFR_COUPON` → `(Mfr Coupon)`
  - `STORE_COUPON` → `(Store Coupon)`
  - `DIGITAL` → `(Digital Coupon)`
  - `CLEARANCE` → `(Clearance)`
  - `SALE` → no label (sale is baseline, no parenthetical)

#### Coupons to Clip Section
- Header: `Coupons to Clip (N)` — N = count of clippable items
- Sub-line: `N not yet clipped · tap each to open · saves $X.XX`
- Each coupon row shows:
  - **Quantity**: `Nx` prefix on product name
  - Product name
  - Coupon value (right-aligned)
  - Brand/size details
- **No "Clip All" button** — users clip one at a time
- Tapping a row opens the coupon URL in the browser

#### Clip Button Rules (v1.2.0)
- `BOGO` / `B1G1` → **never show clip button** (savings auto-apply at register)
- `SALE` → **never show clip button** (no coupon to clip)
- `CLEARANCE` → **never show clip button** (no coupon to clip)
- `MFR_COUPON`, `STORE_COUPON`, `DIGITAL` → show clip button with URL

#### Coupon URL Logic
1. Use item's own `coupon_url` if it's a real product page (not a generic `/coupons` fallback)
2. Otherwise build a product search URL for the store:
   - Target: `target.com/s?searchTerm={item}`
   - CVS: `cvs.com/search?searchTerm={item}`
   - Walgreens: `walgreens.com/search/results.jsp?Ntt={item}`
   - Kroger: `kroger.com/savings/cl/coupons?q={item}`
   - Walmart: `walmart.com/search?q={item}`
   - Others: store's digital coupon landing page

#### Action Dock — Positioning (v1.2.0)
The app uses a **floating pill tab bar** (not a standard native tab bar):
- Pill shell height: 110px iOS / 100px Android
- Pill top edge: ~100px from bottom of screen

```js
const PILL_CLEARANCE = Platform.OS === 'ios' ? 106 : 96;
const dockBottom = insets.bottom + PILL_CLEARANCE;
```

- Dock `paddingBottom` = `insets.bottom + PILL_CLEARANCE`
- Scroll spacer height = `160 + PILL_CLEARANCE + insets.bottom`
- **Do NOT use** `insets.bottom + 49` — that value does not clear the floating pill

#### 5-4-3-2-1 Grouped View
When `stack._is54321 === true`, items are rendered grouped by category (Vegetables · Fruits · Proteins · Pantry · Treat) with colored section headers.

---

### 4.5 Chef Stash AI

AI generates a full recipe from stack ingredients using Google Generative AI.

**Recipe output must include:**
- `prep_time`, `cook_time`, `serves`, `difficulty`
- `ingredients: [{ item, role }]` — each with green dot marker
- `nutrition: { calories, protein_g, carbs_g, fat_g, fiber_g }`
- `steps: [{ title, time, instructions }]`
- `storage` tips

**UI requirements:**
- Timing chips row (Prep · Cook · Serves · Difficulty)
- Navy nutrition card with all 5 macros
- Ingredient list with green bullet dots
- Step-by-step with inline timer (pause turns red)
- Storage card (blue)

---

### 4.6 Catalog Screen

- Browses all live stacks grouped by `meal_type` category
- Filterable by store chip (All · Publix · Dollar General · Aldi · Target · Walgreens)
- Sortable: Most Stacks · Best Savings · A to Z
- Top Stacks: highest yield (savings ÷ retail), each with store brand color chip
- Tapping any stack opens StackDetail with `breakdown_list` properly parsed

**Category card images (v1.2.0):**
PNG assets replace the colored dot system for category card accents:

| Category key | Asset |
|---|---|
| protein | `cat-protein.png` |
| produce | `cat-veggies.png` |
| dairy | `cat-dairy.png` |
| pantry | `cat-pantry.png` |
| snacks | `cat-snacks.png` |
| household | `cat-household.png` |
| breakfast | `cat-fruits.png` |
| bogo | `cat-bogo.png` |
| beverages / frozen | `cat-fruits.png` / `cat-dairy.png` |

---

### 4.7 Profile Screen

- View/edit full name, email, weekly budget
- Store preferences
- Dietary preferences
- Budget dashboard link
- Sign Out → resets to Auth screen
- Delete Account → removes profile row from Supabase, then signs out

---

### 4.8 Help Screen

- Hero search bar with live inline dropdown (filters FAQ as user types)
- Full FAQ section (hidden while search is active)
- Support email link: `support@getsnippd.com`

---

### 4.9 Onboarding Screen (v1.3.0 — overhauled)

8-step question flow after the photo tour. Each step collects user preferences that personalize deal routing, recipe filtering, and budget recommendations.

**Visual design:**
- Canvas: **Green `#0C9E54`** — primary brand color fills the screen
- White cards for option rows (selected state → Mint `#C5FFBC` background + Green border)
- White text for headlines and sub-copy on the green canvas
- Mint `#C5FFBC` for eyebrow labels and progress bar fill
- Frosted-glass footer chips (`rgba(255,255,255,0.2)`)
- CTA button: White background, Green text

**Per-step hero image (130px rounded strip above the question):**

| Step | Image |
|---|---|
| 1 — Who are you shopping for? | `slide1.jpg` |
| 2 — What's your goal? | `slide2.jpg` |
| 3 — What's the worst part? | `slide3.jpg` |
| 4 — How do you cook? | `stack-protein.png.png` |
| 5 — Dietary needs? | `stack-produce.png.png` |
| 6 — Where do you shop? | `slide4.jpg` |
| 7 — When do you shop? | `stack-breakfast.png.png` |
| 8 — What's your budget? | `hero-banner.png` |

**Eyebrow copy (energized, pain-point-aware):**

| Step | Eyebrow |
|---|---|
| 1 | `LET'S DO THIS 🛒` |
| 2 | `YOUR WIN ✦` |
| 3 | `REAL TALK 😤` |
| 4 | `YOUR KITCHEN 🍳` |
| 5 | `WHAT WORKS FOR YOU 🥗` |
| 6 | `YOUR STORES 📍` |
| 7 | `YOUR SCHEDULE ⏰` |
| 8 | `THE MONEY PART 💰` |

**Questions and answer sets (unchanged):**
- Step 1: Household size — Just me / Two people / Family of 3–4 / Five or more
- Step 2: Goal — Spend less / Eat healthier / Save time / Reduce waste / Plan my meals
- Step 3: Pain point — Always overspend / Forget things / Food goes to waste / Miss deals / No time to plan
- Step 4: Cook style — Fast & easy / Home cook / From scratch / Minimal cooking
- Step 5: Dietary — No restrictions / Vegetarian / Vegan / Gluten-Free / Keto / Dairy-Free / Halal / Kosher (multi-select)
- Step 6: Stores — Publix / Walmart / Target / Aldi / Winn-Dixie / BJ's / Whole Foods / Dollar General / Sprouts / Walgreens (multi-select)
- Step 7: Shopping rhythm — Weekday morning / Weekday evening / Weekend morning / Whenever
- Step 8: Weekly budget — Free text input with recommendation card + US average benchmarks

**Phase pills:** About You (steps 1–4) · Your Stores (steps 5–7) · Your Plan (step 8)

**Adaptive copy:** Question text and sub-copy reference the user's earlier answers (household name, goal label, pain label). Example: "We fix overspending by routing the best deals across every store you already use."

**Tour (pre-questions):** 4 full-screen photo slides with Instagram story bars. Skip button top-right. Last slide has "Get Started" CTA. Dark overlay — kept as-is.

**Paywall (post-questions):** Dark navy screen. 7-day free trial card (no credit card required). Lifetime access card. Consent checkbox required before CTA activates. — kept as-is.

---

## 5. Stack Validator Agent (v1.2.0)

### Overview
A Supabase Edge Function (`stack-validator`) that validates and enriches every active stack in `app_home_feed` using Gemini AI.

**Problem it solves:** The vertex-agent-crawl inserts stacks with bare `breakdown_list` items (`{ item, type, price }`) and no `deal_type`, `coupon_url`, savings, or confidence data.

### Endpoint
`POST https://[project].supabase.co/functions/v1/stack-validator`

### Request Modes

| Body | Behavior |
|---|---|
| `{ "validate_all": true }` | Process every active stack |
| `{ "validate_all": true, "limit": 5, "offset": 10 }` | Batch mode — max 15 per call to stay within 150s timeout |
| `{ "stack_id": "uuid" }` | Validate one specific stack |
| `{ "dry_run": true }` | Validate but do NOT write to DB |

### What it enriches per item

```json
{
  "deal_type": "SALE | BOGO | MFR_COUPON | STORE_COUPON | DIGITAL | CLEARANCE",
  "price": 3.99,
  "regular_price": 5.49,
  "savings": 1.50,
  "coupon": 0.00,
  "coupon_url": "https://...",
  "brand": "Brand Name",
  "size": "12 oz",
  "confidence": 0.92
}
```

### Stack-level updates
- `confidence_score` — average item confidence
- `verification_status` → `verified_live`
- `pay_price` / `save_price` — updated only if `totalPay > 0` (guards DB check constraint `chk_app_home_feed_v2_pay_price_positive`)

### Technical rules
- **Retry logic:** Exponential backoff on Gemini 503/429 — 1.5s → 3s → 6s, max 3 attempts
- **Token limit:** `maxOutputTokens: 8192` (increased from 4096 to handle large stacks without JSON truncation)
- **Batching:** Use `limit` (default 10, max 15) + `offset` for full-catalog runs — do not attempt >15 at once
- **Model:** `gemini-2.5-flash` at temperature 0.3 for factual, low-variance output

### Recommended run pattern (30 stacks, 5 per call)
```bash
# Run sequentially — each takes ~60-90s
curl ... -d '{"validate_all":true,"limit":5,"offset":0}'
curl ... -d '{"validate_all":true,"limit":5,"offset":5}'
# ...continue to offset 25
```

---

## 6. Data Requirements

### `app_home_feed` — Required Columns

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | |
| `title` | text | Display name |
| `meal_type` | text | Category classifier |
| `card_type` | text | `meal_stack` or `deal_card` |
| `retailer` | text | Store name (used for brand color lookup) |
| `pay_price` | numeric | **Dollars** (not cents). Must be > 0 (DB check constraint). |
| `save_price` | numeric | **Dollars** (not cents) |
| `breakdown_list` | jsonb | Array of line-item objects |
| `confidence_score` | numeric | 0–1 from validator. Below 0.5 → show EST. prefix on prices |
| `verification_status` | text | `verified_live` to display |
| `dietary_tags` | text[] | Optional tags |
| `status` | text | Must be `active` to display |

### `breakdown_list` Item Schema (v1.2.0 — enriched)

```json
{
  "item": "string — product name (legacy field)",
  "name": "string — product name (validator field)",
  "brand": "string — brand name",
  "size": "string — package size",
  "price": "number — sale price in dollars",
  "regular_price": "number — regular retail price in dollars",
  "savings": "number — instant saving in dollars",
  "coupon": "number — coupon value in dollars",
  "coupon_url": "string | null — direct product URL",
  "deal_type": "string — SALE | MFR_COUPON | STORE_COUPON | BOGO | B1G1 | DIGITAL | REBATE | CLEARANCE",
  "type": "string — legacy field, same values as deal_type",
  "qty": "number — quantity to buy (BOGO defaults to 2 if not set)",
  "confidence": "number — 0–1 per-item confidence from validator",
  "_category": "string — vegetable | fruit | protein | pantry | treat (5-4-3-2-1 only)"
}
```

---

## 7. Brand System

### Primary Brand Color
**Green `#0C9E54`** is the primary brand color. Use it for:
- Hero backgrounds on bold/interactive screens (onboarding, CTAs)
- Button backgrounds with white text
- Active states, savings amounts, confirmation states

### Color Palette

| Token | Hex | Usage |
|---|---|---|
| Green (Primary) | `#0C9E54` | Canvas for brand screens, CTA buttons, savings |
| Mint | `#C5FFBC` | Accent on green surfaces; lighter canvas for content screens |
| White | `#FFFFFF` | Cards, input backgrounds, text on green |
| Navy | `#172250` | Text on white cards — use sparingly as accent, NOT as primary bg |
| Coral | `#FB5B5B` | CTA button depth (border-bottom + shadow) |
| Body text | `#1F2937` | Dark text on white cards |
| Light Border | `#DDE8E3` | Input borders |
| Placeholder | `#9BADB5` | Input placeholder text |

> **Rule:** Dark navy `#172250` as a full-screen background was explicitly rejected. Do not use it as a screen canvas. It is acceptable only for the paywall screen and modal overlays.

### Typography

- **Sublima-ExtraBold** — all headings, labels, prices, CTAs, bold body
- **Sublima-ExtraLight** — body copy, subtitles, captions, input text

### Card Design

- White background
- 16–28px border radius (28px for main content cards)
- Soft shadow (`shadowOpacity: 0.08–0.13`, `shadowRadius: 8–28`)
- `StatusBar barStyle="light-content"` on Green screens
- `StatusBar barStyle="dark-content"` on Mint/White screens

### Retailer Brand Color Map

| Store | Background | Text |
|---|---|---|
| Target | `#CC0000` | White |
| Dollar General | `#FFCD00` | `#1A1A1A` |
| Dollar Tree | `#6D2D8B` | White |
| Publix | `#1B7A3E` | White |
| CVS | `#CC0000` | White |
| Walgreens | `#E31837` | White |
| Aldi | `#00448E` | White |
| Kroger | `#003082` | White |
| Walmart | `#0071CE` | White |
| Sprouts | `#5A8E3A` | White |
| Whole Foods | `#00674B` | White |
| H-E-B | `#E31837` | White |
| Trader Joe's | `#B22222` | White |

---

## 8. Technical Rules

### Critical Conventions

| Rule | Reason |
|---|---|
| `StackDetailScreen` works in **cents** | All monetary values divided by 100 via `fmt()`. Never pass dollars. |
| `breakdown_list` must be parsed | Supabase JSONB can return as string. Always try/catch `JSON.parse` before `Array.isArray()`. |
| `useFocusEffect` not `useEffect` for data fetches on tab screens | `useEffect` fires once on mount; `useFocusEffect` re-runs every time the screen gets focus. |
| `navigation.getParent('root')` for sign out | ProfileScreen is 3 levels deep. Requires `id="root"` on root Stack.Navigator in `App.js`. |
| BOGO/SALE/CLEARANCE never clipped | `buildCouponUrl()` returns `null` for BOGO, B1G1, SALE, CLEARANCE — no coupon to clip. |
| `getWeekSeed()` not `getDaySeed()` for Full Week Prep Stack | Meal lineup must be stable all week, only rotating on Sundays. |
| Floating pill tab bar clearance | `PILL_CLEARANCE = Platform.OS === 'ios' ? 106 : 96`. Use `insets.bottom + PILL_CLEARANCE` for dock position. Never use `insets.bottom + 49`. |
| `pay_price` DB constraint | `app_home_feed.pay_price` must be > 0. Only update it from the validator if `totalPay > 0`. |
| Validator token limit | `maxOutputTokens: 8192` in Gemini call. 4096 caused JSON truncation on large stacks. |

### Clip Button Decision Tree

```
deal_type?
├── BOGO / B1G1 / BUY ONE → null (auto-applied at register)
├── SALE               → null (baseline price, nothing to clip)
├── CLEARANCE          → null (clearance price, nothing to clip)
└── MFR_COUPON / STORE_COUPON / DIGITAL / REBATE
    ├── has coupon_url (real product page) → use it
    └── no URL → build product search URL for the store
```

### Navigation Parameter Contract

When navigating to `StackDetail`, always pass:
```js
navigation.navigate('StackDetail', {
  stack: {
    id, stack_name, store, retailer,
    retail_total:   dollars * 100,  // CENTS
    oop_total:      dollars * 100,  // CENTS
    total_savings:  dollars * 100,  // CENTS
    breakdown_list: parsedArray,    // NEVER a raw JSON string
    item_ids: [],
    meal_type, card_type,
  }
})
```

### Expo SDK Version (as of Apr 9 2026)

| Package | Version |
|---|---|
| expo | ~55.0.12 |
| expo-blur | ~55.0.13 |
| expo-camera | ~55.0.14 |
| expo-crypto | ~55.0.13 |
| expo-image-picker | ~55.0.17 |
| expo-linear-gradient | ~55.0.12 |
| expo-location | ~55.1.7 |
| expo-media-library | ~55.0.13 |
| expo-secure-store | ~55.0.12 |
| expo-sharing | ~55.0.17 |
| expo-splash-screen | ~55.0.16 |
| expo-web-browser | ~55.0.13 |

**app.json notes:**
- `android.targetSdkVersion`, `android.compileSdkVersion`, `android.minSdkVersion` are **not valid** in Expo SDK 55 config. Remove them — the SDK manages these automatically.
- `splash.image` must point to an existing asset file. Required: `./assets/splash-icon.png`.

---

## 9. Permissions

| Permission | Purpose |
|---|---|
| Camera | Receipt scanning, pantry identification, Studio video |
| Photo Library | Receipt upload, profile photo, save savings cards |
| Location | Find nearby store deals, optimal shopping route |
| Microphone | Creator Studio savings video recording |
| Face ID | Secure account unlock |
| Biometric | Android fingerprint unlock |

---

## 10. Subscription Model

- Free tier: core stacks, basic budget tracker
- 7-day free trial for new accounts (no credit card required)
- Trial gate screen (`TrialGateScreen.js`) controls premium feature access
- Monthly: $4.99/month after 7-day trial
- Lifetime: $99 one-time

---

## 11. File Map (key screens)

| File | Purpose |
|---|---|
| `screens/AuthScreen.js` | Sign in / sign up — simplified hero, legal text |
| `screens/HomeScreen.js` | Home feed, budget tracker, quick actions |
| `screens/DiscoverScreen.js` | Full Week Prep, Shop by Stack, Deal Hub |
| `screens/StackDetailScreen.js` | Stack breakdown — sections, dock, coupons, rewards |
| `screens/CatalogScreen.js` | Category browser with PNG accent images |
| `screens/OnboardingScreen.js` | 8-step question flow + tour + paywall |
| `screens/ProfileScreen.js` | User settings, budget, stores |
| `screens/HelpScreen.js` | FAQ search |
| `supabase/functions/stack-validator/index.ts` | Gemini-powered stack enrichment agent |
| `lib/supabase.js` | Supabase client with SecureStore auth adapter |
| `assets/` | PNG images — cat-*.png for catalog, slide*.jpg for onboarding |
