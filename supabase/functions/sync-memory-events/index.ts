import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-sync-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

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

async function syncRow(row: Record<string, unknown>) {
  const cfg = neo4jConfig();
  if (!cfg) return { synced: false, error: 'neo4j_not_configured' };

  const statement = `
    MERGE (u:User {user_id: $user_id})
      ON CREATE SET u.created_at = datetime()
      SET u.last_active_at = datetime()
    CREATE (e:MemoryEvent {
      id: $id,
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
  `;

  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Basic ${btoa(`${cfg.user}:${cfg.password}`)}`,
    },
    body: JSON.stringify({ statements: [{ statement, parameters: row }] }),
  });
  if (!res.ok) return { synced: false, error: `neo4j_http_${res.status}` };
  const body = await res.json();
  if (body.errors?.length) return { synced: false, error: body.errors[0].message };
  return { synced: true, error: null };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const syncKey = Deno.env.get('MEMORY_SYNC_KEY') ?? '';
  if (syncKey && req.headers.get('x-sync-key') !== syncKey) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: rows, error } = await db
    .from('memory_events')
    .select('*')
    .eq('neo4j_synced', false)
    .order('created_at', { ascending: true })
    .limit(100);

  if (error) return json({ error: error.message }, 500);

  let synced = 0;
  let failed = 0;
  for (const row of rows || []) {
    const result = await syncRow(row as Record<string, unknown>);
    await db.from('memory_events').update({
      neo4j_synced: result.synced,
      neo4j_synced_at: result.synced ? new Date().toISOString() : null,
      error: result.synced ? null : result.error,
    }).eq('id', row.id);
    if (result.synced) synced += 1;
    else failed += 1;
  }

  return json({ ok: true, scanned: rows?.length || 0, synced, failed });
});
