/**
 * graphCohort — Computes user similarity and writes SHOWS_PATTERN edges
 *
 * syncCohortSimilarity(neo4jSession):
 *   1. Loads preference vectors (category name → score) for all users
 *      who have ≥ MIN_PREF_DIMENSIONS category preferences
 *   2. Computes pairwise cosine similarity in Node.js (capped at MAX_USERS)
 *   3. Writes (u)-[:SHOWS_PATTERN {similarity}]->(v) for pairs ≥ MIN_SIMILARITY
 *
 * getCohortPreferences(userId, neo4jSession):
 *   Returns category names that high-similarity peers prefer but the
 *   current user hasn't established a strong preference for (score < WEAK_PREF_THRESHOLD).
 *   Used by cartEngine for a +0.08 collaborative filtering boost.
 *
 * Run standalone:
 *   NEO4J_URI=... NEO4J_USER=... NEO4J_PASSWORD=... \
 *   npx ts-node --project tsconfig.test.json src/services/graph/graphCohort.ts
 */

import neo4j, { Session, Record as Neo4jRecord } from 'neo4j-driver';
import { getSession, isNeo4jConfigured, closeDriver } from '../../lib/neo4jClient';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const MIN_SIMILARITY        = 0.50;  // minimum cosine similarity to write an edge
const MIN_PREF_DIMENSIONS   = 3;     // user must have ≥ 3 category prefs to participate
const MAX_USERS             = 2000;  // safety cap for in-memory pairwise computation
const MAX_PEERS_PER_USER    = 10;    // top-N peers to keep per user
const WEAK_PREF_THRESHOLD   = 0.35;  // user score below this → eligible for cohort boost

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PrefVector {
  userId: string;
  scores: Map<string, number>;  // category name → PREFERS score
}

export interface CohortSyncResult {
  usersProcessed: number;
  edgesWritten: number;
}

// ─────────────────────────────────────────────────────────────
// Cosine similarity
// ─────────────────────────────────────────────────────────────

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, va] of a) {
    normA += va * va;
    const vb = b.get(key);
    if (vb !== undefined) dot += va * vb;
  }
  for (const vb of b.values()) normB += vb * vb;

  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─────────────────────────────────────────────────────────────
// syncCohortSimilarity
// ─────────────────────────────────────────────────────────────

export async function syncCohortSimilarity(
  neo4jSession: Session,
): Promise<CohortSyncResult> {
  // Load preference vectors for all qualifying users
  const result = await neo4jSession.run(
    `MATCH (u:User)-[r:PREFERS]->(c:Category)
     WITH u, collect({name: c.name, score: r.score}) AS prefs
     WHERE size(prefs) >= $minDims
     RETURN u.id AS userId, prefs
     LIMIT $limit`,
    { minDims: neo4j.int(MIN_PREF_DIMENSIONS), limit: neo4j.int(MAX_USERS) },
  );

  const vectors: PrefVector[] = result.records.map((rec) => {
    const userId = rec.get('userId') as string;
    const prefs = rec.get('prefs') as Array<{ name: string; score: number }>;
    const scores = new Map<string, number>();
    for (const p of prefs) scores.set(p.name, p.score);
    return { userId, scores };
  });

  if (vectors.length < 2) {
    console.log(`[graphCohort] Not enough users for similarity (${vectors.length}); skipping`);
    return { usersProcessed: vectors.length, edgesWritten: 0 };
  }

  console.log(`[graphCohort] Computing similarity for ${vectors.length} users…`);

  // Pairwise cosine similarity — O(n²) but capped at MAX_USERS
  // For each user keep only top MAX_PEERS_PER_USER peers
  const topPeers = new Map<string, Array<{ peerId: string; similarity: number }>>();

  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      const sim = cosineSimilarity(vectors[i].scores, vectors[j].scores);
      if (sim < MIN_SIMILARITY) continue;

      const addPeer = (userId: string, peerId: string) => {
        if (!topPeers.has(userId)) topPeers.set(userId, []);
        const peers = topPeers.get(userId)!;
        peers.push({ peerId, similarity: sim });
        // Keep only top MAX_PEERS_PER_USER, sorted desc
        if (peers.length > MAX_PEERS_PER_USER) {
          peers.sort((a, b) => b.similarity - a.similarity);
          peers.splice(MAX_PEERS_PER_USER);
        }
      };

      addPeer(vectors[i].userId, vectors[j].userId);
      addPeer(vectors[j].userId, vectors[i].userId);
    }
  }

  // Write SHOWS_PATTERN edges to Neo4j
  let edgesWritten = 0;
  for (const [userId, peers] of topPeers) {
    for (const { peerId, similarity } of peers) {
      await neo4jSession.run(
        `MERGE (u:User {id: $userId})
         MERGE (v:User {id: $peerId})
         MERGE (u)-[r:SHOWS_PATTERN]->(v)
         SET r.similarity = $similarity, r.computed_at = datetime()`,
        { userId, peerId, similarity },
      );
      edgesWritten++;
    }
  }

  console.log(`[graphCohort] Wrote ${edgesWritten} SHOWS_PATTERN edges`);
  return { usersProcessed: vectors.length, edgesWritten };
}

