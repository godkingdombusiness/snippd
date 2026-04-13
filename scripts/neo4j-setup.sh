#!/usr/bin/env bash
# neo4j-setup.sh — Run once after provisioning your Neo4j Aura instance.
#
# Usage:
#   NEO4J_URI="neo4j+s://xxxx.databases.neo4j.io" \
#   NEO4J_PASSWORD="your-generated-password" \
#   bash scripts/neo4j-setup.sh
#
# NEO4J_USER defaults to "neo4j" (always the case on Aura).

set -euo pipefail

NEO4J_URI="${NEO4J_URI:?Set NEO4J_URI before running}"
NEO4J_USER="${NEO4J_USER:-neo4j}"
NEO4J_PASSWORD="${NEO4J_PASSWORD:?Set NEO4J_PASSWORD before running}"

# Pull SUPABASE values from local .env if not already in env
if [ -f .env ]; then
  # shellcheck disable=SC2046
  export $(grep -v '^#' .env | grep -E '^(SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' | xargs)
fi

SUPABASE_URL="${SUPABASE_URL:?Set SUPABASE_URL (or add to .env)}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY (or add to .env)}"

echo ""
echo "=== Step 1: Push Neo4j secrets to Supabase ==="
npx supabase secrets set \
  NEO4J_URI="$NEO4J_URI" \
  NEO4J_USER="$NEO4J_USER" \
  NEO4J_PASSWORD="$NEO4J_PASSWORD"
echo "Secrets set."

echo ""
echo "=== Step 2: Write Neo4j vars to local .env (for Node.js services) ==="
# Remove any existing NEO4J lines, then append fresh ones
sed -i '/^NEO4J_/d' .env 2>/dev/null || true
{
  echo ""
  echo "# Neo4j Aura memory graph"
  echo "NEO4J_URI=$NEO4J_URI"
  echo "NEO4J_USER=$NEO4J_USER"
  echo "NEO4J_PASSWORD=$NEO4J_PASSWORD"
} >> .env
echo ".env updated."

echo ""
echo "=== Step 3: Initialize Neo4j schema (constraints + indexes) ==="
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
NEO4J_URI="$NEO4J_URI" \
NEO4J_USER="$NEO4J_USER" \
NEO4J_PASSWORD="$NEO4J_PASSWORD" \
  npx ts-node --project tsconfig.test.json src/services/graph/graphSchema.ts

echo ""
echo "=== Step 4: First data sync (preference scores, buy history, co-occurrences, cohort) ==="
SUPABASE_URL="$SUPABASE_URL" \
SUPABASE_SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY" \
NEO4J_URI="$NEO4J_URI" \
NEO4J_USER="$NEO4J_USER" \
NEO4J_PASSWORD="$NEO4J_PASSWORD" \
  npx ts-node --project tsconfig.test.json src/services/graph/graphSync.ts

echo ""
echo "=== Done ==="
echo "Neo4j memory graph is live."
echo "graph-insights and admin-graph-stats will now return real signals."
echo ""
echo "Next: set up the nightly cron at 02:00 UTC to keep the graph fresh."
echo "  02:00  graphSync.ts  (full sync)"
echo "  02:30  graphSchema.ts (schema check — safe to re-run)"
