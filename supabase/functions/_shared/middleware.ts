// supabase/functions/_shared/middleware.ts
// Production-grade security middleware for all Snippd Edge Functions
// Usage: import { requireAuth, checkRateLimit, ... } from '../_shared/middleware.ts'

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────
export interface RequestContext {
  userId: string
  userEmail?: string
  jwt: string
  ip: string
  userAgent: string
  deviceFp: string | null
  correlationId: string
  isElevated: boolean
  route: string
}

export interface SecurityError extends Error {
  status: number
  code: string
}

// ─────────────────────────────────────────────────────────────
// SUPABASE CLIENT FACTORIES
// ─────────────────────────────────────────────────────────────
export function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export function getPublicClient(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!
  )
}

// ─────────────────────────────────────────────────────────────
// ERROR FACTORIES
// ─────────────────────────────────────────────────────────────
function makeError(msg: string, status: number, code: string): SecurityError {
  const e = new Error(msg) as SecurityError
  e.status = status
  e.code = code
  return e
}
export const unauthorizedError   = (m: string) => makeError(m, 401, 'UNAUTHORIZED')
export const forbiddenError      = (m: string) => makeError(m, 403, 'FORBIDDEN')
export const badRequestError     = (m: string) => makeError(m, 400, 'BAD_REQUEST')
export const rateLimitError      = (m: string) => makeError(m, 429, 'RATE_LIMITED')
export const serviceUnavailError = (m: string) => makeError(m, 503, 'SERVICE_UNAVAILABLE')
export const serverError         = (m: string) => makeError(m, 500, 'SERVER_ERROR')

