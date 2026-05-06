# Snippd — Design System Reference
**Version 2.0 — Sovereign**
> Single source of truth for all visual decisions. Every screen and component must reference this document.
> Last updated: 2026-04-24

---

## 1. Design Philosophy

**Sovereign Intelligence.** The UI communicates that an autonomous system is working on the user's behalf. No decoration. No friendliness theater. Precision and authority — the aesthetic of a system that has already done the work.

Reference benchmarks: Cash App (data clarity), Robinhood (dark precision), Linear (terminal authority).

---

## 2. Color Tokens — Sovereign Palette

### 2A. Current State (Live in Codebase)

Two token files exist and conflict. This must be resolved before any screen migration.

| File | Palette | Status |
|---|---|---|
| `src/design/tokens.js` | Mint canvas (`#EAF9E7`), Navy (`#172250`), Mint accent (`#C5FFBC`) | **Deprecated — do not extend** |
| `lib/theme.js` | Light FinTech (`#F8F9FA` bg, `#172250` navy, `#0C9E54` green) | **Transitional — do not extend** |
| Screen-level overrides | `#050805` / `#0C9E54` in `OnboardingConciergeScreen`, `LogicScanScreen` | **Sovereign — canonical reference** |

### 2B. Target Token Set (Replace Both Files With This)

```javascript
// src/design/tokens.js — SOVEREIGN v2.0
// This replaces both src/design/tokens.js and lib/theme.js

export const COLORS = {

  // ── Canvas (backgrounds) ─────────────────────────────────────
  bg:          '#050805',   // primary screen background — deep green-black
  surface:     '#101410',   // card surface
  surfaceHi:   '#161A16',   // hover / elevated card
  surfaceDeep: '#1E231E',   // modal, bottom sheet, deepest layer

  // ── Accent ───────────────────────────────────────────────────
  green:       '#0C9E54',               // Sovereign Green — primary CTA, borders, icons
  greenDark:   '#0A8749',               // hover / pressed state
  greenGlow:   'rgba(12,158,84,0.10)',  // selection tint, badge bg light
  greenGlowMd: 'rgba(12,158,84,0.20)', // badge bg medium, focus ring
  greenGlowLg: 'rgba(12,158,84,0.35)', // active state highlight

  // ── Text ─────────────────────────────────────────────────────
  textPrimary:  '#FFFFFF',   // headlines, values, labels on dark
  textSecondary:'#A0A0A0',   // body text, descriptions
  textMuted:    '#525252',   // placeholder, disabled, track labels
  textInverse:  '#050805',   // text on green buttons

  // ── Borders ──────────────────────────────────────────────────
  border:       'rgba(255,255,255,0.07)', // default card/section border
  borderSel:    '#0C9E54',               // selected state border
  borderDim:    'rgba(255,255,255,0.04)', // subtle divider

  // ── Semantic ─────────────────────────────────────────────────
  destructive:  '#FB5B5B',   // errors, warnings, destructive actions
  amber:        '#F59E0B',   // in-progress, pending
  sky:          '#38BDF8',   // informational, link

  // ── Utility ──────────────────────────────────────────────────
  white:        '#FFFFFF',
  black:        '#000000',
  transparent:  'transparent',
};
```

### 2C. Hex Quick Reference

| Role | Hex | Usage |
|---|---|---|
| Background | `#050805` | Every screen root |
| Card L1 | `#101410` | Standard cards, list items |
| Card L2 | `#161A16` | Hovered / elevated cards |
| Card L3 | `#1E231E` | Modals, bottom sheets |
| Sovereign Green | `#0C9E54` | CTAs, selected borders, icons, progress |
| Green Hover | `#0A8749` | Pressed CTA state |
| Green Glow 10% | `rgba(12,158,84,0.10)` | Selection tint, badge bg |
| Green Glow 20% | `rgba(12,158,84,0.20)` | Focus rings, stronger badges |
| Text Primary | `#FFFFFF` | All headlines, values |
| Text Secondary | `#A0A0A0` | Body, description text |
| Text Muted | `#525252` | Placeholders, disabled |
| Border | `rgba(255,255,255,0.07)` | Card borders, dividers |
| Border Selected | `#0C9E54` | Active selection |
| Destructive | `#FB5B5B` | Errors only |
| Amber | `#F59E0B` | In-progress states |
| Sky | `#38BDF8` | Informational only |

---

## 3. Typography

### Scale

```javascript
export const TYPE = {
  // Display
  hero:    { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: COLORS.textPrimary },
  display: { fontSize: 32, fontWeight: '900', letterSpacing: -1.0, color: COLORS.textPrimary },

  // Headings
  h1:      { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.textPrimary },
  h2:      { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: COLORS.textPrimary },
  h3:      { fontSize: 18, fontWeight: '700', letterSpacing: -0.2, color: COLORS.textPrimary },

  // Body
  body:    { fontSize: 15, fontWeight: '400', lineHeight: 22, color: COLORS.textSecondary },
  bodyMd:  { fontSize: 14, fontWeight: '500', lineHeight: 20, color: COLORS.textSecondary },
  bodyBold:{ fontSize: 15, fontWeight: '700', lineHeight: 22, color: COLORS.textPrimary },

  // Supporting
  caption: { fontSize: 12, fontWeight: '500', letterSpacing: 0.3,  color: COLORS.textMuted },
  label:   { fontSize: 11, fontWeight: '700', letterSpacing: 1.0,  color: COLORS.textMuted },
  code:    { fontSize: 12, fontWeight: '500', letterSpacing: 0.5,  color: COLORS.green, fontFamily: 'monospace' },
};
```

