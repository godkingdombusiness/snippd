/**
 * flyerParser — Parses weekly ad flyer PDFs using Gemini Vision
 *
 * parseFlyer(ingestionJobId, supabase):
 *   1. Reads ingestion_jobs record for storage_path + retailer_key
 *   2. Downloads PDF from Supabase storage bucket 'deal-pdfs'
 *   3. Sends each page as base64 image to gemini-1.5-flash
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
  sale_price?: number;       // dollars
  regular_price?: number;    // dollars
  deal_type?: string;        // 'SALE', 'BOGO', 'MULTI', 'DIGITAL_COUPON', etc.
  quantity_required?: number;
  category?: string;
  raw_text?: string;
}

// ─────────────────────────────────────────────────────────────
// Gemini Vision helpers
// ─────────────────────────────────────────────────────────────

const DEAL_EXTRACTION_PROMPT = `
You are extracting grocery deals from a weekly ad flyer page.

Return a JSON array (no markdown, no code fences) where each element is:
{
  "product_name": "string",
  "brand": "string or null",
  "size": "string or null (e.g. '12 oz', '3-pack')",
  "sale_price": number or null (dollars, e.g. 2.99),
  "regular_price": number or null (dollars),
  "deal_type": "SALE | BOGO | MULTI | BUY_X_GET_Y | LOYALTY_PRICE | DIGITAL_COUPON | MANUFACTURER_COUPON | REBATE",
  "quantity_required": number or null (e.g. 2 for 'buy 2 get 1 free'),
  "category": "string or null (produce, meat, dairy, pantry, snacks, frozen, beverages, household, pharmacy)",
  "raw_text": "exact text from the flyer for this deal"
}

Only include items that have a clear promotional price or deal. Ignore non-deal items.
Extract every deal visible on this page.
`.trim();

async function callGeminiVision(base64Image: string): Promise<RawDealFromVision[]> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [
        { text: DEAL_EXTRACTION_PROMPT },
        { inline_data: { mime_type: 'image/jpeg', data: base64Image } },
      ],
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
  };

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Gemini API error ${res.status}: ${await res.text()}`);
  }

  const data = await res.json() as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '[]';

  try {
    // Strip any accidental markdown fences
    const cleaned = rawText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned) as RawDealFromVision[];
  } catch (e) {
    console.error('[flyerParser] Failed to parse Gemini response:', rawText.slice(0, 200));
    return []; // Return empty rather than crashing — confidence will be 0
  }
}

// ─────────────────────────────────────────────────────────────
// Confidence scoring
// ─────────────────────────────────────────────────────────────

function scoreDealConfidence(deal: RawDealFromVision): number {
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

  // 2. Download PDF from Supabase storage bucket 'deal-pdfs'
  const { data: fileBlob, error: downloadErr } = await supabase.storage
    .from('deal-pdfs')
    .download(jobRow.storage_path);

  if (downloadErr || !fileBlob) {
    throw new Error(`[flyerParser] Failed to download PDF: ${downloadErr?.message ?? 'no blob'}`);
  }

  // 3. Convert to base64
  //    Node.js Blob → ArrayBuffer → Buffer → base64
  const arrayBuffer = await fileBlob.arrayBuffer();
  const base64Pdf   = Buffer.from(arrayBuffer).toString('base64');

  // For a proper multi-page approach, each page would be rendered.
  // This implementation sends the single PDF as one image payload.
  // Production: integrate pdf2pic or similar to split pages.
  const allDeals: RawDealFromVision[] = await callGeminiVision(base64Pdf);

  if (allDeals.length === 0) {
    // Update job as parsed with 0 deals
    await supabase
      .from('ingestion_jobs')
      .update({ status: 'parsed', parsed_at: new Date().toISOString(), deal_count: 0 })
      .eq('id', ingestionJobId);
    return 0;
  }

  // 4. Write each deal to flyer_deal_staging
  const stagingRows = allDeals.map((deal) => {
    const confidence  = scoreDealConfidence(deal);
    const needsReview = confidence < 0.7 || !deal.sale_price || !deal.product_name;

    return {
      ingestion_id:     ingestionJobId,
      retailer_key:     jobRow.retailer_key,
      week_of:          jobRow.week_of,
      product_name:     deal.product_name ?? '',
      brand:            deal.brand ?? null,
      size:             deal.size ?? null,
      sale_price:       deal.sale_price ?? null,
      regular_price:    deal.regular_price ?? null,
      deal_type:        deal.deal_type ?? 'SALE',
      quantity_required: deal.quantity_required ?? null,
      category:         deal.category ?? null,
      raw_text:         deal.raw_text ?? null,
      confidence_score: confidence,
      needs_review:     needsReview,
      status:           'staged',
    };
  });

  const { error: insertErr } = await supabase
    .from('flyer_deal_staging')
    .insert(stagingRows);

  if (insertErr) {
    throw new Error(`[flyerParser] Failed to insert flyer_deal_staging: ${insertErr.message}`);
  }

  // 5. Update ingestion_jobs status → 'parsed'
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
