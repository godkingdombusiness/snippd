import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { parseReceipt } from '../../../src/services/receiptParser.ts';
import { computeAndSave } from '../../../src/services/wealthEngine.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    // Auth check
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return json({ error: 'Missing or invalid authorization header' }, 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceKey) {
      return json({ error: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured' }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify user auth
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return json({ error: 'Invalid authentication' }, 401);
    }

    // Parse request body
    const body = await req.json();
    const { receipt_upload_id } = body;

    if (!receipt_upload_id) {
      return json({ error: 'receipt_upload_id is required' }, 400);
    }

    // 1. Read the receipt_upload record
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('receipt_uploads')
      .select('*')
      .eq('id', receipt_upload_id)
      .eq('user_id', user.id)
      .single();

    if (uploadError || !uploadRecord) {
      return json({ error: 'Receipt upload not found' }, 404);
    }

    if (uploadRecord.status !== 'uploaded') {
      return json({ error: 'Receipt already processed' }, 400);
    }

    // 2. Call parseReceipt()
    const parsedReceipt = await parseReceipt(
      uploadRecord.image_url,
      uploadRecord.retailer_key || 'unknown',
      supabase
    );

    // 3. Write parsed items to receipt_items table
    const receiptItems = parsedReceipt.items.map(item => ({
      receipt_id: receipt_upload_id,
      product_name: item.product_name,
      qty: item.qty,
      unit_price: item.unit_price,
      line_total: item.line_total,
      promo_savings_cents: item.promo_savings_cents || 0,
      normalized_key: item.normalized_key,
      category: item.category,
      brand: item.brand,
    }));

    const { error: itemsError } = await supabase
      .from('receipt_items')
      .insert(receiptItems);

    if (itemsError) {
      throw new Error(`Failed to save receipt items: ${itemsError.message}`);
    }

    // 4. Update receipt_uploads status to 'parsed'
    const { error: updateError } = await supabase
      .from('receipt_uploads')
      .update({
        status: 'parsed',
        parsed_at: new Date().toISOString(),
        store_name: parsedReceipt.store_name,
        total_cents: parsedReceipt.total_cents,
      })
      .eq('id', receipt_upload_id);

    if (updateError) {
      throw new Error(`Failed to update receipt status: ${updateError.message}`);
    }

    // 5. Call wealthEngine.computeAndSave()
    const wealthResult = await computeAndSave(user.id, receipt_upload_id, supabase);

    // 6. Fire event: purchase_completed to event_stream
    const { error: eventError } = await supabase
      .from('event_stream')
      .insert({
        user_id: user.id,
        event_name: 'purchase_completed',
        object_type: 'receipt',
        object_id: receipt_upload_id,
        retailer_key: uploadRecord.retailer_key,
        metadata: {
          total_cents: parsedReceipt.total_cents,
          item_count: parsedReceipt.items.length,
          store_name: parsedReceipt.store_name,
          realized_savings: wealthResult.realized_savings,
          wealth_momentum: wealthResult.wealth_momentum,
        },
      });

    if (eventError) {
      console.error('Failed to log purchase_completed event:', eventError);
      // Don't fail the request for event logging errors
    }

    // 7. Return WealthMomentumResult + parsed items
    return json({
      success: true,
      receipt: parsedReceipt,
      wealth_result: wealthResult,
    });

  } catch (error) {
    console.error('[process-receipt]', error);
    return json({
      error: error.message || 'Internal server error',
      success: false
    }, 500);
  }
});