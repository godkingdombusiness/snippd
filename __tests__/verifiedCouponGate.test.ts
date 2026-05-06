import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function file(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Verified Coupon Gate', () => {
  it('defines the verified coupon evidence tables and user-facing live view', () => {
    const sql = file('supabase/migrations/20260430_verified_coupon_gate_top3_engine.sql');

    expect(sql).toContain('create table if not exists public.digital_coupon_evidence');
    expect(sql).toContain('create table if not exists public.retailer_coupon_sources');
    expect(sql).toContain('create table if not exists public.coupon_refresh_runs');
    expect(sql).toContain('create or replace view public.v_live_verified_digital_coupons');
    expect(sql).toContain("verification_status = 'verified'");
    expect(sql).toContain("verified_at >= now() - interval '12 hours'");
    expect(sql).toContain('exact_coupon_url <> source_page_url');
    expect(sql).toContain('digital_coupon_evidence_hash_uidx');
  });

  it('adds operational health checks and an hourly refresh schedule for coupon accuracy', () => {
    const sql = file('supabase/migrations/20260505_coupon_accuracy_ops.sql');

    expect(sql).toContain('create or replace view public.v_coupon_accuracy_health');
    expect(sql).toContain('create or replace function public.get_coupon_accuracy_health()');
    expect(sql).toContain('live_verified_coupon_count');
    expect(sql).toContain('adapter_required_source_count');
    expect(sql).toContain('coupon_adapters_required');
    expect(sql).toContain('latest_verified_at');
    expect(sql).toContain('digital_coupon_evidence_hash_all_uidx');
    expect(sql).toContain('snippd-coupon-refresh');
    expect(sql).toContain('/run-coupon-refresh');
  });

  it('does not let the app-facing clipping service read legacy coupon RPCs', () => {
    const service = file('src/services/CouponClippingService.ts');

    expect(service).toContain('get_verified_clippable_coupons');
    expect(service).toContain('calculate_verified_digital_savings');
    expect(service).not.toContain("db.rpc('get_clippable_coupons'");
    expect(service).not.toContain("db.rpc('calculate_digital_savings'");
  });

  it('uses the coupon-gated stack candidate view for cart engines', () => {
    const edge = file('supabase/functions/get-cart-options/index.ts');
    const service = file('src/services/cartEngine.ts');

    expect(edge).toContain("from('v_coupon_verified_stack_candidates')");
    expect(service).toContain("from('v_coupon_verified_stack_candidates')");
  });

  it('returns Top 3 payloads from the omni comparison function with verified coupon fields', () => {
    const edge = file('supabase/functions/get-omni-store-comparison/index.ts');

    expect(edge).toContain('handleTop3Engine');
    expect(edge).toContain("from('v_live_verified_digital_coupons')");
    expect(edge).toContain('verified_coupon_ids');
    expect(edge).toContain('exact_coupon_urls');
    expect(edge).toContain('split_cart_recommendation');
  });

  it('ships service-role coupon refresh and health endpoints for verified evidence', () => {
    const refresh = file('supabase/functions/run-coupon-refresh/index.ts');
    const health = file('supabase/functions/coupon-accuracy-health/index.ts');

    expect(refresh).toContain('digital_coupon_evidence');
    expect(refresh).toContain('coupon_refresh_runs');
    expect(refresh).toContain('mark_stale_coupons_for_run');
    expect(refresh).toContain('loadDollarGeneralCoupons');
    expect(refresh).toContain('dollar_general_public_api');
    expect(refresh).toContain('adapter_required');
    expect(refresh).toContain('exact_coupon_url');
    expect(refresh).toContain('source_page_url');
    expect(refresh).toContain('evidence_hash');

    expect(health).toContain('get_coupon_accuracy_health');
    expect(health).toContain('503');
  });
});
