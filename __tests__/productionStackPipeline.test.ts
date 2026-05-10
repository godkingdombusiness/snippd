import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CouponStackingEngine, DEFAULT_POLICY } from '../src/services/stacking/stackingEngine';
import type { StackItem } from '../src/types/stacking';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('production stack pipeline schema and services', () => {
  it('adds additive production pipeline tables and counters', () => {
    const sql = read('supabase/migrations/20260510_production_stack_pipeline.sql');
    [
      'CREATE TABLE IF NOT EXISTS public.retailer_data_sources',
      'CREATE TABLE IF NOT EXISTS public.normalized_coupons',
      'CREATE TABLE IF NOT EXISTS public.coupon_activation_links',
      'CREATE TABLE IF NOT EXISTS public.user_stack_feedback',
      'ALTER TABLE public.stack_generation_runs',
      'offers_ingested int NOT NULL DEFAULT 0',
      'candidates_approved int NOT NULL DEFAULT 0',
      'CREATE OR REPLACE VIEW public.v_normalized_coupon_inventory',
    ].forEach((needle) => expect(sql).toContain(needle));
  });

  it('provides Cloud Run ingestion endpoints without hardcoded secrets', () => {
    const service = read('services/offer_ingestion/main.py');
    [
      '@app.post("/ingest/retailer")',
      '@app.post("/ingest/dollar-general")',
      '@app.post("/ingest/kroger")',
      '@app.post("/ingest/manual-upload")',
      '@app.get("/health")',
      'SUPABASE_SERVICE_ROLE_KEY',
      'no_payload_rows',
    ].forEach((needle) => expect(service).toContain(needle));

    expect(service).not.toMatch(/eyJ[a-zA-Z0-9_-]{20,}/);
    expect(service).not.toContain('AIza');
  });

  it('keeps Vertex reasoning behind configuration and strict JSON validation', () => {
    const reasoning = read('services/offer_ingestion/vertex_stack_reasoning.py');
    expect(reasoning).toContain('VERTEX_AI_ENABLED');
    expect(reasoning).toContain('response_mime_type="application/json"');
    expect(reasoning).toContain('Never invent prices, coupons, retailers, or savings');
    expect(reasoning).toContain('confidence_below_floor');
  });

  it('enhances generate-stacks with normalized coupon inventory, run logging, and feed writes', () => {
    const service = read('services/generate_stacks/main.py');
    expect(service).toContain('_create_generation_run');
    expect(service).toContain('_finish_generation_run');
    expect(service).toContain('v_normalized_coupon_inventory');
    expect(service).toContain('"coupon_activation_links"');
    expect(service).toContain('"net_after_rebate_cents"');
  });
});

describe('deterministic stack math', () => {
  it('calculates sale, coupon, rebate, final OOP, and net after rebate deterministically', async () => {
    const engine = new CouponStackingEngine();
    const items: StackItem[] = [
      {
        id: 'tide',
        name: 'Tide Pods',
        quantity: 1,
        regularPriceCents: 1299,
        offers: [
          { id: 'sale', offerType: 'SALE', description: 'Sale', discountCents: 300, stackable: true },
          { id: 'digital', offerType: 'DIGITAL_COUPON', description: 'Digital coupon', discountCents: 200, stackable: true },
          { id: 'rebate', offerType: 'REBATE', description: 'Rebate', rebateCents: 100, stackable: true },
        ],
      },
    ];

    const result = await engine.computeWithPolicy('basket-1', items, DEFAULT_POLICY);

    expect(result.basketRegularCents).toBe(1299);
    expect(result.basketFinalCents).toBe(799);
    expect(result.inStackSavingsCents).toBe(500);
    expect(result.rebateCents).toBe(100);
    expect(result.totalSavingsCents).toBe(600);
  });
});

describe('sample ingestion and app_home_feed integration contract', () => {
  it('normalizes sample retailer rows and writes only real payload rows', () => {
    const service = read('services/offer_ingestion/main.py');
    expect(service).toContain('normalize_offer');
    expect(service).toContain('normalize_coupon');
    expect(service).toContain('_sb_post("normalized_offers", offer_rows, on_conflict="source_offer_id")');
    expect(service).toContain('_sb_post("normalized_coupons", coupon_rows)');
    expect(service).toContain('_candidate_rows(reasoning.candidates');
  });

  it('publishes approved stack cards to app_home_feed and returns clean low-yield responses', () => {
    const service = read('services/generate_stacks/main.py');
    expect(service).toContain('save_stack_to_home_feed(stack)');
    expect(service).toContain('"status":           status');
    expect(service).toContain('"LOW_YIELD_WEEK"');
    expect(service).not.toContain('insert_dg_stacks');
  });
});