### Rules

- **No external font dependency.** Use system font stack (San Francisco on iOS, Roboto on Android).
- **Weight 900 for hero values only** (`$1,247`, `62%`, mission headlines).
- **Weight 800 for section headers** and primary CTA labels.
- **Letter spacing negative** on all headings (`-0.2` to `-1.5`). Never positive on large text.
- **ALL CAPS + letter-spacing 1.0** for label/badge text only (`STATUS`, `WEEK 1`, `SYS_01`).
- **No italic in UI copy.** Italic only in legal/disclaimer text.
- **No emojis in UI copy.** Use `@expo/vector-icons` (Feather preferred) for all iconography.

---

## 4. Spacing

```javascript
export const SPACE = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
  huge: 48,
};
```

Screen horizontal padding: `SPACE.xl` (20px) on all sides.
Section vertical gap: `SPACE.xxl` (24px) between major sections.
Card internal padding: `SPACE.xl` (20px).

---

## 5. Border Radius

```javascript
export const RADIUS = {
  xs:   4,   // tags, tiny badges
  sm:   8,   // input fields, small chips
  md:   10,  // buttons (not pill), icon containers
  lg:   14,  // cards in lists
  card: 16,  // standard card (down from 20-35 — tighter, more precise)
  xl:   20,  // large hero cards
  pill: 999, // pill buttons only
};
```

**Rule:** `border-radius > 16` is reserved for pill buttons and hero cards only. Standard cards use `RADIUS.card = 16`. Option cards use `RADIUS.md = 10`. This is the primary visual change from the bubbly mint era (old: 22–35px everywhere).

---

## 6. Shadows

On dark surfaces, shadows use green glow — not navy. Shadow opacity stays low (0.08–0.12).

```javascript
export const SHADOW = {
  card: {
    shadowColor:   '#0C9E54',
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     4,
  },
  elevated: {
    shadowColor:   '#0C9E54',
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius:  20,
    elevation:     8,
  },
  glow: {
    shadowColor:   '#0C9E54',
    shadowOffset:  { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius:  16,
    elevation:     10,
  },
};
```

---

## 7. Component Inventory

### 7A. Global Components (`components/`)

| Component | File | Current State | Migration Action |
|---|---|---|---|
| `Card` | `components/ui.js` | White bg, navy border | Replace bg → `surface`, border → `border` token |
| `Btn` | `components/ui.js` | Green pill, navy secondary | Keep green; secondary bg → `surface`, text → `textPrimary` |
| `OptionCard` | `components/ui.js` | White / green selected | Card bg → `surface`; selected bg → `greenGlowMd` + `borderSel` |
| `GlobalCard` | `components/GlobalCard.js` | Likely white bg | Replace bg → `surface` |
| `VictoryCard` | `components/VictoryCard.js` | Emoji icons, mint/navy | Replace emoji `icon` prop with Feather name; update color refs |
| `DailyPulseCard` | `components/DailyPulseCard.js` | Emoji in PULSE_TYPES, mint bg | Remove emoji; replace `MINT_BG` with `surface`; replace `NAVY` with `textPrimary` |
| `WealthProgressCard` | `components/WealthProgressCard.js` | Unknown state | Audit and migrate to sovereign tokens |
| `AgentActivityLog` | `components/AgentActivityLog.js` | Uses AGENT_MESSAGES (has emoji) | Replace emoji icons with Feather name strings |
| `ConciergeButton` | `components/ConciergeButton.js` | Likely sovereign (new file) | Verify; keep if already on `#0C9E54` |
| `SpecStackCard` | `components/SpecStackCard.js` | Unknown state | Audit and migrate |
| `NutritionEstimateCard` | `components/NutritionEstimateCard.js` | Unknown state | Audit and migrate |
| `DataSyncingBanner` | `components/DataSyncingBanner.js` | Unknown state | Audit and migrate |
| `LoadingEngine` | `components/LoadingEngine.js` | Unknown state | Audit — uses AGENT_MESSAGES |
| `WeeklyIntelligenceModal` | `components/WeeklyIntelligenceModal.js` | Unknown state | Audit and migrate |

### 7B. Screen-Level Design State

**Sovereign — complete. Use as reference:**
- `screens/OnboardingConciergeScreen.js` — canonical sovereign implementation
- `screens/LogicScanScreen.js` — canonical sovereign implementation

**Transitional — partially migrated:**
- `screens/HomeScreen.js` — `primaryGreen: '#0C9E54'` + `darkSection: '#04361D'` live, but `bgLight: '#F8FAFC'` and `mintPop: '#C5FFBC'` remain

**Mint/Legacy — full migration required (40+ screens):**

