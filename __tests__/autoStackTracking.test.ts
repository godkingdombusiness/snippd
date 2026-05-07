import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function file(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('Automatic Stack Tracking', () => {
  it('adds only additive stack audit and feedback objects', () => {
    const sql = file('supabase/migrations/20260507_auto_stack_tracking.sql');

    expect(sql).toContain('ALTER TABLE public.stack_candidates');
    expect(sql).toContain('ALTER TABLE public.app_home_feed');
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS source_tables_used');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.stack_generation_runs');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.stack_candidate_audit');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.stack_training_feedback');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.stack_generation_rules');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_generate_auto_stack_candidates');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_record_stack_training_feedback');
    expect(sql).toContain('CREATE OR REPLACE VIEW public.v_stack_review_training_dashboard');

    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b[\s\S]*\bRENAME\b/i);
    expect(sql).not.toMatch(/\bTRUNCATE\b/i);
  });

  it('keeps generated results on existing app-facing tables', () => {
    const sql = file('supabase/migrations/20260507_auto_stack_tracking.sql');
    const cloudRun = file('services/generate_stacks/main.py');

    expect(sql).toContain('INSERT INTO public.stack_candidates');
    expect(sql).toContain('INSERT INTO public.app_home_feed');
    expect(sql).toContain("'SNIPPD_GENERATED'");
    expect(sql).toContain("'system_generated_verified'");
    expect(sql).toContain("'verified_live'");

    expect(cloudRun).toContain('rpc_run_stack_thinking_engine');
    expect(cloudRun).toContain('_sb_select("stack_candidates"');
    expect(cloudRun).toContain('_sb_upsert("app_home_feed"');
  });

  it('ships an admin-only read/review surface with explicit feedback actions', () => {
    const edge = file('supabase/functions/admin-deal-review/index.ts');
    const screen = file('screens/StackReviewTrainingScreen.js');
    const app = file('App.js');

    expect(edge).toContain("action === 'stack-audit'");
    expect(edge).toContain("action === 'stack-runs'");
    expect(edge).toContain("action === 'stack-feedback'");
    expect(edge).toContain('rpc_record_stack_training_feedback');

    expect(screen).toContain('Read-only until an admin action is clicked');
    expect(screen).toContain("'approve'");
    expect(screen).toContain("'reject'");
    expect(screen).toContain("'needs_review'");
    expect(screen).toContain("'mark_price_wrong'");
    expect(screen).toContain("'mark_coupon_missing'");
    expect(screen).toContain("'add_note'");

    expect(app).toContain('StackReviewTrainingScreen');
  });

  it('adds a backend Stack Thinking Engine and budget optimizer', () => {
    const sql = file('supabase/migrations/20260507_stack_thinking_engine.sql');
    const cloudRun = file('services/generate_stacks/main.py');
    const edge = file('supabase/functions/stack-automation/index.ts');

    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_run_stack_thinking_engine');
    expect(sql).toContain('CREATE OR REPLACE FUNCTION public.rpc_build_budget_stack_plan');
    expect(sql).toContain('CREATE OR REPLACE VIEW public.v_stack_thinking_engine_results');
    expect(sql).toContain('BOGO_STACK');
    expect(sql).toContain('CLEARANCE_COUPON_STACK');
    expect(sql).toContain('DIGITAL_COUPON_STACK');
    expect(sql).toContain('REBATE_STACK');
    expect(sql).toContain('THRESHOLD_STACK');
    expect(sql).toContain('BASKET_ENGINEERED_STACK');
    expect(sql).toContain('customer_instructions');
    expect(sql).toContain('budget_fit');
    expect(sql).toContain('INSERT INTO public.stack_candidates');
    expect(sql).toContain('UPDATE public.app_home_feed');
    expect(sql).toContain('INSERT INTO public.app_home_feed');

    expect(sql).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(sql).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(sql).not.toMatch(/\bALTER\s+TABLE\b[\s\S]*\bRENAME\b/i);

    expect(cloudRun).toContain('/stack-thinking-engine');
    expect(cloudRun).toContain('/budget-optimizer');
    expect(cloudRun).toContain('rpc_run_stack_thinking_engine');
    expect(cloudRun).toContain('rpc_build_budget_stack_plan');
    expect(edge).toContain('rpc_run_stack_thinking_engine');
    expect(edge).toContain('rpc_build_budget_stack_plan');
  });
});
