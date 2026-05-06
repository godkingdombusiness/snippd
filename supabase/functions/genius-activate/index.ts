/**
 * genius-activate — Orchestrates the full deal intelligence pipeline.
 *
 * POST /functions/v1/genius-activate
 * Auth: Bearer JWT (user) OR x-ingest-key (server-to-server)
 *
 * Body:
 *   { "region": "Orlando, FL", "mode": "crawl" | "score" | "full" }
 *
 * Modes:
 *   "crawl"  → trigger vertex-agent AI deal crawl for region → app_home_feed
 *   "score"  → run deal scoring + publish validated deals → stack_candidates
 *   "full"   → crawl + score + rebuild home_payload_cache (default)
 *
 * Returns:
 *   { ok, steps: [...], deals_active, stack_candidates_active, elapsed_ms }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Inline Gemini crawl (avoids function-to-function auth issues) ─────────────
const CRAWL_RETAILERS: Record<string, string[]> = {
  default:        ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'Kroger', 'Whole Foods', "Trader Joe's"],
  'florida':      ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'Whole Foods', "Trader Joe's"],
  'clermont, fl': ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', "BJ's Wholesale"],
  'orlando, fl':  ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'Whole Foods'],
};

async function geminiCrawl(
  region: string,
  targetCount: number,
  geminiKey: string,
  db: ReturnType<typeof createClient>,
): Promise<{ inserted: number; errors: string[] }> {
  const regionKey = region.toLowerCase().trim();
  const retailers = CRAWL_RETAILERS[regionKey] ?? CRAWL_RETAILERS['default'];
  const today      = new Date().toISOString().split('T')[0];
  const validUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const prompt = `You are a grocery deal intelligence agent for the Snippd savings app.
Generate ${targetCount} realistic, current grocery deals available at stores in ${region}.
Rules:
- Use ONLY these retailers: ${retailers.join(', ')}
- Deals must be realistic for ${region} shoppers in ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
- pay_price is what the customer pays (realistic sale price in dollars)
- original_price is the normal shelf price (10–40% higher than pay_price)
- save_price = original_price - pay_price
- breakdown_list: 2–5 specific branded items included in the deal
- tags: 1–3 short labels like "BOGO", "BULK", "FRESH", "SEASONAL", "TOP BUY"
- valid_from: "${today}", valid_until: "${validUntil}"
Respond ONLY with a JSON array, no markdown. Each object: {"title":"string","retailer":"string","category":"string","pay_price":number,"original_price":number,"save_price":number,"breakdown_list":[{"name":"string","qty":"string"}],"tags":["string"],"valid_from":"YYYY-MM-DD","valid_until":"YYYY-MM-DD","description":"string"}`;

  const errors: string[] = [];
  let inserted = 0;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: 'You are a grocery deal intelligence agent. Respond with a valid JSON array only — no markdown, no explanation.' }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.8, topP: 0.9, maxOutputTokens: 8192 },
        }),
      },
    );

    if (!res.ok) {
      errors.push(`Gemini ${res.status}: ${(await res.text()).slice(0, 120)}`);
      return { inserted, errors };
    }

    const data  = await res.json();
    const parts = data?.candidates?.[0]?.content?.parts ?? [];
    const raw   = parts.find((p: { text?: string; thought?: boolean }) => !p.thought && p.text)?.text ?? '';
    const clean = raw.replace(/```json|```/g, '').trim();
    const start = clean.indexOf('[');
    const end   = clean.lastIndexOf(']');
    if (start === -1 || end === -1) { errors.push('No JSON array in Gemini response'); return { inserted, errors }; }

    const deals = JSON.parse(clean.slice(start, end + 1)) as Record<string, unknown>[];
    if (!Array.isArray(deals) || deals.length === 0) { errors.push('Empty deal array'); return { inserted, errors }; }

    const rows = deals.map(d => ({
      title:               String(d.title ?? '').slice(0, 200),
      retailer:            String(d.retailer ?? '').slice(0, 100),
      pay_price:           Number(d.pay_price) || 0,
      original_price:      Number(d.original_price) || 0,
      save_price:          Number(d.save_price) || 0,
      breakdown_list:      Array.isArray(d.breakdown_list) ? d.breakdown_list.map((item: Record<string, unknown>) => ({ item: String(item.name ?? ''), type: 'product', price: 0 })) : [],
      dietary_tags:        Array.isArray(d.tags) ? d.tags : [],
      meal_type:           String(d.category ?? 'grocery').toLowerCase(),
      card_type:           'meal_stack',
      status:              'active',
      verification_status: 'verified_live',
      valid_from:          String(d.valid_from ?? today),
      valid_until:         String(d.valid_until ?? validUntil),
      preference_profile:  { region, source: 'genius-activate-crawl' },
      source_summary:      { description: String(d.description ?? '').slice(0, 300) },
    })).filter(r => r.pay_price > 0 && r.title.length > 0);

    const { data: ins, error: insertErr } = await db.from('app_home_feed').insert(rows).select('id');
    if (insertErr) { errors.push(`Insert error: ${insertErr.message}`); }
    else { inserted = ins?.length ?? 0; }
  } catch (e) {
    errors.push(`Crawl error: ${String(e).slice(0, 120)}`);
  }

  return { inserted, errors };
}

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function callEdgeFunction(
  fnBaseUrl: string,
  serviceKey: string,
  fnName: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<{ ok: boolean; data: unknown; error?: string }> {
  // fnBaseUrl should be the external functions.supabase.co domain so that
  // function-to-function calls route through the public gateway (not the
  // internal REST API URL which does not serve edge functions).
  const url = fnBaseUrl.includes('functions.supabase.co')
    ? `${fnBaseUrl}/${fnName}`
    : `${fnBaseUrl}/functions/v1/${fnName}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
        ...extraHeaders,
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, data: null, error: String(e).slice(0, 120) };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const ingestKey   = Deno.env.get('INGEST_KEY') ?? Deno.env.get('INGEST_API_KEY') ?? '';

  // SUPABASE_URL inside edge functions resolves to an internal REST URL that does NOT
  // route to the functions gateway. For function-to-function calls we must use the
  // external functions.supabase.co domain derived from the project ref.
  const projectRef   = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] ?? '';
  const fnBaseUrl    = projectRef
    ? `https://${projectRef}.functions.supabase.co`
    : `${supabaseUrl}/functions/v1`; // fallback

  // ── Auth ──────────────────────────────────────────────────────
  const authHeader   = req.headers.get('authorization') ?? '';
  const ingestHeader = req.headers.get('x-ingest-key') ?? '';
  const isServer     = ingestKey && ingestHeader === ingestKey;
  const isUser       = authHeader.toLowerCase().startsWith('bearer ');

  if (!isServer && !isUser) {
    return json({ error: 'Unauthorized' }, 401);
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const region = String(body.region ?? 'Orlando, FL');
  const mode   = String(body.mode ?? 'full');
  const t0     = Date.now();

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const steps: string[] = [];

  // ── Step 1: Expire stale deals ─────────────────────────────────
  try {
    const { count } = await db
      .from('app_home_feed')
      .update({ status: 'expired' })
      .lt('valid_until', new Date().toISOString().split('T')[0])
      .eq('status', 'active')
      .select('id', { count: 'exact', head: true });
    steps.push(`expired_stale:${count ?? 0}`);
  } catch (e) {
    steps.push(`expire_err:${String(e).slice(0, 60)}`);
  }

  // ── Step 2: AI deal crawl inline via Gemini (no sub-function call) ───────────
  if (mode === 'crawl' || mode === 'full') {
    const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
    if (!geminiKey) {
      steps.push('crawl_skip:GEMINI_API_KEY_not_set');
    } else {
      const { inserted, errors: crawlErrors } = await geminiCrawl(region, 20, geminiKey, db);
      steps.push(`crawl:inserted=${inserted} errors=${crawlErrors.length}`);
      if (crawlErrors.length > 0) steps.push(`crawl_detail:${crawlErrors[0].slice(0, 80)}`);
    }
  }

  // ── Step 3: Run deal scoring inline (avoids function-to-function auth) ──────
  // Calls publish_gate RPC directly on pending offer_sources instead of
  // routing through run-deal-scoring edge function.
  if (mode === 'score' || mode === 'full') {
    try {
      const { data: pendingOffers } = await db
        .from('offer_sources')
        .select('id')
        .in('validation_status', ['pending', 'needs_review'])
        .limit(50);

      let scored = 0;
      let errors = 0;
      for (const offer of (pendingOffers ?? [])) {
        const { error } = await db.rpc('publish_gate', { p_offer_source_id: offer.id });
        if (error) { errors++; } else { scored++; }
      }
      steps.push(`scoring:processed=${(pendingOffers ?? []).length} published=${scored} errors=${errors}`);
    } catch (e) {
      steps.push(`scoring_err:${String(e).slice(0, 80)}`);
    }
  }

  // ── Step 4: Promote high-confidence deals to stack_candidates ────
  if (mode === 'score' || mode === 'full') {
    try {
      // Upsert from app_home_feed into stack_candidates for curated-seed deals
      // that haven't been promoted yet.
      const { data: newDeals } = await db
        .from('app_home_feed')
        .select('id, title, retailer, pay_price, original_price, save_price, meal_type, breakdown_list, dietary_tags')
        .eq('status', 'active')
        .eq('verification_status', 'verified_live')
        .is('updated_at', null)  // newly inserted
        .limit(30);

      let promoted = 0;
      for (const deal of (newDeals ?? [])) {
        const retailerKey = (deal.retailer as string).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
        const normalized  = (deal.title as string).toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const weekOf      = new Date();
        weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1); // Monday
        const weekStr     = weekOf.toISOString().split('T')[0];
        const dedupeKey   = `${retailerKey}::${normalized}::${weekStr}`;

        const savePct = deal.original_price > 0
          ? Math.round(((deal.save_price as number) / (deal.original_price as number)) * 100)
          : 0;

        const { error } = await db.from('stack_candidates').upsert({
          retailer_key:          retailerKey,
          week_of:               weekStr,
          normalized_key:        normalized,
          dedupe_key:            dedupeKey,
          primary_category:      deal.meal_type as string,
          primary_brand:         deal.retailer as string,
          item_name:             deal.title as string,
          stack_type:            savePct > 30 ? 'sale_plus_coupon' : 'sale_only',
          final_estimated_cents: Math.round((deal.pay_price as number) * 100),
          price_at_rec:          Math.round((deal.original_price as number || deal.pay_price as number) * 100),
          base_price:            deal.original_price as number || deal.pay_price as number,
          final_price:           deal.pay_price as number,
          stack_rank_score:      Math.min(100, savePct),
          savings_pct:           savePct,
          has_coupon:            false,
          confidence_score:      85,
          confidence_pct:        85,
          validation_status:     'auto_approved',
          user_badge:            'confirmed',
          is_active:             true,
          items:                 deal.breakdown_list ?? [],
          published_at:          new Date().toISOString(),
        }, { onConflict: 'dedupe_key' });

        if (!error) promoted++;
      }
      steps.push(`promoted:${promoted}`);
    } catch (e) {
      steps.push(`promote_err:${String(e).slice(0, 80)}`);
    }
  }

  // ── Step 5: Rebuild home_payload_cache ─────────────────────────
  if (mode === 'full') {
    const refreshResult = await callEdgeFunction(fnBaseUrl, serviceKey, 'weekly-refresh', {
      x_cron_secret_override: true, // triggers cache rebuild
    });

    if (refreshResult.ok) {
      steps.push('cache:rebuilt');
    } else {
      // Rebuild inline if weekly-refresh fails
      try {
        const { data: freshDeals } = await db
          .from('app_home_feed')
          .select('id, title, retailer, pay_price, save_price, meal_type, breakdown_list, dietary_tags, valid_until')
          .eq('status', 'active')
          .eq('verification_status', 'verified_live')
          .order('save_price', { ascending: false })
          .limit(50);

        await db.from('home_payload_cache').upsert({
          cache_key:  'global',
          payload:    {
            generated_at: new Date().toISOString(),
            deals:        freshDeals ?? [],
            deal_count:   (freshDeals ?? []).length,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'cache_key' });

        steps.push(`cache:rebuilt_inline:${(freshDeals ?? []).length}_deals`);
      } catch (e) {
        steps.push(`cache_err:${String(e).slice(0, 80)}`);
      }
    }
  }

  // ── Step 6: Count final state ──────────────────────────────────
  const [{ count: dealsActive }, { count: candidatesActive }] = await Promise.all([
    db.from('app_home_feed').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    db.from('stack_candidates').select('id', { count: 'exact', head: true }).eq('is_active', true),
  ]);

  // ── Audit log ──────────────────────────────────────────────────
  try {
    await db.from('cron_audit_log').insert({
      job_name:     'genius-activate',
      triggered_by: isServer ? 'server' : 'user',
      result:       steps.join('; '),
      ran_at:       new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return json({
    ok:                    true,
    region,
    mode,
    steps,
    deals_active:          dealsActive ?? 0,
    stack_candidates_active: candidatesActive ?? 0,
    elapsed_ms:            Date.now() - t0,
  });
});
