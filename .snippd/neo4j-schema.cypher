// Snippd behavioral-intelligence graph — canonical schema.
//
// Run this once against the Aura instance 43e46705 to create the
// constraints + indexes the ingest-behavior Edge Function relies on.
// All event writes are idempotent `MERGE` calls — these uniqueness
// constraints are what guarantee that.
//
// How to apply:
//   1. Open the Neo4j VS Code extension (Connections panel).
//   2. Connect to `neo4j+s://43e46705.databases.neo4j.io`.
//   3. Right-click this file → "Run with Neo4j Driver".
//      (or paste into Aura Browser and hit play)
//
// The scripts/neo4j_smoke.mjs verifier re-asserts these constraints
// each time it runs, so it's safe to re-apply; Neo4j treats
// `CREATE CONSTRAINT IF NOT EXISTS` as a no-op when the constraint
// already exists.

// =====================================================================
// Node uniqueness constraints
// =====================================================================

// Users keyed by Supabase auth.uid() — the source of truth for identity.
CREATE CONSTRAINT user_id_unique IF NOT EXISTS
FOR (u:User) REQUIRE u.id IS UNIQUE;

// Browser sessions — one per tab/login cycle, generated client-side.
CREATE CONSTRAINT session_id_unique IF NOT EXISTS
FOR (s:Session) REQUIRE s.id IS UNIQUE;

// A locked weekly bundle. The id is mission-scoped (`${missionId}::${strategy}`)
// so switching strategies within the same week creates a new node.
CREATE CONSTRAINT bundle_id_unique IF NOT EXISTS
FOR (b:Bundle) REQUIRE b.id IS UNIQUE;

// Stores are the canonical retailer rows seeded in Supabase. Using the
// slug ("walmart", "aldi", etc.) keeps graph joins legible without any
// extra lookup.
CREATE CONSTRAINT store_slug_unique IF NOT EXISTS
FOR (s:Store) REQUIRE s.slug IS UNIQUE;

// Products do NOT have a stable id cross-store, so we key by the
// (name, store) composite. Two products with the same name at different
// stores are treated as distinct nodes on purpose — the same label can
// mean different SKUs across retailers.
CREATE CONSTRAINT product_name_store_unique IF NOT EXISTS
FOR (p:Product) REQUIRE (p.name, p.storeSlug) IS UNIQUE;

// Trips = completed shopping outings. id is client-generated uuid.
CREATE CONSTRAINT trip_id_unique IF NOT EXISTS
FOR (t:Trip) REQUIRE t.id IS UNIQUE;

// UGC clips uploaded to the Supabase `ugc-videos` bucket. id is the
// storage path which is already globally unique.
CREATE CONSTRAINT clip_id_unique IF NOT EXISTS
FOR (c:Clip) REQUIRE c.id IS UNIQUE;

// =====================================================================
// Performance indexes for the queries personalization actually runs
// =====================================================================

// "Which stores did this user shop at most often?"
CREATE INDEX bundle_user_idx IF NOT EXISTS
FOR (b:Bundle) ON (b.userId);

// "Which products did this user mark unavailable, so we can downrank them
// at that store next week?"
CREATE INDEX product_store_idx IF NOT EXISTS
FOR (p:Product) ON (p.storeSlug);

// "What's the most recent trip per user?" — used by the savings hero.
CREATE INDEX trip_user_completed_idx IF NOT EXISTS
FOR (t:Trip) ON (t.userId, t.completedAt);

// =====================================================================
// Quick-read smoke query — verify constraints exist
// =====================================================================
//
// Run this manually in the VS Code extension or Aura Browser; it's not
// executed by the ingest function.
//
//   SHOW CONSTRAINTS YIELD name, labelsOrTypes, properties RETURN *;
//   SHOW INDEXES YIELD name, labelsOrTypes, properties RETURN *;
//
// Expected: 7 uniqueness constraints + 3 range indexes listed above.
