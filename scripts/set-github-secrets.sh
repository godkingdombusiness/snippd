#!/usr/bin/env bash
# set-github-secrets.sh — Push all required secrets to GitHub Actions.
#
# Run this ONCE after you've pushed the repo to GitHub:
#   gh auth login      (first time only)
#   bash scripts/set-github-secrets.sh
#
# Reads values from your local .env so you never type secrets on the command line.

set -euo pipefail

# Load .env
if [ ! -f .env ]; then
  echo "ERROR: .env not found. Run from the project root."
  exit 1
fi
# shellcheck disable=SC2046
export $(grep -v '^#' .env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|NEO4J_URI|NEO4J_USER|NEO4J_PASSWORD|NEO4J_DATABASE)=' | xargs)

echo "=== Pushing secrets to GitHub Actions ==="

gh secret set SUPABASE_URL              --body "$SUPABASE_URL"
gh secret set SUPABASE_SERVICE_ROLE_KEY --body "$SUPABASE_SERVICE_ROLE_KEY"
gh secret set NEO4J_URI                 --body "$NEO4J_URI"
gh secret set NEO4J_USER                --body "$NEO4J_USER"
gh secret set NEO4J_PASSWORD            --body "$NEO4J_PASSWORD"
gh secret set NEO4J_DATABASE            --body "$NEO4J_DATABASE"

echo ""
echo "Done. Secrets set:"
gh secret list
echo ""
echo "The nightly-graph-sync workflow will run at 02:00 UTC."
echo "Trigger a manual run now at:"
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "<your-org/snippd>")
echo "  https://github.com/$REPO/actions/workflows/nightly-graph-sync.yml"
