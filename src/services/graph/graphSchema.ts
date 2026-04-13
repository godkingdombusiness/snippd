/**
 * graphSchema — Neo4j schema initialization
 *
 * Creates node uniqueness constraints and full-text indexes.
 * Safe to re-run: uses IF NOT EXISTS on all constraints.
 *
 * Usage:
 *   import { initializeSchema } from './graphSchema';
 *   const session = getSession();
 *   await initializeSchema(session);
 *   await session.close();
 */

import { Session } from 'neo4j-driver';

// ─────────────────────────────────────────────────────────────
// Node constraints (UNIQUE)
// ─────────────────────────────────────────────────────────────

export const SCHEMA_STATEMENTS: string[] = [
  // ── Node uniqueness constraints ──────────────────────────────
  'CREATE CONSTRAINT user_id_unique IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE',
  'CREATE CONSTRAINT category_name_unique IF NOT EXISTS FOR (c:Category) REQUIRE c.name IS UNIQUE',
  'CREATE CONSTRAINT brand_name_unique IF NOT EXISTS FOR (b:Brand) REQUIRE b.name IS UNIQUE',
  'CREATE CONSTRAINT store_key_unique IF NOT EXISTS FOR (s:Store) REQUIRE s.retailer_key IS UNIQUE',
  'CREATE CONSTRAINT deal_id_unique IF NOT EXISTS FOR (d:Deal) REQUIRE d.id IS UNIQUE',
  'CREATE CONSTRAINT stack_id_unique IF NOT EXISTS FOR (s:Stack) REQUIRE s.id IS UNIQUE',
  'CREATE CONSTRAINT product_key_unique IF NOT EXISTS FOR (p:Product) REQUIRE p.normalized_key IS UNIQUE',

  // ── Node property indexes (lookup speed) ─────────────────────
  'CREATE INDEX user_updated_idx IF NOT EXISTS FOR (u:User) ON (u.updated_at)',
  'CREATE INDEX product_category_idx IF NOT EXISTS FOR (p:Product) ON (p.category)',
  'CREATE INDEX product_brand_idx IF NOT EXISTS FOR (p:Product) ON (p.brand)',

  // ── Relationship indexes ──────────────────────────────────────
  // Neo4j 5+ supports relationship property indexes
  'CREATE INDEX prefers_score_idx IF NOT EXISTS FOR ()-[r:PREFERS]-() ON (r.score)',
  'CREATE INDEX co_occurs_count_idx IF NOT EXISTS FOR ()-[r:CO_OCCURS_WITH]-() ON (r.count)',
  'CREATE INDEX buys_count_idx IF NOT EXISTS FOR ()-[r:BUYS]-() ON (r.count)',
];

// ─────────────────────────────────────────────────────────────
// Relationship vocabulary (documentation only — no DB objects)
// ─────────────────────────────────────────────────────────────

/**
 * Relationship types used in the Snippd memory graph:
 *
 * (User)-[:PREFERS]->(Category|Brand|Store)
 *   score: 0–1, updated_at: datetime
 *
 * (User)-[:REJECTS]->(Category|Brand|Store)
 *   score: 0–1, updated_at: datetime
 *
 * (User)-[:BUYS]->(Product)
 *   count: int, last_at: datetime
 *
 * (User)-[:SHOPS_AT]->(Store)
 *   count: int, last_at: datetime
 *
 * (User)-[:RESPONDS_TO]->(Deal)
 *   event_name: string, at: datetime
 *
 * (User)-[:ACCEPTS]->(Stack)
 *   at: datetime, cart_type: string
 *
 * (User)-[:DISMISSES]->(Stack)
 *   at: datetime, cart_type: string
 *
 * (Product)-[:CO_OCCURS_WITH]->(Product)
 *   count: int  — products bought together
 *
 * (User)-[:SHOWS_PATTERN]->(User)
 *   similarity: float  — cohort similarity (future)
 *
 * (Brand)-[:SWITCHES_TO]->(Brand)
 *   count: int  — brand-switching behavior
 */
export const RELATIONSHIP_TYPES = [
  'PREFERS', 'REJECTS', 'BUYS', 'SHOPS_AT',
  'RESPONDS_TO', 'ACCEPTS', 'DISMISSES',
  'CO_OCCURS_WITH', 'SHOWS_PATTERN', 'SWITCHES_TO',
] as const;

export type RelationshipType = typeof RELATIONSHIP_TYPES[number];

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

export async function initializeSchema(session: Session): Promise<void> {
  let applied = 0;
  let skipped = 0;

  for (const stmt of SCHEMA_STATEMENTS) {
    try {
      await session.run(stmt);
      applied++;
    } catch (err) {
      const msg = (err as Error).message;
      // "already exists" is not an error — IF NOT EXISTS should prevent this,
      // but older Neo4j versions may still throw.
      if (msg.includes('already exists') || msg.includes('already an index')) {
        skipped++;
      } else {
        throw new Error(`[graphSchema] Failed: ${stmt.slice(0, 60)}… — ${msg}`);
      }
    }
  }

  console.log(`[graphSchema] Schema initialized: ${applied} applied, ${skipped} already existed`);
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const { getSession, closeDriver } = require('../../lib/neo4jClient');
  (async () => {
    const session: Session = getSession();
    try {
      await initializeSchema(session);
      console.log('[graphSchema] Done.');
    } finally {
      await session.close();
      await closeDriver();
    }
  })().catch((e: Error) => { console.error(e); process.exit(1); });
}