| Category | Screens |
|---|---|
| Auth | `AuthScreen`, `SignInScreen`, `VerifyScreen`, `MFASetupScreen`, `MFAVerifyScreen` |
| Onboarding | `OnboardingScreen`, `WaitlistScreen`, `TrialGateScreen`, `SnippdProScreen` |
| Profile | `ProfileScreen`, `EditProfileScreen`, `FamilySharingScreen`, `InviteFriendsScreen` |
| Budget | `BudgetPreferencesScreen`, `BudgetDashboardScreen` |
| Planning | `WeeklyPlanScreen`, `WeeklyPlanPersonalizationScreen`, `ShoppingPlanScreen` |
| Shopping | `ListScreen`, `MyListScreen`, `CartScreen`, `CartOptionsScreen`, `CartOptionDetailScreen`, `CheckoutBreakdownScreen`, `CouponClippingScreen`, `ClipSessionScreen` |
| Wealth | `WealthMomentumScreen`, `WinsScreen`, `ReceiptUploadScreen`, `ReceiptVerifiedScreen` |
| Discover | `DiscoverScreen`, `StackDetailScreen`, `RecipeDetailScreen` |
| Health | `NutritionProfileScreen`, `KitchenScreen`, `PantryScreen` |
| Admin | `AdminGraphScreen`, `AdminPulseScreen`, `AdminAnalyticsDashboardScreen`, `AdminCircularUploadScreen`, `FounderDashboardScreen` |
| Utility | `HelpScreen`, `PrivacyPolicyScreen`, `TermsOfUseScreen`, `TransparencyDataScreen`, `TripResultsScreen`, `StudioScreen` |

---

## 8. Icon System

**Library:** `@expo/vector-icons` — Feather set (primary), MaterialCommunityIcons (supplemental).

**No emojis in UI.** Every location currently using an emoji icon must be replaced:

| Emoji | Replace With (Feather) |
|---|---|
| 📦 stock_check | `package` |
| 👕 size_alert | `tag` |
| 🎯 goal_update | `target` |
| ⚡ deal_flash | `zap` |
| 🔍 scan | `search` |
| 📊 categorize | `bar-chart-2` |
| ✂️ coupon | `scissors` |
| 🔔 alert | `bell` |
| 💰 savings | `dollar-sign` |
| 🛒 cart | `shopping-cart` |
| ✅ success | `check-circle` |
| 🔥 trending | `trending-up` |

---

## 9. Motion

```javascript
export const DURATION = {
  fast:   150,  // micro-interactions, icon swap
  normal: 250,  // card entrance, tab transition
  slow:   400,  // full screen transition, progress bar fill
  scan:   5000, // loading/scan sequence (LogicScanScreen)
};
```

- **Entrance:** fade + translateY(12→0), `DURATION.normal`
- **Progress bars:** Animated.timing, `DURATION.slow`, delay 100ms
- **No bounce animations.** `useNativeDriver: true` where possible.

---

## 10. Screen Structure Template

Every screen follows this structure:

```jsx
<SafeAreaView style={{ flex: 1, backgroundColor: '#050805' }}>
  <StatusBar barStyle="light-content" backgroundColor="#050805" />
  <ScrollView
    contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    showsVerticalScrollIndicator={false}
  >
    {/* Section label */}
    <Text style={TYPE.label}>SECTION NAME</Text>

    {/* Hero value */}
    <Text style={TYPE.hero}>$1,247</Text>

    {/* Body */}
    <Text style={TYPE.body}>Description text here.</Text>

    {/* Card */}
    <View style={{
      backgroundColor: '#101410',
      borderRadius: 16,
      padding: 20,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.07)',
    }}>
      {/* card content */}
    </View>

    {/* CTA */}
    <TouchableOpacity style={{
      backgroundColor: '#0C9E54',
      borderRadius: 10,
      height: 54,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Text style={{ color: '#FFFFFF', fontWeight: '800', fontSize: 15 }}>
        ACTION LABEL
      </Text>
    </TouchableOpacity>
  </ScrollView>
</SafeAreaView>
```

---

## 11. Deprecated — Do Not Use

These values exist in legacy files. Do not copy them into any new or migrated screen.

| Deprecated Value | Was Used For | Sovereign Replacement |
|---|---|---|
| `#EAF9E7` (mint canvas) | Screen background | `#050805` |
| `#D4EDCE` (mint border) | Card border | `rgba(255,255,255,0.07)` |
| `#172250` (navy text) | Headlines | `#FFFFFF` |
| `#C5FFBC` (mint accent) | Highlights | `#0C9E54` |
| `#E8F5E9` / `#F0FBF0` (light mint) | Screen canvas | `#050805` |
| `#FF7043` (coral accent) | Accent CTA | Removed. Coral retained only for `destructive`. |
| `#2E7D32` (dark green CTA) | Buttons | `#0C9E54` |
| `#F8F9FA` / `#F8FAFC` (light bg) | Light mode bg | `#050805` |
| `cardRadius: 35` / `pillRadius: 50` | Cards | `RADIUS.card = 16` |
| Any emoji in UI copy | Icons | `@expo/vector-icons` Feather |
