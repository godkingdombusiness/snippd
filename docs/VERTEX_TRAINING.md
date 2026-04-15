# Snippd — Vertex AI Training Data Pipeline

> Exports labeled behavioral data to Supabase Storage for Vertex AI model training.

---

## Overview

The Vertex AI training pipeline collects 90 days of behavioral signals from the Snippd platform and produces labeled JSONL files suitable for training a recommendation ranking model.

The pipeline runs every Sunday at 03:00 UTC via pg_cron → `run-vertex-export` Edge Function.

---

## Architecture

```
event_stream
    + recommendation_exposures      ─┐
    + user_state_snapshots           ├─→ run-vertex-export → vertex-training-data bucket
    + stack_results                 ─┘      (JSONL, daily file)
```

---

## Label Schema

Each row in the training file corresponds to one behavioral event and is labeled by outcome:

| Event | Label | Meaning |
|---|---|---|
| `item_purchased`, `receipt_scanned`, `purchase_completed` | `1.0` | Converted — strong positive signal |
| `deal_accepted`, `offer_added_to_cart`, `recommendation_accepted` | `0.8` | High intent — accepted but not confirmed purchased |
| `deal_clicked`, `recommendation_clicked`, `offer_viewed` | `0.4` | Engaged — showed interest |
| `deal_dismissed`, `recommendation_dismissed`, `offer_skipped` | `0.0` | Negative signal — explicit rejection |
| All other events | `0.1` | Weak signal |

---

## Training Row Schema (JSONL)

Each line in the output file is a JSON object with the following fields:

| Field | Type | Source |
|---|---|---|
| `user_id` | uuid | event_stream |
| `session_id` | uuid or null | event_stream |
| `event_name` | string | event_stream |
| `object_type` | string or null | event_stream |
| `object_id` | uuid or null | event_stream |
| `retailer_key` | string or null | event_stream |
| `event_at` | ISO timestamp | event_stream |
| `exposure_id` | uuid or null | recommendation_exposures |
| `recommendation_type` | string or null | recommendation_exposures |
| `rank_position` | integer or null | recommendation_exposures |
| `stack_rank_score` | float or null | recommendation_exposures |
| `savings_pct` | float or null | recommendation_exposures |
| `has_coupon` | boolean or null | recommendation_exposures |
| `primary_category` | string or null | recommendation_exposures |
| `loyalty_tier` | string or null | user_state_snapshots (latest) |
| `preference_vector` | JSON object or null | user_state_snapshots (latest) |
| `weekly_spend_cents` | integer or null | user_state_snapshots (latest) |
| `final_price_cents` | integer or null | stack_results |
| `savings_cents` | integer or null | stack_results |
| `stack_complexity` | integer or null | stack_results |
| `label` | float 0.0–1.0 | Derived from event_name |

---

## Storage

- **Bucket:** `vertex-training-data`
- **Path:** `training_data/vertex_training_YYYY-MM-DD.jsonl`
- **Format:** JSONL (one JSON object per line)
- **Content-Type:** `application/x-ndjson`
- **Retention:** Files are overwritten on each weekly run (same-day re-runs produce new version via `upsert: true`)

### Creating the bucket

Run once in Supabase Dashboard → Storage → New Bucket:
```
Name: vertex-training-data
Public: false (private)
```

Or via SQL:
```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('vertex-training-data', 'vertex-training-data', false)
ON CONFLICT (id) DO NOTHING;
```

---

## Cron Schedule

Managed by `supabase/migrations/009_vertex_export_cron.sql`:

```
snippd-vertex-export: 0 3 * * 0  (every Sunday at 03:00 UTC)
```

Uses Vault secrets `snippd_functions_url` + `snippd_cron_secret` for auth.

---

## Edge Function

**File:** `supabase/functions/run-vertex-export/index.ts`
**Endpoint:** `POST /functions/v1/run-vertex-export`
**Auth:** `x-cron-secret` or service-role `Bearer` JWT

### Response
```json
{
  "ok": true,
  "rows_exported": 14823,
  "storage_path": "training_data/vertex_training_2026-04-14.jsonl",
  "started_at": "2026-04-14T03:00:01.234Z",
  "completed_at": "2026-04-14T03:02:47.891Z"
}
```

---

## Node.js Service

**File:** `src/services/vertexTrainingExport.ts`

Run manually:
```bash
npx ts-node --project tsconfig.test.json src/services/vertexTrainingExport.ts
```

Requires: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

---

## Vertex AI Integration (Next Steps)

1. **Dataset import:** Point a Vertex AI Tabular Dataset at `gs://your-gcs-bucket/vertex_training_*.jsonl` (sync from Supabase Storage via a Cloud Function or manual export)
2. **AutoML model:** Train a regression model on the `label` column using all other fields as features
3. **Online serving:** Deploy the model to a Vertex AI Endpoint and configure `VERTEX_ENDPOINT_URL` + `VERTEX_API_KEY` in `.env`
4. **Score injection:** The `vertexFeatureBuilder.ts` service already calls the Vertex endpoint and writes scores back to `user_preference_scores.vertex_score`

---

## Log Visibility

All exports are logged to `ingestion_run_log`:

```sql
SELECT source_key, stage, status, message, metadata, created_at
FROM ingestion_run_log
WHERE source_key = 'run-vertex-export'
ORDER BY created_at DESC
LIMIT 10;
```
