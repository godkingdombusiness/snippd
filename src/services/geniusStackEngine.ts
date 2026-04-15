/**
 * geniusStackEngine.ts
 *
 * Applies dietary mode filters and calorie alignment scoring
 * to raw stack_candidates deals. Used for client-side post-processing
 * and standalone scoring runs.
 *
 * Run standalone:
 *   npx ts-node --project tsconfig.test.json src/services/geniusStackEngine.ts <userId>
 */

import type { SupabaseClient } from '@supabase/supabase-js';

// ── Types ──────────────────────────────────────────────────────────────────

export interface DealCandidate {
  id:                string;
  item_name:         string;
  category:          string;
  base_price:        number;
  final_price:       number;
  sale_savings:      number;
  calories?:         number | null;
  protein_g?:        number | null;
  carbs_g?:          number | null;
  fat_g?:            number | null;
  sodium_mg?:        number | null;
  stack_rank_score:  number;
  dietary_tags?:     unknown;
  allergen_tags?:    unknown;
  retailer?:         string;
  has_coupon?:       boolean;
  is_bogo?:          boolean;
}

export interface GeniusProfile {
  dietary_modes:             string[];
  meal_calorie_target_min?:  number;
  meal_calorie_target_max?:  number;
  headcount:                 number;
}

export interface ScoredDeal extends DealCandidate {
  genius_score:       number;
  excluded:           boolean;
  exclusion_reason?:  string;
}

// ── Core scoring function ─────────────────────────────────────────────────

/**
 * Applies dietary mode boosts/penalties to a list of deals.
 * Returns scored deals with genius_score and exclusion flags.
 */
export function applyDietaryScoring(
  deals: DealCandidate[],
  profile: GeniusProfile
): ScoredDeal[] {
  return deals.map(deal => {
    let score = deal.stack_rank_score ?? 0;
    let excluded = false;
    let exclusion_reason: string | undefined;

    for (const mode of (profile.dietary_modes ?? [])) {
      switch (mode) {

        case 'plant_based':
          if (['meat', 'seafood'].includes(deal.category)) {
            excluded = true;
            exclusion_reason = 'plant_based excludes meat/seafood';
          } else if (['produce', 'dairy', 'pantry'].includes(deal.category)) {
            score += 0.15;
          }
          break;

        case 'low_carb':
          if ((deal.carbs_g ?? 0) > 25) score -= 0.10;
          if (['meat', 'seafood', 'dairy', 'produce'].includes(deal.category)) score += 0.08;
          break;

        case 'keto':
          if ((deal.carbs_g ?? 0) > 15) score -= 0.20;
          if (['meat', 'seafood', 'dairy'].includes(deal.category)) score += 0.08;
          break;

        case 'low_sodium':
          if (/canned|processed|deli/i.test(deal.item_name ?? '')) score -= 0.15;
          if (['produce', 'meat'].includes(deal.category)) score += 0.08;
          break;

        case 'healthy_fats':
          if (/salmon|tuna|avocado|olive|nuts|walnuts/i.test(deal.item_name ?? '')) score += 0.20;
          if (deal.category === 'seafood') score += 0.12;
          break;

        case 'high_protein':
          if ((deal.protein_g ?? 0) > 25) score += 0.10;
          if (['meat', 'seafood'].includes(deal.category)) score += 0.15;
          break;

        case 'mediterranean':
          if (deal.category === 'seafood') score += 0.20;
          else if (deal.category === 'produce') score += 0.10;
          else if (deal.category === 'pantry') score += 0.08;
          break;

        case 'diabetic_friendly':
          if (/sugar|syrup|candy|juice|soda/i.test(deal.item_name ?? '')) {
            excluded = true;
            exclusion_reason = 'diabetic_friendly excludes high-sugar items';
          } else if (['produce', 'seafood', 'meat'].includes(deal.category)) {
            score += 0.10;
          }
          break;
      }
    }

    // Calorie alignment scoring
    const calMin = profile.meal_calorie_target_min;
    const calMax = profile.meal_calorie_target_max;
    const headcount = profile.headcount || 1;

    if (deal.calories && calMin && calMax) {
      const targetPerPerson = calMin / headcount;
      const withinRange = deal.calories >= (targetPerPerson * 0.8) &&
                          deal.calories <= (targetPerPerson * 1.2);
      const wayOver = deal.calories > targetPerPerson * 1.5;

      if (withinRange) score += 0.08;
      if (wayOver)     score -= 0.05;
    }

    return {
      ...deal,
      genius_score:     Math.max(0, Math.min(parseFloat(score.toFixed(4)), 2.0)),
      excluded,
      exclusion_reason,
    };
  });
}

// ── Full engine runner ────────────────────────────────────────────────────

export async function runGeniusStackEngine(
  supabase: SupabaseClient,
  userId: string,
  headcount = 4
): Promise<{ scored: ScoredDeal[]; profile: GeniusProfile }> {
  // Load dietary profile
  const { data: profileData } = await supabase
    .from('profiles')
    .select('dietary_modes, meal_calorie_target_min, meal_calorie_target_max')
    .eq('user_id', userId)
    .single();

  // any casts needed: dietary_modes is a new column, TS types may not include it
  const rawProfile = profileData as Record<string, unknown> | null;

  const geniusProfile: GeniusProfile = {
    dietary_modes:            (rawProfile?.dietary_modes as string[]) ?? [],
    meal_calorie_target_min:  (rawProfile?.meal_calorie_target_min as number) ?? undefined,
    meal_calorie_target_max:  (rawProfile?.meal_calorie_target_max as number) ?? undefined,
    headcount,
  };

  // Load active deals
  const { data: deals, error } = await supabase
    .from('stack_candidates')
    .select(
      'id, item_name, category, base_price, final_price, sale_savings, ' +
      'calories, protein_g, carbs_g, fat_g, sodium_mg, stack_rank_score, ' +
      'dietary_tags, allergen_tags, retailer, has_coupon, is_bogo'
    )
    .eq('is_active', true);

  if (error) throw error;

  const scored = applyDietaryScoring((deals as unknown as DealCandidate[]) ?? [], geniusProfile);

  return { scored, profile: geniusProfile };
}

// ── CLI entry point ───────────────────────────────────────────────────────

if (require.main === module) {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(
    process.env.SUPABASE_URL ?? '',
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  );
  const userId = process.argv[2] ?? '';

  runGeniusStackEngine(supabase, userId)
    .then(({ scored, profile }) => {
      const active = scored.filter(d => !d.excluded);
      console.log(`GeniusStackEngine — ${active.length} active deals (${scored.length - active.length} excluded)`);
      console.log(`Dietary modes: ${profile.dietary_modes.join(', ') || 'none'}`);
      console.log('Top 5 by genius_score:');
      active
        .sort((a, b) => b.genius_score - a.genius_score)
        .slice(0, 5)
        .forEach(d => console.log(`  [${d.genius_score.toFixed(3)}] ${d.item_name} (${d.category})`));
    })
    .catch(console.error);
}
