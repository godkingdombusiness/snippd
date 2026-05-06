#!/usr/bin/env bash
set -euo pipefail

# Run from repo root in Google Cloud Shell after cloning/pulling this repo.
# Required env vars:
#   SUPABASE_URL
#   SUPABASE_ANON_KEY
#   SUPABASE_SERVICE_ROLE_KEY
# Optional:
#   PROJECT_ID=gen-lang-client-0848527535
#   REGION=us-central1
#   SERVICE_NAME=checkout-math

PROJECT_ID="${PROJECT_ID:-gen-lang-client-0848527535}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-checkout-math}"

if [[ ! -f "services/checkout_math/main.py" ]]; then
  echo "Run this from the snippd repo root." >&2
  exit 1
fi

for name in SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
done

export CHECKOUT_MATH_HMAC_SECRET="${CHECKOUT_MATH_HMAC_SECRET:-$(openssl rand -hex 32)}"

python3 -m py_compile services/checkout_math/main.py
python3 -m py_compile agent/agents/adk_architect.py

echo "Applying launch migrations requires Supabase CLI auth."
echo "If not already authenticated, run: npx supabase login"
npx supabase link --project-ref gsnbpfpekqqjlmkgvwvb
npx supabase db push

bash scripts/deploy-checkout-math-cloudrun.sh

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"

cat <<EOF

Launch deploy complete.

Cloud Run:
  $SERVICE_URL

Set this in your Expo/EAS environment:
  EXPO_PUBLIC_CHECKOUT_MATH_URL=$SERVICE_URL

Then redeploy/restart the app build using that env var.
EOF
