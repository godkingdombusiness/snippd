// graph-insights — POST /functions/v1/graph-insights
// Returns plain-language graph signal explanations for a given cart.
// Queries Neo4j via the HTTP Transaction API (no npm deps).
// Auth: Bearer JWT required.
// Gracefully returns empty insights when NEO4J_URI is not configured.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Neo4j HTTP helper ────────────────────────────────────────────────────────

interface CypherStatement {
  statement: string;
  parameters?: Record<string, unknown>;
}

interface Neo4jRow {
  row: unknown[];
}

interface Neo4jHttpResult {
  data: Neo4jRow[];
  errors?: { code: string; message: string }[];
}

async function runCypher(
  uri: string,
  user: string,
  password: string,
  statements: CypherStatement[],
): Promise<Neo4jHttpResult[]> {
  const httpBase = uri.replace(/^neo4j\+s:\/\//, 'https://').replace(/\/$/, '');
  // AuraDB Free uses instance ID as the database name (not 'neo4j')
  const db  = Deno.env.get('NEO4J_DATABASE') ?? 'neo4j';
  const url = `${httpBase}/db/${db}/tx/commit`;
  const auth = btoa(`${user}:${password}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify({ statements }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Neo4j HTTP ${res.status}: ${txt.slice(0, 200)}`);
  }
  const json = await res.json();
  return json.results as Neo4jHttpResult[];
}

// ── Request / response types ─────────────────────────────────────────────────

interface CartItem {
  product_id?: string;
  name: string;
  brand?: string;
  category?: string;
  normalized_key?: string;
}

interface ItemInsight {
  signal: 'buy_history' | 'preferred_category' | 'cohort_brand' | 'co_occurrence' | 'preferred_brand';
  text: string;
}

// ── Signal text builders ─────────────────────────────────────────────────────

function buyHistoryText(name: string): string {
  return `You've bought ${name} before — we kept it in`;
}

function preferredCategoryText(name: string, category: string): string {
  return `A favourite ${category} pick for you`;
}

function preferredBrandText(name: string, brand: string): string {
  return `${brand} is already one of your preferred brands`;
}

function cohortBrandText(name: string, brand: string): string {
  return `Your neighbours love ${brand} — we included it for you to try`;
}