// ─────────────────────────────────────────────────────────────
// SAFE ERROR RESPONSE
// Never leak internal details to the client
// ─────────────────────────────────────────────────────────────
export function safeErrorResponse(e: unknown, correlationId: string): Response {
  const err = e as SecurityError
  const status = err.status ?? 500
  const code = err.code ?? 'INTERNAL_ERROR'

  // Safe messages per status class — never expose stack traces or DB errors
  const safeMessages: Record<number, string> = {
    400: 'Invalid request.',
    401: 'Authentication required.',
    403: 'Access denied.',
    429: 'Too many requests. Please slow down.',
    503: 'Service temporarily unavailable.',
    500: 'An internal error occurred.'
  }

  return Response.json({
    error: safeMessages[status] ?? 'An error occurred.',
    code,
    correlation_id: correlationId
  }, {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

// ─────────────────────────────────────────────────────────────
// EXTRACT REQUEST METADATA
// ─────────────────────────────────────────────────────────────
export function extractRequestMeta(req: Request, route: string): Pick<RequestContext, 'ip' | 'userAgent' | 'deviceFp' | 'correlationId' | 'route'> {
  const ip = (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    req.headers.get('x-real-ip') ??
    '0.0.0.0'
  ).replace(/[^0-9.:\[\]]/g, '').substring(0, 45)  // sanitize

  const userAgent = (req.headers.get('user-agent') ?? 'unknown').substring(0, 256)
  const deviceFp  = req.headers.get('x-device-fp')?.substring(0, 128) ?? null
  const correlationId = crypto.randomUUID()

  return { ip, userAgent, deviceFp, correlationId, route }
}

// ─────────────────────────────────────────────────────────────
// AUTH: Verify Supabase JWT
// ─────────────────────────────────────────────────────────────
export async function requireAuth(req: Request, adminClient: SupabaseClient): Promise<RequestContext> {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) throw unauthorizedError('Missing or invalid Authorization header')

  const jwt = authHeader.slice(7)
  const { data: { user }, error } = await adminClient.auth.getUser(jwt)
  if (error || !user) throw unauthorizedError('Invalid or expired JWT')

  const meta = extractRequestMeta(req, req.url)
  return {
    userId: user.id,
    userEmail: user.email,
    jwt,
    isElevated: false,
    ...meta
  }
}

// ─────────────────────────────────────────────────────────────
// STEP-UP AUTH: Validate elevated session token
// ─────────────────────────────────────────────────────────────
export async function requireStepUp(
  req: Request,
  ctx: RequestContext,
  action: string,
  adminClient: SupabaseClient
): Promise<void> {
  const token = req.headers.get('x-step-up-token')
  if (!token) throw forbiddenError('Step-up authentication is required for this action')

  const { data } = await adminClient.rpc('consume_elevated_session', {
    p_token: token,
    p_user_id: ctx.userId,
    p_action: action
  })

  if (!data) throw forbiddenError('Invalid, expired, or already-used step-up token')
  ctx.isElevated = true
}

// ─────────────────────────────────────────────────────────────
// RATE LIMITING: Per-user and per-IP sliding window
// ─────────────────────────────────────────────────────────────
export async function checkRateLimit(
  adminClient: SupabaseClient,
  ctx: { userId?: string; ip: string; route: string },
  config: { maxPerUser?: number; maxPerIp: number; windowSecs: number }
): Promise<void> {
  const checks: Array<Promise<{ data: boolean | null }>> = []

  // IP-level check (always)
  checks.push(adminClient.rpc('check_rate_limit', {
    p_key: `ip:${ctx.ip}`,
    p_endpoint: ctx.route,
    p_max: config.maxPerIp,
    p_window_secs: config.windowSecs
  }))

  // User-level check (if authenticated)
  if (ctx.userId && config.maxPerUser) {
    checks.push(adminClient.rpc('check_rate_limit', {
      p_key: `user:${ctx.userId}`,
      p_endpoint: ctx.route,
      p_max: config.maxPerUser,
      p_window_secs: config.windowSecs
    }))
  }

  const results = await Promise.all(checks)
  for (const { data } of results) {
    if (data === false) throw rateLimitError('Rate limit exceeded')
  }
}

// ─────────────────────────────────────────────────────────────
// TIMESTAMP VALIDATION: Reject stale or future requests
// ─────────────────────────────────────────────────────────────
export function validateTimestamp(ts: string, maxSkewMs = 300_000): void {
  if (!ts) throw badRequestError('request_timestamp is required')
  const requestTime = new Date(ts).getTime()
  if (isNaN(requestTime)) throw badRequestError('Invalid request_timestamp format')
  const skew = Math.abs(Date.now() - requestTime)
  if (skew > maxSkewMs) throw badRequestError(`Request timestamp outside allowed window (skew: ${Math.round(skew / 1000)}s, max: ${maxSkewMs / 1000}s)`)
}

// ─────────────────────────────────────────────────────────────
// IDEMPOTENCY: Check + store processed request
// ─────────────────────────────────────────────────────────────
export async function withIdempotency<T>(
  adminClient: SupabaseClient,
  idempotencyKey: string,
  endpoint: string,
  userId: string,
  requestBody: unknown,
  handler: () => Promise<T>
): Promise<{ result: T; cached: boolean }> {
  // Validate key format (must be UUID v4)
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idempotencyKey)) {
    throw badRequestError('idempotency_key must be a valid UUID v4')
  }

  // Check for existing processed request
  const { data: existing } = await adminClient
    .from('processed_requests')
    .select('response_body, response_status, expires_at')
    .eq('idempotency_key', idempotencyKey)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing && new Date(existing.expires_at) > new Date()) {
    return { result: existing.response_body as T, cached: true }
  }

  // Compute request hash
  const bodyStr = JSON.stringify(requestBody)
  const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`POST:${endpoint}:${bodyStr}`))
  const requestHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  // Execute the handler
  const result = await handler()

  // Store as processed (fire-and-forget — don't block response)
  adminClient.from('processed_requests').insert({
    idempotency_key: idempotencyKey,
    endpoint,
    user_id: userId,
    request_hash: requestHash,
    response_status: 200,
    response_body: result
  }).then(() => {}).catch(console.error)

  return { result, cached: false }
}

// ─────────────────────────────────────────────────────────────
// KILL SWITCH: Check feature flag before proceeding
// ─────────────────────────────────────────────────────────────
export async function requireFeatureEnabled(
  adminClient: SupabaseClient,
  flagName: string
): Promise<void> {
  const { data } = await adminClient
    .from('feature_flags')
    .select('enabled')
    .eq('flag_name', flagName)
    .maybeSingle()

  if (!data?.enabled) {
    throw serviceUnavailError(`Feature '${flagName}' is temporarily disabled`)
  }
}

