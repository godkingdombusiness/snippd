// ============================================================
// Snippd — Process Receipt
// supabase/functions/process-receipt/index.ts
//
// POST /functions/v1/process-receipt
// Auth: Bearer JWT (required)
//
// 1. Validates the receipt_upload record belongs to the caller
// 2. Calls Gemini Vision API to OCR and parse line items
// 3. Writes receipt_items + updates receipt_uploads status
// 4. Computes and saves a wealth_momentum_snapshot
// 5. Fires purchase_completed to event_stream
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function logRequest(db: ReturnType<typeof createClient>, stage: string, status: string, meta?: Record<string, unknown>) {
  db.from('ingestion_run_log').insert({
    source_key: 'process-receipt',
    stage,
    status,
    metadata: meta ?? null,
  }).then(() => {}).catch(() => {});
}

// ── Gemini Vision — parse receipt image ──────────────────────

interface VisionItem {
  product_name: string;
  qty: number;
  unit_price: number;
  line_total: number;
  promo_savings?: number;
}

interface VisionResponse {
  store_name?: string;
  date?: string;
  items: VisionItem[];
  subtotal?: number;
  tax?: number;
  total: number;
}

async function parseReceiptWithGemini(
  imageBlob: Blob,
  retailerKey: string,
): Promise<VisionResponse> {
  const geminiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!geminiKey) throw new Error('GEMINI_API_KEY not configured');

  // Convert blob to base64
  const arrayBuffer = await imageBlob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);

  const prompt = `Extract all information from this grocery receipt image and return as JSON only (no markdown):
{
  "store_name": "string",
  "date": "YYYY-MM-DD",
  "items": [{ "product_name": "string", "qty": number, "unit_price": number_in_dollars, "line_total": number_in_dollars, "promo_savings": number_in_dollars_or_null }],
  "subtotal": number_in_dollars,
  "tax": number_in_dollars,
  "total": number_in_dollars
}
Be precise. Include every line item. Retailer hint: ${retailerKey}.`;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { text: prompt },
          { inline_data: { mime_type: 'image/jpeg', data: base64 } },
        ]}],
        generationConfig: { temperature: 0.1 },
      }),
    }
  );

  if (!resp.ok) throw new Error(`Gemini Vision error: ${resp.status}`);

  const data = await resp.json();
  const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
  const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const parsed: VisionResponse = JSON.parse(cleaned);

  if (!Array.isArray(parsed.items)) parsed.items = [];
  if (typeof parsed.total !== 'number') parsed.total = 0;

  return parsed;
}

// ── Wealth snapshot — inline computation ─────────────────────

async function saveWealthSnapshot(
  db: ReturnType<typeof createClient>,
  userId: string,
  receiptId: string,
  realizedSavingsCents: number,
): Promise<{ realized_savings: number; wealth_momentum: number }> {
  // Velocity: compare this week's savings to 4-week average
  const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await db
    .from('wealth_momentum_snapshots')
    .select('realized_savings')
    .eq('user_id', userId)
    .gte('timestamp', fourWeeksAgo)
    .order('timestamp', { ascending: false })
    .limit(4);

  const avgSavings = recent?.length
    ? recent.reduce((s: number, r: { realized_savings: number }) => s + (r.realized_savings ?? 0), 0) / recent.length
    : realizedSavingsCents;

  const velocityScore = avgSavings > 0 ? realizedSavingsCents / avgSavings : 1.0;
  const wealthMomentum = Math.round(realizedSavingsCents * velocityScore);
  const projectedAnnual = Math.round(wealthMomentum * 52);

  await db.from('wealth_momentum_snapshots').insert({
    user_id:                userId,
    timestamp:              new Date().toISOString(),
    realized_savings:       realizedSavingsCents,
    inflation_offset:       Math.round(realizedSavingsCents * 0.3), // 30% inflation attribution
    velocity_score:         velocityScore,
    wealth_momentum:        wealthMomentum,
    projected_annual_wealth: projectedAnnual,
    transparency_report:    {
      receipt_id:      receiptId,
      velocity_score:  velocityScore,
      savings_cents:   realizedSavingsCents,
    },
  });

  return { realized_savings: realizedSavingsCents, wealth_momentum: wealthMomentum };
}

