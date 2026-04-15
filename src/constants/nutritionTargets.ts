/**
 * nutritionTargets.ts
 *
 * USDA Dietary Guidelines 2020–2025 reference data.
 * Powers all household calorie calculations in the app.
 *
 * IMPORTANT: Never hardcode these values inline — always import from here.
 * Source: https://www.dietaryguidelines.gov/sites/default/files/2020-12/Dietary_Guidelines_for_Americans_2020-2025.pdf
 */

// ── Types ──────────────────────────────────────────────────────────────────

export interface HouseholdMember {
  role:       string;  // MEMBER_OPTIONS id, e.g. 'adult_woman_19_50'
  age_group:  string;  // e.g. '19-50'
  sex:        'male' | 'female' | 'either';
  kcal_min:   number;
  kcal_max:   number;
}

export interface CalorieTarget {
  min: number;
  max: number;
}

export interface HouseholdCalorieTarget {
  min:      number;
  max:      number;
  perMeal:  { min: number; max: number };
  members:  HouseholdMember[];
}

export interface MemberOption {
  id:          string;
  label:       string;
  subLabel:    string;
  defaultSex:  'male' | 'female' | 'either';
  kcalMin:     number;
  kcalMax:     number;
  ageGroup:    string;
  hideSexRow:  boolean; // true for infants/toddlers/children
}

export interface DietaryModeOption {
  id:                  string;
  label:               string;
  sub:                 string;
  excludeCategories?:  string[];
  boostCategories?:    string[];
  maxCarbs_g?:         number;
  maxSodium_mg?:       number;
  minProtein_g?:       number;
  boostKeywords?:      string[];
  excludeKeywords?:    string[];
}

// ── USDA calorie reference by life stage ──────────────────────────────────

export const CALORIE_TARGETS: Record<string, CalorieTarget> = {
  infant_under2:        { min: 700,  max: 1000 },
  toddler_2_3:          { min: 1000, max: 1400 },
  child_4_8:            { min: 1200, max: 1600 },
  child_9_12:           { min: 1400, max: 2000 },
  teen_girl_13_18:      { min: 1600, max: 2400 },
  teen_boy_13_14:       { min: 2000, max: 2600 },
  teen_boy_15_18:       { min: 2200, max: 3200 },
  adult_woman_19_50:    { min: 1800, max: 2000 },
  adult_woman_51_64:    { min: 1600, max: 1800 },
  adult_man_19_50:      { min: 2400, max: 2600 },
  adult_man_51_64:      { min: 2200, max: 2400 },
  senior_woman_65plus:  { min: 1600, max: 1800 },
  senior_man_65plus:    { min: 2000, max: 2200 },
};

// ── Member option catalog ─────────────────────────────────────────────────

export const MEMBER_OPTIONS: MemberOption[] = [
  {
    id: 'adult_woman_19_50', label: 'Adult woman', subLabel: '19–50 years',
    defaultSex: 'female', kcalMin: 1800, kcalMax: 2000,
    ageGroup: '19-50', hideSexRow: false,
  },
  {
    id: 'adult_woman_51_64', label: 'Adult woman', subLabel: '51–64 years',
    defaultSex: 'female', kcalMin: 1600, kcalMax: 1800,
    ageGroup: '51-64', hideSexRow: false,
  },
  {
    id: 'adult_man_19_50', label: 'Adult man', subLabel: '19–50 years',
    defaultSex: 'male', kcalMin: 2400, kcalMax: 2600,
    ageGroup: '19-50', hideSexRow: false,
  },
  {
    id: 'adult_man_51_64', label: 'Adult man', subLabel: '51–64 years',
    defaultSex: 'male', kcalMin: 2200, kcalMax: 2400,
    ageGroup: '51-64', hideSexRow: false,
  },
  {
    id: 'senior_woman_65plus', label: 'Senior woman', subLabel: '65+ years',
    defaultSex: 'female', kcalMin: 1600, kcalMax: 1800,
    ageGroup: '65+', hideSexRow: false,
  },
  {
    id: 'senior_man_65plus', label: 'Senior man', subLabel: '65+ years',
    defaultSex: 'male', kcalMin: 2000, kcalMax: 2200,
    ageGroup: '65+', hideSexRow: false,
  },
  {
    id: 'teen_boy_15_18', label: 'Teen boy', subLabel: '15–18 years',
    defaultSex: 'male', kcalMin: 2200, kcalMax: 3200,
    ageGroup: '15-18', hideSexRow: false,
  },
  {
    id: 'teen_girl_13_18', label: 'Teen girl', subLabel: '13–18 years',
    defaultSex: 'female', kcalMin: 1600, kcalMax: 2400,
    ageGroup: '13-18', hideSexRow: false,
  },
  {
    id: 'child_9_12', label: 'Child', subLabel: '9–12 years',
    defaultSex: 'either', kcalMin: 1400, kcalMax: 2000,
    ageGroup: '9-12', hideSexRow: true,
  },
  {
    id: 'child_4_8', label: 'Child', subLabel: '4–8 years',
    defaultSex: 'either', kcalMin: 1200, kcalMax: 1600,
    ageGroup: '4-8', hideSexRow: true,
  },
  {
    id: 'toddler', label: 'Toddler', subLabel: '2–3 years',
    defaultSex: 'either', kcalMin: 1000, kcalMax: 1400,
    ageGroup: '2-3', hideSexRow: true,
  },
  {
    id: 'infant', label: 'Infant', subLabel: 'Under 2 years',
    defaultSex: 'either', kcalMin: 700, kcalMax: 1000,
    ageGroup: '0-2', hideSexRow: true,
  },
];

