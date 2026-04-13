// supabase/functions/traffic-guard/index.ts
// Traffic anomaly detection + spike monitoring + IP reputation alerts
// Invoked by security-escalate cron every 5 minutes
// Also called inline by security-ingest for real-time spike checks

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getAdminClient, verifyHmac, logSecurityEvent, computeHmac
} from '../_shared/middleware.ts'

const RESEND_URL = 'https://api.resend.com/emails'
const ALERT_TO   = Deno.env.get('ALERT_TO_EMAIL')   ?? 'ddavis@getsnippd.com'
const ALERT_FROM = Deno.env.get('ALERT_FROM_EMAIL')  ?? 'security@getsnippd.com'
const ENV        = Deno.env.get('ENVIRONMENT')        ?? 'production'

// ─────────────────────────────────────────────────────────────
// ALERT TEMPLATES
// ─────────────────────────────────────────────────────────────
type AlertSeverity = 'MEDIUM' | 'HIGH' | 'CRITICAL'

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  MEDIUM:   '#f59e0b',
  HIGH:     '#ef4444',
  CRITICAL: '#7f1d1d'
}

function buildAlertEmail(alert: {
  type: string
  severity: AlertSeverity
  route?: string
  dimension?: string
  observed: number
  threshold: number
  metadata: Record<string, unknown>
}): { subject: string; html: string; text: string } {
  const ts = new Date().toUTCString()
  const color = SEVERITY_COLOR[alert.severity]

  const subject = `[HIGH PRIORITY SECURITY ALERT] ${alert.type} — ${alert.severity} on ${ENV}`

  const html = `
<!DOCTYPE html><html><body style="font-family:monospace;background:#0f172a;color:#e2e8f0;padding:24px;margin:0">
<div style="max-width:640px;margin:0 auto">
  <div style="background:${color};padding:16px 24px;border-radius:8px 8px 0 0">
    <h1 style="margin:0;font-size:18px;color:#fff">[HIGH PRIORITY SECURITY ALERT]</h1>
    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.8)">${alert.severity} · ${ENV}</p>
  </div>
  <div style="background:#1e293b;padding:20px 24px;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr><td style="padding:6px 0;color:#94a3b8;width:160px">Alert Type</td><td style="color:#e2e8f0;font-weight:bold">${alert.type}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Severity</td><td style="color:${color};font-weight:bold">${alert.severity}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Timestamp</td><td style="color:#e2e8f0">${ts}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Environment</td><td style="color:#e2e8f0">${ENV}</td></tr>
      ${alert.route ? `<tr><td style="padding:6px 0;color:#94a3b8">Route</td><td style="color:#e2e8f0">${alert.route}</td></tr>` : ''}
      ${alert.dimension ? `<tr><td style="padding:6px 0;color:#94a3b8">Dimension</td><td style="color:#e2e8f0">${alert.dimension}</td></tr>` : ''}
      <tr><td style="padding:6px 0;color:#94a3b8">Observed</td><td style="color:#fbbf24;font-weight:bold">${alert.observed}</td></tr>
      <tr><td style="padding:6px 0;color:#94a3b8">Threshold</td><td style="color:#e2e8f0">${alert.threshold}</td></tr>
    </table>
    <div style="margin-top:16px;background:#0f172a;padding:12px;border-radius:6px;font-size:11px;color:#94a3b8">
      <strong style="color:#C5FFBC">Metadata:</strong><br>
      <pre style="margin:4px 0;color:#94a3b8">${JSON.stringify(alert.metadata, null, 2)}</pre>
    </div>
    <div style="margin-top:16px;background:#422006;border:1px solid #f59e0b;padding:12px;border-radius:6px">
      <strong style="color:#fbbf24;font-size:12px">Recommended Action:</strong>
      <p style="color:#fde68a;font-size:12px;margin:6px 0 0">${getRecommendation(alert.type)}</p>
    </div>
  </div>
</div>
</body></html>`

  const text = `
[HIGH PRIORITY SECURITY ALERT] ${alert.type} — ${alert.severity}

Alert Type  : ${alert.type}
Severity    : ${alert.severity}
Timestamp   : ${ts}
Environment : ${ENV}
${alert.route ? `Route       : ${alert.route}\n` : ''}
${alert.dimension ? `Dimension   : ${alert.dimension}\n` : ''}
Observed    : ${alert.observed}
Threshold   : ${alert.threshold}

Metadata:
${JSON.stringify(alert.metadata, null, 2)}

Recommended Action:
${getRecommendation(alert.type)}
`

  return { subject, html, text }
}

