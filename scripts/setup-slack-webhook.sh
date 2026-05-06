#!/usr/bin/env bash
# =============================================================================
# Snippd — Slack Webhook Setup
# Usage: bash scripts/setup-slack-webhook.sh "<webhook-url>"
#
# What this does:
#   1. Validates the URL looks like a Slack incoming webhook
#   2. Sends a test message to confirm the webhook works
#   3. Seeds the URL into snippd_integrations (enables notifications)
#
# Pre-requisite (one-time, ~3 minutes in Slack UI):
#   1. Go to https://api.slack.com/apps
#   2. Click "Create New App" → "From scratch" → name it "Snippd Policy Watch"
#   3. Under "Add features and functionality" → "Incoming Webhooks" → toggle ON
#   4. Click "Add New Webhook to Workspace" → pick #engineering (or any channel)
#   5. Copy the Webhook URL (starts with https://hooks.slack.com/services/...)
#   6. Run: bash scripts/setup-slack-webhook.sh "<paste-url-here>"
# =============================================================================

set -euo pipefail

WEBHOOK_URL="${1:-}"

# ── Validate arg ──────────────────────────────────────────────
if [[ -z "$WEBHOOK_URL" ]]; then
  echo ""
  echo "Usage:"
  echo "  bash scripts/setup-slack-webhook.sh \"https://hooks.slack.com/services/...\""
  echo ""
  echo "Get your webhook URL at: https://api.slack.com/apps"
  echo ""
  exit 1
fi

if [[ ! "$WEBHOOK_URL" =~ ^https://hooks\.slack\.com/ ]]; then
  echo "Error: URL must start with https://hooks.slack.com/"
  echo "Got: $WEBHOOK_URL"
  exit 1
fi

# ── Test the webhook first ────────────────────────────────────
echo ""
echo "Step 1/2 — Sending test message to Slack..."

TEST_PAYLOAD=$(cat <<'EOF'
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": ":white_check_mark: *Snippd Policy Watch connected successfully!*\n\nThis channel will receive notifications whenever retailer coupon parameters or stacking rules change in the Snippd database."
      }
    },
    {
      "type": "context",
      "elements": [{ "type": "mrkdwn", "text": ":snippd: Snippd Autonomous Shopping Intelligence  ·  Setup Complete" }]
    }
  ]
}
EOF
)

HTTP_STATUS=$(curl -s -o /tmp/slack_test_response.txt -w "%{http_code}" \
  -X POST "$WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD")

SLACK_BODY=$(cat /tmp/slack_test_response.txt)

if [[ "$HTTP_STATUS" != "200" ]] || [[ "$SLACK_BODY" != "ok" ]]; then
  echo "Error: Slack returned HTTP $HTTP_STATUS — $SLACK_BODY"
  echo "Double-check the webhook URL and try again."
  exit 1
fi

echo "  ✓ Test message delivered to Slack successfully."

# ── Seed into snippd_integrations via Supabase CLI ───────────
echo ""
echo "Step 2/2 — Seeding webhook URL into snippd_integrations..."

SQL="
INSERT INTO snippd_integrations (key, value, description, enabled)
VALUES (
  'slack_policy_changes',
  '$WEBHOOK_URL',
  'Slack incoming webhook URL for retailer policy change notifications.',
  true
)
ON CONFLICT (key) DO UPDATE
  SET value      = EXCLUDED.value,
      enabled    = true,
      updated_at = now();

SELECT key, enabled, left(value, 40) || '...' AS value_preview
FROM snippd_integrations
WHERE key = 'slack_policy_changes';
"

# Try Supabase CLI (preferred)
if command -v supabase &>/dev/null; then
  echo "$SQL" | supabase db execute --stdin
  echo "  ✓ Webhook URL saved via Supabase CLI."

# Fallback: psql with DATABASE_URL
elif command -v psql &>/dev/null && [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -c "$SQL"
  echo "  ✓ Webhook URL saved via psql."

# Last resort: print SQL for manual paste
else
  echo ""
  echo "  Could not auto-save — neither 'supabase' CLI nor DATABASE_URL is available."
  echo ""
  echo "  Please run the following SQL in your Supabase SQL Editor"
  echo "  (https://supabase.com/dashboard → your project → SQL Editor):"
  echo ""
  echo "--------------------------------------------------------------"
  echo "$SQL"
  echo "--------------------------------------------------------------"
  echo ""
fi

echo ""
echo "Done! Retailer policy change notifications are now active."
echo ""
echo "The 'snippd-slack-policy-notify' pg_cron job fires every 5 minutes."
echo "Any INSERT/UPDATE/DELETE on retailer_coupon_parameters or retailer_rules"
echo "will post to Slack within 5 minutes."
echo ""
echo "To send a test notification immediately:"
echo "  supabase functions invoke slack-notify --body '{\"source\":\"manual\"}'"
echo ""
