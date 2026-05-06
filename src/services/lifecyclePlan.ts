export type LifecycleStatus =
  | 'APPROVED'
  | 'LOW_YIELD_WEEK'
  | 'NEEDS_SUBSTITUTION'
  | 'DATA_STALE'
  | 'NO_RETAILER_COVERAGE';

export type CircularCadence = {
  startsOn: number; // 0=Sunday, 3=Wednesday
  cycleDays: number;
  publishHourLocal: number;
  timezone: string;
};

export type LifecycleItem = {
  item_id: string;
  retailer_node: string;
  category?: string;
  inventory_class?: 1 | 2 | 3;
  gross: number;
  digital_stack?: number;
  store_reward?: number;
  threshold_reward?: number;
  valid_from?: string;
  valid_until?: string;
  allergen_tags?: string[];
  dietary_tags?: string[];
};

export type LifecycleMeal = {
  day: string;
  b: string;
  l: string;
  d: string;
};

export type LifecycleSubstitution = {
  original: string;
  replacement: string;
  delta_cost: number;
};

export type SurplusAction = {
  action_id: string;
  title: string;
  prompt: string;
  item_ids: string[];
  estimated_oop: number;
  estimated_savings_percentage: number;
  expires_at: string;
  inventory_class: 1;
};

export type ReceiptVerificationPlan = {
  verification_id: string;
  plan_id: string;
  expected_item_ids: string[];
  alpha_score_eligible: boolean;
};

export type WeeklyLifecyclePlan = {
  plan_id: string;
  status: LifecycleStatus;
  cycle_dates: string;
  circular_valid_from: string;
  circular_valid_until: string;
  next_circular_at: string;
  stack_expires_at: string;
  retailer_node: string;
  budget_summary: {
    target_cap: number;
    actual_oop: number;
    savings_percentage: number;
    surplus_available: number;
  };
  basket_stack: LifecycleItem[];
  same_store_fillers?: LifecycleItem[];
  meal_prep_manual: {
    meals: LifecycleMeal[];
    prep_instructions: string[];
  };
  substitutions: {
    profile_applied?: string;
    swaps: LifecycleSubstitution[];
  };
  surplus_action?: SurplusAction;
  receipt_verification: ReceiptVerificationPlan;
  learning_hooks: {
    tracking_id: string;
    emit_events: string[];
  };
  disclosures: string[];
  validation_errors: string[];
};

export type UserConstraintProfile = {
  exclusions?: string[];
  retailer_nodes?: string[];
};

export const MANDATORY_LAUNCH_DISCLOSURE =
  'Snippd is a budgeting and decision-support operating system. We are not medical professionals. All nutritional, allergy, and substitution logic is generated algorithmically. Consult with a licensed healthcare provider before following any meal plan or dietary changes. Users must verify all ingredients on physical product labels at the retailer before purchase or consumption.';

