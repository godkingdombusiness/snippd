// Behavior-driven experience type logic for Snippd personalization.
// Pure functions — no side effects, no imports.

export type ExperienceType = 'saver' | 'convenience' | 'explorer';

export interface RecentAction {
  action: string;
  category: string;
  at: number; // epoch ms
}

export interface UserPreferences {
  user_id: string;
  budget_range: number;
  preferred_stores: string[];
  category_clicks: Record<string, number>;
  last_actions: { recent?: RecentAction[] };
  experience_type: ExperienceType;
  updated_at: string;
}

/**
 * Derives the best experience type from stored user preferences.
 *
 * Rules (evaluated in order):
 *  1. budget_range < 100 → 'saver'         (budget-constrained)
 *  2. totalClicks > 15 OR 4+ categories   → 'explorer'  (high engagement)
 *  3. last 3 actions within avg 8 s each  → 'convenience' (fast selector)
 *  4. default                             → 'saver'
 */
export function getExperienceType(prefs: Partial<UserPreferences> | null): ExperienceType {
  if (!prefs) return 'saver';

  const budget     = prefs.budget_range ?? 150;
  const clicks     = prefs.category_clicks ?? {};
  const recent     = prefs.last_actions?.recent ?? [];

  if (budget < 100) return 'saver';

  const totalClicks  = Object.values(clicks).reduce((a, b) => a + b, 0);
  const categoryCount = Object.keys(clicks).length;
  if (totalClicks > 15 || categoryCount >= 4) return 'explorer';

  if (recent.length >= 3) {
    const sorted = [...recent].sort((a, b) => b.at - a.at);
    const spanMs = sorted[0].at - sorted[sorted.length - 1].at;
    const avgMs  = spanMs / (sorted.length - 1);
    if (avgMs < 8_000) return 'convenience';
  }

  return 'saver';
}

/**
 * Returns the top N category keys sorted by click count (highest first).
 * Used to bias stack and deal ordering toward user's preferred categories.
 */
export function getTopCategories(
  categoryClicks: Record<string, number>,
  limit = 3,
): string[] {
  return Object.entries(categoryClicks)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([cat]) => cat.toLowerCase());
}
