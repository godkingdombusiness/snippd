# checkout-math Cloud Run service

Authoritative server-side math for Snippd checkout displays.

## Required environment

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CHECKOUT_MATH_HMAC_SECRET`
- `MIN_SAVINGS_PCT` optional, defaults to `60`
- `MAX_STORE_COUNT` optional, defaults to `2`
- `MAX_STACK_ITEMS` optional, defaults to `12`

## Deploy

```bash
gcloud run deploy checkout-math \
  --source services/checkout_math \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,CHECKOUT_MATH_HMAC_SECRET=CHECKOUT_MATH_HMAC_SECRET:latest \
  --set-env-vars MIN_SAVINGS_PCT=60,MAX_STORE_COUNT=2,MAX_STACK_ITEMS=12
```

The endpoint still requires the app user's Supabase Bearer token.
