// Snippd account-deletion Edge Function.
//
// Apple App Store Review Guideline 5.1.1(v) requires an in-app path to
// delete the account AND all associated data. This function is that path.
//
// Flow:
//   1. Client (Settings screen) POSTs with the user's Supabase access
//      token in Authorization: Bearer <jwt>.
//   2. We verify the JWT via supabase.auth.getUser() — only the owner of
//      the account can delete it.
//   3. We DETACH DELETE the user's node + relationships in Neo4j Aura.
//      Fail-silent: if Neo4j isn't configured, skip. No orphans in Aura
//      is nice-to-have, but not blocking.
//   4. We delete from every known user-scoped public table. Per-table
//      failures don't abort the whole deletion (we log and continue) —
//      a partially-cleaned account is still better than a blocked one,
//      and the auth-user row going away is what Apple actually requires.
//   5. We call supabase.auth.admin.deleteUser(userId) with the service
//      role. This is the point-of-no-return.
//   6. We return 200 with a summary of what was cleared so the client
//      can show honest feedback.
//
// Requires (auto-injected by Supabase Edge runtime):
//   - SUPABASE_URL
//   - SUPABASE_ANON_KEY
//   - SUPABASE_SERVICE_ROLE_KEY
// Optional (fail-silent if absent):
//   - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD, NEO4J_DATABASE
//   - SNIPPD_ALLOWED_ORIGINS (comma-separated, defaults to Snippd web + localhost)

// @ts-expect-error Deno global is only defined in the Supabase edge runtime.
const denoEnv = Deno.env;
// @ts-expect-error npm: specifier resolves inside the Supabase edge runtime.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";
// @ts-expect-error npm: specifier resolves inside the Supabase edge runtime.
import neo4j from "npm:neo4j-driver@5.27.0";

const SUPABASE_URL = denoEnv.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = denoEnv.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = denoEnv.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const NEO4J_URI = denoEnv.get("NEO4J_URI") || "";
const NEO4J_USERNAME = denoEnv.get("NEO4J_USERNAME") || denoEnv.get("NEO4J_USER") || "";
const NEO4J_PASSWORD = denoEnv.get("NEO4J_PASSWORD") || "";
const NEO4J_DATABASE = denoEnv.get("NEO4J_DATABASE") || "neo4j";

const DEFAULT_ORIGINS = [
  "https://snippd.app",
  "http://localhost:5173",
  "http://localhost:5174",
];
const ALLOWED_ORIGINS = new Set(
  (denoEnv.get("SNIPPD_ALLOWED_ORIGINS") || DEFAULT_ORIGINS.join(","))
    .split(",")
    .map((s: string) => s.trim())
    .filter(Boolean),
);

// Tables scoped by user_id where we have first-party writes. Order
// matters only insofar as rows in later tables might FK to earlier ones;
// with our current schema there are no such FKs, so arbitrary order is
// fine. Keep this list in sync with src/lib/*.
const USER_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "current_mission", column: "user_id" },
  { table: "weekly_stacks", column: "user_id" },
  { table: "trips", column: "user_id" },
  { table: "donation_pledges", column: "user_id" },
  { table: "profiles", column: "user_id" },
];

// Extra user-keyed table scoped by email instead of user_id.
const EMAIL_SCOPED_TABLES: ReadonlyArray<{ table: string; column: string }> = [
  { table: "pro_waitlist", column: "email" },
];

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

function jsonResponse(status: number, body: unknown, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin),
    },
  });
}

async function deleteFromNeo4j(userId: string): Promise<"deleted" | "skipped" | "failed"> {
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    return "skipped";
  }
  let driver: ReturnType<typeof neo4j.driver> | null = null;
  try {
    driver = neo4j.driver(
      NEO4J_URI,
      neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
      { disableLosslessIntegers: true },
    );
    const session = driver.session({ database: NEO4J_DATABASE });
    try {
      // Detach + delete the User node. Also orphan-sweep any Sessions and
      // Bundles keyed to the user — we don't fan out to Stores/Products
      // (shared) or Clips (shared). This is conservative on purpose: full
      // isolation requires per-user labels we don't assign yet.
      await session.executeWrite((tx: any) =>
        tx.run(
          `
          MATCH (u:User { id: $userId })
          OPTIONAL MATCH (u)-[:SIGNED_IN]->(s:Session)
          OPTIONAL MATCH (b:Bundle { userId: $userId })
          OPTIONAL MATCH (t:Trip { userId: $userId })
          DETACH DELETE u, s, b, t
          `,
          { userId },
        ),
      );
      return "deleted";
    } finally {
      await session.close().catch(() => {});
    }
  } catch (_err) {
    return "failed";
  } finally {
    await driver?.close().catch(() => {});
  }
}

async function deleteFromTables(
  admin: ReturnType<typeof createClient>,
  userId: string,
  email: string | null,
): Promise<Record<string, string>> {
  const summary: Record<string, string> = {};
  for (const { table, column } of USER_SCOPED_TABLES) {
    const { error } = await admin.from(table).delete().eq(column, userId);
    summary[table] = error ? `failed: ${error.message}` : "cleared";
  }
  if (email) {
    for (const { table, column } of EMAIL_SCOPED_TABLES) {
      const { error } = await admin.from(table).delete().eq(column, email);
      summary[table] = error ? `failed: ${error.message}` : "cleared";
    }
  }
  return summary;
}

// @ts-expect-error Deno.serve is only defined in the Supabase edge runtime.
Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method-not-allowed" }, origin);
  }

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(
      500,
      { error: "edge-function-misconfigured", detail: "missing SUPABASE_URL/ANON_KEY/SERVICE_ROLE_KEY" },
      origin,
    );
  }

  const authHeader = req.headers.get("Authorization") || req.headers.get("authorization") || "";
  const token = authHeader.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : "";
  if (!token) {
    return jsonResponse(401, { error: "missing-bearer-token" }, origin);
  }

  // Verify the JWT with the anon-client by forcing it to read the user
  // from the token (getUser). If the token is invalid/expired, this
  // returns an error and we stop.
  const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: userData, error: authError } = await authClient.auth.getUser(token);
  if (authError || !userData?.user) {
    return jsonResponse(401, { error: "invalid-token", detail: authError?.message }, origin);
  }
  const userId = userData.user.id;
  const email = userData.user.email ?? null;

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const neo4jStatus = await deleteFromNeo4j(userId);
  const tableStatus = await deleteFromTables(admin, userId, email);

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    return jsonResponse(
      500,
      {
        error: "auth-delete-failed",
        detail: deleteError.message,
        partialCleanup: { neo4j: neo4jStatus, tables: tableStatus },
      },
      origin,
    );
  }

  return jsonResponse(
    200,
    {
      status: "deleted",
      userId,
      email,
      cleanup: {
        auth: "deleted",
        neo4j: neo4jStatus,
        tables: tableStatus,
      },
    },
    origin,
  );
});
