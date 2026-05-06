// supabase/functions/slack-notify/index.ts
// Picks up unnotified retailer policy changes and posts them to Slack.
//
// Auth:
//   x-cron-secret: <CRON_SECRET>          — pg_cron scheduled calls
//   Authorization: Bearer <service_role>  — internal / manual calls
//
// Called by:
//   pg_cron job 'snippd-slack-policy-notify' every 5 min (source: cron)
//   scripts/setup-slack-webhook.sh test call (source: manual)
//
// Webhook URL is stored in snippd_integrations where key = 'slack_policy_changes'.
// If that row has enabled=false or value=NULL, the function exits cleanly.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS ─────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Auth ──────────────────────────────────────────────────────
function verifyAuth(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  const xCron = req.headers.get('x-cron-secret')
  if (cronSecret && xCron === cronSecret) return true

  const auth = req.headers.get('authorization')
  if (serviceKey && auth === `Bearer ${serviceKey}`) return true

  return false
}

// ── Types ─────────────────────────────────────────────────────
interface PolicyChange {
  id:          string
  table_name:  string
  operation:   'INSERT' | 'UPDATE' | 'DELETE'
  retailer_id: string | null
  old_data:    Record<string, unknown> | null
  new_data:    Record<string, unknown> | null
  created_at:  string
}

// ── Slack Block Kit builder ───────────────────────────────────
function buildSlackPayload(changes: PolicyChange[]): object {
  // Group by table
  const byTable: Record<string, PolicyChange[]> = {}
  for (const c of changes) {
    if (!byTable[c.table_name]) byTable[c.table_name] = []
    byTable[c.table_name].push(c)
  }

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: ':rotating_light:  Retailer Policy Change', emoji: true },
    },
    {
      type: 'context',
      elements: [{
        type: 'mrkdwn',
        text: `*${changes.length} change${changes.length > 1 ? 's' : ''}* detected  ·  ${new Date().toUTCString()}`,
      }],
    },
    { type: 'divider' },
  ]

  for (const [table, rows] of Object.entries(byTable)) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `:card_index:  *Table:* \`${table}\`  ·  ${rows.length} change${rows.length > 1 ? 's' : ''}`,
      },
    })

    for (const row of rows.slice(0, 5)) {
      const opEmoji = row.operation === 'INSERT' ? ':new:' :
                      row.operation === 'DELETE' ? ':wastebasket:' : ':pencil2:'
      const retailerLabel = row.retailer_id ? ` \`${row.retailer_id}\`` : ''

      // Build diff for UPDATE rows
      let diffLines: string[] = []
      if (row.operation === 'UPDATE' && row.old_data && row.new_data) {
        for (const key of Object.keys(row.new_data)) {
          const oldVal = JSON.stringify(row.old_data[key])
          const newVal = JSON.stringify(row.new_data[key])
          if (oldVal !== newVal) {
            diffLines.push(`  • \`${key}\`: ${oldVal} → ${newVal}`)
          }
        }
        diffLines = diffLines.slice(0, 8)
      }

      const diffText = diffLines.length ? '\n' + diffLines.join('\n') : ''

      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${opEmoji} *${row.operation}*${retailerLabel}${diffText}`,
        },
      })
    }

    if (rows.length > 5) {
      blocks.push({
        type: 'context',
        elements: [{
          type: 'mrkdwn',
          text: `_…and ${rows.length - 5} more change(s) in this table_`,
        }],
      })
    }
  }

  blocks.push({ type: 'divider' })
  blocks.push({
    type: 'context',
    elements: [{
      type: 'mrkdwn',
      text: ':snippd: Snippd Autonomous Shopping Intelligence  ·  Policy Watch',
    }],
  })

  return { blocks }
}

// ── Handler ───────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)
  if (!verifyAuth(req))      return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1. Check if Slack webhook is configured and enabled
  const { data: integration, error: intErr } = await supabase
    .from('snippd_integrations')
    .select('value, enabled')
    .eq('key', 'slack_policy_changes')
    .single()

  if (intErr) {
    console.error('[slack-notify] Failed to read snippd_integrations:', intErr.message)
    return json({ error: 'Failed to read integration config' }, 500)
  }

  if (!integration?.enabled || !integration?.value) {
    return json({ skipped: true, reason: 'slack webhook not configured — run scripts/setup-slack-webhook.sh' })
  }

  const webhookUrl = integration.value as string

  // 2. Fetch pending (unnotified) policy changes — up to 20 at a time
  const { data: changes, error: changesErr } = await supabase
    .from('retailer_policy_change_log')
    .select('*')
    .is('notified_at', null)
    .order('created_at', { ascending: true })
    .limit(20)

  if (changesErr) {
    console.error('[slack-notify] Failed to query change log:', changesErr.message)
    return json({ error: changesErr.message }, 500)
  }

  if (!changes || changes.length === 0) {
    return json({ skipped: true, reason: 'no pending notifications' })
  }

  // 3. Build Slack Block Kit payload and POST to webhook
  const payload = buildSlackPayload(changes as PolicyChange[])

  let slackRes: Response
  try {
    slackRes = await fetch(webhookUrl, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[slack-notify] Fetch to Slack failed:', err)
    return json({ error: 'Network error posting to Slack' }, 502)
  }

  if (!slackRes.ok) {
    const text = await slackRes.text()
    console.error(`[slack-notify] Slack API error ${slackRes.status}: ${text}`)
    return json({ error: `Slack API error ${slackRes.status}: ${text}` }, 502)
  }

  // 4. Mark all posted changes as notified
  const ids = changes.map((c: PolicyChange) => c.id)
  const { error: updateErr } = await supabase
    .from('retailer_policy_change_log')
    .update({ notified_at: new Date().toISOString() })
    .in('id', ids)

  if (updateErr) {
    // Non-fatal: message was sent, just log the failure to mark
    console.warn('[slack-notify] Failed to mark rows notified:', updateErr.message)
  }

  console.log(`[slack-notify] Posted ${changes.length} change(s) to Slack`)
  return json({ ok: true, notified: changes.length })
})
