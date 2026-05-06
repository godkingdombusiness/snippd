#!/usr/bin/env bash
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-gen-lang-client-0848527535}"
REGION="${REGION:-us-central1}"
SERVICE_NAME="${SERVICE_NAME:-checkout-math}"
MIN_SAVINGS_PCT="${MIN_SAVINGS_PCT:-60}"
MAX_STORE_COUNT="${MAX_STORE_COUNT:-2}"
MAX_STACK_ITEMS="${MAX_STACK_ITEMS:-12}"

required=(SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required env var: $name" >&2
    exit 1
  fi
done

if [[ -z "${CHECKOUT_MATH_HMAC_SECRET:-}" ]]; then
  CHECKOUT_MATH_HMAC_SECRET="$(openssl rand -hex 32)"
fi

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com

upsert_secret() {
  local name="$1"
  local value="$2"
  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=-
  else
    printf "%s" "$value" | gcloud secrets create "$name" --data-file=-
  fi
}

upsert_secret SUPABASE_URL "$SUPABASE_URL"
upsert_secret SUPABASE_ANON_KEY "$SUPABASE_ANON_KEY"
upsert_secret SUPABASE_SERVICE_ROLE_KEY "$SUPABASE_SERVICE_ROLE_KEY"
upsert_secret CHECKOUT_MATH_HMAC_SECRET "$CHECKOUT_MATH_HMAC_SECRET"

gcloud run deploy "$SERVICE_NAME" \
  --source services/checkout_math \
  --region "$REGION" \
  --allow-unauthenticated \
  --set-secrets SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,CHECKOUT_MATH_HMAC_SECRET=CHECKOUT_MATH_HMAC_SECRET:latest \
  --set-env-vars MIN_SAVINGS_PCT="$MIN_SAVINGS_PCT",MAX_STORE_COUNT="$MAX_STORE_COUNT",MAX_STACK_ITEMS="$MAX_STACK_ITEMS"

SERVICE_URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"
echo "CHECKOUT_MATH_URL=$SERVICE_URL"
echo "Set EXPO_PUBLIC_CHECKOUT_MATH_URL=$SERVICE_URL"
