# Slack as Snippd's comms hub

Every automated thing Snippd does — action items you need to approve,
wins when code merges, 6×/day health reports, Apple Review audits,
Neo4j provisioning status — posts to Slack. This doc explains how the
plumbing works and, when nothing is showing up, which knob to turn.

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

Today `SLACK_WINS_WEBHOOK_URL` is already set — which is why wins *would*
reach Slack once a merge happens. The other three are unset, which is
why founder-action nudges, reports, and app-review audits have been silent.
Setting `SLACK_WEBHOOK_URL` fixes all three at once.

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
