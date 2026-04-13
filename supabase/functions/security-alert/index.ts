// supabase/functions/security-alert/index.ts
// Fetches event details, applies cooldown logic, sends email via Resend, logs delivery.
// Auth: HMAC-signed requests (x-ingest-sig + x-timestamp) OR legacy x-security-token
// Called by: security-ingest, security-escalate, traffic-guard

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-sig, x-timestamp, x-security-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ─────────────────────────────────────────────────────────────
// HMAC AUTH
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

  // 1. HMAC (preferred)
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

  // 2. Legacy bearer token fallback
  const legacySecret = Deno.env.get('SECURITY_INGEST_SECRET')
  const token        = req.headers.get('x-security-token') ??
                       req.headers.get('authorization')?.replace('Bearer ', '')
  return !!(legacySecret && token === legacySecret)
}

// ─────────────────────────────────────────────────────────────
// COOLDOWN WINDOWS (seconds)
// ─────────────────────────────────────────────────────────────
const COOLDOWN: Record<string, number> = {
  LOW:      86400,  // 24h — not emailed
  MEDIUM:   3600,   // 1h
  HIGH:     300,    // 5 min
  CRITICAL: 60,     // 1 min
}

// ─────────────────────────────────────────────────────────────
// EMAIL BUILDERS
// ─────────────────────────────────────────────────────────────
const NEXT_STEPS: Record<string, string> = {
  BRUTE_FORCE_IN_PROGRESS:      'Check the user account. Consider temporary lockout or IP block.',
  BRUTE_FORCE_SUCCESS:          'IMMEDIATELY reset user session and credentials. Review access logs.',
  SECRET_EXFILTRATION_ATTEMPT:  'EMERGENCY: Rotate ALL secrets immediately. Isolate affected system.',
  SECRET_DETECTED_IN_PAYLOAD:   'EMERGENCY: Identify which secret was exposed and rotate it immediately.',
  ADMIN_ACCOUNT_TAKEOVER:       'EMERGENCY: Disable admin account, revoke all sessions. Investigate.',
  COMMAND_EXECUTION_UNTRUSTED:  'EMERGENCY: Isolate workstation. Audit all executed commands.',
  UNAUTHORIZED_ADMIN_ACCESS:    'Review admin access logs. Consider MFA enforcement.',
  IDOR_CONFIRMED:               'Audit access control logic for this resource type immediately.',
  MONITORING_TAMPERING:         'EMERGENCY: Verify alert system integrity. Escalate to incident team.',
  REPO_TRUST_BYPASS_ATTEMPT:    'Review and revoke repo access. Audit project configuration files.',
  SUSPICIOUS_ENV_FILE_ACCESS:   'Rotate any potentially exposed credentials immediately.',
  PRIVILEGE_ESCALATION_ATTEMPT: 'Audit role assignments. Verify authorization logic.',
  COUPON_ABUSE_PATTERN:         'Review user account for fraudulent activity. Consider suspension.',
  REWARD_ABUSE_PATTERN:         'Freeze the user account and audit their reward claim history.',
  REFERRAL_FRAUD_CONFIRMED:     'Block user and reverse any pending credit rewards.',
  ESCALATED_VOLUME_PATTERN:     'High event volume detected — review pattern and consider IP block.',
  DEFAULT:                      'Review event details and metadata. Investigate affected user and IP.',
}

