// Edge Function: generate-weekly-plan
// Persists a WeeklyPlanScreen plan to the weekly_plans table and returns
// a weekly_plan_id the client stores in AsyncStorage.
//
// Called from WeeklyPlanScreen when the user taps "Add All to My List".
// Input:  { meals[], projected_total_cents, baseline_without_snippd_cents,
//           budget_target_cents, household_size, preferred_stores, week_start? }
// Output: { ok, weekly_plan_id, projected_total, baseline_without_snippd_total,
//           estimated_snippd_savings, budget_target }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];

function getMonday(): string {
  const d = new Date();
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d.toISOString().split('T')[0];
}

function mealCents(meal: Record<string, unknown>): number {
  const ingredients = (meal.ingredients as Array<Record<string, number>>) ?? [];
  return ingredients.reduce((s, i) => s + (i.sale_cents || i.reg_cents || 0), 0);
}

// Estimated per-person breakfast/lunch costs (cents)
const BREAKFAST_PER_PERSON = 250; // $2.50 — eggs, toast, coffee
const LUNCH_PER_PERSON     = 400; // $4.00 — sandwich, salad

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Unauthorized' }, 401);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const {
      meals             = [],
      projected_total_cents          = 0,
      baseline_without_snippd_cents  = 0,
      budget_target_cents            = 15000,
      household_size                 = 2,
      preferred_stores               = [] as string[],
      week_start,
    } = body as {
      meals: Record<string, unknown>[];
      projected_total_cents: number;
      baseline_without_snippd_cents: number;
      budget_target_cents: number;
      household_size: number;
      preferred_stores: string[];
      week_start?: string;
    };

    const weekStart        = week_start || getMonday();
    const projectedDollars = projected_total_cents / 100;
    const baselineDollars  = baseline_without_snippd_cents / 100;
    const budgetDollars    = budget_target_cents / 100;
    const estimatedSavings = Math.max(0, baselineDollars - projectedDollars);

    // Upsert weekly_plans (idempotent by user_id + week_start)
    const { data: plan, error: planErr } = await supabase
      .from('weekly_plans')
      .upsert({
        user_id:                       user.id,
        week_start:                    weekStart,
        budget_target:                 budgetDollars,
        household_size,
        preferred_stores,
        projected_total:               projectedDollars,
        baseline_without_snippd_total: baselineDollars,
        estimated_snippd_savings:      estimatedSavings,
        meals_covered:                 meals.length + meals.length * 2, // dinner + est B+L
      }, { onConflict: 'user_id,week_start' })
      .select('id')
      .single();

    if (planErr) throw planErr;
    const planId = plan.id as string;

    // Build and save day rows
    if (meals.length > 0) {
      const dayRows = meals.slice(0, 7).map((meal, i) => {
        const dinnerCents  = mealCents(meal);
        const bfCents      = BREAKFAST_PER_PERSON * household_size;
        const lunchC       = LUNCH_PER_PERSON     * household_size;
        return {
          weekly_plan_id:  planId,
          day_name:        DAYS[i],
          day_index:       i,
          breakfast: {
            name:        'Eggs & Toast',
            total_cents: bfCents,
            note:        'estimated',
          },
          lunch: {
            name:        'Sandwich & Side',
            total_cents: lunchC,
            note:        'estimated',
          },
          dinner: {
            name:        (meal.name as string) || 'Dinner',
            ingredients: meal.ingredients || [],
            total_cents: dinnerCents,
            cal:         (meal.cal as number) || 0,
            coupon:      (meal.coupon as string | null) || null,
          },
          daily_total: (bfCents + lunchC + dinnerCents) / 100,
        };
      });

      // Replace day rows for this plan (idempotent)
      await supabase.from('weekly_plan_days').delete().eq('weekly_plan_id', planId);
      await supabase.from('weekly_plan_days').insert(dayRows);
    }

    // Build coupon checklist from meals that have a coupon note
    const couponRows = meals
      .filter(m => m.coupon)
      .map(m => ({
        user_id:            user.id,
        weekly_plan_id:     planId,
        store:              preferred_stores[0] || 'Publix',
        item_name:          (m.name as string) || 'Item',
        coupon_description: m.coupon as string,
        estimated_value:    null,
        status:             'not_clipped',
      }));

    if (couponRows.length > 0) {
      await supabase.from('coupon_checklist').delete().eq('weekly_plan_id', planId);
      await supabase.from('coupon_checklist').insert(couponRows);
    }

    return json({
      ok:                            true,
      weekly_plan_id:                planId,
      projected_total:               projectedDollars,
      baseline_without_snippd_total: baselineDollars,
      estimated_snippd_savings:      estimatedSavings,
      budget_target:                 budgetDollars,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[generate-weekly-plan]', msg);
    return json({ error: 'Internal error', detail: msg }, 500);
  }
});
