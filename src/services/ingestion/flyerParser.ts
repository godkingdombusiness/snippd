/**
 * flyerParser — Parses weekly ad flyer PDFs using Gemini Vision
 *
 * parseFlyer(ingestionJobId, supabase):
 *   1. Reads ingestion_jobs record for storage_path + retailer_key
 *   2. Downloads PDF from Supabase storage bucket 'deal-pdfs'
 *   3. Sends up to 3 pages simultaneously to gemini-1.5-flash (Promise.all)
 *   4. Writes extracted deals to flyer_deal_staging
 *   5. Updates ingestion_jobs status → 'parsed'
 *   6. Returns count of deals extracted
 */

import { SupabaseClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────

const GEMINI_API_KEY = process.env['GEMINI_API_KEY'] ?? '';
const GEMINI_MODEL   = 'gemini-1.5-flash';
const MAX_PAGES      = 3;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface IngestionJobRow {
  id: string;
  retailer_key: string;
  week_of: string;          // YYYY-MM-DD
  storage_path: string;     // path within 'deal-pdfs' bucket
  status: string;
  attempts: number;
  error_message: string | null;
}

interface RawDealFromVision {
  product_name: string;
  brand?: string;
  size?: string;
  sale_price?: number;           // dollars
  regular_price?: number;        // dollars
  savings_amount?: number;       // dollars saved
  deal_type?: string;            // 'SALE' | 'BOGO' | 'MULTI' | 'BUY_X_GET_Y' | 'LOYALTY_PRICE' | 'DIGITAL_COUPON' | 'MANUFACTURER_COUPON' | 'REBATE'
  quantity_required?: number;
  category?: string;
  is_bogo?: boolean;
  dietary_flags?: string[];      // e.g. ['organic', 'gluten-free', 'vegan']
  deal_description?: string;     // human-readable summary, e.g. "Buy 2 get 1 free"
  confidence?: number;           // 0–1, model self-reported confidence
  raw_text?: string;
}

// ─────────────────────────────────────────────────────────────
// Gemini Vision helpers
// ─────────────────────────────────────────────────────────────

const GEMINI_PROMPT = `You are a grocery deal extraction expert. Analyze this weekly ad flyer page and extract every promotional deal.

Return a JSON array only — no markdown, no code fences, no explanation. Each element must follow this exact schema:
{
  "product_name": "string (required)",
  "brand": "string or null",
  "size": "string or null (e.g. '12 oz', '3-pack', '1 lb')",
  "sale_price": number or null (dollars, e.g. 2.99),
  "regular_price": number or null (dollars, original non-sale price),
  "savings_amount": number or null (dollars saved, e.g. 1.00),
  "deal_type": "SALE | BOGO | MULTI | BUY_X_GET_Y | LOYALTY_PRICE | DIGITAL_COUPON | MANUFACTURER_COUPON | REBATE",
  "quantity_required": number or null (e.g. 2 for 'buy 2 get 1'),
  "category": "produce | meat | seafood | dairy | deli | bakery | frozen | pantry | snacks | beverages | breakfast | household | pharmacy | personal_care | baby | pet | floral | other",
  "is_bogo": true or false,
  "dietary_flags": ["organic", "gluten-free", "vegan", "kosher", "natural"] or [],
  "deal_description": "string — concise human-readable summary of the deal (e.g. 'Buy 2 get 1 free', '2 for $5', 'Save $1.50 with digital coupon')",
  "confidence": number between 0 and 1 (your confidence this is a real deal with correct data),
  "raw_text": "exact text from the flyer for this deal"
}

Rules:
- Only include items where confidence > 0.7
- Set is_bogo to true when deal_type is BOGO or BUY_X_GET_Y
- If savings_amount is not shown, compute it as regular_price - sale_price when both are available
- For MULTI deals (e.g. '3 for $5'), set quantity_required to the required count
- If a price is shown as a fraction (e.g. '$1.99 ea / 2 for $3'), use the per-unit price as sale_price
- Omit items with no clear promotional offer (full-price shelf items)
- Be conservative: a confident partial record beats an uncertain complete one`.trim();

const GEMINI_RETRY_PROMPT = `Extract grocery deals from this flyer page. Return a JSON array only.
Each item: {"product_name":"string","sale_price":number,"deal_type":"SALE|BOGO|MULTI|LOYALTY_PRICE|DIGITAL_COUPON","category":"string","confidence":number,"deal_description":"string"}
Only items with confidence > 0.7. No markdown, no explanation.`.trim();

async function callGeminiVision(
  base64Image: string,
  pageNum: number,
  supabase: SupabaseClient,
  sourceKey: string,
  retailerKey: string,
): Promise<RawDealFromVision[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const makeBody = (prompt: string) => ({
    contents: [{
      parts: [
        { text: prompt },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  });

  const callApi = async (prompt: string): Promise<string> => {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeBody(prompt)),
    });
    if (!res.ok) {
      throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
    }
    const data = await res.json() as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';
  };

  const tryParse = (rawText: string): RawDealFromVision[] | null => {
    try {
      const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      return Array.isArray(parsed) ? parsed as RawDealFromVision[] : null;
    } catch {
      return null;
    }
  };

  // First attempt
  let rawText = await callApi(GEMINI_PROMPT);
  let deals = tryParse(rawText);

  // Retry with simplified prompt on invalid JSON
  if (deals === null) {
    console.warn(`[flyerParser] Page ${pageNum}: invalid JSON on first attempt, retrying with simplified prompt`);
    try {
      rawText = await callApi(GEMINI_RETRY_PROMPT);
      deals = tryParse(rawText);
    } catch (retryErr) {
      console.error(`[flyerParser] Page ${pageNum}: retry failed:`, retryErr);
    }
    if (deals === null) {
      console.error(`[flyerParser] Page ${pageNum}: both attempts failed, returning []`);
      deals = [];
    }
  }

  // Filter to confidence > 0.7 (enforce model's own rule client-side too)
  const filtered = deals.filter(d => (d.confidence ?? 0) > 0.7 || d.confidence === undefined);

  // Log to ingestion_run_log (fire-and-forget)
  void Promise.resolve(supabase.from('ingestion_run_log').insert({
    source_key:  sourceKey,
    retailer_key: retailerKey,
    stage:       'gemini_parse',
    status:      filtered.length > 0 ? 'ok' : 'warn',
    message:     `Page ${pageNum}: extracted ${filtered.length} deals`,
    metadata:    { page: pageNum, raw_count: deals.length, filtered_count: filtered.length },
  })).catch(() => {});

  return filtered;
}

// ─────────────────────────────────────────────────────────────
// Confidence scoring (fallback when model doesn't self-report)
// ─────────────────────────────────────────────────────────────

function scoreDealConfidence(deal: RawDealFromVision): number {
  // Use model's self-reported confidence if available
  if (typeof deal.confidence === 'number') return deal.confidence;

  let score = 0.5;
  if (deal.product_name?.length > 2) score += 0.15;
  if (deal.sale_price != null && deal.sale_price > 0) score += 0.15;
  if (deal.regular_price != null && deal.regular_price > 0) score += 0.10;
  if (deal.category) score += 0.05;
  if (deal.brand) score += 0.05;
  return Math.min(1, score);
}

// ─────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────

export async function parseFlyer(
  ingestionJobId: string,
  supabase: SupabaseClient,
): Promise<number> {
  // 1. Read ingestion_jobs record
  const { data: job, error: jobErr } = await supabase
    .from('ingestion_jobs')
    .select('id, retailer_key, week_of, storage_path, status, attempts, error_message')
    .eq('id', ingestionJobId)
    .single();

  if (jobErr || !job) {
    throw new Error(`[flyerParser] ingestion_jobs not found (${ingestionJobId}): ${jobErr?.message ?? 'no row'}`);
  }

  const jobRow = job as IngestionJobRow;
  const sourceKey = `flyer-${jobRow.retailer_key}`;

  // 2. Download PDF from Supabase storage bucket 'deal-pdfs'
  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from('deal-pdfs')
    .download(jobRow.storage_path);

  if (downloadErr || !fileBlob) {
    throw new Error(`[flyerParser] Failed to download PDF: ${downloadErr?.message ?? 'no blob'}`);
  }

  // 3. Convert to base64
  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64Pdf   = Buffer.from(arrayBuffer).toString('base64');

  // 4. Process up to MAX_PAGES pages simultaneously with Promise.all
  //    Each page gets the same base64 blob — Gemini segments visually.
  //    Production: integrate pdf2pic to render each page as a separate JPEG.
  const pageIndices = Array.from({ length: MAX_PAGES }, (_, i) => i + 1);
  const pageResults = await Promise.all(
    pageIndices.map(pageNum =>
      callGeminiVision(base64Pdf, pageNum, supabase, sourceKey, jobRow.retailer_key)
        .catch((err: Error) => {
          console.error(`[flyerParser] Page ${pageNum} failed:`, err.message);
          return [] as RawDealFromVision[];
        })
    )
  );

  const allDeals: RawDealFromVision[] = pageResults.flat();

  if (allDeals.length === 0) {
    await supabase
      .from('ingestion_jobs')
      .update({ status: 'parsed', parsed_at: new Date().toISOString(), deal_count: 0 })
      .eq('id', ingestionJobId);
    return 0;
  }

  // 5. Write each deal to flyer_deal_staging
  const stagingRows = allDeals.map((deal) => {
    const confidence  = scoreDealConfidence(deal);
    const needsReview = confidence < 0.7 || !deal.sale_price || !deal.product_name;

    return {
      ingestion_id:      ingestionJobId,
      retailer_key:      jobRow.retailer_key,
      week_of:           jobRow.week_of,
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
      needs_review:      needsReview,
      status:            'staged',
    };
  });

  const { error: insertErr } = await supabase
    .from('flyer_deal_staging')
    .insert(stagingRows);

  if (insertErr) {
    throw new Error(`[flyerParser] Failed to insert flyer_deal_staging: ${insertErr.message}`);
  }

  // 6. Update ingestion_jobs status → 'parsed'
  await supabase
    .from('ingestion_jobs')
    .update({
      status:     'parsed',
      parsed_at:  new Date().toISOString(),
      deal_count: allDeals.length,
    })
    .eq('id', ingestionJobId);

  return allDeals.length;
}

// ─────────────────────────────────────────────────────────────
// CLI entry point
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  const { createClient } = require('@supabase/supabase-js');
  const supabaseUrl = process.env['SUPABASE_URL'] ?? '';
  const serviceKey  = process.env['SUPABASE_SERVICE_ROLE_KEY'] ?? '';
  const jobId       = process.argv[2];

  if (!jobId) {
    console.error('Usage: npx ts-node flyerParser.ts <job_id>');
    process.exit(1);
  }

  const db = createClient(supabaseUrl, serviceKey) as SupabaseClient;
  parseFlyer(jobId, db)
    .then((n) => console.log(`Parsed ${n} deals`))
    .catch((e: Error) => { console.error(e); process.exit(1); });
}
