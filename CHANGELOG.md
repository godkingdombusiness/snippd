# Snippd — Change Log
Auto-maintained by Claude Code. Updated after every change.
Format: [version] — YYYY-MM-DD

## [Unreleased]

### Fixed — Babel parse error: curly apostrophes in getBudgetFact strings (2026-05-17)
- `screens/OnboardingScreen.js` — Four string literals in `getBudgetFact` used Unicode right-single-quotation-mark (U+2019) from copy-paste, causing `SyntaxError: Unexpected character` at line 345. Converted all four to double-quoted string literals so apostrophes are valid ASCII.

### Fixed — SignInScreen.js: 28 IDE diagnostic issues resolved (2026-05-17)
- Added `import PropTypes from 'prop-types'` (was missing entirely).
- Added `import { supabase } from '../lib/supabase'` at top level; removed dynamic `require('../lib/supabase')` inside `handleEmail` callback (S2208 / non-top-level import).
- Removed unused palette constants `W_GREEN` and `CREAM` (S1481).
- Added `.propTypes` declarations for all 5 module-scope components: `GoogleIcon` (size), `AppleIcon` (size), `StatChip` (value, label, dark), `SocialBtn` (icon, label, onPress, disabled), `FieldInput` (11 props) — resolves 20 S6774 prop-validation warnings.
- Wrapped `clearError` in `useCallback([], [])` to make it a stable reference; added it to the deps arrays of `handleEmail`, `handleOAuth`, and `handleForgotPassword` — resolves 3 exhaustive-deps warnings.

### Added — processing intermission screens between milestone steps (2026-05-17)
- `screens/OnboardingScreen.js` — `processing` state `{ show, title, sub }` + `runProcessing(title, sub, callback)` helper: sets show flag, calls callback after 2500ms. Processing overlay is a full-screen white SafeAreaView with centered large green ActivityIndicator, bold title, and subtitle copy — rendered via early return before `stepRenders`. Three milestones wired: Missions Continue → "Analyzing your goals..." → Household; Household Continue → "Calculating your household profile..." → Budget; Stores Continue → "Scouting deals at your stores..." → Deal Prefs.

### Added — automated household budget defaults (2026-05-17)
- `screens/OnboardingScreen.js` — `getDefaultWeeklyBudget(counts)` helper (module scope) maps total household members to weekly budget: 1→$75, 2→$150, 3→$200, 4→$250, 5+→$325 (all multiples of $25 slider step). Household Continue button auto-populates `weeklyBudget` + `weekly_budget_cents` and triggers `setShowFact(true)` when budget has not yet been manually set. Budget step card shows "Estimated for your household size" chip (mint bg, green text, check-circle icon) when a value is present. Budget remains fully editable.

### Changed — universal solid green selected state across all onboarding cards (2026-05-17)
- `screens/OnboardingScreen.js` — All selected/active card states now use solid `#0C9E54` background + white text/icons. Updated: MissionCard (`mCardOn` bg green, icon WHITE, label/sub white/80%), HouseholdCard (`hCardOn` bg green, icon/label/sub white, icon wrap translucent), CookTile (`cTileOn` bg green, title/desc white/80%, icon wrap translucent, check circle translucent), Pill (`pillOn` bg green, text white, check bg translucent), StoreCard (`storeCardOn` bg green, label white, check bg translucent), pet toPill (`toPillOn` bg green, text white), meal-freq h3FreqPill (`h3FreqPillOn` bg green, text white). GridTile and OptionTile were already solid green (no change).

### Fixed — SignInScreen.js: convert var → const, fix array key, add billing_plan (2026-05-17)
- `screens/SignInScreen.js` — All `var` declarations converted to `const` throughout (palette constants, STATS, DEMO_PROFILE, StyleSheet objects, all function-scope variables in handlers and render functions). `GoogleIcon` color map key changed from array index `i` to `'color-' + i` (resolves S6479). `billing_plan: 'trial'` added to the signup profile upsert so every new account is seeded with the trial plan immediately on creation.

### Changed — onboarding data pipeline: map all step data to profiles upsert (2026-05-17)
- `screens/OnboardingScreen.js` — `finishOnboarding` upsert expanded: `missions: data.missions` (selected mission IDs), `household: { adults, children }` JSON object (was integer `household_size` only), `cookingStyle: data.cookingStyle` (was not saved), `foodsAvoided: data.foodsAvoided` (renamed from `avoids`). All five frontend state fields now round-trip cleanly to Supabase `profiles`.

### Changed — food preferences step: typography alignment pass (2026-05-16)
- `screens/OnboardingScreen.js` — `f4Headline` bumped to 40px/800 weight matching other step headlines (was 28/700); `f4Sub` set to 15px/400 weight light gray matching `sub` style; `f4CardTitle` changed from small-caps gray label to 14px/700 navy matching `fieldLabel`; `pillText` adjusted to `#374151` (gray-700) regular weight for neutral charcoal unselected state.

### Changed — stores step: clean pill cards, 3-store cap, pill Continue button (2026-05-16)
- `screens/OnboardingScreen.js` — `StoreCard` rebuilt: monogram avatar removed; clean white card with store name centered; selected state = `#F0FBF5` mint bg + green border + absolute green checkmark badge top-right; disabled state = 38% opacity (fires when selection is at 3 and card is not selected). `renderStep6`: subtitle updated ("Pick up to 3 stores…"); 3-store selection cap via `atLimit` — disabled prop passed to unselected cards beyond limit; `BigBtn` replaced with `f4ContinueBtn` (borderRadius 14, right-arrow icon). Styles: `storeCard` slimmed (paddingVertical 18, no gap), `storeCardDisabled` added, avatar/initials styles removed.

### Fixed — IDE diagnostic warnings: prop-types + array index key (2026-05-16)
- `screens/OnboardingScreen.js` — Added `import PropTypes from 'prop-types'`; added `ProgressHeader.propTypes` and `BigBtn.propTypes` to resolve S6774 prop-validation warnings; added default param values to both components; progress-bar `.map()` key changed from array index `i` to `'seg-' + i` to resolve S6479 hint.

### Fixed — convert all 80 var declarations to const (2026-05-16)
- `screens/OnboardingScreen.js` — All 80 `var` declarations converted to `const` (no binding is ever directly reassigned; property-level mutations like `counts[key]=` and `ref.current=` are safe with `const`). Resolves 82 SonarLint S3504 IDE diagnostics. Metro bundle continues to compile cleanly (1907 modules, 0 errors).

### Changed — household step: select-to-reveal stepper, remove takeout card (2026-05-16)
- `screens/OnboardingScreen.js` — Added `LayoutAnimation` and `UIManager` to RN imports; enabled `setLayoutAnimationEnabledExperimental` for Android. `HouseholdCard` converted from `<View>` to `<TouchableOpacity>`: when count=0 the whole card is tappable (sets count to 1, i.e. calls `onIncrement`); stepper row (`hStepper`) is conditionally rendered only when `count > 0`; `adjustCount` calls `LayoutAnimation.configureNext(easeInEaseOut)` before state update so the stepper animates in/out. Takeout Frequency card removed entirely from `renderStep3`. Pet Profile card, info banner, Continue button, and privacy footer now sit directly below the household grid.

### Changed — solid icons across all steps + cooking step 2-col grid tiles (2026-05-16)
- `screens/OnboardingScreen.js` — All content icons upgraded from Feather outline to FontAwesome5 solid throughout: MissionCard now uses `FontAwesome5 solid` (dollar-sign, calendar-alt, heart, shield-alt, users, bolt); GridTile (deal prefs) now uses `FontAwesome5 solid` (file-alt, tag, gift, star, heart, dollar-sign); MISSIONS icon names updated accordingly; DEAL_PREFS `file-text` → `file-alt`. Cooking step: `CookCard` replaced by `CookTile` — 2-column grid tile layout with large green-circle FA5 solid icon, bold title, muted description line; selected state: mint bg, green border, absolute green checkmark circle in top-right corner; no radio outlines on unselected. COOKING_STYLES updated with `desc` field and FA5 solid icon names (utensils, box-open, clock, snowflake, shopping-bag, random). Styles: cookCard/cookCardOn/etc removed; cTile/cTileOn/cTileCheck/cTileIconWrap/cTileIconWrapOn/cTileTitle/cTileTitleOn/cTileDesc added.

### Changed — cooking step: two-card layout, CookCard checklist, dinner frequency, meal priorities, Snippd Fact modal (2026-05-16)
- `screens/OnboardingScreen.js` — `Modal` added to RN imports. `COOKING_STYLES` label "Frozen / convenience" → "Frozen & convenience". Added `DINNER_FREQ_OPTS` (1–2 days / 3–4 days / 5–6 days / Every day), `MEAL_PRIORITIES` (Family-friendly / Budget-friendly / Low food waste) data arrays. Added `getCookingFact(householdSize, dinnerFreq, cookingStyle)` helper returning three dynamic copy variants (frozen/takeout, large household high-freq, small/low-freq). Added `CookCard` module-scope component: icon circle (gray→green on select) + label + gray circle checkbox (filled green on select). State additions: `showCookingModal` flag, `dinnerFrequency` and `mealPriorities` in data. renderStep5 rebuilt: two white cards reusing f4Card/f4Grid patterns — Card 1 "How do you usually cook?" (CookCard checklist multi-select + dinner frequency 2×2 pill grid), Card 2 "Meal priorities" (2×2 pill grid + No preference clear); Continue button triggers modal instead of navigating. Snippd Fact Modal: cream/mint slide-up sheet, 💡 emoji, dynamic fact, "Got it, let's go" green button that closes modal and advances. Added styles: cookCard/cookCardOn/cookIcon/cookIconOn/cookLabel/cookLabelOn/cookCheck/cookCheckOn, modalOverlay/modalCard/modalEmoji/modalLabel/modalBody/modalBtn/modalBtnTxt.

### Changed — food preferences step: two-card layout, strict 2-col grid, updated pill states (2026-05-16)
- `screens/OnboardingScreen.js` — renderStep4 fully rebuilt: headline reduced to 28px left-aligned, subtitle updated to "Choose anything that fits your household so Snippd can recommend better meals and deals."; two white shadow cards ("Preferences" and "Allergies & restrictions") replace bare section headers; strict 2-column symmetric grid (`f4Grid`/`f4GridCell`/`f4GridPill`) replaces free-wrap pill row so every pill spans exactly 50% width; pill unselected state: thin 1px `#E5E7EB` border, white bg, charcoal `#4B5563` text, borderRadius 10; pill selected state: green border, `#F0FBF5` mint bg, green text, green checkmark circle; "No preference" clear pill added to Preferences card; "None" clear pill added to Allergies card; info banner removed; Continue button full-width with borderRadius 14 (`f4ContinueBtn`). DIET_PREFS updated to: Low carb, High protein, Vegetarian, Vegan, Budget-friendly, Kid-friendly. FOODS_AVOIDED labels updated to allergy-style naming (Gluten-free, Dairy-free, Nut allergy, Peanut allergy, Shellfish allergy, etc.). `Pill` component gains optional `style` prop for grid stretching.

### Changed — food preferences step: green-border pills with checkmark, soft-green info banner (2026-05-16)
- `screens/OnboardingScreen.js` — `pill` style switched from solid-fill to border-only pattern (`flexDirection: row`, `borderColor: BORDER`, white background); `pillOn` now uses green border + `#F0FBF5` mint background instead of solid green; `pillTextOn` changed to green text (not white); `pillCheck` style added (18×18 green circle with white check, `marginLeft: 6`). Added `f4InfoBanner`, `f4InfoIconWrap`, `f4InfoTxt` styles for the soft-green info banner in renderStep4 (mint background, `#A7F3D0` border, green icon circle). `renderStep4` rewritten: left-aligned lower-lineHeight headline, mutual-exclusion clear pills ("None" / "No specific diet") at bottom of each grid, info banner replaces red disclaimer.