export const RETAILER_CIRCULAR_CADENCE: Record<string, CircularCadence> = {
  publix: { startsOn: 3, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
  winn_dixie: { startsOn: 3, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
  kroger: { startsOn: 3, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
  kroger_delivery: { startsOn: 3, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
  cvs: { startsOn: 0, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
  walgreens: { startsOn: 0, cycleDays: 7, publishHourLocal: 0, timezone: 'America/New_York' },
};

const SUPPORTED_NODE_PREFIXES = ['publix', 'winn_dixie', 'kroger', 'kroger_delivery'];

function parseDateOnly(date: string): Date {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}

function normalizeRetailerKey(retailerNode: string): string {
  const lower = retailerNode.toLowerCase();
  if (lower.startsWith('winn')) return 'winn_dixie';
  if (lower.includes('delivery') && lower.includes('kroger')) return 'kroger_delivery';
  return lower.split(/[_:-]/)[0];
}

export function getRetailerCircularCadence(retailerNode: string): CircularCadence | null {
  const key = normalizeRetailerKey(retailerNode);
  return RETAILER_CIRCULAR_CADENCE[key] ?? null;
}

export function computeCircularWindow(retailerNode: string, asOfDate: string): {
  valid_from: string;
  valid_until: string;
  next_circular_at: string;
} | null {
  const cadence = getRetailerCircularCadence(retailerNode);
  if (!cadence) return null;

  const asOf = parseDateOnly(asOfDate);
  const day = asOf.getUTCDay();
  const daysSinceStart = (day - cadence.startsOn + 7) % 7;
  const start = new Date(asOf);
  start.setUTCDate(asOf.getUTCDate() - daysSinceStart);

  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + cadence.cycleDays - 1);

  const next = new Date(start);
  next.setUTCDate(start.getUTCDate() + cadence.cycleDays);

  return {
    valid_from: formatDateOnly(start),
    valid_until: formatDateOnly(end),
    next_circular_at: `${formatDateOnly(next)}T${String(cadence.publishHourLocal).padStart(2, '0')}:00:00`,
  };
}

export function calculateLifecycleSavings(items: LifecycleItem[]): {
  gross: number;
  oop: number;
  savings: number;
  savingsPercentage: number;
} {
  const gross = roundMoney(items.reduce((sum, item) => sum + item.gross, 0));
  const savings = roundMoney(items.reduce((sum, item) => (
    sum + (item.digital_stack ?? 0) + (item.store_reward ?? 0) + (item.threshold_reward ?? 0)
  ), 0));
  const oop = roundMoney(Math.max(0, gross - savings));
  return {
    gross,
    oop,
    savings,
    savingsPercentage: gross > 0 ? roundOneDecimal((savings / gross) * 100) : 0,
  };
}

export function findSameStoreFiller(
  currentItems: LifecycleItem[],
  candidates: LifecycleItem[],
  retailerNode: string,
  targetSavingsPercentage = 60,
): LifecycleItem[] {
  const selected = [...currentItems];
  const fillers = candidates
    .filter((item) => item.retailer_node === retailerNode)
    .filter((item) => !selected.some((current) => current.item_id === item.item_id))
    .sort((a, b) => itemSavingsRate(b) - itemSavingsRate(a));

  const added: LifecycleItem[] = [];
  for (const filler of fillers) {
    selected.push(filler);
    added.push(filler);
    if (calculateLifecycleSavings(selected).savingsPercentage >= targetSavingsPercentage) break;
  }
  return added;
}

export function validateLifecyclePlan(
  plan: WeeklyLifecyclePlan,
  opts: {
    asOfDate?: string;
    userProfile?: UserConstraintProfile;
    sameStoreFillerCandidates?: LifecycleItem[];
    minSavingsPercentage?: number;
  } = {},
): WeeklyLifecyclePlan {
  const errors: string[] = [];
  const minSavingsPercentage = opts.minSavingsPercentage ?? 60;
  const asOfDate = opts.asOfDate ?? new Date().toISOString().split('T')[0];
  const circular = computeCircularWindow(plan.retailer_node, asOfDate);

  if (!isSupportedRetailerNode(plan.retailer_node)) {
    return withStatus(plan, 'NO_RETAILER_COVERAGE', ['NO_RETAILER_COVERAGE']);
  }
  if (!circular) {
    return withStatus(plan, 'NO_RETAILER_COVERAGE', ['NO_RETAILER_COVERAGE']);
  }

  const retailerSet = new Set(plan.basket_stack.map((item) => item.retailer_node));
  if (retailerSet.size !== 1 || !retailerSet.has(plan.retailer_node)) {
    return withStatus(plan, 'LOW_YIELD_WEEK', ['SINGLE_STORE_INTEGRITY_FAILED']);
  }

  const staleItems = plan.basket_stack.filter((item) => {
    if (item.valid_from && item.valid_from > asOfDate) return true;
    if (item.valid_until && item.valid_until < asOfDate) return true;
    return false;
  });
  if (staleItems.length > 0) {
    return withStatus(plan, 'DATA_STALE', staleItems.map((item) => `DATA_STALE:${item.item_id}`));
  }

  const exclusions = new Set((opts.userProfile?.exclusions ?? []).map((tag) => tag.toLowerCase()));
  const excludedItems = plan.basket_stack.filter((item) =>
    [...(item.allergen_tags ?? []), ...(item.dietary_tags ?? [])]
      .some((tag) => exclusions.has(tag.toLowerCase())),
  );
  if (excludedItems.length > 0) {
    return withStatus(plan, 'NEEDS_SUBSTITUTION', excludedItems.map((item) => `NEEDS_SUBSTITUTION:${item.item_id}`));
  }

  let basket = [...plan.basket_stack];
  let totals = calculateLifecycleSavings(basket);
  let sameStoreFillers: LifecycleItem[] = [];

  if (totals.savingsPercentage < minSavingsPercentage && opts.sameStoreFillerCandidates?.length) {
    sameStoreFillers = findSameStoreFiller(basket, opts.sameStoreFillerCandidates, plan.retailer_node, minSavingsPercentage);
    basket = basket.concat(sameStoreFillers);
    totals = calculateLifecycleSavings(basket);
  }

  if (totals.savingsPercentage < minSavingsPercentage) {
    return {
      ...plan,
      status: 'LOW_YIELD_WEEK',
      circular_valid_from: circular.valid_from,
      circular_valid_until: circular.valid_until,
      next_circular_at: circular.next_circular_at,
      stack_expires_at: earliestExpiry(plan.basket_stack, circular.valid_until),
      budget_summary: {
        ...plan.budget_summary,
        actual_oop: totals.oop,
        savings_percentage: totals.savingsPercentage,
        surplus_available: roundMoney(plan.budget_summary.target_cap - totals.oop),
      },
      validation_errors: ['SAVINGS_FLOOR_FAILED'],
      disclosures: ensureDisclosure(plan.disclosures),
    };
  }

  return {
    ...plan,
    status: 'APPROVED',
    circular_valid_from: circular.valid_from,
    circular_valid_until: circular.valid_until,
    next_circular_at: circular.next_circular_at,
    stack_expires_at: earliestExpiry(basket, circular.valid_until),
    basket_stack: basket,
    same_store_fillers: sameStoreFillers,
    budget_summary: {
      ...plan.budget_summary,
      actual_oop: totals.oop,
      savings_percentage: totals.savingsPercentage,
      surplus_available: roundMoney(plan.budget_summary.target_cap - totals.oop),
    },
    surplus_action: buildSurplusAction(plan, basket),
    disclosures: ensureDisclosure(plan.disclosures),
    validation_errors: errors,
  };
}

function buildSurplusAction(plan: WeeklyLifecyclePlan, items: LifecycleItem[]): SurplusAction | undefined {
  const surplus = plan.budget_summary.target_cap - calculateLifecycleSavings(items).oop;
  if (surplus <= 20) return undefined;

  const vaultItems = items.filter((item) => item.inventory_class === 1 && itemSavingsRate(item) >= 40);
  if (vaultItems.length === 0) return undefined;

  const expiresAt = earliestExpiry(vaultItems, plan.stack_expires_at);
  return {
    action_id: `${plan.plan_id}_surplus_vault`,
    title: 'Surplus Vault',
    prompt: `You have $${roundMoney(surplus).toFixed(2)} left. Use part of it to stock up before this stack expires?`,
    item_ids: vaultItems.map((item) => item.item_id),
    estimated_oop: roundMoney(vaultItems.reduce((sum, item) => sum + item.gross, 0) - vaultItems.reduce((sum, item) => (
      sum + (item.digital_stack ?? 0) + (item.store_reward ?? 0) + (item.threshold_reward ?? 0)
    ), 0)),
    estimated_savings_percentage: roundOneDecimal(
      vaultItems.reduce((sum, item) => sum + item.gross, 0) > 0
        ? vaultItems.reduce((sum, item) => sum + (item.digital_stack ?? 0) + (item.store_reward ?? 0) + (item.threshold_reward ?? 0), 0)
          / vaultItems.reduce((sum, item) => sum + item.gross, 0) * 100
        : 0,
    ),
    expires_at: expiresAt,
    inventory_class: 1,
  };
}

function withStatus(plan: WeeklyLifecyclePlan, status: LifecycleStatus, errors: string[]): WeeklyLifecyclePlan {
  return {
    ...plan,
    status,
    validation_errors: errors,
    disclosures: ensureDisclosure(plan.disclosures),
  };
}

function isSupportedRetailerNode(retailerNode: string): boolean {
  const lower = retailerNode.toLowerCase();
  return SUPPORTED_NODE_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

function earliestExpiry(items: LifecycleItem[], fallback: string): string {
  return items
    .map((item) => item.valid_until)
    .filter((date): date is string => Boolean(date))
    .sort()[0] ?? fallback;
}

function itemSavingsRate(item: LifecycleItem): number {
  if (item.gross <= 0) return 0;
  return ((item.digital_stack ?? 0) + (item.store_reward ?? 0) + (item.threshold_reward ?? 0)) / item.gross * 100;
}

function ensureDisclosure(disclosures: string[]): string[] {
  return Array.from(new Set([...disclosures, MANDATORY_LAUNCH_DISCLOSURE]));
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function roundOneDecimal(n: number): number {
  return Math.round(n * 10) / 10;
}
