// Supabase Edge Function: ingest-behavior
//
// Snippd behavioral-intelligence sink. The browser POSTs a typed event
// (see src/lib/behavior.js for the taxonomy); this function translates it
// to idempotent Cypher and writes it to the Neo4j Aura instance.
//
// Deploy:
//   supabase functions deploy ingest-behavior --no-verify-jwt
//
// Secrets (set once per project — NEVER commit):
//   supabase secrets set NEO4J_URI="neo4j+s://43e46705.databases.neo4j.io"
//   supabase secrets set NEO4J_USERNAME="neo4j"
//   supabase secrets set NEO4J_PASSWORD="<paste-from-aura-console>"
//   supabase secrets set NEO4J_DATABASE="neo4j"
//   supabase secrets set SNIPPD_ALLOWED_ORIGINS="https://snippd.app,http://localhost:5173,http://localhost:5174"
//
// Design notes:
// - The Neo4j driver is held in module scope so connections pool across
//   invocations within a warm Edge Function instance. Cold starts open
//   a fresh driver; Aura handles the handshake in ~100-200ms.
// - Every Cypher statement is idempotent (`MERGE`). Replaying an event
//   can only promote properties to newer values, never duplicate nodes.
// - Events are validated against an explicit allowlist of types. Unknown
//   types 400 out — better than accidentally writing arbitrary shapes to
//   the graph and polluting downstream queries.
// - If Neo4j is down or credentials are missing, this endpoint 204s with
//   a structured warning rather than 5xxing. Behavioral telemetry is
//   best-effort; it must never block a user flow.

// @ts-expect-error Deno global is only defined in the Supabase edge runtime.
const denoEnv = Deno.env;
// @ts-expect-error npm: specifier resolves inside the Supabase edge runtime.
import neo4j from "npm:neo4j-driver@5.27.0";

const NEO4J_URI = denoEnv.get("NEO4J_URI") || "";
const NEO4J_USERNAME = denoEnv.get("NEO4J_USERNAME") || "neo4j";
const NEO4J_PASSWORD = denoEnv.get("NEO4J_PASSWORD") || "";
const NEO4J_DATABASE = denoEnv.get("NEO4J_DATABASE") || "neo4j";
const ALLOWED_ORIGINS = (denoEnv.get("SNIPPD_ALLOWED_ORIGINS") || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const SENTRY_DSN = denoEnv.get("SENTRY_DSN") || "";

// Driver is lazy — only instantiate when the first event arrives and the
// secrets are actually set. This lets the function deploy cleanly even
// before the Neo4j credentials exist, so the client SDK can be shipped
// independently.
let driver: ReturnType<typeof neo4j.driver> | null = null;
function getDriver() {
  if (driver) return driver;
  if (!NEO4J_URI || !NEO4J_PASSWORD) return null;
  driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD), {
    // Aura caps at 100 connections per instance; stay well under.
    maxConnectionPoolSize: 20,
    connectionAcquisitionTimeout: 10_000,
    logging: { level: "warn", logger: (_level, message) => console.warn("[neo4j]", message) },
  });
  return driver;
}

// -------------------------------------------------------------------
// Cypher templates — one per event type. Every template is idempotent.
// The wire shape of each event is documented in src/lib/behavior.js.
// -------------------------------------------------------------------

type CypherJob = { cypher: string; params: Record<string, unknown> };