// ─────────────────────────────────────────────────────────────
// getCohortPreferences
// ─────────────────────────────────────────────────────────────

/**
 * Returns category names that cohort peers strongly prefer (PREFERS score ≥ 0.5)
 * but this user has a weak preference for (score < WEAK_PREF_THRESHOLD or no edge).
 * These are candidates for the collaborative-filtering boost in cartEngine.
 */
export async function getCohortPreferences(
  userId: string,
  neo4jSession: Session,
): Promise<Set<string>> {
  const result = await neo4jSession.run(
    `MATCH (u:User {id: $userId})-[sp:SHOWS_PATTERN]->(peer:User)
     WHERE sp.similarity >= $minSim
     MATCH (peer)-[pr:PREFERS]->(c:Category)
     WHERE pr.score >= 0.5
     OPTIONAL MATCH (u)-[ur:PREFERS]->(c)
     WITH c.name AS category, ur.score AS userScore
     WHERE userScore IS NULL OR userScore < $weakThreshold
     RETURN DISTINCT category`,
    {
      userId,
      minSim: MIN_SIMILARITY,
      weakThreshold: WEAK_PREF_THRESHOLD,
    },
  );

  return new Set<string>(result.records.map((r: Neo4jRecord) => r.get('category') as string));
}

// ─────────────────────────────────────────────────────────────
// getCohortBrandPreferences
// ─────────────────────────────────────────────────────────────

/**
 * Returns brand names that cohort peers strongly prefer (PREFERS score ≥ 0.5)
 * but this user has a weak preference for (score < WEAK_PREF_THRESHOLD or no edge).
 * Used by cartEngine for a +0.06 brand-level collaborative filtering boost.
 */
export async function getCohortBrandPreferences(
  userId: string,
  neo4jSession: Session,
): Promise<Set<string>> {
  const result = await neo4jSession.run(
    `MATCH (u:User {id: $userId})-[sp:SHOWS_PATTERN]->(peer:User)
     WHERE sp.similarity >= $minSim
     MATCH (peer)-[pr:PREFERS]->(b:Brand)
     WHERE pr.score >= 0.5
     OPTIONAL MATCH (u)-[ur:PREFERS]->(b)
     WITH b.name AS brand, ur.score AS userScore
     WHERE userScore IS NULL OR userScore < $weakThreshold
     RETURN DISTINCT brand`,
    {
      userId,
      minSim: MIN_SIMILARITY,
      weakThreshold: WEAK_PREF_THRESHOLD,
    },
  );

  return new Set<string>(result.records.map((r: Neo4jRecord) => r.get('brand') as string));
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  if (!isNeo4jConfigured()) {
    console.error('[graphCohort] NEO4J_URI and NEO4J_PASSWORD must be set');
    process.exit(1);
  }

  (async () => {
    const session: Session = getSession();
    try {
      const result = await syncCohortSimilarity(session);
      console.log('[graphCohort] Complete:', result);
    } finally {
      await session.close();
      await closeDriver();
    }
  })().catch((e: Error) => { console.error(e); process.exit(1); });
}