function getRecommendation(alertType: string): string {
  const recs: Record<string, string> = {
    'login_spike':          'Check login_attempts by IP. Consider temporary IP block. Verify no accounts were compromised.',
    'signup_spike':         'Check new signups for bot patterns (same email domain, identical prefs). Consider CAPTCHA enforcement.',
    'referral_abuse_spike': 'Disable referral system: UPDATE feature_flags SET enabled=FALSE WHERE flag_name=\'referrals_enabled\'. Review fraud_flags table.',
    'reward_claim_spike':   'Disable rewards: UPDATE feature_flags SET enabled=FALSE WHERE flag_name=\'rewards_enabled\'. Review credit_ledger for anomalies.',
    'vpn_burst':            'High-risk VPN traffic detected. Review ip_reputation_cache. Consider geo-restriction for affected routes.',
    'ip_targeting_accounts':'Single IP accessing many accounts. Block IP immediately: INSERT INTO blocked_indicators(indicator_type,indicator_value,reason,severity,expires_at) VALUES(\'IP\',\'<IP>\',\'Mass account targeting\',\'CRITICAL\',NOW()+INTERVAL \'24 hours\')',
    'route_spike':          'Unusual traffic spike. Check traffic_metrics table. Consider rate limit tightening for affected route.',
    'ROUTE_TRAFFIC_SPIKE':  'Review traffic_metrics for the affected route. Check ip_reputation_cache for top offending IPs.',
    'admin_burst':          'Multiple admin endpoint hits. Verify admin access is legitimate. Review admin_audit_log.',
  }
  return recs[alertType] ?? 'Review security_events and anomaly_alerts tables. Assess scope before taking action.'
}

// ─────────────────────────────────────────────────────────────
// SEND ALERT EMAIL via Resend
// ─────────────────────────────────────────────────────────────
async function sendAlertEmail(alert: Parameters<typeof buildAlertEmail>[0]): Promise<boolean> {
  const resendKey = Deno.env.get('RESEND_API_KEY')
  if (!resendKey) {
    console.error('[traffic-guard] RESEND_API_KEY not set')
    return false
  }

  const { subject, html, text } = buildAlertEmail(alert)

  try {
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: ALERT_FROM, to: [ALERT_TO], subject, html, text })
    })
    return res.ok
  } catch (e) {
    console.error('[traffic-guard] Email send failed:', e)
    return false
  }
}

// ─────────────────────────────────────────────────────────────
// SPIKE DETECTION: Check all monitored routes
// ─────────────────────────────────────────────────────────────
const MONITORED_ROUTES = [
  '/auth/login', '/auth/signup', '/auth/reset-password',
  '/close-trip', '/claim-referral', '/secure-reward-claim',
  '/security-ingest', '/gemini-proxy', '/admin'
]

async function runSpikeDetection(adminClient: ReturnType<typeof getAdminClient>): Promise<number> {
  let alertCount = 0

  for (const route of MONITORED_ROUTES) {
    const { data } = await adminClient.rpc('detect_route_spike', {
      p_route: route,
      p_window_secs: 60
    })

    const spike = data?.[0]
    if (!spike?.is_spike) continue

    const severity = spike.severity.toUpperCase() as AlertSeverity
    if (!['MEDIUM', 'HIGH', 'CRITICAL'].includes(severity)) continue

    // Check if we already alerted for this route recently (cooldown)
    const { data: recent } = await adminClient
      .from('anomaly_alerts')
      .select('id')
      .eq('alert_type', `${route.replace(/\//g, '_')}_spike`)
      .eq('email_sent', true)
      .gte('created_at', new Date(Date.now() - (severity === 'CRITICAL' ? 60_000 : severity === 'HIGH' ? 300_000 : 3_600_000)).toISOString())
      .maybeSingle()

    if (recent) continue  // cooldown active

    // Store anomaly alert
    const { data: anomalyAlert } = await adminClient.from('anomaly_alerts').insert({
      alert_type: `${route.replace(/\//g, '_')}_spike`,
      severity: severity.toLowerCase(),
      route,
      observed_value: spike.observed,
      threshold_value: spike.threshold,
      metadata: { window_secs: 60, multiplier: (spike.observed / Math.max(spike.threshold, 1)).toFixed(2) }
    }).select('id').single()

    if (['HIGH', 'CRITICAL'].includes(severity)) {
      const sent = await sendAlertEmail({
        type: `${route}_spike`,
        severity,
        route,
        observed: spike.observed,
        threshold: spike.threshold,
        metadata: { window_secs: 60, alert_id: anomalyAlert?.id }
      })

      if (anomalyAlert) {
        await adminClient.from('anomaly_alerts')
          .update({ email_sent: sent, email_sent_at: new Date().toISOString() })
          .eq('id', anomalyAlert.id)
      }

      alertCount++
    }
  }

  return alertCount
}

