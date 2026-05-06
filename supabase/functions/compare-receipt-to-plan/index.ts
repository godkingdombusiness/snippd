// Edge Function: compare-receipt-to-plan
// Compares a scanned receipt against the user's locked-in weekly plan.
// Saves a receipt_outcomes row and returns the full savings comparison.
//
// Input:  { weekly_plan_id?, receipt_total_cents, store,
//           parsed_items[], stack_items_count, total_saved_cents }
// Output: { ok, outcome_id, planned_total, actual_total,
//           baseline_without_snippd_total, planned_savings, actual_savings,
//           plan_accuracy_percent, budget_target, budget_result,
//           was_under_budget, matched_items_count, missing_items_count,
//           coupons_expected, coupons_confirmed, meals_covered, store }

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

    const {
      weekly_plan_id    = null,
      receipt_total_cents = 0,
      store             = '',
      parsed_items      = [] as unknown[],
      stack_items_count = 0,
      total_saved_cents = 0,
    } = await req.json() as {
      weekly_plan_id?: string | null;
      receipt_total_cents: number;
      store: string;
      parsed_items: unknown[];
      stack_items_count: number;
      total_saved_cents: number;
    };

    // Load the weekly plan if a plan_id was provided
    let plan: Record<string, number> | null = null;
    let couponsExpected = 0;

    if (weekly_plan_id) {
      const { data: planRow } = await supabase
        .from('weekly_plans')
        .select('projected_total, baseline_without_snippd_total, budget_target, meals_covered')
        .eq('id', weekly_plan_id)
        .eq('user_id', user.id)
        .single();
      plan = planRow as Record<string, number> | null;

      // Count expected coupons
      const { count } = await supabase
        .from('coupon_checklist')
        .select('id', { count: 'exact', head: true })
        .eq('weekly_plan_id', weekly_plan_id);
      couponsExpected = count ?? 0;
    }

    const actualTotal    = receipt_total_cents / 100;

    // Baseline: use plan value if available; otherwise estimate at 1.35× actual
    const baseline       = plan?.baseline_without_snippd_total
      ?? parseFloat((actualTotal * 1.35).toFixed(2));

    // Planned total: use plan or fall back to actual (best-effort)
    const plannedTotal   = plan?.projected_total ?? actualTotal;
    const budgetTarget   = plan?.budget_target ?? 150;

    // Core savings math — never overstate
    const plannedSavings = Math.max(0, parseFloat((baseline - plannedTotal).toFixed(2)));
    const actualSavings  = Math.max(0, parseFloat((baseline - actualTotal).toFixed(2)));
    const budgetResult   = parseFloat((budgetTarget - actualTotal).toFixed(2));
    const wasUnderBudget = budgetResult >= 0;

    // Plan accuracy: 100% when planned === actual, degrades proportionally
    const planAccuracy = plannedTotal > 0
      ? Math.max(0, Math.round((1 - Math.abs(actualTotal - plannedTotal) / plannedTotal) * 100))
      : 100;

    // Item matching stats
    const matchedCount   = stack_items_count;
    const totalPlanItems = plan ? 7 : 5; // approximation from meal count
    const missingCount   = Math.max(0, totalPlanItems - matchedCount);
    const couponsConfirmed = Math.min(stack_items_count, couponsExpected);
    const mealsCovered   = matchedCount > 0
      ? Math.min(7, Math.ceil(matchedCount / 2))
      : 0;

    // Label baseline as estimated when no plan was found
    const baselineIsEstimated = !plan?.baseline_without_snippd_total;

    // Save to receipt_outcomes
    const { data: outcome, error: outErr } = await supabase
      .from('receipt_outcomes')
      .insert({
        user_id:                       user.id,
        weekly_plan_id:                weekly_plan_id || null,
        store,
        planned_total:                 plannedTotal,
        actual_total:                  actualTotal,
        baseline_without_snippd_total: baseline,
        planned_savings:               plannedSavings,
        actual_savings:                actualSavings,
        plan_accuracy_percent:         planAccuracy,
        budget_target:                 budgetTarget,
        budget_result:                 budgetResult,
        was_under_budget:              wasUnderBudget,
        matched_items_count:           matchedCount,
        missing_items_count:           missingCount,
        coupons_expected:              couponsExpected,
        coupons_confirmed:             couponsConfirmed,
        meals_covered:                 mealsCovered,
        raw_receipt_payload:           { parsed_items, receipt_total_cents, store },
      })
      .select('id')
      .single();

    if (outErr) throw outErr;

    return json({
      ok:                            true,
      outcome_id:                    (outcome as { id: string }).id,
      weekly_plan_id,
      store,
      planned_total:                 plannedTotal,
      actual_total:                  actualTotal,
      baseline_without_snippd_total: baseline,
      baseline_is_estimated:         baselineIsEstimated,
      planned_savings:               plannedSavings,
      actual_savings:                actualSavings,
      plan_accuracy_percent:         planAccuracy,
      budget_target:                 budgetTarget,
      budget_result:                 budgetResult,
      was_under_budget:              wasUnderBudget,
      matched_items_count:           matchedCount,
      missing_items_count:           missingCount,
      coupons_expected:              couponsExpected,
      coupons_confirmed:             couponsConfirmed,
      meals_covered:                 mealsCovered,
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[compare-receipt-to-plan]', msg);
    return json({ error: 'Internal error', detail: msg }, 500);
  }
});
