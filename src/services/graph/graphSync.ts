/**
 * graphSync — Syncs Supabase behavioral data into the Neo4j memory graph
 *
 * runGraphSync(db, neo4jSession):
 *   1. Finds all active users (event in last 30 days)
 *   2. For each: syncUserPreferences, syncPurchaseHistory, syncCartAcceptance
 *   3. Once: syncCoOccurrences (expensive — run nightly)
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEO4J_URI=... NEO4J_USER=... NEO4J_PASSWORD=... \
 *   npx ts-node --project tsconfig.test.json src/services/graph/graphSync.ts
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { syncCohortSimilarity } from './graphCohort';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PreferenceRow {
  user_id: string;
  preference_key: string;
  category: string;
  brand: string;
  retailer_key: string;
  normalized_score: number;
}

interface ReceiptItemRow {
  // Production schema uses normalized_name; new schema uses normalized_key
  normalized_name?: string;
  normalized_key?: string;
  product_name: string;
  category: string | null;
  brand: string | null;
  quantity?: number;
  qty?: number;
  receipt_uploads?: { user_id: string; retailer_key?: string };
}

interface EventRow {
  user_id: string;
  event_name: string;
  object_id: string | null;
  metadata?: { cart_type?: string } | null;
  timestamp: string;
}

interface EventPreferenceRow {
  category: string | null;
  brand: string | null;
  retailer_key: string | null;
  event_name: string;
}

interface ReceiptCoOccurrenceRow {
  receipt_id: string;
  normalized_name: string | null;
}

// ─────────────────────────────────────────────────────────────
// Helper: int literal for Neo4j (avoids float coercion)
// ─────────────────────────────────────────────────────────────

function intVal(n: number) {
  return neo4j.int(Math.round(n));
}

// ─────────────────────────────────────────────────────────────
// syncUserPreferences
// Primary: user_preference_scores (new behavioral intelligence schema)
// Fallback: derive from event_stream category/brand signals
// ─────────────────────────────────────────────────────────────

const PREFERS_THRESHOLD = 0.35;

async function writePreferenceEdges(
  userId: string,
  neo4jSession: Session,
  entries: Array<{ type: 'category' | 'brand' | 'store'; name: string; score: number }>,
): Promise<void> {
  for (const entry of entries) {
    const rel = entry.score >= PREFERS_THRESHOLD ? 'PREFERS' : 'REJECTS';
    if (entry.type === 'category') {
      await neo4jSession.run(
        `MERGE (u:User {id: $userId})
         MERGE (c:Category {name: $name})
         MERGE (u)-[r:${rel}]->(c)
         SET r.score = $score, r.updated_at = datetime()`,
        { userId, name: entry.name, score: entry.score },
      );
    } else if (entry.type === 'brand') {
      await neo4jSession.run(
        `MERGE (u:User {id: $userId})
         MERGE (b:Brand {name: $name})
         MERGE (u)-[r:${rel}]->(b)
         SET r.score = $score, r.updated_at = datetime()`,
        { userId, name: entry.name, score: entry.score },
      );
    } else {
      await neo4jSession.run(
        `MERGE (u:User {id: $userId})
         MERGE (s:Store {retailer_key: $key})
         MERGE (u)-[r:${rel}]->(s)
         SET r.score = $score, r.updated_at = datetime()`,
        { userId, key: entry.name, score: entry.score },
      );
    }
  }
}

export async function syncUserPreferences(
  userId: string,
  db: SupabaseClient,
  neo4jSession: Session,
): Promise<void> {
  const { data, error } = await db
    .from('user_preference_scores')
    .select('user_id, preference_key, category, brand, retailer_key, normalized_score')
    .eq('user_id', userId)
    .gt('normalized_score', 0);

  // 42P01 = table does not exist — fall back to event_stream derivation
  if (error && error.code !== '42P01') {
    throw new Error(`[graphSync] preferences: ${error.message}`);
  }

  if (!error && data?.length) {
    // New schema available — use scored preferences directly
    const rows = data as PreferenceRow[];
    const entries = rows.flatMap((row) => {
      const list: Array<{ type: 'category' | 'brand' | 'store'; name: string; score: number }> = [];
      if (row.category)    list.push({ type: 'category', name: row.category,    score: row.normalized_score });
      if (row.brand)       list.push({ type: 'brand',    name: row.brand,       score: row.normalized_score });
      if (row.retailer_key) list.push({ type: 'store',   name: row.retailer_key, score: row.normalized_score });
      return list;
    });
    await writePreferenceEdges(userId, neo4jSession, entries);
    return;
  }

  // Fallback: derive preferences from event_stream category/brand signals (last 90 days)
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data: evts, error: evtErr } = await db
    .from('event_stream')
    .select('category, brand, retailer_key, event_name')
    .eq('user_id', userId)
    .gte('timestamp', since.toISOString());

  if (evtErr) return; // silently skip if event_stream also fails

  // Positive events get weight 2, negative -1, neutral 1
  const POS = new Set(['COUPON_CLIPPED', 'coupon_clipped', 'CART_ACCEPTED', 'cart_accepted', 'purchase_completed', 'ITEM_PURCHASED']);
  const NEG = new Set(['CART_REJECTED', 'cart_rejected', 'COUPON_DISMISSED', 'coupon_dismissed']);

  const catCounts   = new Map<string, number>();
  const brandCounts = new Map<string, number>();
  const storeCounts = new Map<string, number>();

  for (const row of (evts ?? []) as EventPreferenceRow[]) {
    const w = POS.has(row.event_name) ? 2 : NEG.has(row.event_name) ? -1 : 1;
    if (row.category)    catCounts.set(row.category,    (catCounts.get(row.category)    ?? 0) + w);
    if (row.brand)       brandCounts.set(row.brand,     (brandCounts.get(row.brand)     ?? 0) + w);
    if (row.retailer_key) storeCounts.set(row.retailer_key, (storeCounts.get(row.retailer_key) ?? 0) + w);
  }

  // Normalize each map to [0, 1] against its own max
  const normalize = (m: Map<string, number>): Map<string, number> => {
    const max = Math.max(...m.values(), 1);
    return new Map([...m.entries()].map(([k, v]) => [k, Math.max(0, v / max)]));
  };

  const entries: Array<{ type: 'category' | 'brand' | 'store'; name: string; score: number }> = [
    ...[...normalize(catCounts).entries()].map(([n, s]) => ({ type: 'category' as const, name: n, score: s })),
    ...[...normalize(brandCounts).entries()].filter(([, s]) => s > 0).map(([n, s]) => ({ type: 'brand' as const, name: n, score: s })),
    ...[...normalize(storeCounts).entries()].filter(([, s]) => s > 0).map(([n, s]) => ({ type: 'store' as const, name: n, score: s })),
  ];

  await writePreferenceEdges(userId, neo4jSession, entries);
}

// ─────────────────────────────────────────────────────────────
// syncPurchaseHistory
// ─────────────────────────────────────────────────────────────

export async function syncPurchaseHistory(
  userId: string,
  db: SupabaseClient,
  neo4jSession: Session,
): Promise<void> {
  const since = new Date();
  since.setDate(since.getDate() - 90);

  const { data, error } = await db
    .from('receipt_items')
    .select('normalized_name, normalized_key, product_name, category, brand, quantity, qty, receipt_uploads!inner(user_id, retailer_key)')
    .eq('receipt_uploads.user_id', userId)
    .gte('receipt_uploads.created_at' as string, since.toISOString());

  if (error) throw new Error(`[graphSync] purchase history: ${error.message}`);
  const rows = (data ?? []) as unknown as ReceiptItemRow[];

  // Aggregate counts per normalized key (support both column name variants)
  const counts = new Map<string, { key: string; name: string; cat: string | null; brand: string | null; count: number }>();
  for (const row of rows) {
    const normKey = row.normalized_key ?? row.normalized_name;
    if (!normKey) continue;
    const qty = row.qty ?? row.quantity ?? 1;
    const existing = counts.get(normKey);
    if (existing) {
      existing.count += qty;
    } else {
      counts.set(normKey, {
        key:   normKey,
        name:  row.product_name,
        cat:   row.category ?? null,
        brand: row.brand ?? null,
        count: qty,
      });
    }
  }

  for (const item of counts.values()) {
    await neo4jSession.run(
      `MERGE (u:User {id: $userId})
       MERGE (p:Product {normalized_key: $key})
       SET p.name = $name, p.category = $cat, p.brand = $brand
       MERGE (u)-[r:BUYS]->(p)
       SET r.count = $count, r.last_at = datetime()`,
      {
        userId,
        key:   item.key,
        name:  item.name,
        cat:   item.cat ?? '',
        brand: item.brand ?? '',
        count: intVal(item.count),
      },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// syncCartAcceptance
// ─────────────────────────────────────────────────────────────

export async function syncCartAcceptance(
  userId: string,
  db: SupabaseClient,
  neo4jSession: Session,
): Promise<void> {
  const { data, error } = await db
    .from('event_stream')
    .select('user_id, event_name, object_id, metadata, timestamp')
    .eq('user_id', userId)
    .in('event_name', ['cart_accepted', 'CART_ACCEPTED', 'cart_rejected', 'CART_REJECTED'])
    .order('timestamp', { ascending: false })
    .limit(200);

  if (error) throw new Error(`[graphSync] cart acceptance: ${error.message}`);
  const rows = (data ?? []) as EventRow[];

  for (const row of rows) {
    if (!row.object_id) continue;

    const cartType = (row.metadata as { cart_type?: string } | null)?.cart_type ?? 'unknown';
    const isAccepted = row.event_name.toLowerCase() === 'cart_accepted';
    const rel = isAccepted ? 'ACCEPTS' : 'DISMISSES';

    await neo4jSession.run(
      `MERGE (u:User {id: $userId})
       MERGE (s:Stack {id: $stackId})
       SET s.cart_type = $cartType
       MERGE (u)-[r:${rel}]->(s)
       SET r.at = datetime($at), r.cart_type = $cartType`,
      { userId, stackId: row.object_id, cartType, at: row.timestamp },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// syncCoOccurrences  (expensive — run once per night)
// ─────────────────────────────────────────────────────────────

export async function syncCoOccurrences(
  db: SupabaseClient,
  neo4jSession: Session,
): Promise<number> {
  // Products that appear in the same receipt co-occur.
  // receipt_items.normalized_name is the product key in the production schema.
  const { data, error } = await db
    .from('receipt_items')
    .select('receipt_id, normalized_name')
    .not('normalized_name', 'is', null)
    .order('receipt_id')
    .limit(5000);

  if (error) {
    console.warn('[graphSync] co-occurrences skipped:', error.message);
    return 0;
  }

  // Group by receipt_id
  const receiptMap = new Map<string, string[]>();
  for (const row of (data ?? []) as ReceiptCoOccurrenceRow[]) {
    if (!row.receipt_id || !row.normalized_name) continue;
    const existing = receiptMap.get(row.receipt_id);
    if (existing) existing.push(row.normalized_name);
    else receiptMap.set(row.receipt_id, [row.normalized_name]);
  }

  let pairsWritten = 0;

  for (const keys of receiptMap.values()) {
    const unique = [...new Set(keys)];
    // Pair every combination of products in the same receipt
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        await neo4jSession.run(
          `MERGE (p1:Product {normalized_key: $key1})
           MERGE (p2:Product {normalized_key: $key2})
           MERGE (p1)-[r:CO_OCCURS_WITH]->(p2)
           SET r.count = coalesce(r.count, 0) + 1`,
          { key1: unique[i], key2: unique[j] },
        );
        pairsWritten++;
      }
    }
  }

  return pairsWritten;
}

// ─────────────────────────────────────────────────────────────
// runGraphSync — main orchestrator
// ─────────────────────────────────────────────────────────────

export async function runGraphSync(
  db: SupabaseClient,
  neo4jSession: Session,
  options: { skipCoOccurrences?: boolean; skipCohort?: boolean } = {},
): Promise<{ users: number; pairs: number; cohortEdges: number }> {
  // Find all active users (event in last 30 days)
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const { data: activeUsers, error: usersErr } = await db
    .from('event_stream')
    .select('user_id')
    .gte('timestamp', since.toISOString());

  if (usersErr) throw new Error(`[graphSync] Active users query: ${usersErr.message}`);

  const userIds = [...new Set((activeUsers ?? []).map((r: { user_id: string }) => r.user_id))];
  console.log(`[graphSync] Syncing ${userIds.length} active users`);

  for (const userId of userIds) {
    try {
      await syncUserPreferences(userId, db, neo4jSession);
      await syncPurchaseHistory(userId, db, neo4jSession);
      await syncCartAcceptance(userId, db, neo4jSession);
    } catch (err) {
      console.error(`[graphSync] User ${userId} failed:`, (err as Error).message);
      // Continue with remaining users
    }
  }

  let pairs = 0;
  if (!options.skipCoOccurrences) {
    console.log('[graphSync] Running co-occurrence sync…');
    pairs = await syncCoOccurrences(db, neo4jSession);
  }

  let cohortEdges = 0;
  if (!options.skipCohort) {
    console.log('[graphSync] Running cohort similarity sync…');
    const cohortResult = await syncCohortSimilarity(neo4jSession);
    cohortEdges = cohortResult.edgesWritten;
  }

  return { users: userIds.length, pairs, cohortEdges };
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const { createClient } = require('@supabase/supabase-js');
  const { getSession, closeDriver } = require('../../lib/neo4jClient');

  const db = createClient(
    process.env['SUPABASE_URL'] ?? '',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '',
  ) as SupabaseClient;

  const session: Session = getSession();

  const skipCoOccurrences = process.env['SKIP_CO_OCCURRENCES'] === 'true';
  const skipCohort        = process.env['SKIP_COHORT']         === 'true';

  runGraphSync(db, session, { skipCoOccurrences, skipCohort })
    .then((r) => {
      console.log('[graphSync] Complete:', r);
      // Output summary for GitHub Actions step summary consumption
      if (r.users > 0 || r.pairs > 0 || r.cohortEdges > 0) {
        console.log(`[graphSync] Summary: ${r.users} users synced, ${r.pairs} co-occurrence pairs, ${r.cohortEdges} cohort edges`);
      }
    })
    .catch((e: Error) => { console.error(e); process.exit(1); })
    .finally(() => session.close().then(() => closeDriver()));
}