// ─────────────────────────────────────────────────────────────
// BLOCKED REQUEST CHECK: IP + User block status
// ─────────────────────────────────────────────────────────────
export async function checkBlocked(
  adminClient: SupabaseClient,
  ip: string,
  userId?: string
): Promise<void> {
  const { data } = await adminClient.rpc('should_block_request', {
    p_ip: ip,
    p_user_id: userId ?? null
  })

  if (data?.[0]?.should_block) {
    const reason = data[0].reason
    await logSecurityEvent(adminClient, {
      event_type: 'BLOCKED_REQUEST_ATTEMPT',
      category: 'ACCESS_CONTROL',
      severity: 'HIGH',
      ip_address: ip,
      user_id: userId,
      summary: `Request blocked: ${reason}`,
      metadata: { reason, enforcement: data[0].enforcement }
    })
    throw forbiddenError('Access denied')
  }
}

// ─────────────────────────────────────────────────────────────
// TRAFFIC METRICS: Record request (fire-and-forget)
// ─────────────────────────────────────────────────────────────
export function recordRequestMetric(
  adminClient: SupabaseClient,
  ip: string,
  userId: string | null,
  route: string,
  statusCode: number,
  deviceFp?: string | null
): void {
  // Fire and forget — never block the response
  adminClient.rpc('record_request_metric', {
    p_ip: ip,
    p_user_id: userId ?? null,
    p_route: route,
    p_status: statusCode,
    p_device_fp: deviceFp ?? null
  }).then(() => {}).catch(() => {})
}

// ─────────────────────────────────────────────────────────────
// SECURITY EVENT LOGGING
// ─────────────────────────────────────────────────────────────
export interface SecurityEventPayload {
  event_type: string
  category: string
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  ip_address?: string
  user_id?: string
  route?: string
  summary: string
  metadata?: Record<string, unknown>
  source_system?: string
  environment?: string
}

