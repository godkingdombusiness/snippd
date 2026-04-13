/**
 * admin-graph-stats — Returns Neo4j memory graph topology stats
 *
 * GET /functions/v1/admin-graph-stats
 * Auth: Bearer JWT (admin email required — validated against ADMIN_EMAILS env var or hardcoded list)
 *
 * Uses the Neo4j HTTP Transaction API (no npm deps — pure Deno fetch).
 * Degrades gracefully: returns zero counts if NEO4J_URI not configured.
 *
 * Response shape: see GraphStatsResponse interface below.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// CORS + helpers
// ─────────────────────────────────────────────────────────────

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─────────────────────────────────────────────────────────────
// Admin guard
// ─────────────────────────────────────────────────────────────

// Comma-separated list from env var, falling back to hardcoded defaults
function getAdminEmails(): string[] {
  const envList = Deno.env.get('ADMIN_EMAILS');
  if (envList) return envList.split(',').map((e) => e.trim().toLowerCase());
  return ['dina@getsnippd.com', 'admin@getsnippd.com'];
}

// ─────────────────────────────────────────────────────────────
// Neo4j HTTP Transaction API
// ─────────────────────────────────────────────────────────────

interface CypherStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

interface Neo4jHttpResult {
  columns: string[];
  data: Array<{ row: unknown[] }>;
}

interface Neo4jHttpResponse {
  results: Neo4jHttpResult[];
  errors: Array<{ code: string; message: string }>;
}

async function runCypher(
  uri: string,
  user: string,
  password: string,
  statements: CypherStatement[],
  database?: string,
): Promise<Neo4jHttpResult[]> {
  // neo4j+s://xxxx.databases.neo4j.io  →  https://xxxx.databases.neo4j.io
  const httpBase = uri
    .replace(/^neo4j\+s:\/\//, 'https://')
    .replace(/^neo4j:\/\//, 'http://')
    .replace(/^bolt\+s:\/\//, 'https://')
    .replace(/^bolt:\/\//, 'http://')
    .replace(/\/$/, '');

  // AuraDB Free uses instance ID as the database name (not 'neo4j')
  const db  = database ?? Deno.env.get('NEO4J_DATABASE') ?? 'neo4j';
  const url = `${httpBase}/db/${db}/tx/commit`;
  const auth = btoa(`${user}:${password}`);

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Accept':        'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ statements }),
  });

  if (!res.ok) {
    throw new Error(`Neo4j HTTP API error ${res.status}: ${await res.text()}`);
  }

  const body = (await res.json()) as Neo4jHttpResponse;

  if (body.errors && body.errors.length > 0) {
    throw new Error(`Cypher error: ${body.errors[0].message}`);
  }

  return body.results;
}

// Helper: extract first row / first value from a result set
function firstVal(result: Neo4jHttpResult, fallback = 0): number {
  const row = result.data[0]?.row;
  if (!row) return fallback;
  const v = row[0];
  return typeof v === 'number' ? v : fallback;
}

// ─────────────────────────────────────────────────────────────
// Response type
// ─────────────────────────────────────────────────────────────

interface TopCategory {
  name: string;
  user_count: number;
  avg_score: number;
}

interface TopProduct {
  product1: string;
  product2: string;
  count: number;
}

interface TopCohortPair {
  user1: string;
  user2: string;
  similarity: number;
}

interface TopBrand {
  name: string;
  user_count: number;
  avg_score: number;
}

interface GraphStatsResponse {
  status: string;
  neo4j_configured: boolean;
  computed_at: string;
  nodes: Record<string, number>;
  relationships: Record<string, number>;
  top_categories: TopCategory[];
  top_brands: TopBrand[];
  top_co_occurrences: TopProduct[];
  top_cohort_pairs: TopCohortPair[];
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'GET')  return json({ error: 'Method not allowed' }, 405);

  // ── Auth ────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const jwt = authHeader.slice(7);
  const { data: { user }, error: authErr } = await db.auth.getUser(jwt);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const adminEmails = getAdminEmails();
  if (!adminEmails.includes((user.email ?? '').toLowerCase())) {
    return json({ error: 'Forbidden — admin only' }, 403);
  }

  // ── Neo4j stats ─────────────────────────────────────────────
  const neo4jUri  = Deno.env.get('NEO4J_URI')      ?? '';
  const neo4jUser = Deno.env.get('NEO4J_USER')     ?? 'neo4j';
  const neo4jPass = Deno.env.get('NEO4J_PASSWORD') ?? '';

  const configured = Boolean(neo4jUri && neo4jPass);
  const computedAt = new Date().toISOString();

  const empty: GraphStatsResponse = {
    status: 'ok',
    neo4j_configured: false,
    computed_at: computedAt,
    nodes:         { User: 0, Product: 0, Category: 0, Brand: 0, Store: 0, Stack: 0 },
    relationships: { PREFERS: 0, BUYS: 0, CO_OCCURS_WITH: 0, SHOWS_PATTERN: 0, REJECTS: 0, ACCEPTS: 0, DISMISSES: 0 },
    top_categories:    [],
    top_brands:        [],
    top_co_occurrences: [],
    top_cohort_pairs:  [],
  };

  if (!configured) return json(empty);

  try {
    const results = await runCypher(neo4jUri, neo4jUser, neo4jPass, [
      // ── Node counts ──────────────────────────────────────────
      { statement: 'MATCH (n:User) RETURN count(n) AS count' },
      { statement: 'MATCH (n:Product) RETURN count(n) AS count' },
      { statement: 'MATCH (n:Category) RETURN count(n) AS count' },
      { statement: 'MATCH (n:Brand) RETURN count(n) AS count' },
      { statement: 'MATCH (n:Store) RETURN count(n) AS count' },
      { statement: 'MATCH (n:Stack) RETURN count(n) AS count' },
      // ── Relationship counts ──────────────────────────────────
      { statement: 'MATCH ()-[r:PREFERS]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:BUYS]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:CO_OCCURS_WITH]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:SHOWS_PATTERN]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:REJECTS]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:ACCEPTS]->() RETURN count(r) AS count' },
      { statement: 'MATCH ()-[r:DISMISSES]->() RETURN count(r) AS count' },
      // ── Top categories globally ──────────────────────────────
      {
        statement: `MATCH ()-[r:PREFERS]->(c:Category)
                    RETURN c.name AS name, count(r) AS user_count, avg(r.score) AS avg_score
                    ORDER BY user_count DESC LIMIT 10`,
      },
      // ── Top brands globally ──────────────────────────────────
      {
        statement: `MATCH ()-[r:PREFERS]->(b:Brand)
                    RETURN b.name AS name, count(r) AS user_count, avg(r.score) AS avg_score
                    ORDER BY user_count DESC LIMIT 10`,
      },
      // ── Top co-occurring product pairs ───────────────────────
      {
        statement: `MATCH (p1:Product)-[r:CO_OCCURS_WITH]->(p2:Product)
                    RETURN p1.normalized_key AS product1, p2.normalized_key AS product2, r.count AS count
                    ORDER BY r.count DESC LIMIT 10`,
      },
      // ── Top cohort pairs ─────────────────────────────────────
      {
        statement: `MATCH (u1:User)-[r:SHOWS_PATTERN]->(u2:User)
                    RETURN u1.id AS user1, u2.id AS user2, r.similarity AS similarity
                    ORDER BY r.similarity DESC LIMIT 10`,
      },
    ]);

    // Parse results (indices match statement order above)
    const [
      rUser, rProduct, rCategory, rBrand, rStore, rStack,
      rPrefers, rBuys, rCoOcc, rPattern, rRejects, rAccepts, rDismisses,
      rTopCats, rTopBrands, rTopCoOcc, rTopCohort,
    ] = results;

    const top_categories: TopCategory[] = (rTopCats?.data ?? []).map((d) => ({
      name:       d.row[0] as string,
      user_count: d.row[1] as number,
      avg_score:  Math.round((d.row[2] as number) * 100) / 100,
    }));

    const top_brands: TopBrand[] = (rTopBrands?.data ?? []).map((d) => ({
      name:       d.row[0] as string,
      user_count: d.row[1] as number,
      avg_score:  Math.round((d.row[2] as number) * 100) / 100,
    }));

    const top_co_occurrences: TopProduct[] = (rTopCoOcc?.data ?? []).map((d) => ({
      product1: d.row[0] as string,
      product2: d.row[1] as string,
      count:    d.row[2] as number,
    }));

    const top_cohort_pairs: TopCohortPair[] = (rTopCohort?.data ?? []).map((d) => ({
      user1:      (d.row[0] as string).slice(0, 8),  // truncate UUID for display
      user2:      (d.row[1] as string).slice(0, 8),
      similarity: Math.round((d.row[2] as number) * 100) / 100,
    }));

    const response: GraphStatsResponse = {
      status:           'ok',
      neo4j_configured: true,
      computed_at:      computedAt,
      nodes: {
        User:     firstVal(rUser),
        Product:  firstVal(rProduct),
        Category: firstVal(rCategory),
        Brand:    firstVal(rBrand),
        Store:    firstVal(rStore),
        Stack:    firstVal(rStack),
      },
      relationships: {
        PREFERS:        firstVal(rPrefers),
        BUYS:           firstVal(rBuys),
        CO_OCCURS_WITH: firstVal(rCoOcc),
        SHOWS_PATTERN:  firstVal(rPattern),
        REJECTS:        firstVal(rRejects),
        ACCEPTS:        firstVal(rAccepts),
        DISMISSES:      firstVal(rDismisses),
      },
      top_categories,
      top_brands,
      top_co_occurrences,
      top_cohort_pairs,
    };

    return json(response);

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[admin-graph-stats] Neo4j query failed:', msg);
    return json({ ...empty, neo4j_configured: true, error: msg }, 500);
  }
});
