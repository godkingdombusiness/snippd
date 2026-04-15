// ============================================================
// Snippd — Run Ingestion Worker
// supabase/functions/run-ingestion-worker/index.ts
//
// POST /functions/v1/run-ingestion-worker
// Auth: x-cron-secret header (pg_cron) OR service-role Bearer JWT
//
// Processes up to MAX_JOBS queued ingestion_jobs per invocation:
//   1. Marks job as 'processing', increments attempts
//   2. Downloads PDF from 'deal-pdfs' storage bucket
//   3. Calls Gemini Vision to extract deals (with retry on bad JSON)
//   4. Writes to flyer_deal_staging
//   5. Normalizes: upserts offer_sources, matches digital_coupons,
//      writes offer_matches + stack_candidates
//   6. Marks job as 'parsed'
//   7. Logs each stage to ingestion_run_log
//   On error: retries up to MAX_ATTEMPTS; marks 'failed' when exhausted
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const MAX_JOBS      = 3;
const MAX_ATTEMPTS  = 3;
const GEMINI_MODEL  = 'gemini-2.5-flash';

// ── Gemini Vision ─────────────────────────────────────────────

const GEMINI_PROMPT = `You are a grocery deal extraction expert. Analyze this weekly ad flyer page and extract every promotional deal.

Return a JSON array only — no markdown, no code fences, no explanation. Each element:
{
  "product_name": "string",
  "brand": "string or null",
  "size": "string or null",
  "sale_price": number or null,
  "regular_price": number or null,
  "savings_amount": number or null,
  "deal_type": "SALE | BOGO | MULTI | BUY_X_GET_Y | LOYALTY_PRICE | DIGITAL_COUPON | MANUFACTURER_COUPON | REBATE",
  "quantity_required": number or null,
  "category": "produce | meat | seafood | dairy | deli | bakery | frozen | pantry | snacks | beverages | breakfast | household | pharmacy | personal_care | baby | pet | floral | other",
  "is_bogo": true or false,
  "dietary_flags": [],
  "deal_description": "string",
  "confidence": number 0-1,
  "raw_text": "string"
}
Only include items where confidence > 0.7. No markdown.`.trim();

const GEMINI_RETRY_PROMPT = `Extract grocery deals from this flyer page. Return a JSON array only.
Each item: {"product_name":"string","sale_price":number,"deal_type":"SALE|BOGO|MULTI|LOYALTY_PRICE|DIGITAL_COUPON","category":"string","confidence":number,"deal_description":"string"}
Only items with confidence > 0.7. No markdown.`.trim();

// Chunked base64 encoding — avoids O(n²) string concat on large buffers
function uint8ToBase64(bytes: Uint8Array): string {
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + CHUNK, bytes.byteLength)));
  }
  return btoa(binary);
}

// Upload PDF to Gemini Files API using multipart upload, then poll until ACTIVE
async function uploadToGeminiFileApi(bytes: Uint8Array, geminiKey: string): Promise<string> {
  const boundary = `snippd_${Date.now()}`;
  const metaJson  = JSON.stringify({ file: { display_name: 'flyer.pdf' } });

  // Build multipart body: metadata part + binary part
  const preamble = new TextEncoder().encode(
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`
  );
  const epilogue  = new TextEncoder().encode(`\r\n--${boundary}--\r\n`);
  const body      = new Uint8Array(preamble.length + bytes.length + epilogue.length);
  body.set(preamble, 0);
  body.set(bytes, preamble.length);
  body.set(epilogue, preamble.length + bytes.length);

  const uploadRes = await fetch(
    `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${geminiKey}`,
    {
      method: 'POST',
      headers: {
        'Content-Type':            `multipart/related; boundary=${boundary}`,
        'X-Goog-Upload-Protocol':  'multipart',
      },
      body,
    }
  );
  if (!uploadRes.ok) throw new Error(`Gemini Files API upload failed: ${uploadRes.status}: ${await uploadRes.text()}`);

  const fileData = await uploadRes.json() as { file?: { uri?: string; name?: string; state?: string } };
  const fileUri  = fileData.file?.uri;
  const fileName = fileData.file?.name; // e.g. "files/abc123"
  if (!fileUri || !fileName) throw new Error(`Gemini Files API: missing uri/name in response: ${JSON.stringify(fileData)}`);

  // Poll until state == ACTIVE (usually < 5s for PDFs under 30MB)
  const fileId   = fileName.replace('files/', '');
  const deadline = Date.now() + 60_000; // 60s max wait
  let   state    = fileData.file?.state ?? 'PROCESSING';

  while (state !== 'ACTIVE' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const statusRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/files/${fileId}?key=${geminiKey}`
    );
    if (!statusRes.ok) break; // can't poll, proceed anyway
    const statusData = await statusRes.json() as { state?: string };
    state = statusData.state ?? 'UNKNOWN';
    if (state === 'FAILED') throw new Error(`Gemini file processing failed for ${fileId}`);
  }

  return fileUri;
}

