import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

const RATE_LIMIT_MAX = 200; // requests per user per hour
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RETAILER_KEY_RE = /^[a-z0-9_]{1,50}$/i;

const ALLOWED_EVENT_FIELDS = new Set([
  'events', 'event_name', 'session_id', 'user_id', 'household_id',
  'timestamp', 'screen_name', 'object_type', 'object_id',
  'retailer_key', 'category', 'brand', 'rank_position', 'model_version',
  'explanation_shown', 'metadata', 'context',
  'recommendation_type', 'outcome_status', 'score', 'explanation', 'reason_codes',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ─────────────────────────────────────────────────────────────
// Response helpers
// ─────────────────────────────────────────────────────────────

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ─────────────────────────────────────────────────────────────
// Field coercers (identical to original — kept for compatibility)
// ─────────────────────────────────────────────────────────────

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asJson(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) return Number(value.trim());
  return null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

// ─────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────

function isValidUUID(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

/** Returns the nesting depth of a plain object. Arrays count as depth 0 leaves. */
function objectDepth(obj: unknown): number {
  if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) return 0;
  const values = Object.values(obj as Record<string, unknown>);
  if (values.length === 0) return 1;
  return 1 + Math.max(...values.map(objectDepth));
}

/** Validates a single raw event payload. Returns an error string or null. */
function validateEventPayload(raw: Record<string, unknown>): string | null {
  // Unknown fields
  const unknown = Object.keys(raw).filter((k) => !ALLOWED_EVENT_FIELDS.has(k));
  if (unknown.length > 0) return `Unknown field(s): ${unknown.join(', ')}`;

  // event_name: required, string, max 100
  if (typeof raw.event_name !== 'string' || raw.event_name.trim().length === 0) {
    return 'event_name is required and must be a non-empty string';
  }
  if (raw.event_name.length > 100) return 'event_name must be at most 100 characters';

  // session_id: required, valid UUID
  if (!isValidUUID(raw.session_id)) return 'session_id must be a valid UUID';

  // retailer_key: optional but must match pattern if provided
  if (raw.retailer_key !== undefined && raw.retailer_key !== null) {
    if (typeof raw.retailer_key !== 'string' || !RETAILER_KEY_RE.test(raw.retailer_key)) {
      return 'retailer_key must be alphanumeric with underscores only, max 50 characters';
    }
  }

  // category: optional, max 100
  if (raw.category !== undefined && raw.category !== null) {
    if (typeof raw.category !== 'string' || raw.category.length > 100) {
      return 'category must be a string, max 100 characters';
    }
  }

  // metadata: optional, object, max 10 keys, max depth 2
  if (raw.metadata !== undefined && raw.metadata !== null) {
    if (typeof raw.metadata !== 'object' || Array.isArray(raw.metadata)) {
      return 'metadata must be a JSON object (not an array)';
    }
    const meta = raw.metadata as Record<string, unknown>;
    if (Object.keys(meta).length > 10) return 'metadata must have at most 10 keys';
    if (objectDepth(meta) > 2) return 'metadata must not be nested deeper than 2 levels';
  }

  return null;
}

// ─────────────────────────────────────────────────────────────
// Rate limiting
// ─────────────────────────────────────────────────────────────

async function enforceRateLimit(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ limited: boolean; count: number }> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  // Insert this request's record
  await db.from('api_rate_limit_log').insert({
    user_id: userId,
    function_name: 'ingest-event',
  });

  // Count all records (including the one just inserted) in the last hour
  const { count } = await db
    .from('api_rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('request_at', oneHourAgo);

  // Cleanup records older than 2 hours — runs on ~1% of requests
  if (Math.random() < 0.01) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    await db.from('api_rate_limit_log').delete().lt('request_at', twoHoursAgo);
  }

  const total = count ?? 0;
  return { limited: total > RATE_LIMIT_MAX, count: total };
}

// ─────────────────────────────────────────────────────────────
// Request logging → ingestion_run_log
// ─────────────────────────────────────────────────────────────

async function logRequest(
  db: ReturnType<typeof createClient>,
  params: {
    retailerKey: string;
    stage: 'success' | 'error';
    status: number;
    metadata: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.from('ingestion_run_log').insert({
      source_key:   'ingest-event',
      retailer_key: params.retailerKey,
      stage:        params.stage,
      status:       String(params.status),
      metadata:     params.metadata,
    });
  } catch {
    // Logging failure must never break the main request
  }
}

// ─────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  const startMs = Date.now();

  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ingestKey   = Deno.env.get('INGEST_API_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Auth ──────────────────────────────────────────────────────
  const authHeader = req.headers.get('authorization') ?? '';
  const headerKey  = req.headers.get('x-ingest-key') ?? '';

  let authType   = 'none';
  let jwtUserId: string | null = null;

  if (ingestKey && headerKey === ingestKey) {
    authType = 'key';
  } else if (authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7);
    const { data: userData, error: authError } = await db.auth.getUser(jwt);
    if (authError || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    authType  = 'jwt';
    jwtUserId = userData.user.id;
  }

  if (authType === 'none') return json({ error: 'Unauthorized' }, 401);

  // ── Parse body ────────────────────────────────────────────────
  const rawBody = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const payloads: Array<Record<string, unknown>> = Array.isArray(body.events)
    ? body.events
    : [body];

  if (!payloads.length) return json({ error: 'No events provided' }, 400);

  // Derive log fields before validation (best-effort — may be absent)
  const firstEvent   = payloads[0] as Record<string, unknown>;
  const retailerKey  = asString(firstEvent.retailer_key) ?? 'unknown';
  const eventUserId  = asString(firstEvent.user_id);
  const logUserId    = jwtUserId ?? eventUserId ?? 'unknown';

  // ── Rate limiting (JWT auth only — API key calls are trusted) ──
  if (authType === 'jwt' && jwtUserId) {
    const { limited, count } = await enforceRateLimit(db, jwtUserId);
    if (limited) {
      await logRequest(db, {
        retailerKey,
        stage:    'error',
        status:   429,
        metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, event_count: payloads.length, rate_limit_count: count },
      });
      return json({ error: 'Rate limit exceeded', retry_after_seconds: 60 }, 429);
    }
  }

  // ── Validate each event ───────────────────────────────────────
  for (let i = 0; i < payloads.length; i++) {
    const validationError = validateEventPayload(payloads[i]);
    if (validationError) {
      const msg = payloads.length === 1 ? validationError : `Event ${i}: ${validationError}`;
      await logRequest(db, {
        retailerKey,
        stage:    'error',
        status:   400,
        metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, event_count: payloads.length, error: msg },
      });
      return json({ error: msg }, 400);
    }
  }

  // ── Process events ────────────────────────────────────────────
  const insertedEvents:   Array<Record<string, unknown>> = [];
  const insertedExposures: Array<Record<string, unknown>> = [];
  const updatedOutcomes:  Array<Record<string, unknown>> = [];

  for (const rawEvent of payloads) {
    const eventName = asString(rawEvent.event_name)!; // validated above
    const sessionId = asString(rawEvent.session_id)!;
    const userId    = asString(rawEvent.user_id);

    if (!userId) {
      await logRequest(db, {
        retailerKey,
        stage:    'error',
        status:   400,
        metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: 'user_id required' },
      });
      return json({ error: 'Each event requires user_id' }, 400);
    }

    const payload = {
      user_id:          userId,
      household_id:     asString(rawEvent.household_id),
      session_id:       sessionId,
      event_name:       eventName,
      timestamp:        asString(rawEvent.timestamp) ?? new Date().toISOString(),
      screen_name:      asString(rawEvent.screen_name),
      object_type:      asString(rawEvent.object_type),
      object_id:        asString(rawEvent.object_id),
      retailer_key:     asString(rawEvent.retailer_key),
      category:         asString(rawEvent.category),
      brand:            asString(rawEvent.brand),
      rank_position:    asInt(rawEvent.rank_position),
      model_version:    asString(rawEvent.model_version),
      explanation_shown: asBoolean(rawEvent.explanation_shown) ?? false,
      metadata:         asJson(rawEvent.metadata),
      context:          asJson(rawEvent.context),
    };

    const isExposure   = eventName === 'RECOMMENDATION_EXPOSED' || typeof rawEvent.recommendation_type === 'string';
    const outcomeStatus = asString(rawEvent.outcome_status);

    try {
      if (isExposure) {
        const objectId = asString(rawEvent.object_id);
        if (!objectId) {
          await logRequest(db, {
            retailerKey,
            stage:    'error',
            status:   400,
            metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: 'recommendation exposure requires object_id' },
          });
          return json({ error: 'recommendation exposures require object_id' }, 400);
        }

        const exposurePayload = {
          user_id:             userId,
          session_id:          sessionId,
          recommendation_type: asString(rawEvent.recommendation_type) ?? 'unknown',
          object_type:         asString(rawEvent.object_type) ?? 'unknown',
          object_id:           objectId,
          rank_position:       asInt(rawEvent.rank_position),
          score:               asInt(rawEvent.score),
          model_version:       asString(rawEvent.model_version),
          explanation:         asString(rawEvent.explanation),
          reason_codes:        Array.isArray(rawEvent.reason_codes) ? rawEvent.reason_codes : [],
          retailer_key:        asString(rawEvent.retailer_key),
          shown_at:            asString(rawEvent.timestamp) ?? new Date().toISOString(),
          outcome_status:      outcomeStatus ?? 'shown',
        };

        const { data, error } = await db.from('recommendation_exposures').insert([exposurePayload]);
        if (error) {
          await logRequest(db, {
            retailerKey,
            stage:    'error',
            status:   500,
            metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: error.message },
          });
          return json({ error: error.message }, 500);
        }
        insertedExposures.push(data?.[0] ?? {});
      }

      if (outcomeStatus && asString(rawEvent.object_id)) {
        const update: Record<string, unknown> = { outcome_status: outcomeStatus };
        if (outcomeStatus === 'clicked')   update.clicked_at   = new Date().toISOString();
        if (outcomeStatus === 'accepted')  update.accepted_at  = new Date().toISOString();
        if (outcomeStatus === 'dismissed') update.dismissed_at = new Date().toISOString();

        const { data, error } = await db
          .from('recommendation_exposures')
          .update(update)
          .eq('user_id', userId)
          .eq('object_id', asString(rawEvent.object_id))
          .limit(1);

        if (error) {
          await logRequest(db, {
            retailerKey,
            stage:    'error',
            status:   500,
            metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: error.message },
          });
          return json({ error: error.message }, 500);
        }
        updatedOutcomes.push(data?.[0] ?? {});
      }

      const { data, error } = await db.from('event_stream').insert([payload]);
      if (error) {
        await logRequest(db, {
          retailerKey,
          stage:    'error',
          status:   500,
          metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: error.message },
        });
        return json({ error: error.message }, 500);
      }
      insertedEvents.push(data?.[0] ?? {});
    } catch (err) {
      await logRequest(db, {
        retailerKey,
        stage:    'error',
        status:   500,
        metadata: { user_id: logUserId, duration_ms: Date.now() - startMs, error: String(err) },
      });
      return json({ error: String(err) }, 500);
    }
  }

  // ── Log success ───────────────────────────────────────────────
  await logRequest(db, {
    retailerKey,
    stage:    'success',
    status:   200,
    metadata: {
      user_id:     logUserId,
      duration_ms: Date.now() - startMs,
      event_count: insertedEvents.length,
    },
  });

  return json({
    status:             'ok',
    inserted_events:    insertedEvents.length,
    inserted_exposures: insertedExposures.length,
    updated_outcomes:   updatedOutcomes.length,
    events:             insertedEvents,
    exposures:          insertedExposures,
    outcomes:           updatedOutcomes,
  });
});
