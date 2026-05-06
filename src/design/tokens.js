// src/design/tokens.js
// Snippd Global Design System — single source of truth for all visual values.
// Import this in every screen and component. Never hardcode colors.
//
// Brand note: Dark mode was explicitly rejected. These tokens deliver
// "Calmly Authoritative" using deep navy surfaces, mint accents,
// and high-contrast typography — premium without breaking brand.

// ── Color palette ─────────────────────────────────────────────
export const COLORS = {
  // Canvas
  canvas:    '#EAF9E7',  // mint background — primary screen bg
  canvasDim: '#D4EDCE',  // border / divider

  // Navy surfaces (the "authority" layer)
  navy:      '#172250',  // primary dark — headers, CTAs, dark cards
  navyDeep:  '#0D1535',  // hover state / deepest surface
  navyMid:   '#1E2E6E',  // secondary dark surface

  // Brand
  mint:      '#C5FFBC',  // accent on dark — text on navy, highlights
  green:     '#0C9E54',  // positive / success / progress
  greenDark: '#0A8749',  // hover state for green
  coral:     '#FB5B5B',  // urgent / warning / destructive

  // Neutral
  white:     '#FFFFFF',
  card:      '#FFFFFF',  // card background
  muted:     '#7A9B89',  // placeholder / secondary text
  border:    '#D4EDCE',

  // Data viz
  amber:     '#F59E0B',  // in-progress
  sky:       '#38BDF8',  // informational
};

// ── Typography scale ──────────────────────────────────────────
export const TYPE = {
  hero:    { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: COLORS.navy },
  h1:      { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.navy },
  h2:      { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, color: COLORS.navy },
  h3:      { fontSize: 18, fontWeight: '700', color: COLORS.navy },
  body:    { fontSize: 15, fontWeight: '400', lineHeight: 22,      color: COLORS.navy },
  bodyMd:  { fontSize: 14, fontWeight: '500', lineHeight: 20,      color: COLORS.muted },
  caption: { fontSize: 12, fontWeight: '500', letterSpacing: 0.3,  color: COLORS.muted },
  label:   { fontSize: 11, fontWeight: '700', letterSpacing: 0.8,  color: COLORS.muted },
  // Inverted (on navy backgrounds)
  heroInv:  { fontSize: 40, fontWeight: '900', letterSpacing: -1.5, color: COLORS.mint },
  h1Inv:    { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, color: COLORS.mint },
  bodyInv:  { fontSize: 15, fontWeight: '400', lineHeight: 22,      color: COLORS.mint },
  mutedInv: { fontSize: 13, fontWeight: '500',                      color: '#8FBFB0' },
};

// ── Spacing scale ─────────────────────────────────────────────
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

// ── Border radius ─────────────────────────────────────────────
export const RADIUS = {
  sm:   8,
  md:   12,   // ← buttons (ConciergeButton)
  lg:   16,
  xl:   20,
  card: 20,   // ← GlobalCard default
  pill: 999,
};

// ── Shadows ───────────────────────────────────────────────────
export const SHADOW = {
  card: {
    shadowColor:   COLORS.navy,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius:  12,
    elevation:     4,
  },
  elevated: {
    shadowColor:   COLORS.navy,
    shadowOffset:  { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius:  20,
    elevation:     8,
  },
  mint: {
    shadowColor:   COLORS.green,
    shadowOffset:  { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius:  12,
    elevation:     6,
  },
};

// ── Animation durations ───────────────────────────────────────
export const DURATION = {
  fast:   150,
  normal: 250,
  slow:   400,
  scan:   5000,
};

// ── Agent activity messages (used by AgentActivityLog + LoadingEngine) ──
export const AGENT_MESSAGES = {
  scan: [
    { icon: '🔍', title: 'Scanning Prices',  body: 'Checking current prices across 5,000+ stores to find the floor price for your style.' },
    { icon: '📊', title: 'Categorizing',     body: 'Organizing your fund based on your monthly budget goals and mission target.' },
    { icon: '✂️', title: 'Coupon Check',     body: 'Looking for active promo codes and stacking opportunities for your spending category.' },
    { icon: '🔔', title: 'Alert Setup',      body: 'Setting up price-drop triggers so you never pay full price for your vibe again.' },
  ],
  idle: (location = 'your area', vibe = 'your style', size = 'your size') => [
    `Calibrating grocery nodes in ${location}…`,
    `Scanning for ${size} deals in ${vibe}…`,
    `Monitoring price floors across 5,000+ retailers…`,
    `Cross-referencing coupon stacks for your mission…`,
  ],
};