// ─────────────────────────────────────────────────────────────
// IP REPUTATION: Flag high-risk IPs
// ─────────────────────────────────────────────────────────────
async function checkIpReputation(adminClient: ReturnType<typeof getAdminClient>): Promise<void> {
  // Find IPs with many auth failures in last hour that aren't yet scored high
  const { data: suspiciousIps } = await adminClient.from('traffic_metrics')
    .select('dimension, auth_fail_count')
    .eq('metric_type', 'ip')
    .gte('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .gt('auth_fail_count', 10)
    .limit(20)

  for (const row of suspiciousIps ?? []) {
    const ip = row.dimension

    // Score the IP
    const { data: rep } = await adminClient.rpc('score_ip_risk', {
      p_ip: ip,
      p_is_vpn: false,
      p_is_datacenter: false,
      p_is_tor: false
    })

    const ipRep = Array.isArray(rep) ? rep[0] : rep
    if (!ipRep) continue

    if (ipRep.risk_score >= 80) {
      // Auto-block
      await adminClient.from('blocked_indicators').upsert({
        indicator_type: 'IP',
        indicator_value: ip,
        reason: `Auto-blocked: risk_score=${ipRep.risk_score}, auth_fails=${row.auth_fail_count}`,
        severity: 'HIGH',
        active: true,
        expires_at: new Date(Date.now() + 3_600_000).toISOString()  // 1 hour
      }, { onConflict: 'indicator_type,indicator_value' })

      // Alert
      await sendAlertEmail({
        type: 'ip_targeting_accounts',
        severity: 'HIGH',
        dimension: ip,
        observed: row.auth_fail_count,
        threshold: 10,
        metadata: { risk_score: ipRep.risk_score, enforcement: ipRep.enforcement, auto_blocked: true }
      })
    }
  }

  // Find IPs hitting many different users (account enumeration)
  const { data: enumIps } = await adminClient.from('traffic_metrics')
    .select('dimension')
    .eq('metric_type', 'ip')
    .gte('window_start', new Date(Date.now() - 3_600_000).toISOString())
    .gt('auth_fail_count', 5)
    .limit(10)

  // Group by IP and count distinct users (simplified — full version uses window functions)
  for (const row of enumIps ?? []) {
    const ip = row.dimension
    const { count } = await adminClient.from('security_events')
      .select('user_id', { count: 'estimated', head: true })
      .eq('ip_address', ip)
      .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())

    if ((count ?? 0) > 10) {
      await sendAlertEmail({
        type: 'ip_targeting_accounts',
        severity: 'CRITICAL',
        dimension: ip,
        observed: count ?? 0,
        threshold: 10,
        metadata: { pattern: 'single_ip_multiple_users', window: '1h' }
      })
    }
  }
}

// ─────────────────────────────────────────────────────────────
// FRAUD PATTERN DETECTION
// ─────────────────────────────────────────────────────────────
async function detectFraudPatterns(adminClient: ReturnType<typeof getAdminClient>): Promise<void> {
  // Referral abuse spike
  const { count: referralCount } = await adminClient
    .from('referral_verifications')
    .select('*', { count: 'estimated', head: true })
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())
    .gt('fraud_score', 60)

  if ((referralCount ?? 0) >= 5) {
    await sendAlertEmail({
      type: 'referral_abuse_spike',
      severity: 'HIGH',
      observed: referralCount ?? 0,
      threshold: 5,
      metadata: { window: '1h', high_fraud_score_count: referralCount }
    })
  }

  // Reward claim spike
  const { count: rewardCount } = await adminClient
    .from('credit_ledger')
    .select('*', { count: 'estimated', head: true })
    .eq('source', 'weekly_trip')
    .gte('created_at', new Date(Date.now() - 3_600_000).toISOString())

  const rewardThreshold = 50  // adjust based on user base size
  if ((rewardCount ?? 0) > rewardThreshold) {
    await sendAlertEmail({
      type: 'reward_claim_spike',
      severity: 'MEDIUM',
      observed: rewardCount ?? 0,
      threshold: rewardThreshold,
      metadata: { window: '1h', source: 'weekly_trip' }
    })
  }
}

