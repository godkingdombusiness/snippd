import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ALLOWED_EVENTS = new Set([
  'onboarding_completed',
  'deal_viewed',
  'meal_viewed',
  'product_scanned',
  'product_added_to_cart',
  'product_removed_from_cart',
  'plan_generated',
  'cart_completed',
  'receipt_confirmed',
  'survey_completed',
]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

type Profile = {
  savings_priority: number;
  nutrition_priority: number;
  convenience_priority: number;
  allergy_safety_priority: number;
  store_loyalty_priority: number;
  novelty_priority: number;
  budget_pressure: number;
  scan_compare_priority: number;
  store_accuracy_warning_priority: number;
};

function clamp(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function applyEventToProfile(profile: Profile, event: Record<string, unknown>): Profile {
  const next = { ...profile };
  const eventType = String(event.event_type);
  const metadata = asObject(event.metadata);
  const survey = asObject(event.survey_response);
  const allergyFlags = asObject(event.allergy_flags);
  const nutrition = asObject(event.nutrition_summary);
  const cost = asNumber(event.cost);
  const savings = asNumber(event.savings);

  if (eventType === 'product_scanned') {
    next.scan_compare_priority += 0.08;
    next.convenience_priority += 0.02;
  }
  if (eventType === 'product_added_to_cart') {
    next.convenience_priority += 0.03;
    if ((savings ?? 0) > 0) next.savings_priority += 0.04;
  }
  if (eventType === 'product_removed_from_cart') {
    next.novelty_priority += 0.04;
  }
  if (eventType === 'deal_viewed') {
    next.savings_priority += 0.02;
  }
  if (eventType === 'meal_viewed') {
    next.nutrition_priority += 0.02;
  }
  if (eventType === 'cart_completed') {
    next.convenience_priority += 0.04;
    if ((savings ?? 0) > 0) next.savings_priority += 0.05;
  }
  if (eventType === 'receipt_confirmed') {
    const budgetDelta = Number(metadata.budget_delta ?? metadata.over_budget_amount ?? 0);
    if (budgetDelta < 0 || Boolean(metadata.over_budget)) next.budget_pressure += 0.1;
    if ((savings ?? 0) > 0) next.savings_priority += 0.04;
  }
  if (eventType === 'survey_completed') {
    if (survey.saved_money === false || survey.saved_money === 'no') next.savings_priority += 0.12;
    if (survey.matched_store === false || survey.matched_store === 'no') next.store_accuracy_warning_priority += 0.18;
    if (survey.use_again === false || survey.use_again === 'no') {
      next.convenience_priority += 0.12;
      next.novelty_priority += 0.08;
    }
  }

  if (Object.keys(allergyFlags).length > 0 || Boolean(metadata.has_allergies)) {
    next.allergy_safety_priority += 0.15;
  }
  if (nutrition.protein != null || nutrition.calories != null || nutrition.sodium != null) {
    next.nutrition_priority += 0.03;
  }
  if ((cost ?? 0) > 0 && (savings ?? 0) > 0 && (savings as number) / (cost as number) > 0.15) {
    next.savings_priority += 0.05;
  }

  return Object.fromEntries(
    Object.entries(next).map(([key, value]) => [key, clamp(Number(value))]),
  ) as Profile;
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

async function writeNeo4j(event: Record<string, unknown>) {
  const cfg = neo4jConfig();
  if (!cfg) return { synced: false, error: 'neo4j_not_configured' };

  const statement = `
    MERGE (u:User {user_id: $user_id})
      ON CREATE SET u.created_at = datetime()
      SET u.last_active_at = datetime()
    CREATE (e:MemoryEvent {
      id: $event_id,
      event_type: $event_type,
      entity_type: $entity_type,
      entity_id: $entity_id,
      store_id: $store_id,
      product_id: $product_id,
      deal_id: $deal_id,
      meal_id: $meal_id,
      trip_id: $trip_id,
      barcode: $barcode,
      cost: $cost,
      savings: $savings,
      created_at: datetime($created_at)
    })
    MERGE (u)-[:DID]->(e)
    WITH u, e
    FOREACH (_ IN CASE WHEN $store_id IS NULL THEN [] ELSE [1] END |
      MERGE (s:Store {store_id: $store_id})
      MERGE (u)-[r:SHOPS_AT]->(s)
      SET r.count = coalesce(r.count, 0) + 1, r.last_seen_at = datetime()
    )
    FOREACH (_ IN CASE WHEN $product_id IS NULL AND $barcode IS NULL THEN [] ELSE [1] END |
      MERGE (p:Product {product_id: coalesce($product_id, $barcode)})
      SET p.barcode = coalesce($barcode, p.barcode)
      MERGE (u)-[r:SCANNED]->(p)
      SET r.count = coalesce(r.count, 0) + CASE WHEN $event_type = 'product_scanned' THEN 1 ELSE 0 END,
          r.last_seen_at = datetime()
    )
  `;

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${cfg.user}:${cfg.password}`)}`,
    },
    body: JSON.stringify({ statements: [{ statement, parameters: event }] }),
  });
  if (!res.ok) return { synced: false, error: `neo4j_http_${res.status}` };
  const body = await res.json();
  if (body.errors?.length) return { synced: false, error: body.errors[0].message };
  return { synced: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const authHeader = req.headers.get('authorization') ?? '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return json({ error: 'Unauthorized' }, 401);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await db.auth.getUser(authHeader.slice(7));
  if (authError || !user) return json({ error: 'Unauthorized' }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const eventType = asText(body.event_type);
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) return json({ error: 'Unsupported event_type' }, 400);

  const eventRow = {
    user_id: user.id,
    event_type: eventType,
    entity_type: asText(body.entity_type),
    entity_id: asText(body.entity_id),
    store_id: asText(body.store_id),
    product_id: asText(body.product_id),
    deal_id: asText(body.deal_id),
    meal_id: asText(body.meal_id),
    trip_id: asText(body.trip_id),
    barcode: asText(body.barcode),
    cost: asNumber(body.cost),
    savings: asNumber(body.savings),
    nutrition_summary: asObject(body.nutrition_summary),
    allergy_flags: asObject(body.allergy_flags),
    diet_flags: asObject(body.diet_flags),
    survey_response: asObject(body.survey_response),
    metadata: asObject(body.metadata),
  };

  const { data: inserted, error: insertError } = await db
    .from('memory_events')
    .insert(eventRow)
    .select('*')
    .single();

  if (insertError) return json({ error: insertError.message }, 500);

  const { data: existingProfile } = await db
    .from('user_priority_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  const baseProfile: Profile = {
    savings_priority: Number(existingProfile?.savings_priority ?? 0.5),
    nutrition_priority: Number(existingProfile?.nutrition_priority ?? 0.5),
    convenience_priority: Number(existingProfile?.convenience_priority ?? 0.5),
    allergy_safety_priority: Number(existingProfile?.allergy_safety_priority ?? 0),
    store_loyalty_priority: Number(existingProfile?.store_loyalty_priority ?? 0.5),
    novelty_priority: Number(existingProfile?.novelty_priority ?? 0.3),
    budget_pressure: Number(existingProfile?.budget_pressure ?? 0.5),
    scan_compare_priority: Number(existingProfile?.scan_compare_priority ?? 0.3),
    store_accuracy_warning_priority: Number(existingProfile?.store_accuracy_warning_priority ?? 0),
  };

  const nextProfile = applyEventToProfile(baseProfile, eventRow);
  await db.from('user_priority_profiles').upsert({
    user_id: user.id,
    ...nextProfile,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });

  const neo4j = await writeNeo4j({
    ...eventRow,
    event_id: inserted.id,
    created_at: inserted.created_at,
  });

  await db.from('memory_events').update({
    neo4j_synced: neo4j.synced,
    neo4j_synced_at: neo4j.synced ? new Date().toISOString() : null,
    error: neo4j.synced ? null : neo4j.error,
  }).eq('id', inserted.id);

  return json({ ok: true, neo4j_synced: neo4j.synced, profile: nextProfile });
});
