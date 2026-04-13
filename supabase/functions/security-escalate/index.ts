// supabase/functions/security-escalate/index.ts
// Scheduled job (every 5 minutes via pg_cron).
// Performs: retry failed alerts, escalate high-volume MEDIUM patterns,
//           pipeline health check, expire stale blocks.
// Auth: HMAC-signed OR legacy x-security-token (same as all internal functions)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-sig, x-timestamp, x-security-token',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ─────────────────────────────────────────────────────────────
// HMAC HELPERS
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

async function verifyAuth(req: Request, rawBody: string): Promise<boolean> {
  const hmacSecret = Deno.env.get('INTERNAL_HMAC_SECRET')
  const sig        = req.headers.get('x-ingest-sig')
  const ts         = req.headers.get('x-timestamp')

  if (hmacSecret && sig && ts) {
    const tsNum = Number(ts)
    const now   = Math.floor(Date.now() / 1000)
    if (Math.abs(now - tsNum) > 300) return false

    const expected = await computeHmac(hmacSecret, `${ts}.${rawBody}`)
    if (expected.length !== sig.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i)
    return diff === 0
  }

  const legacySecret = Deno.env.get('SECURITY_INGEST_SECRET')
  const token        = req.headers.get('x-security-token') ??
                       req.headers.get('authorization')?.replace('Bearer ', '')
  return !!(legacySecret && token === legacySecret)
}

// Builds HMAC-signed headers for internal function calls
async function buildInternalHeaders(body: string): Promise<Record<string, string>> {
  const hmacSecret = Deno.env.get('INTERNAL_HMAC_SECRET') ?? Deno.env.get('SECURITY_INGEST_SECRET')!
  const ts         = Math.floor(Date.now() / 1000).toString()
  const sig        = await computeHmac(hmacSecret, `${ts}.${body}`)
  return {
    'Content-Type': 'application/json',
    'x-ingest-sig': sig,
    'x-timestamp':  ts,
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  let rawBody = ''
  try { rawBody = await req.text() } catch { /* GET from pg_cron has no body */ }

  if (!(await verifyAuth(req, rawBody))) {
    console.error('[security-escalate] Unauthorized call')
    return json({ error: 'Unauthorized' }, 401)
  }

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const results: Record<string, unknown> = {}

  // ── 1. Retry failed alerts (≤3 retries, exponential backoff) ──────────────
  const { data: failedAlerts } = await adminClient
    .from('security_alerts')
    .select('id, event_id, retry_count')
    .eq('status', 'FAILED')
    .lt('retry_count', 3)
    .lte('next_retry_at', new Date().toISOString())
    .limit(10)

  let retriedCount = 0
  for (const alert of failedAlerts ?? []) {
    try {
      const body    = JSON.stringify({ event_id: alert.event_id, retry_alert_id: alert.id })
      const headers = await buildInternalHeaders(body)
      await fetch(`${supabaseUrl}/functions/v1/security-alert`, { method: 'POST', headers, body })

      const nextRetryMs = Math.pow(2, alert.retry_count + 1) * 60_000
      await adminClient.from('security_alerts').update({
        retry_count:   alert.retry_count + 1,
        next_retry_at: new Date(Date.now() + nextRetryMs).toISOString(),
      }).eq('id', alert.id)

      retriedCount++
    } catch (e) {
      console.error('[escalate] Retry failed for alert', alert.id, e)
    }
  }
  results.retried_alerts = retriedCount

  // ── 2. Escalate MEDIUM events that hit volume thresholds ───────────────────
  // Fetch unresolved MEDIUM events from last hour, group by event_type in memory
  const { data: mediumEvents } = await adminClient
    .from('security_events')
    .select('event_type, fingerprint')
    .eq('severity', 'MEDIUM')
    .eq('resolved', false)
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
    .limit(500)

  const grouped: Record<string, number> = {}
  for (const row of mediumEvents ?? []) {
    const key = String(row.event_type)
    grouped[key] = (grouped[key] ?? 0) + 1
  }

  let escalatedCount = 0
  for (const [eventType, count] of Object.entries(grouped)) {
    if (count >= 10) {
      const body    = JSON.stringify({
        event_type:    'ESCALATED_VOLUME_PATTERN',
        category:      'MONITORING',
        source_system: 'security-escalate-job',
        summary:       `Event type ${eventType} fired ${count} times in 1h — auto-escalated to HIGH`,
        metadata:      { original_event_type: eventType, count },
        dedupe_window_seconds: 3600,
      })
      const headers = await buildInternalHeaders(body)
      await fetch(`${supabaseUrl}/functions/v1/security-ingest`, { method: 'POST', headers, body })
      escalatedCount++
    }
  }
  results.escalated_patterns = escalatedCount

  // ── 3. Pipeline health check — 0 events in 30 min → dead-man alert ────────
  const { count: recentEventCount } = await adminClient
    .from('security_events')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', new Date(Date.now() - 1_800_000).toISOString())

  if ((recentEventCount ?? 0) === 0) {
    const toEmail   = Deno.env.get('ALERT_TO_EMAIL')  ?? 'ddavis@getsnippd.com'
    const fromEmail = Deno.env.get('ALERT_FROM_EMAIL') ?? 'security@getsnippd.com'
    const apiKey    = Deno.env.get('RESEND_API_KEY')

    if (apiKey) {
      await fetch('https://api.resend.com/emails', {
        method:  'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          from:    fromEmail,
          to:      [toEmail],
          subject: '[HIGH PRIORITY SECURITY ALERT] CRITICAL: Security Pipeline Health Failure',
          text:    'ALERT: The Snippd security monitoring pipeline has not received any events in the past 30 minutes. This may indicate the monitoring system is offline, tampered with, or the app is down. Investigate immediately.',
          html:    '<p style="font-family:system-ui;color:#DC2626;font-weight:bold;">CRITICAL: Security Pipeline Health Failure</p><p>No security events logged in the past 30 minutes. Pipeline may be down or tampered with. Investigate immediately.</p>',
        }),
      })
    }
    results.health_alert_sent  = true
    results.pipeline_healthy   = false
  } else {
    results.pipeline_healthy   = true
    results.recent_event_count = recentEventCount
  }

  // ── 4. Expire stale blocked indicators ────────────────────────────────────
  // Use the expire_blocks() SQL function from sql/08_traffic_monitoring.sql
  const { data: expiredData } = await adminClient.rpc('expire_blocks')
  results.expired_blocks = expiredData ?? 0

  // ── 5. Log cron execution ─────────────────────────────────────────────────
  await adminClient.from('cron_audit_log').insert({
    job_name:   'security-escalate',
    started_at: new Date().toISOString(),
    status:     'success',
    metadata:   results,
  }).then(() => {/* fire and forget */})

  return json({ status: 'complete', results })
})
