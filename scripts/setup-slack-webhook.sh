#!/usr/bin/env bash
# Snippd Slack Webhook Setup — inserts the webhook URL into Supabase
# for the retailer policy change notifier.
#
# Usage:
#   scripts/setup-slack-webhook.sh "https://hooks.slack.com/services/T.../B.../XXX"
#
# What it does:
#   1. Validates the webhook URL format
#   2. Sends a test message to verify the webhook works
#   3. Inserts/updates the 'slack_policy_changes' row in snippd_integrations
#   4. Sends a confirmation message to Slack
#
# Prerequisites:
#   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY set in your environment
#     (or in .env — this script will source it)
#   - curl installed
#   - jq installed (for JSON parsing)

set -euo pipefail

WEBHOOK_URL="${1:-}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
die() {
  echo -e "\n[setup-slack-webhook] ✗ $1\n" >&2
  exit 1
}

ok() {
  echo "[setup-slack-webhook] ✓ $1"
}

# ---------------------------------------------------------------------------
# 0) Load environment if .env exists
# ---------------------------------------------------------------------------
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
  ok "loaded .env"
fi

# ---------------------------------------------------------------------------
# 1) Validate inputs
# ---------------------------------------------------------------------------
if [[ -z "$WEBHOOK_URL" ]]; then
  die "Usage: $0 \"https://hooks.slack.com/services/...\""
fi

if [[ ! "$WEBHOOK_URL" =~ ^https://hooks\.slack\.com/services/ ]]; then
  die "Invalid webhook URL format. Expected: https://hooks.slack.com/services/..."
fi

if [[ -z "${SUPABASE_URL:-}" ]]; then
  die "SUPABASE_URL is not set. Add it to .env or export it."
fi

if [[ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  die "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env or export it."
fi

# Check for required commands
command -v curl >/dev/null 2>&1 || die "curl is not installed"
command -v jq >/dev/null 2>&1 || die "jq is not installed"

ok "webhook URL format is valid"
ok "Supabase credentials loaded"

# ---------------------------------------------------------------------------
# 2) Test the webhook endpoint
# ---------------------------------------------------------------------------
echo "[setup-slack-webhook] → testing webhook delivery..."

TEST_PAYLOAD=$(jq -nc '{
  "text": "🔧 Snippd Slack webhook setup test",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "🔧 *Snippd Slack webhook setup test*\n\nIf you see this message, the webhook is working correctly. The setup script will now register this webhook in Supabase."
      }
    }
  ]
}')

TEST_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$TEST_PAYLOAD" \
  "$WEBHOOK_URL")

TEST_HTTP_CODE=$(echo "$TEST_RESPONSE" | tail -n1)
TEST_BODY=$(echo "$TEST_RESPONSE" | head -n-1)

if [[ "$TEST_HTTP_CODE" != "200" ]]; then
  die "Webhook test failed (HTTP $TEST_HTTP_CODE). Response: $TEST_BODY"
fi

ok "webhook test message delivered (HTTP $TEST_HTTP_CODE)"

# ---------------------------------------------------------------------------
# 3) Insert/update the integration row in Supabase
# ---------------------------------------------------------------------------
echo "[setup-slack-webhook] → upserting integration config in Supabase..."

CONFIG_JSON=$(jq -nc --arg url "$WEBHOOK_URL" '{
  "webhook_url": $url
}')

UPSERT_PAYLOAD=$(jq -nc --arg config "$CONFIG_JSON" '{
  "name": "slack_policy_changes",
  "config": ($config | fromjson),
  "is_enabled": true
}')

SUPABASE_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  "${SUPABASE_URL}/rest/v1/snippd_integrations?on_conflict=name" \
  -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "$UPSERT_PAYLOAD")

SUPABASE_HTTP_CODE=$(echo "$SUPABASE_RESPONSE" | tail -n1)
SUPABASE_BODY=$(echo "$SUPABASE_RESPONSE" | head -n-1)

if [[ "$SUPABASE_HTTP_CODE" != "201" && "$SUPABASE_HTTP_CODE" != "200" ]]; then
  die "Supabase upsert failed (HTTP $SUPABASE_HTTP_CODE). Response: $SUPABASE_BODY"
fi

ok "integration config saved to Supabase (HTTP $SUPABASE_HTTP_CODE)"

# ---------------------------------------------------------------------------
# 4) Send success confirmation to Slack
# ---------------------------------------------------------------------------
echo "[setup-slack-webhook] → sending confirmation message..."

SUCCESS_PAYLOAD=$(jq -nc '{
  "text": "✅ Slack webhook configured",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "✅ *Slack webhook successfully configured*\n\nThis channel will now receive real-time notifications whenever retailer policies are created, updated, or deleted in Snippd."
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*What you'\''ll see here:*\n• New policy discoveries\n• Policy updates (hash changes)\n• Policy deletions\n• Source URLs and confidence scores"
      }
    },
    {
      "type": "context",
      "elements": [
        {
          "type": "mrkdwn",
          "text": "Powered by `public.notify_retailer_policy_change()` trigger • Migration `20260421140000`"
        }
      ]
    }
  ]
}')

curl -s -X POST \
  -H "Content-Type: application/json" \
  -d "$SUCCESS_PAYLOAD" \
  "$WEBHOOK_URL" >/dev/null

ok "confirmation message sent"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo "[setup-slack-webhook] ✓ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Check #engineering for the confirmation message"
echo "  2. (Optional) Test the integration by triggering a policy change:"
echo "     • Run the Retailer_Policy_Curator agent"
echo "     • Or manually insert a test row into retailer_policy_history"
echo ""
echo "To disable notifications (without removing the config):"
echo "  UPDATE snippd_integrations SET is_enabled = false WHERE name = 'slack_policy_changes';"
echo ""