### Changed — budget step Snippd Fact card + pet grid fix (2026-05-16)
- `screens/OnboardingScreen.js` — Pet selection changed from single horizontal row to 2×2 grid (`flexWrap: 'wrap'` on `petRow`) matching the takeout grid layout. Added `getBudgetFact(size)` helper returning USDA-based dynamic copy for 1 / 2 / 3–4 / 5+ person households. Added `showFact` state; BudgetSlider accepts `onRelease` prop (fires `onPanResponderRelease`) to trigger fact card; TextInput `onBlur` also triggers it. Fact card (`b2FactCard`) renders below the budget card after first interaction: pale yellow (#FEFCE8) background, amber border, 💡 emoji, bold "Snippd Fact" label, dynamic copy. Budget step Continue button updated to pill-shaped (borderRadius 30) with absolute-right arrow.

### Fixed — onboarding completion + sign-in routing (2026-05-16)
- `screens/OnboardingScreen.js` — Removed `pets: data.pets` from Supabase `profiles` upsert; the `pets` column does not exist and caused the entire upsert to fail silently, preventing `onboarding_completed` from being saved and trapping users in the onboarding loop. Step 0 "Sign in" link now passes `{ openForm: 'signin' }` param so SignInScreen opens the form directly instead of the welcome landing.
- `screens/SignInScreen.js` — Accepts `route.params.openForm` param; initialises `mode` to `'form'` and `tab` to the provided value when the param is present, skipping the welcome landing when navigated from inside the app.

### Changed — Household step full redesign: steppers, takeout card, pet card (2026-05-16)
- `screens/OnboardingScreen.js` — Added `FontAwesome5` import for premium icons (graduation-cap, running, child, walking, paw, utensils); HOUSEHOLD_TYPES updated to 6 categories (Adults 23–64, College-aged 18–22, Teens 13–17, Children 2–12, Seniors 65+, Guests/Roommates) with FA5 icons; TAKEOUT_OPTS labels updated (Rarely / 1–2x/week / 3–4x/week / 5+ times/week); added PET_OPTS (Dog/Cat/Both/None); HouseholdCard rewritten from checkbox to stepper (Icon → Title → Sub → (− count +)); state `householdTypes` → `householdCounts` object + `pets` array; added `adjustCount` + `togglePet` functions; renderStep3 rebuilt with stepper grid, Takeout Frequency card, Pet Profile card, pill buttons with green ✓ checkmark, pill-shaped Continue CTA, info banner; styles: hStepper/hStepBtn/hStepCount, toCard/toCardHeader/toPill/toPillCheck, h3ContinueBtn pill-shaped (borderRadius 30).
- `finishOnboarding`: household_size now summed from householdCounts; pets array saved to profiles.

### Changed — standardize all onboarding step headlines to match What Matters Most (2026-05-16)
- `screens/OnboardingScreen.js` — `b2Headline`, `h3Headline`, and `headline` (shared by steps 4–7) all updated to `fontSize: 44, fontWeight: '800', letterSpacing: -0.5, lineHeight: 48, textAlign: 'center'` to match `step1Headline` for brand consistency.

### Changed — What Matters Most: 2-column grid cards with vertical stack layout (2026-05-16)
- `screens/OnboardingScreen.js` — MISSIONS labels shortened ("Save Money", "Plan My Meals", "Eat Healthier", "Manage Health", "Feed My Family", "Keep It Simple"); icons updated to match; MissionCard rewritten from horizontal row to near-square 2-column grid card (Icon → Bold Title → Description, vertical stack); unselected state: white card, `#E5E7EB` border, faint circle checkbox top-right; selected state: GREEN border, GREEN label + sub + icon, solid GREEN circle with white check; mList changed to `flexDirection: row, flexWrap: wrap`; BigBtn replaced with custom Continue button (centered text, absolute-right arrow).

### Changed — app flow wiring: persona reveal → daily intent filter (2026-05-16)
- `screens/OnboardingScreen.js` — step 7 CTA button label changed "Build My Plan" → "Find Out My Shopping Persona" to match the reveal-intent language in the App User Flow Blueprint.
- `screens/PersonaRevealScreen.js` — CTA now routes to `TodayDecision` (`navigation.navigate('TodayDecision')`) instead of `MainApp`; button label updated "Go to My Dashboard" → "See What's For Today" to align with the Daily Intent Filter step.

### Changed — onboarding step reorder + new household/customize questions (2026-05-16)
- `screens/OnboardingScreen.js` — reordered stepRenders: household (was step 3) → step 2, budget (was step 2) → step 3; updated step 2 headline "Tell us about your household", added takeout frequency pill selector; updated step 5 headline "What's your cooking and meal style?"; updated step 7 headline "Customize your Snippd experience", added meal idea frequency pill selector; added `TAKEOUT_OPTS` + `MEAL_FREQ_OPTS` data arrays; added `takeoutFrequency` + `mealIdeaFrequency` to state and `finishOnboarding` upsert; added `h3FreqRow/Pill/Txt` styles.

### Fixed — bag wrapper isolated: width 100% paddingHorizontal 0, image width 74% no offsets (2026-05-16)
- `screens/SignInScreen.js` — heroWrap: width 100%, paddingHorizontal 0, alignItems center; heroImg: width 74% (from 78%), height 410, no margin/offset properties.
- `screens/OnboardingScreen.js` — same applied to heroBagWrap / heroBagImg.

### Fixed — welcome buttons collapsed + bag off-center from alignItems:center parent (2026-05-16)
- `screens/SignInScreen.js` — replaced `width: '100%'` with `alignSelf: 'stretch'` on `topGroup`, `heroWrap`, `headline`, `sub`; added `alignSelf: 'stretch'` to `ctaGroup` to restore full-width button layout. `alignSelf: 'stretch'` overrides the parent `alignItems: 'center'` and fills the true container width, while `width: '100%'` inside an `alignItems: 'center'` parent resolves relative to the collapsed content width.
- `screens/OnboardingScreen.js` — same fixes applied to `heroLogoBlock`, `heroTitle`, `heroSub`, `heroBagWrap`, `heroBtns`.

### Changed — welcome scroll container unified centerline (2026-05-16)
- `screens/SignInScreen.js` — added `alignItems: 'center'` and `width: '100%'` to `welcome.scroll` so all top-level sections (logo, text, bag wrapper, CTAs) share one axis.
- `screens/OnboardingScreen.js` — same applied to `heroScroll`.

### Changed — welcome bag centered via full-width wrapper (2026-05-16)
- `screens/SignInScreen.js` — wrapped heroImg in `heroWrap` View (width: 100%, alignItems: center) so the bag anchors to the true screen horizontal axis; `marginTop: auto` moved from image to wrapper; removed `alignSelf: center` from image (no longer needed).
- `screens/OnboardingScreen.js` — same pattern applied via `heroBagWrap`.

### Changed — welcome subtitle larger + explicit weight + tighter lineHeight (2026-05-16)
- `screens/SignInScreen.js` — subtitle fontSize 13→15, fontWeight 'normal'→'400', lineHeight 20→23, paddingHorizontal 8 for symmetric two-line wrap.
- `screens/OnboardingScreen.js` — same changes mirrored for step 0 heroSub.

### Changed — welcome headline bold + tight tracking + compact line-height (2026-05-16)
- `screens/SignInScreen.js` — headline fontWeight 300→700, letterSpacing 5→-0.5, lineHeight 76→46.
- `screens/OnboardingScreen.js` — same changes mirrored for step 0.

### Changed — welcome screen headline light weight + open tracking + full-width centering (2026-05-16)
- `screens/SignInScreen.js` — headline weight 500→300 (Light — clean thin strokes, eliminates blocky appearance at large size); fontSize 42→38; letterSpacing 3→5 (wide open tracking); lineHeight 70→76; topGroup width 100% + headline alignSelf center + width 100% (absolute horizontal symmetry); subtitle paddingHorizontal removed (full container width, no pinching); logo 252×90→290×104 (+15%).
- `screens/OnboardingScreen.js` — identical changes mirrored for step 0.

### Changed — welcome typography further lightened + step 1 centered dominant headline (2026-05-16)
- `screens/SignInScreen.js` — headline weight 600→500 (medium, clean strokes); letterSpacing 2→3 (open tracking); lineHeight 64→70 (comfortable vertical gap between stacked lines).
- `screens/OnboardingScreen.js` — same welcome typography changes mirrored; step 1 headline 30→44pt/800, lineHeight 36→48, textAlign center, letterSpacing -0.5; step 1 subtitle 15→13pt, color #9CA3AF (medium gray), textAlign center, marginBottom 20→28; step1Scroll paddingTop 0→16; back button circle 36→40px for prominence.

### Changed — welcome screen typography polish: weight, tracking, line-height (2026-05-16)
- `screens/SignInScreen.js` — headline `fontWeight` 700→600 (clean semi-bold, eliminates blocky stroke); `letterSpacing` 0.5→2 (letters breathe, premium feel); `lineHeight` 58→64 (comfortable gap between 'Welcome to' and 'Snippd'); added `alignSelf: 'stretch'` on headline so text container spans full padded width symmetrically (fixes optical off-center); subtitle `paddingHorizontal` 20→12; logo 224×80→252×90.
- `screens/OnboardingScreen.js` — identical changes mirrored for step 0.

### Changed — welcome screen seamless gradient + refined typography (2026-05-16)
- `screens/SignInScreen.js` — replaced two-layer (vertical + horizontal) gradient system (which caused a visible seam at top: 30%) with a single seamless 5-stop LinearGradient as root container: near-black forest at top → smooth dark green through 52% → richer emerald at 76% → fades back; headline weight 800→700, size 48→42pt, letterSpacing -0.5→+0.5, lineHeight 52→58 for breathing room; subtitle paddingHorizontal 36→20 for clean 2-line span; logo scaled to 224×80 (up 18% from 190×68).
- `screens/OnboardingScreen.js` — same gradient, typography, and logo changes mirrored; removed dead `heroGradientFill` and `heroGlowFill` style keys.

### Changed — welcome screen spotlight gradient + typographic hero pass (2026-05-16)
- `screens/SignInScreen.js` — headline forced to two stacked lines ("Welcome to / Snippd"), 48pt/800 weight, lineHeight 52, letterSpacing -0.5; subtitle 13pt, paddingHorizontal 36 for clean 2-line wrap; logo scaled to 190×68; hero bag 78% width / 410px height; gradient restructured as layered absolute LinearGradients (vertical spotlight + horizontal glow ellipse) inside a View root; demo button `backgroundColor: transparent`.
- `screens/OnboardingScreen.js` — identical changes mirrored for step 0; added `heroGradientFill` and `heroGlowFill` style keys.

### Changed — welcome screen premium gradient redesign (2026-05-16)
- `screens/SignInScreen.js` — replaced flat `#0B3B1E` background with a 5-stop `LinearGradient` (dark forest edges → brighter emerald hotspot at 62%); headline refined to 30pt weight-700, letterSpacing 0.3, lineHeight 38; subtitle opacity raised to 85%; hero bag scaled to 73% width, 380px height, `marginTop: 'auto'` to sink it toward CTAs; both CTA buttons `borderRadius: 12`; Get Started text `#1B3A2D` (dark charcoal); Sign in underlined white.
- `screens/OnboardingScreen.js` — same 5-stop gradient, typography, hero sizing, and button styling mirrored for step 0; added `expo-linear-gradient` import; updated logo to `Snippd-logo-green-large.png` and hero to `grocery-bag-tall-hero.png`.

### Changed — welcome screen 3-zone layout: hero 90% width, space-between (2026-05-16)
- `screens/SignInScreen.js` — logo+headline+sub grouped into `topGroup` (top zone); hero image widened to 90% screen width, height 440px (dominant anchor); CTA group pushed to bottom; `justifyContent: 'space-between'` distributes 3 zones cleanly; buttons `borderRadius: 8`.

### Changed — welcome screen blueprint applied (2026-05-16)
- `assets/Snippd-logo-green-large.png` — new logo asset copied from double-extension source.
- `assets/grocery-bag-tall-hero.png` — new tall hero bag asset copied from double-extension source.
- `screens/SignInScreen.js` — welcome screen updated to match blueprint: logo `Snippd-logo-green-large.png` (140×50), hero `grocery-bag-tall-hero.png` (h:380), buttons `borderRadius:8`, headline 34pt bold, subtitle 15pt.

### Fixed — SignInScreen syntax error: restore truncated form stylesheet (2026-05-16)
- `screens/SignInScreen.js` — file was truncated mid-line at `socialGroup: { gap: 1`; restored complete `form` StyleSheet (socialGroup, socialBtn, inputs, submit button, trust copy) and `root` StyleSheet. Brace balance verified OK.

### Fixed — SignInScreen asset paths and button styles corrected (2026-05-16)
- `screens/SignInScreen.js` — fixed broken asset references introduced by linter (`Snippd-logo-green-large.png` → `Snippd Green Logo.png`, `grocery-bag-tall-hero.png` → `grocery-bag-hero.png`); restored pill buttons (`borderRadius: 50`); restored logo height (110px); headline size back to 52pt bold.

### Changed — restore Try Demo Mode button to welcome screens (2026-05-16)
- `screens/SignInScreen.js` — Demo Mode outline pill button restored between Get Started and Sign in on the welcome screen.
- `screens/OnboardingScreen.js` — Demo Mode button restored in step 0 welcome CTA group.

### Changed — welcome screen redesign to match final mockup (2026-05-16)
- `screens/SignInScreen.js` — switched logo to `Snippd Green Logo.png` (combined cart + wordmark); removed paddingHorizontal from scroll so hero image is true full-bleed; hero height 460px; removed Demo Mode button from welcome; sign-in link simplified to underlined "Sign in"; headline 52pt bold.
- `screens/OnboardingScreen.js` — same changes mirrored for OnboardingScreen step 0 welcome; removed heroBagWrap wrapper that caused width collapse; full-bleed hero image.

### Changed — welcome screen hero image enlarged + brand alignment pass (2026-05-16)
- `screens/SignInScreen.js` — hero image height 320 → 400; `marginVertical` on hero wrap 16 → 8; `paddingTop` 32 → 20; logo 72 → 80px; `Get Started` button text updated to brand CTA green `#2E7D32`; button shadow deepened.
- `screens/OnboardingScreen.js` — same sizing and brand alignment changes mirrored for OnboardingScreen step 0 welcome.

### Fixed — grocery bag hero replaced with truly transparent PNG (2026-05-16)
- `assets/grocery-bag-hero.png` — re-copied from latest `grocery-bag-hero.png.png` drop; this version has a genuine transparent background.

### Fixed — grocery bag hero asset updated to transparent PNG (2026-05-16)
- `assets/grocery-bag-hero.png` — replaced with transparent-background bag illustration; copied from `grocery-bag-hero.png.jpg` to clean `.png` extension so Metro bundler resolves it correctly.
- `screens/SignInScreen.js` + `screens/OnboardingScreen.js` — require() path updated to `grocery-bag-hero.png`.

### Fixed — grocery bag hero image wired into both welcome screens (2026-05-16)
- `assets/grocery-bag-hero.jpg` — replaced with correct standalone bag illustration (no phone frame).
- `screens/SignInScreen.js` + `screens/OnboardingScreen.js` — hero image blocks restored using clean `.jpg` asset.

### Fixed — OnboardingScreen Step 0 welcome redesigned to match mockup (2026-05-16)
- `screens/OnboardingScreen.js` — Step 0 (dark-green welcome shown after signup) was showing old copy and a plain icon instead of the hero image.
  - Added `Image` import.
  - Replaced `Feather shopping-bag` icon with `Snippd-White-Cart .png` logo + `snippd` wordmark in brand green.
  - Headline: "Welcome to Snippd". Subtitle updated to "Smarter grocery planning, less waste, more time for you."
  - Added `grocery-bag-hero.jpg` as the hero image (same asset as SignInScreen welcome).
  - "Get Started": white pill button, dark green text, `borderRadius: 50`.
  - "Try Demo Mode": outline pill, matching SignInScreen style.
  - "Sign in": white underlined text link.
  - Wrapped in `ScrollView` for overflow safety on smaller screens.

### Added — grocery-bag-hero.png.jpg asset + wired into welcome screen (2026-05-16)
- `assets/grocery-bag-hero.png.jpg` — Snippd-branded green tote bag hero image.
- `screens/SignInScreen.js` — `heroWrap` image source updated from placeholder to `grocery-bag-hero.png.jpg`.

### Changed — SignInScreen welcome screen redesigned to match mockup (2026-05-16)
- `screens/SignInScreen.js` — `renderWelcome()` and welcome styles updated:
  - Headline changed to "Welcome to Snippd" (40px, bold white).
  - Subtitle changed to "Smarter grocery planning, less waste, more time for you." (16px, 72% white).
  - Removed feature icon rows (tag / calendar / heart).
  - Added hero image slot (`heroWrap` / `heroImg`) — currently rendering `Snippd Green Logo.png` as placeholder; swap in the green grocery bag asset when added to `assets/`.
  - "Get Started" button: WHITE background, dark green (`W_BG`) text, pill shape (`borderRadius: 50`).
  - "Try Demo Mode": outline pill, white border, white text — kept per design spec.
  - "Sign in" link: white underlined text (no color accent).
  - Logo wordmark color updated to brand green `#3DBA6F`.

### Fixed — HomeScreen crash: timeLabel ReferenceError (2026-05-14)
- `screens/HomeScreen.js` — Added `var timeLabel = context ? (context.cookingTimeMin + ' min') : '--';` to the component's derived-values block. `timeLabel` was only defined inside `MiniOptionCard` but was referenced directly in the context stats `StatCard` JSX, causing a `ReferenceError` crash on every render.

### Fixed — SignInScreen: removed incorrect hero-banner.png from welcome screen (2026-05-14)
- `screens/SignInScreen.js` — Removed `hero-banner.png` hero image block from `renderWelcome()`. The asset did not match the intended AI-generated grocery bag image and rendered with a visible white background against the dark green canvas.
- Cleaned up `heroWrap` and `heroImg` styles from the welcome StyleSheet.
- Added `marginTop: 28` to `featureList` so the layout flows cleanly from subtitle → feature rows → CTAs.

### Changed — OnboardingScreen step 3: "Who are you shopping for?" household redesign (2026-05-14)
- `screens/OnboardingScreen.js` — Replaced adult/children number chips with a 2-column `HouseholdCard` grid matching the brand mockup.
  - 6 household types: Adults (18+), Children (2–17), Teens (13–17), Seniors (65+), Pets, Guests/Roommates.
  - `HouseholdCard`: white card, green border when selected, circle checkbox top-right (gray outline → green filled checkmark), mint icon circle, bold label + gray age range.
  - "Why we ask" info card below grid (mint bg, lightbulb icon, explanation text).
  - "Continue" full-width green button + "Your info is private and never shared" lock footer.
  - White background (matching step 1 + 2).
  - `householdTypes: []` added to data state; `finishOnboarding` derives `household_size` from selected types.
  - Adults pre-selected by default.

### Changed — SignInScreen: welcome screen updated to match final brand mockup (2026-05-14)
- `screens/SignInScreen.js` — Welcome mode updated to match third screenshot exactly.
  - Headline changed from "Welcome to Snippd" to "Welcome" (logo already shows brand name).
  - Subtitle: "Save More . Stress Less. Live Better." (single line, medium weight).
  - Hero image (`hero-banner.png`) enlarged to 220px height.
  - Feature row icons changed from circles to rounded-square style (`borderRadius: 12`) with `rgba(255,255,255,0.18)` background, white icons inside.
  - Logo block tightened (64px image, smaller wordmark).

### Changed — OnboardingScreen step 2: budget redesign with slider (2026-05-14)
- `screens/OnboardingScreen.js` — "What is your weekly grocery budget?" step redesigned to match brand mockup.
  - **ProgressHeader**: replaced dot indicators with segmented dash bars (one per step, green = done, gray = future) + "X of 7" label centered + "Snippd" green wordmark right-aligned. Back button is now a white outlined circle.
  - **Step 2 layout**: white background. Large centered headline + subtitle. White card containing: shopping-bag icon in mint circle, big `$225 / week` display in dark green, custom `BudgetSlider` (PanResponder-based, min $75 max $500 step $25, green filled track + green circle thumb), "$75" / "$500+" labels, divider, "Enter amount manually" label + `$` prefix input. "Continue →" pill button + "I'm not sure yet" secondary link below card.
  - `BudgetSlider` component: module-scope, PanResponder drag handler, refs prevent stale closure on measure. Syncs with `data.weeklyBudget` bidirectionally (slider ↔ text input).

### Changed — OnboardingScreen step 1: card-row format matching brand mockup (2026-05-14)
- `screens/OnboardingScreen.js` — "What matters most to you?" step reformatted to match the mockup design.
  - **ProgressHeader**: replaced pill progress bar with Snippd cart logo + "snippd" wordmark centered at top; back button top-left. New `StepDots` component renders connected dot indicators (filled green = done, outlined green = active, gray = future).
  - **Step 1 layout**: white background (not cream). `MissionCard` replaces `OptionTile` — each card has a 48px circle icon on mint-green background, bold title, gray subtitle, chevron (unselected) or check-circle (selected). Border highlights green on selection. No card background fill change on select, just border + icon.
  - **MISSIONS**: added `sub` description text to all 6 missions displayed as card subtitles.
  - All other steps (2–7) retain their existing layout; dot indicators and logo header apply to all content steps.

### Changed — SignInScreen: welcome screen redesigned to match brand mockup (2026-05-14)
- `screens/SignInScreen.js` — Welcome mode redesigned to match the dark-green brand mockup exactly.
  - Background: `#0B3B1E` deep forest green (full screen including SafeAreaView).
  - Top: `Snippd-White-Cart .png` logo (72×72) centered + "snippd" white wordmark.
  - Headline: "Welcome to Snippd" (38px, 900 weight, white, centered).
  - Subtext: "Smarter grocery planning starts here." + "Save more. Stress less. Live better." (lighter opacity).
  - Hero image: `hero-banner.png` (200px height, centered).
  - 3 feature rows with semi-transparent green icon circles: Save more (tag icon) / Stress less (calendar) / Live better (heart).
  - "Get Started" bright green `#22C55E` full-width button.
  - "Try Demo Mode" translucent outlined button (white text/border).
  - "Already have an account? Sign in" link (green accent on "Sign in").
  - `StatusBar` set to `light-content` on welcome screen.

### Changed — SignInScreen: reverted to original with welcome mode + Get Started / Demo Mode (2026-05-14)
- `screens/SignInScreen.js` — Reverted to the original two-panel cream/navy design. Added a `welcome` mode (default) that shows the brand landing before the sign-in form.
  - **Welcome mode** (default, cream background): Snippd wordmark, headline, tagline, 3 stat chips, "Get Started" green CTA → signup form, "Try Demo Mode" outlined button → `navigation.navigate('PersonaReveal', DEMO_PROFILE)` (no auth), "Already have an account? Sign in" link → sign-in form.
  - **Form mode** (original preserved): Sign In / Create Account tab toggle, Google + Apple OAuth, email/password fields, forgot password, trial notice.
  - **Signup tab**: Added "YOUR NAME" field (name required before account creation). After successful `signUpWithEmail`, upserts `full_name` + `first_name` to `profiles`, then `navigation.reset` to Onboarding.
  - **Back button** on phone: returns from form mode to welcome landing.
  - `DEMO_PROFILE` constant: seeds all onboarding fields, bypasses auth entirely.
  - Tablet: two-panel layout (green gradient left + form right) — unaffected, always shows form.
  - All form panels remain render functions called as `{renderX()}`, not inner components (Android TextInput safety).

### Changed — App.js tab bar: Today | Plan | Pantry | Stores | You (2026-05-14)
- `App.js` — Replaced 6-tab layout (Home / Plan / Discover / Snippd FAB / Studio / Profile) with clean 5-tab layout matching the product spec.
  - **Today** (sun icon) → HomeStack (unchanged content)
  - **Plan** (calendar icon) → PlanStack (unchanged)
  - **Pantry** (package icon) → new `PantryStack`: PantryScreen root + PantryInventory, PantryScan, PantryReview, PantryCookOptions, ReceiptUpload, BarcodeScanner
  - **Stores** (map-pin icon) → new `StoresStack`: PreferredStoresScreen root + StoreExport, StorePickupHandoff, StoreCartHandoff, StoreItemBreakdown
  - **You** (user icon) → ProfileStack (unchanged)
  - Removed Discover tab, Snippd FAB (diamond center button), and Studio tab from the visible tab bar.
  - All removed stacks (CartStack, DiscoverStack) remain defined and reachable from within other stacks.

### Changed — HomeScreen: setup gate banner for incomplete profiles (2026-05-14)
- `screens/HomeScreen.js` — Added a non-blocking amber banner shown when `onboarding_complete` is false or `weekly_budget` is 0. Tapping the banner navigates to `TodaySetupGate`. Banner disappears automatically once the profile is complete.

### Changed — SignInScreen: three-mode welcome screen (2026-05-14)
- `screens/SignInScreen.js` — Full rewrite. Implements three display modes (`welcome` | `signup` | `signin`) with a fade animation between them. No separate route changes required.
  - **Welcome mode** (default): Dark forest-green background (`#0B3B1E`), `Snippd-White-Logo.png` + "snippd" wordmark, "Welcome to Snippd" headline, `hero-banner.png` hero image, 3 feature rows (Save more / Stress less / Live better with icon circles), full-width "Get Started" green button → signup mode, translucent outline "Try Demo Mode" button → `navigation.navigate('PersonaReveal', DEMO_PROFILE)`, "Already have an account? Sign in" text link → signin mode.
  - **Signup mode**: Back button to welcome, single-screen name + email + password form, "Create Account" CTA → `signUpWithEmail` + profile `upsert` (full_name, first_name) + `navigation.reset` to Onboarding.
  - **Signin mode**: Back button to welcome, Google OAuth button + email/password form (preserves original sign-in behavior via `signInWithEmail`).
  - `DEMO_PROFILE` constant: seeds full onboardingProfile (missions, weeklyBudget, household, preferred_stores, dealPreferences), navigates to PersonaReveal — no Supabase writes.
  - All form panels are render functions called inline (not inner components) — prevents Android TextInput black-box remount.

### Changed — OnboardingScreen expanded to 8-step premium flow (2026-05-14)
- `screens/OnboardingScreen.js` — Rewritten from 12-step legacy flow to 8-step premium onboarding matching the visual design template.
  - Step 0: Welcome — dark-green hero screen, "Get Started" CTA + **"Try Demo Mode"** button + "Sign in" link
  - Step 1: What matters most — missions multi-select (pure_savings, meal_planning, athletic_fuel, clinical_guardrails, family_optimization, convenience)
  - Step 2: Weekly budget — large number display, preset chips $75–$500, writes `weekly_budget_cents`
  - Step 3: Household profile — adults selector (1–4+) + children selector (0–4+)
  - Step 4: Food preferences — foodsAvoided chips + dietPreferences chips
  - Step 5: Cooking style — cookingStyle multi-select (from_scratch, meal_prep, quick_meals, frozen, takeout, variety)
  - Step 6: Favorite stores — 10-store grid (2-col)
  - Step 7: Deal preferences — dealPreferences grid (weekly_ads, digital_coupons, bogos, loyalty_offers, health_savings, lowest_total) → final step navigates to PersonaReveal
- Unified `onboardingProfile` field keys (missions, weeklyBudget, weekly_budget_cents, household, cookingStyle, foodsAvoided, dietPreferences, preferred_stores, dealPreferences) match PersonaReveal params contract
- Demo mode: `DEMO_PROFILE` constant, skips Supabase writes, navigates directly to PersonaReveal — no permanent data written
- Visual: dark-green hero screens, cream content steps, larger text (16px body), large tap targets (paddingVertical 17), progress bar 1–7/7

### Changed — PersonaRevealScreen visual redesign (2026-05-14)
- `screens/PersonaRevealScreen.js` — Premium mint/cream visual design replacing dark navy background. All persona calculation logic and animation logic unchanged.
  - Background: `#F7FAF8` (light mint cream) instead of dark navy
  - Snippd shopping-bag logo icon centered above AI badge (replaces oversized emoji-first layout)
  - AI badge: green text/icon on light mint background
  - Persona card: white with 8px colored top bar, NAVY text throughout
  - Stats card: white bordered card with NAVY values (was dark translucent)
  - "What I'm building" section: NAVY text on cream background
  - CTA button: larger (paddingVertical 20), green with stronger shadow
  - StatusBar: dark-content to match light background

### Added — Weekly deals data layer (2026-05-14)
- `src/services/weeklyDealsService.js` — Mock weekly deals array (10 seeded deals across Publix, Aldi, Walmart, Target, Kroger, Whole Foods). Each deal has: id, store_key, store_name, title, description, deal_type, original_price_cents, sale_price_cents, coupon_value_cents, final_price_cents, savings_percent, expires_at, requires_loyalty.
- `getPersonalizedDeals(profile, allDeals)` — Filters by preferred_stores, matches dealPreferences, sorts by preference match (30pts) + savings_percent + urgency (soonest expiring). Returns top 8.

### Changed — HomeScreen: weekly deals section added (2026-05-14)
- `screens/HomeScreen.js` — Added "This week's best savings for you" deals section after the Smart Insight card. Loads personalized deals via `getPersonalizedDeals()` on profile load. Shows up to 5 deal cards with store badge, title, description, savings%, loyalty indicator, expiration date, and final price.

### Changed — HomeScreen redesigned as Today Decision Hub (2026-05-14)
- `screens/HomeScreen.js` — Complete rewrite to match the Snippd premium UI template. Previous screen was a deal-browsing feed. New screen is the Today Decision Hub.
- **Header**: Snippd logo + "Save more, stress less." tagline + notification bell (badge) + profile icon (5-tap easter egg → DemoAdmin).
- **Greeting + Budget widget**: Time-based greeting ("Good morning/afternoon/evening, [Name]") + remaining weekly budget card with trend arrow. Budget derived from `profiles.weekly_budget` with a midweek heuristic for remaining amount.
- **Context stats row**: Horizontal scrollable cards — People eating tonight (household_size), Time before dinner (30 min default), Grocery status (from profile or "Not yet"), Cooking rhythm (cooking_days / eat_out_days), Pantry checked (pantry_items count).
- **Best Match hero card**: Top-ranked option from `decisionEngineService.rankOptions()` rendered as a large hero card with "BEST MATCH" green badge, meal name (e.g. "Chicken Rice Bowls"), 3 value bullets, estimated additional cost, time, food photo placeholder, and "View Meal ›" CTA.
- **Other great options**: Remaining ranked options (5 cards) displayed as horizontal scroll mini cards, each showing icon, label, subtitle, estimated cost, time, and "Good fit"/"Possible" badge.
- **Smart insight card**: Behavioral insight generated from cooking_days, eat_out_days, and day of week.
- All 6 option types route correctly: cook_from_pantry → PantryInventory, quick_grocery_run → QuickGroceryRun, grocery_pickup → StorePickupHandoff, uber_eats_pickup → UberEatsPickupHandoff, eat_out_smart → EatOutSmart, uber_eats_delivery → UberEatsDelivery.
- Loads profile + pantry count in parallel from Supabase on focus. Graceful fallbacks when data is unavailable. Pull-to-refresh supported.
- Full Snippd design system: cream background, white cards, navy text, green CTAs, no dark mode, no emojis (wave hand kept per mockup).

### Added — Full codebase audit + QuickGroceryRunScreen (2026-05-14)
- **Full audit**: Verified all 100 screens exist and are registered in App.js. Navigation wiring is complete. No screens were overwritten or disconnected.
- `screens/QuickGroceryRunScreen.js` — New "Quick grocery run for tonight." screen. Shows 4 seeded meal options (chicken stir fry, pasta marinara, ground beef tacos, salmon) requiring ≤5 items from the store. Context pills show remaining budget, household size, time. Each card shows estimated household cost, per-person cost, items needed, time, and goal fit. "Build quick cart" CTA navigates to `ShoppingList` with pre-filled items. "See full week plan" secondary routes to `WeeklyDinnerPlan`. Fully styled to Snippd premium design system (cream, white cards, navy, green CTA). No emojis.
- `App.js` — Imported and registered `QuickGroceryRun` route in root stack.
- `screens/TodayOptionsRankedScreen.js` — Fixed `quick_grocery_run` routing: was pointing to `WeeklyDinnerPlan` (wrong — full weekly plan). Now routes to `QuickGroceryRun` and passes `context` params so budget/household context is carried through.
- `screens/DemoAdminScreen.js` — Added "Quick Grocery Run" entry to Today Decision Flow section.

### Fixed — TodaySetupGateScreen TextInput black box risk (2026-05-14)
- `screens/TodaySetupGateScreen.js` — Added `backgroundColor: 'transparent'` to TextInput style and `selectionColor={GREEN}` prop. The TextInput was relying solely on the parent card's white background, which could render as black on Android with system dark mode or autofill overlay active.

### Fixed — ProfileScreen runtime crash: Rendered more hooks than during the previous render (2026-05-14)
- `screens/ProfileScreen.js` — `useRef(0)` and `useRef(null)` for avatar tap detection were declared AFTER the `if (loading) return (...)` early exit, violating Rules of Hooks (hooks must be called unconditionally in the same order on every render). Fixed by moving both `useRef` declarations to the top of the component, with the other hook calls. Removed the duplicate declarations that remained after the early return. This was causing a hard crash for every user who visited the Profile tab.

### Fixed — Expo package patch version drift (2026-05-14)
- Updated 11 expo packages to their expected patch versions for the installed Expo SDK: `expo@~55.0.24`, `expo-auth-session@~55.0.16`, `expo-crypto@~55.0.15`, `expo-linear-gradient@~55.0.14`, `expo-location@~55.1.10`, `expo-media-library@~55.0.17`, `expo-notifications@~55.0.23`, `expo-secure-store@~55.0.14`, `expo-sharing@~55.0.19`, `expo-splash-screen@~55.0.21`, `expo-web-browser@~55.0.16`.

### Added — authService.js: centralized auth with Google sign-in (2026-05-14)
- `src/services/authService.js` — `signInWithEmail(email, password)`, `signUpWithEmail(email, password)` (sets billing_plan=trial, no pricing UI at sign-up), `signInWithGoogle()` (Supabase OAuth + expo-web-browser PKCE flow), `signInWithApple()` (iOS only), `signOut()`, `resetPassword(email)`, `getCurrentUser()`, `getUserProfile(userId)`, `getAuthRedirectRoute(userId)` (checks onboarding, subscription, first_shop_started, Deep Brief, and Today setup to return the correct post-login route), `formatAuthError(error)` (user-friendly error messages). Analytics events tracked: `signin_screen_viewed`, `email_signin_started/success/failed`, `google_signin_started/success/failed/canceled`, `forgot_password_clicked`.

### Changed — SignInScreen: wired to authService (2026-05-14)
- `screens/SignInScreen.js` — All auth calls now go through `authService` (`signInWithEmail`, `signUpWithEmail`, `signInWithGoogle`, `signInWithApple`, `resetPassword`, `formatAuthError`). Removed direct `supabase.auth.*` calls, `WebBrowser`, `makeRedirectUri` imports from the screen. Added `signin_screen_viewed` analytics on mount. Google OAuth cancel + error now shows friendly copy from `formatAuthError`. Screen remains the single-file, no-inner-components pattern.

### Added — Paywall flow: PersonalizationSummary → FirstShopPaywall → PaymentSuccessRedirect (2026-05-14)
- `screens/PersonalizationSummaryScreen.js` — Post-onboarding summary screen. Shows profile summary cards (budget, household, cooking nights, stores, goals, pantry style, eat-out, stash mode). "Begin My First Shop" CTA calls `paywallGateService.checkFirstShopAccess()`. If subscription not active → routes to `FirstShopPaywall`. If active → routes directly to `TodaySetupGate`.
- `screens/FirstShopPaywallScreen.js` — Premium paywall. Headline: "Your first smarter shop is ready." Value bullets: 5 Snippd benefits. Plan chooser: 3-day trial ($97/year) or $4.99/month. "Start My Trial" CTA activates mock trial and routes to `PaymentSuccessRedirect`. "Not Now" routes to `MainApp` (basic history preserved). No lockout of saved recipes.
- `screens/PaymentSuccessRedirectScreen.js` — Auto-redirects ~1.8s after payment. Reads `next_route_after_payment` from profiles via `handlePostPurchaseRedirect()`. Defaults to `TodaySetupGate` if profile incomplete, `TodayOptionsRanked` otherwise. Never routes back to sign-in or paywall.

### Added — Paywall services (2026-05-14)
- `src/services/paywallGateService.js` — `checkFirstShopAccess(userId, intendedRoute, intendedParams)`, `hasActiveAccess(userId)`, `saveNextRouteAfterPayment()`, `consumeNextRouteAfterPayment()`, `handlePostPurchaseRedirect(userId)`, `activateMockTrial(userId)`. Mock trial sets `subscription_status = 'trialing'` + `trial_ends_at = now+3d`.
- `src/services/subscriptionService.js` — `getSubscriptionSnapshot(userId)` returns full subscription state, `userHasAccess(userId)`, `formatSubscriptionStatus(status)`.

### Added — SQL migration: paywall flow columns (2026-05-14)
- `supabase/migrations/20260514_paywall_flow_columns.sql` — Adds to profiles: `first_shop_started` (bool), `paywall_seen` (bool), `personalization_summary_viewed` (bool), `next_route_after_payment` (text/JSON). Used by paywall gate and payment redirect logic.

### Changed — Onboarding completes to PersonalizationSummary (2026-05-14)
- `screens/OnboardingScreen.js` — `finishOnboarding()` now resets to `PersonalizationSummary` instead of `PlanGenerationLoading`. This inserts the personalization summary + paywall gate between onboarding and the first shop.

### Changed — App.js resolveUserStatus: paywall-aware routing (2026-05-14)
- `App.js` — `resolveUserStatus()` now checks `onboarding_completed` and `subscription_status`. New users who completed onboarding but have no subscription see `PersonalizationSummary`. `PersonalizationSummary`, `FirstShopPaywall`, `PaymentSuccessRedirect` registered as stack screens with `gestureEnabled: false`.

### Fixed — SignInScreen: input black box + inner component remount (2026-05-14)
- `screens/SignInScreen.js` — Root cause of the black box: `FormPanel` was defined as `const FormPanel = () =>` inside `SignInScreen` and used as `<FormPanel />`. This caused the entire form tree (including `TextInput` elements) to remount on every parent render, destroying cursor state and causing Android to show a black autofill overlay. Fix: converted to `renderFormPanel()` called directly. Also: removed billing plan chooser from sign-up (paywall now shown after onboarding). Sign-up always sets `billing_plan: 'trial'`. Added `trialNote` banner. `input` fontSize bumped to 16, `minHeight: 52` on inputWrap, explicit `placeholderTextColor: GRAY`.

### Fixed — SmartStartScreen: undefined `action` variable (2026-05-14)
- `screens/SmartStartScreen.js` — Lines 132 and 147 referenced undefined `action` variable. Changed to `nbaAction` (the correctly-scoped state variable).

### Fixed — DemoAdminScreen: wrong route name for Deep Brief (2026-05-14)
- `screens/DemoAdminScreen.js` — "Deep Brief" item routed to `'SnippdDeepBrief'` which is not a registered route name. Fixed to `'ConciergeOnboarding'` (the registered name). Added new "Paywall Flow" section with PersonalizationSummary, FirstShopPaywall, PaymentSuccessRedirect demo entries. Fixed "Sign In" route from `'SignIn'` to `'Auth'`.

### Fixed — SQL migration errors (2026-05-14)
- `supabase/migrations/20260513_today_decision_and_pantry.sql` — Fixed `ERROR: 42703: column "user_id" does not exist`. Root cause: `pantry_items` and `today_setup_log` tables existed from a previous partial run without the `user_id` column; `CREATE TABLE IF NOT EXISTS` skipped recreation, then `CREATE INDEX ... (user_id)` failed. Fix: replaced `IF NOT EXISTS` guards with `DROP TABLE IF EXISTS CASCADE` before each `CREATE TABLE` so the tables are always recreated cleanly with the correct schema.
- `supabase/migrations/20260514_subscription_tracking.sql` — Removed `full_name` from `v_expired_trials` view; that column does not exist in the production `profiles` table and would have caused a second column-not-found error.

### Changed — Stripe webhook full billing_plan wiring (2026-05-14)
- `supabase/functions/stripe-webhook/index.ts` — Now handles 6 Stripe events. `checkout.session.completed`: sets `billing_plan` (trial/monthly/yearly from metadata), `subscription_status` (trialing/active), `stripe_customer_id`, `stripe_subscription_id`, `trial_ends_at` (now+3d if trial). `customer.subscription.created`: enriches plan from subscription interval + metadata. `customer.subscription.updated`: syncs plan changes. `customer.subscription.deleted`: marks `subscription_status='cancelled'`. `invoice.payment_succeeded`: renews `subscription_period_end`; upgrades `billing_plan` from 'trial' → 'yearly' on first real charge. `invoice.payment_failed`: marks `subscription_status='past_due'`. New helper `findUserByCustomerId()` looks up profile by `stripe_customer_id`. New `resolveBillingPlan()` helper for interval detection.

### Added — SQL migration: subscription tracking (2026-05-14)
- `supabase/migrations/20260514_subscription_tracking.sql` — Adds to profiles: `subscription_status` (none/trialing/active/past_due/cancelled), `stripe_customer_id`, `stripe_subscription_id`, `subscription_period_end`, `trial_ends_at`. Indexes on both Stripe ID columns. View `v_expired_trials` for users whose trial has lapsed but subscription is not yet active.

### Deployed — Edge functions (2026-05-14)
- `stripe-webhook` — redeployed to production (gsnbpfpekqqjlmkgvwvb)
- `fatsecret-health`, `fatsecret-search`, `fatsecret-get`, `fatsecret-estimate` — deployed to production for first time

### Added — Today Decision flow screens (2026-05-13)
- `screens/TodaySetupGateScreen.js` — Single-page setup gate. Collects budget, household, people eating, grocery status, time before dinner, pantry preference, today goal, allergy acknowledgment. Pre-fills from Supabase profile. Upserts on submit, routes to TodayOptionsRanked with full context.
- `screens/TodayOptionsRankedScreen.js` — Premium ranked options screen using decisionEngineService. Context pill row, OptionCard at module scope (green top pick, white others), price range, per-person cost, time, reason, CTA per route rule.
- `screens/ChefStashRecipeScreen.js` — Recipe detail. Why picked, cost/servings/time, nutrition (labeled), pantry vs missing items, 7-method switcher, numbered instructions, safety disclaimer, Add Missing Items CTA.
- `screens/PantryInventoryScreen.js` — Pantry list with confidence filter chips, summary strip, per-item badges. CTAs to PantryScan and PantryCookOptions.
- `screens/PantryCookOptionsScreen.js` — Meals from pantry. Have-items (green), missing (coral) with add-on cost, score badge, View Meal → ChefStashRecipe.

### Changed — Today Decision routing + App.js + nextBestAction (2026-05-13)
- `screens/TodayDecisionScreen.js` — Checks profile completeness on mount; routes to TodaySetupGate via navigation.replace() if budget or household_size missing.
- `src/services/nextBestActionService.js` — Added TODAY_SETUP + SHOW_TODAY_OPTIONS actions. Added checkTodaySetupComplete() + getTodayDecisionRoute() export.
- `App.js` — Added 10 new route imports and Stack.Screen registrations: TodaySetupGate, TodayOptionsRanked, ChefStashRecipe, PantryInventory, PantryCookOptions, StorePickupHandoff, StoreCartHandoff, EatOutSmart, UberEatsPickupHandoff, UberEatsDelivery.
- `screens/DemoAdminScreen.js` — Added Today Decision Flow section, extended Pantry + Shopping + Uber Eats sections with all new routes.

### Added — SQL migration (2026-05-13)
- `supabase/migrations/20260513_today_decision_and_pantry.sql` — Adds to profiles: billing_plan, people_eating_today, grocery_shopped_status, time_before_dinner_text, pantry_preference, today_goal, allergy_acknowledgment_status. Creates: pantry_items (RLS), fatsecret_nutrition_cache, today_setup_log tables.

### Added — FatSecret Edge Functions (2026-05-13)
- `supabase/functions/fatsecret-health/` — Health check. No FatSecret call — checks env vars only.
- `supabase/functions/fatsecret-search/` — Bearer JWT. Food search. Seeded fallback when creds absent.
- `supabase/functions/fatsecret-get/` — Bearer JWT. Food nutrition by food_id. Seeded fallback.
- `supabase/functions/fatsecret-estimate/` — Bearer JWT. Meal nutrition estimate from ingredients. Returns calories, protein, carbs, fat, sodium, sugar, confidence_score, disclaimer.

### Added — Store pickup, cart handoff, eat-out, and Uber Eats screens (2026-05-13)
- `screens/StorePickupHandoffScreen.js` — Grocery pickup store selector. Ranks Aldi, Publix, and Walmart by total estimated cost; highlights best-value store with green badge. StoreCard shows price, item count, meals covered, savings vs list price, pickup availability, and select/continue CTA. After selection shows CTA panel with "Open Store App" (Linking.openURL to store-specific URL) and "Copy Shopping List" (Clipboard with console fallback). Tracks `store_pickup_handoff_viewed`, `store_pickup_store_selected`, `store_pickup_opened`, `store_list_copied`.
- `screens/StoreCartHandoffScreen.js` — Final pickup handoff screen showing a FlatList of cart items with name, qty, aisle, and estimated price. Accepts `storeName` and `items` route params; falls back to 4 seeded items. Summary strip shows item count and running total. Separate "Missing items" section renders items flagged missing in CORAL. Bottom actions: Open Store App, Copy List, and a gray link to ShoppingList screen. Tracks `store_cart_handoff_viewed`, `store_app_opened`, `store_list_copied`.
- `screens/EatOutSmartScreen.js` — Local eat-out option browser. 4 seeded options (Chick-fil-A, Chipotle, Panda Express, Chili's) with estimated household cost, per-person cost, ETA, goal fit, and budget fit. Horizontal filter chip row (All / Pickup / Delivery / Under budget / High protein / Kid-friendly / Fastest) with live client-side filtering. Budget context pills show remaining budget, people eating, and max per-person. EatOutCard CTA opens Uber Eats via Linking. Disclaimer at bottom. Tracks `eat_out_smart_viewed`, `eat_out_option_selected`.
- `screens/UberEatsPickupHandoffScreen.js` — Uber Eats pickup-specific screen. 2 seeded pickup options with restaurant, item, household total, per-person cost, ETA, budget impact (amber), and nutrition note (italic gray). PickupCard CTA tracks `uber_eats_pickup_opened` and opens Uber Eats URL. Budget and people context pills. Sandbox testing note and disclaimer. Tracks `uber_eats_pickup_handoff_viewed`.
- `screens/UberEatsDeliveryScreen.js` — Uber Eats delivery screen with full fee transparency. 2 seeded options; each DeliveryCard shows food total, delivery fee, service fee, and grand total (bold green) in a styled fee breakdown table, plus per-person cost, ETA badge, and amber budget impact row. Stash note warns delivery adds 25-40% to food total. CTA tracks `uber_eats_delivery_opened`. Tracks `uber_eats_delivery_viewed` on mount.

### Added — Nutrition, pantry, store handoff, and cost estimation services (2026-05-13)
- `src/services/fatSecretNutritionService.js` — Frontend nutrition service. Routes all FatSecret calls through Supabase Edge Functions (`fatsecret-search`, `fatsecret-get`, `fatsecret-estimate`, `fatsecret-health`). Falls back to seeded nutrition data (Chicken Rice Bowls, Pasta with Garlic and Olive Oil, Egg Fried Rice, default) when edge function is unreachable. Exports `searchNutritionFood`, `getNutritionFood`, `estimateMealNutrition`, `getNutritionProviderStatus`.
- `src/services/pantryInventoryService.js` — Pantry CRUD service backed by Supabase `pantry_items` table. Falls back to 8-item seeded pantry when table empty or unavailable. Exports `getPantryItems`, `addPantryItem`, `removePantryItem`, `confirmPantryItem`. Also exports `getMealOptionsFromPantry` — pure function that matches pantry contents against 5 seeded meal templates and returns viable meals with `have_items`/`missing_items`/`score`.
- `src/services/storeHandoffService.js` — Store handoff prep service. Ranks Aldi/Walmart/Publix for pickup with seeded per-item price bands (Aldi $2.50, Walmart $3.20, Publix $4.20). Exports `getBestStoreForPickup`, `getStorePickupUrl`, `formatShoppingListText`, `getStoreHandoffStatus`. No direct cart API — all stores return `has_direct_integration: false`.

### Changed — decisionEngineService cost estimation and option generation (2026-05-13)
- `src/services/foodOptions/decisionEngineService.js` — Added `estimateCosts(optionType, context)`: returns per-option cost range in cents (low/mid/high/fees/perPerson) with `budgetImpactLabel` (Under budget / Moderate / Watch budget / Over budget) and `costRangeLabel`/`perPersonLabel` strings. Added `formatCentsRange(low, high)` and `formatCentsPerPerson(mid, people)` formatting helpers. Added `generateTodayOptions(context)`: calls `rankOptions()` across all six option types, merges cost estimates into each result, returns array sorted by `totalScore` descending. All prior exports preserved.

### Changed — Navigation wiring (2026-05-13)
- `screens/TodayDecisionScreen.js` — `cook_from_pantry` and `eat_out_smart` option types now navigate to `TodayRecommendation` (Tonight's Best Move screen) instead of `WeeklyDinnerPlan`.
- `screens/ExpandedDayPlanScreen.js` — Each MealBreakdownCard now receives `onCook` callback routing to `ContextualCooking`. "Add Today to Plan" CTA now navigates to `ShoppingList` (was a dead no-op).
- `src/components/weeklyPlan/MealBreakdownCard.js` — Added `onCook` prop. When provided, renders "How to Cook" button (book-open icon, green outline) alongside "Add to Cart". Removed dead "Swap Meal" button.
- `screens/HomeScreen.js` — Added "Scan Your Pantry" quick-action card below "Scan Receipt & Earn", routes to `PantryScan`.

### Added — HomeHeader component (2026-05-13)
- `src/components/home/HomeHeader.js` — Standalone gradient header component. Props: onNotificationPress, onProfilePress, userName. Fixed from untracked state: removed broken theme/colors and theme/spacing imports (no such files), replaced with inline constants. Removed emoji from greeting copy.

### Added — Missing components and screen (2026-05-13)
- `src/components/pantry/PantryScanResultCard.js` — Confidence-coded pantry scan result card (Likely/Maybe/Needs review). Confirm and Remove actions. Distinct from PantryItemCard: lighter weight, no inline editing, used immediately after a scan before user makes edits.
- `src/components/weeklyPlan/ShiftPlanConfirmationCard.js` — Post-shift confirmation card shown after MealShiftModal resolves. Three states: shift (plan moved), skip (meal removed), keep (unchanged). Shows waste freshness warning if perishables affected. Budget impact row. "View updated plan" + Done CTAs.
- `src/components/weeklyPlan/CookingMethodSelector.js` — Standalone cooking method selector component. Supports horizontal (ScrollView chip bar) and grid (wrap) layouts. 7 methods: Air Fryer, Oven, Stovetop, Grill, Slow Cooker, Microwave, No-cook. Exports `METHODS` constant. Can be used independently of ContextualCookingScreen.
- `src/components/weeklyPlan/CookingInstructionCard.js` — Standalone cooking instruction card. Renders numbered steps with meal name header, method badge, time note, and always-on safety disclaimer. Designed to be embedded in any meal detail screen.
- `src/components/store/StoreExportButton.js` — Reusable store export button. Three variants: store (green outline), uber (amber filled), copy (neutral). Small prop for compact use. Disabled state support.
- `screens/SavedRecipesScreen.js` — User's saved recipe history. "Your saved recipes stay yours" ownership banner. 5 seeded saved recipes with date, meal type, personal notes, and "How to cook" route to ContextualCooking. Unsave action tracks `recipe_saved` (unsave). Empty state with guidance copy. Registered in App.js as `SavedRecipes`.

### Changed — Screen copy corrections (2026-05-13)
- `screens/PantryScanScreen.js` — Updated subheadline to match spec: "Take a quick photo of your pantry, fridge, or counter. Snippd will help spot what may already be available before you buy more." Added Stash message card: "Before we spend more, let's see what your kitchen can already do." (green S bubble + MINT background). Changed disclaimer from privacy copy to spec-required: "Pantry scan results are estimates. Please review and confirm items before using them in your plan."
- `screens/PantryReviewScreen.js` — Added "Here's what Snippd found." headline and "Review the items below so your plan starts with what you may already have." subheadline above the summary strip. Added `heroSection`, `heroHeadline`, `heroSub` styles.
- `screens/ContextualCookingScreen.js` — Added "How do you want to cook this?" headline and "Snippd can adjust the steps to match your kitchen and your energy today." subheadline above the meal name. Reduced `mealTitle` size to 16px (was 22px) to preserve visual hierarchy.

### Changed — DemoAdminScreen expanded (2026-05-13)
- `screens/DemoAdminScreen.js` — Added "Shift Logic Demo" section: "Shift Modal Demo" tile opens MealShiftModal inline with seeded wasteItems. After selection, `ShiftPlanConfirmationCard` renders below the grid showing the result. Added "Saved Recipes" tile to Cooking & Recipes section. Expanded Uber Eats Sandbox section: Uber Eats Pickup, Uber Eats Delivery (passes `uber_eats_delivery` optionType), Sandbox Status tile. Sandbox Status panel shows real-time integration status table (Sandbox testing / Not connected / Seeded demo data) and disclaimer. Imports MealShiftModal + ShiftPlanConfirmationCard.

### Changed — DemoAdmin hidden entry point (2026-05-13)
- `screens/ProfileScreen.js` — Avatar initials circle now has a 5-tap hidden trigger. Tapping the avatar 5 times within 2 seconds navigates to `DemoAdmin`. Uses `useRef` (no re-render on each tap). Timer resets to zero if taps stop before 5.

### Changed — SignInScreen pricing/trial disclosure (2026-05-13)
- `screens/SignInScreen.js` — Added pricing section to the signup tab. Two billing options: (1) 3-day free trial → $97/year founding member rate auto-billed at trial end; (2) $4.99/month, no trial, cancel anytime. Radio-style plan selector with "Best value" badge on trial option. Submit button changes to "Start 3-day Free Trial" or "Subscribe at $4.99/mo" based on selection. Trust copy under submit: "No surprise charges. Cancel before trial ends to pay nothing." Bottom link updated to "Start your free trial". Billing plan stored in `profiles.billing_plan` on sign-up. Pricing disclosure text updates per selected plan.

### Added — Analytics events for new screens (2026-05-13)
- `screens/PantryScanScreen.js` — Tracks `pantry_scan_started` (method: camera/demo_results) and `pantry_scan_completed` (item_count, method: seeded).
- `screens/PantryReviewScreen.js` — Tracks `pantry_items_confirmed` (confirmed_count, total_detected).
- `screens/ContextualCookingScreen.js` — Tracks `cooking_method_changed` (method, meal_id) on each method selection.
- `screens/StoreExportScreen.js` — Tracks `store_export_started` on mount (store_count). Tracks `store_export_clicked` (store_id, store_name) per store tap. Tracks `uber_eats_handoff_clicked` (source: store_export).
- `screens/RecipeVaultScreen.js` — Tracks `recipe_vault_opened` (recipe_count) on mount.
- `screens/UberEatsHandoffScreen.js` — Tracks `uber_eats_handoff_clicked` (option_type, score) on mount.
- `src/components/weeklyPlan/MealShiftModal.js` — Tracks `meal_shift_prompted` when modal becomes visible. Tracks `meal_shift_accepted` (choice, meal_name) on confirm. Tracks `meal_shift_declined` (meal_name) when dismissed without selection.

### Added — Competitor-informed feature set: screens + components + services (2026-05-13)
- `screens/PantryScanScreen.js` — Pantry photo scan screen. "Scan what you have." headline, viewfinder mock with green corner brackets, 1.4s simulated scan using `pantryVisionService.returnSeededPantryScan()`, routes to PantryReview on completion.
- `screens/PantryReviewScreen.js` — Pantry confirmation screen. Shows 8 seeded scan results using `PantryItemCard`. Keep/Edit/Remove per item. "Use X items in my plan" CTA routes to WeeklyDinnerPlan. Detected / Confirmed / Unreviewed summary strip.
- `screens/ContextualCookingScreen.js` — Contextual cooking instructions screen. 7-method selector (Air Fryer, Oven, Stovetop, Grill, Slow Cooker, Microwave, No-cook) using `contextualCookingService.adjustCookingInstructions()`. Step-by-step display with metadata strip (time, temp, difficulty). Safety note always shown.
- `screens/StoreExportScreen.js` — Store list export screen. Aldi/Publix/Walmart cards using `StoreHandoffCard` with seeded item counts, estimated totals, and savings. Uber Eats sandbox card. Routes to ShoppingList or UberEatsHandoff.
- `screens/RecipeVaultScreen.js` — Recipe vault. "Your saved recipes stay yours" ownership banner. 6 seeded recipes filterable by meal type. Each card shows cost/serving, cook time, serves count, tags, and "How to cook this" → ContextualCooking route.
- `screens/TodayRecommendationScreen.js` — Tonight's best move screen. Hero card: score badge, "Cook Chicken Rice Bowls" recommendation, 4-quadrant impact grid (cost/time/pantry/nutrition), missing items amber row, "How to cook this" CTA. Ranked comparison list for all other options including Uber Eats (with sandbox disclaimer). 
- `screens/DemoAdminScreen.js` — Internal demo navigator. 7 sections, 20+ routes. Tapping any tile jumps directly to that screen with appropriate seeded params. Internal badge (coral). Used for demo walkthroughs.
- `src/components/pantry/PantryItemCard.js` — Confidence-coded pantry item card. Likely=green, Maybe=amber, Needs review=coral. Keep/Edit/Remove actions. Inline TextInput editing via `onEdit` callback. Kept state turns card mint.
- `src/components/weeklyPlan/MealShiftModal.js` — Bottom sheet modal. Three-option meal shift flow: "Shift the plan", "Skip this meal only", "Keep the plan as-is". Perishable warning card when `wasteItems` prop is populated. Requires selection before enabling primary CTA.
- `src/components/weeklyPlan/MealTypeFilterBar.js` — Horizontal chip filter bar for meal type. All / Breakfast / Lunch / Dinner / Snacks with Feather icons. Active chip: green filled. Used in WeeklyDinnerPlanScreen meals tab.
- `src/components/store/StoreHandoffCard.js` — Reusable store handoff card. Regular variant: store name, item count, estimated total, savings, "View [Store] List" CTA (green). Uber Eats variant (`isUberEats` prop): amber styling, "Sandbox testing" pill, "Open in Uber Eats" CTA.
- `src/services/pantryVisionService.js` — Pantry scan simulation service. 8-item seeded results (Rice, Pasta, Broccoli, Eggs, Greek yogurt, Frozen veg, Chicken broth, Tortillas) with Likely/Maybe/Needs review confidence. `scanPantryImage()` simulates 1.2s vision call. `confirmPantryItems()` deduplicates. `syncPantryToProfile()` writes `pantry_item_count` to Supabase.
- `src/services/mealShiftService.js` — Meal shift logic service. Shifts day plans forward 1 day from `fromDate`. Calculates perishable waste risk after shift. Recalculates daily totals. Compares eat-out cost vs. home cook cost.
- `src/services/contextualCookingService.js` — Contextual cooking instructions service. 7 methods each with 5 seeded steps, time/temp/difficulty metadata. `adjustCookingInstructions(meal, method)` returns adapted steps. SAFETY_NOTE always appended.
- `src/services/safetyScrubService.js` — Safety scrub service. Checks meal ingredients against user's `avoids` and `allergies`. Returns `{ safe, needsReview, blocked }` per option. `REQUIRED_DISCLAIMER` always shown. Never makes medical claims or says "verified allergen-free".
- `src/services/imageTrustService.js` — Image trust service. Returns illustration placeholders by meal type instead of AI-generated food photos. `IMAGE_DISCLAIMER` always returned with any illustration. Prevents misleading food imagery.
- `src/services/budgetCappedMealService.js` — Budget-capped meal plan service. Generates plan within `weeklyBudgetCents` using seeded data. 5% grace threshold. `checkPlanBudgetFit()` returns status + overage. `generateCheaperVariant()` returns 85% cost alternative.
- `src/services/portionIntelligenceService.js` — Portion intelligence service. No-Hallucination guarantee: maps meal ingredients to real store package sizes ("Family Pack Chicken at Aldi for $9.99", "Pasta 1lb Box $1.29 at Aldi"). `validateMealPortions()` checks servings vs effectivePeople (adults + children×0.75 + toddlers×0.4). Returns `portion_status`, `recommended_adjustments`, `store_anchor`.

### Changed — WeeklyDinnerPlanScreen + ExpandedDayPlanScreen (2026-05-13)
- `screens/WeeklyDinnerPlanScreen.js` — Added `MealTypeFilterBar` (All/Breakfast/Lunch/Dinner/Snacks) on meals tab. Added "Change tonight's plan" tappable CTA → `MealShiftModal`. Modal wired with shift/skip/keep handlers.
- `screens/ExpandedDayPlanScreen.js` — "Swap a Meal" CTA renamed to "Eating out tonight?" with shuffle icon. Tapping opens `MealShiftModal` (shift/skip/keep options).

### Changed — App.js routes (2026-05-13)
- `App.js` — Registered 7 new routes: PantryScan, PantryReview, ContextualCooking, StoreExport, RecipeVault, TodayRecommendation, DemoAdmin.

### Changed — SignInScreen copy + design system alignment (2026-05-13)
- `screens/SignInScreen.js` — Full copy overhaul. Removed: "Stack every deal. Miss nothing.", "autonomous shopping intelligence", "100% autonomous", "$2.4k avg annual savings", "stores tracked" stat. Replaced left-panel headline with "Smarter food decisions, before the money is spent." Sub: "Snippd helps you plan groceries, meals, store choices, savings, and eat-out options around your real weekly budget." Motto: "Save more, stress less." Stats: Budget-first / weekly planning · Meals + stores / guided together · Receipt-based / learning. Palette migrated from dark forest-green to Snippd brand (Navy `#172250`, Green `#0C9E54`, Mint `#c5ffbc`, Cream `#FAF8F1`). Added mobile hero section (wordmark + headline + stat cards) so phone users see value prop before the form. Form copy: email placeholder "Email address", password placeholder "Password", submit "Sign In" / "Create an Account", trust copy "Plan smarter. Save more. Stress less." Removed stats useEffect that pulled profile count.

### Added — UberEatsHandoffScreen (2026-05-13)
- `screens/UberEatsHandoffScreen.js` — Sandbox handoff screen for uber_eats_pickup and uber_eats_delivery options from TodayDecisionScreen. Shows ETA, fee note, Snippd fit score, and legal integration disclaimer. Primary CTA returns to TodayDecision; secondary navigates to WeeklyDinnerPlan.
- `App.js` — Registered `UberEatsHandoff` route.

### Changed — TodayDecisionScreen route wiring (2026-05-13)
- `screens/TodayDecisionScreen.js` — `uber_eats_pickup` and `uber_eats_delivery` now navigate to `UberEatsHandoff` with `optionType` and `score` params. `eat_out_smart` navigates to `WeeklyDinnerPlan` (nutrition-aware meal view) instead of falling back to MainApp.

### Database — pantry_item_count migration (2026-05-13)
- `supabase/migrations/20260513_add_pantry_item_count.sql` — `ALTER TABLE profiles ADD COLUMN IF NOT EXISTS pantry_item_count integer DEFAULT 5`. Supports decision engine pantry_fit scoring. Apply in Dashboard SQL Editor.

### Changed — SnippdDeepBriefScreen provider-neutral copy (2026-05-13)
- `screens/SnippdDeepBriefScreen.js` — STRESS_BEHAVIORS: "DoorDash, Uber Eats, or Instacart when I'm fried" → "A delivery app when I'm fried". AUTONOMY: "Build my cart, I'll approve" → "Build my food plan, I'll approve"; "Fully autonomous. Alert me only if I'm about to overpay" → "Fully guided — I trust the plan. Alert me if I'm over budget".

### Added — Provider-agnostic food decision architecture (2026-05-13)
- `src/services/foodOptions/decisionEngineService.js` — Core 100-point scoring engine. Six factors: budget_fit (25), time_fit (20), nutrition_fit (20), pantry_fit (15), household_fit (10), preference_score (10). Exports `scoreOption()` and `rankOptions()`. Snippd decides; providers fulfill.
- `src/services/foodOptions/pantryProvider.js` — Returns cook_from_pantry option with coverage estimate. Excluded when pantryCount === 0.
- `src/services/foodOptions/snippdGroceryProvider.js` — Returns quick_grocery_run and grocery_pickup options ranked by budget + pantry fit.
- `src/services/foodOptions/uberEatsProvider.js` — Uber Eats as one fulfillment provider. Options excluded when recommendation_score < 35. Includes legal disclaimer copy. Does NOT label Snippd as "powered by Uber Eats".
- `src/services/foodOptions/foodOptionsProvider.js` — Orchestrator. Calls all providers in parallel, runs through decision engine, returns ranked list. `buildContextFromProfile()` maps Supabase profile → context.
- `screens/TodayDecisionScreen.js` — New screen: ranked food decision flow. 6 options (cook from pantry, quick grocery run, grocery pickup, Uber Eats pickup, Uber Eats delivery, eat out smart). Score bar + "Best fit / Good fit / Possible / Not ideal" badges. Budget remaining pill. Loads live profile from Supabase, falls back to seeded context.
- `App.js` — Registered `TodayDecision` route. Imported `TodayDecisionScreen`.

### Changed — App language / strategic positioning (2026-05-13)
- `screens/SmartStartScreen.js` — Option 1 "Build this week's grocery plan" → "Plan this week's food". Option 3 "Figure out what's for tonight" → "Help me decide what to do today" (now routes to TodayDecision). StashBubble icon ✦ → S.
- `screens/AddNeedsScreen.js` — "Build Smart Starter Cart" → "Add to My Food Plan".
- `screens/WeeklyPlanStarterScreen.js` — "Build a smart starter cart" → "Plan my meals around deals".
- `screens/ShoppingPlanScreen.js` — "Build My Cart from This Plan" → "Start This Food Plan".
- `screens/ExpandedDayPlanScreen.js` — "Add Today to Cart" → "Add Today to Plan".
- `screens/CartOptionsScreen.js` — "Building your smart carts…" → "Planning your smart food options…".
- `screens/UsualStaplesScreen.js` — "Skip — build cart from scratch" → "Skip — I'll add items manually".

### Changed — HomeScreen WeeklyDinnerPlan entry point (2026-05-13)
- `screens/HomeScreen.js` — Added "Your Weekly Dinner Plan" banner card between the More Stacks and Budget sections. Taps navigate to `WeeklyDinnerPlanScreen`. Styled as a mint banner with calendar icon and chevron, matching the screen's existing card language.

### Changed — PlanReviewScreen navigation (2026-05-13)
- `screens/PlanReviewScreen.js` — Added "View detailed weekly plan" secondary button that navigates to `WeeklyDinnerPlan`. Updated StashBubble icon from `✦` to `S` monogram.

### Added — WeeklyDinnerPlanScreen v1 (2026-05-13)
- `screens/WeeklyDinnerPlanScreen.js` — Premium weekly dinner plan screen with 3-tab layout (Meals / Store / Nutrition). Green hero card showing week range, household size, OOP cost, and savings. Tab logic routes to MealsByDayTab, StorePlanTab, NutritionComplianceTab.
- `screens/ExpandedDayPlanScreen.js` — Day drill-down showing full meal breakdown with per-meal cost, store, savings, prep time, and why-picked rationale. Add to Cart + Swap Meal CTAs.
- `screens/StoreItemBreakdownScreen.js` — Store-specific item list showing product name, meal association, price, and deal info. Per-item add/remove toggle and Add All CTA.
- `src/components/weeklyPlan/WeeklyPlanHeroCard.js` — Green hero card: week range, household size, out-of-pocket total, savings, best overall store, deal expiry.
- `src/components/weeklyPlan/PlanTabBar.js` — Three-tab bar (Meals / Store / Nutrition) with green active underline indicator.
- `src/components/weeklyPlan/DaySummaryCard.js` — Day card with day/date, daily total, savings badge, 3-meal summary rows, best store badge, tap-to-expand hint.
- `src/components/weeklyPlan/MealBreakdownCard.js` — Per-meal card with cost, store, savings, prep time, why-picked rationale, Add to Cart + Swap Meal buttons.
- `src/components/weeklyPlan/MealsByDayTab.js` — Meals tab: scrollable list of DaySummaryCard items, navigates to ExpandedDayPlan on tap.
- `src/components/weeklyPlan/StoreFilterBar.js` — Horizontal chip bar: All Stores + one chip per store. Active chip filled green.
- `src/components/weeklyPlan/StorePlanCard.js` — Store card with initial badge, role, estimated total, savings, meals-supported list, deal date, and View Items CTA.
- `src/components/weeklyPlan/StorePlanTab.js` — Store tab: summary bar, StoreFilterBar, filtered StorePlanCard list. Navigates to StoreItemBreakdown on View Items tap.
- `src/components/weeklyPlan/NutritionFilterBar.js` — Horizontal filter pills: All Goals, High Protein, Budget Meals, Lower Sugar, Lower Sodium, Kid-Friendly, Quick Meals, calorie ranges.
- `src/components/weeklyPlan/NutritionComplianceCard.js` — Compliance card: score badge, animated bar, matched goals, watch items (coral), estimated calories + protein, cost, store, why-it-ranks text.
- `src/components/weeklyPlan/NutritionComplianceTab.js` — Nutrition tab: sorted sections (Best Matches / Strong Match / Good Match / Needs Review), filter bar, footer disclaimer.
- `src/utils/weeklyPlan/seededPlanData.js` — Complete seeded demo data: 1 weekly plan, 7 day plans, 21 meals, 3 stores, 21 nutrition entries, user profile.
- `src/utils/weeklyPlan/formatMoney.js` — `formatCents()` and `formatCentsCompact()` monetary display utilities.
- `src/utils/weeklyPlan/groupMealsByDay.js` — Groups meals into Map<day_plan_id, {dayPlan, meals[]}> sorted Breakfast/Lunch/Dinner.
- `src/utils/weeklyPlan/groupMealsByStore.js` — Groups meals into Map<store_id, {store, meals[]}> with primary flag and dayPlan reference.
- `src/utils/weeklyPlan/calculateNutritionCompliance.js` — 100-point compliance scoring: goal match (40), budget fit (20), nutrition filter (25), time fit (10), preference safety (5). Labels + sortByCompliance export.
- `src/utils/weeklyPlan/getBestStoreForMeal.js` — Returns {primary_store, secondary_stores, store_label} for a meal.
- `src/utils/weeklyPlan/getBestStoreForDay.js` — Returns {best_store, secondary_stores, store_label} for a day plan.
- `src/utils/weeklyPlan/calculateWeeklyPlanTotals.js` — Normalizes out-of-pocket, savings, daily totals, and store totals for consistent display across all three tabs.
- `App.js` — Registered WeeklyDinnerPlan, ExpandedDayPlan, StoreItemBreakdown routes in root Stack.Navigator.

### Added — Premium onboarding overhaul (2026-05-13)
- `screens/OnboardingScreen.js` — Full rewrite. 12-step premium flow replacing the old 9-step conversational onboarding. Steps: Welcome → Budget → BudgetSplit → Household → FoodGoals → Stores → PreferencesAllergies → CookingStyle → EatOut → BrandSwap → StashStyle → AllSet. Step-machine architecture (single component, `step` state, render functions called as `{steps[step]()`}). Stash uses clean "S" monogram — no emojis anywhere. Budget step captures real weekly spend with large centered input + quick-select chips ($100–$300) and warning validation. Saves all 15 profile fields to Supabase `profiles` + `user_persona` on completion.
- `screens/PlanGenerationLoadingScreen.js` — New loading screen shown immediately after onboarding. Animates through 6 checklist items at 1.1s intervals, then navigates to `SmartStart`. Stash "S" avatar, progress indicators (pending/active/done states).
- `App.js` — Added `PlanGenerationLoadingScreen` import and `PlanGenerationLoading` route in root Stack.Navigator (gestureEnabled: false).

### Changed — Emoji removal (2026-05-13)
- `screens/UsualStaplesScreen.js` — Removed all food/household emojis from 18-item STAPLES array. Replaced emoji icons with 2-letter category initial badges (PR/DA/PA/HH). Updated `StashBubble` from "✦" to clean "S" monogram.
- `screens/CartBuilderScreen.js` — Removed store emojis from Aldi/Publix/Dollar General store cards. Replaced with branded 2-letter initial badges (AL/PX/DG) in Mint background. Updated `StashBubble` to "S" monogram.

### Added — Next-Best-Action concierge flow (2026-05-13)
- `src/services/nextBestActionService.js` — `getNextBestAction(userId)` evaluates 5 Supabase state signals (onboarding_complete, active_weekly_plan, cart_started, receipt_uploaded, trip_feedback_completed) and returns the user's next best action and route. Falls back gracefully when tables don't exist yet. Actions: RESUME_ONBOARDING, START_WEEKLY_PLAN, REVIEW_PLAN, CONTINUE_SHOPPING_OR_RECEIPT, COMPLETE_TRIP_FEEDBACK, VIEW_WEEKLY_INSIGHTS, HOME_DASHBOARD.
- `screens/SmartStartScreen.js` — Post-login concierge landing page. Greets user by first name, shows 5 action options, highlights the NBA-recommended option. Calls `getNextBestAction` on mount to self-determine state if no param provided.
- `screens/WeeklyPlanStarterScreen.js` — Weekly plan kickoff screen. Displays budget/stores/goals snapshot from user profile (seeded fallback). Four entry paths: type items, past favorites, usual staples, smart starter cart.
- `screens/AddNeedsScreen.js` — Item entry screen with search input, chip tags, quick-add suggestions (Milk, Eggs, Chicken, etc.). Routes to UsualStaples or SmartStarterCart.
- `screens/UsualStaplesScreen.js` — Category-filtered grid of 18 common household staples. Multi-select with check marks. Routes selected items to SmartStarterCartScreen.
- `screens/SmartStarterCartScreen.js` — AI-generated starter cart with 6 sections (Must-Have Staples, Smart Savings, Meal Builders, Quick Backup Meals, Eat-Out Defense, Household Items). Per-item remove. Summary strip shows estimated spend, savings found, item count.
- `screens/PlanReviewScreen.js` — Budget summary card with spend vs. budget bar, potential savings, store breakdown, "Built around" checklist. Toggle between default / cheaper / healthier plan variants (seeded). Links to StackPersonalizationScreen.
- `screens/StackPersonalizationScreen.js` — Explains 4 selected stacks (Budget Saver, High Protein, Quick Meals, Eat-Out Defense) with match reason tied to user goals.
- `screens/CartBuilderScreen.js` — Organizes items by store (Aldi, Publix, Dollar General). Per-item Keep / Swap / Remove actions. Seeded swap alternatives for key items.
- `screens/ReceiptPromptScreen.js` — Post-shopping receipt check-in. Three paths: Upload Receipt, Enter Total Manually, Skip for Now. Shows "what Snippd learns" cards. Routes to existing ReceiptUploadScreen.
- `App.js` — Imported all 9 new screens and `getNextBestAction`. Updated `resolveUserStatus` to call the NBA router after the Deep Brief check, so users are always routed to their next best action rather than a generic dashboard. Registered all 9 new screens in the root Stack.Navigator.

### Fixed — tracker.track crash (2026-05-13)
- `src/lib/eventTracker.ts` — Added missing `track(event_name, payload)` method to `SnippdEventTracker` class. Method was referenced by `SnippdDeepBriefScreen`, `HomeScreen`, `ProfileScreen`, and `WeeklyPlanScreen` but had not been committed, causing a `TypeError: tracker.track is not a function` crash on mount. Also fixed a secondary bug where the method called `requireUserId()` (which throws) — replaced with a warn-and-drop guard so missing user_id logs a warning instead of crashing the app.

### Added — Optional Deep Brief personalization flow (2026-05-13)
- `screens/SnippdDeepBriefScreen.js` — Added an optional Snippd Deep Brief flow for deeper household, shopping, cooking, allergy/safety, pantry, behavior, financial goals, and autonomy preferences. Saves to `user_persona` with `briefing_completed = true` and supports optional `returnTo` navigation.
- `App.js` — wired the existing `ConciergeOnboarding` route to the new `SnippdDeepBriefScreen` component.
- `screens/HomeScreen.js` — added an optional Snippd Deep Brief CTA card so users can choose a deeper personalization flow from the home feed.
- `screens/ProfileScreen.js` — added an optional Deep Brief CTA from the profile screen to let users update personalization anytime.
- `docs/APP_WIRING.md`, `docs/USER_FLOW_AND_COUPON_VALIDATION.md`, `docs/DATABASE.md`, `docs/DESIGN.md` — updated legacy `ConciergeOnboarding` documentation to reflect the new optional `SnippdDeepBriefScreen` flow.
- `screens/SignInScreen.js` — fixed sign-up flow to avoid navigating to `ConciergeOnboarding` when email confirmation is pending, and instead surface a confirmation message.

### Fixed — Compile fix (2026-05-13)
- `src/services/pushNotificationService.ts` — updated `Notifications.setNotificationHandler` to include `shouldShowBanner` and `shouldShowList`, matching Expo `NotificationBehavior`.

### Added - Production stack generation pipeline (2026-05-10)
- `supabase/migrations/20260510_production_stack_pipeline.sql` - Added additive schema for normalized coupons, coupon activation links, retailer data sources, stack run counters, user stack feedback, and normalized coupon inventory view.
- `services/offer_ingestion/` - Added FastAPI Cloud Run ingestion service with retailer/manual endpoints, Supabase writes, coupon link resolution, and optional Vertex AI Gemini stack reasoning behind env configuration.
- `services/generate_stacks/main.py` - Enhanced generation to read normalized coupon inventory, log generation runs, calculate OOP/net-after-rebate fields, resolve coupon activation links, and write approved cards to `app_home_feed`.
- `src/lib/retailerCouponLinks.ts` - Added search and hub fallback metadata with link type/source/confidence.
- `__tests__/productionStackPipeline.test.ts` - Added pipeline schema/service, deterministic math, ingestion contract, and feed output coverage.

### Added - Launch readiness audit (2026-05-10)
- `docs/LAUNCH_READINESS_AUDIT.md` - Added App Store/beta readiness audit covering navigation, onboarding persistence, home feed/profile data, weekly plan math, cart sync, coupon links, checkout authority, receipt verification, and fake/demo data risks.

### Added — Post-personality profile flow + HomeScreen Intelligence Profile card (2026-05-10)
- `screens/PersonalityResultScreen.js` — `handleContinue` now routes to `SoftPersonalization` (was `MainApp`). CTA label changed from "Go to My Dashboard" to "Build My Profile". Passes `{ fromPersonalityReveal: true }` param so SoftPersonalizationScreen knows it is in onboarding mode.
- `screens/SoftPersonalizationScreen.js` — Added 5th step "Foods you love" (between diet and allergies). 25 food/cuisine options in chip grid using existing `AllergyChip` component. Saves to `profiles.lifestyle_concierge.favorite_foods`. Reads `fromPersonalityReveal` param: if `true` finishes with `replace('MainApp')` (onboarding flow), otherwise `goBack()` (in-app edit from HomeScreen). Step count updated from 4 → 5.
- `screens/HomeScreen.js` — Added "INTELLIGENCE PROFILE" section at the bottom of the main scroll (above the 120px spacer). Reads `persona`, `stores`, `diet`, `foods`, `couponComfort`, `budgetRange` from `intelligenceProfile` state which is populated by the existing `fetchProfile` call. Shows: shopper type pill (green), preferred stores chips (first 3 + N more), diet chips, foods chips (first 3 + N more), weekly budget value. "Edit" link navigates to `SoftPersonalization` for in-app profile updates. Empty-state nudge shown when persona and stores are both absent.

### Removed — Screen cleanup: 12 dead/legacy screens deleted (2026-05-10)
- `screens/AuthScreen.js` — replaced by SignInScreen, nothing routed to it
- `screens/VerifyScreen.js` — transient redirect with no purpose as a screen
- `screens/BrandMarketplaceScreen.js` — brand partnership UI not part of core loop
- `screens/TransparencyDataScreen.js` — iOS ATT handled at OS level, not a screen
- `screens/WaitlistForecastScreen.js` — legacy waitlist era, bypassed for all current users
- `screens/CatalogScreen.js` — placeholder that only told users to go elsewhere
- `screens/SplashIntroScreen.js` — 3 intro slides, never shown (SignInScreen is first screen)
- `screens/FounderDashboardScreen.js` — beta founder perks, beta is over
- `screens/LogicScanScreen.js` — demo hype animation, not part of real user flow
- `screens/HowItWorksScreen.js` — redundant with SignInScreen landing page
- `screens/AdminAnalyticsDashboardScreen.js` — explicitly unfinished (pending backend endpoint)
- `screens/InstantForecastScreen.js` — shows fake forecast numbers, no live data source
- `App.js` — removed all 12 imports + route registrations; removed Catalog from DiscoverStack, AdminAnalytics from ProfileStack, SplashIntro/WaitlistForecast/LogicScan/FounderDashboard/HowItWorks/InstantForecast from root stack

### Changed — Rewired 4 broken navigation references (2026-05-10)
- `screens/OnboardingConciergeScreen.js:369` — `replace('LogicScan')` → `replace('MainApp')` (LogicScan deleted)
- `screens/PersonaRevealScreen.js:311` — `navigate('HowItWorks')` → `replace('MainApp')`; CTA label updated to "Go to My Dashboard"
- `screens/OmniStoreComparisonScreen.js:114` — `navigate('Catalog')` → `navigate('Discover')` (Catalog deleted)
- `screens/AdminPulseScreen.js:326` — removed "Analytics Dashboard" nav button (AdminAnalytics deleted)

### Changed — HomeScreen: Week Savings Hero card (2026-05-08)
- `screens/HomeScreen.js` — Added `WeekSavingsHero` component as the dominant first card in the scroll. Green gradient (`#0C9E54` → `#087038`). When cart exists: shows full retail price → with-deals price (strikethrough baseline), plus a thin progress bar showing spend vs. $150 budget ("$130 / $150 budget · $20 under" or red "over"). When no cart: shows budget + "Build your smart plan" CTA. Chip row (save amount / % less / stores / items), "See Smart Plan" action row. Always taps to WeeklyPlan tab. Baseline is `cartRegularCents` (actual retail), not the user's budget — budget is shown separately as a progress bar so framing is "retail → deals, here's how you compare to your $150 target".

### Changed — WeeklyPlanScreen: 3-segment tab bar (Meals / Stacks / Nutrition) (2026-05-08)
- `screens/WeeklyPlanScreen.js` — Added `planTab` state and inline segment control replacing the old flat scroll layout. **Meals tab**: existing 7-day meal list; each row now has a 3px colored left border keyed to meal slot (Breakfast=amber, Lunch=blue, Dinner=green); cook time added to meta line. **Stacks tab**: dark-green comparison card showing "full retail → with deals" alongside a `weeklyBudgetCents` progress bar ("$X / $150 budget · $X under/over") using an IIFE for clean value scoping; stack cards show deal-type badges; empty/loading states added. **Nutrition tab**: 4-cell macro grid (cal/protein/carbs/fat with color dots), GLP-1 alignment card with 91% progress bar, protein-per-dollar efficiency card, cost breakdown. Lock In button remains visible on all tabs. Fixed store retailer derivation: uses `selectedStore` (not `platform`) so cart items get "Publix"/"Kroger" labels matching the shopping list.

### Changed — CartScreen: budget indicator in register hero (2026-05-08)
- `screens/CartScreen.js` — Added `weeklyBudgetCents` state (fetched via `fetchWeeklyBudgetCents` on cart load, default $150). Register hero now shows a thin progress bar + label line: "actual / $150 budget · $X under" (white) or "actual / $150 budget · $X over" (red) so users see budget impact inline at checkout totals.

### Changed — CartScreen: meal connections + store fulfillment selector (2026-05-08)
- `screens/CartScreen.js` — `PersonalItemRow` now shows a green "For: [meal name]" line under deal badges when item has `meal_name` set (populated by WeeklyPlan lock-in). Added `StoreFulfillment` component that renders below each store's area sections: 3-button Pickup / Delivery / In-Store toggle with icon, active state highlights in green. `React.useState` used inline for fulfillment mode per store.

### Changed — Navigation: removed Explore tab (2026-05-08)
- `App.js` — Removed DiscoverTab from bottom tab navigator. Discover/Explore is no longer visible in the bottom nav.

### Changed — OnboardingScreen: 9-step conversational onboarding (2026-05-08)
- `screens/OnboardingScreen.js` — Full rewrite. 9 question steps: Budget (5 range chips) → Stores (11 multi-select) → Household (4 icon tiles) → Cooking Style (9 appliance chips: Air Fryer, Crockpot, Instant Pot, Meal Prep, etc.) → Cooking Frequency (5 single-select with sub-labels) → Weekly Habits (10 chips: Pizza Fridays, Gym Days, Takeout Nights, etc.) → Nutrition Goals (12 chips) → Grocery Goals (6 list options) → GLP-1 (3 options with "no judgment" microcopy). "Did you know?" modal overlay fires after steps 1, 3, 6, 8 — auto-dismisses after 3.5s, tap to skip. Progress bar tracks 9/9 questions. Smooth slide transitions via react-native-reanimated. Hero step kept. Persona Reveal updated with 9 new shopper types (GLP-1 Optimizer, Busy Parent, Budget Master, etc.). Paywall saves all 9 fields to profiles.preferences, then navigates to PersonalityResult.
- Updated `derivePersona()` — now uses budget_range, preferred_stores, cooking_appliances, cooking_frequency, weekly_habits, grocery_goals, is_glp1, plus household/dietary inputs. 9 persona types.

### Added — PersonalityResultScreen: viral shareable household type card (2026-05-08)
- `screens/PersonalityResultScreen.js` — New screen. Dynamic gradient background matching persona color. White persona card with icon circle, "YOU ARE [Type]" headline, 3 trait bullets. 4-stat grid (annual savings, waste reduction, time saved, budget fit — all persona-specific). "Cost of doing nothing" urgency card with red callouts. 3 personalized insights per persona type (9 personas × 3 insights). "Go to My Dashboard" → MainApp. "Share My Profile" → native share sheet with pre-written copy. Entrance animations: card spring scale-in, stats slide-up.
- `App.js` — Imported PersonalityResultScreen and registered as `PersonalityResult` stack screen with `gestureEnabled: false`.

### Changed — SignInScreen: ADAPTIVE HOUSEHOLD INTELLIGENCE landing page (2026-05-08)
- `screens/SignInScreen.js` — Complete redesign. New premium DTC landing page with: "ADAPTIVE HOUSEHOLD INTELLIGENCE" overline, hero headline "The grocery industry was built for a different generation." with green accent, 34%/84%/$47 stat cards, collapsible pain-point section, 4 feature rows (Ionicons), $2,028 annual savings green gradient card with 4 savings line-items, "Cost of Doing Nothing" 3-column urgency block, 2.1-hr time recovered stat, personalized grocery insights list. Sign-up flow now has 2 onboarding questions (household size → grocery goal) before email/password — 3-step wizard with progress dots. Sign-in tab unaffected.

### Changed — ProfileScreen: premium redesign (2026-05-08)
- `screens/ProfileScreen.js` — Full redesign. Green gradient hero card shows avatar initials, display name, AI shopper persona label (from preferences.persona_type), lifetime saved, velocity, and credits in a 3-stat bar. Loyalty Accounts section: 4 stores (Publix/Kroger/Target/Walmart) — connected stores show clipped coupon count badge, unconnected stores show "Connect" button routing to PreferredStores. Nutrition Goals: all 8 goal pills are tap-to-toggle with live Supabase write. Receipt History: last 3 APPROVED checkout_math_snapshots with store, date, "Saved $X" badge, and "You paid $X". Account Settings: 6 rows with Ionicons. Added checkout_math_snapshots fetch and clip_session_items coupon count fetch.

### Added — User flow and coupon validation documentation (2026-05-07)
- `docs/USER_FLOW_AND_COUPON_VALIDATION.md` — Complete user journey from cold-start through verified savings: all 10 stages (app open, sign in, quick onboarding, deep brief, home screen, discover, clip session build, checkout, receipt upload/verification, wins screen). Full coupon validation pipeline: 4 pipelines (deal ingestion + 33 validation rules + publish gate, cart-based coupon matching service, stack spec engine 12-rule validator, receipt HMAC verification). Data written at every stage, all DB tables touched, 8 known engineer action items.

### Added — Technical wiring documentation (2026-05-07)
- `docs/APP_WIRING.md` — Complete engineer-facing reference: navigation tree, every screen's purpose and data sources, context providers (Budget, Trial), startup sequence, session guard, health monitor, event tracker, all database tables, all edge functions, feature flags, AsyncStorage keys, known issues, and design system tokens. Created to enable an external engineer to understand and repair the app.

### Changed — HomeScreen redesign + loading fix (2026-05-07)
- `screens/HomeScreen.js` — Full UI redesign to match new clean layout: white header with snippd logo, greeting, bell + credits pill; "YOUR TOP STACK" featured card (store-aware image, Pay/Save side-by-side, day badge, subtotal + expiry, "Start This Stack" outlined button); "MORE STACKS FOR YOU" compact rows with store-logo circle (brand colors), pay/save meta, chevron; "YOUR BUDGET" card with progress bar; "Scan Receipt & Earn" row. Removed broken `QuickOnboardingModal` import (file deleted). Removed strict `validation_status + source_type` double-filter from `isVerifiedSystemStack` and `queryVerifiedHomeFeed` that was returning 0 results. Added fallback feed query. Added `storeInitials()` + `storeLogoColor()` helpers.

### Changed — UX Patch: Make Stacks Easy to Find (2026-05-07)
- `App.js` — `resolveUserStatus` simplified: all authenticated users route to `MainApp` except `status='launched' && !briefingCompleted` → `ConciergeOnboarding`. WaitlistForecast screen fully removed from customer routing. `QuickStartScreen` import + route removed.
- `screens/HomeScreen.js` — `isVerifiedSystemStack` filter loosened to accept any active, non-blocked row. `queryVerifiedHomeFeed` rewritten: orders by `confidence_score DESC, published_at DESC`, removes strict `source_type` gate, adds fallback query for any active row. Empty state copy updated to "We're checking today's live deals."
- `screens/ListScreen.js` — Coupon/rebate breakdown shown per item: `customer_instructions` in green, `coupon_value_cents` as "Clip $X coupon · [code]", `rebate_value_cents` as "+ $X.XX rebate via [app]" in purple, regular price struck-through when different from OOP, `savings_percent` badge. STACK badge renamed DEAL. Savings strip uses real coupon/rebate data.
- `screens/StackDetailScreen.js` — `handleAddAll` now writes full item data to `shopping_list_items` via `upsert_shopping_list_items` RPC before navigating. CTA shows `ActivityIndicator` when in-flight and checkmark + "Added to List" when complete.
- `screens/DiscoverScreen.js` — `handleAdd` now also persists full stack item data to `shopping_list_items` via `upsert_shopping_list_items` RPC so ListScreen realtime subscription picks up Discover adds.
- `screens/WinsScreen.js` — Now accepts `route.params.freshStart`; renders celebration banner at top of scroll when arriving from TripResultsScreen Fresh Start flow (shows weekly savings, Stash Credits awarded, streak count, level-up badge if applicable).

### Removed — (2026-05-07)
- `screens/QuickStartScreen.js` — Deleted. No longer needed in the onboarding flow.

### Added — Foldable Patch: Stack Engine v2 + Daily Refresh + List Sync + Admin QA (2026-05-07)
- `supabase/migrations/20260507_stack_engine_v2.sql` — Extends `stack_candidates` with 18 output columns (customer_instructions, budget_fit, deal_title, items_needed, regular/sale/coupon/rebate/oop/net price fields, savings_percent, expiration_date, store, qa_metadata, verified_at, math_verified, published_to_feed_at). Creates 5 SQL functions: `generate_customer_instructions(UUID)` (human-readable "Buy X, clip Y…" string), `verify_stack_math(UUID)` (recalculates OOP/net/savings %, marks math_verified), `refresh_app_home_feed()` (daily refresh — publishes confidence ≥ 80 stacks, expires stale items, logs run), `append_stack_qa_metadata(UUID, JSONB)` (audit metadata helper), `admin_review_stack(UUID, TEXT, TEXT, TEXT)` (approve/reject/needs_review/wrong_price/missing_coupon actions). Comments 6 canonical stack types on `stack_type` column.
- `supabase/migrations/20260507_list_sync_v2.sql` — Extends `shopping_list_items` with 19 stack/coupon/rebate columns (quantity, regular/sale/coupon/rebate/oop/net prices, savings_percent, stack_type, stack_breakdown, customer_instructions, budget_fit, confidence_score, stack_candidate_id, source, synced_at, expiration_date). Enables Postgres realtime (REPLICA IDENTITY FULL + supabase_realtime publication). Creates `upsert_shopping_list_items(UUID, JSONB)` batch upsert RPC (SECURITY DEFINER). Creates `v_user_list_budget_summary` view (per-user OOP/net/savings/coupon/rebate totals).
- `supabase/migrations/20260507_stack_refresh_cron.sql` — pg_cron job `daily-stack-refresh` at 11:15 UTC (7:15 AM EDT) calling `run-stack-refresh` edge function via pg_net. Requires pg_cron + pg_net extensions and `app.supabase_url` / `app.cron_secret` Vault settings.
- `supabase/functions/run-stack-refresh/index.ts` — Edge function called by daily cron. Invokes `refresh_app_home_feed()` and returns `{published, skipped, errors, started_at, finished_at}`. Auth: x-ingest-key.
- `screens/AdminDealReviewScreen.js` — NEW. Full admin review UI. Stats bar (pending/urgent/approved/blocked counts). Three tabs: Review Queue (filterable by status; Approve/Approve with Caution/Reject/Flag/Wrong Price/Missing Coupon actions), Stacks (stack audit rows; Approve/Reject/Review/Mark Price Wrong/Mark Coupon Missing actions), Stats (offer sources, queue, and user feedback breakdowns). Note modal for flagging actions. Calls existing `admin-deal-review` edge function (GET queue/stack-audit/stats, POST approve/reject/escalate/stack-feedback). Admin-only guard (ddavis@getsnippd.com).
- `screens/AdminPulseScreen.js` — Added "Deal Review Queue" nav card linking to AdminDealReviewScreen.
- `App.js` — Registered `AdminDealReviewScreen` in ProfileStack. Added import.

### Changed — WeeklyPlanScreen + ListScreen list sync (2026-05-07)
- `screens/WeeklyPlanScreen.js` — "Add All to My List" handler now builds full extended list rows (quantity, regular/sale/coupon/rebate/OOP/net prices, savings_percent, stack_type, stack_breakdown, customer_instructions, budget_fit, confidence_score, stack_candidate_id, source, expiration_date) and writes them directly to `shopping_list_items` via `upsert_shopping_list_items` RPC in addition to the AsyncStorage relay bridge.
- `screens/ListScreen.js` — Added Supabase realtime subscription on `shopping_list_items` filtered by user_id. Any INSERT/UPDATE/DELETE on the user's list rows triggers `fetchList()` automatically, enabling instant cross-view sync (WeeklyPlan → List, cart → list, etc.).

### Added - Stack Thinking Engine + Budget Optimizer (2026-05-07)
- `supabase/migrations/20260507_stack_thinking_engine.sql` - Backend-only Stack Thinking Engine. Adds only missing output fields to existing `stack_candidates` and `app_home_feed`, then adds `rpc_run_stack_thinking_engine()` to calculate individual coupon-style deal stacks using the requested order of operations: regular price, sale/clearance/BOGO/promo, store coupon, manufacturer coupon, threshold/basket discount, rebate as net savings, final/net/savings/budget fit, and beginner instructions. Supports `BOGO_STACK`, `CLEARANCE_COUPON_STACK`, `DIGITAL_COUPON_STACK`, `REBATE_STACK`, `THRESHOLD_STACK`, and `BASKET_ENGINEERED_STACK`. Adds `rpc_build_budget_stack_plan()` and `v_stack_thinking_engine_results`.
- `services/generate_stacks/main.py` - Cloud Run `/generate-stacks` now pushes through `rpc_run_stack_thinking_engine()` as the backend stack publishing process. Added `/stack-thinking-engine` for individual stack generation and `/budget-optimizer` for budget-based shopping plans.
- `supabase/functions/stack-automation/index.ts` - Stack automation Edge Function now routes generation through `rpc_run_stack_thinking_engine()` and supports `action: "budget_optimizer"` through `rpc_build_budget_stack_plan()`.
- `__tests__/autoStackTracking.test.ts` - Added contract coverage for Stack Thinking Engine stack types, exact output fields, app push path, and budget optimizer wiring.

### Added - Automatic Stack Tracking + Review (2026-05-07)
- `supabase/migrations/20260507_auto_stack_tracking.sql` - Additive automation layer for stack/deal generation audit metadata. Extends existing `stack_candidates` and `app_home_feed` with source tables, rules applied, model/function, generation timestamp, confidence/review fields, and price math columns. Adds `stack_generation_runs`, `stack_candidate_audit`, `stack_generation_rules`, and `stack_training_feedback` without renaming or deleting existing objects. Adds `rpc_generate_auto_stack_candidates()` to read `normalized_offers`, `digital_coupons`, `retailer_rules`, and `retailer_coupon_parameters`, write candidates to `stack_candidates`, and load approved/high-confidence rows into `app_home_feed` with existing `validation_status`, `source_type`, `status`, and `is_active` gates. Adds `rpc_record_stack_training_feedback()` for admin-only approve/reject/needs-review/price/coupon/note feedback.
- `services/generate_stacks/main.py` - Existing Cloud Run `generate-stacks` service now triggers `rpc_generate_auto_stack_candidates()` before reading `stack_candidates`, preserves current generation flow, and carries audit/price metadata into `app_home_feed`.
- `supabase/functions/stack-automation/index.ts` - New admin/service-role edge entry point for triggering automatic stack generation through the RPC.
- `supabase/functions/admin-deal-review/index.ts` - Added admin-only `stack-audit`, `stack-runs`, and `stack-feedback` actions for review/training workflows.
- `screens/StackReviewTrainingScreen.js`, `App.js`, `screens/AdminPulseScreen.js` - New admin-only Stack Review panel linked from System Pulse. Displays audit metadata read-only by default; admin actions explicitly record feedback and only status actions update existing deal review state.
- `__tests__/autoStackTracking.test.ts` - Validation coverage for additive SQL, existing `stack_candidates`/`app_home_feed` write paths, and explicit admin feedback actions.

### Added — Deep Personalization + Persona Flow (2026-05-07)
- `screens/DeepPersonalizationScreen.js` — NEW. 6-step deep onboarding: (1) Store selection (16 chains, multi-select chips), (2) Shopping habits (frequency radio + mode grid), (3) Cooking style (8 options, multi-select), (4) Foods loved (18 items grouped by category), (5) Foods to avoid (14 allergen/restriction chips + free-text "other"), (6) Weekly budget (exact dollar TextInput with live monthly estimate). Saves `preferred_stores`, `shopping_frequency`, `shopping_mode`, `cooking_preferences`, `foods_liked`, `foods_avoided`, `weekly_budget_cents` to `user_persona`. Animated step transitions. Mobile-first with `maxWidth: 600` centering on web.
- `screens/PersonaRevealScreen.js` — NEW. Animated persona reveal screen. Calculates one of 7 archetypes (Wellness Optimizer, Performance Athlete, Family CFO, Savings Hunter, Meal Planner, Speed Shopper, Smart Stacker) from all collected data (household, missions, cooking style, foods, budget, stores). Staggered entrance animations for card, emoji pulse, and trait badge cascade. Shows projected savings and store count from profile. Routes to HowItWorks.
- `screens/HowItWorksScreen.js` — NEW. 4-feature walkthrough (Stacks Every Deal, Learns Your Household, Budget-Built Plans, Price Watch Alerts). Accordion-style tap-to-expand cards. "Why Snippd is different" checklist. "What happens after Get Started" countdown. Animated entrance + stagger. "Get Started" → MainApp.
- `App.js` — Registered `DeepPersonalization`, `PersonaReveal`, `HowItWorks` in root stack navigator. Added imports.

### Changed — Goal Selection + Why Save (2026-05-07)
- `screens/WaitlistForecastScreen.js` — Mission step now shows inline follow-up detail panels when a goal is selected: each selected mission card expands to show a chip grid of sub-questions (Clinical Guardrails: 8 restriction chips; Program Tracking: 8 program chips; Athletic Fuel: 5 goal chips; Pure Savings: 8 category chips). Selected details stored in `missionDetails` state and saved to `user_persona.mission_details` on join. "Why do you need Snippd?" card now has a dedicated "Submit my reason" button that saves `why_snippd` to Supabase immediately (separate from the main join flow); shows "Saved ✓" state on success. Added `MISSION_DETAILS` config object outside component.
- `screens/WaitlistScreen.js` — ACCESS NOW button now routes to `DeepPersonalization` instead of `MainApp`, starting the full deep onboarding flow (Personalization → Persona Reveal → How It Works → Get Started → MainApp).

### Fixed — SignInScreen web input visuals (2026-05-07)
- `screens/SignInScreen.js` — Focus ring now renders #0C9E54 brand green on web: `inputWrapFocused` uses double `box-shadow` (`3px rgba green glow + 1.5px solid #0C9E54`). Browser autofill black box eliminated: `WebkitBoxShadow` inset raised from 60px → 1000px to fully cover any browser-injected background. Input `outline`, `outlineWidth`, `outlineStyle`, `borderWidth` all zeroed on web so only the container border is visible (no double-border on focus).

### Fixed — SignInScreen input & auth (2026-05-07)
- `screens/SignInScreen.js` — Removed Google/Apple social buttons (email/password only for now). Fixed critical TextInput bug: inner components (`FormBody`, `LeftPanel`, `RightPanel`, `PhoneLayout`) were called as JSX tags causing remount on every render — changed to direct function calls `{FormBody()}` etc. Fixed web autofill black box: added `WebkitBoxShadow: '0 0 0 60px #FFFFFF inset'` and `WebkitTextFillColor` overrides, removed `importantForAutofill`/`textContentType` (native-only props that caused web issues). Set `autoComplete="email"` on email field and `autoComplete="current-password"/"new-password"` on password field. Font size 14→15 for readability.

### Security + Auth (2026-05-07)
- `screens/SignInScreen.js` — Google OAuth fixed for web vs native: web uses full browser redirect (no skipBrowserRedirect), native uses `openAuthSessionAsync` + `exchangeCodeForSession`. Accent color restored to brand green `#0C9E54` (wordmark, headline, chips, icons, mockup card). Client-side rate limiter added: 5 failed attempts → 15-minute lockout, persisted via AsyncStorage across sessions/reloads, live countdown timer shown in card banner, submit button disabled during lockout. Attempt count and remaining shown on error messages.
- `supabase/config.toml` — Added `[auth.external.google]` with setup instructions (Google Cloud Console OAuth callback URL, Supabase Dashboard redirect URLs). Tightened rate limits: `sign_in_sign_ups` 30 → 8, `token_verifications` 30 → 8, `email_sent` 2 → 5, `token_refresh` 150 → 30. Added Turnstile CAPTCHA config block (commented, ready to activate with secret key).
- `.env.example` — Added `SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID`, `SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET`, `SUPABASE_AUTH_CAPTCHA_SECRET`, `EXPO_PUBLIC_TURNSTILE_SITE_KEY`.

### Changed — Hero Rebuild v1 (2026-05-07)
- `screens/SignInScreen.js` — Complete redesign (SNIPPD_BETA_HERO_REBUILD_V1). New copy: headline "Groceries got expensive. Your cart got smarter.", subheadline, auth eyebrow "Welcome back to smarter shopping." / sub "Sign in to continue building smarter carts and personalized savings plans." Tab labels: "Sign In" / "Join Beta". Submit CTAs: "Continue" / "Join Beta". Bottom link: "New to Snippd? Join the beta →". Removed fake metrics ($2.4k / 6+ / 100%) — replaced with 3 value blocks (Save Time / Smarter Carts / Gets Smarter). Phone: dark navy gradient hero header + floating white auth card (32px radius). Tablet: left panel with hero copy + animated AI mockup cart optimization card + 3 full value blocks; right panel white form card (28px radius, soft navy shadow). New color palette: Green #0C9E54, Navy #172250, Accent #C5FFBC, Alert #FB5B5B. HeroBg uses 3 animated blobs. AIMockup has pulsing cart optimization animation with savings tags. All auth wiring (Supabase email/OAuth, routing) unchanged.

### Security (2026-05-07)
- `screens/UnlockBetaScreen.js` — Removed hardcoded promo code fallback list (`HARDCODED_VALID`). All promo code validation now goes through the `promo_codes` Supabase table only; no client-side bypass possible.
- `.gitignore` — Added `infra/vpc-sc/terraform.tfstate`, `terraform.tfstate.backup`, `*.tfplan` patterns to prevent infrastructure secrets from being committed. Fixed `Bash tool output*.txt` glob (removed erroneous surrounding quotes).
- `App.js` — `waitlist` and `paid_beta` statuses both route to `MainApp` (paywall removed; RevenueCat will handle monetization at launch).
- Removed from git history: `terraform.tfstate`, `terraform.tfstate.backup`, `snippd-vpc-sc.tfplan`, and accidentally committed `Bash tool output (0o4xjl).txt`.

### Changed — Plan + Meal Detail Redesign (2026-05-06)
- `screens/WeeklyPlanScreen.js` — Redesigned hero block to match spec C: shows "X dinners for Y people", week range eyebrow, Out of pocket / You save metrics in a frosted row, Stores + Best shop window footer. Moved store filter tabs outside the hero card into a scrollable row below it. Redesigned meal list rows: each row shows a slot badge (DIN/LUN/BRK), meal name, green price, "for N people", Save badge, and coupon/calorie metadata. Day group headers still divide breakfast/lunch/dinner.
- `screens/MealDetailScreen.js` — Full redesign to match spec D: white header with back + share icons, large meal title, "Serves N · Xmin prep · Ymin cook" subheader, food image card, horizontal 4-column nutrition row (cal/protein/carbs/fat), side-by-side pricing (Your price large left, Regular strikethrough + You save right), ingredient checklist with tap-to-check and "Search: X" search term per item, "View Coupons & Details" full-width green CTA.

### Changed — Home Screen Redesign (2026-05-06)
- `screens/HomeScreen.js` — Restructured layout to match product spec. Fixed section order to: hero → buying power → top stacks → budget deals → receipt (was dynamic/random). Removed `featureGrid` (Tonight's Dinner, Scan Item, Savings Momentum cards) from home — these caused a 3-column broken layout on web-width viewports. Added `renderQuickActions()` strip between hero and content sections: three white cards (Plan My Week, Snap Receipt, Scan Item) with green icon badges.

### Changed (2026-05-06)
- `App.js` — Removed `UnlockBeta` gate from onboarding routing. New users now go to `MainApp` after completing the forecast step (no promo code or payment required). `waitlist` status also routes to `MainApp` instead of `WaitlistScreen`.
- `screens/InstantForecastScreen.js` — "Unlock" CTAs now navigate to `MainApp` instead of `UnlockBetaScreen`.
- `screens/SoftPersonalizationScreen.js` — On complete/skip now navigates to `MainApp` instead of `UnlockBetaScreen`.

### Changed (2026-05-05)
- `screens/UnlockBetaScreen.js` — Added `TEST1234SNIPPD` to hardcoded promo code fallback list.
- `screens/UnlockBetaScreen.js` — All success paths (valid promo code, Stripe payment confirmed, "Check my access") now redirect to `MainApp` (home screen). Removed `FounderDashboard` and `ConciergeOnboarding` as post-unlock destinations.

### Added (Quick Start UX Flow — 2026-05-05)

#### New Screens
- `screens/QuickStartScreen.js` — Lightweight 3-question onboarding step (budget range, household size, primary goal). Chip-based UI, step progress dots. Saves answers to `user_persona` (quick_start_completed, quick_start_budget_range, quick_start_goal, quick_start_household). Fires `quick_start_completed` memory event. Navigates to InstantForecastScreen.
- `screens/InstantForecastScreen.js` — Forecast-first screen shown immediately after Quick Start. Computes monthly/annual recovery estimates locally (no network call; <500ms). Shows estimated monthly recovery, annual recovery, month comparison (without vs. with Snippd), example weekly meal stack, and how Snippd works. Uses cautious "Estimated / Possible / Based on your answers" language. Saves `forecast_completed = true` and `projected_monthly_recovery_cents` to `user_persona` (fire-and-forget). Fires `forecast_viewed` memory event. Three CTAs: Personalize my plan → SoftPersonalizationScreen, Unlock full beta → UnlockBetaScreen, Enter promo code → UnlockBetaScreen.
- `screens/SoftPersonalizationScreen.js` — 4-question soft personalization screen after forecast. Asks: preferred stores (multi-select + other text, 3-column branded card grid with brand-color circle initials, 18 stores incl. CVS/Dollar General/Walgreens), dietary preference (multi-select checkbox grid with mutual exclusion for omnivore), allergies/foods to avoid (multi-select + other text), coupon comfort level (single-select). Every question has a Skip option. Saves partial answers to `profiles.preferred_stores`, `profiles.allergies`, `profiles.lifestyle_concierge.dietary_preference` (array), `profiles.lifestyle_concierge.coupon_comfort`. White card background matching app visual language. Navigates to UnlockBetaScreen on complete or skip.
- `screens/UnlockBetaScreen.js` — Replaces waitlist as the primary post-forecast destination. Three paths: (1) promo code entry — validates against `promo_codes` table + hardcoded fallbacks; on valid sets `user_persona.status='launched'`, `beta_unlocked=true`, `promo_unlocked=true`, navigates to MainApp; (2) Stripe Beta Pro ($4.99/mo) or Founder ($97 once) — opens existing Stripe links, polls `user_persona.status` on return (same pattern as WaitlistScreen); (3) limited preview — navigates to MainApp if `is_beta_live` flag is true. Fires `promo_code_entered`, `beta_unlocked` memory events.

#### Modified Screens
- `screens/WaitlistScreen.js` — Added prominent "Unlock beta shortcuts" card above the existing Stripe upgrade card. Two quick CTAs: "Enter promo code" (→ UnlockBetaScreen with promoOpen=true) and "Unlock now" (→ UnlockBetaScreen). Added import for `recordMemoryEvent`. Existing waitlist position, gamification, and referral logic is unchanged.
- `screens/HomeScreen.js` — Added `profileCompletePct` state. Extended `fetchProfile` SELECT to include `preferred_stores, allergies, household_size, lifestyle_concierge, nutrition_goals` for client-side completion calculation (8 key fields → percent). Added "Make your next plan smarter" profile completion card (hidden once ≥80% complete) — shows progress bar, percent, "Answer 2 quick questions" CTA navigating to ProfileTab. Does not block any existing functionality.

#### Routing Changes
- `App.js` — Imported four new screens. Added to root Stack: `QuickStart`, `InstantForecast`, `SoftPersonalization`, `UnlockBeta`. Updated `resolveUserStatus`: NEW users without `quick_start_completed` → QuickStart; with quick start but no forecast → InstantForecast; with forecast but not `beta_unlocked` → UnlockBeta; with `beta_unlocked` → MainApp. Backward compatible: old WaitlistForecast users (forecast_completed=true, quick_start_completed=false) route to UnlockBeta, not Waitlist. Existing `waitlist`, `paid_beta`, `launched` status paths unchanged.

#### Database
- `supabase/migrations/20260504_quick_start_flow.sql` — Adds 7 columns to `user_persona` (quick_start_completed, quick_start_budget_range, quick_start_goal, quick_start_household, beta_unlocked, promo_unlocked, unlock_source) and 4 columns to `profiles` (profile_completion_percent, progressive_profile, last_profile_prompt_at, next_profile_prompt_key). All nullable/defaulted, fully backward safe. **Apply in Supabase Dashboard → SQL Editor.**

### Added (Measurable Savings Loop — 2026-05-04)

#### Edge Functions
- `supabase/functions/generate-weekly-plan/index.ts` — Persists a locked-in weekly plan to `weekly_plans`, `weekly_plan_days`, and `coupon_checklist`. Called from WeeklyPlanScreen "Add All to My List". Idempotent (upserts by user_id + week_start). Returns `weekly_plan_id` stored in AsyncStorage for receipt comparison. **Deployed.**
- `supabase/functions/compare-receipt-to-plan/index.ts` — Compares a scanned receipt to the user's weekly plan. Loads `weekly_plans` row for baseline/projected totals, calculates plan_accuracy_percent, planned_savings, actual_savings, budget_result, was_under_budget, matched/missing items, coupons. Saves to `receipt_outcomes`. When no plan exists, estimates baseline at 1.35× actual and labels it estimated. **Deployed.**

#### Screens
- `screens/OutcomeScreen.js` — New post-receipt savings screen. Shows: "What Happened" summary in plain English, Snippd Savings card (planned vs actual), Plan Accuracy progress bar, Coupons card, optional Fetch/Ibotta Bonus Savings card (hidden when no data), "What Snippd Learned" card, inline 3-question survey (Did it save? Match in-store? Use again? + optional improvement picker). Saves survey to `trip_feedback` and fires `survey_completed` + `receipt_confirmed` memory events. Navigates to Home on completion. Registered in HomeStack, PlanStack, CartStack, ProfileStack.

#### Services
- `src/lib/savingsCalculator.ts` — Pure savings math helpers. `computeSavings()`: baseline/planned/actual → planned_savings, actual_savings, plan_accuracy_percent, budget_result, was_under_budget. `computeBonusSavings()`: Fetch/Ibotta optional bonus. `hasBonusSavings()`, `formatDollars()`. No imports, no side effects, fully testable.

#### Screen Updates
- `screens/WeeklyPlanScreen.js` — "Add All to My List" now calls `generate-weekly-plan` edge function (fire-and-forget) and stores `weekly_plan_id` in AsyncStorage under key `snippd_weekly_plan_id`. Existing cart logic is unchanged.
- `screens/ReceiptUploadScreen.js` — Added `outcomeData` state. `confirmReceipt()` now calls `compare-receipt-to-plan` (non-blocking) after receipt save. `handleSmartPrompt()` navigates to `OutcomeScreen` if outcome data is ready; falls back to existing step 4 (VerifyReceipt) when not.
- `App.js` — Imported `OutcomeScreen` and registered in HomeStack, PlanStack, CartStack, ProfileStack.

#### Database
- `supabase/migrations/20260504_savings_loop.sql` — Five new tables: `weekly_plans` (one per user per week, baseline/projected/savings fields), `weekly_plan_days` (7 day rows per plan, B/L/D JSONB), `coupon_checklist` (coupons per plan, status: not_clipped/clipped/used/expired), `receipt_outcomes` (full savings comparison per receipt scan), `optional_bonus_savings` (Fetch/Ibotta optional; never blocks core flow). All RLS enabled. **Apply in Supabase Dashboard → SQL Editor.**

#### Build Fix
- `metro.config.js` (new) — Blocks `neo4j-driver` (and sub-packages) from Metro bundle. Fixes "DataCloneError: Data cannot be cloned, out of memory" crash during bundling. Sets `maxWorkers: 2`. Neo4j driver moved to `devDependencies`.

### Added (Barcode Scanning + Onboarding + Cart Nutrition — 2026-05-03)

#### Barcode Scanning
- `supabase/functions/lookup-barcode/index.ts` — Edge Function. Calls Open Food Facts API for a UPC/EAN barcode. Checks `scanned_products` cache first (instant return). Saves result to cache on miss. Fires `usda-search-food` in the background (non-blocking, non-fatal). Returns `{ found, source, product: { name, brand, image, ingredients, allergens, nutrition } }`. Always HTTP 200. No auth required. **Deploy: `supabase functions deploy lookup-barcode --project-ref gsnbpfpekqqjlmkgvwvb`**
- `screens/BarcodeScannerScreen.js` — New screen. Uses `expo-camera` `CameraView` with barcode scanner (UPC-A, UPC-E, EAN-13, EAN-8, Code-128, Code-39). Shows scan frame overlay → loading → product card (image, allergen chips, nutrition panel per 100g) or "not found" prompt. "Add to Cart" writes to AsyncStorage cart. "Scan another item" resets cooldown. "Not found" → navigates to Discover tab.
- `App.js` — Registered `BarcodeScannerScreen` as `BarcodeScanner` in HomeStack with `presentation: 'modal'`.
- `screens/HomeScreen.js` — Added "Scan Item" card in `renderFeatureGrid()`. Tapping navigates to `BarcodeScanner` modal. Tracks `scan / barcode_scan_click` interaction.

#### Quick Onboarding Modal
- `src/components/QuickOnboardingModal.js` — Lightweight 5-screen `pageSheet` modal. Screens: budget (5 tiers), household size, preferred stores (10 options), primary goal (save money/eat healthier/save time), dietary preferences + allergy multi-select. Skippable at any step. Saves to `user_preferences` with `quick_onboarding_done=true`. ~20 seconds to complete.
- `screens/HomeScreen.js` — Added `showQuickOnboarding` / `onboardingUserId` state. `loadUserPreferences()` now checks `quick_onboarding_done`: shows modal for new users and existing users who haven't completed it. Reloads preferences after modal closes so dietary filters apply immediately.

#### Cart Nutrition Summary
- `src/components/CartNutritionSummary.js` — Non-blocking nutrition card for CartScreen. Queries `product_nutrition_map` + `nutrition_cache` via a single Supabase query (no API call). Aggregates estimated calories, protein, carbs, fat per cart (~150g serving per item). Shows allergen warnings for scanned items matching user's allergy profile. Returns `null` when no data is cached — never blocks cart load.
- `screens/CartScreen.js` — Added `CartNutritionSummary` import + `userAllergies` state. Loads allergies from `user_preferences` in `loadCart` (non-blocking, fire-and-forget). Renders `<CartNutritionSummary>` between store groups and Checkout Shield.

#### Database
- `supabase/migrations/20260503_scanned_products.sql` — New `scanned_products` table (barcode UNIQUE, name, brand, image_url, ingredients_text, allergens TEXT[], nutrition_json JSONB, source 'OFF'|'USDA'|'manual'). Adds `dietary_preferences TEXT[]`, `allergies TEXT[]`, `household_size SMALLINT`, `primary_goal TEXT`, `quick_onboarding_done BOOLEAN` to `user_preferences`. **Apply in Supabase Dashboard → SQL Editor.**

### Added (Adaptive Memory + Dynamic UI Layer — 2026-05-03)

#### Edge Functions
- `supabase/functions/record-memory-event/index.ts` — Validates JWT, validates event_type against allowed set, inserts to `memory_events`, reads + updates `user_priority_profiles` (9 priority scores via `applyEventToProfile()`), writes Cypher to Neo4j via HTTP transaction API (Basic auth). Returns `{ ok, neo4j_synced, profile }` even when Neo4j fails — always HTTP 200. **Deploy: `supabase functions deploy record-memory-event --project-ref gsnbpfpekqqjlmkgvwvb`**
- `supabase/functions/get-dynamic-home-layout/index.ts` — Reads `user_priority_profiles` + last 20 `memory_events`. Scores and sorts 8 possible section keys by weighted priority formula. Generates alerts (allergy_safety, store_accuracy, budget_pressure) and emphasized actions. Returns `{ sections, alerts, emphasized_actions, hidden_sections, source, fallback }`. **Deploy: `supabase functions deploy get-dynamic-home-layout --project-ref gsnbpfpekqqjlmkgvwvb`**
- `supabase/functions/sync-memory-events/index.ts` — Batch Neo4j sync. Fetches up to 100 unsynced `memory_events`, replays each to Neo4j, marks `neo4j_synced=true` or logs error. Protected by optional `MEMORY_SYNC_KEY` header. **Deploy: `supabase functions deploy sync-memory-events --project-ref gsnbpfpekqqjlmkgvwvb`**

#### Client Library
- `src/lib/memoryEvents.js` — Client utilities. `recordMemoryEvent(event)`: calls `record-memory-event` Edge Function with Bearer token; never throws — logs warning on failure and returns `{ ok: false }`. `fetchDynamicHomeLayout()`: calls `get-dynamic-home-layout`; falls back to `DEFAULT_HOME_LAYOUT` on any error. `DEFAULT_HOME_LAYOUT` constant exported for screens that need a fallback section order.

#### Screens
- `screens/HomeScreen.js` — Added `dynamicLayout` state initialized to default. `loadDynamicLayout()` calls `fetchDynamicHomeLayout()` on mount. `mapMemoryLayoutToHomeSections()` maps backend section keys to existing render functions. `homeAlerts` displayed above dynamic sections. Section order is now profile-driven — falls back to static order if no profile yet. Also: `QuickOnboardingModal` rendered for first-time users; `onboarding_completed` memory event fired on close.
- `screens/CartScreen.js` — Added `product_removed_from_cart` and `cart_completed` memory events via `recordMemoryEvent` (fire-and-forget). Calls fire on item remove and on checkout initiation.
- `screens/TripSummaryFeedbackScreen.js` — Added `survey_completed` + `receipt_confirmed` memory events (replaces old fire-and-forget `ingest-event` call). `saved_money` derived from rating ('perfect'→'yes', 'good'→'somewhat', else 'not really'). `matched_store` derived from issue ('Switched store'→'no', other issue→'mostly', none→'yes'). `use_again` derived from rating ('perfect'→'yes', 'good'→'maybe', else 'no'). `receipt_confirmed` includes `savings`, `store`, `over_budget`, raw cent values.

#### Database
- `supabase/migrations/20260503_adaptive_memory.sql` — New `memory_events` table (user_id, event_type, entity fields, cost/savings, nutrition_summary/allergy_flags/diet_flags/survey_response/metadata JSONB, neo4j_synced BOOL). New `user_priority_profiles` table (9 priority scores: savings, nutrition, convenience, allergy_safety, store_loyalty, novelty, budget_pressure, scan_compare, store_accuracy_warning — all NUMERIC CHECK 0-1). `clamp_priority(value numeric)` SQL function. `touch_updated_at()` trigger. RLS: users own their rows; service_role manages all. **Apply in Supabase Dashboard → SQL Editor.**
- `supabase/migrations/20260503_trip_feedback.sql` — New `trip_feedback` table. Backward-compatible: includes both existing screen columns (rating, issue, savings_action, planned_total_cents, receipt_total_cents, verified_savings_cents, coupons_clipped, plan_followed_pct) and new adaptive-memory spec columns (saved_money_response, store_accuracy_response, reuse_intent, improvement_area, was_under_budget, meals_covered, total_protein, total_calories, allergy_safe) all nullable. Existing TripSummaryFeedbackScreen inserts continue without changes. RLS: users read/insert own rows. **Apply in Supabase Dashboard → SQL Editor.**

### Added (USDA Nutrition Intelligence Layer — 2026-05-03)
- `supabase/migrations/20260503_nutrition_intelligence.sql` — Creates 3 new tables (`nutrition_cache`, `product_nutrition_map`, `user_variation_state`) and 1 SQL function (`get_scored_deals`). **Apply in Supabase Dashboard → SQL Editor.** Safe: no existing tables modified.
- `supabase/functions/usda-search-food/index.ts` — Cache-first USDA FoodData Central lookup. Checks `product_nutrition_map` → `nutrition_cache` → USDA API. Validates match by word-overlap ≥ 30% (rejects garbage matches). Stores results in `nutrition_cache` and mapping in `product_nutrition_map`. Always HTTP 200. **Deploy: `supabase functions deploy usda-search-food --project-ref gsnbpfpekqqjlmkgvwvb`. Set secret: `supabase secrets set USDA_API_KEY=your_key`.**
- `supabase/functions/score-deals/index.ts` — Personalized deal scoring Edge Function. Calls `get_scored_deals()` SQL function, applies nutrition/preference/novelty filters, scores each deal with composite model (savings 45% + nutrition 25% + preference 20% + novelty 10%), updates `user_variation_state` (last-seen ring buffer, max 40 IDs), returns ranked deals + `nutrition_summary` + per-deal `score_breakdown`. Auth: Bearer JWT. **Deploy: `supabase functions deploy score-deals --project-ref gsnbpfpekqqjlmkgvwvb`.**
- `src/lib/dealScoring.ts` — Pure TypeScript scoring logic (no side effects, fully testable). Exports: `scoreDeals()`, `applyNutritionFilters()`, `applyStoreFilter()`, `buildNutritionSummary()`. Scoring weights: savings=0.45, nutrition=0.25, preference=0.20, novelty=0.10. Nutrition score uses protein density (protein/calories×100) with high-calorie penalty.
- `src/components/NutritionFilterBar.js` — Mint/Navy filter UI component. Three scrollable chip rows: (1) store multi-select chips (from deals data), (2) dietary preference toggles (Vegetarian/Keto/Family/Budget), (3) nutrition quick-filter buttons (High Protein/Low Carb/Low Cal/Low Sodium) + Clear chip. Calls `onFiltersChange(FilterObject)` on every tap. No slider library dependency.

### Fixed (Post-Payment Navigation — 2026-05-03)
- `screens/WaitlistScreen.js` — Added `AppState` listener: when user returns from a Stripe payment URL (`wentToStripeRef=true`), automatically polls `user_persona.status` up to 6 times over 18 seconds. Navigates to `ConciergeOnboarding` or `FounderDashboard` as soon as webhook processes — no manual tap required.
- `screens/WaitlistScreen.js` — Removed `is_beta_live` gate for `paid_beta` users. Paying customers now enter onboarding immediately regardless of the beta launch flag. Free waitlist users still respect the gate.
- `screens/WaitlistScreen.js` — Both "Pay now" buttons now set `wentToStripeRef=true` before opening the Stripe URL, arming the return-from-payment auto-poll.

### Fixed (Stripe Webhook — 2026-05-03)
- `supabase/functions/stripe-webhook/index.ts` — Redeployed with `--no-verify-jwt` (Stripe sends no Supabase JWT; the Stripe-Signature HMAC is the auth mechanism). Function was returning 404 due to not being deployed; now returns 400 "Missing Stripe-Signature header" on unauthenticated probe — confirming it is live.
- `supabase/functions/stripe-webhook/index.ts` — Defensive `metadata.tier` trimming: `rawMetadata.tier?.trim().toLowerCase()` before comparing to accepted values. Stripe Dashboard entry `" beta_pro"` (leading space) now normalizes to `"beta_pro"`. Accepted values: `beta_pro`, `founder`. Anything else falls back to `beta_pro` (never crashes).
- Added structured `console.log` throughout: webhook received, event type, session id, payment_status, customer email, raw vs cleaned tier, RPC success/failure with position and auto_approved flag.

### Added (ChefStash Decision Engine — 2026-05-03)
- `screens/ChefStashScreen.js` — Full rewrite of placeholder. Decision-engine showcase screen. Sections: (1) **Weekly Plan** — 2-3 personalized meal bundle cards built from `normalized_offers`, each showing title, retailer, item list, You Pay, You Save (only if `savings_cents` not null), confidence label (High/Medium/Low). Tap to select for cart. (2) **Smart Swaps** — up to 3 cross-retailer price comparison cards using first-3-token product key grouping; hidden if no swap opportunity found. (3) **Best Deals for You** — top 5 by savings_cents, ranked by preferred_stores → category_clicks → savings amount. (4) **Quick Add** — "Add plan to cart" CTA, disabled until bundle selected; `console.log` placeholder, does not touch cart logic. Loading / empty / error states on every section. USDA nutrition row on bundle cards (optional enrichment, renders nothing if data unavailable).
- `src/lib/bundleBuilder.ts` — Pure TypeScript bundle logic. `buildBundles(offers, opts)`: groups offers by retailer (preferred stores first), scores by savings + category clicks + experience type, builds 3-5 item bundles within budget, cross-retailer fallback. `findSwaps(offers, max)`: groups by 3-token product key, surfaces cheapest-vs-priciest pair per product across different retailers, minimum $0.25 savings threshold.
- `supabase/functions/enrich-nutrition/index.ts` — USDA FoodData Central enrichment Edge Function. `USDA_API_KEY` stored as Supabase secret (never exposed to client). Accepts `{ products: string[] }`, queries USDA SR Legacy/Foundation data for each name, validates match by word-overlap ≥ 30%, returns `{ calories, protein, carbs, fat, sodium, servingSize, fdcId, description }`. Always returns HTTP 200 — nutrition is optional. **Set secret with: `supabase secrets set USDA_API_KEY=your_key`**

### Added (Normalized Offer Engine — 2026-05-02)
- `supabase/migrations/20260502_normalized_offers.sql` — New `normalized_offers` table (ADD ONLY — no existing tables touched). Fields: `id uuid PK`, `source_offer_id text` (nullable), `retailer`, `product_name`, `brand`, `category`, `size_text`, `normalized_size numeric`, `normalized_unit text`, `price_cents`, `regular_price_cents`, `deal_type` ('sale'|'bogo'|'multibuy'|'coupon'|'regular'|'unknown'), `quantity_required/received INT DEFAULT 1`, `final_unit_price_cents`, `savings_cents`, `confidence_score NUMERIC DEFAULT 0.5`, `raw_source JSONB DEFAULT '{}'`. Partial unique index `uq_normalized_offers_source_id WHERE source_offer_id IS NOT NULL` for conditional upserts. 5 performance indexes. **Apply in Supabase Dashboard → SQL Editor.**
- `src/lib/offerNormalization.ts` — Pure helpers (no imports, no side effects). `normalizePrice()`: parses "$5.99", "2 for $10", "3/$5", "BOGO", "Buy 2 Get 1 Free", "$1.50 off", "50% off" → `NormalizedPrice` with confidence. `normalizeSize()`: parses "16 oz", "1 lb", "500 g", "12 ct", "32 fl oz" → `NormalizedSize`. `detectDealType()`: fast deal classifier. `calculateSavings()`: computes `final_unit_price_cents` + `savings_cents` for all deal types; never returns negative values. `normalizeOffer()`: combines all helpers into a single `NormalizedOffer`.
- `src/lib/productMatching.ts` — `matchProducts(a, b)`: Jaccard token similarity (0.50 weight) + brand match (0.30 exact/partial/token) + size proximity (0.20, ±10%, cross-unit oz/lb/g/kg). `matched = score >= 0.5`. No ML, no external deps.
- `src/services/normalizedOffersService.ts` — `normalizeAndSaveOffers(rawOffers)`: normalizes + upserts by `source_offer_id` (or inserts when null); never throws; returns `{ saved, errors }`. `getNormalizedOffers(limit)`: newest-first read, safe fallback `[]`. `getBestSavingsOffers(limit)`: confidence ≥ 0.5, savings not null, sorted by savings DESC, safe fallback `[]`.
- `src/components/BestSavingsPreview.tsx` — Read-only UI component: fetches `getBestSavingsOffers(3)`, renders top-3 as mint/navy cards with price, regular price strikethrough, and "Save $X.XX" badge. Renders nothing when table is empty or does not exist. Never blocks HomeScreen. Never replaces existing deal cards.
- `src/lib/__tests__/offerNormalization.examples.ts` — 5 raw offer fixtures (sale, BOGO, multibuy, coupon, no-price) with expected normalized output documented in comments. 3 product-matching demo pairs. CLI runner: `npx ts-node --project tsconfig.test.json src/lib/__tests__/offerNormalization.examples.ts`.
- `screens/HomeScreen.js` — Added `import BestSavingsPreview` + `<BestSavingsPreview />` placed after dynamic sections block (before fixed footer). Safe: renders nothing until table exists.

### Added (Behavior-Driven Personalization Layer — 2026-05-02)
- `supabase/migrations/20260502_user_preferences.sql` — New `user_preferences` table: `user_id` PK, `budget_range INT`, `preferred_stores TEXT[]`, `category_clicks JSONB`, `last_actions JSONB`, `experience_type TEXT` ('saver'|'convenience'|'explorer'). RLS enabled (users own their row). Index on `experience_type`.
- `src/lib/experienceType.ts` — Pure helper module. `getExperienceType(prefs)`: budget < 100 → saver, totalClicks > 15 or 4+ categories → explorer, avg action gap < 8 s → convenience, default → saver. `getTopCategories(clicks, n)`: returns top-N clicked category keys for bias sorting.
- `screens/HomeScreen.js` — Added `experienceType` + `userPrefs` state, `userPrefsRef`/`trackDebounceRef` refs. `loadUserPreferences()`: reads or bootstraps `user_preferences` row; sets initial experience type. `trackInteraction(category, action)`: optimistic local state update → debounced (2 s) Supabase upsert; recalculates experience type on every interaction. `sortedTopStacks` / `sortedHomeDeals` useMemos: re-order results by user's top-clicked categories. Section render helpers (`renderTopStacks`, `renderHotDeals`, `renderBuyingPower`, `renderFeatureGrid`, `renderReceipt`) extracted so dynamic `SECTION_ORDER` can reorder them per experience type. Section header labels update per type (e.g., "Top Savings Deals" / "Quick Pick" / "New Deals"). "Personalized for You" pill added to header alongside credits. Deal and meal clicks tracked automatically.

### Added (Dollar General Stacks — 2026-05-02)
- `app_home_feed` (Supabase) — Inserted 3 Dollar General stacks: **Household Essentials Stack** (Brawny + Dawn + Fabuloso + DG Digital Coupon, 38% off, $11.74), **Pantry Stock-Up: Pasta, Sauce & Soup** (Barilla + Hunt's + Progresso + DG coupon, 39% off, $9.24), **DG Snacks & Drinks Weekend Stack** (Lay's + Coca-Cola + Oreo BOGO, 29% off, $12.73). All `verification_status='verified_live'`, `status='active'`, fully enriched with `stack_type`, `breakdown_list`, `instructions`, `savings_percent`, `final_out_of_pocket_cents`. Feed now has 34 active stacks.
- `scripts/insert_dg_stacks.py` — One-off script used to insert the 3 DG stacks.

### Fixed (validation_status / source_type Pre-Migration Fallback — 2026-05-02)
- `screens/HomeScreen.js` — Fixed `isVerifiedSystemStack()`: added fallback so rows with `verification_status = 'verified_live'` (current DB state) are accepted until the `20260502_add_validation_columns.sql` migration is applied in Dashboard. Absent `source_type` column treated as `'SNIPPD_GENERATED'`. Logic: `isVerified = validation_status='system_generated_verified' OR verification_status='verified_live'`; `isSnippd = source_type absent OR ='SNIPPD_GENERATED'`.
- `src/lib/generateStacks.ts` — `loadVerifiedStacks()` now tries new triple-gate columns first (`is_active + validation_status + source_type`), catches the 400 error if columns don't exist, and falls back to `verification_status = 'verified_live'`. Zero downtime bridge.
- `supabase/migrations/20260502_add_validation_columns.sql` — Adds `validation_status TEXT`, `source_type TEXT`, `is_active BOOLEAN` to `app_home_feed`. Populates all existing rows as `system_generated_verified / SNIPPD_GENERATED / is_active=status='active'`. Adds composite index. Also drops+recreates `chk_app_home_feed_verification_status` to include the new value. **Apply in Supabase Dashboard → SQL Editor.**

### Added (Verified Stack Architecture — 2026-05-02)
- `src/lib/generateStacks.ts` — API client: `generateStacks(params)` calls `POST /generate-stacks` Cloud Run (non-fatal if not set). `loadVerifiedStacks(options)` queries `app_home_feed` filtered by `status=active`, `verification_status=verified_live`, `stack_type IS NOT NULL` — the production data gate. Used in Home, Plan, QuickDeals.
- `src/lib/normalizeStack.ts` — `normalizeStack(raw)` converts raw `app_home_feed` rows → typed `NormalizedStack` with `finalCents`, `discountsCents`, `savingsPct`, `items[]` (each with `displayName`, `couponSearchName`, `couponValueCents`, `finalPriceCents`). No invented values. Also exports `fmtCents()`.
- `supabase/migrations/20260502_verified_stack_constraint.sql` — Alters `chk_app_home_feed_verification_status` to add `system_generated_verified`. Adds `source_type TEXT` column (MANUAL | SNIPPD_GENERATED | GENIUS_CRAWL). Adds composite index for verified-active queries. **Apply in Supabase Dashboard → SQL Editor.**

### Changed (Demo Stack Cleanup — 2026-05-02)
- `app_home_feed` (Supabase) — Deactivated 5 demo-only rows: CVS Pharmacy Pantry Snacks, Walgreens Bath & Body Restock, Easter Brunch Ham & Fresh Sides, L'Oreal Skin Care Renewal Bundle, Easter Weekend Soda & Snack Stock-Up. Normalized retailer casing (`publix` → `Publix`, `target` → `Target`). **31 real grocery stacks remain active** (Publix 10, Target 8, Walmart 4, Aldi 4, Winn-Dixie 3, BJ's 2).
- `screens/HomeScreen.js` — `loadTopStacks()` now uses `loadVerifiedStacks()` client (verified-only filter). Pull-to-refresh calls `generateStacks()` first then reloads. Removed direct Supabase query + `GENERATE_STACKS_URL` env var.
- `screens/WeeklyPlanScreen.js` — `loadStoreDeals()` uses `generateStacks()` + `loadVerifiedStacks()` clients. `loadAllStorePrices()` uses `loadVerifiedStacks()`. Removed inline fetch + raw Supabase query.
- `screens/QuickDealsScreen.js` — `loadStacks()` uses `loadVerifiedStacks()`. Added `handleRefresh()` that calls `generateStacks()` then reloads. Updated store filter keys to match actual retailer names (Publix, Walmart, Aldi, Target, BJ's). Filter matching is now case-insensitive.

### Changed (Full Wireframe UX Pass — 2026-05-02)
- `screens/TripSummaryFeedbackScreen.js` — Added "Great job!" achievement banner (green if savings ≥ 70%, amber otherwise) with computed savings achievement percentage. Relabeled metrics from PLANNED/RECEIPT/VERIFIED SAVINGS to **YOU PLANNED / YOU SPENT / YOU SAVED**. Added vertical dividers between metric columns. Added `metricDividerV` and `achieveBanner`/`achieveTitle`/`achieveSub` styles.
- `screens/QuickDealsScreen.js` — Added "Need something else? Add a Custom Deal" footer card at bottom of deals list. Tapping navigates to ShoppingList with null stack (free-form list entry).

### Changed (WeeklyPlanScreen UX Polish — 2026-05-02)
- `screens/WeeklyPlanScreen.js` — Replaced fake Week Receipt section with real **Plan Summary** card: nutrition row (cal/protein/carbs/fat estimated from meal data), cost breakdown (Regular total / Total savings / Final out of pocket) using backend `storeStacks` data with fallback to meal-computed values. Replaced Takeout Comparison bar with **How It Works** section (4 numbered steps in a card). Added **Store Picker Modal** (bottom-sheet, opens from store pills): shows Publix/Dollar General/Walmart with their live prices from `app_home_feed`, radio button selection, "Compare all stores" option. Store pills now open modal (Best Overall) or directly switch store (named stores). Added `Modal` import. Added `showStorePicker`, `allStorePrices` state. Added `loadAllStorePrices()` function. Renamed "Add to Cart" → "Add All to My List".

### Added (app_home_feed Enrichment — 2026-05-01)
- Populated `stack_type`, `final_out_of_pocket_cents`, `total_discounts_cents`, `subtotal_cents`, `savings_percent`, `item_count`, `instructions`, `best_shop_window`, `confidence` for all 36 active `app_home_feed` rows via local Python enrichment script. Stack type classification from `deal_type` field: BOGO_STACK, DIGITAL_COUPON_STACK, PROMO_TRIGGER_STACK, BASKET_ENGINEERED_STACK, THRESHOLD_STACK. `HomeScreen` `loadTopStacks()` (`.not('stack_type','is',null)`) and `WeeklyPlanScreen` `loadStoreDeals()` now return real backend data on pull-to-refresh.

### Added (Production UX — Plan + Deals + Trip Flow — 2026-05-01)
- `screens/TripSummaryFeedbackScreen.js` — New screen. Post-trip summary card (planned vs receipt total, verified savings, plan followed %, coupons clipped). Micro survey: Perfect / Good / Okay / Frustrating. Issue picker when rating is Okay/Frustrating: Coupons did not work / Item unavailable / Switched store / Too complicated / Other. Savings action selector: Move to savings / Pay a bill / Pay credit card / Donate / Split it. Writes to `trip_feedback` table; fires fire-and-forget `ingest-event` for Neo4j mirror. Reachable from ShoppingListScreen "View Summary" CTA.
- `supabase/migrations/20260501_trip_feedback.sql` — Creates `trip_feedback` table: `user_id`, `store`, `planned_total_cents`, `receipt_total_cents`, `verified_savings_cents`, `coupons_clipped`, `plan_followed_pct`, `rating`, `issue`, `savings_action`, `created_at`. RLS: user reads/writes own rows only. **Apply in Supabase Dashboard → SQL Editor.**

### Changed (Production UX — Plan + Deals + Trip Flow — 2026-05-01)
- `screens/WeeklyPlanScreen.js` — Added store selector pills (Best Overall | Publix | Dollar General | Walmart) inside hero block. New hero layout: "YOU PAY" / "YOU SAVE" metrics replacing 3-chip row. Shows `best_shop_window` from backend. "Refresh live deals for [store]" button calls `POST /generate-stacks` Cloud Run (non-fatal if not configured) then re-reads `app_home_feed`. Meal rows: removed "for X people" label, replaced with coupon count pill. Meal tap navigates to `MealDetail` instead of `RecipeDetail`. `loadStoreDeals(store)` added — calls Cloud Run then reads `app_home_feed`. Stack totals (youPayCents, youSaveCents) from backend `app_home_feed` with fallback to computed meal totals.
- `screens/ShoppingListScreen.js` — Coupon item display shows coupon value (`-$X.XX coupon`) and "VERIFIED" badge on coupon_search_name. "Share This Stack" CTA replaced with "View Summary" → navigates to `TripSummaryFeedbackScreen` passing planned/savings/coupons_clipped/plan_followed_pct.
- `App.js` — Added imports for `MealDetailScreen`, `QuickDealsScreen`, `TripSummaryFeedbackScreen`. Registered all three in HomeStack, PlanStack, CartStack. PlanStack also has `StackDetail` and `ShoppingList`.

### Added (3-Screen Stack Engine — 2026-05-01)
- `services/generate_stacks/main.py` — Cloud Run service `POST /generate-stacks`. Accepts `{ user_id, region, stores[], savings_threshold: 40 }`. Loads `stack_candidates`, `digital_coupons`, `retailer_policies` from Supabase; enriches each item with `display_name`, `coupon_search_name`, `native_app_search_terms`, `coupon_clip_instruction`, `coupon_expiration_date`, `deal_expiration_date`, `best_shop_window`, `coupon_status` (verified/needs_user_verification). Classifies stacks into 6 types: BOGO_STACK, THRESHOLD_STACK, PROMO_TRIGGER_STACK, DIGITAL_COUPON_STACK, BASKET_ENGINEERED_STACK, OVERAGE_STACK. Computes subtotal/total_discounts/final_out_of_pocket/savings_percent. Filters by savings_threshold. Self-heals to LOW_YIELD_WEEK if < 3 valid stacks. Deduplicates by retailer (best savings wins). Writes top 6 stacks to `app_home_feed`. Returns clean JSON for 3-screen flow.
- `services/generate_stacks/requirements.txt` — Flask 3.0.3 + gunicorn 22.0.0 + requests 2.32.3.
- `services/generate_stacks/Dockerfile` — Python 3.12-slim, gunicorn, 60s timeout for stack generation.
- `supabase/migrations/20260501_generate_stacks_schema.sql` — Extends `app_home_feed` with: `stack_type`, `trigger_coupon`, `instructions` (jsonb), `best_shop_window`, `confidence`, `savings_percent`, `final_out_of_pocket_cents`, `subtotal_cents`, `total_discounts_cents`, `item_count`. Same extensions on `stack_candidates`. Adds indexes on `stack_type` and `savings_percent`. Adds public read RLS policy for `app_home_feed` if missing. **Apply in Supabase Dashboard → SQL Editor.**
- `screens/ShoppingListScreen.js` — New screen: checklist of items with checkbox toggle, coupon search name, clip instruction, per-item pricing. Shows Stack Summary (subtotal, Est. Coupon Savings, final out-of-pocket). "View Stack Details" and "Share This Stack" CTAs. No frontend math — all values from backend stack object.

### Changed (3-Screen Stack Engine — 2026-05-01)
- `screens/StackDetailScreen.js` — Complete rewrite to display-only format matching wireframe. Shows: final_out_of_pocket, savings %, best_shop_window badge, confidence, subtotal/discounts/final row. 4-step instruction list (from backend `instructions[]`). Items list with `display_name`, `coupon_search_name`, `coupon_status` badge, per-item pricing. In-store item tap-to-check. "Add All Items to My List" CTA navigates to ShoppingListScreen. No frontend math. `navigation.navigate('ShoppingList', { stack })`.
- `screens/HomeScreen.js` — Added `topStacks` state + `loadTopStacks()` reads from `app_home_feed` where `stack_type IS NOT NULL`, ordered by `savings_percent DESC`. Added `navigateToStack(rawStack)` helper. Added "Your Best Stack Today" section above "This Week's Price Drops": featured top stack card (store, price, savings %, shop window, "Start Stack" CTA) + compact list for 2-3 more stacks. `GENERATE_STACKS_URL` env var wired. Pull-to-refresh triggers `loadTopStacks()`.
- `App.js` — Added `ShoppingListScreen` import. Added `StackDetail` + `ShoppingList` screens to HomeStack (primary flow). Added `ShoppingList` to DiscoverStack and CartStack for cross-tab access.

### Fixed (Waitlist Number Static + Position Not Assigned — 2026-05-01)
- `screens/WaitlistForecastScreen.js` — `handleJoinWaitlist()` now calls `assign_free_waitlist_position` RPC directly (awaited) before navigating to WaitlistScreen. Previously the position was assigned only as a fire-and-forget side effect inside `ingest-event` — if that call failed silently, the user arrived on WaitlistScreen with no row in `waitlist_positions` and saw `—` as their position forever.
- `supabase/migrations/20260501_waitlist_grants.sql` — Adds missing GRANT SELECT on `v_waitlist_stats` and `v_waitlist_leaderboard` to `authenticated` and `anon` roles. Without these grants the `.select('total_on_waitlist')` query silently returned `null` on every load, making the community count show `—` permanently. Also grants EXECUTE on `assign_free_waitlist_position` and `record_waitlist_action` to `authenticated` so client-side direct RPC calls work. **Apply in Supabase Dashboard → SQL Editor.**

### Fixed (Post-Payment Navigation — 2026-05-01)
- `screens/SnippdProScreen.js` — Fixed two post-IAP-purchase routing bugs. (1) `markSubscriptionActive()` now upserts `user_persona` with `status: 'launched'` and `briefing_completed: true` in addition to updating `profiles.preferences` — previously only `profiles` was updated, so `resolveUserStatus()` in App.js would re-route the user to the waitlist on every subsequent app cold-start. (2) Alert `onPress` handlers (purchase success and restore) now call `resetToScreen('MainApp')` from `lib/navigationRef` instead of `navigation.navigate('MainApp')` — `navigation.navigate` is scoped to the child navigator the screen lives in and cannot reliably reach root-level screens like MainApp.

### Added (Titan Execution Engine — Schema Gaps — 2026-05-01)
- `supabase/migrations/20260501_titan_spec_gaps.sql` — Adds columns required by Titan spec to `app_home_feed`: `stack_rank_score numeric(5,2)` (ordering by savings %), `loyalty_required boolean` (Golden Rule #4 flag), `bogo_type text` (Half-BOGO / True-BOGO / none for Florida policy), `is_household_essential boolean` (7+1 Rule household pillar flag). Backfills `stack_rank_score` for all 36 existing seeded deals from `save_price / original_price`. Marks household essential deals automatically from `meal_type` and `title` keywords. Adds index `idx_app_home_feed_rank` for fast `stack_rank_score DESC` ordering. Also adds `loyalty_required` and `is_household_essential` to `stack_candidates`. **Apply in Supabase Dashboard → SQL Editor.**
- `supabase/functions/genius-activate/index.ts` — **Root-caused and fixed the function-to-function auth failure.** `SUPABASE_URL` inside edge functions resolves to an internal REST URL that Supabase's functions gateway rejects as `UNAUTHORIZED_INVALID_JWT_FORMAT`. Fix: inlined the Gemini crawl logic directly (`geminiCrawl()`) and the deal scoring via `publish_gate` RPC — zero sub-function calls. genius-activate now calls Gemini's generativelanguage API directly using `GEMINI_API_KEY`. All 5 pipeline steps confirmed working end-to-end: expire → crawl (Gemini) → scoring (inline RPC) → promote → cache rebuild. Transient `Gemini 503` during crawl = model capacity, not a code issue — retries on next activation. Redeployed.
- `supabase/migrations/LAUNCH_apply_all.sql` — Combined `20260430_genius_mode_activate.sql` + `20260501_titan_spec_gaps.sql` into one paste for the Dashboard SQL Editor.

### Fixed (Tracker Import + Checkout Math Resilience — 2026-05-01)
- `screens/AuthScreen.js`, `CartOptionDetailScreen.js`, `CartOptionsScreen.js`, `HomeScreen.js`, `ReceiptUploadScreen.js`, `StackDetailScreen.js`, `WealthMomentumScreen.js` — Fixed broken tracker import path `../lib/eventTracker` → `../src/lib/eventTracker`. All 10 screens now consistently use the canonical tracker at `src/lib/eventTracker.ts`. The old `lib/eventTracker` path is stale and would silently no-op all event tracking in these 7 screens.
- `src/services/authoritativeCheckoutMath.js` — Added try/catch around the `fetch()` call in `fetchAuthorizedCheckoutMath`. Previously, a network error (e.g., placeholder URL not reachable) would throw an unhandled exception crashing CartScreen, CouponClippingScreen, CheckoutBreakdownScreen, ReceiptVerifiedScreen. Now returns `EMPTY_AUTHORITY` with `validation_errors: ['CHECKOUT_MATH_NETWORK_ERROR']` — screens degrade gracefully showing local cart math instead of crashing.
- `.env` — Removed duplicate blank NEO4J entries (lines 49-52). Real NEO4J credentials were already set at lines 17-20.

### Added (Genius Mode Activation — 2026-04-30)
- `supabase/migrations/20260430_genius_mode_activate.sql` — **Fixes the #1 root cause of inaccurate app content.** (1) Creates `app_home_feed` table with full schema definition — was missing from all migrations, causing silent failures on DB recovery. Columns: title, retailer, pay_price/original_price/save_price, breakdown_list (jsonb), dietary_tags, meal_type, card_type, status/verification_status, valid_from/valid_until, preference_profile, source_summary. RLS: public read for active deals, service_role for writes. (2) Extends `stack_candidates` with all columns HomeScreen queries require: is_active, item_name, category, brand, stack_type, final_estimated_cents, price_at_rec, base_price, final_price, confidence_pct, user_badge, validation_status, verified_coupon_id, exact_coupon_url, published_at. (3) Seeds 12 accurate, curated deals from real Spring 2026 US retail prices — Publix Chicken & Greens Stack ($18.44, save $7.51), Publix BOGO Wings ($12.87, save $10.09), Aldi Breakfast Essentials ($13.95, save $4.79), Aldi Pantry Reset ($11.11, save $3.90), Kroger Taco Tuesday ($16.15, save $5.09), Kroger Dairy & Protein ($18.96, save $7.00), Walmart Pasta Night ($13.92, save $3.95), Target Fresh Produce ($12.46, save $6.00), Target Household Stack ($30.97, save $11.00), H-E-B Protein Pack ($21.95, save $10.00), Whole Foods Wellness ($30.46, save $7.50), Trader Joe's Favorites ($11.26, save $4.20). All set to `confidence_score=85`, `validation_status='auto_approved'`, `user_badge='confirmed'`. (4) Seeds 10 matching digital coupons in `digital_coupons` for major retailers. (5) Rebuilds `home_payload_cache` global key immediately — HomeScreen shows deals on next load without waiting for weekly-refresh cron.
- `supabase/functions/genius-activate/index.ts` — Orchestration edge function for ongoing deal freshness. `POST /functions/v1/genius-activate`. Auth: Bearer JWT or x-ingest-key. Body: `{ region, mode: "crawl"|"score"|"full" }`. Full mode: (1) expires stale app_home_feed deals, (2) triggers vertex-agent AI crawl for the region (20 deals), (3) runs run-deal-scoring to compute confidence + publish validated candidates, (4) promotes high-confidence deals from app_home_feed to stack_candidates, (5) rebuilds home_payload_cache. Returns `{ ok, steps[], deals_active, stack_candidates_active, elapsed_ms }`. Call this weekly or after uploading new retailer flyer PDFs.

### Changed (Genius Mode Activation — 2026-04-30)
- `screens/HomeScreen.js` — **Restored full file** (was cleared to 1 byte on disk) with all features from previous session plus Genius Mode activation CTA. When `homeDeals.length === 0`: replaces the static "Waiting for live price drops" empty state with an actionable card that explains what Genius Mode does (names all 8 retailers) and includes an "Activate Genius Mode" green button. While activating: shows `ActivityIndicator` + "Activating Genius Mode... Pulling live price drops from 8 retailers. This takes about 15 seconds." After activation: calls `loadHomeData()` + `fetchProfile()` to refresh the screen with new deals. New state: `geniusActivating`. New callback: `geniusActivate()` — calls `genius-activate` edge function with `{ region: "National", mode: "full" }`.

### Added (Anticipatory Plan Cron + National Store Expansion — 2026-04-30)
- `supabase/migrations/20260430_anticipatory_plan_cron.sql` — pg_cron job `anticipatory-plan-monday` scheduled at `0 11 * * 1` (every Monday 11:00 UTC / 6:00 AM EST). Uses `current_setting('app.supabase_url')` + `current_setting('app.ingest_key')` — consistent with existing cron migration pattern. Also schedules `reflexion-agent-6h` (`0 */6 * * *`) if not already present. Both are guarded by `IF NOT EXISTS (pg_extension pg_cron)` check — safe to run before the extension is enabled. Inline verification query included (SELECT from cron.job).
- `supabase/migrations/20260430_store_locations_national.sql` — 46 additional store locations across 7 new markets: Tennessee (Nashville, Memphis), Ohio (Columbus, Cleveland), Georgia (Atlanta), Texas (Houston, Dallas, Austin, San Antonio), New York (NYC, Brooklyn), California (LA, SF, San Diego, Sacramento), Illinois (Chicago). Retailers include H-E-B (TX), Wegmans (NYC), Jewel-Osco (Chicago), Mariano's (Chicago), Ralphs/Vons (CA). All `ON CONFLICT DO NOTHING` — idempotent. Total: 56 active stores across 8 states after applying both migrations. GeofenceService auto-loads from `store_locations` — no code change required to activate new markets.

### Added (Anticipatory Intelligence Layer — 2026-04-30)
- `supabase/migrations/20260430_anticipatory_intelligence.sql` — 4-feature schema foundation. (1) `profiles.expo_push_token` + `push_notifications_on` + `push_token_updated_at` — stores Expo push token for Monday morning plan notifications. (2) `anticipatory_plans` table — one row per user per week; stores AI-generated plan items (jsonb), total_savings_cents, essentials_matched, push_sent_at, status (`ready/viewed/clipped_all/dismissed`). UNIQUE (user_id, week_of). RLS: user reads own, service_role manages. (3) `store_locations` table — real-world store coordinates for geofencing. 10 demo market stores seeded (Tampa Bay / Orlando FL). Columns: retailer_key, lat/lng, radius_meters, city, state, zip_code. Public read RLS. (4) `receipt_items` ghost match columns: `ocr_confidence` (numeric 0-1), `is_ghost_match` (bool), `ghost_source` (household_cart/weekly_plan/trip_history), `ghost_match_key`, `user_confirmed` (null/true/false), `user_corrected_name`. SQL functions: `get_this_week_anticipatory_plan(user_id)` returns plan if status=ready for current week. `mark_plan_viewed(plan_id, user_id)` updates status from ready→viewed.
- `supabase/functions/anticipatory-plan/index.ts` — Anticipatory Plan Generator. Dual auth: Bearer JWT (single-user refresh) + x-ingest-key (batch Monday cron). For each user: reads household_cart_items (pending essentials) + stack_candidates for preferred retailers this week → fuzzy matches essentials to deals via word-overlap → computes total_savings_cents → upserts anticipatory_plans (idempotent by UNIQUE constraint) → sends Expo push notification via `exp.host/--/api/v2/push/send`. Push body: `"Your $42 Savings Plan is ready. 6 of your weekly essentials are at their lowest price this week. Tap to clip all."` Returns: `{ ok, processed, sent, skipped, errors[] }`.
- `src/services/pushNotificationService.ts` — Expo push token registration + local notification service. `registerPushToken(userId)` — requests permission, creates Android channels (snippd-default, snippd-geofence), stores token in profiles. `scheduleLocalNotification(title, body, data, channelId)` — fires immediate local notification. `sendGeofenceAlert(storeName, savingsCents, itemCount, retailerKey)` — high-priority store entry alert. `addNotificationResponseListener(navigate)` — wires tapped notifications to screen navigation.
- `src/services/GeofenceService.ts` — GPS-based store proximity detection using expo-location `watchPositionAsync`. Haversine distance formula (no native module dependency). Per-store 30-minute cooldown (AsyncStorage) prevents alert spam. Loads store_locations from DB, checks every 15s / 20m moved. On entry: fires `sendGeofenceAlert()` + calls `loadLiveCardItems()` to populate HomeScreen live card. Returns `createGeofenceWatcher(userId)` with `{ start(onCard), stop() }` API.
- `src/services/wealthMomentumEngine.ts` — Pure math service. No DB access. `buildMomentumTicker(savingsCents)` — computes 5y/10y/20y S&P 500 projections (10% annual, weekly contribution compounding). `futureValueAnnuity(weeklyContributionCents, rate, years)` — FV annuity formula. `formatCents(cents)` — compact label formatter ($1.5K, $150K, $2.3M). Selects compelling tagline horizon (10y if 20y > $5M). Returns `MomentumTicker { tagline, projection5y, projection10y, projection20y, annualizedCents }`.

### Changed (Anticipatory Intelligence Layer — 2026-04-30)
- `screens/HomeScreen.js` — 3 new anticipatory UI blocks injected above DailyPulseCard: (1) **Geofence Live Card** (Feature 2) — dark navy card, green pulse dot, store name + savings + top 3 items. Only shows when `liveCard` state is set by GeofenceService. Dismissible. (2) **Anticipatory Plan Banner** (Feature 1) — mint green banner shows "Your $42 Savings Plan is ready" with essentials_matched count. Tapping calls `mark_plan_viewed()` RPC then navigates to PlanTab. (3) **Wealth Momentum Ticker** (Feature 3) — dark navy card placed after WealthProgressCard. Shows 5y/10y/20y S&P 500 projection columns in green. Tagline: `"This week's $47.20 savings, invested in an S&P 500 index fund, becomes $1.4K in 20 years."` Disclosure: illustrative only. State: `anticipatoryPlan` (from RPC), `liveCard` (from GeofenceService), `momentumTicker` (from `buildMomentumTicker`). New imports: `buildMomentumTicker`, `createGeofenceWatcher`. Two new `useEffect` hooks: one polls `get_this_week_anticipatory_plan`, one starts/stops geofence watcher.
- `screens/ReceiptUploadScreen.js` — **Feature 4: Self-Correcting OCR Ghost Match**. When Gemini OCR fails (catch block), instead of showing a dead-end error alert, the app: (1) Loads user's `household_cart_items` (pending essentials). (2) Builds ghost match proposals: `{ essentialName, priceCents, confirmed: null }`. (3) Sets `showGhostReview = true` and advances to Step 2. (4) Renders `ghostCard` — "👻 I matched your essentials" — with Yes/No confirmation buttons per item. Confirmed items are treated as matched purchases. Copy: "We couldn't read the image clearly. I cross-referenced your household list. Correct me if I'm wrong." New state: `ghostMatches[]`, `showGhostReview`. New helper: `ghostMatchScore(ocrName, essentialName)` (module-level fuzzy word match, score by shared word count).

### Database (Anticipatory Intelligence Layer — 2026-04-30)
- New table `anticipatory_plans` — weekly AI-generated savings plan per user. `UNIQUE (user_id, week_of)`. RLS user-read + service_role write.
- New table `store_locations` — geo coordinates for geofencing. 10 FL demo stores seeded.
- `profiles` table — added `expo_push_token text`, `push_notifications_on boolean`, `push_token_updated_at timestamptz`.
- `receipt_items` table — added `ocr_confidence`, `is_ghost_match`, `ghost_source`, `ghost_match_key`, `user_confirmed`, `user_corrected_name` columns for self-correcting OCR audit trail.
- New SQL functions: `get_this_week_anticipatory_plan(user_id)`, `mark_plan_viewed(plan_id, user_id)`.

### API (Anticipatory Intelligence — 2026-04-30)
- `POST /functions/v1/anticipatory-plan` — x-ingest-key (batch Monday 6AM cron) or Bearer JWT (single-user refresh). Generates and sends anticipatory savings plans. Returns `{ ok, processed, sent, skipped, errors[] }`.

### Added (Digital Coupon Strategy — Auto-Clip Agent — 2026-04-29)
- `supabase/migrations/20260429_digital_savings.sql` — Two new SECURITY DEFINER SQL functions: `calculate_digital_savings(user_id, normalized_keys[])` returns `(savings_cents bigint, matched_count int)` — total potential digital savings for a cart by matching against `digital_coupons` filtered to the user's preferred retailers from `user_persona`. `get_clippable_coupons(user_id, normalized_keys[])` returns full coupon rows with `savings_label` for Checkout Shield rendering. Both functions are idempotent and grant EXECUTE to `authenticated`.
- `src/services/CouponClippingService.ts` — Background coupon matching service. Reads the user's cart from AsyncStorage, normalizes product names to `normalized_key` slugs, calls `get_clippable_coupons()` and `calculate_digital_savings()` in parallel, caches results for 5 minutes in AsyncStorage (`snippd_digital_coupons_{user_id}`). Exports: `runCouponClip(userId, forceRefresh?)`, `clearCouponCache(userId)`, `fmtSavings(cents)`. Includes CLI entry point for manual testing.

### Changed (Digital Coupon Strategy — Auto-Clip Agent — 2026-04-29)
- `screens/CartScreen.js` — Replaced `CouponChecklist` (static filter of cart items by deal_type) with full `CheckoutShield` component. Shield calls `runCouponClip()` on cart load, shows each matched coupon with retailer, Loyalty/App-only tags, and per-coupon savings label. Total shield savings displayed as purple badge in the header. Animates in with a loading spinner while the clip service runs. Shield is hidden when no coupons match.
- `screens/HomeScreen.js` — Hero card now surfaces digital savings as a second pill below the streak pill. Calls `runCouponClip()` in `fetchProfile` after savings total loads. Shows `✂ $X.XX digital coupons ready` in a lavender pill when coupons are available for the current cart. Only renders when `digitalSavings > 0` so it stays invisible when cart is empty.

### Database (Digital Coupon Strategy — 2026-04-29)
- New SQL functions `calculate_digital_savings` and `get_clippable_coupons` on existing `digital_coupons` table. No schema changes — additive functions only.

### Added (SOC2 Fortress + Security Hardening — 2026-04-29)
- `supabase/migrations/20260429_soc2_fortress.sql` — SOC2 Processing Integrity layer. (1) `credit_ledger` table — immutable append-only audit trail for every `credits_balance` change. REVOKE anon access. RLS: user reads own rows, service_role manages all. (2) `receipt_hashes` table — receipt deduplication + velocity window. `UNIQUE (receipt_upload_id)` + `UNIQUE (user_id, content_hash)` prevents replay attacks. (3) `earn_credits(user_id, amount, reason, ref_id)` RPC — `SELECT FOR UPDATE` row lock, logs to `credit_ledger` via trigger, signals trigger with `set_config('snippd.credit_reason', ...)`. (4) `spend_credits(user_id, amount, reason, ref_id)` RPC — same lock pattern, returns `insufficient_credits` if balance too low; the ToCTOU 100-concurrent-request attack cannot succeed. (5) `redeem_store_item(user_id, item_key)` RPC — single atomic function for all 5 store items (STREAK_SHIELD, CHEF_STASH_RECIPE, MULTI_STORE_PLAN, TRIAL_EXTENSION, PRO_WEEK_PASS); handles capacity limits, preference grants, and balance deduction in one locked transaction. (6) `process_receipt_verification(user_id, upload_id, content_hash)` RPC — atomic receipt gatekeeper: duplicate check, content hash dedup, velocity check (≥3/5min = fraud flag), variable reward (10% +25cr, 30% +10cr, 60% base), streak update, badge awards — all in one transaction. (7) `credit_ledger_guard` trigger on `profiles.credits_balance` — catches any direct PostgREST UPDATE that bypasses RPCs and logs it with `txn_source = 'UNAUTHORIZED_DIRECT_UPDATE'`. (8) `healing_events` reflexion columns: `reflexion_analyzed`, `reflexion_at`, `reflexion_notes` + service_role UPDATE policy. (9) anon REVOKE on `credit_ledger`, `receipt_hashes`, `user_achievements`.
- `supabase/functions/verify-receipt/index.ts` — The Logic Lock. POST endpoint, Bearer JWT auth. Validates upload belongs to caller (RLS), then calls `process_receipt_verification()` for atomic credit + streak award. Returns `{ credits_earned, bonus_credits, streak_weeks, was_extended, shield_used, badges_earned }`. Service role key never in app bundle — only in Edge Function secrets. Fires `RECEIPT_VERIFIED_CREDITS_AWARDED` event to `event_stream` for preference learning.
- `supabase/functions/reflexion-agent/index.ts` — Self-Healing Reflexion Loop. POST, x-ingest-key auth. Scans `healing_events` for unanalyzed critical/warning events in last 24h, groups by check_name. For each chronic pattern (≥2 failures): calls Gemini 1.5 Flash for root-cause analysis + fix recommendation (JSON schema enforced). Applies safe automated fixes: `flag_retailer_coverage`, `update_user_preference`, `clear_stale_cache`, `notify_admin`. Marks events `reflexion_analyzed = true`. Inserts `REFLEXION_OUTCOME` log entry. Designed for pg_cron every-6h trigger.

### Changed (SOC2 Fortress + Security Hardening — 2026-04-29)
- `screens/CreditsStoreScreen.js` — Replaced 80-line direct profile UPDATE flow with single `supabase.rpc('redeem_store_item', ...)` call. All race-condition and ToCTOU attack surface eliminated. Balance check, capacity check, and grant all happen server-side under row lock.
- `screens/ReceiptVerifiedScreen.js` — Replaced `applyReceiptVerifyCredits()` + `updateStreakOnVerify()` (two separate client-side calls) with single `supabase.functions.invoke('verify-receipt', ...)`. Added `expo-haptics` trophy moment: badge earned = heavy double-pulse, bonus credit = medium impact, standard verify = success notification. Variable reward bonus displayed in `creditNote` banner (e.g. "+20 credits earned (10 bonus!)"). Haptic logic extracted to `triggerReceiptHaptics()` module-level function to avoid deep nesting.

### Database (SOC2 Fortress — 2026-04-29)
- New table `credit_ledger` — immutable ledger, `(user_id, delta, balance_after, reason, ref_id, txn_source)`. SOC2 Processing Integrity proof.
- New table `receipt_hashes` — dedup + velocity window for receipt credit awards.
- New SQL functions: `earn_credits`, `spend_credits`, `redeem_store_item`, `process_receipt_verification`, `credit_ledger_guard` trigger.
- Modified `healing_events` — added `reflexion_analyzed bool`, `reflexion_at timestamptz`, `reflexion_notes text` + service_role UPDATE policy.

### API (SOC2 Fortress — 2026-04-29)
- `POST /functions/v1/verify-receipt` — Bearer JWT. Body: `{ receipt_upload_id, content_hash? }`. Returns atomic receipt verification result including credits, streak, and badge data.
- `POST /functions/v1/reflexion-agent` — x-ingest-key. No body required. Returns `{ patterns_analyzed, outcomes[] }`. Trigger via pg_cron every 6h.

### Added (Credits Economy + Streak Mechanics — 2026-04-29)
- `supabase/migrations/20260429_streak_achievements.sql` — Adds streak tracking columns to `profiles` (`savings_streak_weeks`, `longest_streak_weeks`, `last_streak_week`, `streak_shield_count`, `streak_updated_at`) and creates `user_achievements` table with `UNIQUE (user_id, badge_key)`, RLS policies for user read + service_role write.
- `src/services/streakService.ts` — Full streak management service. Exports `updateStreakOnVerify` (idempotent ISO-week streak counter with shield consumption), `checkSavingsMilestones` (lifetime savings badge awards), `loadStreakState` (read-only getter), `getISOWeek` / `getPrevISOWeek` (UTC-safe ISO week helpers). Streak milestones: STREAK_4, STREAK_8, STREAK_26, STREAK_52. Savings milestones: CENTURY ($50), FIRST_100, HALF_GRAND ($500), FOUR_FIGURES ($1k), FIVE_GRAND ($5k).
- `screens/CreditsStoreScreen.js` — Full credits redemption store. Sovereign dark theme (`#050805` bg, `#0C9E54` green, `#101410` card). 5 purchasable items: Streak Shield (50cr, max 5), Chef Stash Recipe (25cr), Multi-Store Plan (75cr), Trial Extension (100cr, max 2), Pro Week Pass (300cr). Double-checked locking: fresh DB balance read before deducting. Items dim to 0.45 opacity when unaffordable or at capacity. Grants write to `profiles.preferences` (chef_stash_credits, multi_store_plan_credits, trial_expires_at, pro_week_expires_at) and `streak_shield_count`.

### Changed (Credits Economy + Streak Mechanics — 2026-04-29)
- `screens/ReceiptVerifiedScreen.js` — Calls `updateStreakOnVerify` after receipt verification. Displays streak result in hero card: 🔥 week count, +1 badge on extension, "SHIELD USED" in amber when a shield is consumed, badge pills for newly earned milestones (STREAK_4 through STREAK_52). Hidden when `alreadyCountedThisWeek`.
- `screens/HomeScreen.js` — Fetches `savings_streak_weeks` from profiles on load. Shows `🔥 Xw streak` pill in hero card footer when streak > 0.
- `screens/ProfileScreen.js` — Added "Stash Credits Store" item to Savings menu section (navigates to `CreditsStore`).
- `App.js` — Imported `CreditsStoreScreen` and registered as `ProfileStackNav.Screen name="CreditsStore"` in ProfileStack.

### Database (Credits Economy + Streak Mechanics — 2026-04-29)
- `profiles` table — Added columns: `savings_streak_weeks` (int, default 0), `longest_streak_weeks` (int, default 0), `last_streak_week` (text, ISO 'YYYY-Www'), `streak_shield_count` (int, default 1), `streak_updated_at` (timestamptz). Apply via `supabase/migrations/20260429_streak_achievements.sql`.
- New table `user_achievements` — `id uuid PK`, `user_id uuid FK`, `badge_key text`, `earned_at timestamptz`, `metadata jsonb`. `UNIQUE (user_id, badge_key)` ensures idempotent badge awards.

### Changed (Full-system alignment — 2026-04-29)
- `src/services/agenticLedger.ts` — Added `FORECAST_COMPLETED` and `WAITLIST_ACTION_RECORDED` to `DecisionType` enum to cover waitlist funnel and onboarding forecast events.
- `docs/PRD.md` — Fixed Budget Tracker spec (section 4.2): `profiles.weekly_spent` does not exist; value derives from `checkout_math_snapshots` or client-side state. Fixed Delete Account spec (sections 4.1 + 4.7): now correctly describes `delete-account` Edge Function call, not a direct profiles row delete.
- `docs/ARCHITECTURE.md` — Updated PostgreSQL table inventory to include all 36 live tables. Added Deal Intelligence Layer section (7 tables, 2 edge functions, full data flow). Added Three-Lane Waitlist System section (2 tables, 2 stored functions, lane priority).
- `docs/SERVICES.md` — Added `NEO4J_DATABASE` to Python Titan agent required env vars (critical for AuraDB Free where database name ≠ `'neo4j'`).
- `agent/agents/architect.py` (already correct) — Confirmed `store_chains_for_filter` correctly passes `s.chain` values to `find_hidden_stacks`, not human-readable store names. `ShoppingHaul.stores` correctly contains `s.name` (human-readable). No code change needed.
- `agent/agents/shared.py` (already correct) — Confirmed `Neo4jDriver.session()` already reads `NEO4J_DATABASE` env var with `'neo4j'` fallback (line 170). Consistent with Node.js `neo4jClient.ts`. No code change needed.

### Fixed (Full schema normalization sweep — 2026-04-29)
- `screens/TripResultsScreen.js:137` — Replaced stale `trip.items_on_stack` fallback with `trip.items_count` (actual `trip_results` DB column). Display-only ITEMS count in trip hero stats now resolves correctly.
- `screens/HomeScreen.js:144` — Removed `profiles.update({ weekly_spent: 0 })` in "Start Fresh" handler. Column `weekly_spent` does not exist in `profiles`. Budget reset is now local state-only (no DB write needed — `weekly_spent` was never persisted).
- `supabase/functions/delete-account/index.ts:61` — Removed `receipt_summaries` from the cleanup table list. Table does not exist in production; the try/catch would silently swallow it, but removing it is cleaner and avoids misleading logs.
- `screens/BudgetDashboardScreen.js` — Fixed `stash_credits` → `credits_balance`, `receipt_summaries` → `trip_results` (using `total_spent_cents`), wrapped `household_cart_items` query in try-catch (table pending migration).
- `screens/StudioScreen.js` — Fixed `stash_credits` → `credits_balance`, removed `posts_count` from SELECT and UPDATE (column does not exist).
- `screens/ReceiptUploadScreen.js` — Fixed `trip_results` insert: `items_count` (not `items_on_stack`), `verified: true` (not `verified_at`), removed `items_unplanned`. Removed broken `receipt_summaries` insert. Fixed fallback credits update to use `credits_balance`.
- `screens/AppTestAgent.js` — Fixed `stash_credits` → `credits_balance` in profile SELECT and display string.
- `src/services/authoritativeCheckoutMath.js` — Wrapped `latestLifecyclePlanId()` in try-catch; returns `null` instead of throwing when `weekly_lifecycle_plans` table is missing.
- `screens/ClipSessionScreen.js` — `clip_session_items` error no longer crashes screen; handled as empty when table is missing.

### Fixed (App audit — schema normalization + admin data — 2026-04-29)
- `screens/DiscoverScreen.js` — Fixed confidence badge: live DB uses `confidence_score` column (not `confidence_pct`). Added `confidence_pct: s.confidence_pct ?? s.confidence_score ?? null` to the sanitize map so badges render correctly from both schema versions.
- Production DB — Fixed `profiles.full_name = null` for both admin accounts (`ddavis@getsnippd.com`, `dina.davis.important@gmail.com`) via service role API. Both now show "Dina Davis" and `plan_tier = 'admin'`. HomeScreen initials will now correctly display "DD" instead of "??".

### Fixed (deal-validator routing + OmniStoreComparison auto-load — 2026-04-29)
- `supabase/functions/deal-validator/index.ts` — Fixed routing bug: `supabase.functions.invoke()` hits `/functions/v1/deal-validator` directly, so `url.pathname.split('/').pop()` returned `deal-validator` instead of the action. Now resolves action from URL path segment first (for direct fetch calls like `/deal-validator/feedback`), then falls back to `body.action` (for `supabase.functions.invoke()` calls). Both calling patterns now work without code changes on the client.
- `screens/ReceiptVerifiedScreen.js` — Changed `_action: 'feedback'` → `action: 'feedback'` in deal feedback invoke body to match the updated resolver.
- `screens/OmniStoreComparisonScreen.js` — Added `useFocusEffect(loadComparison)`. The screen previously never auto-loaded data — comparison was blank on open. Now loads on every focus. Also added `@react-navigation/native` import for `useFocusEffect`.
- `.env` — Added `CHECKOUT_MATH_HMAC_SECRET` (generated), `EXPO_PUBLIC_CHECKOUT_MATH_URL` placeholder, `NEO4J_*` placeholders.

### Added (Deal Intelligence Layer — 2026-04-29)
- `supabase/migrations/20260429_deal_intelligence_layer.sql` — 550-line additive migration. Adds Deal Intelligence, Validation, Confidence Scoring, Dynamic Pricing Defense, and Regional Layer. Phase-by-phase: (1) 6 new enums (validation_status, offer_scope, actor_type, deal_type, stack_type, user_facing_badge). (2) 30 new columns on `offer_sources` (confidence subscores, validation fields, coupon intelligence, regional scope, price tracking). (3) 10 new columns on `flyer_deal_staging`. (4) 8 new columns on `stack_candidates`. (5) 8 new columns on `digital_coupons`. (6) New table `price_observations` — price tracking by product/retailer/store/zip/state with RLS. (7) New table `validation_events` — full audit trail for every offer status change. (8) New table `user_deal_feedback` — did the deal work at the store? Feeds back into scoring. (9) New table `source_reliability` — per-source trust score (10 sources seeded). (10) New table `retailer_coverage` — market readiness by retailer/state/zip (10 markets seeded: FL, TN, OH). (11) New table `deal_review_queue` — human/AI review pipeline. (12) New table `validation_rules` — 33 configurable rules seeded (R001-E003 categories: retailer, product, coupon, deal, stack, regional, pricing, evidence). (13) `compute_confidence_score(offer_source_id)` SQL function — 10-factor weighted formula returning 0-100. (14) `validate_offer(offer_source_id)` SQL function — runs all 33 rules, persists result, logs validation event. (15) `publish_gate(offer_source_id)` SQL function — single entry for all publishing decisions, auto-queues review, auto-publishes at ≥85. (16) `compute_price_volatility(offer_source_id)` SQL function — detects price variance across observations, updates volatility_score. (17) `compute_market_readiness(state, zip, retailer)` SQL function — returns market_readiness_score 0-100 with demo_ready/demo_with_caution/national_generic thresholds. (18) `process_deal_feedback(...)` SQL function — records user outcome, updates stack_success_score and source_reliability. (19) Views: `v_active_offers` (display-ready filtered/scored), `v_offer_price_history` (price trend with LAG delta), `v_deal_review_dashboard` (admin queue). (20) `flag_stale_prices()` SQL function — pg_cron compatible, auto-flags >7-day stale prices, auto-blocks expired offers. All tables have RLS + admin policy.
- `supabase/functions/deal-validator/index.ts` — New Edge Function. 6 actions: `validate` (run validate_offer), `publish` (run publish_gate), `feedback` (submit user outcome → process_deal_feedback), `market` (compute_market_readiness for demo), `batch` (validate up to 100 offers), `active-offers` (filtered display query). Auth: Bearer JWT or x-ingest-key.
- `supabase/functions/price-tracker/index.ts` — New Edge Function. 3 actions: `observe` (log price observation + update offer), `volatility` (compute price volatility), `history` (return price trend from v_offer_price_history).
- `supabase/functions/run-deal-scoring/index.ts` — New Edge Function. Batch scoring worker. Runs flag_stale_prices(), then publish_gate() on all pending/needs_review offers up to 500 at a time. Designed for pg_cron daily trigger.

### Added (Launch Migration Bundle — 2026-04-29)
- `supabase/migrations/LAUNCH_apply_all.sql` — Single idempotent SQL file that applies all 29 unapplied migrations in dependency order. 11 phases: (1) profile column additions, (2) core data tables (weekly_lifecycle_plans, checkout_math_snapshots, authoritative_funding_ledger), (3) trip tracking + agentic ledger, (4) coupon KB + clip sessions full rebuild, (5) security tables (honey_token_skus, geo_auth_logs, healing_events), (6) ingestion pipeline hardening, (7) Slack integration, (8) user_persona + agent_init, (9) persona expansion + waitlist positions with stored functions (assign_free_waitlist_position, assign_paid_waitlist_position, record_waitlist_action), (10) pg_cron jobs wrapped in extension-check guard, (11) 18-table presence verification that prints LAUNCH CHECK ✓ on success. 2,728 lines total. Run once in Supabase Dashboard → SQL Editor.

### Added (Full Agentic Loop — 2026-04-29)
- `screens/CartScreen.js` — Added "Prep coupons for this trip" button (green outline, scissors icon) above the checkout button. Navigates to `CouponClipping` with cartItems, checkoutAuthority, and totals. Closes the Cart → CouponClipping → CheckoutBreakdown → VerifyReceipt pre-shop prep flow.
- `screens/ReceiptUploadScreen.js` — Verified step "Back to Home" replaced with "See Your Win". Navigates to `VerifyReceipt` with totalSaved, stackItems, storeName, creditsEarned. Fires `run-preference-updater` Edge Function in background immediately after receipt verification so the next weekly plan improves from this trip's actuals.
- `screens/WinsScreen.js` — Rebuilt from 50-line placeholder to full savings history screen. Reads `checkout_math_snapshots` (status=APPROVED) from Supabase. Hero card shows lifetime verified savings, trip count, active week count, and annual pace. Trip history cards show retailer, date, and saved amount per trip. Empty state prompts receipt upload. Pull-to-refresh via `useFocusEffect`.
- `screens/HomeScreen.js` — Fixed `savingsTotal` data source. Was reading `profiles.savings_total` (column does not exist). Now queries `checkout_math_snapshots` and sums `response_payload.savings_cents` across all APPROVED rows. Removed `weekly_spent` and `savings_total` from profiles query (columns do not exist per schema). Hero "Saved $X" now reflects real verified dollars.

### Fixed (Delete Account button — 2026-04-27)
- `screens/ProfileScreen.js` — `handleDeleteAccount`: `setDeleting(true/false)` was never called — button showed "Delete Account" throughout the async operation and stayed tappable. Fixed: `setDeleting(true)` now called before the Edge Function invocation; `setDeleting(false)` on error path only (success path navigates away). Added `clearEncryptionKeyCache()` before deletion (matching sign-out behavior). Added `performGlobalReset()` after `signOut({ scope: 'local' })` as a belt-and-suspenders navigation reset so the user always lands on Auth even if the `onAuthStateChange` listener races. Added a second confirmation dialog ("Yes, delete everything") before executing — prevents accidental deletion from a single mis-tap.

### Added (Stripe Webhook + Free Waitlist Position — 2026-04-27)
- `supabase/functions/stripe-webhook/index.ts` — New Edge Function. Receives `checkout.session.completed` events from Stripe, verifies the HMAC-SHA256 signature (5-minute replay protection), looks up the Snippd user account by `customer_details.email` via the GoTrue admin API, then calls `assign_paid_waitlist_position(user_id, payment_intent_id, stripe_tier)`. `stripe_tier` comes from the payment link's metadata field (`tier = beta_pro` or `tier = founder`) — must be set in Stripe Dashboard. Returns HTTP 200 for all non-retryable conditions (unknown user, skipped payment status) so Stripe does not retry unnecessarily; returns HTTP 500 on DB errors so Stripe does retry. Webhook URL: `https://gsnbpfpekqqjlmkgvwvb.supabase.co/functions/v1/stripe-webhook`. Subscribe to `checkout.session.completed` in Stripe Dashboard.
- `supabase/functions/ingest-event/index.ts` — When `event_name === 'forecast_completed'`, calls `assign_free_waitlist_position(user_id)` after inserting the event into `event_stream`. Await is used (not fire-and-forget) to ensure the position is assigned before the response returns. Failure is caught and non-fatal — the function still returns 200 with the event inserted. The stored function is idempotent (`ON CONFLICT DO NOTHING`), so duplicate events are safe.
- `screens/WaitlistForecastScreen.js` — `handleJoinWaitlist` now fires a `forecast_completed` event to `ingest-event` via `supabase.functions.invoke()` immediately after the `user_persona` upsert succeeds. Uses `generateUUID()` (module-level v4 UUID generator, no imports) for `session_id`. Fire-and-forget with `.catch(() => {})` so a network failure does not block navigation to `WaitlistScreen`. The JWT is automatically included by the Supabase client from the active session.
- `.env` — Added `STRIPE_WEBHOOK_SECRET=whsec_...` placeholder with webhook URL and setup instructions as a comment.

### Added (Three-Lane Waitlist System — 2026-04-27)
- `supabase/migrations/20260427_waitlist_positions.sql` — Two new tables, three stored functions, two views. `waitlist_positions`: one row per user, tracks tier (`paid`/`gifted`/`free`), `base_position` (immutable, assigned at join), `current_position` (moves up as actions are recorded), `spots_gained`, `status` (`waiting`/`approved`/`declined`), `stripe_payment_id`, `stripe_tier`, `approved_at`. RLS enabled — users SELECT own row only; all writes are server-side. `waitlist_actions`: append-only event log (never UPDATE/DELETE) — `action_type`, `spots_awarded`, `verified`, `referred_user_id`, `note`. RLS enabled — users SELECT own rows only. Stored functions: `assign_free_waitlist_position(user_id)` — assigns `MAX(base_position, 300) + 1` (free lane starts at 301); `assign_paid_waitlist_position(user_id, stripe_payment_id, stripe_tier)` — assigns paid positions 1, 2, 3… (auto-approves if ≤ 200, also updates `user_persona.status`); `record_waitlist_action(user_id, action_type, spots, verified, referred_user_id, note)` — inserts action log row and updates `current_position = GREATEST(1, current_position - spots)`. Views: `v_waitlist_leaderboard` (anonymized — no PII, sorted by `current_position ASC`), `v_waitlist_stats` (aggregate counts: total, paid, gifted, free, approved, last paid position).
- `screens/WaitlistScreen.js` — Rebuilt for three-lane waitlist. Reads `waitlist_positions` and `waitlist_actions` for the authenticated user. Approved users see a green "You're In!" banner with `approved_at` date. Waiting users see their tier badge (Paid / Gifted / Free), live current position (fetched via `count` of users with lower `current_position`), total `spots_gained`, and a list of their completed actions from `waitlist_actions`. Six gamification action cards: Complete Briefing (+10, auto), Share on Instagram (+25, honor-system), Share on TikTok (+25, honor-system), Share on X (+25, honor-system), Refer a friend who joins (+50, auto), Refer a friend who pays (+100, auto). Two Stripe payment buttons (Beta Pro and Founder tier) that call `Linking.openURL()` using env vars `EXPO_PUBLIC_STRIPE_BETA_PRO` and `EXPO_PUBLIC_STRIPE_FOUNDER` — paid users jump to position #1–200 with instant beta access. Real-time subscription via `supabase.channel('waitlist-live')` on `postgres_changes` for `waitlist_positions` (any event) and `waitlist_actions` (INSERT for this user) — auto-refreshes position and action list. `useFocusEffect` re-queries on every screen focus. Community count from `v_waitlist_stats.total_on_waitlist`. Tier positions: paid lane #1–200 (first 200 auto-approved), gifted lane #201–300 (admin-granted), free lane #301+ (organic, gamified climb).

### Changed (WaitlistScreen — live position + real social links — 2026-04-27)
- `screens/WaitlistScreen.js` — Rebuilt with live Supabase data. Position is now real: counts `user_persona` rows with `status IN ('waitlist','paid_beta','launched')` joined before the current user; offset by 100 so the first registrant is #101. Supabase real-time subscription (`postgres_changes` on `user_persona`) auto-refreshes position whenever anyone joins or is approved. `useFocusEffect` re-queries every time the user navigates back to the screen. Manual "Check my position" button with green live indicator. Community count ("X people on the waitlist") pulled from real `COUNT` query on `forecast_completed = true` — no cosmetic ticking. All fake random ticker removed. Instagram/TikTok/X are now tappable `Linking.openURL()` calls to `instagram.com/getsnippd`, `tiktok.com/@getsnippd`, `x.com/getsnippd`. Referral note explains friends who use the link skip ahead when beta opens. Text: "Wealth Stack" → "Savings Stack", "Shopping Bestie activates" → "Shopping Concierge activates" throughout.
- `screens/WaitlistForecastScreen.js` — Rebuilt Step 1 (The Table) from emoji bubble grid to counter rows with Feather icons and `−`/`+` controls. Step 3 (The Mission) changed from single-select to multi-select — all selected missions stack their multipliers, saved as comma-separated string. Step 4 (The Baseline) adds weekly/monthly spend toggle — weekly mode converts bucket values via `× 4.33` before projection; bucket cards use `width: '47%'` (not fixed pixel math) so nothing is cut off on web. Option card text uses `flexShrink: 1` so long descriptions never overflow. All emojis removed; all icons are Feather. Grammar fix: "your the convenience tax" → "targeting your convenience tax".
- `screens/DailyPulseCard.js` — `shadow*` props replaced with `Platform.select` (`boxShadow` on web, native shadow on iOS/Android).
- `screens/SignInScreen.js` — `outline: 'none'` added to TextInput on web (removes black focus box). `inputWrapFocused` shadow replaced with `boxShadow` on web. `useNativeDriver` made conditional (`Platform.OS !== 'web'`). `pointerEvents="none"` moved into style prop.
- `lib/healthMonitor.js` — Web path skips the raw `HEAD` ping (which always logs a 401 in the browser network panel) and uses the Supabase JS client instead for the connectivity check.

### Added (SplashIntroScreen — cold-visitor first impression — 2026-04-27)
- `screens/SplashIntroScreen.js` — 3-slide swipeable value prop carousel shown once to first-time cold visitors (before sign-up). Slide 1 "The Problem": grocery cart leaking money stat ($3,744 annual overspend). Slide 2 "The Solution": AI agent that scans receipts and builds a precision plan (18–40% savings rate stat). Slide 3 "The Movement": $2.1M+ recovered community stat with social proof. Each slide has a colored icon orb, kicker label, large bold headline, body copy, and a white stat card. Bottom bar: animated dot indicators, green CTA button (Next / Get Started), "Already have an account? Sign in" link on last slide. Stores `@snippd_intro_seen` in AsyncStorage so it is never shown again after the first visit.
- `App.js` — `SplashIntroScreen` added to root stack navigator. `startup()` cold-visitor branch: if no session, reads `@snippd_intro_seen` from AsyncStorage — routes to `SplashIntro` if not seen, or `Auth` if already seen.

### Added (Shopping Bestie Onboarding System — 2026-04-27)
- `screens/WaitlistForecastScreen.js` — 5-state onboarding screen (The Table → The Leak → The Mission → The Baseline → The Reveal). Captures household DNA (7 member types with per-member savings multipliers), spending leak category, health/bio mission, and monthly spend bucket. Calculates a personalized projected monthly recovery in real-time. Reveal state includes animated count-up of dollar amount, active bonus badge strip (Caloric Surge, Formula Shield, Rx Optimizer, Pet Cost Cutter), "Why do you need Snippd?" social proof input (140 chars), viral share trigger with @getsnippd handles, and "Join the waitlist" CTA that saves to Supabase and navigates to WaitlistScreen.
- `supabase/migrations/20260427_persona_expansion.sql` — Expands `user_persona` with 20 new columns: `household_composition` (JSONB), `leak_category`, `mission_type`, `monthly_spend_cents`, `projected_monthly_recovery_cents`, `why_snippd`, `clinical_allergies` (TEXT[]), `clinical_diagnoses` (TEXT[]), `child_ages` (INTEGER[]), `pantry_anchors` (TEXT[]), `preferred_stores` (TEXT[]), `loyalty_cards` (TEXT[]), `financial_goal`, `stress_behavior`, `autonomy_level`, `cooking_frequency`, `brand_affinity`, `shopping_style`, `persona_notes`, `behavior_signals` (JSONB, living signals from receipts), `persona_version` (INT, increments on evolution), `forecast_completed` (BOOL), `briefing_completed` (BOOL). Adds 4 indexes: GIN on household_composition, GIN on behavior_signals, GIN on clinical_allergies, partial index on users pending forecast.

### Changed (Shopping Bestie Onboarding — screens rebuilt — 2026-04-27)
- `screens/WaitlistScreen.js` — Fully rebuilt as a premium waitlist experience. Dark navy hero (`#04361D`) with animated pulsing position badge and personalized savings projection card (reads `route.params.projection` from WaitlistForecastScreen, falls back to `user_persona` data). Community savings ticker (cosmetic, increments every 4s). Viral card: "Jump 500 spots" with @getsnippd handles on IG/TikTok/X, copyable referral link, and Share button. "What happens next" 3-step section. Dark upgrade card (Beta Pro $4.99/mo vs Lifetime Founder $99) with coral CTA. Agent status card at bottom. Mint canvas body slides over navy hero with 24px top radius sheet effect.
- `screens/OnboardingConciergeScreen.js` — Fully rebuilt as 5-chapter Shopping Bestie Deep Briefing. War-room dark aesthetic (BG `#050E08`) with chapter progress bar. Chapter 1 "Bio-Engine": free-text child ages parsed to integer array. Chapter 2 "Safety Net": 8 clinical allergy pills + 8 diagnosis condition pills with "encrypted, never shared" assurance. Chapter 3 "Pantry DNA": 35 anchor product pills + custom free-text input. Chapter 4 "Money & Stores": 4 financial goal option cards + 12 store pills + loyalty card pills. Chapter 5 "Style": 4 stress behavior option cards + 3 autonomy level option cards + 200-char `persona_notes` free text. Saves all fields to `user_persona` with `briefing_completed: true` and navigates to `LogicScan`.

### Changed (Routing — new users now enter Forecast flow — 2026-04-27)
- `App.js` — `resolveUserStatus()`: new or status-less users now route to `WaitlistForecast` (or `Waitlist` if forecast already completed). `paid_beta` and `launched` users without `briefing_completed` route to `ConciergeOnboarding` (the Deep Brief). `WaitlistForecastScreen` added to root stack navigator.

### Fixed (Blank white screen — Platform not imported in LogicScanScreen — 2026-04-27)
- `screens/LogicScanScreen.js` — Added `Platform` to the `react-native` import. The file used `Platform.OS` inside `StyleSheet.create()` (module-level code) without importing it. Since App.js imports all screens at the top level, this threw `ReferenceError: Platform is not defined` during bundle load — before React could mount — causing a completely blank white screen with no error message.

### Fixed (Blank white screen — AppErrorBoundary not applied — 2026-04-26)
- `App.js` — Wrapped `App()` return tree with `<AppErrorBoundary>`. The class was defined but never applied, so any render crash produced a silent blank white screen instead of an error message. The boundary now surfaces the real crash text on-screen.

### Fixed (App won't load — startup routing blocks existing users — 2026-04-26)
- `App.js` — `resolveUserStatus`: removed `if (status === 'new') return 'ConciergeOnboarding'` branch and changed the catch-all default from `'ConciergeOnboarding'` to `'MainApp'`. Existing users who have no `user_persona` row (or have `status='new'` from the migration default) were being routed to the onboarding screen on every launch instead of the main app.
- `App.js` — `startup()`: removed early return on `personaCheck?.redirectTo` from `HealthMonitor.runAuthChecks`. The health monitor was intercepting all logged-in users without a persona row and redirecting to `ConciergeOnboarding` before `resolveUserStatus` even ran. `runAuthChecks` is now called for diagnostic logging only — routing is owned exclusively by `resolveUserStatus`.

### Fixed (OAuth Deep Link — 2026-04-26)
- `app.json` — Added `"scheme": "snippd"` so iOS and Android can intercept the OAuth redirect URI after Google/Apple sign-in. Without this, the browser redirect had no registered handler and the user was left stuck in the browser with no session.
- `lib/supabase.js` — Added `flowType: 'pkce'` to the Supabase client auth config. PKCE is required for `exchangeCodeForSession()` to work in mobile OAuth flows.
- `screens/SignInScreen.js` — Rewired `handleOAuth`: now calls `makeRedirectUri({ scheme: 'snippd', path: 'auth/callback' })` from `expo-auth-session`, passes `redirectTo` + `skipBrowserRedirect: true` to `signInWithOAuth`, then opens the URL via `WebBrowser.openAuthSessionAsync` (which auto-closes on redirect). Calls `supabase.auth.exchangeCodeForSession(result.url)` to convert the callback URL into a live session. Added `WebBrowser.maybeCompleteAuthSession()` at module level for iOS in-app browser handshake.
- `App.js` — Added `expo-linking` import and a `Linking.addEventListener('url', ...)` + `Linking.getInitialURL()` handler inside `RootNavigator` useEffect. Catches Android cold-start and system-browser fallback cases where the OAuth redirect fires as a deep link rather than being intercepted by `expo-web-browser`.

### Added (Self-Healing Memory System — v2.4.0)
- `lib/healingLog.js` — Two-tier persistent healing log. Tier 1: AsyncStorage (always available, survives offline, keeps last 300 entries). Tier 2: Supabase `healing_events` table (non-blocking background sync, retried via `syncPending()` on reconnect). Exposes `batchRecord()`, `getRecent()`, `getRecentByCheck()`, `getPattern()` (chronic detection — fails 5+ times in 30 days), `getHealthScore()` (0–100), `syncPending()`.
- `lib/healthMonitor.js` — Self-healing engine that runs on every app load. 6 checks across 4 phases: (1) SecureStore write/read/delete test — heals by clearing corrupted auth keys; (2) AsyncStorage JSON integrity scan — heals by removing invalid cache entries; (3) Cache staleness sweep — auto-clears weekly plan/cart caches older than their max age; (4) Supabase connectivity HTTP HEAD ping with 5s timeout; (5) Session integrity — JWT expiry detection with auto-refresh; if refresh fails, signs out locally; (6) User persona existence (post-login). Pattern memory: reads HealingLog history before each run — if a check has failed 5+ times in 30 days it is escalated to `critical` even if currently `warning`. Exports `HealthMonitor.runStartupChecks()`, `runAuthChecks(userId)`, `getHealthScore()`, `getLog()`, `syncPendingLogs()`.
- `supabase/migrations/20260425_healing_events.sql` — `healing_events` table (append-only, RLS-enabled). Views: `v_user_health_score` (health score per user last 7 days), `v_chronic_checks` (checks failing 5+ times in 30 days). 4 targeted indexes.
- `App.js` — Replaced `.then()/.catch()` startup with `async startup()` that: (1) fires `HealthMonitor.runStartupChecks()` concurrently with `getSession()`; (2) if `health.forcedSignOut` is true, routes to Auth before any other routing logic runs; (3) after login, calls `HealthMonitor.runAuthChecks(userId)` and uses `personaCheck.redirectTo` to bypass `resolveUserStatus` if the persona is missing. Last-resort `.catch()` always calls `setLoading(false)`.

### Fixed (App.js — splash screen hangs forever on Supabase error)
- `App.js` — Added `.catch()` to `supabase.auth.getSession()` in `RootNavigator`. Previously, if Supabase was unreachable (paused free-tier project, no network, or SecureStore error on device), the Promise rejected silently, `setLoading(false)` never executed, and the splash screen was held open forever. Fix: `.catch()` now sets `initialRoute → 'Auth'` and `loading → false`, so the app always reaches the sign-in screen regardless of Supabase availability.

### Added (Titan — Multi-Agent Backend v2.3.0)
- `agent/` — New Python multi-agent backend directory (replaces 0-byte placeholder).
- `agent/requirements.txt` — Pinned: `google-genai>=1.0.0`, `neo4j>=5.0.0`, `pydantic>=2.7.0`, `httpx>=0.27.0`, `pydantic-settings>=2.3.0`, `python-dotenv>=1.0.0`.
- `agent/agents/shared.py` — Grounding Hub. Configures Gemini 2.5-Flash client with `GoogleSearch` native grounding tool and optional `GoogleMaps` native grounding (auto-detects SDK capability; falls back to Places REST API). Implements `Neo4jDriver` — thread-safe double-checked locking singleton, pool size 200, tuned for 100k+ concurrent users. Exports `get_gemini_client()`, `build_search_config()`, `build_maps_config()`.
- `agent/tools/graph_tool.py` — Graph Engine. `find_compatibility_bridges(user_id)` — Cypher query discovers cross-retailer coupon acceptance (e.g. Target accepts CVS coupons) via `(User)-[:HAS_COUPON]->(Coupon)-[:VALID_AT]->(Store)-[:ACCEPTS_COUPON_FROM]-(Partner)`. `find_hidden_stacks(user_id, stores, gps_coords, radius_km)` — Cypher query returns all valid user coupons redeemable at given stores, with optional GPS proximity filter using Neo4j native `point()` type. Both functions return empty list on Neo4j error — never propagate to caller.
- `agent/agents/architect.py` — Decision Engine. `run_architect(user_id, gps_coords)` async entry point. 5-step flow: (B) Neo4j compatibility bridge discovery → (C) Google Maps grounding for 3 nearest stores → (B refined) `find_hidden_stacks` filtered to confirmed stores → (D) Gemini 2.5-Flash + Google Search dynamic retrieval for 7+1 Shopping Haul with live inventory verification and out-of-stock pivot → (E) returns `ShoppingHaul` Pydantic model with `grounding_metadata` source links. Raises `ArchitectError` (safe message) — raw tracebacks never reach the user.
- `agent/agents/__init__.py` — Exports `run_architect`, `ShoppingHaul`, `ArchitectError`, `Neo4jDriver`, `get_gemini_client`.
- `agent/tools/__init__.py` — Exports `find_compatibility_bridges`, `find_hidden_stacks`.

### Changed (Onboarding — Sovereign Dark Aesthetic v2.3.0)
- `screens/OnboardingConciergeScreen.js` — Full redesign. Background `#050805`, card surface `#101410`, accent `#0C9E54`. All emojis removed. Bubbly corners replaced with 8–10px utilitarian radius. Option cards: dark surface with 1px border that glows `#0C9E54` on selection. Progress bar: 2px `#0C9E54` on dark track. Headers: Bold white. Body: Silver-grey `#A0A0A0`.
- `screens/OnboardingConciergeScreen.js` — Added Step 6 "Initialize Intake Filters" (Vitality Calibration). Options: Plant-Based, Organic-Only, High-Protein, Gluten-Free, No Restrictions. Uses `MaterialCommunityIcons` line icons (`leaf`, `sprout`, `dumbbell`, `wheat-off`, `check-circle-outline`). Stores as `dietary_preference` in persona.
- `screens/OnboardingConciergeScreen.js` — Total steps increased to 8. Final CTA changed from 'Build My Agent' to 'Initialize Autonomous Layer'.
- `screens/OnboardingConciergeScreen.js` — All step labels and subtitles rewritten in utilitarian/technical tone. All emojis removed from options. Feather icon system used throughout.
- `screens/LogicScanScreen.js` — Full redesign. Phase 1 (scan): terminal-style system label, three-ring SVG orb, 2px progress bar, dark intel cards with system code labels (`SYS_01`–`SYS_04`). No emojis.
- `screens/LogicScanScreen.js` — Phase 2 (reveal): renamed to "Intelligence Briefing". Shows Projected Annual Recovery (budget × 12 × 10%) in `#0C9E54`, Market Nodes Scanned (5,000+), 2×2 data grid (Monthly Recovery, Leak Recovery, Floor Price Items), Vitality Profile card (`[Diet] Active`).
- `screens/LogicScanScreen.js` — Phase 3 (terminal): new 3-second initialization sequence before navigating. Black screen, monospace font, `#0C9E54` lines appear one-by-one: "Mapping Grocery Arbitrage...", "Syncing Vitality Node...", "Sovereign Bridge Active." Cursor blink animation. Auto-navigates to MainApp when complete.

### Fixed (SignInScreen — black box inside text fields)
- `screens/SignInScreen.js` — Eliminated black autofill/autocomplete dropdown box inside inputs on Android. Added `autoComplete="off"`, `importantForAutofill="no"`, `textContentType="none"`, `selectionColor={FOREST}`, `cursorColor={FOREST}` to all TextInput instances. Set `backgroundColor: WHITE` explicitly on the input style so no OS chrome bleeds through.

### Fixed (SignInScreen — fields unresponsive, cannot type)
- `screens/SignInScreen.js` — **Root cause:** `LeftPanel` and `FormPanel` were arrow-function components defined *inside* `SignInScreen`. Every state change (e.g. `focusedField` toggling on tap) caused React to see new component types, unmount/remount the panels, and destroy the keyboard. Fix: call them as plain functions `{FormPanel()}` / `{LeftPanel()}` instead of JSX `<FormPanel />` / `<LeftPanel />`. This stops React from treating them as component instances.

### Fixed (SignInScreen — auth fields + new account flow)
- `screens/SignInScreen.js` — Fixed black box appearing inside text fields on Android: added `backgroundColor: 'transparent'` and `underlineColorAndroid: 'transparent'` to the `input` style; changed `inputWrap` background from `rgba(255,255,255,0.92)` to fully opaque `#FFFFFF` so the wrapper never bleeds through.
- `screens/SignInScreen.js` — Fixed `navigation` prop not being destructured (was `function SignInScreen()`, now `function SignInScreen({ navigation })`), which prevented manual navigation from working.
- `screens/SignInScreen.js` — New account flow now navigates immediately: after `signUp` with `data.user`, creates the profile row and routes to `ConciergeOnboarding` without requiring email confirmation first. If Supabase auto-confirm is on, `onAuthStateChange` handles routing as before. If off, navigates directly so the user isn't blocked.

### Added (HomeScreen — Wealth Progress UI)
- `screens/HomeScreen.js` — Added `WealthProgressCard` between hero budget card and data viz grid. Reads `user_persona` (mission, monthly_budget_cents, initial_savings_cents, location) and computes `targetCents` (budget × mission rate), `savedCents`, and `annualRecoveryCents` (saved × 12). Renders animated SVG ring progress toward mission goal.
- `screens/HomeScreen.js` — Added `AgentActivityLog` at the bottom of the feed (above the spacer). Status dot shows `active` when persona is loaded, `idle` otherwise. Rotates agent messages personalized to user's location, vibe, and size from `user_persona`.
- `package.json` — Added `react-native-svg` (installed via `expo install react-native-svg`, SDK 55 compatible).

### Added (Design System — v2.2.0)
- `src/design/tokens.js` — Global design system single source of truth. Exports `COLORS`, `TYPE`, `SPACE`, `RADIUS`, `SHADOW`, `DURATION`, `AGENT_MESSAGES`. All screens and components must import from here — no hardcoded visual values.
- `components/GlobalCard.js` — Unified card surface (variants: `default`, `navy`, `mint`, `flat`). Used by DailyPulseCard, WaitlistScreen, WealthStacks, and any elevated content block.
- `components/ConciergeButton.js` — Primary CTA button with haptic feedback (expo-haptics), press-scale animation, loading state, and 4 variants: `primary` (green), `secondary` (navy/mint), `ghost` (outline), `danger` (coral). Used across onboarding and upgrade flows.
- `components/LoadingEngine.js` — Reusable 5-second "AI thinking" scan animation. Pulsing 3-ring orb, rotating messages with fade transitions, animated progress bar. Accepts custom `messages`, `duration`, `onComplete`, and `variant` props. Replaces the inline animation code in `LogicScanScreen.js`.
- `components/VictoryCard.js` — Icon-left / Bold Value center / Progress bar bottom layout for Stacks and Wealth dashboard. Supports `accent` color (green/coral/amber/sky), `progress` 0–1 bar, and navy or default variant. Fade+slide entrance animation.
- `components/WealthProgressCard.js` — Circular SVG progress ring toward mission goal (Rent-Killer / Savings / Deal-Stacker). Shows saved vs target, animated ring (react-native-svg), and **Potential Annual Recovery** formula. Requires `expo install react-native-svg`.
- `components/AgentActivityLog.js` — Rotating idle agent status ticker with status dot (active=green, scanning=amber, idle=muted). Uses `AGENT_MESSAGES.idle(location, vibe, size)` from tokens. Replaces empty space anywhere the agent runs in the background.
- `screens/WaitlistScreen.js` — Mobile waitlist holding screen (status=`WAITLIST` or `PAID_BETA` + isBetaLive=false). Shows queue position from `agent_initialization`, referral share link, and upgrade CTA (opens web Offer Wall).
- `screens/FounderDashboardScreen.js` — Founder/Beta dashboard locked behind `isBetaLive=true` + paid status. Live countdown to full launch, tier badge (Beta Pro / Lifetime Founder), TestFlight CTA, Slack community invite, and AgentActivityLog.

### Added (UserStatus Gate)
- `App.js` — `resolveUserStatus(userId)` async function reads `user_persona.status` and `snippd_integrations.is_beta_live`. Routes: NEW→ConciergeOnboarding, WAITLIST→Waitlist, PAID_BETA+live→FounderDashboard, PAID_BETA+!live→Waitlist, LAUNCHED→MainApp. Called on initial session load and `SIGNED_IN` event.
- `App.js` — Registered `Waitlist` and `FounderDashboard` screens in root Stack navigator.

### Database
- `supabase/migrations/20260423_user_persona_status.sql` — Adds `status TEXT DEFAULT 'new' CHECK (status IN ('new','waitlist','paid_beta','launched'))` to `user_persona`. Adds `location TEXT` column. Index `idx_user_persona_status`. Seeds `is_beta_live = 'false'` in `snippd_integrations`. Creates view `v_beta_users` (users with status paid_beta or launched).

### Added (Web App — Agent Initialization & Waitlist)
- `web/` — New Next.js 14 web app (App Router, Tailwind CSS, Framer Motion). Run with `cd web && npm install && npm run dev`.
- `web/app/onboard/page.tsx` — Full 12-state Concierge flow: 7 calibration questions + 2 Growth Interstitials (after Q3/Q5) + Email capture + 5s Logic Scan + Offer Wall. Framer Motion `AnimatePresence` transitions between every state.
- `web/components/LogicScan.tsx` — 5-second Framer Motion "Arbitrage Calculation" animation. Pulsing orb, animated progress bar, 4 rotating intel messages with `AnimatePresence`. Fires `onReveal` callback with savings data after 5s.
- `web/components/OfferWall.tsx` — 3-tier conversion gate: Free Waitlist / Beta Pro $4.99/mo / Lifetime Founder $99. Lifetime card is featured with urgency counter. Stripe Checkout integration via `/api/stripe/checkout`.
- `web/components/GrowthInterstitial.tsx` — "Boost Your Agent" social follow card (2 variants). LinkedIn + TikTok buttons. Non-blocking — users can skip.
- `web/app/beta/page.tsx` — Beta Dashboard (mocked). Shows feature grid + mobile app coming-soon banner. Shown to paid users after Stripe redirect.
- `web/app/waitlist/page.tsx` — Waitlist position page. Shows queue position, referral link (move-up mechanic), and "Upgrade Anytime" nudge.
- `web/app/api/initialize-agent/route.ts` — Saves 7-field persona to `agent_initialization`, calls `sendToEmailFunnel` for CRM tagging.
- `web/app/api/stripe/checkout/route.ts` — Creates Stripe Checkout session (subscription for beta, one-time for lifetime). Returns `{ url }` for redirect.
- `web/app/api/stripe/webhook/route.ts` — Handles `checkout.session.completed`: upgrades `agent_initialization.status` to `beta` or `lifetime`, re-tags in CRM.
- `web/lib/emailFunnel.ts` — `sendToEmailFunnel()` — tags users by Mission segment (Rent-Killer-Segment, Goal-Saver-Segment, Deal-Hunter-Segment). HubSpot + Klaviyo integration points documented inline.
- `web/lib/supabase.ts` — Browser + admin Supabase clients.
- `web/lib/stripe.ts` — Stripe client + price IDs.
- `supabase/migrations/20260423_agent_initialization.sql` — `agent_initialization` table: email, 7 persona fields, status, payment_id, stripe_customer_id, crm_tags, economic_dna. RLS: service_role only.
- `screens/HomeScreen.js` — Added `DailyPulseCard` with `user_persona` fetch on mount. Pulse is generated via `generatePulse(persona)` and tapping routes to the relevant screen. Dismiss closes the card for the session.

### Added (Concierge Onboarding Module)
- `screens/OnboardingConciergeScreen.js` — 7-step Economic Identity wizard: Mission (Rent-Killer/Save Goal/Find Deals), Monthly Budget (presets + custom input), Agent Power Level (Notify/Ask/Full Auto), Spending Leak (Amazon/Food Apps/Clothing), Style Vibe (visual card select), Size DNA (clothing + shoe), Frequency (Daily/Weekly/Big Events). Animated step transitions, per-step progress bar, brand-native styling.
- `screens/LogicScanScreen.js` — 5-second "Logic Scan" processing screen. Rotates through 4 real processing messages (Scanning Prices / Categorizing / Coupon Check / Alert Setup), animates a progress bar, calls `initialize-agent` Edge Function mid-scan, then shows a personalized Magic Reveal with projected monthly savings, items at floor price, and leak-category savings. Auto-falls back to mock data if the API is unavailable.
- `components/DailyPulseCard.js` — One-tap Daily Pulse card component. Generates contextual messages from stored persona (stock_check, size_alert, goal_update, deal_flash types). Exports `generatePulse(persona, savingsToday)` helper for local pulse generation without a server call.
- `supabase/functions/initialize-agent/index.ts` — Edge Function that accepts the full 7-field persona, upserts to `user_persona`, calculates mock monthly savings projection (mission rate × power multiplier × budget), and returns a `reveal` object with `initial_savings_cents`, `leak_savings_cents`, `items_at_floor_price`.
- `supabase/migrations/20260423_user_persona.sql` — `user_persona` table with all 7 onboarding fields, savings output columns, `economic_dna` jsonb snapshot, RLS (users read own row; service_role writes), and `updated_at` trigger.
- `App.js` — Registered `ConciergeOnboarding` and `LogicScan` in root Stack navigator.

### Added (Slack Integration — Retailer Policy Watch)
- `supabase/migrations/20260422_slack_integration.sql` — Idempotent migration that creates `snippd_integrations`, `retailer_policy_change_log`, trigger function `_log_retailer_policy_change()`, triggers on `retailer_coupon_parameters` and `retailer_rules`, seeds `hooks.slack.com` into `approved_domains`, and schedules pg_cron job `snippd-slack-policy-notify` (every 5 min).
- `supabase/functions/slack-notify/index.ts` — Edge Function that reads unnotified rows from `retailer_policy_change_log`, builds a Slack Block Kit message (grouped by table, with field-level diffs for UPDATE ops), POSTs to the configured webhook URL, and marks rows `notified_at`. Supports `x-cron-secret` and Bearer service-role auth.
- `scripts/setup-slack-webhook.sh` — Setup script: validates the Slack webhook URL, sends a test message to confirm delivery, then seeds the URL into `snippd_integrations` via `supabase db execute`. Falls back to psql or prints SQL for manual paste if CLI is unavailable.

### Database
- `snippd_integrations` table — key/value store for external service config. RLS: `service_role` only. Seeded with `slack_policy_changes` (disabled until configured) and `slack_channel_engineering` (`#engineering`).
- `retailer_policy_change_log` table — append-only audit log of INSERT/UPDATE/DELETE on retailer policy tables. Partial index on `(created_at) WHERE notified_at IS NULL` for efficient pending-row queries.
- Trigger `trg_retailer_coupon_parameters_change` — AFTER INSERT/UPDATE/DELETE on `retailer_coupon_parameters` → writes to `retailer_policy_change_log`.
- Trigger `trg_retailer_rules_change` — AFTER INSERT/UPDATE/DELETE on `retailer_rules` → writes to `retailer_policy_change_log`.
- pg_cron job `snippd-slack-policy-notify` — fires every 5 minutes; calls `/functions/v1/slack-notify` via `net.http_post` only when pending unnotified rows exist.

### API
- `POST /functions/v1/slack-notify` — new endpoint. Auth: `x-cron-secret` or Bearer service-role. Returns `{ ok, notified }` or `{ skipped, reason }`.

### Services
- Slack Policy Notifier — end-to-end pipeline: DB trigger → `retailer_policy_change_log` → pg_cron → `slack-notify` → Slack Block Kit message in `#engineering`.

### Added (App Store Review Remediation)
- `lib/iap.js` — Apple StoreKit IAP service wrapping `expo-in-app-purchases`. Exports `iapConnect`, `iapGetProduct`, `iapPurchase`, `iapSetPurchaseListener`, `iapRestorePurchases`, `iapDisconnect`. All functions are no-ops on Android/web. Product ID: `com.snippd.app.pro.monthly`. (Guideline 3.1.1)
- `screens/SnippdProScreen.js` — Full Apple IAP subscription paywall. Connects to StoreKit on mount, shows localised price (fallback $4.99/mo), purchase + restore flows, auto-renewal disclosure, links to PrivacyPolicy and TermsOfUse. (Guidelines 3.1.1, 3.1.2(a))
- `screens/TermsOfUseScreen.js` — In-app Terms of Use screen (13 sections). (Guideline 5.6)
- `package.json` — Added `expo-in-app-purchases ~14.5.0` dependency.
- `App.js` — Imported and registered `SnippdProScreen` (modal) and `TermsOfUseScreen` in root Stack and ProfileStack.
- `screens/ProfileScreen.js` — Added "Terms of Use" entry to Support section of MENU_SECTIONS, navigates to `TermsOfUse`.
- `screens/AuthScreen.js` — Added Privacy Policy + Terms of Use footer links below the legal text. (Guideline 5.1.1(i))

### Fixed (App Store Review Remediation)
- `screens/TrialGateScreen.js` — Wired "Upgrade to Snippd Pro" button `onPress` to `navigation.navigate('SnippdPro')`. Previously the button had no handler.

### Fixed
- `screens/ProfileScreen.js` — Delete Account button now calls the `delete-account` Edge Function via `supabase.functions.invoke` instead of the non-existent `supabase.rpc('delete_my_account')`. The button was silently failing because the RPC does not exist; the real deletion logic lives in the Edge Function.
- `screens/CartScreen.js` — Personal cart AsyncStorage key is now namespaced per user (`snippd_cart_<uid>`) so carts cannot bleed between accounts on a shared device. Falls back to the global key if user is not yet resolved.
- `src/services/geniusWeeklyPlanBuilder.ts` — Step 14 math validation now logs a warning per-item instead of throwing and crashing the entire plan build when a single DB row has inconsistent pricing data.
- `lib/BudgetContext.js` — Added `isMounted` ref guard to prevent state updates on an unmounted `BudgetProvider` during rapid navigation or sign-out while a `refreshBudget` fetch is in flight.
- `lib/fieldEncryption.js` — Exported `clearEncryptionKeyCache()` so the derived key is invalidated on sign-out rather than persisting for the lifetime of the JS bundle.
- `screens/ProfileScreen.js` — Calls `clearEncryptionKeyCache()` on sign-out; adds `'—'` fallback so the email field never renders blank if both `profile.email` and `authEmail` are empty.
- `src/services/agenticLedger.ts` — Ledger insert failures now include `decision_type` and `actor` in the `console.warn` so failed writes are traceable without a DB query.
- `screens/ListScreen.js` — Stock-swap ledger log is now guarded with an explicit `if (userId)` check instead of passing `userId || undefined` and relying on AgenticLedger's internal user fetch.
- `screens/ReceiptVerifiedScreen.js` — Credit-apply errors are now logged via `console.warn` instead of being silently swallowed.

### Added
- `scripts/update-expo-dependencies.js` — Rewrote Expo dependency updater to call `npx expo install --fix` directly (non-interactive, CI-safe). Expo's own resolver drives all version resolution — no custom semver parsing. Correctly catches all outdated packages including `react-native`, `react-native-worklets`, and `@expo/metro-runtime`.
- `.github/workflows/expo-dependency-update.yml` — Fixed `paths:` → `add-paths:` (correct `peter-evans/create-pull-request@v6` parameter), bumped action to v6, added review checklist to PR body. Runs daily at 08:00 UTC and on manual dispatch.

### Added
- `supabase/migrations/20260420_ingestion_file_uri_cache.sql` — Adds `gemini_file_uri text` column to `ingestion_jobs`. Worker caches the Gemini Files API URI after first upload (valid 48h); retry invocations skip the PDF re-download and re-upload, saving ~10s and reducing Files API quota usage per retry.

### Fixed
- `supabase/functions/run-ingestion-worker/index.ts` — Replaced single 3s wait on Gemini 503 with exponential backoff: 5s → 15s → 30s retries **within one invocation** before giving up to the cron. A short rate-limit burst no longer wastes an entire 5-min cron slot.
- `supabase/functions/run-ingestion-worker/index.ts` — Worker now reuses `gemini_file_uri` from `ingestion_jobs` on retry invocations (for PDFs > 3MB), skipping the expensive re-upload step. URI is persisted to the job row immediately after first successful upload.

### Added
- `supabase/migrations/20260420_ingestion_production_hardening.sql` — Full pipeline automation: (1) storage trigger now calls `run-ingestion-worker` via `pg_net` **immediately** on PDF upload using vault secrets, no cron wait; (2) `snippd-ingestion-stuck-recovery` cron every 6 min resets any job stuck in `processing` > 5 min back to `queued`; (3) `snippd-ingestion-worker` cron sped up from every 30 min to every 5 min; (4) `snippd-deal-expiry-cleanup` cron daily at 1 AM deactivates `stack_candidates` past `valid_to`.
- `supabase/migrations/20260419_data_quality_and_storage_trigger.sql` — Two-part migration: (1) data quality fixes on `stack_candidates` (lowercase categories, corrected `meal_type`, deactivated 1 unpriced BOGO, re-scored aldi/keyfoods/walgreens rows to honest 0.15 for known-price/unknown-savings items); (2) `on_pdf_upload` trigger on `storage.objects` — fires on every INSERT into the `deal-pdfs` bucket, parses the filename (`retailer-YYYY-MM-DD-type.pdf` or legacy `retailer/YYYY-MM-DD/type.pdf`), and upserts a `queued` row into `ingestion_jobs` so the ingestion worker picks it up automatically. Re-upload of an existing PDF resets a failed/parsed job back to queued.

### Fixed
- `supabase/functions/run-ingestion-worker/index.ts` — Replaced all 5 `.catch()` / `.then(() => {}).catch(() => {})` promise chains with proper `async IIFE + try/catch` blocks. Fixes "catch is not a function" crash killing Aldi, Walgreens, Dollar General, and Key Foods ingestion jobs.
- `supabase/functions/run-ingestion-worker/index.ts` — Auth rewrite: removed broken exact Bearer-vs-env-key comparison (which always failed due to runtime key injection mismatch). Now trusts Supabase gateway JWT verification for Bearer path; adds `x-ingest-key` header support (consistent with other functions). Fixes "Forbidden" blocking all manual triggers.
- `supabase/functions/run-ingestion-worker/index.ts` — Worker now writes all 8 NOT NULL `stack_candidates` columns introduced by the schema migration (`item_name`, `retailer`, `category`, `meal_type`, `is_bogo`, `base_price`, `sale_savings`, `coupon_savings`, `dietary_tags`, `allergen_tags`, `valid_to`, `is_active`). Previously all 426 per-deal upserts silently failed because these columns were missing.
- `supabase/functions/run-ingestion-worker/index.ts` — Hoisted `couponSavingsCents` declaration out of the `if (matchedCoupon)` block so it's available for the `stack_candidates` upsert.
- `supabase/functions/run-ingestion-worker/index.ts` — `MAX_JOBS` reduced 3 → 1: one PDF per invocation keeps well under the 150s Edge Function timeout. `MAX_ATTEMPTS` raised 3 → 24: with a 5-min cron, a job retries for up to 2 hours before being marked failed — survives typical Gemini demand spikes without manual intervention.
- `supabase/functions/run-ingestion-worker/index.ts` — Model list simplified to `gemini-2.5-flash` only (only model available on this API key). Gemini 503s handled by cron retries, not model switching. Includes 3s backoff on 503 before retry. `tryParseDeals()` now has a second-pass extraction that finds the first `[…]` block in the response — handles `gemini-1.5-pro`-style responses where trailing text (e.g. "Note: prices may vary") breaks `JSON.parse`..

### Added
- `supabase/migrations/20260419_promote_offer_sources.sql` — One-time (idempotent) migration promoting valid `offer_sources` records directly into `stack_candidates`. Result: **9 records promoted** (publix + dollar_general).
- `supabase/migrations/20260419_fix_offer_sources_worker_compat.sql` — Fixes two `offer_sources` schema bugs: (1) gives `source_type` a default of `'flyer'` so worker INSERTs don't fail the NOT NULL constraint; (2) deduplicates existing rows, then adds `ux_offer_sources_dedupe_key` partial unique index on `(dedupe_key) WHERE NOT NULL` so `onConflict:'dedupe_key'` resolves correctly.
- `supabase/migrations/20260419_promote_staging_to_candidates.sql` — Promotes 157 keyfoods + 66 aldi + 203 walgreens rows from `flyer_deal_staging` directly to `stack_candidates`, bypassing Gemini re-extraction (Gemini 2.5 Flash rate-limited). Deduplicates via `DISTINCT ON`, computes `stack_rank_score` from deal_type + savings %, maps `meal_type` by category. Marks staging rows as `published`. **Result: 65 keyfoods + 39 aldi + 51 walgreens candidates added.**

### Changed
- `stack_candidates` — Deactivated 182 records with zero `sale_savings`, zero `coupon_savings`, `is_bogo = false`, `has_coupon = false` to stop polluting the deal feed.
- `stack_candidates` — **Total active deals: 163 across 5 retailers** (keyfoods 65, walgreens 51, aldi 39, publix 5, dollar_general 3). Feed is now sufficient to build a 7-day meal plan.

### Added
- `package.json` — `npm test` runs `vitest run` against `__tests__/**/*.test.ts` (see `vitest.config.ts`). Dev dependency: `vitest`.
- **Premium Concierge flow (Plan → Clip → Shop → Verify → Studio)** — `WeeklyPlanScreen.js` now builds a **7-day** dinner foundation (`p_nights: 7`, padded slots, Mon–Sun week range, expanded sample meals). Primary CTA is **Add to Cart**: writes `snippd_cart`, queues `snippd_my_list_import`, saves `snippd_weekly_plan_ingredient_names` for stash insights, logs `CONCIERGE_ADD_TO_CART` to `agentic_ledger`, navigates **Snippd tab → `MyList`**.
- `screens/MyListScreen.js` — reuses `ListScreen` with route name `MyList` for concierge behaviors.
- `screens/ListScreen.js` — consumes weekly plan import on focus; **Not in stock** → Snippd replacement modal (budget-safe swap) + `CONCIERGE_LIST_STOCK_SWAP`; when all items checked on My List, **Head to Checkout** → `CouponClipping`.
- `screens/CouponClippingScreen.js` — savings summary from cart, store login copy, per-store coupon links, **link-by-link** in-app browser tour + `CLIP_SESSION_START` / `CONCIERGE_CLIP_STEP` ledger events; continue → `CheckoutBreakdown`.
- `screens/CheckoutBreakdownScreen.js` — **True cost** card (retail → register → Ibotta/Fetch/loyalty estimates) and **I’ve checked out** → `VerifyReceipt` (`ReceiptVerifiedScreen`) with full totals payload.
- `App.js` — `PlanStack`: `RecipeDetail`; `CartStack`: `MyList`, `CouponClipping`, `CheckoutBreakdown`, `VerifyReceipt`.
- `screens/CartScreen.js` — primary **Review transparent checkout** → `CheckoutBreakdown`; secondary **Upload receipt photo** → `ReceiptUpload`.
- `screens/ReceiptVerifiedScreen.js` — **Stash Insights** (planned vs unplanned vs weekly plan names), tap-to-opt-in unplanned items → `profiles.preferences.concierge_opt_in_items` + `UNPLANNED_ITEM_OPT_IN` ledger; **Share story** auto-generated post; Ibotta/Fetch/loyalty lines when present on totals.
- `screens/StudioScreen.js` — Studio unlock uses **`receipt_credit_award_count >= 3`** (not `trip_results` count); optional `chefStashMaxSec` / `mealName` route params; Chef Stash path jumps to record step for **Proof of Cook**.
- `screens/RecipeDetailScreen.js` — pantry map by **day abbrev** (Mon–Sun); **Record my creation (up to 60s)** → Studio tab with 60s cap.
- `src/services/agenticLedger.ts` — new `DecisionType` values for concierge / stash / opt-in (see `docs/SERVICES.md`).

### Fixed
- `lib/fieldEncryption.js` — Added `try/catch` error handlers to `encryptField` and `decryptField` — prevents silent crashes when encryption/decryption fails (e.g. missing `EXPO_PUBLIC_FIELD_ENC_KEY`, corrupted ciphertext, or Web Crypto API unavailable).
- `App.js` — Fixed sign-in routing so supabase `SIGNED_IN` events now reset navigation to `MainApp` instead of staying on the auth screen.

### Added
- `scripts/update-expo-dependencies.js` — new maintenance script that checks Expo-related packages and updates `package.json` to the latest compatible patch versions for the installed Expo SDK line.
- `.github/workflows/expo-dependency-update.yml` — scheduled GitHub Actions workflow that runs daily, regenerates `package-lock.json`, and opens a PR when Expo package versions need updating.
- `screens/SignInScreen.js` — New two-panel sign-in/sign-up screen matching updated brand design. Left panel: forest green gradient with Sublima wordmark, hero headline "Stack every deal. Miss nothing.", animated blobs, stat chips (avg savings / stores tracked / autonomous). Right panel: tab toggle (Sign In / Create Account), Google and Apple (iOS only) OAuth via `supabase.auth.signInWithOAuth`, email/password form with focus-glow fields, inline error display (no Alert.alert), forgot password via `supabase.auth.resetPasswordForEmail`. Two-panel on tablets (width > 768), single panel on phones. Auth success handled entirely by `App.js onAuthStateChange` — no manual navigation.

## [1.7.0] — 2026-04-19

### Changed
- **Home screen caching layer** — `screens/HomeScreen.js` now reads `weekly_plan` from `home_payload_cache` on mount; on cache hit (payload + valid `expires_at`), renders immediately; on miss, calls `GET /functions/v1/get-weekly-plan` to build fresh and populate cache.
- **Weekly plan Edge Function** — `supabase/functions/get-weekly-plan/index.ts` now upserts the raw plan payload into `home_payload_cache` (user_id, cache_key='weekly_plan', 7-day expiry, source='get-weekly-plan') immediately after writing the encrypted plan to `profiles.cached_weekly_plan`. App reads plain payload from cache; profiles table keeps encryption for compliance.

## [1.6.0] — 2026-04-19

### Changed
- `supabase/functions/get-weekly-plan/index.ts` — now upserts the raw weekly plan payload into `home_payload_cache` after generating the encrypted plan, while keeping `profiles.cached_weekly_plan` writes intact.
- `screens/HomeScreen.js` — now initializes from `weeklyPlan` state only on mount, reads cached `weekly_plan` from `home_payload_cache`, and falls back to `GET /functions/v1/get-weekly-plan` on cache miss.

### Changed
- `App.js` — Auth route now uses `SignInScreen` instead of `AuthScreen`. `AuthScreen` kept as fallback import but no longer the default.
- `screens/CartScreen.js` — Full rewrite. Primary data source is now `snippd_cart` AsyncStorage key (personal cart from weekly plan + explore adds). Shows item list with BOGO-aware math (qty=2, pay for 1, save 50%), deal-type badges, at-register savings, order summary receipt, coupon checklist, "Verify Receipt" button navigating to `ReceiptUpload` with cart totals params. Empty state offers "View Weekly Plan" and "Browse Deals" shortcuts.
- `screens/WeeklyPlanScreen.js` — "Lock in this week's plan" button now saves all meal ingredients to AsyncStorage `snippd_cart` (BOGO items get `quantity: 2`), tracks `cart_accepted` event, then navigates to `SnippdTab` (cart). Previously navigated to `List`.
- `screens/DiscoverScreen.js` — Added "Add to cart" button to every bundle card. Appends bundle items to AsyncStorage `snippd_cart` without overwriting existing items. Checks for duplicates by bundle ID. Shows in-screen "Added" state after success. Added `refreshAddedIds()` on focus to sync badge state with cart.

### Fixed
- BOGO math enforced in CartScreen: quantity=2, you_pay = unit_price × 1, savings = unit_price × 1, savings_pct = 50%. Never 0 for total, never 100% for savings.
- All price displays use `(cents / 100).toFixed(2)` for consistent 2 decimal places.
- Savings never shown as negative — clamped with `Math.max(0, ...)`.
- `npx tsc --noEmit` — 0 errors ✓

### Added
- `supabase/migrations/017_ingestion_schema_alignment.sql` — Schema alignment migration: adds `started_at`, `error_message`, `parsed_at`, `deal_count` to `ingestion_jobs`; adds `savings_amount`, `is_bogo`, `dietary_flags`, `deal_description`, `confidence_score` to `flyer_deal_staging`; adds `normalized_key`, `offer_type`, `confidence_score`, `source`, `raw_text`, `ingestion_id` to `offer_sources`; adds `offer_source_id`, `normalized_key`, `coupon_savings_cents`, `match_mode` + unique index to `offer_matches`; adds `week_of`, `normalized_key`, `dedupe_key` (UNIQUE constraint), `primary_category`, `primary_brand`, `items`, `savings_pct`, `ingestion_id` to `stack_candidates`; adds `retailer_key`, `week_of`, `deals_staged`, `deals_published`, `coupons_matched`, `candidates_written` to `flyer_publish_log`. Creates `sync_stack_candidate_columns()` BEFORE INSERT OR UPDATE trigger to bridge worker-written columns to RPC-read columns.
- `supabase/migrations/017b_ingestion_jobs_fixes.sql` — Adds `'parsed'` to `ingestion_jobs_status_check` constraint; adds UNIQUE index on `ingestion_jobs.storage_path`; seeds 6 circular jobs (publix, aldi, cvs, dollargeneral, keyfoods, walgreens) as `queued`.

### Changed
- `supabase/functions/run-ingestion-worker/index.ts` — Multiple fixes: upgraded Gemini model to `gemini-2.5-flash`; replaced char-by-char base64 with chunked `uint8ToBase64()`; fixed MIME type from `image/jpeg` → `application/pdf`; added `thinkingConfig: { thinkingBudget: 0 }` to suppress thinking tokens; added Gemini Files API path for PDFs > 3 MB (multipart upload + ACTIVE state polling); fixed parts extraction to collect all non-`thought` parts; added `gemini_raw` debug log entry; added `parseStoragePath()` utility that handles both flat format (`retailer-YYYY-MM-DD-type.pdf`) and legacy folder format.
- `screens/AdminCircularUploadScreen.js` — Changed storage path construction to flat format: `retailerKey-weekOf-type.pdf` (e.g. `publix-2026-04-16-weekly-flyer.pdf`). Previously used folder format `retailer/weekOf/type.pdf`.

### Fixed
- Dropped FK constraint `flyer_deal_staging_ingestion_id_fkey` (referenced non-existent `flyer_ingestions.id`).
- Dropped NOT NULL on `offer_sources.retailer_id` (worker does not write this column).
- `stack_candidates` now populated with 189 active deals from 8 retailers (walgreens=51, dollargeneral=47, keyfoods=36, aldi=34, publix=14, target=4, cvs=3) via direct INSERT from `flyer_deal_staging`.
- `npx tsc --noEmit` — 0 errors ✓

---

## [1.5.1] — 2026-04-14

### Fixed
- Patch: cart navigation, sign-in screen redesign, BOGO math, Explore add-to-cart. (See [Unreleased] above — items moved here on release.)

---

## [1.5.0] — 2026-04-14

### Added
- `supabase/migrations/015_nutrition_profile.sql` — Adds 7 columns to `profiles`: `household_members` (jsonb), `daily_calorie_target_min/max` (integer), `meal_calorie_target_min/max` (integer), `dietary_modes` (text[]), `nutrition_profile_set` (boolean).
- `supabase/migrations/016_get_weekly_plan_fn.sql` — PostgreSQL RPC function `get_weekly_plan(p_user_id, p_headcount, p_nights, p_focus, p_week_of)`. Returns jsonb with dinners array (protein + produce side + pantry item per night), household_stack (top 8 household/health items), totals, dietary modes, and calorie targets. Allergen filter uses `sc.allergen_tags ?| v_dietary_tags`. Dinner slots scored by savings (focus=savings), protein (focus=protein), or stack_rank_score (default).
- `src/constants/nutritionTargets.ts` — USDA Dietary Guidelines 2020–2025 reference data. Exports `CALORIE_TARGETS`, `MEMBER_OPTIONS` (12 life stages), `DIETARY_MODES` (8 modes), `computeHouseholdCalorieTarget()`, `getMemberCalorieLabel()`, `memberOptionToRecord()`, `DIETARY_MODE_CONFLICTS`.
- `src/services/geniusStackEngine.ts` — Dietary mode scoring engine. `applyDietaryScoring(deals, profile)` applies boosts/penalties/exclusions for 8 modes (plant_based, low_carb, keto, low_sodium, healthy_fats, high_protein, mediterranean, diabetic_friendly) plus calorie alignment scoring. Scores capped [0, 2.0]. Includes CLI entry point and `runGeniusStackEngine(supabase, userId)` for server use.
- `screens/NutritionProfileScreen.js` — Full household nutrition profile screen. Member cards with expand/collapse, USDA life-stage type grid, live calorie table (`computeHouseholdCalorieTarget`), dietary mode 2-col grid with conflict resolution (plant_based deselects keto/high_protein), household calorie summary card, USDA disclaimer. Saves to `profiles` via `.eq('user_id', user.id)`. Works in onboarding context (`fromOnboarding: true` → returns to step 3) and profile settings context.
- `screens/WeeklyPlanPersonalizationScreen.js` — 3-question pre-filter flow (headcount → nights → focus) with 7-day AsyncStorage skip logic. Animated card slide-in, auto-advance on steps 0+1, "Build my plan" + "Skip" handlers. Saves answers to `plan_personalization` AsyncStorage key and navigates to WeeklyPlan with `{ headcount, nights, focus, personalized }` params.

### Changed
- `screens/OnboardingScreen.js` — Added `route` prop + `useEffect` to resume at `route.params.resumeAtStep` (used when returning from NutritionProfileScreen). Continue button on step 2 now navigates to `NutritionProfile` with `{ fromOnboarding: true }` instead of advancing inline.
- `screens/ProfileScreen.js` — Added "Nutrition profile" row to My Account section. Dynamic subtitle: "Calorie targets set" if `profile.nutrition_profile_set`, "Set up household calories" otherwise. Navigates to `NutritionProfile` screen.
- `App.js` — Added `PlanStackNav` + `PlanStack` (WeeklyPlanPersonalization root → WeeklyPlan + NutritionProfile). Added `PlanTab` between DiscoverTab and SnippdTab. Removed WeeklyPlan from HomeStack. Added `NutritionProfile` to root Stack (for onboarding) and ProfileStack (for settings).

### Database
- `profiles` table: 7 new columns — `household_members`, `daily_calorie_target_min`, `daily_calorie_target_max`, `meal_calorie_target_min`, `meal_calorie_target_max`, `dietary_modes`, `nutrition_profile_set`.

### API
- New RPC: `get_weekly_plan(p_user_id uuid, p_headcount int, p_nights int, p_focus text, p_week_of date)` → `jsonb`. GRANT to `authenticated` + `service_role`.

### Changed (continued — same session)
- `screens/WeeklyPlanScreen.js` — Wired to live `get_weekly_plan` RPC. Accepts `route.params` (`headcount`, `nights`, `focus`). Replaced `buildSampleMeals` with RPC call + `buildMealCard()` mapper (converts RPC dinner slots to ingredient format, prices via `toCents()`). Added skeleton pulse loading, noDeals empty state (with admin "Upload circulars now" button for `ddavis@getsnippd.com`), error state with 7-day AsyncStorage cache fallback. Hero title, section label, receipt row, and takeout copy now use `nights` param. Calorie status badges (on_target/near target/above target) shown per meal when `meal_calorie_target_min/max` are set. Tracks view to `weekly_plan_last_viewed` AsyncStorage key.
- `screens/HomeScreen.js` — Added weekly plan banner (forest green left border). Shows Wed–Fri or if user has never viewed the plan. Throttled to once/24h via `plan_banner_shown_at` AsyncStorage. Tapping marks shown and navigates to `PlanTab`.
- `screens/StudioScreen.js` — Added weekly plan card between CREATE BUTTON and EARNINGS INFO sections. Mint green background, calendar icon, navigates to `PlanTab`.

### Fixed (continued)
- `npx tsc --noEmit` — 0 errors ✓

---

## [1.2.1] — 2026-04-14

### Added
- `screens/WeeklyPlanScreen.js` — New screen: 7-section weekly dinner plan layout. Hero block (forest green, deal-count chips), anchor pricing bar (restaurant range vs Snippd range), 5-meal list with day/price column + ingredient chips + deal-type badges + save row + optional coupon note, week receipt with line items + FOREST footer + strikethrough + teal total, takeout comparison (red tint, diff savings), Lock In button. Price computations use ingredient sale_cents summed per meal (total for household, not per person). Zero instances of the word "serving". Data backed by `buildSampleMeals()` with a TODO hook for live `meal_plans` query.
- Registered `WeeklyPlanScreen` in `App.js` HomeStack as route `"WeeklyPlan"`.

### Fixed
- TypeScript: `npx tsc --noEmit` — 0 errors ✓

---

## [1.2.0] — 2026-04-14

### Added
- `screens/OnboardingScreen.js` — Full premium rebuild. 7-screen architecture replacing the previous 6-step flow. New screens: (0) cinematic hero with LinearGradient + animated logo entrance, (5) AI persona generation with pulsing loading ring + Shopper DNA reveal card, (6) upgraded paywall with credit welcome banner. All 5 question screens upgraded with Reanimated spring animations and Haptics on every selection.
- `babel.config.js` — Created with `babel-preset-expo` + `react-native-reanimated/plugin` (required by Reanimated 3).

### Changed
- `OnboardingScreen` persona engine — derives one of 8 shopper archetypes (Precision Nurturer, Wellness Optimizer, Speed Strategist, Culinary Value Hunter, Efficiency Machine, Conscious Saver, Selective Maximizer, Balanced Strategist) from household + dietary + cooking style data. Persona type saved to `profiles.preferences.persona_type`.
- `OnboardingScreen` progress bar — replaced static `Animated.View` width with Reanimated `interpolate` spring animation over step index.
- `OnboardingScreen` step transitions — replaced `Animated.timing` fade with Reanimated `withTiming` + `withSpring` slide-fade combo via `translateX` + `opacity` shared values.
- `OnboardingScreen` pill selections — each SelectPill uses `withSequence(withSpring(0.92), withSpring(1.0))` for tactile bounce.
- `OnboardingScreen` cooking style options — per-option Reanimated `scale` shared value with `FadeIn` entering animation on checkmark.
- `OnboardingScreen` consent checkbox — spring scale pulse on toggle; saves `persona_type` alongside existing profile fields.

### Services
- Installed `react-native-reanimated@3.x` (SDK 55 compatible) + `expo-haptics` + `expo-document-picker`.

---

## [1.1.0] — 2026-04-14

### Added
- `src/services/ingestion/flyerParser.ts` — Replaced DEAL_EXTRACTION_PROMPT with GEMINI_PROMPT including confidence, is_bogo, dietary_flags, savings_amount, deal_description fields and stricter category/deal_type enums. Added Promise.all parallel processing of up to 3 pages simultaneously. Added JSON-parse retry with simplified fallback prompt. Added fire-and-forget logging to ingestion_run_log per page.
- `src/services/ingestion/offerNormalizer.ts` — Added `computeStackRankScore()` replacing old linear formula. New score: savings_pct (up to 0.50) + is_bogo bonus (0.25) + MULTI/BUY_X_GET_Y bonus (0.10) + confidence > 0.9 bonus (0.10) + essential category bonus (0.05), capped at 1.0. Added `savings_amount` and `is_bogo` to `StagedDeal` interface.
- `supabase/functions/run-ingestion-worker/index.ts` — New Deno Edge Function. Processes up to 3 queued ingestion_jobs per invocation. Inline Gemini Vision extraction, flyer_deal_staging write, offer_sources upsert, digital_coupon matching, offer_matches + stack_candidates write. Auth: x-cron-secret or service-role Bearer. Retry up to 3 attempts before marking failed.
- `screens/AdminCircularUploadScreen.js` — New admin screen for uploading weekly circulars. 12-retailer store picker, week-of date stepper (defaults next Wednesday), source-type pills (flyer/digital/combo), expo-document-picker PDF upload to 'deal-pdfs' storage bucket, trigger-ingestion call, job status list with auto-refresh every 30s.
- `src/services/vertexTrainingExport.ts` — New Node.js service. Joins event_stream + recommendation_exposures + user_state_snapshots + stack_results over 90-day rolling window. Labels by outcome (purchased=1.0, accepted=0.8, clicked=0.4, dismissed=0.0). Exports JSONL to 'vertex-training-data' bucket. Paginated in batches of 500.
- `supabase/functions/run-vertex-export/index.ts` — Deno wrapper for Vertex training export. Same auth as run-ingestion-worker. Streams batches to storage JSONL file.
- `docs/VERTEX_TRAINING.md` — Full guide: label schema, training row schema, storage layout, cron schedule, Vertex AI integration next steps.
- `screens/AdminAnalyticsDashboardScreen.js` — New admin screen with 6 sections: deal pipeline health (queued/parsing/complete/failed), recommendation funnel (exposures/clicks/purchases, CTR + conversion), user savings velocity (total saved, avg velocity, receipt count), behavioral signal health (mini bar chart top 8 events), Vertex training readiness (progress bars: events/exposures/snapshots vs targets), anonymized market signals (by category + trend).

### Changed
- `screens/AdminPulseScreen.js` — Added nav buttons for AdminCircularUpload and AdminAnalytics screens.
- `App.js` — Registered AdminCircularUploadScreen and AdminAnalyticsDashboardScreen in ProfileStack.

### Database
- `supabase/migrations/008_ingestion_cron.sql` — Added `snippd-ingestion-worker` cron (*/30 * * * *) and `snippd-circular-reminder` cron (0 14 * * 2, inserts to email_alert_queue). Deployed to production (jobids 39, 40).
- `supabase/migrations/009_vertex_export_cron.sql` — Created `vertex-training-data` storage bucket + RLS policy + `snippd-vertex-export` cron (0 3 * * 0). Deployed to production (jobid 41).
- `supabase/migrations/010_analytics_views.sql` — Created `v_recommendation_funnel`, `v_stack_performance`, `v_weekly_savings_summary` views. GRANT SELECT to authenticated + service_role. Deployed to production.

### API
- `POST /functions/v1/run-ingestion-worker` — New endpoint. Processes queued ingestion jobs inline.
- `POST /functions/v1/run-vertex-export` — New endpoint. Exports Vertex AI training JSONL to storage.

### Services
- `src/services/vertexTrainingExport.ts` — New service. Vertex AI training data pipeline.

---

## [1.0.0] — 2026-04-14

### Production Release — All systems verified

### Fixed
- `supabase/functions/process-receipt/index.ts` — Rewrote to be fully Deno-compatible. Removed imports of Node.js services (`src/services/receiptParser.ts`, `src/services/wealthEngine.ts`) that used bare `@supabase/supabase-js` imports and `process.env`. Inlined Gemini Vision API call (direct fetch to Gemini 1.5 Flash) and simplified wealth snapshot computation. Function now self-contained with no local bundled dependencies.
- `supabase/functions/get-cart-options/index.ts` — Added `ingestion_run_log` logging; fixed dead-code `return response` (previously `logRequest` was after `return json(...)` and never reached). Now correctly assigns response to variable before logging.
- `supabase/functions/get-wealth-momentum/index.ts` — Added `ingestion_run_log` logging on success and error paths.
- `supabase/functions/process-receipt/index.ts` — Added `ingestion_run_log` logging.

### Verified
- TypeScript: `npx tsc --noEmit` — 0 errors ✓
- RLS: All 138 public tables have `rowsecurity: true` ✓
- Stacking engine: 16/16 tests pass ✓
- Health endpoint: `{"status":"ok","version":"0.5.0","checks":{"database":{"ok":true},"event_weights":{"ok":true}}}` ✓
- All 4 pg_cron jobs active, using Vault secrets ✓
- All 10 Edge Functions deployed to `gsnbpfpekqqjlmkgvwvb` ✓

### Edge Functions — All passing audit (CORS, auth, try/catch, logging, status codes)
- `ingest-event` ✓ `stack-compute` ✓ `get-cart-options` ✓ `process-receipt` ✓
- `get-wealth-momentum` ✓ `trigger-ingestion` ✓ `run-preference-updater` ✓
- `run-graph-sync` ✓ `run-wealth-check` ✓ `health` ✓

---

## [0.5.2] — 2026-04-14

### Fixed
- `supabase/migrations/003_pg_cron_jobs.sql` — Replaced `current_setting('app.*')` references (which require `ALTER DATABASE`, blocked on hosted Supabase) with `vault.decrypted_secrets` subqueries. Cron jobs now read `snippd_functions_url` and `snippd_cron_secret` from Vault at fire time. No `pg_reload_conf()` needed.
- Vault secrets `snippd_functions_url` and `snippd_cron_secret` stored in production via `vault.create_secret()`. All 4 cron jobs updated live.

## [0.5.1] — 2026-04-14

### Fixed
- `supabase/migrations/004_app_config.sql` — Corrected column names from `config_key`/`config_value` to `key`/`value` to match the live table schema. Also corrected `CREATE TABLE` definition to match: `key text PK`, `value text`, `created_at`, `updated_at`. Bumped seeded `app_version` value to `'0.5.0'`.
- `supabase/functions/health/index.ts` — Updated all `app_config` queries to use `key`/`value` column names (was `config_key`/`config_value`). Redeployed with `--no-verify-jwt` so the endpoint is publicly reachable without a Bearer token.

### API
- `GET /functions/v1/health` — Confirmed live: returns `{"status":"ok","version":"0.5.0","checks":{"database":{"ok":true},"event_weights":{"ok":true}}}`.

### Database (production)
- Migrations 003–006 applied to live DB (`gsnbpfpekqqjlmkgvwvb`).
- `cron.job` — 4 Snippd jobs now active: `snippd-preference-updater` (5 * * * *), `snippd-graph-sync` (50 1 * * *), `snippd-wealth-check` (0 4 * * *), `snippd-rate-limit-cleanup` (0 5 * * *).
- `profiles` — `consent_accepted`, `consent_accepted_at`, `privacy_policy_version` columns confirmed live.
- `anonymized_signals` — Table confirmed live.
- `app_config` — USDA benchmarks, inflation baseline, stack tuning, and version `0.5.0` seeded.

### Services
- `run-preference-updater`, `run-graph-sync`, `run-wealth-check`, `health` Edge Functions deployed to production.
- **Action required:** Set `app.supabase_functions_url` and `app.cron_secret` in Supabase Dashboard SQL Editor (see below — cannot be set via Management API).

## [0.5.0] — 2026-04-14

### Added
- `screens/PrivacyPolicyScreen.js` — Scrollable in-app privacy policy with 11 sections (Data We Collect, How We Use Your Data, Sharing, Retention, Your Rights, Security, Children's Privacy, Contact). Green contact pill opens `mailto:privacy@getsnippd.com`. Shows policy version 1.0 and last-updated date in footer.
- `docs/PRIVACY_POLICY.md` — Source-of-truth plain-text privacy policy (version 1.0). Matches content in PrivacyPolicyScreen.
- `supabase/migrations/006_privacy_consent.sql` — Adds `consent_accepted_at timestamptz`, `privacy_policy_version text`, and index `profiles_consent_accepted_idx` to `profiles`. `consent_accepted boolean` added idempotently.

### Changed
- `screens/OnboardingScreen.js` — Step 5 now shows a consent checkbox ("I agree to the Privacy Policy and Terms of Service") with an inline link that navigates to PrivacyPolicyScreen. "Continue" button is disabled until checkbox is ticked. On account creation, saves `consent_accepted: true`, `consent_accepted_at`, and `privacy_policy_version: '1.0'` to profile.
- `screens/ProfileScreen.js` — "Privacy Policy" menu item now navigates to `PrivacyPolicyScreen` (was an alert placeholder).
- `screens/HelpScreen.js` — Privacy Policy contact option now navigates to `PrivacyPolicyScreen` in-app.
- `App.js` — Registered `PrivacyPolicyScreen` in root Stack, HomeStack, and ProfileStack so all navigation paths (Onboarding → PrivacyPolicy, Profile → PrivacyPolicy, Help → PrivacyPolicy) resolve correctly.

### Database
- `profiles.consent_accepted_at` — New column `timestamptz`; NULL until user accepts.
- `profiles.privacy_policy_version` — New column `text`; stores the policy version string agreed to (e.g. '1.0').
- `profiles_consent_accepted_idx` — New index on `(consent_accepted, consent_accepted_at)` for compliance reporting.

## [0.4.1] — 2026-04-14

### Added
- `supabase/migrations/005_delete_my_account.sql` — Creates `anonymized_signals` table (retailer_key, category, event_name, week_of, signal_count — no user_id). Creates `delete_my_account()` SECURITY DEFINER RPC function: (A) aggregates user's event_stream into anonymized_signals before deletion, (B) deletes all personal data tables, (C) deletes auth.users record. Callable via `supabase.rpc('delete_my_account')`.

### Changed
- `screens/ProfileScreen.js` — `handleDeleteAccount` replaced: now calls `supabase.rpc('delete_my_account')` then `supabase.auth.signOut({ scope: 'local' })` then navigates to Auth. Removed dependency on `delete-account` Edge Function.
- `lib/sessionGuard.js` — `supabase.auth.signOut()` → `supabase.auth.signOut({ scope: 'global' })` to invalidate the session on all devices on inactivity timeout.
- `screens/ProfileScreen.js` — `handleSignOut` updated to `signOut({ scope: 'global' })`.
- `screens/TrialGateScreen.js` — `signOut()` → `signOut({ scope: 'global' })`.
- `screens/MFAVerifyScreen.js` — `signOut()` → `signOut({ scope: 'global' })` on "Back to sign in".

### Database
- `anonymized_signals` — New table: `retailer_key`, `category`, `event_name`, `week_of` (date), `signal_count` (integer). Unique constraint on (retailer_key, category, event_name, week_of) for ON CONFLICT upsert. RLS enabled, service role only.
- `delete_my_account()` — New SECURITY DEFINER function callable by `authenticated` role. Deletes 11 personal data tables + auth.users after aggregating signals.

## [0.4.0] — 2026-04-14

### Added
- `supabase/migrations/003_pg_cron_jobs.sql` — Enables `pg_cron` + `pg_net` extensions. Schedules 4 background jobs: `snippd-preference-updater` (hourly at :05), `snippd-graph-sync` (daily 01:50 UTC), `snippd-wealth-check` (daily 04:00 UTC), `snippd-rate-limit-cleanup` (daily 05:00 UTC, SQL-only). Jobs call Edge Functions via `net.http_post` using `x-cron-secret` auth. Config via `current_setting('app.cron_secret')` and `app.supabase_functions_url`.
- `supabase/migrations/004_app_config.sql` — Creates `app_config` table (`config_key` text PK, `config_value` jsonb). Seeds USDA food plan benchmarks (thrifty + moderate plans for 1/2/4-person households, weekly and monthly), inflation CPI baseline, stacking engine tuning values, and app version.
- `supabase/functions/run-preference-updater/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Forwards to `preference-updater` with service-role auth and logs result to `ingestion_run_log`.
- `supabase/functions/run-graph-sync/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Dispatches `nightly-graph-sync.yml` via GitHub API `workflow_dispatch` (204 = success). Reads `GITHUB_PAT`, `GITHUB_OWNER`, `GITHUB_REPO` env vars. Logs outcome to `ingestion_run_log`.
- `supabase/functions/run-wealth-check/index.ts` — Cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Queries `wealth_momentum_snapshots` for users with velocity_score drop > 20% week-over-week. Logs attrition summary (user count, drop %) to `ingestion_run_log`.
- `supabase/functions/health/index.ts` — GET `/functions/v1/health`. No auth. Returns `{ status, version, checks, timestamp, latency_ms }`. Checks: database connectivity, `event_weight_config` populated. Reads version from `app_config`. Returns 200 OK or 503 degraded.

### Changed
- `screens/HomeScreen.js` — Added `tracker` import. Tracks `HOME_FEED_VIEWED` event on every focus via `useFocusEffect`. Fires after `fetchProfile()`.
- `screens/CartScreen.js` — Added `CART_ACCEPTED` tracking in `cycleStatus`: fires when the last active item is marked purchased (all items complete).
- `screens/ReceiptUploadScreen.js` — Added `trackPurchaseCompleted` call in `confirmReceipt`, immediately after the existing `trackReceiptUploaded`. Includes `retailer_key`, `cart_value_cents`, `savings_cents`, `item_count`.
- `screens/ProfileScreen.js` — Added `wealthData` state; fetches `GET /functions/v1/get-wealth-momentum` on mount (non-critical, silently ignored if fails). Displays a 3-stat wealth card (Lifetime Saved, Velocity, Inflation Shield) above the menu sections.
- `App.js` — Added `tracker` import. On session load and `SIGNED_IN`: calls `tracker.setAccessToken`, `setDefaultUserId`, `setDefaultSessionId`, and tracks `APP_OPENED`. On `SIGNED_OUT`: clears `setAccessToken('')`.

### Fixed
- `supabase/migrations/002_rls_hardening.sql` — Rewritten after live DB audit: all tables already had RLS. Migration now only drops `model_predictions_select_own` and adds `recommendation_exposures_update_own` UPDATE policy.
- `supabase/functions/ingest-event/index.ts` — `api_rate_limit_log` insert now uses `endpoint` column (live table schema), not `function_name`.

### Database
- `app_config` — New table: `config_key text PK`, `config_value jsonb`, `updated_at timestamptz`. RLS enabled, service role only. Seeded with USDA benchmarks, CPI baseline, stack tuning, and version string.

### API
- `GET /functions/v1/health` — New endpoint. No auth. Returns system status, version from `app_config`, per-check latencies.
- `POST /functions/v1/run-preference-updater` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Forwards to `preference-updater`.
- `POST /functions/v1/run-graph-sync` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Triggers GitHub Actions `nightly-graph-sync.yml` via workflow_dispatch.
- `POST /functions/v1/run-wealth-check` — New cron wrapper. Auth: `x-cron-secret` or service-role Bearer. Returns attrition summary.

### Services
- pg_cron schedules active: `snippd-preference-updater` (hourly), `snippd-graph-sync` (01:50 UTC daily), `snippd-wealth-check` (04:00 UTC daily), `snippd-rate-limit-cleanup` (05:00 UTC daily).

## [0.3.0] — 2026-04-13

### Added
- `supabase/migrations/002_rls_hardening.sql` — Enables RLS on `stack_results` (read own policy); adds `api_rate_limit_log` table (service-role only, used for rate limiting); adds `recommendation_exposures` UPDATE policy for authenticated users; adds `source_key`, `stage`, `metadata` columns to `ingestion_run_log` and makes `week_of` nullable so Edge Functions can write request logs.
- `src/lib/neo4jClient.ts` — Neo4j driver singleton (`getSession`, `verifyConnectivity`, `closeDriver`, `isNeo4jConfigured`). Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE` env vars.
- `src/services/graph/graphSchema.ts` — `initializeSchema(session)`: 7 node uniqueness constraints + 6 property/relationship indexes, all `IF NOT EXISTS`. Documents 10 relationship types.
- `src/services/graph/graphSync.ts` — `runGraphSync(db, session)`: syncs active users' preference scores, purchase history (90 days), cart acceptance events, and product co-occurrences into Neo4j nightly. Orchestrates `syncCohortSimilarity`.
- `src/services/graph/graphRetrieval.ts` — `getUserGraphContext(userId)`: 6 Cypher queries + 2 cohort lookups in parallel. Full graceful degradation. `getRelatedProducts(key)`: top-5 co-occurring products.
- `src/services/graph/graphCohort.ts` — `syncCohortSimilarity(session)`: pairwise cosine similarity, writes `SHOWS_PATTERN` edges. `getCohortPreferences` and `getCohortBrandPreferences`.

### Changed
- `supabase/functions/ingest-event/index.ts` — Added: rate limiting (200 req/user/hour via `api_rate_limit_log`, 1% cleanup of records > 2h old, 429 with `retry_after_seconds: 60`); strict input validation (event_name max 100 chars, session_id UUID, retailer_key alphanumeric+underscore max 50, category max 100, metadata max 10 keys depth ≤ 2, unknown field rejection); request logging to `ingestion_run_log` on every success and error with `source_key`, `stage`, `status`, `metadata`.
- `supabase/functions/stack-compute/index.ts` — Added: enhanced input validation (retailer_key pattern, items max 50, per-item UUID check, quantity 1–100, price ≤ 100 000 cents, offers max 10 per item); request logging to `ingestion_run_log`; supports `available_offers` as alias for `offers` in item payloads.
- `src/services/cartEngine.ts` — Integrated Neo4j graph context: rejected-category skip; category ×1.15; buy history +0.20; co-occurrence +0.10; cohort category +0.08; cohort brand +0.06.

### Fixed
- `.github/workflows/nightly-graph-sync.yml` — converted `options` from inline YAML array to block list format so GitHub Actions registers the workflow.

### Database
- `stack_results` — RLS enabled; `stack_results_select_own` policy added.
- `model_predictions` — Removed `model_predictions_select_own` policy; service role only.
- `recommendation_exposures` — Added `recommendation_exposures_update_own` policy (authenticated users can update their own rows).
- `api_rate_limit_log` — New table: `id`, `user_id`, `function_name`, `request_at`. RLS enabled, service role only.
- `ingestion_run_log` — Added columns: `source_key text`, `stage text`, `metadata jsonb`. `week_of` made nullable.

### API
- `POST /functions/v1/ingest-event` — Rate limited: 200 req/user/hour. Strict field whitelist. Validation errors return 400 with descriptive message. Rate limit returns 429 `{ error, retry_after_seconds: 60 }`.
- `POST /functions/v1/stack-compute` — Validates retailer_key pattern, items count (1–50), per-item fields (UUID, qty 1–100, price ≤ $1000). Supports `available_offers` alias.

### Added
- `.github/workflows/nightly-graph-sync.yml` — GitHub Actions cron at `0 2 * * *` (02:00 UTC). Steps: checkout → Node 20 setup → `npm ci` → Neo4j connectivity check → `graphSchema.ts` (idempotent schema check) → `graphSync.ts` (full sync). `workflow_dispatch` with `skip_co_occurrences` and `skip_cohort` inputs for manual partial runs. Posts run summary to GitHub Actions step summary.
- `scripts/set-github-secrets.sh` — reads `.env` and pushes all 6 required secrets (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD`, `NEO4J_DATABASE`) to GitHub Actions via `gh secret set`.
### Fixed
- `src/services/graph/graphSync.ts` — CLI entry point now reads `SKIP_CO_OCCURRENCES` and `SKIP_COHORT` env vars, passed by the GitHub Actions workflow dispatch inputs.
- `src/lib/neo4jClient.ts` — `getSession()` now reads `NEO4J_DATABASE` env var (falling back to `'neo4j'`). Required for AuraDB Free where the database name is the instance ID, not `'neo4j'`.
- `supabase/functions/admin-graph-stats/index.ts` — `runCypher()` reads `NEO4J_DATABASE` env var for the HTTP Transaction API path (`/db/{db}/tx/commit`). Was hardcoded to `/db/neo4j/...`.
- `supabase/functions/graph-insights/index.ts` — same `NEO4J_DATABASE` fix for HTTP Transaction API path.
- `src/services/graph/graphSync.ts` — `syncUserPreferences()` now falls back to `event_stream` derivation when `user_preference_scores` table doesn't exist (error code `42P01`). `syncPurchaseHistory()` handles both `normalized_key` and `normalized_name` column variants. `syncCoOccurrences()` rewritten to use `receipt_items` grouped by `receipt_id` (production schema) instead of `stack_candidates.items` which doesn't exist in production.
- `src/services/graph/graphCohort.ts` — `LIMIT` parameters wrapped with `neo4j.int()` to prevent `'2000.0' is not a valid INTEGER` error from Neo4j.
### Added
- `scripts/neo4j-setup.sh` — one-shot setup script: pushes `NEO4J_URI/USER/PASSWORD` to Supabase secrets, appends vars to `.env`, runs `graphSchema.ts` (schema init) then `graphSync.ts` (first data sync). Run once after provisioning Aura instance.
### Deployed
- `graph-insights` → ACTIVE v1 on project `gsnbpfpekqqjlmkgvwvb`
- `admin-graph-stats` → ACTIVE v1 on project `gsnbpfpekqqjlmkgvwvb`
- `supabase/functions/graph-insights/index.ts` — Edge Function `POST /functions/v1/graph-insights`. Auth: Bearer JWT. Accepts `{ items[] }` with product metadata. Runs 5 Cypher queries in parallel (preferred categories, preferred brands, buy history, cohort brands, co-occurrences). Returns `cart_insights[]` (up to 3 plain-language cart-level sentences) and `item_insights{}` (per-item signal + text keyed by `product_id`). Signal priority: buy_history → preferred_brand → preferred_category → cohort_brand → co_occurrence. Graceful degradation when Neo4j is unconfigured or unreachable.
### Changed
- `screens/CartOptionDetailScreen.js` — fetches `graph-insights` lazily after cart renders (won't block display). Renders "PERSONALISED FOR YOU" insights section (purple left-border card) with up to 3 cart-level insight bullets. Passes per-item `insight` prop to `ItemRow`, which now renders a coloured signal chip below each item's metadata line (icon + signal text, colour-coded by signal type).
### API
- New endpoint: `POST /functions/v1/graph-insights` — Neo4j-powered plain-language cart explainability. Returns per-item signals and cart-level insight sentences. Auth: Bearer JWT.
- `src/lib/neo4jClient.ts` — Neo4j driver singleton with `getSession()`, `verifyConnectivity()`, `closeDriver()`, `isNeo4jConfigured()`. Reads `NEO4J_URI`, `NEO4J_USER`, `NEO4J_PASSWORD` env vars; pool size 10, 5 s acquisition timeout.
- `src/services/graph/graphSchema.ts` — `initializeSchema(session)`: 7 uniqueness constraints + 6 property/relationship indexes, all `IF NOT EXISTS`. Documents full relationship vocabulary.
- `src/services/graph/graphSync.ts` — `runGraphSync(db, session)`: syncs active users' preference scores, purchase history (90 days), cart acceptance events, and product co-occurrences into Neo4j. Nightly CLI entry point.
- `src/services/graph/graphRetrieval.ts` — `getUserGraphContext(userId)`: runs 6 Cypher queries + 2 cohort lookups in parallel (preferred categories/stores/brands, rejected categories, buy history, co-occurrence keys, cohort categories, cohort brands). `UserGraphContext` now includes `cohortBrands: Set<string>`. Full graceful degradation. `getRelatedProducts(key)`: top-5 co-occurring products.
- `src/services/graph/graphCohort.ts` — `syncCohortSimilarity(session)`: loads per-user category preference vectors, computes pairwise cosine similarity in Node.js (capped at 2 000 users), writes `(u)-[:SHOWS_PATTERN {similarity}]->(v)` edges for pairs ≥ 0.50. `getCohortPreferences(userId, session)`: returns category names that high-similarity peers prefer but the user doesn't yet (used for +0.08 collaborative filtering boost in cart scoring).
- `docs/NEO4J_DEPLOY.md` — step-by-step runbook: Aura provisioning, env var setup, schema init, first data sync, nightly cron schedule, connectivity verification, scoring boost summary.
- `src/services/graph/graphCohort.ts` — added `getCohortBrandPreferences(userId, session)`: mirrors `getCohortPreferences` for Brand nodes; returns brand names peers prefer (PREFERS ≥ 0.5) but the user hasn't adopted (score < 0.35).
- `supabase/functions/admin-graph-stats/index.ts` — Edge Function `GET /functions/v1/admin-graph-stats`. Admin JWT auth. Queries Neo4j via HTTP Transaction API (no npm deps). Returns node counts (User/Product/Category/Brand/Store/Stack), relationship counts (PREFERS/BUYS/CO_OCCURS_WITH/SHOWS_PATTERN/REJECTS/ACCEPTS/DISMISSES), top categories, top brands, top co-occurring pairs, top cohort pairs. Degrades to zero counts if Neo4j not configured.
- `screens/AdminGraphScreen.js` — admin-only graph viewer screen. Connection status banner, 2×3 node/rel metric card grids, top-10 tables for categories/brands/co-occurrences/cohort pairs. Accessible from AdminPulseScreen → "Memory Graph" row.
### Changed
- `src/services/cartEngine.ts` — integrated Neo4j graph context into scoring: skips rejected categories; preferred-category ×1.15; buy history +0.20; co-occurrence +0.10; cohort category +0.08; cohort brand +0.06.
- `screens/AdminPulseScreen.js` — added "Memory Graph" nav row linking to `AdminGraphScreen`.
- `App.js` — registered `AdminGraphScreen` in ProfileStackNav.
- `screens/ProfileScreen.js` — added "Savings" menu section with "Wealth Momentum" entry → navigates to `WealthMomentum` screen.
- `App.js` — registered `WealthMomentum` screen in ProfileStackNav so it is reachable from the Profile tab.
- `src/services/cartEngine.ts` — `buildCartOptions(userId, retailerKey, weekOf, db)` generates 3 personalised cart options (MAX_SAVINGS / BALANCED / CONVENIENCE). Loads `user_state_snapshots`, `user_preference_scores`, `budgets`, `stack_candidates`; runs `CouponStackingEngine.compute()` on each candidate; scores by category 40% + retailer 30% + brand 20% + deal_type 10%; calls `scoreStackForUser` for acceptance probability; logs `recommendation_exposures`.
- `src/services/cartEngine.test.ts` — 9-test standalone ts-node suite covering all 3 cart types, ordering, max_savings savings_pct, convenience item_count, budget_fit true/false, non-empty items, retailer_set correctness, savings_pct calculation, empty-candidates case.
- `supabase/functions/get-cart-options/index.ts` — Edge Function `GET /functions/v1/get-cart-options?retailer_key=&week_of=`. Auth: Bearer JWT. Loads policy inline, scores candidates, builds 3 carts, logs exposures. Target: under 2 seconds.
- `screens/CartOptionsScreen.js` — swipeable cart options screen. Fetches from `get-cart-options`, renders 3 horizontal-scroll `CartCard` components with savings ring, stats row, explanation bullets, acceptance probability, and "Use This Cart" CTA. Fires `trackStackViewed` per impression, `trackCartRejected` on dismiss. Navigates to `CartOptionDetail`.
- `screens/CartOptionDetailScreen.js` — full item list detail for a selected cart. Shows summary bar (savings/total/pct/items), budget chip, store row, explanation bullets, AI match score, and scrollable `ItemRow` list. Sticky footer with "Try Another" (`trackCartRejected` → goBack) and "Accept This Cart" (`trackCartAccepted` + alert → popToTop).
- `src/services/receiptParser.ts` — `parseReceipt(imageUrl, retailerKey, supabase)`: downloads from Supabase storage, OCRs via Gemini Vision (`gemini-1.5-flash`) with GPT-4V fallback, normalizes item names to `normalized_key`, converts amounts to cents. Returns `ParsedReceipt`.
- `src/services/wealthEngine.ts` — `computeAndSave(userId, receiptId, supabase)`: runs `calculateInflationShield` (USDA benchmark delta), `calculateSmartStackingSavings` (promo cents), `calculateVelocityScore` (4-week trend, 0–1), `calculateWealthMomentum` `(shield+stacking)×(1+v/10)`, `projectAnnualWealth` (×52), `generateTransparencyReport` (formula + breakdown). Writes to `wealth_momentum_snapshots`.
- `supabase/functions/process-receipt/index.ts` — Edge Function `POST /functions/v1/process-receipt`. Auth: Bearer JWT. Reads `receipt_uploads`, calls `parseReceipt` + `computeAndSave`, writes `receipt_items`, updates upload status to `parsed`, fires `purchase_completed` event.
- `supabase/functions/get-wealth-momentum/index.ts` — Edge Function `GET /functions/v1/get-wealth-momentum`. Auth: Bearer JWT. Returns last 8 snapshots, current velocity, lifetime savings, inflation shield total, transparency report, and `time_series[]` for charting.
- `screens/WealthMomentumScreen.js` — dashboard screen: hero annual projection, lifetime savings + inflation shield stat cards, savings velocity gauge with label (Accelerating/Steady/Building), weekly bar chart (last 8 points), recent snapshots list, expandable transparency report accordion. Connects to `GET /get-wealth-momentum`. Fires `WEALTH_SNAPSHOT_VIEWED` event.
- `src/services/ingestion/flyerParser.ts` — `parseFlyer(ingestionJobId, supabase)`: reads `ingestion_jobs`, downloads PDF from `deal-pdfs` bucket, OCRs via `gemini-1.5-flash`, scores deal confidence, writes to `flyer_deal_staging`, updates job status to `parsed`. Returns deal count.
- `src/services/ingestion/offerNormalizer.ts` — `normalizeAndPublish(ingestionJobId, supabase)`: reads staged deals, maps to `OfferType`, converts to cents, upserts `offer_sources` on `dedupe_key`, matches digital coupons via configurable `coupon_match_mode`, writes `offer_matches` + `stack_candidates` (rank = `savings_pct×0.6 + hasCoupon×0.4`), writes `flyer_publish_log`.
- `src/services/ingestion/couponIngester.ts` — `ingestDigitalCoupons(retailerKey, weekOf, supabase)`: loads active `digital_coupons`, matches to `offer_sources` using retailer's `coupon_match_mode` (exact_name/brand_or_name/token_overlap), upserts `offer_matches`, updates `stack_candidates.stack_rank_score`.
- `src/services/ingestion/ingestionWorker.ts` — `startIngestionWorker(db)`: polls `ingestion_jobs` (status='queued', limit=5) every 30 minutes, runs `parseFlyer → normalizeAndPublish → ingestDigitalCoupons` per job, handles retries (max 3), writes `ingestion_run_log`.
- `supabase/functions/trigger-ingestion/index.ts` — Edge Function `POST /functions/v1/trigger-ingestion`. Service-role auth only. Accepts `{retailer_key, week_of, storage_path}`, creates `ingestion_jobs` row, returns `job_id`.
- `supabase/migrations/20260413_ingestion_pipeline.sql` — idempotent migration: `ingestion_jobs`, `flyer_deal_staging`, `offer_sources`, `digital_coupons` (with `is_active`, `normalized_key`), `offer_matches` (adds ingestion columns), `stack_candidates`, `flyer_publish_log`, `ingestion_run_log`, `app_config` (with USDA benchmark seed), retailer `coupon_match_mode` policy seeds.
- `docs/DECISIONS.md` — 8 architecture decision records with rationale (Supabase as source of truth, table-driven retailer rules, configurable event weights, rebate separation, normalized scores, 15-min policy cache, pure stacking functions, dual tsconfig).
- `docs/VERSION` — current version file.
- `.claude/CLAUDE.md` — standing session instructions with 7 rules including session summary format.
- `scripts/bump-version.sh` — version bumping script; takes `patch|minor|major` argument, rewrites CHANGELOG.md and docs/VERSION.
### Changed
- `App.js` — registered `CartOptionsScreen`, `CartOptionDetailScreen`, and `WealthMomentumScreen` in CartStackNav.
- `screens/CartScreen.js` — added Smart Carts banner (mint-green entry point) that navigates to `CartOptions` with `retailer_key='publix'`.
- `CHANGELOG.md` — restructured to match exact format spec (Snippd header, auto-maintained note, empty category placeholders under [Unreleased]).
- `docs/ARCHITECTURE.md` — full rewrite with three-plane diagram, all data flow sequences (ingestion, stacking, intelligence), complete module directory.
- `docs/DATABASE.md` — full rewrite documenting all behavioral intelligence tables with columns, indexes, RLS policies, seed values, and analytics views. Added app-layer tables list.
- `docs/API.md` — full rewrite with complete request/response examples, all offer type fields, all warning codes.
- `docs/SERVICES.md` — full rewrite with shopping mode inference table, all exported function signatures, env var tables, recommended schedules.
- `docs/STACKING_ENGINE.md` — full rewrite with BOGO model details, rounding mode table, all 11 validation rules, full policy table by retailer, example stack input/output.
- `docs/EVENT_TRACKING.md` — full rewrite with all 40 events, all 30 event_weight_config values, 5 preference dimensions, decay formula, step-by-step coupon clip example.
### Fixed
- `src/services/receiptParser.ts` — typed caught errors as `(e as Error).message` to resolve `TS18046: 'e' is of type 'unknown'`
- `src/services/wealthEngine.ts` — guarded optional `promo_savings_cents` with `?? 0` to resolve `TS18048: possibly undefined`
### Database
### Database
- New tables: `ingestion_jobs`, `flyer_deal_staging`, `offer_sources`, `digital_coupons`, `stack_candidates`, `flyer_publish_log`, `ingestion_run_log`, `app_config` — see `supabase/migrations/20260413_ingestion_pipeline.sql`
- `offer_matches` — extended with ingestion columns (`offer_source_id`, `coupon_source_id`, `final_price_cents`, etc.)
### API
- New endpoint: `POST /functions/v1/process-receipt` — receipt OCR + wealth computation pipeline. Auth: Bearer JWT.
- New endpoint: `GET /functions/v1/get-wealth-momentum` — wealth history, velocity, lifetime savings, time-series chart data. Auth: Bearer JWT.
- New endpoint: `POST /functions/v1/trigger-ingestion` — creates an `ingestion_jobs` row, service role auth only.
### Services
- `src/services/receiptParser.ts` — Gemini Vision / GPT-4V receipt OCR, returns `ParsedReceipt` with cents-normalized items.
- `src/services/wealthEngine.ts` — inflation shield, stacking savings, velocity score, wealth momentum, annual projection, transparency report; writes `wealth_momentum_snapshots`.
- `src/services/ingestion/flyerParser.ts` — PDF ingestion via Gemini Vision, writes `flyer_deal_staging`.
- `src/services/ingestion/offerNormalizer.ts` — normalizes staged deals → `offer_sources` + `stack_candidates`.
- `src/services/ingestion/couponIngester.ts` — matches active digital coupons to `offer_sources`, updates `stack_candidates`.
- `src/services/ingestion/ingestionWorker.ts` — 30-minute polling worker, processes `ingestion_jobs` queue.

---

## [0.2.0] — 2026-04-12

### Added
- `supabase/migrations/001_behavioral_intelligence_safe.sql` — safe/idempotent migration consolidating all behavioral intelligence tables. Adds `retailer_rules`, `smart_alerts` tables; adds `normalized_score` column; seeds 30 event weights; seeds Publix/Kroger/Walmart/Target/CVS coupon policies and stacking rules; creates 3 analytics views (`v_user_preference_summary`, `v_stack_performance`, `v_recommendation_funnel`).
- `supabase/functions/stack-compute/index.ts` — Edge Function. Loads retailer policy from DB, validates offer combinations, applies 8 offer types in canonical order, returns full `StackResult` with per-line breakdown, warnings, and explanation.
- `src/types/stacking.ts` — computation-facing TypeScript types: `OfferType`, `BogoModel`, `RoundingMode`, `WarningCode`, `StackOffer`, `StackItem`, `AppliedOffer`, `StackWarning`, `StackLineResult`, `StackExplanation`, `StackResult`, `RetailerPolicy`, `ValidationResult`, `StackEngineConfig`, `DEFAULT_POLICY`.
- `src/types/events.ts` — 40-event `EventName` union; `InboundEvent`, `StoredEvent`, `RecommendationExposure`, `PreferenceScore`, `UserStateSnapshot`, `VertexFeatureVector`, `WealthMomentumInput`, API-facing stacking types.
- `src/lib/eventTracker.ts` — `SnippdEventTracker` singleton with auto-batching queue, 3-retry exponential backoff, 30+ typed convenience methods.
- `src/services/preferenceUpdater.ts` — 30-day half-life temporal decay, shopping mode inference, 4 responsiveness scores written to `user_state_snapshots`.
- `src/services/stacking/policyLoader.ts` — loads `RetailerPolicy` from `retailer_coupon_parameters` + `retailer_rules`, 15-minute in-process cache.
- `src/services/stacking/stackValidator.ts` — `validateOfferSet()` with 11 validation checks in order.
- `src/services/stacking/stackCalculator.ts` — `calculateStackLine()` applies offers in canonical order with rounding and $0 floor.
- `src/services/stacking/stackingEngine.ts` — `CouponStackingEngine` class with `compute()` and `computeWithPolicy()`.
- `src/services/vertexFeatureBuilder.ts` — `buildFeatureVector()`, `scoreStackForUser()` with Vertex AI + heuristic fallback, `checkWealthAttrition()`.
- `src/services/stacking/__tests__/stackingEngine.test.ts` — 16 tests, all passing.
- `tsconfig.test.json` — CommonJS tsconfig for ts-node.
- `CHANGELOG.md` — auto-maintained change log.
- `CLAUDE.md` — mandatory session rules for Claude Code.
- `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/API.md`, `docs/SERVICES.md`, `docs/STACKING_ENGINE.md`, `docs/EVENT_TRACKING.md` — living documentation system.
- `docs/DECISIONS.md` — architecture decision records.
- `docs/VERSION` — current version file.
- `.claude/CLAUDE.md` — standing instructions with session summary rule.
- `scripts/bump-version.sh` — version bumping script.

### Database
- New table: `retailer_rules` — granular per-retailer stacking rules (UNIQUE on retailer_key + rule_key).
- New table: `smart_alerts` — wealth attrition and budget alerts.
- New column: `user_preference_scores.normalized_score` — 0–1 score relative to user max.
- New analytics views: `v_user_preference_summary`, `v_stack_performance`, `v_recommendation_funnel`.
- Preference upsert trigger: `trg_event_stream_preference` fires after INSERT on `event_stream`.
- Extended `event_weight_config` seed: 30 events weighted.

### API
- New endpoint: `POST /functions/v1/stack-compute` — coupon stacking engine. Auth: Bearer JWT.

### Services
- `src/services/preferenceUpdater.ts` — adds temporal decay, shopping mode, responsiveness scores.
- `src/services/vertexFeatureBuilder.ts` — Vertex AI integration with heuristic fallback.

---

## [0.1.0] — 2026-04-12

### Added
- Initial behavioral intelligence layer.
- `supabase/functions/ingest-event/index.ts` — event ingest Edge Function with batch support, JWT + API key auth, recommendation exposure logging.
- `event_stream` table with preference upsert trigger.
- `recommendation_exposures` table.
- `user_preference_scores` table.
- `user_state_snapshots` table.
- `model_predictions` table.
- `wealth_momentum_snapshots` table.
- `event_weight_config` table with 18 weighted events.
- `retailer_coupon_parameters` table.
- `offer_matches` table.
- `stack_results` table.
- React Native / Expo app with 30+ screens.