const TEMPLATES: Record<string, (body: Record<string, unknown>) => CypherJob> = {
  "user.signed_in": (e) => ({
    cypher: `
      MERGE (u:User { id: $userId })
        ON CREATE SET u.firstSeenAt = datetime($at)
        SET u.lastSeenAt = datetime($at)
      MERGE (s:Session { id: $sessionId })
        ON CREATE SET s.startedAt = datetime($at)
      MERGE (u)-[r:SIGNED_IN]->(s)
        ON CREATE SET r.at = datetime($at)
    `,
    params: {
      userId: e.user_id,
      sessionId: e.session_id,
      at: e.at,
    },
  }),

  "plan.bundle_locked": (e) => ({
    cypher: `
      MERGE (u:User { id: $userId })
      MERGE (s:Store { slug: $storeSlug })
      MERGE (b:Bundle { id: $bundleId })
        ON CREATE SET b.createdAt = datetime($at)
        SET b.strategy = $strategy,
            b.storeSlug = $storeSlug,
            b.budgetCents = $budgetCents,
            b.userId = $userId,
            b.lockedAt = datetime($at)
      MERGE (u)-[:PLANNED]->(b)
      MERGE (b)-[:AT_STORE]->(s)
      WITH b, $products AS products
      UNWIND products AS p
      MERGE (prod:Product { name: p.name, storeSlug: $storeSlug })
        ON CREATE SET prod.firstSeenAt = datetime($at)
      MERGE (b)-[r:CONTAINS]->(prod)
        SET r.role = p.role
    `,
    params: {
      userId: e.user_id,
      storeSlug: e.store_slug,
      bundleId: e.bundle_id,
      strategy: e.strategy,
      budgetCents: e.budget_cents ?? 0,
      at: e.at,
      products: Array.isArray(e.products) ? e.products : [],
    },
  }),

  "shop.item_unavailable": (e) => ({
    cypher: `
      MERGE (u:User { id: $userId })
      MERGE (s:Store { slug: $storeSlug })
      MERGE (p:Product { name: $productName, storeSlug: $storeSlug })
      MERGE (u)-[r:UNAVAILABLE]->(p)
        SET r.at = datetime($at),
            r.replacement = $replacement
      MERGE (p)-[:SOLD_AT]->(s)
    `,
    params: {
      userId: e.user_id,
      storeSlug: e.store_slug,
      productName: e.product_name,
      replacement: e.replacement_name ?? null,
      at: e.at,
    },
  }),

  "trip.completed": (e) => ({
    cypher: `
      MERGE (u:User { id: $userId })
      MERGE (b:Bundle { id: $bundleId })
      MERGE (t:Trip { id: $tripId })
        ON CREATE SET t.completedAt = datetime($at)
        SET t.userId = $userId,
            t.retailCents = $retailCents,
            t.ibottaCents = $ibottaCents,
            t.fetchCents = $fetchCents,
            t.loyaltyCents = $loyaltyCents,
            t.totalSavingsCents = $ibottaCents + $fetchCents + $loyaltyCents
      MERGE (u)-[:COMPLETED]->(t)
      MERGE (t)-[:FROM]->(b)
      WITH t, $unplanned AS unplanned, $userId AS userId, $storeSlug AS storeSlug, $at AS at
      UNWIND unplanned AS name
      MERGE (prod:Product { name: name, storeSlug: storeSlug })
      MERGE (u:User { id: userId })
      MERGE (u)-[r:BOUGHT_UNPLANNED]->(prod)
        SET r.at = datetime(at),
            r.tripId = t.id
    `,
    params: {
      userId: e.user_id,
      bundleId: e.bundle_id,
      tripId: e.trip_id,
      retailCents: e.retail_cents ?? 0,
      ibottaCents: e.ibotta_cents ?? 0,
      fetchCents: e.fetch_cents ?? 0,
      loyaltyCents: e.loyalty_cents ?? 0,
      unplanned: Array.isArray(e.unplanned_items) ? e.unplanned_items : [],
      storeSlug: e.store_slug,
      at: e.at,
    },
  }),

  "preference.recorded": (e) => ({
    cypher: `
      MERGE (u:User { id: $userId })
      WITH u, $subjects AS subjects, $storeSlug AS storeSlug, $sentiment AS sentiment, $text AS text, $at AS at
      UNWIND (CASE WHEN size(subjects) = 0 THEN [NULL] ELSE subjects END) AS subject
      FOREACH (_ IN CASE WHEN subject IS NULL THEN [] ELSE [1] END |
        MERGE (p:Product { name: subject, storeSlug: storeSlug })
        MERGE (u)-[r:EXPRESSED_PREFERENCE]->(p)
          SET r.sentiment = sentiment,
              r.text = text,
              r.at = datetime(at)
      )
      FOREACH (_ IN CASE WHEN subject IS NULL THEN [1] ELSE [] END |
        MERGE (u)-[r:EXPRESSED_GENERAL_PREFERENCE { at: datetime(at) }]->(u)
          SET r.sentiment = sentiment,
              r.text = text
      )
    `,
    params: {
      userId: e.user_id,
      subjects: Array.isArray(e.subject_product_names) ? e.subject_product_names : [],
      storeSlug: e.store_slug ?? "unknown",
      sentiment: e.sentiment ?? "neutral",
      text: e.text ?? "",
      at: e.at,
    },
  }),
};