// ── Dietary mode catalog ──────────────────────────────────────────────────

export const DIETARY_MODES: DietaryModeOption[] = [
  {
    id: 'plant_based',
    label: 'Plant-based',
    sub: 'No meat · may include dairy and eggs',
    excludeCategories: ['meat', 'seafood'],
    boostCategories: ['produce', 'pantry', 'dairy'],
  },
  {
    id: 'low_carb',
    label: 'Low carb',
    sub: 'Under 100g carbs per day',
    maxCarbs_g: 100,
    boostCategories: ['meat', 'seafood', 'dairy', 'produce'],
  },
  {
    id: 'low_sodium',
    label: 'Low sodium',
    sub: 'Under 1,500mg sodium per day',
    maxSodium_mg: 1500,
    excludeKeywords: ['canned', 'processed', 'deli'],
  },
  {
    id: 'healthy_fats',
    label: 'Healthy fats',
    sub: 'Avocado, olive oil, omega-3 focus',
    boostKeywords: ['salmon', 'tuna', 'avocado', 'olive', 'nuts', 'walnuts'],
    boostCategories: ['seafood'],
  },
  {
    id: 'high_protein',
    label: 'High protein',
    sub: 'Over 30g protein per meal',
    minProtein_g: 30,
    boostCategories: ['meat', 'seafood', 'dairy'],
  },
  {
    id: 'mediterranean',
    label: 'Mediterranean',
    sub: 'Fish, legumes, whole grains',
    boostCategories: ['seafood', 'produce', 'pantry'],
  },
  {
    id: 'keto',
    label: 'Keto',
    sub: 'Under 50g carbs · high fat',
    maxCarbs_g: 50,
    boostCategories: ['meat', 'seafood', 'dairy'],
  },
  {
    id: 'diabetic_friendly',
    label: 'Diabetic-friendly',
    sub: 'Low glycemic · controlled portions',
    boostCategories: ['produce', 'seafood', 'meat'],
    excludeKeywords: ['sugar', 'syrup', 'candy', 'juice', 'soda'],
  },
];

// ── Utility functions ─────────────────────────────────────────────────────

/**
 * Computes household daily + per-meal calorie targets from member list.
 * Dinner is typically 30% of daily calories (USDA 2020–2025 pattern).
 */
export function computeHouseholdCalorieTarget(
  members: HouseholdMember[]
): HouseholdCalorieTarget {
  if (!members || members.length === 0) {
    return { min: 0, max: 0, perMeal: { min: 0, max: 0 }, members: [] };
  }
  const totalMin = members.reduce((sum, m) => sum + (m.kcal_min ?? 0), 0);
  const totalMax = members.reduce((sum, m) => sum + (m.kcal_max ?? 0), 0);
  return {
    min:     totalMin,
    max:     totalMax,
    perMeal: {
      min: Math.round(totalMin * 0.30),
      max: Math.round(totalMax * 0.30),
    },
    members,
  };
}

/**
 * Returns formatted calorie range label for a member option id.
 * e.g. "1,800–2,000 kcal"
 */
export function getMemberCalorieLabel(memberId: string): string {
  const m = MEMBER_OPTIONS.find(o => o.id === memberId);
  if (!m) return '';
  return `${m.kcalMin.toLocaleString()}–${m.kcalMax.toLocaleString()} kcal`;
}

/**
 * Converts a MEMBER_OPTIONS id to a HouseholdMember record for DB storage.
 */
export function memberOptionToRecord(optionId: string): HouseholdMember | null {
  const opt = MEMBER_OPTIONS.find(o => o.id === optionId);
  if (!opt) return null;
  return {
    role:      opt.id,
    age_group: opt.ageGroup,
    sex:       opt.defaultSex,
    kcal_min:  opt.kcalMin,
    kcal_max:  opt.kcalMax,
  };
}

// Dietary modes that conflict with each other (selecting one deselects others)
export const DIETARY_MODE_CONFLICTS: Record<string, string[]> = {
  plant_based: ['keto', 'high_protein'],
  keto:        ['low_carb'], // keto is stricter — no need for both
};
