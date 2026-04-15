-- ============================================================
-- Snippd — Vertex Export Cron + Storage Bucket
-- 009_vertex_export_cron.sql
-- Idempotent: safe to re-run
--
-- 1. Creates 'vertex-training-data' storage bucket (if not exists)
-- 2. Schedules snippd-vertex-export — every Sunday at 03:00 UTC
--
-- Prerequisites: vault secrets 'snippd_functions_url' + 'snippd_cron_secret' already set
-- ============================================================

-- ── Create storage bucket ────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'vertex-training-data',
  'vertex-training-data',
  false,
  104857600,  -- 100 MB limit per file
  ARRAY['application/x-ndjson', 'application/json', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS policies ─────────────────────────────────────
-- Only service role can read/write (no public access)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'vertex_training_service_role_only'
  ) THEN
    CREATE POLICY "vertex_training_service_role_only"
      ON storage.objects
      FOR ALL
      USING (bucket_id = 'vertex-training-data' AND auth.role() = 'service_role');
  END IF;
END $$;

-- ── Remove existing schedule (idempotent) ────────────────────
DO $$ BEGIN PERFORM cron.unschedule('snippd-vertex-export'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ── Vertex Export — every Sunday at 03:00 UTC ────────────────
SELECT cron.schedule(
  'snippd-vertex-export',
  '0 3 * * 0',
  $$
  SELECT net.http_post(
    url     := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_functions_url') || '/run-vertex-export',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'snippd_cron_secret')
    ),
    body    := '{"source":"cron"}'::jsonb
  )
  $$
);
