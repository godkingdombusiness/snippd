# Slack as Snippd's comms hub

Every automated thing Snippd does — action items you need to approve,
wins when code merges, 6×/day health reports, Apple Review audits,
Neo4j provisioning status, and real-time retailer policy changes — posts
to Slack. This doc explains how the plumbing works and, when nothing is
showing up, which knob to turn.

## The one-knob setup

Set **one** GitHub repo secret:

- Name: `SLACK_WEBHOOK_URL`
- Value: a Slack Incoming Webhook URL pointed at the channel you want
  as your main hub (probably the one in
  https://getsnippd.slack.com/archives/C0AUE2LNPPX)

Once set, every workflow routes its posts there unless a more specific
channel webhook (below) is also configured. Posts get inline topic tags
so you can scan one channel and tell them apart:

| Tag | Source |
|---|---|
| `[action-needed]` | Founder Action Queue (`#founder-actions`) |
| `[approval]` | Output of the approval-inbox workflow |
| `[win]` | `wins.yml` — every merge to main, every GitHub release |
| `[report]` | `reports-cron.yml` — app health 6×/day |
| `[app-review]` | `app-review-audit.yml` — weekly Apple Reviewer audit |
| `[provision]` | `provision-neo4j.yml` — Edge Function deploy status |
| `[smoketest]` | `slack-smoketest.yml` — one-click verification |
| :sparkles: / :warning: / :skull: | Retailer policy changes (insert/update/delete) — triggered by Supabase |

### How to create the webhook (2 minutes)

1. In Slack: **Apps** → search for **Incoming Webhooks** → **Add to Slack**
2. Pick the channel you want as your hub
3. Copy the webhook URL (starts with `https://hooks.slack.com/services/…`)
4. In GitHub: **Settings → Secrets and variables → Actions →
   New repository secret**
   - Name: `SLACK_WEBHOOK_URL`
   - Value: *paste the URL*
5. Verify: **Actions → `slack-smoketest` → Run workflow**. Every configured
   webhook gets a test post. Check Slack.

## Optional: per-channel fan-out

Later, if you want each topic in its own channel (e.g. `#wins` separate
from `#app-review`), create additional webhooks and add them as secrets.
Whichever is set wins; the hub URL is the fallback.

| Secret | Overrides for | Workflow |
|---|---|---|
| `SLACK_WINS_WEBHOOK_URL` | `[win]` posts | `wins.yml` |
| `SLACK_ACTIONS_WEBHOOK_URL` | `[action-needed]`, `[approval]`, `[provision]` | `founder-actions-sync.yml`, `process-approvals.yml`, `provision-neo4j.yml` |
| `SLACK_REPORTS_WEBHOOK_URL` | `[report]` posts | `reports-cron.yml` |
| `SLACK_APP_REVIEW_WEBHOOK_URL` | `[app-review]` posts | `app-review-audit.yml` |

Today `SLACK_WINS_WEBHOOK_URL` is the only webhook configured. Every
workflow now has a **three-level fallback chain**:

1. Its channel-specific webhook (e.g. `SLACK_APP_REVIEW_WEBHOOK_URL`)
2. The shared hub `SLACK_WEBHOOK_URL`
3. `SLACK_WINS_WEBHOOK_URL` as a last resort

So every `[app-review]`, `[report]`, `[action-needed]`, `[provision]`,
and `[approval]` post currently lands in whatever channel
`SLACK_WINS_WEBHOOK_URL` targets — sorted by topic prefix. This is
intentional: better to flood one channel with everything than to silently
drop messages the founder needs to see. When you set `SLACK_WEBHOOK_URL`
(or per-topic overrides), those take priority automatically and the
wins-channel stops carrying unrelated topics.

## Debugging "nothing is showing up"

1. **Run `slack-smoketest`.** It tells you which webhooks are configured
   and which ones Slack accepts. If you see "no Slack webhooks configured"
   in the run log, go set `SLACK_WEBHOOK_URL`.
2. **Check the specific workflow run log.** Each workflow prints a
   `::notice::` line like `using SLACK_WEBHOOK_URL (shared hub)` or
   `neither SLACK_X nor SLACK_WEBHOOK_URL is set — skipping`. That tells
   you in one line whether the problem is a missing secret or a bad URL.
3. **If the webhook returns 404** on smoketest, the webhook was deleted
   or the hook's channel was archived. Recreate it.
4. **If the webhook returns 200 but nothing appears in Slack**, the webhook
   is pointed at a different channel than you think. Slack's webhook
   URLs bind at creation time to the channel picked in step 2 above.

## Supabase-triggered notifications (retailer policy changes)

In addition to GitHub Actions workflows, Snippd also sends real-time
notifications from **Supabase** whenever the Retailer Policy Curator
agent or a manual operation creates, updates, or deletes a retailer
policy. These notifications are powered by a Postgres trigger
(`notify_retailer_policy_change`) and stored webhook configuration in
the `snippd_integrations` table.

### Setup for #engineering policy change notifications (2 minutes)

1. In Slack: **Apps** → search for **Incoming Webhooks** → toggle ON →
   **Add New Webhook to Workspace**
2. Pick the channel you want to receive policy change notifications
   (typically `#engineering`)
3. Copy the webhook URL (starts with `https://hooks.slack.com/services/…`)
4. In your terminal, from the Snippd repo root:

```bash
scripts/setup-slack-webhook.sh "https://hooks.slack.com/services/T.../B.../XXX"
```

This script will:
- Validate the webhook URL format
- Send a test message to Slack
- Insert the webhook into `public.snippd_integrations` (service-role only table)
- Send a confirmation message

### What you'll see

Every time a retailer policy is inserted, updated (hash change), or
deleted, Slack will receive a Block Kit message showing:

- **Header emoji**: :sparkles: (insert), :warning: (update), :skull: (delete)
- **Store ID**, policy type, policy key
- **Source URL** and verification metadata
- **Old value** vs. **New value** (JSON diff)
- **Confidence score** and timestamp

### Troubleshooting

- **No notifications after setup**: Check that the `slack_policy_changes`
  row in `snippd_integrations` has `is_enabled = true`. Query with
  service-role credentials:
  ```sql
  SELECT * FROM snippd_integrations WHERE name = 'slack_policy_changes';
  ```
- **Disable without removing the config**:
  ```sql
  UPDATE snippd_integrations
  SET is_enabled = false
  WHERE name = 'slack_policy_changes';
  ```
- **Re-enable**:
  ```sql
  UPDATE snippd_integrations
  SET is_enabled = true
  WHERE name = 'slack_policy_changes';
  ```
- **Update the webhook URL**: Re-run the setup script with the new URL,
  or manually update:
  ```sql
  UPDATE snippd_integrations
  SET config = '{"webhook_url":"https://hooks.slack.com/services/NEW/URL"}'::jsonb
  WHERE name = 'slack_policy_changes';
  ```

### Technical details

- **Trigger**: `trg_retailer_policy_history_slack` on
  `public.retailer_policy_history`
- **Function**: `public.notify_retailer_policy_change()` (security definer)
- **Transport**: `pg_net` extension (async HTTP POST)
- **Migration**: `supabase/migrations/20260421140000_retailer_policy_slack_notifier.sql`
- **Failure handling**: Webhook errors are logged as warnings and never
  block policy writes
