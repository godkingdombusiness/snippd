// supabase/functions/security-ingest/index.ts
// Receives security events from the app, internal Edge Functions, and middleware.
// Auth: HMAC-signed requests (internal) OR JWT (app-originated, rate-limited)
// Rate limit: 100 events/min per IP (app), unlimited for HMAC-authenticated callers
// Auto-block: CRITICAL events → 24h IP block + async alert

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

interface SecurityEventPayload {
  event_type:            string
  category:              string
  source_system:         string
  user_id?:              string
  admin_user?:           string
  session_id?:           string
  request_id?:           string
  ip_address?:           string
  geo?:                  Record<string, unknown>
  user_agent?:           string
  device_fingerprint?:   string
  route?:                string
  method?:               string
  status_code?:          number
  resource_type?:        string
  resource_id?:          string
  summary:               string
  metadata?:             Record<string, unknown>
  dedupe_window_seconds?: number
}

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-sig, x-timestamp, x-security-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

// ─────────────────────────────────────────────────────────────
// HMAC AUTH (internal callers: middleware, other Edge Functions)
// ─────────────────────────────────────────────────────────────
async function computeHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Returns 'hmac' | 'jwt' | null
async function authenticateRequest(req: Request, rawBody: string): Promise<'hmac' | 'jwt' | null> {
  const hmacSecret = Deno.env.get('INTERNAL_HMAC_SECRET')
  const sig        = req.headers.get('x-ingest-sig')
  const ts         = req.headers.get('x-timestamp')

  // 1. Try HMAC (internal callers)
  if (hmacSecret && sig && ts) {
    const tsNum = Number(ts)
    const now   = Math.floor(Date.now() / 1000)
    if (Math.abs(now - tsNum) > 300) return null   // stale — replay protection

    const expected = await computeHmac(hmacSecret, `${ts}.${rawBody}`)
    // Constant-time comparison
    if (expected.length === sig.length) {
      let diff = 0
      for (let i = 0; i < expected.length; i++) {
        diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
      }
      if (diff === 0) return 'hmac'
    }
    // HMAC header present but sig invalid → reject immediately (don't fall through)
    return null
  }

  // 2. Legacy bearer token (SECURITY_INGEST_SECRET) — kept for backward compat
  const legacySecret = Deno.env.get('SECURITY_INGEST_SECRET')
  const legacyToken  = req.headers.get('x-security-token') ??
                       req.headers.get('authorization')?.replace('Bearer ', '')
  if (legacySecret && legacyToken === legacySecret) return 'hmac'  // treat as internal

  // 3. JWT (app-originated events — lowest trust, strictly rate-limited)
  const authHeader = req.headers.get('authorization')
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7)
    // Basic JWT structure check — full validation done by Supabase client below
    const parts = token.split('.')
    if (parts.length === 3) return 'jwt'
  }

  return null
}

// ─────────────────────────────────────────────────────────────
// SECRET DETECTION
// ─────────────────────────────────────────────────────────────
const SECRET_PATTERNS: Array<{ label: string; re: RegExp }> = [
  { label: 'JWT_FULL',           re: /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/ },
  { label: 'STRIPE_LIVE_KEY',    re: /sk_live_[A-Za-z0-9]{24,}/ },
  { label: 'AWS_ACCESS_KEY',     re: /AKIA[A-Z0-9]{16}/ },
  { label: 'SERVICE_ROLE_HINT',  re: /service_role/i },
  { label: 'GITHUB_TOKEN',       re: /ghp_[A-Za-z0-9]{36}/ },
  { label: 'PRIVATE_KEY_BLOCK',  re: /-----BEGIN (RSA |EC )?PRIVATE KEY-----/ },
  { label: 'SUPABASE_SECRET',    re: /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[^.]{20,}/ },
]

function detectSecrets(payload: SecurityEventPayload): string | null {
  const haystack = JSON.stringify(payload)
  for (const { label, re } of SECRET_PATTERNS) {
    if (re.test(haystack)) return label
  }
  return null
}

