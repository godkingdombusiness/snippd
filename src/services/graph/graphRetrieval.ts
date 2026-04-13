/**
 * graphRetrieval — Reads user context from the Neo4j memory graph
 *
 * Used by cartEngine at scoring time to enrich candidate scoring
 * beyond what Supabase preference scores capture.
 *
 * Graceful degradation: all functions return safe empty defaults
 * when Neo4j is unavailable or unconfigured.
 */

import { Session, Record as Neo4jRecord } from 'neo4j-driver';
import { isNeo4jConfigured, getSession } from '../../lib/neo4jClient';
import { getCohortPreferences, getCohortBrandPreferences } from './graphCohort';

// ─────────────────────────────────────────────────────────────
// Return types
// ─────────────────────────────────────────────────────────────

export interface GraphPreference {
  name: string;
  score: number;
}

export interface UserGraphContext {
  preferredCategories:  GraphPreference[];   // top 5, score desc
  preferredStores:      GraphPreference[];   // top 3, score desc
  preferredBrands:      GraphPreference[];   // top 10, score desc
  rejectedCategories:   string[];            // names only
  buyHistory:           Map<string, number>; // normalized_key → purchase count
  coOccurrenceKeys:     Set<string>;         // all product keys in user's buy graph
  cohortCategories:     Set<string>;         // categories peers prefer, user doesn't yet
  cohortBrands:         Set<string>;         // brands peers prefer, user hasn't tried
}

export interface RelatedProduct {
  normalized_key: string;
  co_count: number;
}

// ─────────────────────────────────────────────────────────────
// Empty defaults (used when Neo4j unavailable)
// ─────────────────────────────────────────────────────────────

const EMPTY_CONTEXT: UserGraphContext = {
  preferredCategories: [],
  preferredStores:     [],
  preferredBrands:     [],
  rejectedCategories:  [],
  buyHistory:          new Map(),
  coOccurrenceKeys:    new Set(),
  cohortCategories:    new Set(),
  cohortBrands:        new Set(),
};

// ─────────────────────────────────────────────────────────────
// getUserGraphContext
// ─────────────────────────────────────────────────────────────

export async function getUserGraphContext(userId: string): Promise<UserGraphContext> {
  if (!isNeo4jConfigured()) return { ...EMPTY_CONTEXT };

  let session: Session | null = null;
  try {
    session = getSession();

    // Run all queries in parallel (cohort helpers use the same session)
    const [catResult, storeResult, brandResult, rejectedResult, buyResult, coOccResult, cohortCategories, cohortBrands] =
      await Promise.all([
        // Top 5 preferred categories
        session.run(
          `MATCH (u:User {id: $userId})-[r:PREFERS]->(c:Category)
           RETURN c.name AS name, r.score AS score
           ORDER BY r.score DESC LIMIT 5`,
          { userId },
        ),
        // Top 3 preferred stores
        session.run(
          `MATCH (u:User {id: $userId})-[r:PREFERS]->(s:Store)
           RETURN s.retailer_key AS name, r.score AS score
           ORDER BY r.score DESC LIMIT 3`,
          { userId },
        ),
        // Top 10 preferred brands
        session.run(
          `MATCH (u:User {id: $userId})-[r:PREFERS]->(b:Brand)
           RETURN b.name AS name, r.score AS score
           ORDER BY r.score DESC LIMIT 10`,
          { userId },
        ),
        // Rejected categories
        session.run(
          `MATCH (u:User {id: $userId})-[:REJECTS]->(c:Category)
           RETURN c.name AS name`,
          { userId },
        ),
        // Buy history (product counts)
        session.run(
          `MATCH (u:User {id: $userId})-[r:BUYS]->(p:Product)
           RETURN p.normalized_key AS key, r.count AS count
           ORDER BY r.count DESC LIMIT 100`,
          { userId },
        ),
        // Co-occurrence keys: products that co-occur with things this user buys
        session.run(
          `MATCH (u:User {id: $userId})-[:BUYS]->(p:Product)-[:CO_OCCURS_WITH]->(p2:Product)
           RETURN p2.normalized_key AS key`,
          { userId },
        ),
        // Cohort category preferences: what peers prefer but user doesn't yet
        getCohortPreferences(userId, session).catch(() => new Set<string>()),
        // Cohort brand preferences: brands peers prefer but user hasn't tried
        getCohortBrandPreferences(userId, session).catch(() => new Set<string>()),
      ]);

    const preferredCategories: GraphPreference[] = catResult.records.map((r: Neo4jRecord) => ({
      name:  r.get('name') as string,
      score: r.get('score') as number,
    }));

    const preferredStores: GraphPreference[] = storeResult.records.map((r: Neo4jRecord) => ({
      name:  r.get('name') as string,
      score: r.get('score') as number,
    }));

    const preferredBrands: GraphPreference[] = brandResult.records.map((r: Neo4jRecord) => ({
      name:  r.get('name') as string,
      score: r.get('score') as number,
    }));

    const rejectedCategories: string[] = rejectedResult.records.map((r: Neo4jRecord) => r.get('name') as string);

    const buyHistory = new Map<string, number>();
    for (const rec of buyResult.records) {
      const key   = rec.get('key') as string;
      const count = rec.get('count');
      // Neo4j integers come back as Neo4j Integer objects
      buyHistory.set(key, typeof count === 'object' ? (count as { toNumber(): number }).toNumber() : Number(count));
    }

    const coOccurrenceKeys = new Set<string>(
      coOccResult.records.map((r: Neo4jRecord) => r.get('key') as string),
    );

    return { preferredCategories, preferredStores, preferredBrands, rejectedCategories, buyHistory, coOccurrenceKeys, cohortCategories, cohortBrands };
  } catch (err) {
    // Graph unavailable — degrade gracefully, don't break cart generation
    console.warn('[graphRetrieval] getUserGraphContext failed (degrading gracefully):', (err as Error).message);
    return { ...EMPTY_CONTEXT };
  } finally {
    if (session) await session.close();
  }
}

// ─────────────────────────────────────────────────────────────
// getRelatedProducts
// ─────────────────────────────────────────────────────────────

export async function getRelatedProducts(normalizedKey: string): Promise<RelatedProduct[]> {
  if (!isNeo4jConfigured()) return [];

  let session: Session | null = null;
  try {
    session = getSession();

    const result = await session.run(
      `MATCH (p:Product {normalized_key: $key})-[r:CO_OCCURS_WITH]->(p2:Product)
       RETURN p2.normalized_key AS key, r.count AS count
       ORDER BY r.count DESC LIMIT 5`,
      { key: normalizedKey },
    );

    return result.records.map((rec: Neo4jRecord) => {
      const count = rec.get('count');
      return {
        normalized_key: rec.get('key') as string,
        co_count: typeof count === 'object' ? (count as { toNumber(): number }).toNumber() : Number(count),
      };
    });
  } catch (err) {
    console.warn('[graphRetrieval] getRelatedProducts failed:', (err as Error).message);
    return [];
  } finally {
    if (session) await session.close();
  }
}
