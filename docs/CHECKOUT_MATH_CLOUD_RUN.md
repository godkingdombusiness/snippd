# Checkout Math Cloud Run

`checkout-math` is the authoritative pricing endpoint. The app should display this response and must not calculate checkout totals locally.

## Deploy Now

Create secrets once:

```bash
printf '%s' 'https://YOUR_PROJECT.supabase.co' | gcloud secrets create SUPABASE_URL --data-file=-
printf '%s' 'YOUR_SUPABASE_ANON_KEY' | gcloud secrets create SUPABASE_ANON_KEY --data-file=-
printf '%s' 'YOUR_SUPABASE_SERVICE_ROLE_KEY' | gcloud secrets create SUPABASE_SERVICE_ROLE_KEY --data-file=-
openssl rand -hex 32 | gcloud secrets create CHECKOUT_MATH_HMAC_SECRET --data-file=-
```

Deploy:

```bash
gcloud run deploy checkout-math \
  --source services/checkout_math \
  --region us-central1 \
  --allow-unauthenticated \
  --set-secrets SUPABASE_URL=SUPABASE_URL:latest,SUPABASE_ANON_KEY=SUPABASE_ANON_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=SUPABASE_SERVICE_ROLE_KEY:latest,CHECKOUT_MATH_HMAC_SECRET=CHECKOUT_MATH_HMAC_SECRET:latest \
  --set-env-vars MIN_SAVINGS_PCT=60,MAX_STORE_COUNT=2,MAX_STACK_ITEMS=12
```

Then set the returned service URL in Expo:

```bash
EXPO_PUBLIC_CHECKOUT_MATH_URL=https://checkout-math-...a.run.app
```

## Request

```json
{
  "plan_id": "user_publix_2026-04-29",
  "cart_items": ["TIDE_92OZ", "CHARMIN_9M"]
}
```

Requires the user's Supabase JWT in `Authorization: Bearer <token>`.

## Response

```json
{
  "ok": true,
  "plan_id": "user_publix_2026-04-29",
  "status": "APPROVED",
  "validation_errors": [],
  "regular_total_cents": 11952,
  "you_pay_cents": 5152,
  "savings_cents": 6800,
  "savings_pct": 61.3,
  "retailer_nodes": ["publix_clermont_001"],
  "store_yield_rank": [
    {
      "retailer_node": "publix_clermont_001",
      "item_count": 12,
      "regular_total_cents": 11952,
      "you_pay_cents": 5152,
      "savings_cents": 6800,
      "savings_pct": 61.3
    }
  ],
  "stack_expires_at": "2026-05-05",
  "math_source": "cloud_run_checkout_math",
  "computed_at": "2026-04-28T09:00:00Z",
  "signature": "..."
}
```