// ─────────────────────────────────────────────────────────────
// SEVERITY RULES ENGINE
// ─────────────────────────────────────────────────────────────
const CRITICAL_TYPES = new Set([
  'SECRET_EXFILTRATION_ATTEMPT',
  'COMMAND_EXECUTION_UNTRUSTED',
  'ADMIN_ACCOUNT_TAKEOVER',
  'MONITORING_TAMPERING',
  'OUTBOUND_ATTACKER_ENDPOINT',
  'PRIVILEGE_ESCALATION_CONFIRMED',
  'REPO_TRUST_BYPASS_CONFIRMED',
  'SHELL_EXECUTION_UNTRUSTED',
  'SERVICE_ROLE_KEY_EXPOSED',
  'MFA_DISABLE_ADMIN',
  'SECRET_DETECTED_IN_PAYLOAD',
])

const HIGH_TYPES = new Set([
  'BRUTE_FORCE_SUCCESS',
  'UNAUTHORIZED_ADMIN_ACCESS',
  'IDOR_CONFIRMED',
  'SQL_INJECTION_ATTEMPT',
  'SUSPICIOUS_ENV_FILE_ACCESS',
  'UNTRUSTED_REPO_CONFIG_OUTBOUND',
  'SUSPICIOUS_PLUGIN_EXECUTION',
  'REPO_TRUST_BYPASS_ATTEMPT',
  'PRIVILEGE_ESCALATION_ATTEMPT',
  'SENSITIVE_EXPORT_EXCESSIVE',
  'COUPON_ABUSE_PATTERN',
  'API_KEY_MASS_FAILURE',
  'SUSPICIOUS_WEBHOOK_CALL',
  'UNAPPROVED_DOMAIN_CALL',
  'SECRET_IN_REQUEST_BODY',
  'REWARD_ABUSE_PATTERN',
  'REFERRAL_FRAUD_CONFIRMED',
])

const MEDIUM_TYPES = new Set([
  'BRUTE_FORCE_IN_PROGRESS',
  'NEW_DEVICE_LOGIN',
  'GEO_ANOMALY',
  'REPEATED_PASSWORD_RESET',
  'REPEATED_401_403',
  'SUSPICIOUS_ADMIN_ROUTE',
  'ROLE_CHANGE',
  'SENSITIVE_RECORD_DELETE',
  'INJECTION_PAYLOAD_SIGNATURE',
  'LARGE_REQUEST_BODY',
  'HIGH_RISK_USER_AGENT',
  'RATE_LIMIT_EVASION',
  'SUSPICIOUS_FILE_UPLOAD',
  'REPO_TRUST_BYPASS_POSSIBLE',
  'UNUSUAL_API_SPIKE',
  'REFERRAL_FRAUD_SUSPECTED',
])

function scoreEvent(payload: SecurityEventPayload, repeatCount: number): {
  severity: Severity
  risk_score: number
  alert_required: boolean
} {
  const et = payload.event_type
  const sc = payload.status_code ?? 0

  let severity: Severity    = 'LOW'
  let risk_score             = 5
  let alert_required         = false

  if (CRITICAL_TYPES.has(et)) {
    severity       = 'CRITICAL'
    risk_score     = 95
    alert_required = true
  } else if (HIGH_TYPES.has(et)) {
    severity       = 'HIGH'
    risk_score     = 75
    alert_required = true
  } else if (MEDIUM_TYPES.has(et)) {
    severity       = 'MEDIUM'
    risk_score     = 45
  }

  // Repeat escalation: MEDIUM×10→HIGH, HIGH×5→CRITICAL
  if (repeatCount >= 10 && severity === 'MEDIUM') {
    severity       = 'HIGH'
    risk_score     = Math.min(risk_score + 25, 90)
    alert_required = true
  }
  if (repeatCount >= 5 && severity === 'HIGH') {
    severity       = 'CRITICAL'
    risk_score     = Math.min(risk_score + 20, 98)
    alert_required = true
  }

  // Boost on brute force + auth failure combo
  if ((sc === 401 || sc === 403) && et.includes('BRUTE')) {
    risk_score = Math.min(risk_score + 10, 98)
  }

  return { severity, risk_score, alert_required }
}

