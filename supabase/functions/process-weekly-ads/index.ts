/**
 * process-weekly-ads Edge Function
 *
 * Reads pending rows from weekly_ad_files, downloads each PDF from
 * Supabase Storage, uploads to Gemini File API, then calls vertex-agent
 * to extract real deals into app_home_feed.
 *
 * Trigger manually or via pg_cron every Monday morning after you've
 * uploaded that week's flyers to Supabase Storage.
 *
 * POST body:
 *  {}                          → process all pending rows
 *  { "id": "uuid" }            → process one specific row
 *  { "test": true }            → health check
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const geminiKey   = Deno.env.get('GEMINI_API_KEY') ?? '';
  const region      = Deno.env.get('DEFAULT_REGION') ?? 'Clermont, FL';

  if (!geminiKey)  return json({ error: 'GEMINI_API_KEY not set' }, 500);
  if (!serviceKey) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY not set' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  if (body.test === true) {
    return json({ ok: true, service: 'process-weekly-ads', ts: new Date().toISOString() });
  }

  // ── Fetch pending rows ────────────────────────────────────────────────────
  let query = db
    .from('weekly_ad_files')
    .select('id, retailer, week_date, storage_path, status')
    .eq('status', 'pending')
    .order('week_date', { ascending: false });

  if (typeof body.id === 'string') {
    query = db
      .from('weekly_ad_files')
      .select('id, retailer, week_date, storage_path, status')
      .eq('id', body.id);
  }

  const { data: rows, error: fetchErr } = await query;
  if (fetchErr) return json({ error: fetchErr.message }, 500);
  if (!rows || rows.length === 0) return json({ ok: true, message: 'No pending files', processed: 0 });

  const results = [];

  for (const row of rows) {
    // Mark as processing
    await db.from('weekly_ad_files').update({ status: 'processing' }).eq('id', row.id);

    try {
      // 1. Download PDF from Supabase Storage
      const { data: fileData, error: downloadErr } = await db
        .storage
        .from('weekly-ads')
        .download(row.storage_path);

      if (downloadErr || !fileData) {
        throw new Error(`Storage download failed: ${downloadErr?.message ?? 'no data'}`);
      }

      // 2. Convert to base64
      const arrayBuffer = await fileData.arrayBuffer();
      const bytes       = new Uint8Array(arrayBuffer);
      let binary        = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const pdfBase64 = btoa(binary);

      // 3. Upload to Gemini File API
      const uploadRes = await fetch(
        `${supabaseUrl}/functions/v1/vertex-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            upload_flyer: true,
            pdfBase64,
            mimeType: 'application/pdf',
          }),
        },
      );
      const uploadData = await uploadRes.json() as { file_uri?: string; error?: string };
      if (!uploadData.file_uri) {
        throw new Error(`Gemini upload failed: ${uploadData.error ?? 'no file_uri returned'}`);
      }

      const fileUri = uploadData.file_uri;

      // Save URI in case we need to re-run without re-uploading
      await db.from('weekly_ad_files').update({ gemini_file_uri: fileUri }).eq('id', row.id);

      // 4. Extract deals from the flyer
      const crawlRes = await fetch(
        `${supabaseUrl}/functions/v1/vertex-agent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            run_flyer_crawl: true,
            retailer:        row.retailer,
            region,
            file_uri:        fileUri,
          }),
        },
      );
      const crawlData = await crawlRes.json() as {
        ok?: boolean;
        inserted?: number;
        extracted?: number;
        error?: string;
      };

      if (!crawlData.ok) {
        throw new Error(`Flyer crawl failed: ${crawlData.error ?? JSON.stringify(crawlData).slice(0, 120)}`);
      }

      // 5. Mark done
      await db.from('weekly_ad_files').update({
        status:          'done',
        stacks_inserted: crawlData.inserted ?? 0,
      }).eq('id', row.id);

      results.push({
        id:       row.id,
        retailer: row.retailer,
        status:   'done',
        inserted: crawlData.inserted ?? 0,
        extracted: crawlData.extracted ?? 0,
      });

    } catch (e) {
      const msg = String(e).slice(0, 300);
      await db.from('weekly_ad_files').update({ status: 'error', error_msg: msg }).eq('id', row.id);
      results.push({ id: row.id, retailer: row.retailer, status: 'error', error: msg });
    }

    // Brief pause between files to avoid hammering the Gemini API
    if (rows.length > 1) await new Promise(r => setTimeout(r, 1500));
  }

  // Audit log
  const doneCount  = results.filter(r => r.status === 'done').length;
  const errorCount = results.filter(r => r.status === 'error').length;
  try {
    await db.from('cron_audit_log').insert({
      job_name:     'process-weekly-ads',
      triggered_by: 'api',
      result:       `processed:${results.length} done:${doneCount} errors:${errorCount}`,
      ran_at:       new Date().toISOString(),
    });
  } catch { /* non-blocking */ }

  return json({ ok: true, processed: results.length, done: doneCount, errors: errorCount, results });
});