export async function logSecurityEvent(
  adminClient: SupabaseClient,
  payload: SecurityEventPayload
): Promise<void> {
  // Generate fingerprint for dedup
  const windowBucket = Math.floor(Date.now() / 300_000)  // 5-min window
  const fpStr = `${payload.event_type}|${payload.user_id ?? ''}|${payload.ip_address ?? ''}|${payload.route ?? ''}|${windowBucket}`
  const fpBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(fpStr))
  const fingerprint = Array.from(new Uint8Array(fpBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

  try {
    await adminClient.from('security_events').insert({
      event_type: payload.event_type,
      category: payload.category,
      severity: payload.severity,
      source_system: payload.source_system ?? 'edge-function',
      environment: payload.environment ?? Deno.env.get('ENVIRONMENT') ?? 'production',
      user_id: payload.user_id ?? null,
      ip_address: payload.ip_address ?? null,
      route: payload.route ?? null,
      summary: payload.summary.substring(0, 500),
      metadata: payload.metadata ?? {},
      fingerprint,
      alert_required: ['HIGH', 'CRITICAL'].includes(payload.severity)
    })

    // Async alert for HIGH/CRITICAL
    if (['HIGH', 'CRITICAL'].includes(payload.severity)) {
      const alertUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/security-alert`
      const hmacSecret = Deno.env.get('SECURITY_INGEST_SECRET')!
      const ts = Date.now().toString()
      const body = JSON.stringify({ event_type: payload.event_type, severity: payload.severity, ...payload })
      const sig = await computeHmac(hmacSecret, `${ts}.${body}`)

      fetch(alertUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-ingest-sig': sig,
          'x-timestamp': ts
        },
        body
      }).catch(() => {})  // fire-and-forget, never block
    }
  } catch {
    // Security logging must never crash the main request
  }
}

// ─────────────────────────────────────────────────────────────
// HMAC: Sign and verify internal function-to-function requests
// ─────────────────────────────────────────────────────────────
export async function computeHmac(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export async function verifyHmac(req: Request, secret: string): Promise<string> {
  const sig = req.headers.get('x-ingest-sig')
  const ts  = req.headers.get('x-timestamp')
  if (!sig || !ts) throw unauthorizedError('Missing HMAC signature headers')

  const body = await req.text()
  const expected = await computeHmac(secret, `${ts}.${body}`)

  if (sig !== expected) throw unauthorizedError('Invalid HMAC signature')

  // Also validate timestamp freshness (±5 min)
  validateTimestamp(new Date(parseInt(ts)).toISOString())
  return body  // return body since we consumed the stream
}

// ─────────────────────────────────────────────────────────────
// GUARDED FETCH: Only allow calls to approved domains
// ─────────────────────────────────────────────────────────────
export async function guardedFetch(
  url: string,
  opts: RequestInit,
  adminClient: SupabaseClient
): Promise<Response> {
  const domain = new URL(url).hostname

  const { data } = await adminClient
    .from('approved_domains')
    .select('domain')
    .eq('domain', domain)
    .eq('active', true)
    .maybeSingle()

  if (!data) {
    // Log the attempt
    await logSecurityEvent(adminClient, {
      event_type: 'UNAPPROVED_DOMAIN_CALL',
      category: 'EXFILTRATION',
      severity: 'HIGH',
      summary: `Attempted outbound call to unapproved domain: ${domain}`,
      metadata: { domain, url: url.substring(0, 200) }
    })
    throw forbiddenError(`Outbound call to unapproved domain blocked: ${domain}`)
  }

  return fetch(url, opts)
}

// ─────────────────────────────────────────────────────────────
// INPUT SANITIZATION
// ─────────────────────────────────────────────────────────────
const INJECTION_PATTERNS = [
  /union\s+select/i,
  /drop\s+table/i,
  /<script[\s>]/i,
  /javascript:/i,
  /\.\.\//g,
  /exec\s*\(/i,
  /\$\{jndi:/i,  // Log4Shell
]

export function sanitizeInput(value: string, maxLen = 1000): string {
  if (typeof value !== 'string') return ''
  const cleaned = value.replace(/[^\x20-\x7E\n\r\t]/g, '').substring(0, maxLen)

  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(cleaned)) {
      // Don't throw — let logSecurityEvent be called by caller
      throw badRequestError('Input contains disallowed content')
    }
  }
  return cleaned
}

export function sanitizeObject(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => [
      k,
      typeof v === 'string' ? sanitizeInput(v) : v
    ])
  )
}

// ─────────────────────────────────────────────────────────────
// SPIKE DETECTION: Check if a route is spiking
// ─────────────────────────────────────────────────────────────
export async function checkForSpike(
  adminClient: SupabaseClient,
  route: string,
  windowSecs = 60
): Promise<void> {
  const { data } = await adminClient.rpc('detect_route_spike', {
    p_route: route,
    p_window_secs: windowSecs
  })

  const spike = data?.[0]
  if (spike?.is_spike) {
    // Log anomaly alert
    await adminClient.from('anomaly_alerts').insert({
      alert_type: `${route.replace(/\//g, '_')}_spike`,
      severity: spike.severity,
      route,
      observed_value: spike.observed,
      threshold_value: spike.threshold,
      metadata: { window_secs: windowSecs }
    })

    // Fire security event for HIGH/CRITICAL spikes
    if (['high', 'critical'].includes(spike.severity)) {
      await logSecurityEvent(adminClient, {
        event_type: 'ROUTE_TRAFFIC_SPIKE',
        category: 'ABUSE',
        severity: spike.severity.toUpperCase() as 'HIGH' | 'CRITICAL',
        route,
        summary: `Traffic spike on ${route}: ${spike.observed} requests vs threshold ${spike.threshold}`,
        metadata: { observed: spike.observed, threshold: spike.threshold, window_secs: windowSecs }
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────
// CORS HEADERS
// ─────────────────────────────────────────────────────────────
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://getsnippd.com',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-device-fp, x-step-up-token, idempotency-key',
  'Access-Control-Max-Age': '86400'
}

export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  return null
}
