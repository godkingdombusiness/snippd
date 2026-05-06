import { describe, expect, it } from 'vitest';
import {
  computeCircularWindow,
  validateLifecyclePlan,
  type WeeklyLifecyclePlan,
} from '../src/services/lifecyclePlan';

function basePlan(overrides: Partial<WeeklyLifecyclePlan> = {}): WeeklyLifecyclePlan {
  return {
    plan_id: 'plan_001',
    status: 'LOW_YIELD_WEEK',
    cycle_dates: '2026-04-29_to_2026-05-05',
    circular_valid_from: '',
    circular_valid_until: '',
    next_circular_at: '',
    stack_expires_at: '',
    retailer_node: 'publix_clermont_001',
    budget_summary: {
      target_cap: 150,
      actual_oop: 0,
      savings_percentage: 0,
      surplus_available: 0,
    },
    basket_stack: [
      {
        item_id: 'TIDE_92OZ',
        retailer_node: 'publix_clermont_001',
        gross: 12.99,
        digital_stack: 3,
        threshold_reward: 5,
        valid_from: '2026-04-29',
        valid_until: '2026-05-05',
        inventory_class: 1,
      },
      {
        item_id: 'CHARMIN_9M',
        retailer_node: 'publix_clermont_001',
        gross: 15.99,
        digital_stack: 5,
        threshold_reward: 5,
        valid_from: '2026-04-29',
        valid_until: '2026-05-05',
        inventory_class: 1,
      },
    ],
    meal_prep_manual: {
      meals: [{ day: 'Mon', b: 'Cold Brew Parfait', l: 'Deli Club', d: 'Sticky Garlic Wings' }],
      prep_instructions: ['Portion proteins for the week'],
    },
    substitutions: { swaps: [] },
    receipt_verification: {
      verification_id: 'rv_001',
      plan_id: 'plan_001',
      expected_item_ids: ['TIDE_92OZ', 'CHARMIN_9M'],
      alpha_score_eligible: true,
    },
    learning_hooks: {
      tracking_id: 'track_4492',
      emit_events: ['meal_selected', 'recipe_saved'],
    },
    disclosures: [],
    validation_errors: [],
    ...overrides,
  };
}

describe('lifecycle plan validator', () => {
  it('computes Wednesday-Tuesday circular windows for supported grocery retailers', () => {
    expect(computeCircularWindow('publix_clermont_001', '2026-04-28')).toEqual({
      valid_from: '2026-04-22',
      valid_until: '2026-04-28',
      next_circular_at: '2026-04-29T00:00:00',
    });

    expect(computeCircularWindow('kroger_tn_054', '2026-04-29')).toEqual({
      valid_from: '2026-04-29',
      valid_until: '2026-05-05',
      next_circular_at: '2026-05-06T00:00:00',
    });
  });

  it('approves a single-store plan that clears the 60 percent floor and exposes expiry dates', () => {
    const validated = validateLifecyclePlan(basePlan(), { asOfDate: '2026-04-29' });

    expect(validated.status).toBe('APPROVED');
    expect(validated.budget_summary.savings_percentage).toBeGreaterThanOrEqual(60);
    expect(validated.circular_valid_from).toBe('2026-04-29');
    expect(validated.circular_valid_until).toBe('2026-05-05');
    expect(validated.stack_expires_at).toBe('2026-05-05');
    expect(validated.surplus_action?.inventory_class).toBe(1);
  });

  it('rejects mixed-store filler in a one-stop plan', () => {
    const validated = validateLifecyclePlan(basePlan({
      basket_stack: [
        ...basePlan().basket_stack,
        { item_id: 'CVS_TOOTHPASTE', retailer_node: 'cvs_clermont_101', gross: 3, digital_stack: 3 },
      ],
    }), { asOfDate: '2026-04-29' });

    expect(validated.status).toBe('LOW_YIELD_WEEK');
    expect(validated.validation_errors).toContain('SINGLE_STORE_INTEGRITY_FAILED');
  });

  it('uses same-store fillers to bridge a low-yield plan', () => {
    const plan = basePlan({
      basket_stack: [
        {
          item_id: 'LOW_YIELD_MEAT',
          retailer_node: 'publix_clermont_001',
          gross: 40,
          digital_stack: 8,
          valid_from: '2026-04-29',
          valid_until: '2026-05-05',
        },
      ],
    });

    const validated = validateLifecyclePlan(plan, {
      asOfDate: '2026-04-29',
      sameStoreFillerCandidates: [
        {
          item_id: 'PUBLIX_TOOTHPASTE',
          retailer_node: 'publix_clermont_001',
          gross: 3,
          digital_stack: 3,
          valid_from: '2026-04-29',
          valid_until: '2026-05-05',
        },
        {
          item_id: 'CVS_TOOTHPASTE',
          retailer_node: 'cvs_clermont_101',
          gross: 3,
          digital_stack: 3,
          valid_from: '2026-04-29',
          valid_until: '2026-05-05',
        },
      ],
    });

    expect(validated.status).toBe('LOW_YIELD_WEEK');
    expect(validated.same_store_fillers).toBeUndefined();
    expect(validated.basket_stack.some((item) => item.retailer_node.startsWith('cvs'))).toBe(false);
  });

  it('requires substitution when a profile exclusion appears in the basket', () => {
    const validated = validateLifecyclePlan(basePlan({
      basket_stack: [
        {
          item_id: 'OIKOS_PRO',
          retailer_node: 'publix_clermont_001',
          gross: 6,
          digital_stack: 4,
          valid_from: '2026-04-29',
          valid_until: '2026-05-05',
          allergen_tags: ['dairy_free'],
        },
      ],
    }), {
      asOfDate: '2026-04-29',
      userProfile: { exclusions: ['dairy_free'] },
    });

    expect(validated.status).toBe('NEEDS_SUBSTITUTION');
    expect(validated.validation_errors).toContain('NEEDS_SUBSTITUTION:OIKOS_PRO');
  });
});
