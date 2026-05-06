-- Migration: Fingerprint column on stack_candidates + honey-token SKU rows.
--
-- _fingerprint: SHA-256 hex of (normalized_key || retailer_key) — a
-- deterministic, searchable identity for dedup, graph cross-references,
-- and audit trails.  Computed at insertion time by the ingestion pipeline.
--
-- Honey tokens: rows with IDs starting with 'honey_' are decoy SKUs that
-- are served to clients in search results but never represent real products.
-- The client-side huntGuard.isHoneyToken() detects them by prefix.
-- Any attempt to add a honey-token SKU to cart is silently rejected and
-- logged to agentic_ledger — it fingerprints automated scrapers.
--
-- Safe to re-run: IF NOT EXISTS guards + ON CONFLICT DO NOTHING.

-- ── 1. _fingerprint column ─────────────────────────────────────────────────

ALTER TABLE public.stack_candidates
  ADD COLUMN IF NOT EXISTS _fingerprint text DEFAULT NULL;

COMMENT ON COLUMN public.stack_candidates._fingerprint IS
  'SHA-256 hex of (normalized_key || retailer_key). '
  'Computed by the ingestion pipeline at upsert time. '
  'Used for dedup, audit, and graph cross-reference.';

CREATE INDEX IF NOT EXISTS stack_candidates_fingerprint_idx
  ON public.stack_candidates (_fingerprint)
  WHERE _fingerprint IS NOT NULL;

-- ── 2. Backfill _fingerprint for existing rows ─────────────────────────────
-- Uses Postgres pgcrypto extension (enabled by default on Supabase).
-- digest() returns bytea → encode() converts to lowercase hex.

UPDATE public.stack_candidates
SET _fingerprint = encode(
  digest(COALESCE(normalized_key, '') || COALESCE(retailer_key, ''), 'sha256'),
  'hex'
)
WHERE _fingerprint IS NULL;

-- ── 3. Honey-token SKU rows in stack_candidates ────────────────────────────
-- These rows are served in search results like real deals.
-- IDs must start with 'honey_' so huntGuard.isHoneyToken() detects them O(1).
-- is_active = true so they appear in queries.
-- stack_rank_score = 0 so they never naturally surface at the top.
-- base_price / final_price are real-looking but never match any real product.

INSERT INTO public.stack_candidates (
  id,
  item_name,
  brand,
  size,
  category,
  retailer,
  retailer_key,
  normalized_key,
  base_price,
  final_price,
  sale_savings,
  coupon_savings,
  is_bogo,
  has_coupon,
  stack_rank_score,
  is_active,
  _fingerprint
) VALUES
  (
    'honey_sku_001',
    'Premium Select Blend',
    'Benchmark Foods',
    '16 oz',
    'pantry',
    'Publix',
    'publix',
    'benchmark_premium_select_blend',
    3.99,
    3.49,
    0.50,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('benchmark_premium_select_blendpublix', 'sha256'), 'hex')
  ),
  (
    'honey_sku_002',
    'Artisan Reserve Pack',
    'Heritage Mills',
    '12 ct',
    'bakery',
    'Kroger',
    'kroger',
    'heritage_artisan_reserve_pack',
    5.49,
    4.99,
    0.50,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('heritage_artisan_reserve_packkroger', 'sha256'), 'hex')
  ),
  (
    'honey_sku_003',
    'Classic Value Bundle',
    'Sunrise Brand',
    '24 ct',
    'beverage',
    'Walmart',
    'walmart',
    'sunrise_classic_value_bundle',
    8.99,
    7.99,
    1.00,
    NULL,
    false,
    false,
    0,
    true,
    encode(digest('sunrise_classic_value_bundlewalmart', 'sha256'), 'hex')
  )
ON CONFLICT (id) DO NOTHING;

-- ── 4. Ensure honey_token_skus registry is in sync ─────────────────────────
INSERT INTO public.honey_token_skus (id, description)
VALUES
  ('honey_sku_001', 'Decoy — Premium Select Blend (pantry/Publix)'),
  ('honey_sku_002', 'Decoy — Artisan Reserve Pack (bakery/Kroger)'),
  ('honey_sku_003', 'Decoy — Classic Value Bundle (beverage/Walmart)')
ON CONFLICT DO NOTHING;