function jsonResponse(status: number, body: unknown, origin: string | null) {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  // HTTP spec: 204/205/304 responses MUST have a null body. Deno's Response
  // constructor throws RangeError otherwise, which the edge runtime surfaces
  // as a 500 — breaking CORS preflight for any browser client. Skip the body
  // and the Content-Type header for null-body statuses.
  const nullBodyStatus = status === 204 || status === 205 || status === 304;
  if (nullBodyStatus) {
    return new Response(null, { status, headers });
  }
  headers["Content-Type"] = "application/json";
  return new Response(JSON.stringify(body), { status, headers });
}

async function reportToSentry(err: unknown, context: Record<string, unknown>) {
  if (!SENTRY_DSN) return;
  try {
    // Lightweight Sentry envelope — keeping the driver lean, not importing
    // @sentry/deno. Good enough for error triage.
    const dsn = new URL(SENTRY_DSN);
    const projectId = dsn.pathname.replace(/^\//, "");
    const publicKey = dsn.username;
    const envelope =
      JSON.stringify({ event_id: crypto.randomUUID().replace(/-/g, ""), sent_at: new Date().toISOString() }) +
      "\n" +
      JSON.stringify({ type: "event" }) +
      "\n" +
      JSON.stringify({
        message: String((err as Error)?.message || err),
        level: "error",
        tags: { fn: "ingest-behavior" },
        extra: context,
      });
    await fetch(`https://${dsn.hostname}/api/${projectId}/envelope/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=snippd-ingest/1.0`,
      },
      body: envelope,
    });
  } catch {
    // Never let telemetry-of-telemetry fail the request.
  }
}

// @ts-expect-error Deno.serve is only defined in the Supabase edge runtime.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") return jsonResponse(204, {}, origin);
  if (req.method !== "POST") return jsonResponse(405, { error: "POST only" }, origin);

  if (ALLOWED_ORIGINS.length > 0 && origin && !ALLOWED_ORIGINS.includes(origin)) {
    return jsonResponse(403, { error: "origin not allowed" }, origin);
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 32 * 1024) {
      return jsonResponse(413, { error: "payload too large" }, origin);
    }
    body = JSON.parse(raw);
  } catch {
    return jsonResponse(400, { error: "invalid JSON" }, origin);
  }

  const type = String(body.type || "");
  const template = TEMPLATES[type];
  if (!template) {
    return jsonResponse(400, { error: `unknown event type: ${type}` }, origin);
  }
  if (!body.user_id || !body.at) {
    return jsonResponse(400, { error: "missing required fields: user_id, at" }, origin);
  }

  const d = getDriver();
  if (!d) {
    // Credentials not configured yet — accept + drop so the client SDK can
    // go live before ops finishes wiring secrets. The response signals
    // "degraded" so frontend observability can flag this.
    return jsonResponse(202, { status: "degraded", reason: "neo4j-unconfigured" }, origin);
  }

  const session = d.session({ database: NEO4J_DATABASE });
  try {
    const job = template(body);
    await session.executeWrite((tx) => tx.run(job.cypher, job.params));
    return jsonResponse(202, { status: "accepted", type }, origin);
  } catch (err) {
    await reportToSentry(err, { type, userId: body.user_id });
    return jsonResponse(500, { error: "ingest failed", type }, origin);
  } finally {
    await session.close().catch(() => {});
  }
});