// ── Main handler ─────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // ── Auth ──────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401);
    const { data: userData, error: authErr } = await db.auth.getUser(authHeader.slice(7));
    if (authErr || !userData?.user) return json({ error: 'Unauthorized' }, 401);
    const user = userData.user;

    // ── Parse body ────────────────────────────────────────────
    const body = await req.json();
    const { receipt_upload_id } = body;
    if (!receipt_upload_id) return json({ error: 'receipt_upload_id is required' }, 400);

    // ── Fetch upload record ───────────────────────────────────
    const { data: upload, error: uploadErr } = await db
      .from('receipt_uploads')
      .select('*')
      .eq('id', receipt_upload_id)
      .eq('user_id', user.id)
      .single();
    if (uploadErr || !upload) return json({ error: 'Receipt upload not found' }, 404);
    if (upload.status !== 'uploaded') return json({ error: 'Receipt already processed' }, 400);

    // ── Fetch image from storage ──────────────────────────────
    const { data: imageBlob, error: fetchErr } = await db.storage
      .from('receipts')
      .download(upload.image_url);
    if (fetchErr || !imageBlob) throw new Error(`Storage fetch failed: ${fetchErr?.message}`);

    // ── Parse with Gemini Vision ──────────────────────────────
    const visionResult = await parseReceiptWithGemini(imageBlob, upload.retailer_key ?? 'unknown');

    // ── Write receipt_items ───────────────────────────────────
    const receiptItems = visionResult.items.map(item => ({
      receipt_id:          receipt_upload_id,
      user_id:             user.id,
      product_name:        item.product_name,
      qty:                 item.qty,
      unit_price:          Math.round(item.unit_price * 100),
      line_total:          Math.round(item.line_total * 100),
      promo_savings_cents: item.promo_savings ? Math.round(item.promo_savings * 100) : 0,
      normalized_key:      item.product_name.toLowerCase().trim(),
    }));

    const { error: itemsErr } = await db.from('receipt_items').insert(receiptItems);
    if (itemsErr) throw new Error(`Failed to save receipt items: ${itemsErr.message}`);

    // ── Update receipt_uploads ────────────────────────────────
    const totalCents = visionResult.total
      ? Math.round(visionResult.total * 100)
      : receiptItems.reduce((s, i) => s + i.line_total, 0);

    const totalSavedCents = receiptItems.reduce((s, i) => s + i.promo_savings_cents, 0);

    const { error: updateErr } = await db.from('receipt_uploads').update({
      status:     'parsed',
      parsed_at:  new Date().toISOString(),
      store_name: visionResult.store_name ?? upload.retailer_key,
      total_cents: totalCents,
    }).eq('id', receipt_upload_id);
    if (updateErr) throw new Error(`Failed to update receipt status: ${updateErr.message}`);

    // ── Wealth snapshot ───────────────────────────────────────
    const wealthResult = await saveWealthSnapshot(db, user.id, receipt_upload_id, totalSavedCents);

    // ── Fire event ────────────────────────────────────────────
    await db.from('event_stream').insert({
      user_id:      user.id,
      event_name:   'purchase_completed',
      object_type:  'receipt',
      object_id:    receipt_upload_id,
      retailer_key: upload.retailer_key,
      metadata: {
        total_cents:    totalCents,
        item_count:     receiptItems.length,
        store_name:     visionResult.store_name,
        realized_savings: wealthResult.realized_savings,
        wealth_momentum:  wealthResult.wealth_momentum,
      },
    }).catch(() => { /* non-critical */ });

    logRequest(db, 'parse', '200', {
      user_id:       user.id,
      receipt_id:    receipt_upload_id,
      item_count:    receiptItems.length,
      total_cents:   totalCents,
      savings_cents: totalSavedCents,
    });

    return json({
      success:      true,
      receipt: {
        store_name:     visionResult.store_name ?? 'Unknown Store',
        date:           visionResult.date ?? new Date().toISOString().split('T')[0],
        items:          receiptItems,
        total_cents:    totalCents,
        savings_cents:  totalSavedCents,
      },
      wealth_result: wealthResult,
    });

  } catch (err) {
    console.error('[process-receipt]', err);
    logRequest(db, 'parse', '500', { error: String(err) });
    return json({ error: String(err), success: false }, 500);
  }
});
