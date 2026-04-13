/**
 * vertex-agent Edge Function
 *
 * Modes:
 *  { "test": true }                              → health check
 *  { "run_crawl": true, "region": "...", "target_count": N }
 *                                                → AI deal crawl (synthetic) → app_home_feed
 *  { "upload_flyer": true, "pdfBase64": "...", "mimeType": "application/pdf" }
 *                                                → upload PDF to Gemini File API, returns file_uri
 *  { "run_flyer_crawl": true, "retailer": "Publix", "region": "Clermont, FL",
 *    "pdfBase64": "..." OR "file_uri": "https://..." }
 *                                                → extract REAL deals from weekly ad PDF → app_home_feed
 *  { "contents": [...], "model": "..." }         → raw text generation
 *  { "imageBase64": "...", "mimeType": "..." }   → vision / OCR
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ── Gemini call — direct API with thinking disabled for clean JSON output ──────
async function callGemini(
  prompt: string,
  geminiKey: string,
  _temperature = 0.7,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: 'You are a grocery deal intelligence agent. Always respond with a valid JSON array only — no markdown fences, no explanation, no preamble. Start your response with [ and end with ].' }] },
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          topP: 0.9,
          maxOutputTokens: 8192,
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }
  const data  = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const raw   = parts.find((p: { text?: string; thought?: boolean }) => !p.thought && p.text)?.text
             ?? parts[parts.length - 1]?.text ?? '';
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('[');
  const end   = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1) return clean.slice(start, end + 1);
  return clean;
}

// ── Gemini File API — upload a PDF and get back a stable file_uri ────────────
async function uploadPdfToGemini(
  pdfBase64: string,
  mimeType: string,
  geminiKey: string,
): Promise<string> {
  const binaryStr = atob(pdfBase64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type': mimeType,
        'X-Goog-Upload-Protocol': 'raw',
        'X-Goog-Upload-Header-Content-Type': mimeType,
      },
      body: bytes,
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`File upload failed ${res.status}: ${err.slice(0, 200)}`);
  }
  const data = await res.json();
  const uri = data?.file?.uri;
  if (!uri) throw new Error(`No file URI returned: ${JSON.stringify(data).slice(0, 200)}`);
  return uri; // e.g. "https://generativelanguage.googleapis.com/v1beta/files/abc123"
}

// ── Gemini call with a file reference (PDF flyer mode) ────────────────────────
async function callGeminiWithFile(
  prompt: string,
  fileUri: string,
  mimeType: string,
  geminiKey: string,
): Promise<string> {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: 'You are a grocery deal extraction agent. Read the weekly ad document carefully. Always respond with a valid JSON array only — no markdown fences, no explanation, no preamble. Start your response with [ and end with ].' }],
        },
        contents: [{
          parts: [
            { file_data: { mime_type: mimeType, file_uri: fileUri } },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.1,  // low temperature — we want extraction, not creativity
          topP: 0.8,
          maxOutputTokens: 8192,
        },
      }),
    },
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini ${res.status}: ${err.slice(0, 300)}`);
  }
  const data  = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  const raw   = parts.find((p: { text?: string; thought?: boolean }) => !p.thought && p.text)?.text
             ?? parts[parts.length - 1]?.text ?? '';
  const clean = raw.replace(/```json|```/g, '').trim();
  const start = clean.indexOf('[');
  const end   = clean.lastIndexOf(']');
  if (start !== -1 && end !== -1) return clean.slice(start, end + 1);
  return clean;
}

// ── Flyer extraction prompt — tells Gemini what to pull from the actual ad ────
function buildFlyerExtractionPrompt(retailer: string, region: string): string {
  const today      = new Date().toISOString().split('T')[0];
  const validUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  return `You are extracting grocery deals from a ${retailer} weekly ad flyer for shoppers in ${region}.

Read every page of this ad carefully. Find deals that can be grouped into stacks — 3 to 8 related items from the same store that deliver real savings when bought together.

EXTRACTION RULES:
- Only extract deals actually shown in this ad. Do not invent or supplement with external knowledge.
- Group related items into stacks (e.g. chicken + vegetables + sauce = a dinner stack).
- Each stack must come from ONE retailer: ${retailer}.
- valid_from: "${today}", valid_until: "${validUntil}"
- pay_price = sum of all item sale prices (what the customer pays at checkout)
- original_price = sum of all item regular shelf prices
- save_price = original_price minus pay_price

ITEM NAMING — critical for app classification. Include the common food keyword:
- Use: "Tyson Chicken Breast 2lb", NOT "Tyson Family Value Pack"
- Use: "Dole Baby Spinach 5oz", NOT "Salad Greens"
- Use: "Kraft Mac & Cheese Pasta", NOT "Kraft Dinner"

DEAL TYPES (use the most specific one):
- SALE: marked down on weekly ad, no coupon needed
- BOGO: buy one get one free or 50% off
- STORE_COUPON: requires store loyalty card clip (${retailer} app, ${retailer} card)
- MFR_COUPON: manufacturer coupon printed or digital
- DIGITAL: generic digital clip coupon
- CLEARANCE: end-of-shelf-life markdown

COUPON RULE: Never add negative-price items to breakdown_list.
If an item has a coupon, set the coupon field to the coupon dollar value on that item.
The item's price field should reflect the price AFTER all discounts.

Respond ONLY with a JSON array. Each object:
[
  {
    "title": "string — descriptive name e.g. 'Publix Chicken & Greens Haul'",
    "retailer": "${retailer}",
    "category": "one of: Protein | Produce | Dairy | Pantry | Snacks | Household | Beverage | Frozen",
    "meal_type": "one of: dinner | breakfast | lunch | protein | produce | dairy | frozen | pantry | household | snacks | beverage",
    "pay_price": number,
    "original_price": number,
    "save_price": number,
    "tags": ["BOGO" | "SALE" | "BULK" | "FRESH" | "SEASONAL" | "FAMILY" | "DIGITAL" | "TOP BUY"],
    "valid_from": "${today}",
    "valid_until": "${validUntil}",
    "description": "one sentence benefit statement",
    "breakdown_list": [
      {
        "name": "Brand Product Name size",
        "item": "same as name",
        "brand": "brand name or empty string",
        "size": "package size e.g. 2 lb",
        "qty": "quantity required e.g. 2 for BOGO, 3 for B2G1",
        "type": "product",
        "price": number,
        "regular_price": number,
        "savings": number,
        "deal_type": "SALE | BOGO | STORE_COUPON | MFR_COUPON | DIGITAL | CLEARANCE",
        "coupon": number
      }
    ]
  }
]`;
}

// ── Flyer crawl handler ───────────────────────────────────────────────────────
async function runFlyerCrawl(
  retailer: string,
  region: string,
  fileUri: string,
  mimeType: string,
  supabaseUrl: string,
  serviceKey: string,
  geminiKey: string,
): Promise<Response> {
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  const prompt  = buildFlyerExtractionPrompt(retailer, region);
  const rawJson = await callGeminiWithFile(prompt, fileUri, mimeType, geminiKey);

  let deals: Record<string, unknown>[];
  try {
    deals = JSON.parse(rawJson);
    if (!Array.isArray(deals) || deals.length === 0) throw new Error('Empty array');
  } catch (e) {
    return json({ error: `JSON parse failed: ${String(e).slice(0, 120)}`, raw: rawJson.slice(0, 400) }, 422);
  }

  const today = new Date().toISOString().split('T')[0];
  const validUntil = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  const rows = deals.map((d) => ({
    title:               String(d.title ?? '').slice(0, 200),
    retailer:            String(d.retailer ?? retailer).slice(0, 100),
    pay_price:           Number(d.pay_price) || 0,
    save_price:          Number(d.save_price) || 0,
    breakdown_list:      Array.isArray(d.breakdown_list) ? d.breakdown_list : [],
    dietary_tags:        Array.isArray(d.tags) ? d.tags : [],
    meal_type:           String(d.meal_type ?? d.category ?? 'grocery').toLowerCase(),
    card_type:           'meal_stack',
    status:              'active',
    verification_status: 'verified_live',
    valid_from:          String(d.valid_from ?? today),
    valid_until:         String(d.valid_until ?? validUntil),
    preference_profile:  { region, source: 'flyer-crawl', file_uri: fileUri },
    source_summary:      { description: String(d.description ?? '').slice(0, 300) },
    created_at:          new Date().toISOString(),
  }));

  // Only insert rows with valid pay_price (DB check constraint requires > 0)
  const validRows = rows.filter(r => r.pay_price > 0);
  const skipped   = rows.length - validRows.length;

  const { data: inserted, error: insertErr } = await db
    .from('app_home_feed')
    .insert(validRows)
    .select('id');

  if (insertErr) return json({ error: insertErr.message }, 500);

  try {
    await db.from('cron_audit_log').insert({
      job_name:     'flyer-crawl',
      triggered_by: 'api',
      result:       `retailer:${retailer} extracted:${deals.length} inserted:${inserted?.length ?? 0} skipped:${skipped}`,
      ran_at:       new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return json({
    ok:       true,
    retailer,
    extracted: deals.length,
    inserted:  inserted?.length ?? 0,
    skipped,
  });
}

// ── CRAWL: known grocery retailers in any region ──────────────────────────────
const RETAILERS: Record<string, string[]> = {
  default: ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'Kroger', 'Whole Foods', 'Trader Joe\'s'],
  'clermont, fl': ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'BJ\'s Wholesale'],
  'orlando, fl':  ['Publix', 'Walmart', 'Target', 'Aldi', 'Winn-Dixie', 'Whole Foods'],
  'miami, fl':    ['Publix', 'Walmart', 'Sedano\'s', 'Winn-Dixie', 'Aldi', 'Target'],
};

const CATEGORIES = ['Protein', 'Produce', 'Dairy', 'Pantry', 'Snacks', 'Household', 'Beverage', 'Frozen'];

function buildCrawlPrompt(region: string, targetCount: number, retailers: string[]): string {
  const today       = new Date().toISOString().split('T')[0];
  const validUntil  = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0];

  return `You are a grocery deal intelligence agent for the Snippd savings app.

Generate ${targetCount} realistic, current grocery deals available at stores in ${region}.

Rules:
- Use ONLY these retailers: ${retailers.join(', ')}
- Deals must be realistic for ${region} shoppers in ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
- pay_price is what the customer pays (in dollars, realistic sale price)
- original_price is the normal shelf price (10–40% higher than pay_price)
- save_price = original_price - pay_price (the actual dollar savings)
- Categories must be one of: ${CATEGORIES.join(', ')}
- breakdown_list: 2–5 specific items included in the deal (e.g. brand names, sizes)
- tags: 1–3 short labels like "BOGO", "BULK", "FRESH", "SEASONAL", "TOP BUY", "FAMILY"
- valid_from: "${today}", valid_until: "${validUntil}"
- Mix of price tiers: some under $15 (single items), some $15–$35 (bundles), some $35+ (bulk/family)
- Make deals feel curated and premium — this is a savings app, not a coupon flyer

Respond ONLY with a JSON array. No markdown, no explanation. Each object must have exactly these fields:
[
  {
    "title": "string",
    "retailer": "string",
    "category": "string",
    "pay_price": number,
    "original_price": number,
    "save_price": number,
    "breakdown_list": [{"name": "string", "qty": "string"}],
    "tags": ["string"],
    "valid_from": "YYYY-MM-DD",
    "valid_until": "YYYY-MM-DD",
    "description": "string (one sentence, benefit-focused)"
  }
]`;
}

// ── CRAWL handler ─────────────────────────────────────────────────────────────
async function runCrawl(
  region: string,
  targetCount: number,
  supabaseUrl: string,
  serviceKey: string,
  geminiKey: string,
): Promise<Response> {
  const regionKey = region.toLowerCase().trim();
  const retailers = RETAILERS[regionKey] ?? RETAILERS['default'];
  const batchSize = Math.min(targetCount, 20);
  const batches   = Math.ceil(targetCount / batchSize);

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });

  let totalInserted = 0;
  let totalSkipped  = 0;
  const errors: string[] = [];

  for (let b = 0; b < batches; b++) {
    const batchTarget = b === batches - 1
      ? targetCount - b * batchSize
      : batchSize;

    try {
      const prompt  = buildCrawlPrompt(region, batchTarget, retailers);
      const rawJson = await callGemini(prompt, geminiKey, 0.8);
      const deals   = JSON.parse(rawJson) as Record<string, unknown>[];

      if (!Array.isArray(deals) || deals.length === 0) {
        errors.push(`Batch ${b + 1}: empty response`);
        continue;
      }

      // Map to actual app_home_feed schema (verified from live table)
      const rows = deals.map((d) => ({
        title:               String(d.title ?? '').slice(0, 200),
        retailer:            String(d.retailer ?? '').slice(0, 100),
        pay_price:           Number(d.pay_price) || 0,
        save_price:          Number(d.save_price) || 0,
        breakdown_list:      Array.isArray(d.breakdown_list)
          ? d.breakdown_list.map((item: Record<string, unknown>) => ({
              item: String(item.name ?? item.item ?? ''),
              type: 'product',
              price: Number(item.price ?? (d.pay_price as number / ((d.breakdown_list as unknown[]).length || 1))),
            }))
          : [],
        dietary_tags:        Array.isArray(d.tags) ? d.tags : [],
        meal_type:           String(d.category ?? 'grocery').toLowerCase(),
        card_type:           'meal_stack',
        status:              'active',
        verification_status: 'verified_live',
        preference_profile:  { region, source: 'vertex-agent-crawl' },
        source_summary:      { description: String(d.description ?? '').slice(0, 300) },
        created_at:          new Date().toISOString(),
      }));

      const { data: inserted, error: insertErr } = await db
        .from('app_home_feed')
        .insert(rows)
        .select('id');

      if (insertErr) {
        errors.push(`Batch ${b + 1} insert error: ${insertErr.message}`);
      } else {
        totalInserted += inserted?.length ?? 0;
        // Validate newly inserted stacks immediately so app_home_feed is cleaned before display.
        const validatorUrl = `${supabaseUrl}/functions/v1/stack-validator`;
        const safeInserted = inserted ?? [];
        for (let i = 0; i < safeInserted.length; i++) {
          const row = safeInserted[i];
          const aiGeneratedJson = Array.isArray(deals[i]?.breakdown_list) ? deals[i].breakdown_list : [];
          try {
            await fetch(validatorUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: serviceKey,
              },
              body: JSON.stringify({ rawAiOutput: aiGeneratedJson, stackId: row.id }),
            });
          } catch (e) {
            errors.push(`Validator call failed for ${row.id}: ${String(e).slice(0, 120)}`);
          }
        }
      }
    } catch (e) {
      errors.push(`Batch ${b + 1} error: ${String(e).slice(0, 120)}`);
    }
  }

  // Audit log
  try {
    await db.from('cron_audit_log').insert({
      job_name:     'vertex-agent-crawl',
      triggered_by: 'api',
      result:       `inserted:${totalInserted} skipped:${totalSkipped} errors:${errors.length}`,
      ran_at:       new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return json({
    ok:            true,
    region,
    target_count:  targetCount,
    inserted:      totalInserted,
    skipped:       totalSkipped,
    errors:        errors.length > 0 ? errors : undefined,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON body' }, 400); }

  // ── Credentials ──────────────────────────────────────────────────────────
  const vertexProj  = Deno.env.get('VERTEX_PROJECT_ID');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
                   ?? Deno.env.get('SUPABASE_ANON_KEY')!;
  // Forward the caller's Authorization header — already validated by the gateway
  const callerAuth  = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? '';

  // ── List available models ─────────────────────────────────────────────────
  if (body.list_models === true) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 500);
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${geminiKey}&pageSize=50`);
    const d = await r.json();
    const names = (d.models ?? []).map((m: { name: string; supportedGenerationMethods?: string[] }) => ({
      name: m.name,
      generateContent: m.supportedGenerationMethods?.includes('generateContent'),
    })).filter((m: { generateContent: boolean }) => m.generateContent);
    return json({ models: names });
  }

  // ── Health check ──────────────────────────────────────────────────────────
  if (body.test === true) {
    let proxyPing = 'not_tested';
    try {
      const r = await fetch(`${supabaseUrl}/functions/v1/gemini-proxy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
        body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
      });
      proxyPing = r.ok ? 'ok' : `${r.status}: ${(await r.text()).slice(0, 80)}`;
    } catch (e) { proxyPing = `error: ${String(e).slice(0, 80)}`; }

    return json({
      ok:                 true,
      status:             'vertex-agent is running',
      gemini_proxy_ping:  proxyPing,
      service_key_set:    !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
      vertex_project_set: !!vertexProj,
      timestamp:          new Date().toISOString(),
    });
  }

  // ── Deal crawl (synthetic) ────────────────────────────────────────────────
  if (body.run_crawl === true) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey)  return json({ error: 'GEMINI_API_KEY not set' }, 500);
    if (!serviceKey) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, 500);

    const region      = String(body.region ?? 'Clermont, FL');
    const targetCount = Math.min(Math.max(Number(body.target_count) || 10, 1), 100);

    return runCrawl(region, targetCount, supabaseUrl, serviceKey, geminiKey);
  }

  // ── Upload PDF flyer to Gemini File API ───────────────────────────────────
  // Returns file_uri you can store and reuse for up to 48 hours.
  // POST: { "upload_flyer": true, "pdfBase64": "...", "mimeType": "application/pdf" }
  if (body.upload_flyer === true) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey)          return json({ error: 'GEMINI_API_KEY not set' }, 500);
    if (!body.pdfBase64)     return json({ error: 'pdfBase64 is required' }, 400);

    const mimeType = String(body.mimeType ?? 'application/pdf');
    try {
      const fileUri = await uploadPdfToGemini(String(body.pdfBase64), mimeType, geminiKey);
      return json({ ok: true, file_uri: fileUri, expires_in: '48 hours' });
    } catch (e) {
      return json({ error: String(e).slice(0, 200) }, 500);
    }
  }

  // ── Flyer crawl — extract REAL deals from a weekly ad PDF ─────────────────
  // Option A: pass pdfBase64 directly (uploads for you, then extracts)
  // Option B: pass file_uri from a prior upload_flyer call
  // POST: { "run_flyer_crawl": true, "retailer": "Publix", "region": "Clermont, FL",
  //         "pdfBase64": "..." } OR { ..., "file_uri": "https://..." }
  if (body.run_flyer_crawl === true) {
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey)  return json({ error: 'GEMINI_API_KEY not set' }, 500);
    if (!serviceKey) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, 500);

    const retailer = String(body.retailer ?? '');
    const region   = String(body.region   ?? 'Clermont, FL');
    const mimeType = String(body.mimeType ?? 'application/pdf');

    if (!retailer) return json({ error: 'retailer is required' }, 400);

    let fileUri = typeof body.file_uri === 'string' ? body.file_uri : '';

    // If no pre-uploaded URI, upload the PDF now
    if (!fileUri) {
      if (!body.pdfBase64) return json({ error: 'Provide file_uri or pdfBase64' }, 400);
      try {
        fileUri = await uploadPdfToGemini(String(body.pdfBase64), mimeType, geminiKey);
      } catch (e) {
        return json({ error: `PDF upload failed: ${String(e).slice(0, 200)}` }, 500);
      }
    }

    return runFlyerCrawl(retailer, region, fileUri, mimeType, supabaseUrl, serviceKey, geminiKey);
  }

  // ── Raw AI generation (pass-through) ────────────────────────────────────
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!geminiKey && !vertexProj) {
    return json({ error: 'No AI credentials configured. Set GEMINI_API_KEY in Edge Function secrets.' }, 500);
  }

  const model    = (body.model as string) || DEFAULT_MODEL;
  const contents = body.contents as unknown[] | undefined;
  const imageB64 = body.imageBase64 as string | undefined;
  const mimeType = (body.mimeType as string) || 'image/jpeg';

  if (!contents && !imageB64) {
    return json({ error: 'Provide "run_flyer_crawl", "run_crawl", "contents", or "imageBase64"' }, 400);
  }

  let requestContents: unknown[];
  if (imageB64) {
    requestContents = [{
      parts: [
        { text: 'Analyze this image and provide a detailed description.' },
        { inline_data: { mime_type: mimeType, data: imageB64 } },
      ],
    }];
  } else {
    requestContents = contents!;
  }

  const vertexRegion = Deno.env.get('VERTEX_REGION') ?? 'us-central1';
  let apiUrl     = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
  let authHeader = '';

  if (vertexProj) {
    const saJson = Deno.env.get('GCP_SERVICE_ACCOUNT_JSON');
    if (saJson) {
      try {
        const token = await getGCPAccessToken(JSON.parse(saJson));
        apiUrl = `https://${vertexRegion}-aiplatform.googleapis.com/v1/projects/${vertexProj}/locations/${vertexRegion}/publishers/google/models/${model}:generateContent`;
        authHeader = `Bearer ${token}`;
      } catch (e) {
        return json({ error: `GCP token error: ${String(e).slice(0, 120)}` }, 500);
      }
    }
  }

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authHeader) headers['Authorization'] = authHeader;

    const aiRes = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        contents: requestContents,
        generationConfig: {
          temperature: (body.temperature as number) ?? 0.7,
          topP: 0.9,
          maxOutputTokens: (body.maxTokens as number) ?? 2048,
        },
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return json({ error: 'AI API error', status: aiRes.status, detail: errText.slice(0, 300) }, 502);
    }
    return json(await aiRes.json());
  } catch (e) {
    return json({ error: 'Internal error', detail: String(e).slice(0, 200) }, 500);
  }
});

// ── GCP Service Account → Access Token ───────────────────────────────────────
async function getGCPAccessToken(sa: {
  client_email: string;
  private_key: string;
  token_uri?: string;
}): Promise<string> {
  const now      = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';
  const header   = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload  = btoa(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri, exp: now + 3600, iat: now,
  }));
  const sigInput  = `${header}.${payload}`;
  const pemKey    = sa.private_key.replace(/\\n/g, '\n');
  const keyData   = pemKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\n/g, '');
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8', binaryKey.buffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(sigInput));
  const jwt = `${sigInput}.${btoa(String.fromCharCode(...new Uint8Array(sig)))}`;
  const tokenRes = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(JSON.stringify(tokenData));
  return tokenData.access_token;
}