function buildEmailHtml(event: Record<string, unknown>): string {
  const sev      = String(event.severity)
  const sevColor = sev === 'CRITICAL' ? '#DC2626' : sev === 'HIGH' ? '#D97706' : '#3B82F6'
  const ts       = new Date(String(event.created_at)).toLocaleString('en-US', { timeZone: 'America/New_York' })
  const rec      = NEXT_STEPS[String(event.event_type)] ?? NEXT_STEPS.DEFAULT
  const meta     = JSON.stringify(event.metadata ?? {}, null, 2).slice(0, 800)

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><title>Security Alert</title></head>
<body style="margin:0;padding:0;font-family:system-ui,sans-serif;background:#f4f4f5;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center" style="padding:32px 16px;">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
  <tr><td style="background:${sevColor};padding:24px 32px;">
    <p style="margin:0;color:rgba(255,255,255,0.8);font-size:11px;letter-spacing:2px;font-weight:700;">[HIGH PRIORITY SECURITY ALERT]</p>
    <h1 style="margin:8px 0 0;color:#fff;font-size:22px;font-weight:800;">${String(event.event_type).replace(/_/g,' ')}</h1>
    <span style="display:inline-block;margin-top:10px;background:rgba(255,255,255,0.2);color:#fff;border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;">${sev}</span>
  </td></tr>
  <tr><td style="padding:32px;">
    <table width="100%" cellpadding="8" cellspacing="0" style="background:#f9fafb;border-radius:8px;margin-bottom:24px;">
      <tr>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">CATEGORY</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${event.category}</p></td>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">RISK SCORE</p><p style="margin:4px 0 0;font-weight:700;color:${sevColor};">${event.risk_score} / 100</p></td>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">ENVIRONMENT</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${event.environment}</p></td>
      </tr>
      <tr>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">TIMESTAMP (ET)</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${ts}</p></td>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">IP ADDRESS</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${event.ip_address ?? 'Unknown'}</p></td>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">SOURCE</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${event.source_system}</p></td>
      </tr>
      <tr>
        <td colspan="2"><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">USER ID</p><p style="margin:4px 0 0;font-weight:700;color:#111827;">${event.user_id ?? 'Anonymous'}</p></td>
        <td><p style="margin:0;font-size:10px;color:#6b7280;font-weight:700;letter-spacing:1px;">ROUTE</p><p style="margin:4px 0 0;font-weight:700;color:#111827;font-size:12px;">${event.route ?? '—'}</p></td>
      </tr>
    </table>
    <h3 style="color:#111827;font-size:14px;margin:0 0 8px;font-weight:700;letter-spacing:0.5px;">SUMMARY</h3>
    <p style="margin:0 0 24px;color:#374151;line-height:1.6;">${event.summary}</p>
    <div style="background:#fefce8;border-left:4px solid #f59e0b;padding:16px;border-radius:0 8px 8px 0;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:11px;font-weight:700;color:#92400e;letter-spacing:1px;">RECOMMENDED NEXT STEP</p>
      <p style="margin:0;color:#78350f;font-weight:600;">${rec}</p>
    </div>
    <h3 style="color:#111827;font-size:14px;margin:0 0 8px;font-weight:700;letter-spacing:0.5px;">RAW METADATA</h3>
    <pre style="background:#f1f5f9;padding:16px;border-radius:8px;font-size:12px;overflow:auto;color:#1e293b;white-space:pre-wrap;">${meta}</pre>
    <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;">Event ID: ${event.id} · Alert sent by Snippd Security Engine</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}

function buildEmailText(event: Record<string, unknown>): string {
  return `[HIGH PRIORITY SECURITY ALERT]

Event: ${event.event_type}
Severity: ${event.severity}
Risk Score: ${event.risk_score}/100
Category: ${event.category}
Environment: ${event.environment}
Timestamp: ${event.created_at}
IP Address: ${event.ip_address ?? 'Unknown'}
User ID: ${event.user_id ?? 'Anonymous'}
Route: ${event.route ?? '—'}
Source: ${event.source_system}

Summary:
${event.summary}

Metadata:
${JSON.stringify(event.metadata ?? {}, null, 2).slice(0, 500)}

Event ID: ${event.id}
— Snippd Security Engine`
}

// ─────────────────────────────────────────────────────────────
// RESEND SENDER
// ─────────────────────────────────────────────────────────────
async function sendViaResend(opts: {
  to: string; from: string; subject: string; html: string; text: string
}): Promise<{ success: boolean; messageId?: string; httpStatus: number; body: unknown }> {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  if (!apiKey) throw new Error('RESEND_API_KEY not configured')

  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ from: opts.from, to: [opts.to], subject: opts.subject, html: opts.html, text: opts.text }),
  })

  const body = await res.json().catch(() => ({}))
  return { success: res.ok, messageId: (body as Record<string, string>)?.id, httpStatus: res.status, body }
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // Auth
  let rawBody: string
  try { rawBody = await req.text() } catch { return json({ error: 'Could not read body' }, 400) }

  if (!(await verifyAuth(req, rawBody))) {
    console.error('[security-alert] Unauthorized call')
    return json({ error: 'Unauthorized' }, 401)
  }

  const { event_id, retry_alert_id } = JSON.parse(rawBody) as { event_id?: string; retry_alert_id?: string }
  if (!event_id) return json({ error: 'event_id required' }, 400)

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  )

  // Fetch event
  const { data: event, error: evErr } = await adminClient
    .from('security_events')
    .select('*')
    .eq('id', event_id)
    .single()

  if (evErr || !event) return json({ error: 'Event not found' }, 404)

  const severity: string = event.severity
  if (severity === 'LOW') return json({ status: 'skipped', reason: 'LOW severity not emailed' })

  // Cooldown check
  const cooldownSecs = COOLDOWN[severity] ?? 300
  const since        = new Date(Date.now() - cooldownSecs * 1000).toISOString()

  const { data: recentAlert } = await adminClient
    .from('security_alerts')
    .select('id, sent_at, status')
    .eq('event_id', event_id)
    .in('status', ['SENT', 'PENDING'])
    .gte('created_at', since)
    .limit(1)
    .maybeSingle()

  if (recentAlert && !retry_alert_id) {
    return json({ status: 'suppressed', reason: 'Cooldown active', cooldown_seconds: cooldownSecs })
  }

  // Build email
  const toEmail   = Deno.env.get('ALERT_TO_EMAIL')  ?? 'ddavis@getsnippd.com'
  const fromEmail = Deno.env.get('ALERT_FROM_EMAIL') ?? 'security@getsnippd.com'
  const subject   = `[HIGH PRIORITY SECURITY ALERT] ${severity}: ${String(event.event_type).replace(/_/g,' ')} — ${Deno.env.get('ENVIRONMENT') ?? 'production'}`
  const html      = buildEmailHtml(event)
  const text      = buildEmailText(event)

  // Create or find alert record
  let alertId = retry_alert_id
  if (!alertId) {
    const { data: newAlert } = await adminClient
      .from('security_alerts')
      .insert({
        event_id:        event_id,
        severity:        event.severity,
        status:          'PENDING',
        recipient_email: toEmail,
        subject,
        body_html:       html,
        body_text:       text,
        provider:        'resend',
      })
      .select('id')
      .single()
    alertId = newAlert?.id
  }

  if (!alertId) return json({ error: 'Failed to create alert record' }, 500)

  // Send email
  const t0 = Date.now()
  let result: Awaited<ReturnType<typeof sendViaResend>>

  try {
    result = await sendViaResend({ to: toEmail, from: fromEmail, subject, html, text })
  } catch (e) {
    const errMsg = String(e)
    await adminClient.from('alert_deliveries').insert({
      alert_id:       alertId,
      attempt_number: 1,
      success:        false,
      provider:       'resend',
      error_message:  errMsg,
      duration_ms:    Date.now() - t0,
    })
    await adminClient.from('security_alerts').update({
      status:         'FAILED',
      failed_at:      new Date().toISOString(),
      failure_reason: errMsg,
      retry_count:    1,
      next_retry_at:  new Date(Date.now() + 60_000).toISOString(),
    }).eq('id', alertId)
    return json({ error: 'Send failed', detail: errMsg }, 500)
  }

  // Log delivery
  await adminClient.from('alert_deliveries').insert({
    alert_id:             alertId,
    attempt_number:       1,
    success:              result.success,
    provider:             'resend',
    provider_message_id:  result.messageId,
    http_status:          result.httpStatus,
    response_body:        result.body as Record<string, unknown>,
    duration_ms:          Date.now() - t0,
  })

  // Update alert record
  await adminClient.from('security_alerts').update(
    result.success
      ? { status: 'SENT', sent_at: new Date().toISOString(), provider_message_id: result.messageId, provider_response: result.body as Record<string, unknown> }
      : { status: 'FAILED', failed_at: new Date().toISOString(), failure_reason: JSON.stringify(result.body), retry_count: 1, next_retry_at: new Date(Date.now() + 60_000).toISOString() }
  ).eq('id', alertId)

  // Mark event alert_sent
  if (result.success) {
    await adminClient.from('security_events').update({
      alert_sent:    true,
      alert_sent_at: new Date().toISOString(),
    }).eq('id', event_id)
  }

  return json({ status: result.success ? 'sent' : 'failed', alert_id: alertId, message_id: result.messageId })
})
