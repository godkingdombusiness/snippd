import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

const DEFAULT_PROFILE = {
  savings_priority: 0.5,
  nutrition_priority: 0.5,
  convenience_priority: 0.5,
  allergy_safety_priority: 0,
  store_loyalty_priority: 0.5,
  novelty_priority: 0.3,
  budget_pressure: 0.5,
  scan_compare_priority: 0.3,
  store_accuracy_warning_priority: 0,
};

const DEFAULT_SECTIONS = [
  'weekly_budget',
  'plan_my_week',
  'hottest_deals',
  'scan_item',
  'cart_summary',
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function clamp(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(1, n));
}

function normalizeProfile(row: Record<string, unknown> | null | undefined) {
  return {
    savings_priority: clamp(row?.savings_priority, DEFAULT_PROFILE.savings_priority),
    nutrition_priority: clamp(row?.nutrition_priority, DEFAULT_PROFILE.nutrition_priority),
    convenience_priority: clamp(row?.convenience_priority, DEFAULT_PROFILE.convenience_priority),
    allergy_safety_priority: clamp(row?.allergy_safety_priority, DEFAULT_PROFILE.allergy_safety_priority),
    store_loyalty_priority: clamp(row?.store_loyalty_priority, DEFAULT_PROFILE.store_loyalty_priority),
    novelty_priority: clamp(row?.novelty_priority, DEFAULT_PROFILE.novelty_priority),
    budget_pressure: clamp(row?.budget_pressure, DEFAULT_PROFILE.budget_pressure),
    scan_compare_priority: clamp(row?.scan_compare_priority, DEFAULT_PROFILE.scan_compare_priority),
    store_accuracy_warning_priority: clamp(
      row?.store_accuracy_warning_priority,
      DEFAULT_PROFILE.store_accuracy_warning_priority,
    ),
  };
}

function orderSections(profile: ReturnType<typeof normalizeProfile>, recentEvents: string[]) {
  const weights: Record<string, number> = {
    weekly_budget: 1 + profile.budget_pressure + profile.savings_priority,
    plan_my_week: 1 + profile.convenience_priority,
    scan_item: 0.75 + profile.scan_compare_priority,
    hottest_deals: 0.9 + profile.savings_priority,
    best_value_deals: 0.75 + profile.savings_priority + profile.budget_pressure * 0.5,
    high_protein_deals: 0.4 + profile.nutrition_priority,
    safe_picks: profile.allergy_safety_priority > 0.25 ? 0.7 + profile.allergy_safety_priority : 0,
    better_value_meals: 0.65 + profile.savings_priority * 0.5 + profile.nutrition_priority * 0.35,
    recent_savings: 0.55 + profile.savings_priority * 0.4,
    survey_followup: recentEvents.includes('receipt_confirmed') ? 1.4 : 0,
    cart_summary: recentEvents.includes('product_added_to_cart') ? 1.25 : 0.55,
    new_picks: profile.novelty_priority > 0.55 ? 0.65 + profile.novelty_priority : 0,
  };

  if (recentEvents.includes('product_scanned')) weights.scan_item += 0.35;
  if (recentEvents.includes('survey_completed')) weights.recent_savings += 0.2;

  return Object.entries(weights)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)
    .slice(0, 8);
}

function alertsFor(profile: ReturnType<typeof normalizeProfile>) {
  const alerts = [];
  if (profile.allergy_safety_priority >= 0.65) {
    alerts.push({
      type: 'allergy_safety',
      message: 'Check allergen flags before adding new items.',
    });
  }
  if (profile.store_accuracy_warning_priority >= 0.45) {
    alerts.push({
      type: 'store_accuracy',
      message: 'Verify in-store prices before checkout.',
    });
  }
  if (profile.budget_pressure >= 0.75) {
    alerts.push({
      type: 'budget_pressure',
      message: 'Cheaper swaps are prioritized this week.',
    });
  }
  return alerts;
}

function actionsFor(profile: ReturnType<typeof normalizeProfile>) {
  const actions = ['plan_my_week'];
  if (profile.scan_compare_priority >= 0.55) actions.unshift('scan_item');
  if (profile.savings_priority >= 0.7) actions.push('cheaper_swap');
  if (profile.allergy_safety_priority >= 0.65) actions.push('safe_pick');
  return [...new Set(actions)];
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST' && req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({
    status: 'ok',
    source: 'fallback',
    profile: DEFAULT_PROFILE,
    sections: DEFAULT_SECTIONS,
    alerts: [],
    emphasized_actions: ['plan_my_week'],
    hidden_sections: [],
    fallback: true,
  });

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  const { data: profileRow } = await db
    .from('user_priority_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data: recentRows } = await db
    .from('memory_events')
    .select('event_type')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const profile = normalizeProfile(profileRow as Record<string, unknown> | null);
  const recentEvents = (recentRows || []).map((row: { event_type: string }) => row.event_type);
  const sections = orderSections(profile, recentEvents);

  return json({
    status: 'ok',
    source: profileRow ? 'supabase_priority_profile' : 'fallback_profile',
    profile,
    sections: sections.length ? sections : DEFAULT_SECTIONS,
    alerts: alertsFor(profile),
    emphasized_actions: actionsFor(profile),
    hidden_sections: profile.convenience_priority >= 0.8 ? ['complex_analytics'] : [],
    fallback: !profileRow,
  });
});
