import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

function normalizeField(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}

function round(value: number, decimals = 4) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

async function loadWeightConfig(db: ReturnType<typeof createClient>) {
  const { data, error } = await db
    .from('event_weight_config')
    .select('event_name, weight');

  if (error) {
    throw new Error(`Failed to load event weight config: ${error.message}`);
  }
  return data ?? [];
}

function getWeight(
  config: Array<{ event_name: string; weight: number }>,
  eventName: string,
) {
  const normalized = eventName.toLowerCase();
  return (
    config.find((row) => row.event_name === normalized)?.weight ??
    config.find((row) => row.event_name === 'purchase_completed')?.weight ??
    1
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret = Deno.env.get('PREFERENCE_UPDATER_CRON_SECRET') ?? '';

  const authHeader = req.headers.get('authorization') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const isCron = cronSecret && cronHeader === cronSecret;
  const isUser = authHeader.startsWith('Bearer ');

  if (!isCron && !isUser) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  const rawBody = await req.text();
  let body: { user_id?: string } = {};
  try { body = rawBody ? JSON.parse(rawBody) : {}; } catch { /* ignore invalid JSON */ }

  const requestedUserId = typeof body.user_id === 'string' ? body.user_id : undefined;
  const DECAY_FACTOR = 0.96;

  try {
    const weights = await loadWeightConfig(db);
    const eventQuery = db.from('event_stream').select('user_id, event_name, category, brand, retailer_key, recorded_at').not('user_id', 'is', null);

    if (requestedUserId) {
      eventQuery.eq('user_id', requestedUserId);
    }

    const { data: events, error: eventError } = await eventQuery;
    if (eventError) throw eventError;

    const eventTotals = new Map<string, number>();
    const userIds = new Set<string>();

    for (const event of (events ?? []) as Array<Record<string, unknown>>) {
      const userId = typeof event.user_id === 'string' ? event.user_id : undefined;
      const eventName = typeof event.event_name === 'string' ? event.event_name : undefined;
      if (!userId || !eventName) continue;

      const category = normalizeField(event.category);
      const brand = normalizeField(event.brand);
      const retailerKey = normalizeField(event.retailer_key);
      const weight = getWeight(weights, eventName);
      const key = `${userId}||${eventName.toLowerCase()}||${category}||${brand}||${retailerKey}`;

      eventTotals.set(key, (eventTotals.get(key) ?? 0) + weight);
      userIds.add(userId);
    }

    const { data: existingRows, error: existingError } = await db
      .from('user_preference_scores')
      .select('user_id, preference_key, category, brand, retailer_key, score')
      .in('user_id', Array.from(userIds));

    if (existingError) throw existingError;

    const merged = new Map<string, { user_id: string; preference_key: string; category: string; brand: string; retailer_key: string; score: number }>();
    for (const row of (existingRows ?? []) as Array<Record<string, unknown>>) {
      const key = `${row.user_id}||${row.preference_key}||${row.category}||${row.brand}||${row.retailer_key}`;
      merged.set(key, {
        user_id: String(row.user_id),
        preference_key: String(row.preference_key),
        category: String(row.category),
        brand: String(row.brand),
        retailer_key: String(row.retailer_key),
        score: round(Number(row.score) * DECAY_FACTOR),
      });
    }

    for (const [key, total] of eventTotals.entries()) {
      const [userId, preferenceKey, category, brand, retailerKey] = key.split('||');
      const existing = merged.get(key);
      merged.set(key, {
        user_id: userId,
        preference_key: preferenceKey,
        category,
        brand,
        retailer_key: retailerKey,
        score: round((existing?.score ?? 0) + total),
      });
    }

    const upserts = Array.from(merged.values()).map((row) => ({
      ...row,
      last_updated: new Date().toISOString(),
    }));

    if (upserts.length > 0) {
      const { error: scoreError } = await db.from('user_preference_scores').upsert(upserts, {
        onConflict: 'user_id, preference_key, category, brand, retailer_key',
      });
      if (scoreError) throw scoreError;
    }

    const userGroups = new Map<string, Array<{ preference_key: string; category: string; brand: string; retailer_key: string; score: number }>>();
    for (const row of merged.values()) {
      const list = userGroups.get(row.user_id) ?? [];
      list.push(row);
      userGroups.set(row.user_id, list);
    }

    let snapshotCount = 0;
    for (const [userId, rows] of userGroups.entries()) {
      const maxScore = Math.max(...rows.map((row) => Math.abs(row.score)), 0);
      const snapshot = {
        user_id: userId,
        snapshot: {
          updated_at: new Date().toISOString(),
          preferences: rows.map((row) => ({
            preference_key: row.preference_key,
            category: row.category,
            brand: row.brand,
            retailer_key: row.retailer_key,
            score: row.score,
            normalized_score: maxScore > 0 ? round(row.score / maxScore, 4) : 0,
          })),
        },
        snapshot_at: new Date().toISOString(),
      };

      const { error: snapshotError } = await db.from('user_state_snapshots').upsert([snapshot], {
        onConflict: 'user_id',
      });
      if (snapshotError) throw snapshotError;
      snapshotCount += 1;
    }

    return json({ ok: true, users: userGroups.size, rows: upserts.length, snapshots: snapshotCount });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});