// ─────────────────────────────────────────────────────────────
// FINGERPRINT GENERATION
// ─────────────────────────────────────────────────────────────
async function makeFingerprint(payload: SecurityEventPayload, windowSeconds: number): Promise<string> {
  const windowBucket = Math.floor(Date.now() / 1000 / windowSeconds)
  const raw = [
    payload.event_type,
    payload.user_id    ?? 'anon',
    payload.ip_address ?? 'noip',
    payload.route      ?? 'noroute',
    windowBucket,
  ].join('|')

  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ─────────────────────────────────────────────────────────────
// INPUT SANITISATION
// ─────────────────────────────────────────────────────────────
function sanitise(s: unknown, maxLen = 500): string | undefined {
  if (typeof s !== 'string') return undefined
  return s.replace(/[^\x20-\x7E\n\r\t]/g, '').slice(0, maxLen)
}

// ─────────────────────────────────────────────────────────────
// ALERT TRIGGER (HMAC-signed internal call)
// ─────────────────────────────────────────────────────────────
async function triggerAlert(eventId: string): Promise<void> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const hmacSecret  = Deno.env.get('INTERNAL_HMAC_SECRET') ?? Deno.env.get('SECURITY_INGEST_SECRET')!
    const alertUrl    = `${supabaseUrl}/functions/v1/security-alert`
    const body        = JSON.stringify({ event_id: eventId })
    const ts          = Math.floor(Date.now() / 1000).toString()
    const sig         = await computeHmac(hmacSecret, `${ts}.${body}`)

    fetch(alertUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'x-ingest-sig':  sig,
        'x-timestamp':   ts,
      },
      body,
    }).catch(e => console.error('[security-ingest] Alert trigger failed:', e))
  } catch (e) {
    console.error('[security-ingest] Could not invoke alert function:', e)
  }
}

// ─────────────────────────────────────────────────────────────
// IP RATE LIMIT (app-originated JWT callers only: 100/min)
// ─────────────────────────────────────────────────────────────
const ipMinuteCounters = new Map<string, { count: number; resetAt: number }>()

