import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function asJson(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim().length > 0 && /^-?\d+$/.test(value.trim())) {
    return Number(value.trim());
  }
  return null;
}

function asBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ingestKey = Deno.env.get('INGEST_API_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) {
    return json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const headerKey = req.headers.get('x-ingest-key') ?? '';
  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let authType = 'none';
  if (ingestKey && headerKey === ingestKey) {
    authType = 'key';
  } else if (authHeader.startsWith('Bearer ')) {
    const jwt = authHeader.slice(7);
    const { data: userData, error: authError } = await db.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return json({ error: 'Unauthorized' }, 401);
    }
    authType = 'jwt';
  }

  if (authType === 'none') {
    return json({ error: 'Unauthorized' }, 401);
  }

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

  if (!payloads.length) {
    return json({ error: 'No events provided' }, 400);
  }

  const insertedEvents: Array<Record<string, unknown>> = [];
  const insertedExposures: Array<Record<string, unknown>> = [];
  const updatedOutcomes: Array<Record<string, unknown>> = [];

  for (const rawEvent of payloads) {
    const eventName = asString(rawEvent.event_name);
    const sessionId = asString(rawEvent.session_id);
    const userId = asString(rawEvent.user_id);

    if (!eventName || !sessionId || !userId) {
      return json({ error: 'Each event requires event_name, session_id, and user_id' }, 400);
    }

    const payload = {
      user_id: userId,
      household_id: asString(rawEvent.household_id),
      session_id: sessionId,
      event_name: eventName,
      timestamp: asString(rawEvent.timestamp) ?? new Date().toISOString(),
      screen_name: asString(rawEvent.screen_name),
      object_type: asString(rawEvent.object_type),
      object_id: asString(rawEvent.object_id),
      retailer_key: asString(rawEvent.retailer_key),
      category: asString(rawEvent.category),
      brand: asString(rawEvent.brand),
      rank_position: asInt(rawEvent.rank_position),
      model_version: asString(rawEvent.model_version),
      explanation_shown: asBoolean(rawEvent.explanation_shown) ?? false,
      metadata: asJson(rawEvent.metadata),
      context: asJson(rawEvent.context),
    };

    const isExposure = eventName === 'RECOMMENDATION_EXPOSED' || typeof rawEvent.recommendation_type === 'string';
    const outcomeStatus = asString(rawEvent.outcome_status);

    try {
      if (isExposure) {
        const objectId = asString(rawEvent.object_id);
        if (!objectId) {
          return json({ error: 'recommendation exposures require object_id' }, 400);
        }

        const exposurePayload = {
          user_id: userId,
          session_id: sessionId,
          recommendation_type: asString(rawEvent.recommendation_type) ?? 'unknown',
          object_type: asString(rawEvent.object_type) ?? 'unknown',
          object_id: objectId,
          rank_position: asInt(rawEvent.rank_position),
          score: asInt(rawEvent.score),
          model_version: asString(rawEvent.model_version),
          explanation: asString(rawEvent.explanation),
          reason_codes: Array.isArray(rawEvent.reason_codes) ? rawEvent.reason_codes : [],
          retailer_key: asString(rawEvent.retailer_key),
          shown_at: asString(rawEvent.timestamp) ?? new Date().toISOString(),
          outcome_status: outcomeStatus ?? 'shown',
        };

        const { data, error } = await db.from('recommendation_exposures').insert([exposurePayload]);
        if (error) {
          return json({ error: error.message }, 500);
        }
        insertedExposures.push(data?.[0] ?? {});
      }

      if (outcomeStatus && asString(rawEvent.object_id)) {
        const update: Record<string, unknown> = {
          outcome_status: outcomeStatus,
        };
        if (outcomeStatus === 'clicked') update.clicked_at = new Date().toISOString();
        if (outcomeStatus === 'accepted') update.accepted_at = new Date().toISOString();
        if (outcomeStatus === 'dismissed') update.dismissed_at = new Date().toISOString();

        const { data, error } = await db
          .from('recommendation_exposures')
          .update(update)
          .eq('user_id', userId)
          .eq('object_id', asString(rawEvent.object_id))
          .limit(1);

        if (error) {
          return json({ error: error.message }, 500);
        }

        updatedOutcomes.push(data?.[0] ?? {});
      }

      const { data, error } = await db.from('event_stream').insert([payload]);
      if (error) {
        return json({ error: error.message }, 500);
      }
      insertedEvents.push(data?.[0] ?? {});
    } catch (err) {
      return json({ error: String(err) }, 500);
    }
  }

  return json({
    status: 'ok',
    inserted_events: insertedEvents.length,
    inserted_exposures: insertedExposures.length,
    updated_outcomes: updatedOutcomes.length,
    events: insertedEvents,
    exposures: insertedExposures,
    outcomes: updatedOutcomes,
  });
});