// ─────────────────────────────────────────────────────────────
// PIPELINE HEALTH CHECK (dead-man's switch)
// ─────────────────────────────────────────────────────────────
async function checkPipelineHealth(adminClient: ReturnType<typeof getAdminClient>): Promise<void> {
  const { count } = await adminClient
    .from('security_events')
    .select('*', { count: 'estimated', head: true })
    .gte('created_at', new Date(Date.now() - 1_800_000).toISOString())  // 30 min

  if ((count ?? 0) === 0) {
    // Pipeline may be broken — send direct email (bypassing normal pipeline)
    const resendKey = Deno.env.get('RESEND_API_KEY')
    if (!resendKey) return

    await fetch(RESEND_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: ALERT_FROM,
        to: [ALERT_TO],
        subject: `[HIGH PRIORITY SECURITY ALERT] MONITORING PIPELINE FAILURE — ${ENV}`,
        text: `Security monitoring pipeline health check FAILED.\n\nNo security events received in the last 30 minutes on ${ENV}.\n\nTimestamp: ${new Date().toUTCString()}\n\nAction Required: Check security-ingest Edge Function, pg_cron jobs, and database connectivity immediately.`
      })
    }).catch(console.error)
  }
}

// ─────────────────────────────────────────────────────────────
// CRON INTEGRITY CHECK
// ─────────────────────────────────────────────────────────────
const APPROVED_CRON_JOBS = [
  'security-escalate-job', 'purge-low-security-events', 'expire-elevated-sessions',
  'expire-blocks', 'cleanup-traffic-metrics', 'cleanup-anomaly-alerts',
  'cleanup-processed-requests', 'expire-blocks', 'cron_audit_log_cleanup'
]

async function checkCronIntegrity(adminClient: ReturnType<typeof getAdminClient>): Promise<void> {
  const { data: jobs } = await adminClient
    .from('cron.job')
    .select('jobname')
    .not('jobname', 'in', `(${APPROVED_CRON_JOBS.map(j => `'${j}'`).join(',')})`)

  if (jobs && jobs.length > 0) {
    const unauthorized = jobs.map(j => j.jobname)
    await logSecurityEvent(adminClient, {
      event_type: 'CRON_JOB_UNAUTHORIZED',
      category: 'DEVELOPER_TOOL',
      severity: 'CRITICAL',
      summary: `Unauthorized cron jobs detected: ${unauthorized.join(', ')}`,
      metadata: { unauthorized_jobs: unauthorized }
    })

    await sendAlertEmail({
      type: 'unauthorized_cron_jobs',
      severity: 'CRITICAL',
      observed: unauthorized.length,
      threshold: 0,
      metadata: { unauthorized_jobs: unauthorized }
    })
  }
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const hmacSecret = Deno.env.get('SECURITY_INGEST_SECRET')
  if (!hmacSecret) {
    return Response.json({ error: 'Configuration error' }, { status: 500 })
  }

  // Verify HMAC (only accept calls from authorized callers: cron, security-escalate)
  try {
    await verifyHmac(req, hmacSecret)
  } catch {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const adminClient = getAdminClient()
  const startTime = Date.now()

  try {
    const [spikeAlerts, , ,] = await Promise.allSettled([
      runSpikeDetection(adminClient),
      checkIpReputation(adminClient),
      detectFraudPatterns(adminClient),
      checkPipelineHealth(adminClient),
      checkCronIntegrity(adminClient)
    ])

    await adminClient.from('cron_audit_log').insert({
      action: 'executed',
      job_name: 'traffic-guard',
      result: `OK: ${spikeAlerts.status === 'fulfilled' ? spikeAlerts.value : 0} spike alerts | ${Date.now() - startTime}ms`
    })

    return Response.json({
      ok: true,
      duration_ms: Date.now() - startTime,
      timestamp: new Date().toISOString()
    })
  } catch (e) {
    console.error('[traffic-guard] Fatal error:', e)
    return Response.json({ error: 'Internal error' }, { status: 500 })
  }
})
