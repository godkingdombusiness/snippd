import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DECAY_FACTOR = 0.96;

if (!supabaseUrl || !serviceKey) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set to run preferenceUpdater.ts');
}

const db = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false },
});

interface EventRow {
  user_id: string | null;
  event_name: string | null;
  category: string | null;
  brand: string | null;
  retailer_key: string | null;
  metadata: Record<string, unknown> | null;
  recorded_at: string | null;
}

interface PreferenceScoreRow {
  user_id: string;
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  score: number;
}

interface WeightConfigRow {
  event_name: string;
  category: string | null;
  brand: string | null;
  retailer_key: string | null;
  weight: number;
}

async function loadWeightConfig(): Promise<WeightConfigRow[]> {
  const { data, error } = await db
    .from('event_weight_config')
    .select('event_name, category, brand, retailer_key, weight');

  if (error) {
    throw new Error(`Failed to load weight config: ${error.message}`);
  }
  return data ?? [];
}

function getWeight(
  config: WeightConfigRow[],
  eventName: string,
  category?: string | null,
  brand?: string | null,
  retailerKey?: string | null,
) {
  return (
    config.find((row) =>
      row.event_name === eventName &&
      row.category === category &&
      row.brand === brand &&
      row.retailer_key === retailerKey
    )?.weight ??
    config.find((row) =>
      row.event_name === eventName &&
      row.category === category &&
      row.brand === null &&
      row.retailer_key === null
    )?.weight ??
    config.find((row) => row.event_name === eventName && row.category === null && row.brand === null && row.retailer_key === null)?.weight ??
    1
  );
}

function buildKey(
  userId: string,
  preferenceKey: string,
  category: string,
  brand: string,
  retailerKey: string,
) {
  return `${userId}||${preferenceKey}||${category}||${brand}||${retailerKey}`;
}

function normalizeField(value: string | null) {
  return value ? value : '';
}

function round(value: number, decimals = 4) {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

async function loadExistingPreferenceScores(userIds: string[]) {
  if (!userIds.length) return [] as PreferenceScoreRow[];

  const { data, error } = await db
    .from('user_preference_scores')
    .select('user_id, preference_key, category, brand, retailer_key, score')
    .in('user_id', userIds);

  if (error) {
    throw new Error(`Failed to load existing preference scores: ${error.message}`);
  }

  return (data ?? []) as PreferenceScoreRow[];
}

async function normalizeScores() {
  const weights = await loadWeightConfig();

  const { data: events, error } = await db
    .from('event_stream')
    .select('user_id, event_name, category, brand, retailer_key, recorded_at')
    .not('user_id', 'is', null);

  if (error) {
    throw new Error(`Failed to fetch events: ${error.message}`);
  }

  const eventTotals = new Map<string, number>();
  const userIds = new Set<string>();

  for (const event of (events ?? []) as EventRow[]) {
    if (!event.user_id || !event.event_name) continue;

    const category = normalizeField(event.category);
    const brand = normalizeField(event.brand);
    const retailerKey = normalizeField(event.retailer_key);
    const weight = getWeight(weights, event.event_name, event.category, event.brand, event.retailer_key);

    const key = buildKey(event.user_id, event.event_name, category, brand, retailerKey);
    eventTotals.set(key, (eventTotals.get(key) ?? 0) + weight);
    userIds.add(event.user_id);
  }

  const existingRows = await loadExistingPreferenceScores(Array.from(userIds));

  const merged = new Map<string, PreferenceScoreRow>();

  for (const row of existingRows) {
    const decayedScore = round(row.score * DECAY_FACTOR);
    merged.set(
      buildKey(row.user_id, row.preference_key, row.category, row.brand, row.retailer_key),
      {
        ...row,
        score: decayedScore,
      },
    );
  }

  eventTotals.forEach((total, key) => {
    const [userId, preferenceKey, category, brand, retailerKey] = key.split('||');
    const existing = merged.get(key);
    const updatedScore = round((existing?.score ?? 0) + total);
    merged.set(key, {
      user_id: userId,
      preference_key: preferenceKey,
      category,
      brand,
      retailer_key: retailerKey,
      score: updatedScore,
    });
  });

  const userGroups = new Map<string, Array<PreferenceScoreRow>>();
  merged.forEach((row) => {
    const list = userGroups.get(row.user_id) ?? [];
    list.push(row);
    userGroups.set(row.user_id, list);
  });

  const upserts = Array.from(merged.values()).map((row) => ({
    ...row,
    last_updated: new Date().toISOString(),
  }));

  if (upserts.length > 0) {
    const { error: scoreError } = await db.from('user_preference_scores').upsert(upserts, {
      onConflict: 'user_id, preference_key, category, brand, retailer_key',
    });
    if (scoreError) {
      throw new Error(`Failed to upsert preference scores: ${scoreError.message}`);
    }
  }

  let snapshotCount = 0;
  const userEntries = Array.from(userGroups.entries());

  for (const [userId, rows] of userEntries) {
    const maxScore = Math.max(...rows.map((row) => Math.abs(row.score)), 0);
    const preferences = rows.map((row) => ({
      preference_key: row.preference_key,
      category: row.category,
      brand: row.brand,
      retailer_key: row.retailer_key,
      score: row.score,
      normalized_score: maxScore > 0 ? round(row.score / maxScore, 4) : 0,
    }));
    const snapshot = {
      user_id: userId,
      snapshot: {
        updated_at: new Date().toISOString(),
        preferences,
      },
      snapshot_at: new Date().toISOString(),
    };

    const { error: snapshotError } = await db.from('user_state_snapshots').upsert([snapshot] as any, {
      onConflict: 'user_id',
    } as any);

    if (snapshotError) {
      throw new Error(`Failed to upsert state snapshot for ${userId}: ${snapshotError.message}`);
    }

    snapshotCount += 1;
  }

  return { users: snapshotCount, rows: upserts.length };
}

async function main() {
  console.log('preferenceUpdater starting...');

  try {
    const results = await normalizeScores();
    console.log('preferenceUpdater complete:', results);
    process.exit(0);
  } catch (err) {
    console.error('preferenceUpdater failed:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
