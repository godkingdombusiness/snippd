/**
 * receiptBuysSyncer — Syncs verified receipt items into Neo4j as BUYS edges
 *
 * Why a separate syncer from graphSync?
 *   - graphSync writes r.last_at; leakage detection in graph-insights queries b.last_seen
 *   - graphSync stores category as a Product property; leakage detection traverses
 *     (Product)-[:IN_CATEGORY]->(Category) relationships
 *   - This syncer runs incrementally via a cursor so it can also fire after individual
 *     receipt verifications, not just the nightly full sync
 *
 * Graph writes per receipt item:
 *   MERGE (u:User {id})
 *   MERGE (p:Product {normalized_key})  — sets name, brand
 *   MERGE (c:Category {name})
 *   MERGE (p)-[:IN_CATEGORY]->(c)
 *   MERGE (u)-[b:BUYS]->(p)            — sets last_seen (date), count
 *
 * Cursor: stored in app_config.receipt_buys_syncer_cursor (ISO timestamp).
 *   Updated to max(verified_at) after each successful run.
 *   Falls back to 90 days ago on first run (no cursor row).
 *
 * Run:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *   NEO4J_URI=... NEO4J_USER=... NEO4J_PASSWORD=... \
 *   npx ts-node --project tsconfig.test.json src/services/graph/receiptBuysSyncer.ts
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { Session } from 'neo4j-driver';
import neo4j from 'neo4j-driver';
import { vaultifyProps } from './neo4jVault';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ReceiptUploadRow {
  id: string;
  user_id: string;
  retailer_key: string | null;
  verified_at: string;
  receipt_items: ReceiptItemRow[];
}

interface ReceiptItemRow {
  id: string;
  normalized_key: string | null;
  normalized_name: string | null;
  product_name: string;
  category: string | null;
  brand: string | null;
  qty: number | null;
  quantity: number | null;
}

interface SyncResult {
  uploadsProcessed: number;
  itemsWritten: number;
  skipped: number;
  cursorAdvancedTo: string | null;
}

// ─────────────────────────────────────────────────────────────
// Cursor helpers (app_config)
// ─────────────────────────────────────────────────────────────

const CURSOR_KEY = 'receipt_buys_syncer_cursor';

async function readCursor(db: SupabaseClient): Promise<string> {
  const { data } = await db
    .from('app_config')
    .select('value')
    .eq('key', CURSOR_KEY)
    .single();

  if (data?.value) return data.value;

  // First run — default to 90 days ago
  const fallback = new Date();
  fallback.setDate(fallback.getDate() - 90);
  return fallback.toISOString();
}

async function writeCursor(db: SupabaseClient, cursor: string): Promise<void> {
  await db
    .from('app_config')
    .upsert({ key: CURSOR_KEY, value: cursor, updated_at: new Date().toISOString() });
}

// ─────────────────────────────────────────────────────────────
// Neo4j writes
// ─────────────────────────────────────────────────────────────

async function writeReceiptBuys(
  userId: string,
  verifiedAt: string,
  item: ReceiptItemRow,
  neo4jSession: Session,
): Promise<void> {
  const normKey = item.normalized_key ?? item.normalized_name;
  if (!normKey) return;

  const qty      = neo4j.int(Math.max(1, Math.round(item.qty ?? item.quantity ?? 1)));
  const lastSeen = verifiedAt.slice(0, 10); // YYYY-MM-DD

  // Vault-encrypt sensitive fields; hash searchable/indexed fields.
  // Relationship types (BUYS, IN_CATEGORY) always remain clear text.
  const vaulted = await vaultifyProps({
    normalized_key: normKey,
    name:           item.product_name ?? normKey,
    brand:          item.brand ?? undefined,
    category:       item.category ?? undefined,
  });

  // Merge Product keyed by normalized_key_hash + BUYS edge
  // (last_seen matches leakage Cypher in graph-insights)
  await neo4jSession.run(
    `MERGE (u:User {id: $userId})
     MERGE (p:Product {normalized_key_hash: $nkHash})
     SET p.name_enc    = $nameEnc,
         p.brand_hash  = $brandHash,
         p.category_hash = $categoryHash
     MERGE (u)-[b:BUYS]->(p)
     ON CREATE SET
       b.count      = $qty,
       b.last_seen  = date($lastSeen),
       b.first_seen = date($lastSeen)
     ON MATCH SET
       b.count     = b.count + $qty,
       b.last_seen = CASE
         WHEN b.last_seen < date($lastSeen) THEN date($lastSeen)
         ELSE b.last_seen
       END`,
    {
      userId,
      nkHash:       vaulted.normalized_key_hash,
      nameEnc:      vaulted.name_enc,
      brandHash:    vaulted.brand_hash    ?? null,
      categoryHash: vaulted.category_hash ?? null,
      qty,
      lastSeen,
    },
  );

  // Merge Category node + IN_CATEGORY relationship (enables leakage Cypher traversal)
  // Category name is hashed — graph traversal uses category_hash on the Product node.
  if (vaulted.category_hash) {
    await neo4jSession.run(
      `MERGE (c:Category {name_hash: $categoryHash})
       MERGE (p:Product {normalized_key_hash: $nkHash})
       MERGE (p)-[:IN_CATEGORY]->(c)`,
      { categoryHash: vaulted.category_hash, nkHash: vaulted.normalized_key_hash },
    );
  }
}

// ─────────────────────────────────────────────────────────────
// runReceiptBuysSyncer — main export
// ─────────────────────────────────────────────────────────────

export async function runReceiptBuysSyncer(
  db: SupabaseClient,
  neo4jSession: Session,
): Promise<SyncResult> {
  const cursor = await readCursor(db);
  console.log(`[receiptBuysSyncer] Cursor: ${cursor}`);

  // Fetch verified receipt uploads since cursor (max 500 to keep memory bounded)
  const { data, error } = await db
    .from('receipt_uploads')
    .select(`
      id, user_id, retailer_key, verified_at,
      receipt_items ( id, normalized_key, normalized_name, product_name, category, brand, qty, quantity )
    `)
    .not('verified_at', 'is', null)
    .gt('verified_at', cursor)
    .order('verified_at', { ascending: true })
    .limit(500);

  if (error) throw new Error(`[receiptBuysSyncer] Supabase query failed: ${error.message}`);

  const uploads = (data ?? []) as unknown as ReceiptUploadRow[];
  console.log(`[receiptBuysSyncer] Found ${uploads.length} verified uploads to process`);

  let itemsWritten = 0;
  let skipped = 0;
  let latestVerifiedAt: string | null = null;

  for (const upload of uploads) {
    const items = upload.receipt_items ?? [];
    for (const item of items) {
      const normKey = item.normalized_key ?? item.normalized_name;
      if (!normKey) {
        skipped++;
        continue;
      }
      try {
        await writeReceiptBuys(upload.user_id, upload.verified_at, item, neo4jSession);
        itemsWritten++;
      } catch (err) {
        console.warn(
          `[receiptBuysSyncer] Item ${normKey} for user ${upload.user_id} failed:`,
          (err as Error).message,
        );
        skipped++;
      }
    }
    if (
      !latestVerifiedAt ||
      upload.verified_at > latestVerifiedAt
    ) {
      latestVerifiedAt = upload.verified_at;
    }
  }

  // Advance cursor so the next run skips already-processed uploads
  if (latestVerifiedAt) {
    await writeCursor(db, latestVerifiedAt);
  }

  const result: SyncResult = {
    uploadsProcessed: uploads.length,
    itemsWritten,
    skipped,
    cursorAdvancedTo: latestVerifiedAt,
  };

  console.log('[receiptBuysSyncer] Complete:', result);
  return result;
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

  runReceiptBuysSyncer(db, session)
    .then((r) => {
      console.log(`[receiptBuysSyncer] Summary: ${r.uploadsProcessed} uploads, ${r.itemsWritten} BUYS edges written, ${r.skipped} skipped`);
    })
    .catch((e: Error) => { console.error(e); process.exit(1); })
    .finally(() => session.close().then(() => closeDriver()));
}