interface RawDeal {
  product_name: string;
  brand?: string | null;
  size?: string | null;
  sale_price?: number | null;
  regular_price?: number | null;
  savings_amount?: number | null;
  deal_type?: string;
  quantity_required?: number | null;
  category?: string | null;
  is_bogo?: boolean;
  dietary_flags?: string[];
  deal_description?: string | null;
  confidence?: number;
  raw_text?: string | null;
}

// pdfPart: either inline base64 or a Gemini Files API URI reference
async function callGemini(
  pdfPart: { type: 'inline'; base64: string } | { type: 'file'; uri: string },
  geminiKey: string,
  prompt: string,
): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`;
  const mediaPart = pdfPart.type === 'inline'
    ? { inline_data: { mime_type: 'application/pdf', data: pdfPart.base64 } }
    : { file_data:   { mime_type: 'application/pdf', file_uri: pdfPart.uri } };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [ { text: prompt }, mediaPart ] }],
      // Disable thinking for structured extraction (thinking tokens use quota and split parts)
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 0 } },
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  // deno-lint-ignore no-explicit-any
  const data = await res.json() as any;
  const parts: Array<{ text?: string; thought?: boolean }> =
    data?.candidates?.[0]?.content?.parts ?? [];
  // Collect all non-thinking text parts (gemini-2.5 returns thinking in parts with thought:true)
  const textParts = parts.filter(p => !p.thought).map(p => p.text ?? '').join('');
  return textParts || parts.map(p => p.text ?? '').join('') || '[]';
}

function tryParseDeals(text: string): RawDeal[] | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const parsed = JSON.parse(cleaned);
    return Array.isArray(parsed) ? (parsed as RawDeal[]) : null;
  } catch {
    return null;
  }
}

const LARGE_PDF_THRESHOLD = 3 * 1024 * 1024; // 3 MB — above this, use Gemini Files API

async function extractDeals(
  pdfBytes: Uint8Array,
  geminiKey: string,
  db: ReturnType<typeof createClient>,
  retailerKey: string,
): Promise<RawDeal[]> {
  // For large PDFs use Gemini Files API; for small ones use inline base64
  let pdfPart: { type: 'inline'; base64: string } | { type: 'file'; uri: string };
  if (pdfBytes.byteLength > LARGE_PDF_THRESHOLD) {
    const fileUri = await uploadToGeminiFileApi(pdfBytes, geminiKey);
    pdfPart = { type: 'file', uri: fileUri };
  } else {
    pdfPart = { type: 'inline', base64: uint8ToBase64(pdfBytes) };
  }

  let rawText = await callGemini(pdfPart, geminiKey, GEMINI_PROMPT);
  let deals = tryParseDeals(rawText);

  if (deals === null) {
    rawText = await callGemini(pdfPart, geminiKey, GEMINI_RETRY_PROMPT);
    deals = tryParseDeals(rawText) ?? [];
  }

  const filtered = deals.filter(d => (d.confidence ?? 0.75) > 0.7);

  // Log raw Gemini response preview for debugging (first 800 chars)
  db.from('ingestion_run_log').insert({
    source_key:   'run-ingestion-worker',
    retailer_key: retailerKey,
    stage:        'gemini_raw',
    status:       'debug',
    message:      rawText.slice(0, 800),
    metadata:     { response_length: rawText.length, pdfPart_type: pdfPart.type },
  }).then(() => {}).catch(() => {});

  db.from('ingestion_run_log').insert({
    source_key:   'run-ingestion-worker',
    retailer_key: retailerKey,
    stage:        'gemini_parse',
    status:       filtered.length > 0 ? 'ok' : 'warn',
    message:      `Extracted ${filtered.length} deals (raw: ${deals.length})`,
    metadata:     { raw_count: deals.length, filtered_count: filtered.length },
  }).then(() => {}).catch(() => {});

  return filtered;
}

// ── Stack rank score ──────────────────────────────────────────

function computeStackRankScore(deal: RawDeal, hasCoupon: boolean): number {
  let score = 0;
  const pct = deal.sale_price && deal.regular_price && deal.regular_price > 0
    ? ((deal.regular_price - deal.sale_price) / deal.regular_price) * 100
    : 0;

  score += Math.min(pct / 100, 0.50);
  if (deal.is_bogo) score += 0.25;
  if (deal.deal_type === 'MULTI' || deal.deal_type === 'BUY_X_GET_Y') score += 0.10;
  if ((deal.confidence ?? 0) > 0.9) score += 0.10;
  const essentials = ['meat', 'seafood', 'produce', 'dairy', 'breakfast', 'bakery'];
  if (deal.category && essentials.includes(deal.category)) score += 0.05;
  if (hasCoupon && score < 0.50) score += 0.10;
  return Math.min(parseFloat(score.toFixed(4)), 1.0);
}

// ── Normalizer helpers ────────────────────────────────────────

function makeNormalizedKey(brand: string | null | undefined, productName: string): string {
  const parts = [brand, productName]
    .filter(Boolean)
    .map(s => s!.toLowerCase().trim().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
  return parts.join('_');
}

function endOfWeek(weekOf: string): string {
  const d = new Date(weekOf + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}

function parseStoragePath(storagePath: string): { retailer_key: string; week_of: string; source_type: string } {
  const filename = storagePath.split('/').pop()?.replace('.pdf', '') ?? '';

  // New flat format: retailer-YYYY-MM-DD-type
  // e.g. publix-2026-04-15-weekly-flyer
  const flatMatch = filename.match(
    /^([a-z_]+)-(\d{4}-\d{2}-\d{2})-(.+)$/
  );

  if (flatMatch) {
    const typeMap: Record<string, string> = {
      'weekly-flyer':  'pdf_weekly_ad',
      'weekly':        'pdf_weekly_ad',
      'flyer':         'pdf_weekly_ad',
      'extra-savings': 'pdf_extra_savings',
      'extra':         'pdf_extra_savings',
      'bogo':          'pdf_bogo',
      'coupons':       'pdf_extra_savings',
    };
    return {
      retailer_key: flatMatch[1],
      week_of:      flatMatch[2],
      source_type:  typeMap[flatMatch[3]] ?? 'pdf_weekly_ad',
    };
  }

  // Legacy folder format: retailer/YYYY-MM-DD/type.pdf
  const parts = storagePath.split('/');
  if (parts.length >= 3) {
    return {
      retailer_key: parts[0],
      week_of:      parts[1],
      source_type:  parts[2].replace('.pdf', ''),
    };
  }

  // Fallback
  return {
    retailer_key: 'unknown',
    week_of:      new Date().toISOString().split('T')[0],
    source_type:  'pdf_weekly_ad',
  };
}

const DEAL_TYPE_MAP: Record<string, string> = {
  SALE: 'SALE', BOGO: 'BOGO', 'BUY 1 GET 1': 'BOGO', B1G1: 'BOGO',
  MULTI: 'MULTI', 'BUY X GET Y': 'BUY_X_GET_Y', BUY_X_GET_Y: 'BUY_X_GET_Y',
  LOYALTY_PRICE: 'LOYALTY_PRICE', LOYALTY: 'LOYALTY_PRICE',
  STORE_COUPON: 'STORE_COUPON', MANUFACTURER_COUPON: 'MANUFACTURER_COUPON',
  DIGITAL_COUPON: 'DIGITAL_COUPON', DIGITAL: 'DIGITAL_COUPON', REBATE: 'REBATE',
};

function mapDealType(raw: string): string {
  return DEAL_TYPE_MAP[raw.toUpperCase().trim()] ?? 'SALE';
}

function savingsPct(sale: number | null | undefined, regular: number | null | undefined): number {
  if (!sale || !regular || regular <= 0) return 0;
  return Math.max(0, (regular - sale) / regular);
}

// ── Job processor ─────────────────────────────────────────────

interface IngestionJob {
  id: string;
  retailer_key: string;
  week_of: string;
  storage_path: string;
  attempts: number;
}

async function processJob(
  job: IngestionJob,
  db: ReturnType<typeof createClient>,
  geminiKey: string,
): Promise<{ deals_extracted: number; candidates_written: number }> {
  const startedAt = new Date().toISOString();

  // Mark processing + increment attempts
  await db.from('ingestion_jobs').update({
    status: 'processing',
    attempts: job.attempts + 1,
    started_at: startedAt,
  }).eq('id', job.id);

  // Download PDF
  const { data: fileBlob, error: downloadErr } = await db.storage
    .from('deal-pdfs')
    .download(job.storage_path);
  if (downloadErr || !fileBlob) {
    throw new Error(`Storage download failed: ${downloadErr?.message ?? 'no blob'}`);
  }

  // Load PDF bytes
  const arrayBuffer = await fileBlob.arrayBuffer();
  const pdfBytes = new Uint8Array(arrayBuffer);

  // Extract deals via Gemini Vision (large files use Files API, small files use inline base64)
  const rawDeals = await extractDeals(pdfBytes, geminiKey, db, job.retailer_key);

  if (rawDeals.length === 0) {
    await db.from('ingestion_jobs').update({
      status: 'parsed', parsed_at: new Date().toISOString(), deal_count: 0,
    }).eq('id', job.id);
    return { deals_extracted: 0, candidates_written: 0 };
  }

  // Write to flyer_deal_staging
  const stagingRows = rawDeals.map(deal => {
    const confidence = deal.confidence ?? 0.75;
    return {
      ingestion_id:      job.id,
      retailer_key:      job.retailer_key,
      week_of:           job.week_of,
      product_name:      deal.product_name ?? '',
      brand:             deal.brand ?? null,
      size:              deal.size ?? null,
      sale_price:        deal.sale_price ?? null,
      regular_price:     deal.regular_price ?? null,
      savings_amount:    deal.savings_amount ?? null,
      deal_type:         deal.deal_type ?? 'SALE',
      quantity_required: deal.quantity_required ?? null,
      category:          deal.category ?? null,
      is_bogo:           deal.is_bogo ?? false,
      dietary_flags:     deal.dietary_flags ?? [],
      deal_description:  deal.deal_description ?? null,
      raw_text:          deal.raw_text ?? null,
      confidence_score:  confidence,
      needs_review:      confidence < 0.7 || !deal.sale_price,
      status:            'staged',
    };
  });

  const { error: stagingErr } = await db.from('flyer_deal_staging').insert(stagingRows);
  if (stagingErr) throw new Error(`flyer_deal_staging insert failed: ${stagingErr.message}`);

  // Load digital coupons + match mode
  const { data: couponRows } = await db
    .from('digital_coupons')
    .select('id, retailer_key, normalized_key, brand, discount_cents, discount_pct, expires_at, coupon_type, is_active')
    .eq('retailer_key', job.retailer_key)
    .eq('is_active', true);

  const coupons = (couponRows ?? []) as Array<{
    id: string; retailer_key: string; normalized_key: string; brand: string | null;
    discount_cents: number; discount_pct: number | null; expires_at: string | null;
    coupon_type: string; is_active: boolean;
  }>;

  const { data: policyRow } = await db
    .from('retailer_coupon_parameters')
    .select('policy_value')
    .eq('retailer_key', job.retailer_key)
    .eq('policy_key', 'coupon_match_mode')
    .maybeSingle();

  const matchMode: string =
    (policyRow?.policy_value as { coupon_match_mode?: string } | null)?.coupon_match_mode ?? 'token_overlap';

  const expiresOn = endOfWeek(job.week_of);
  let candidateCount = 0;

  for (const deal of stagingRows) {
    try {
      const normalizedKey = makeNormalizedKey(deal.brand, deal.product_name);
      const dedupeKey     = `${job.retailer_key}::${normalizedKey}::${job.week_of}`;
      const offerType     = mapDealType(deal.deal_type);
      const saleCents     = deal.sale_price != null ? Math.round(deal.sale_price * 100) : null;
      const regularCents  = deal.regular_price != null ? Math.round(deal.regular_price * 100) : null;
      const pct           = savingsPct(deal.sale_price, deal.regular_price);

      const { data: upsertedSource, error: sourceErr } = await db
        .from('offer_sources')
        .upsert({
          retailer_key: job.retailer_key, week_of: job.week_of,
          normalized_key: normalizedKey, dedupe_key: dedupeKey,
          product_name: deal.product_name, brand: deal.brand, size: deal.size,
          category: deal.category, offer_type: offerType,
          sale_price_cents: saleCents, regular_price_cents: regularCents,
          quantity_required: deal.quantity_required, expires_on: expiresOn,
          confidence_score: deal.confidence_score, source: 'flyer',
          raw_text: deal.raw_text, ingestion_id: job.id,
        }, { onConflict: 'dedupe_key' })
        .select('id').single();

      if (sourceErr || !upsertedSource) continue;

      const sourceId = (upsertedSource as { id: string }).id;

      // Match coupon
      let hasCoupon = false;
      const tokenize = (s: string) => s.split('_').filter(t => t.length > 2);
      const offerTokens = new Set(tokenize(normalizedKey));

      const matchedCoupon = coupons.find(c => {
        if (c.retailer_key !== job.retailer_key) return false;
        if (matchMode === 'exact_name') return c.normalized_key === normalizedKey;
        if (matchMode === 'brand_or_name') {
          const brandMatch = deal.brand && c.brand &&
            deal.brand.toLowerCase() === c.brand.toLowerCase();
          const keyMatch = c.normalized_key.includes(
            deal.product_name.toLowerCase().replace(/\s+/g, '_').slice(0, 8));
          return brandMatch || keyMatch;
        }
        // token_overlap
        const overlap = tokenize(c.normalized_key).filter(t => offerTokens.has(t)).length;
        return overlap >= 2;
      }) ?? null;

      if (matchedCoupon) {
        hasCoupon = true;
        const couponSavingsCents = matchedCoupon.discount_cents > 0
          ? matchedCoupon.discount_cents
          : regularCents && matchedCoupon.discount_pct
            ? Math.round(regularCents * matchedCoupon.discount_pct) : 0;

        const finalAfterCouponCents = saleCents != null
          ? Math.max(0, saleCents - couponSavingsCents)
          : regularCents != null ? Math.max(0, regularCents - couponSavingsCents) : null;

        await db.from('offer_matches').upsert({
          offer_source_id: sourceId, coupon_source_id: matchedCoupon.id,
          retailer_key: job.retailer_key, week_of: job.week_of,
          normalized_key: normalizedKey, final_price_cents: finalAfterCouponCents,
          coupon_savings_cents: couponSavingsCents, match_mode: matchMode,
          match_confidence: deal.confidence_score,
        }, { onConflict: 'offer_source_id,coupon_source_id' });
      }

      const stackRankScore = computeStackRankScore(
        { ...deal, confidence: deal.confidence_score }, hasCoupon);

      const stackItem = {
        id: sourceId, name: deal.product_name,
        regularPriceCents: regularCents ?? 0,
        quantity: deal.quantity_required ?? 1,
        category: deal.category ?? '', brand: deal.brand ?? '',
        offers: [
          {
            id: `${sourceId}-offer`, offerType,
            discountCents: offerType === 'SALE' && saleCents && regularCents
              ? regularCents - saleCents : undefined,
            discountPct: offerType === 'SALE' && pct > 0 ? pct : undefined,
            stackable: true, expiresAt: expiresOn,
          },
          ...(matchedCoupon ? [{
            id: matchedCoupon.id,
            offerType: matchedCoupon.coupon_type.toUpperCase().includes('MANUFACTURER')
              ? 'MANUFACTURER_COUPON' : 'DIGITAL_COUPON',
            discountCents: matchedCoupon.discount_cents > 0 ? matchedCoupon.discount_cents : undefined,
            discountPct: matchedCoupon.discount_pct ?? undefined,
            couponType: matchedCoupon.coupon_type, stackable: true,
            expiresAt: matchedCoupon.expires_at ?? expiresOn,
          }] : []),
        ],
      };

      await db.from('stack_candidates').upsert({
        retailer_key: job.retailer_key, week_of: job.week_of,
        normalized_key: normalizedKey, dedupe_key: dedupeKey,
        primary_category: deal.category ?? '', primary_brand: deal.brand ?? '',
        stack_rank_score: stackRankScore, items: [stackItem],
        savings_pct: pct, has_coupon: hasCoupon, ingestion_id: job.id,
      }, { onConflict: 'dedupe_key' });

      candidateCount++;
    } catch (dealErr) {
      console.error(`[run-ingestion-worker] Deal error:`, (dealErr as Error).message);
    }
  }

  // Update staging to 'published'
  await db.from('flyer_deal_staging')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('ingestion_id', job.id).eq('status', 'staged');

  // Write publish log
  await db.from('flyer_publish_log').insert({
    ingestion_id: job.id, retailer_key: job.retailer_key, week_of: job.week_of,
    deals_staged: rawDeals.length, deals_published: stagingRows.length,
    coupons_matched: stagingRows.filter((_, i) => i < candidateCount).length,
    candidates_written: candidateCount, published_at: new Date().toISOString(),
  }).catch(() => {});

  // Mark job parsed
  await db.from('ingestion_jobs').update({
    status: 'parsed', parsed_at: new Date().toISOString(), deal_count: rawDeals.length,
  }).eq('id', job.id);

  return { deals_extracted: rawDeals.length, candidates_written: candidateCount };
}

// ── Main handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronSecret  = Deno.env.get('CRON_SECRET') ?? '';
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);
  if (!geminiKey) return json({ error: 'GEMINI_API_KEY not configured' }, 500);

  // ── Auth: x-cron-secret OR service-role Bearer ────────────
  const incomingCronSecret = req.headers.get('x-cron-secret') ?? '';
  const authHeader         = req.headers.get('authorization') ?? '';

  const isCronAuth   = cronSecret && incomingCronSecret === cronSecret;
  const isBearerAuth = authHeader.startsWith('Bearer ');

  if (!isCronAuth && !isBearerAuth) return json({ error: 'Unauthorized' }, 401);
  if (!isCronAuth && isBearerAuth) {
    if (authHeader.slice(7) !== serviceKey) return json({ error: 'Forbidden' }, 403);
  }

  const db    = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const start = Date.now();

  try {
    // Fetch queued jobs
    const { data: jobs, error: jobsErr } = await db
      .from('ingestion_jobs')
      .select('id, retailer_key, week_of, storage_path, attempts')
      .eq('status', 'queued')
      .lt('attempts', MAX_ATTEMPTS)
      .order('created_at', { ascending: true })
      .limit(MAX_JOBS);

    if (jobsErr) return json({ error: jobsErr.message }, 500);

    const queue = (jobs ?? []) as IngestionJob[];

    if (queue.length === 0) {
      return json({ ok: true, message: 'No queued jobs', processed: 0, duration_ms: Date.now() - start });
    }

    const results: Array<{ job_id: string; status: string; deals_extracted?: number; candidates_written?: number; error?: string }> = [];

    for (const job of queue) {
      try {
        const result = await processJob(job, db, geminiKey);
        results.push({ job_id: job.id, status: 'parsed', ...result });

        db.from('ingestion_run_log').insert({
          source_key:   'run-ingestion-worker',
          retailer_key: job.retailer_key,
          stage:        'job_complete',
          status:       'ok',
          message:      `Job ${job.id}: ${result.deals_extracted} deals, ${result.candidates_written} candidates`,
          metadata:     { job_id: job.id, ...result },
        }).then(() => {}).catch(() => {});
      } catch (err) {
        const newAttempts = job.attempts + 1;
        const isFinal = newAttempts >= MAX_ATTEMPTS;
        const errMsg  = (err as Error).message;

        await db.from('ingestion_jobs').update({
          status:        isFinal ? 'failed' : 'queued',
          error_message: errMsg,
          attempts:      newAttempts,
        }).eq('id', job.id);

        db.from('ingestion_run_log').insert({
          source_key:   'run-ingestion-worker',
          retailer_key: job.retailer_key,
          stage:        'job_error',
          status:       isFinal ? 'failed' : 'retry',
          message:      errMsg,
          metadata:     { job_id: job.id, attempt: newAttempts, final: isFinal },
        }).then(() => {}).catch(() => {});

        results.push({ job_id: job.id, status: isFinal ? 'failed' : 'retrying', error: errMsg });
      }
    }

    return json({
      ok:          true,
      processed:   queue.length,
      results,
      duration_ms: Date.now() - start,
    });
  } catch (err) {
    console.error('[run-ingestion-worker]', err);
    return json({ error: String(err) }, 500);
  }
});