function coOccurrenceText(name: string, otherName: string): string {
  return `${name} often goes with ${otherName} based on shoppers like you`;
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Missing or invalid authorization' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const jwt = authHeader.replace('Bearer ', '');

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: `Bearer ${jwt}` } } },
  );

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid JWT' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
  const userId = user.id;

  // ── Parse body ────────────────────────────────────────────────────────────
  let items: CartItem[] = [];
  try {
    const body = await req.json();
    items = Array.isArray(body.items) ? body.items : [];
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (items.length === 0) {
    return new Response(JSON.stringify({
      status: 'ok',
      neo4j_configured: false,
      cart_insights: [],
      item_insights: {},
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── Neo4j connectivity ────────────────────────────────────────────────────
  const NEO4J_URI  = Deno.env.get('NEO4J_URI')  ?? '';
  const NEO4J_USER = Deno.env.get('NEO4J_USER') ?? 'neo4j';
  const NEO4J_PASS = Deno.env.get('NEO4J_PASSWORD') ?? '';

  if (!NEO4J_URI) {
    return new Response(JSON.stringify({
      status: 'ok',
      neo4j_configured: false,
      cart_insights: [],
      item_insights: {},
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── Build lookup sets from cart items ─────────────────────────────────────
  const cartNormKeys  = items.map(i => (i.normalized_key ?? i.name.toLowerCase().trim())).filter(Boolean);
  const cartCategories = [...new Set(items.map(i => i.category?.toLowerCase()).filter((c): c is string => !!c))];
  const cartBrands    = [...new Set(items.map(i => i.brand?.toLowerCase()).filter((b): b is string => !!b))];

  // ── Run Cypher queries ────────────────────────────────────────────────────
  let preferredCategories: Set<string> = new Set();
  let preferredBrands:     Set<string> = new Set();
  let buyHistoryKeys:      Set<string> = new Set();
  let cohortBrands:        Set<string> = new Set();
  // Maps product key → list of co-occurring product keys (in-cart only)
  const coOccurrenceMap:   Map<string, string[]> = new Map();

  try {
    const results = await runCypher(NEO4J_URI, NEO4J_USER, NEO4J_PASS, [
      // 1. Preferred categories (PREFERS Category)
      {
        statement: `MATCH (u:User {id: $userId})-[r:PREFERS]->(c:Category)
                    WHERE r.score >= 0.5
                    RETURN c.name AS name`,
        parameters: { userId },
      },
      // 2. Preferred brands (PREFERS Brand)
      {
        statement: `MATCH (u:User {id: $userId})-[r:PREFERS]->(b:Brand)
                    WHERE r.score >= 0.5
                    RETURN b.name AS name`,
        parameters: { userId },
      },
      // 3. Buy history — products the user has actually purchased
      {
        statement: `MATCH (u:User {id: $userId})-[r:BUYS]->(p:Product)
                    RETURN p.normalized_key AS key`,
        parameters: { userId },
      },
      // 4. Cohort brand preferences — brands peers prefer that user hasn't adopted
      {
        statement: `MATCH (u:User {id: $userId})-[sp:SHOWS_PATTERN]->(peer:User)
                    WHERE sp.similarity >= 0.5
                    MATCH (peer)-[pr:PREFERS]->(b:Brand)
                    WHERE pr.score >= 0.5
                    OPTIONAL MATCH (u)-[ur:PREFERS]->(b)
                    WITH b.name AS brand, ur.score AS userScore
                    WHERE userScore IS NULL OR userScore < 0.35
                    RETURN DISTINCT brand`,
        parameters: { userId },
      },
      // 5. Co-occurrences — for each cart product key, which other cart keys co-occur?
      {
        statement: `MATCH (p1:Product)-[co:CO_OCCURS_WITH]->(p2:Product)
                    WHERE p1.normalized_key IN $keys
                      AND p2.normalized_key IN $keys
                    RETURN p1.normalized_key AS key1, p2.normalized_key AS key2, co.count AS count
                    ORDER BY co.count DESC`,
        parameters: { keys: cartNormKeys },
      },
    ]);

    // Parse result[0] — preferred categories
    if (results[0]?.data) {
      for (const row of results[0].data) {
        const name = row.row[0] as string | null;
        if (name) preferredCategories.add(name.toLowerCase());
      }
    }

    // Parse result[1] — preferred brands
    if (results[1]?.data) {
      for (const row of results[1].data) {
        const name = row.row[0] as string | null;
        if (name) preferredBrands.add(name.toLowerCase());
      }
    }

    // Parse result[2] — buy history
    if (results[2]?.data) {
      for (const row of results[2].data) {
        const key = row.row[0] as string | null;
        if (key) buyHistoryKeys.add(key.toLowerCase());
      }
    }

    // Parse result[3] — cohort brands
    if (results[3]?.data) {
      for (const row of results[3].data) {
        const brand = row.row[0] as string | null;
        if (brand) cohortBrands.add(brand.toLowerCase());
      }
    }

    // Parse result[4] — co-occurrences
    if (results[4]?.data) {
      for (const row of results[4].data) {
        const key1 = (row.row[0] as string | null)?.toLowerCase();
        const key2 = (row.row[1] as string | null)?.toLowerCase();
        if (key1 && key2) {
          if (!coOccurrenceMap.has(key1)) coOccurrenceMap.set(key1, []);
          coOccurrenceMap.get(key1)!.push(key2);
        }
      }
    }
  } catch (e) {
    // Neo4j unavailable — return empty insights, don't fail the request
    console.error('[graph-insights] Neo4j query failed:', (e as Error).message);
    return new Response(JSON.stringify({
      status: 'ok',
      neo4j_configured: true,
      neo4j_reachable: false,
      cart_insights: [],
      item_insights: {},
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  }

  // ── Build per-item insights ────────────────────────────────────────────────
  // Build a normKey → item name map for co-occurrence text
  const keyToName: Map<string, string> = new Map();
  for (const item of items) {
    const key = (item.normalized_key ?? item.name.toLowerCase().trim());
    keyToName.set(key, item.name);
  }

  const itemInsights: Record<string, ItemInsight> = {};

  for (const item of items) {
    const key      = (item.normalized_key ?? item.name.toLowerCase().trim());
    const brand    = item.brand?.toLowerCase() ?? '';
    const category = item.category?.toLowerCase() ?? '';
    const id       = item.product_id ?? key;

    // Priority: buy_history > preferred_brand > preferred_category > cohort_brand > co_occurrence
    if (buyHistoryKeys.has(key)) {
      itemInsights[id] = { signal: 'buy_history', text: buyHistoryText(item.name) };
    } else if (brand && preferredBrands.has(brand)) {
      itemInsights[id] = { signal: 'preferred_brand', text: preferredBrandText(item.name, item.brand!) };
    } else if (category && preferredCategories.has(category)) {
      itemInsights[id] = { signal: 'preferred_category', text: preferredCategoryText(item.name, item.category!) };
    } else if (brand && cohortBrands.has(brand)) {
      itemInsights[id] = { signal: 'cohort_brand', text: cohortBrandText(item.name, item.brand!) };
    } else {
      // Co-occurrence: find first co-occurring item still in cart
      const coKeys = coOccurrenceMap.get(key) ?? [];
      const matchKey = coKeys.find(k => keyToName.has(k) && k !== key);
      if (matchKey) {
        const otherName = keyToName.get(matchKey) ?? matchKey;
        itemInsights[id] = { signal: 'co_occurrence', text: coOccurrenceText(item.name, otherName) };
      }
    }
  }

  // ── Build cart-level insight sentences ────────────────────────────────────
  const cartInsights: string[] = [];

  // How many preferred categories are covered?
  const coveredPrefCats = cartCategories.filter(c => preferredCategories.has(c));
  if (coveredPrefCats.length >= 2) {
    cartInsights.push(`Covers ${coveredPrefCats.length} of your favourite categories`);
  } else if (coveredPrefCats.length === 1) {
    const label = coveredPrefCats[0].charAt(0).toUpperCase() + coveredPrefCats[0].slice(1);
    cartInsights.push(`Includes ${label}, one of your go-to categories`);
  }

  // How many items from buy history?
  const repeatItems = items.filter(i => {
    const k = (i.normalized_key ?? i.name.toLowerCase().trim());
    return buyHistoryKeys.has(k);
  });
  if (repeatItems.length >= 3) {
    cartInsights.push(`${repeatItems.length} items you've bought and loved before`);
  } else if (repeatItems.length > 0) {
    const names = repeatItems.slice(0, 2).map(i => i.name).join(' and ');
    cartInsights.push(`Includes ${names} — staples from your history`);
  }

  // Cohort signal summary
  const cohortItemCount = Object.values(itemInsights).filter(v => v.signal === 'cohort_brand').length;
  if (cohortItemCount >= 2) {
    cartInsights.push(`${cohortItemCount} items loved by shoppers with similar tastes`);
  } else if (cohortItemCount === 1) {
    cartInsights.push('Includes a brand your neighbours frequently choose');
  }

  // ── Response ──────────────────────────────────────────────────────────────
  return new Response(JSON.stringify({
    status: 'ok',
    neo4j_configured: true,
    neo4j_reachable: true,
    cart_insights: cartInsights,
    item_insights: itemInsights,
  }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
});
