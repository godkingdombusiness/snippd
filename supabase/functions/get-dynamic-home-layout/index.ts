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

const DEFAULT_FEATURED_STACK = {
  id: 'household_paper_dg',
  type: 'flash_stack',
  title: 'Household Essentials Flash Stack',
  subtext: 'Curated by @CouponQueen · Valid 5/18 - 5/23',
  attributionLabel: 'Curated by @CouponQueen · Valid 5/18 - 5/23',
  creatorHandle: '@CouponQueen',
  category: 'household',
  storeName: 'Dollar General',
  totalCost: 11.50,
  totalCostCents: 1150,
  savings: 14.50,
  savingsCents: 1450,
  totalMealsProvided: 0,
};

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

function neo4jConfig() {
  const uri = Deno.env.get('NEO4J_URI') ?? '';
  const user = Deno.env.get('NEO4J_USER') ?? '';
  const password = Deno.env.get('NEO4J_PASSWORD') ?? '';
  const database = Deno.env.get('NEO4J_DATABASE') ?? 'neo4j';
  if (!uri || !user || !password) return null;
  const httpBase = uri
    .replace(/^neo4j\+s:\/\//, 'https://')
    .replace(/^neo4j:\/\//, 'http://')
    .replace(/^bolt\+s:\/\//, 'https://')
    .replace(/^bolt:\/\//, 'http://')
    .replace(/\/$/, '');
  return { url: `${httpBase}/db/${database}/tx/commit`, user, password };
}

async function runCypher(statements: Array<{ statement: string; parameters?: Record<string, unknown> }>) {
  const cfg = neo4jConfig();
  if (!cfg) return null;
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${cfg.user}:${cfg.password}`)}`,
    },
    body: JSON.stringify({ statements }),
  });
  if (!res.ok) throw new Error(`neo4j_http_${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(body.errors[0].message);
  return body.results ?? [];
}

function firstNode(result: unknown): Record<string, unknown> | null {
  const rows = (result as { data?: Array<{ row?: unknown[] }> })?.data ?? [];
  const row = rows[0]?.row?.[0];
  return row && typeof row === 'object' && !Array.isArray(row) ? row as Record<string, unknown> : null;
}

function toFeaturedStack(row: Record<string, unknown> | null) {
  if (!row) return DEFAULT_FEATURED_STACK;
  const totalCost = Number(row.total_cost ?? row.totalCost ?? DEFAULT_FEATURED_STACK.totalCost);
  const savings = Number(row.savings ?? DEFAULT_FEATURED_STACK.savings);
  const creatorHandle = String(row.creatorHandle ?? row.creator_handle ?? DEFAULT_FEATURED_STACK.creatorHandle);
  const validRange = String(row.validRange ?? row.valid_range ?? 'Valid 5/18 - 5/23');
  const attributionLabel = String(
    row.attributionLabel ?? row.attribution_label ?? `Curated by ${creatorHandle} · ${validRange}`,
  );
  return {
    ...DEFAULT_FEATURED_STACK,
    id: String(row.id ?? DEFAULT_FEATURED_STACK.id),
    title: String(row.title ?? DEFAULT_FEATURED_STACK.title),
    subtext: attributionLabel,
    attributionLabel,
    creatorHandle,
    category: String(row.category ?? DEFAULT_FEATURED_STACK.category),
    storeName: String(row.storeName ?? row.store_name ?? DEFAULT_FEATURED_STACK.storeName),
    totalCost,
    totalCostCents: Math.round(totalCost * 100),
    savings,
    savingsCents: Math.round(savings * 100),
    totalMealsProvided: Number(row.total_meals_provided ?? row.totalMealsProvided ?? 0),
  };
}

async function fetchFeaturedStack(userId: string, weeklyBudget: number, householdMealMinimum: number) {
  if (!neo4jConfig()) {
    return { featuredStack: DEFAULT_FEATURED_STACK, source: 'fallback_featured_stack' };
  }
  try {
    const results = await runCypher([
      {
        statement: `
          MERGE (store:Store {name: "Dollar General"})
          MERGE (category:Category {name: "household"})
          MERGE (creator:Creator {handle: "@CouponQueen"})
          MERGE (flash:FlashStack {id: "household_paper_dg"})
            SET flash.title = "Household Essentials Flash Stack",
                flash.total_cost = 11.50,
                flash.savings = 14.50,
                flash.category = "household",
                flash.storeName = "Dollar General",
                flash.creatorHandle = "@CouponQueen",
                flash.validRange = "Valid 5/18 - 5/23",
                flash.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
          MERGE (store)-[:OFFERS]->(flash)
          MERGE (creator)-[:CURATED_BY]->(flash)
          MERGE (flash)-[:IN_CATEGORY]->(category)

          MERGE (hp:DietaryPersona {name: "High-Protein"})
          MERGE (fb:DietaryPersona {name: "Family-Budget"})
          MERGE (vg:DietaryPersona {name: "Vegetarian"})
          MERGE (qe:DietaryPersona {name: "Quick-Easy"})

          MERGE (protein:FoodStack {id: "high_protein_chicken_stack"})
            SET protein.title = "High-Protein Chicken Dinner Stack",
                protein.total_cost = 42.00,
                protein.total_meals_provided = 8,
                protein.savings = 14.50,
                protein.creatorHandle = "@CouponQueen",
                protein.validRange = "Valid 5/18 - 5/23",
                protein.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
          MERGE (creator)-[:CURATED_BY]->(protein)
          MERGE (hp)-[:RECOMMENDS]->(protein)

          MERGE (family:FoodStack {id: "family_budget_pasta_stack"})
            SET family.title = "Family-Budget Pasta Night Stack",
                family.total_cost = 34.00,
                family.total_meals_provided = 10,
                family.savings = 12.25,
                family.creatorHandle = "@CouponQueen",
                family.validRange = "Valid 5/18 - 5/23",
                family.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
          MERGE (creator)-[:CURATED_BY]->(family)
          MERGE (fb)-[:RECOMMENDS]->(family)

          MERGE (veg:FoodStack {id: "vegetarian_bean_bowl_stack"})
            SET veg.title = "Vegetarian Bean Bowl Stack",
                veg.total_cost = 29.00,
                veg.total_meals_provided = 8,
                veg.savings = 10.75,
                veg.creatorHandle = "@CouponQueen",
                veg.validRange = "Valid 5/18 - 5/23",
                veg.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
          MERGE (creator)-[:CURATED_BY]->(veg)
          MERGE (vg)-[:RECOMMENDS]->(veg)

          MERGE (quick:FoodStack {id: "quick_easy_taco_stack"})
            SET quick.title = "Quick-Easy Taco Stack",
                quick.total_cost = 31.00,
                quick.total_meals_provided = 6,
                quick.savings = 11.00,
                quick.creatorHandle = "@CouponQueen",
                quick.validRange = "Valid 5/18 - 5/23",
                quick.attributionLabel = "Curated by @CouponQueen · Valid 5/18 - 5/23"
          MERGE (creator)-[:CURATED_BY]->(quick)
          MERGE (qe)-[:RECOMMENDS]->(quick)
        `,
      },
      {
        statement: `
          MERGE (u:User {user_id: $userId})
            SET u.id = $userId,
                u.weekly_budget = $weeklyBudget,
                u.household_meal_minimum = $householdMealMinimum
          WITH u
          MATCH (p:DietaryPersona {name: "Family-Budget"})
          MERGE (u)-[:MATCHES_PERSONA]->(p)
        `,
        parameters: { userId, weeklyBudget, householdMealMinimum },
      },
      {
        statement: `
          MATCH (u:User {user_id: $userId})-[:MATCHES_PERSONA]->(p:DietaryPersona)
          MATCH (p)-[:RECOMMENDS]->(f:FoodStack)
          WHERE f.total_cost <= u.weekly_budget
            AND f.total_meals_provided >= u.household_meal_minimum
            AND NOT (u)-[:AVOIDS]->(f)
          RETURN f LIMIT 1
        `,
        parameters: { userId },
      },
      {
        statement: `
          MATCH (flash:FlashStack {id: "household_paper_dg"})
          WHERE NOT EXISTS {
            MATCH (u:User {user_id: $userId})-[:DISLIKES_CATEGORY]->(:Category {name: "household"})
          }
          RETURN flash LIMIT 1
        `,
        parameters: { userId },
      },
    ]);
    const foodStack = firstNode(results?.[2]);
    const flashStack = firstNode(results?.[3]);
    return {
      featuredStack: flashStack || foodStack ? toFeaturedStack(flashStack ?? foodStack) : null,
      source: 'neo4j_low_lift_graph',
    };
  } catch (error) {
    console.error('[get-dynamic-home-layout] Neo4j low-lift query failed:', (error as Error).message);
    return { featuredStack: DEFAULT_FEATURED_STACK, source: 'fallback_featured_stack' };
  }
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
    featured_stack: DEFAULT_FEATURED_STACK,
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

  const { data: appProfile } = await db
    .from('profiles')
    .select('weekly_budget, household_size')
    .eq('user_id', user.id)
    .maybeSingle();

  const profile = normalizeProfile(profileRow as Record<string, unknown> | null);
  const recentEvents = (recentRows || []).map((row: { event_type: string }) => row.event_type);
  const sections = orderSections(profile, recentEvents);
  const weeklyBudget = Number((appProfile as Record<string, unknown> | null)?.weekly_budget ?? 150);
  const householdSize = Number((appProfile as Record<string, unknown> | null)?.household_size ?? 2);
  const householdMealMinimum = Math.max(2, Math.round(householdSize * 2));
  const graph = await fetchFeaturedStack(user.id, weeklyBudget, householdMealMinimum);

  return json({
    status: 'ok',
    source: graph.source,
    layout_source: profileRow ? 'supabase_priority_profile' : 'fallback_profile',
    profile,
    sections: sections.length ? sections : DEFAULT_SECTIONS,
    alerts: alertsFor(profile),
    emphasized_actions: actionsFor(profile),
    hidden_sections: profile.convenience_priority >= 0.8 ? ['complex_analytics'] : [],
    featured_stack: graph.featuredStack,
    fallback: !profileRow,
  });
});