function checkIpRateLimit(ip: string, maxPerMin: number): boolean {
  const now   = Date.now()
  const entry = ipMinuteCounters.get(ip)

  if (!entry || now > entry.resetAt) {
    ipMinuteCounters.set(ip, { count: 1, resetAt: now + 60_000 })
    return true   // allowed
  }

  entry.count++
  if (entry.count > maxPerMin) return false  // blocked

  return true
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // Read body once — needed for both HMAC verification and JSON parsing
  let rawBody: string
  try {
    rawBody = await req.text()
  } catch {
    return json({ error: 'Could not read request body' }, 400)
  }

  // ── 1. Authentication ──────────────────────────────────────────────────────
  const authType = await authenticateRequest(req, rawBody)
  if (!authType) {
    console.error('[security-ingest] Unauthorized ingest attempt from', req.headers.get('cf-connecting-ip') ?? 'unknown')
    return json({ error: 'Unauthorized' }, 401)
  }

  // ── 2. Parse payload ───────────────────────────────────────────────────────
  let payload: SecurityEventPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // ── 3. Required field validation ───────────────────────────────────────────
  if (!payload.event_type || !payload.category || !payload.source_system || !payload.summary) {
    return json({ error: 'Missing required fields: event_type, category, source_system, summary' }, 400)
  }

  // Sanitise freeform fields
  payload.summary    = sanitise(payload.summary, 1000) ?? 'No summary'
  payload.route      = sanitise(payload.route, 500)
  payload.user_agent = sanitise(payload.user_agent, 500)
  payload.event_type = sanitise(payload.event_type, 100) ?? payload.event_type
  payload.summary    = payload.summary.slice(0, 1000)

  // ── 4. IP rate limit (app JWT callers only) ────────────────────────────────
  const clientIp = payload.ip_address ??
                   req.headers.get('cf-connecting-ip') ??
                   req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
                   'unknown'

  if (authType === 'jwt') {
    if (!checkIpRateLimit(clientIp, 100)) {
      return json({ error: 'Rate limit exceeded' }, 429)
    }
  }

  // Normalise IP onto payload
  if (!payload.ip_address) payload.ip_address = clientIp

  // ── 5. Secret detection ────────────────────────────────────────────────────
  const secretLabel = detectSecrets(payload)
  if (secretLabel) {
    // Elevate event type and scrub the metadata so we don't store the secret
    payload.event_type = 'SECRET_DETECTED_IN_PAYLOAD'
    payload.summary    = `Secret pattern detected in ingest payload: ${secretLabel}`
    payload.metadata   = { original_event_type: payload.event_type, detected_pattern: secretLabel }
  }

  // ── 6. Admin client (service role — server-side only) ─────────────────────
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const env           = Deno.env.get('ENVIRONMENT') ?? 'production'
  const windowSeconds = payload.dedupe_window_seconds ?? 300

  // ── 7. Block check via should_block_request ────────────────────────────────
  if (payload.ip_address) {
    const { data: blockData } = await adminClient.rpc('should_block_request', {
      p_ip:      payload.ip_address,
      p_user_id: payload.user_id ?? null,
    })

    const blockRow = Array.isArray(blockData) ? blockData[0] : blockData
    if (blockRow?.should_block) {
      // Accept silently — don't tell attacker they're blocked
      return json({ status: 'accepted', suppressed: true }, 200)
    }
  }

  // ── 8. Deduplication ──────────────────────────────────────────────────────
  const fingerprint  = await makeFingerprint(payload, windowSeconds)
  const { data: repeatCount } = await adminClient.rpc('count_events_in_window', {
    p_event_type:     payload.event_type,
    p_fingerprint:    fingerprint,
    p_window_seconds: windowSeconds,
  })

  const count = Number(repeatCount ?? 0)

  // ── 9. Severity scoring ────────────────────────────────────────────────────
  const { severity, risk_score, alert_required } = scoreEvent(payload, count)

  // Suppress duplicate LOW/MEDIUM within dedup window (after scoring, so escalation still fires)
  if (count > 0 && (severity === 'LOW' || severity === 'MEDIUM')) {
    return json({ status: 'deduplicated', fingerprint, count }, 200)
  }

  // ── 10. Insert event ───────────────────────────────────────────────────────
  const { data: event, error: insertError } = await adminClient
    .from('security_events')
    .insert({
      event_type:            payload.event_type,
      category:              payload.category,
      severity,
      risk_score,
      source_system:         payload.source_system,
      environment:           env,
      user_id:               payload.user_id              ?? null,
      admin_user:            payload.admin_user            ?? null,
      session_id:            payload.session_id            ?? null,
      request_id:            payload.request_id            ?? null,
      ip_address:            payload.ip_address            ?? null,
      geo:                   payload.geo                   ?? null,
      user_agent:            payload.user_agent            ?? null,
      device_fingerprint:    payload.device_fingerprint    ?? null,
      route:                 payload.route                 ?? null,
      method:                payload.method                ?? null,
      status_code:           payload.status_code           ?? null,
      resource_type:         payload.resource_type         ?? null,
      resource_id:           payload.resource_id           ?? null,
      summary:               payload.summary,
      metadata:              payload.metadata              ?? {},
      fingerprint,
      dedupe_window_seconds: windowSeconds,
      alert_required,
    })
    .select('id, severity, alert_required')
    .single()

  if (insertError || !event) {
    console.error('[security-ingest] Insert error:', insertError)
    return json({ error: 'Failed to record event' }, 500)
  }

  // ── 11. Auto-block for CRITICAL IPs (24h) ─────────────────────────────────
  if (severity === 'CRITICAL' && payload.ip_address) {
    await adminClient.from('blocked_indicators').upsert({
      indicator_type:  'IP',
      indicator_value: payload.ip_address,
      reason:          `Auto-blocked: ${payload.event_type}`,
      severity:        'CRITICAL',
      source_event_id: event.id,
      expires_at:      new Date(Date.now() + 86_400_000).toISOString(),  // 24h
      is_active:       true,
    }, { onConflict: 'indicator_type,indicator_value', ignoreDuplicates: false })
  }

  // ── 12. Record traffic metric (fire-and-forget) ────────────────────────────
  adminClient.rpc('record_request_metric', {
    p_ip:        payload.ip_address ?? 'unknown',
    p_user_id:   payload.user_id    ?? null,
    p_route:     '/security-ingest',
    p_status:    200,
    p_device_fp: payload.device_fingerprint ?? null,
  }).catch(() => {/* non-critical */})

  // ── 13. Trigger HMAC-signed alert for HIGH / CRITICAL ─────────────────────
  if (alert_required) {
    await triggerAlert(event.id)
  }

  return json({
    status:        'recorded',
    event_id:      event.id,
    severity,
    risk_score,
    alert_required,
    fingerprint,
    repeat_count:  count,
  })
})
