/**
 * geo-auth-check — IP geolocation drift detection with Email OTP trigger.
 *
 * POST /functions/v1/geo-auth-check
 * Auth: Bearer JWT (user session token)
 *
 * Behaviour:
 *   1. Geolocates the caller's IP via ip-api.com (free, no key required).
 *   2. Loads the user's last_login_geo from profiles.
 *   3. Computes Haversine distance between last and current location.
 *   4. If distance > 50 miles (or no prior record), fires an Email OTP
 *      via supabase.auth.signInWithOtp and returns { otp_required: true }.
 *   5. Writes an entry to geo_auth_logs regardless of outcome.
 *
 * Returns:
 *   { otp_required: false, distance_miles: number }  — location OK
 *   { otp_required: true,  distance_miles: number }  — OTP sent
 *   { otp_required: false, distance_miles: null }    — IP lookup failed (fail-open)
 *
 * Never returns 5xx — on errors, returns otp_required: false (fail-open).
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const GEO_DRIFT_THRESHOLD_MILES = 50;

// ── Haversine distance ─────────────────────────────────────────────────────

function haversineMiles(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R  = 3958.8; // Earth radius in miles
  const dL = ((lat2 - lat1) * Math.PI) / 180;
  const dO = ((lon2 - lon1) * Math.PI) / 180;
  const a  =
    Math.sin(dL / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── IP geolocation (ip-api.com — free tier, no key required) ──────────────

interface GeoResult {
  lat:     number;
  lon:     number;
  city:    string;
  country: string;
  ip:      string;
}

async function geolocateIp(ip: string): Promise<GeoResult | null> {
  try {
    // ip-api.com returns JSON for the queried IP; pass fields to minimise payload
    const resp = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,lat,lon,city,country,query`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    if (data.status !== 'success') return null;
    return {
      lat:     Number(data.lat),
      lon:     Number(data.lon),
      city:    String(data.city    ?? ''),
      country: String(data.country ?? ''),
      ip:      String(data.query   ?? ip),
    };
  } catch {
    return null;
  }
}

// ── Caller IP extraction ───────────────────────────────────────────────────

function callerIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '0.0.0.0'
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Handler ────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405);

  // Auth
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Missing authorization' }, 401);
  const token = authHeader.replace('Bearer ', '').trim();

  const supabaseUrl = Deno.env.get('SUPABASE_URL')              ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfiguration' }, 500);

  const db = createClient(supabaseUrl, serviceKey);

  const { data: { user }, error: authErr } = await db.auth.getUser(token);
  if (authErr || !user) return json({ error: 'Invalid authentication' }, 401);

  try {
    const ip      = callerIp(req);
    const current = await geolocateIp(ip);

    if (!current) {
      // IP lookup failed — fail-open, log the attempt
      await db.from('geo_auth_logs').insert({
        user_id:      user.id,
        ip_address:   ip,
        otp_required: false,
        distance_miles: null,
        reason:       'ip_lookup_failed',
      }).catch(() => {});
      return json({ otp_required: false, distance_miles: null });
    }

    // Load last known location
    const { data: profile } = await db
      .from('profiles')
      .select('last_login_geo')
      .eq('user_id', user.id)
      .maybeSingle();

    const lastGeo = profile?.last_login_geo as {
      lat: number; lon: number; city?: string; country?: string;
    } | null;

    let distanceMiles: number | null = null;
    let otpRequired = false;

    if (lastGeo?.lat != null && lastGeo?.lon != null) {
      distanceMiles = Math.round(
        haversineMiles(lastGeo.lat, lastGeo.lon, current.lat, current.lon),
      );
      if (distanceMiles > GEO_DRIFT_THRESHOLD_MILES) {
        otpRequired = true;
      }
    } else {
      // No prior geo on record — this is the first login; record location, no OTP
      distanceMiles = 0;
    }

    // Update last_login_geo in profiles (best-effort — never block on this)
    db.from('profiles').update({
      last_login_geo: { lat: current.lat, lon: current.lon, city: current.city, country: current.country },
    }).eq('user_id', user.id).catch(() => {});

    // Fire Email OTP if drift detected
    if (otpRequired && user.email) {
      const { error: otpErr } = await db.auth.signInWithOtp({ email: user.email });
      if (otpErr) {
        console.error('[geo-auth-check] OTP send failed:', otpErr.message);
        // Non-fatal — still return otp_required: true so the client shows the prompt
      }
    }

    // Audit log (no PII beyond city/country; no exact coords)
    await db.from('geo_auth_logs').insert({
      user_id:        user.id,
      ip_address:     current.ip,
      city:           current.city,
      country:        current.country,
      otp_required:   otpRequired,
      distance_miles: distanceMiles,
      reason:         otpRequired ? 'geo_drift' : 'ok',
    }).catch(() => {});

    return json({ otp_required: otpRequired, distance_miles: distanceMiles });

  } catch (err) {
    console.error('[geo-auth-check]', err);
    // Fail-open: a broken geo check never locks the user out
    return json({ otp_required: false, distance_miles: null });
  }
});
