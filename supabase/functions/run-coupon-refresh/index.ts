// run-coupon-refresh
//
// Strict verified coupon evidence ingester.
// Auth: x-cron-secret header or Authorization: Bearer <service_role_key>.
//
// Supported inputs:
// - Scheduled/manual run: reads active retailer_coupon_sources. JSON feeds are
//   ingested directly; the Dollar General source uses its public guest coupon API.
// - Manual evidence run: POST { retailer_key, coupons: [...] } with exact URLs.
//
// Generic HTML coupon pages are intentionally logged as adapter_required. The
// app should never guess coupons from a page scrape without an exact evidence row.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type CouponInput = {
  retailer_key?: string;
  coupon_external_id?: string;
  exact_coupon_url?: string;
  source_page_url?: string;
  product_name?: string;
  brand?: string;
  normalized_key?: string;
  coupon_title?: string;
  coupon_value_text?: string;
  coupon_value_cents?: number;
  minimum_purchase_qty?: number;
  expiration_date?: string;
  valid_start_date?: string;
  region?: string;
  zip_code?: string;
  clipped_status?: string;
  screenshot_url?: string;
  raw_payload?: Record<string, unknown>;
};

type SourceRow = {
  id: string;
  retailer_key: string;
  store_region: string | null;
  source_url: string;
  source_type: string;
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

function verifyServiceAuth(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const cronHeader = req.headers.get('x-cron-secret') ?? '';
  const authHeader = req.headers.get('authorization') ?? '';

  return Boolean(
    (cronSecret && cronHeader === cronSecret) ||
    (serviceKey && authHeader === `Bearer ${serviceKey}`),
  );
}

function normalizeKey(value: string): string {
  return value
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\b\d+(ct|oz|fl oz|lb|lbs|g|kg|pk|pack|count)\b/gi, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function getCookieFromSetCookie(setCookie: string | null): string {
  if (!setCookie) return '';
  return setCookie
    .split(/,(?=[^;,]+=)/)
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function firstString(row: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = row[key];
    if (value != null && String(value).trim()) return String(value).trim();
  }
  return '';
}

function firstNumber(row: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === '') continue;
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function centsFromCoupon(row: Record<string, unknown>): number | null {
  const cents = firstNumber(row, ['coupon_value_cents', 'CouponValueCents', 'discount_cents']);
  if (cents != null) return Math.round(cents);
  const dollars = firstNumber(row, ['OfferValue', 'offerValue', 'RewaredOfferValue', 'SavingsAmount']);
  if (dollars != null) return Math.round(dollars * 100);
  const text = firstString(row, ['OfferSummary', 'OfferDescription', 'coupon_value_text', 'CouponValueText']);
  const match = text.match(/\$\s*(\d+(?:\.\d{1,2})?)/);
  return match ? Math.round(Number(match[1]) * 100) : null;
}

function isHttpUrl(value?: string): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isGenericHomepage(value?: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return (url.pathname === '' || url.pathname === '/') && !url.search;
  } catch {
    return true;
  }
}

async function sha256(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function buildEvidenceRows(
  coupons: CouponInput[],
  defaults: { retailer_key: string; region?: string | null; source_page_url?: string },
) {
  const rows = [];
  const rejected: string[] = [];

  for (const coupon of coupons) {
    const retailerKey = String(coupon.retailer_key || defaults.retailer_key || '').toLowerCase().trim();
    const exactUrl = String(coupon.exact_coupon_url || '').trim();
    const sourceUrl = String(coupon.source_page_url || defaults.source_page_url || '').trim();
    const title = String(coupon.coupon_title || coupon.product_name || '').trim();

    if (!retailerKey) {
      rejected.push('missing_retailer_key');
      continue;
    }
    if (!title) {
      rejected.push(`${retailerKey}:missing_coupon_title`);
      continue;
    }
    if (!isHttpUrl(exactUrl) || !isHttpUrl(sourceUrl)) {
      rejected.push(`${retailerKey}:${title}:invalid_url`);
      continue;
    }
    if (exactUrl === sourceUrl || isGenericHomepage(exactUrl) || isGenericHomepage(sourceUrl)) {
      rejected.push(`${retailerKey}:${title}:non_exact_url`);
      continue;
    }

    const normalized = coupon.normalized_key ||
      normalizeKey([coupon.brand, coupon.product_name || coupon.coupon_title].filter(Boolean).join(' '));
    const hash = await sha256([
      retailerKey,
      coupon.coupon_external_id || '',
      exactUrl,
      sourceUrl,
      title,
      coupon.coupon_value_text || coupon.coupon_value_cents || '',
      coupon.expiration_date || '',
    ].join('|'));

    rows.push({
      retailer_key: retailerKey,
      coupon_external_id: coupon.coupon_external_id || null,
      exact_coupon_url: exactUrl,
      source_page_url: sourceUrl,
      product_name: coupon.product_name || title,
      brand: coupon.brand || null,
      normalized_key: normalized || null,
      coupon_title: title,
      coupon_value_text: coupon.coupon_value_text || null,
      coupon_value_cents: Number.isFinite(Number(coupon.coupon_value_cents))
        ? Math.round(Number(coupon.coupon_value_cents))
        : null,
      minimum_purchase_qty: Number.isFinite(Number(coupon.minimum_purchase_qty))
        ? Math.max(1, Math.round(Number(coupon.minimum_purchase_qty)))
        : null,
      expiration_date: coupon.expiration_date || null,
      valid_start_date: coupon.valid_start_date || null,
      region: coupon.region || defaults.region || null,
      zip_code: coupon.zip_code || null,
      clipped_status: ['clipped', 'not_clipped', 'unknown'].includes(String(coupon.clipped_status))
        ? coupon.clipped_status
        : 'unknown',
      raw_payload: coupon.raw_payload || coupon,
      evidence_hash: hash,
      screenshot_url: coupon.screenshot_url || null,
      verified_at: new Date().toISOString(),
      expires_at: null,
      verification_status: 'verified',
      hidden_reason: null,
    });
  }

  return { rows, rejected };
}

async function loadJsonFeed(source: SourceRow): Promise<CouponInput[]> {
  const res = await fetch(source.source_url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`fetch_${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data as CouponInput[];
  if (Array.isArray(data?.coupons)) return data.coupons as CouponInput[];
  if (Array.isArray(data?.offers)) return data.offers as CouponInput[];
  throw new Error('json_feed_missing_coupons_array');
}

async function loadDollarGeneralCoupons(source: SourceRow): Promise<CouponInput[]> {
  const pageUrl = source.source_url || 'https://www.dollargeneral.com/deals/coupons';
  const tokenRes = await fetch('https://www.dollargeneral.com/bin/omni/userTokens', {
    headers: {
      Accept: 'application/json, text/plain, */*',
      Referer: pageUrl,
      'User-Agent': 'Mozilla/5.0',
    },
  });

  const cookie = getCookieFromSetCookie(tokenRes.headers.get('set-cookie'));
  const deviceMatch = cookie.match(/uniqueDeviceId=([^;]+)/);
  const deviceId = deviceMatch?.[1] || crypto.randomUUID();
  const payload = {
    SortOrder: 2,
    SortBy: 0,
    NumPageRecords: 50,
    PageIndex: 0,
    offerSourceType: 0,
    MixMode: 1,
    FilterType: 1,
    IncludeClippedCategories: false,
    displayAllCategoriesAndBrands: true,
    deviceId,
    isMobileDevice: true,
    excludeCustomerGuid: true,
    clientOriginStoreNumber: '',
  };

  const res = await fetch('https://dggo.dollargeneral.com/omni/api/coupons/sort/v3/provider', {
    method: 'POST',
    headers: {
      Accept: 'application/json, text/plain, */*',
      'Content-Type': 'application/json',
      Origin: 'https://www.dollargeneral.com',
      Referer: pageUrl,
      'User-Agent': 'Mozilla/5.0',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  if (!res.ok) throw new Error(`dollar_general_${res.status}:${text.slice(0, 120)}`);
  if (!text.trim()) return [];

  const data = JSON.parse(text);
  const rawCoupons = Array.isArray(data)
    ? data
    : Array.isArray(data?.Coupons)
      ? data.Coupons
      : Array.isArray(data?.coupons)
        ? data.coupons
        : Array.isArray(data?.data?.Coupons)
          ? data.data.Coupons
          : [];

  return rawCoupons.map((raw: Record<string, unknown>) => {
    const offerCode = firstString(raw, ['OfferCode', 'offerCode', 'CouponCode', 'couponCode']);
    const offerId = firstString(raw, ['OfferGuid', 'OfferID', 'OfferId', 'id']);
    const title = firstString(raw, ['OfferSummary', 'OfferDescription', 'ShortDescription', 'Description', 'name']);
    const brand = firstString(raw, ['BrandName', 'brand', 'ManufacturerName']);
    const product = firstString(raw, ['ProductDescription', 'ProductName', 'OfferDescription', 'name']) || title;
    const expires = firstString(raw, ['OfferExpirationDate', 'expiration_date', 'expiryDate']).slice(0, 10);
    const exactCode = offerCode || offerId;

    return {
      retailer_key: source.retailer_key,
      coupon_external_id: offerId || offerCode || undefined,
      exact_coupon_url: exactCode
        ? `https://www.dollargeneral.com/deals/coupons/save-${encodeURIComponent(exactCode)}`
        : undefined,
      source_page_url: pageUrl,
      product_name: product,
      brand,
      normalized_key: normalizeKey([brand, product].filter(Boolean).join(' ')),
      coupon_title: title || product,
      coupon_value_text: firstString(raw, ['OfferSummary', 'CouponValueText', 'coupon_value_text']),
      coupon_value_cents: centsFromCoupon(raw) ?? undefined,
      expiration_date: expires || undefined,
      raw_payload: raw,
    };
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!verifyServiceAuth(req)) return json({ error: 'Unauthorized' }, 401);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  let body: {
    retailer_key?: string;
    region?: string;
    dry_run?: boolean;
    coupons?: CouponInput[];
  } = {};
  try { body = await req.json(); } catch { /* empty body ok */ }

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const startedAt = new Date().toISOString();
  const steps: string[] = [];
  let couponsFound = 0;
  let couponsVerified = 0;
  let couponsHidden = 0;
  let runStatus: 'succeeded' | 'failed' | 'partial' = 'succeeded';

  const runInsert = await db.from('coupon_refresh_runs').insert({
    retailer_key: body.retailer_key || 'all',
    region: body.region || null,
    started_at: startedAt,
    status: 'running',
  }).select('id').single();

  const runId = runInsert.data?.id;

  try {
    let allRows: Record<string, unknown>[] = [];
    let allRejected: string[] = [];
    const seenByRetailer = new Map<string, string[]>();

    if (Array.isArray(body.coupons) && body.coupons.length > 0) {
      const { rows, rejected } = await buildEvidenceRows(body.coupons, {
        retailer_key: body.retailer_key || '',
        region: body.region || null,
      });
      allRows = rows;
      allRejected = rejected;
      steps.push(`manual_payload:${body.coupons.length}`);
    } else {
      let query = db
        .from('retailer_coupon_sources')
        .select('id, retailer_key, store_region, source_url, source_type')
        .eq('is_active', true);

      if (body.retailer_key) query = query.eq('retailer_key', body.retailer_key);

      const { data: sources, error } = await query;
      if (error) throw new Error(error.message);

      const scopedSources = ((sources ?? []) as SourceRow[]).filter(source =>
        !body.region || !source.store_region || source.store_region === body.region
      );

      for (const source of scopedSources) {
        if (source.source_type === 'dollar_general_public_api') {
          try {
            const coupons = await loadDollarGeneralCoupons(source);
            const { rows, rejected } = await buildEvidenceRows(coupons, {
              retailer_key: source.retailer_key,
              region: source.store_region,
              source_page_url: source.source_url,
            });
            allRows = allRows.concat(rows);
            allRejected = allRejected.concat(rejected);
            steps.push(`${source.retailer_key}:dollar_general_public_api:${coupons.length}`);
          } catch (e) {
            runStatus = 'partial';
            steps.push(`${source.retailer_key}:adapter_error:${String(e).slice(0, 80)}`);
          }
          continue;
        }

        if (!['json_coupon_feed', 'retailer_api_json'].includes(source.source_type)) {
          steps.push(`${source.retailer_key}:adapter_required:${source.source_type}`);
          continue;
        }

        try {
          const coupons = await loadJsonFeed(source);
          const { rows, rejected } = await buildEvidenceRows(coupons, {
            retailer_key: source.retailer_key,
            region: source.store_region,
            source_page_url: source.source_url,
          });
          allRows = allRows.concat(rows);
          allRejected = allRejected.concat(rejected);
          steps.push(`${source.retailer_key}:json_feed:${coupons.length}`);
        } catch (e) {
          runStatus = 'partial';
          steps.push(`${source.retailer_key}:fetch_error:${String(e).slice(0, 80)}`);
        }
      }
    }

    couponsFound = allRows.length + allRejected.length;
    couponsHidden = allRejected.length;

    for (const row of allRows) {
      const key = String(row.retailer_key);
      const hash = String(row.evidence_hash);
      seenByRetailer.set(key, [...(seenByRetailer.get(key) ?? []), hash]);
    }

    if (!body.dry_run && allRows.length > 0) {
      const { error } = await db
        .from('digital_coupon_evidence')
        .upsert(allRows, { onConflict: 'evidence_hash' });
      if (error) throw new Error(error.message);

      couponsVerified = allRows.length;
      for (const [retailerKey, hashes] of seenByRetailer.entries()) {
        await db.rpc('mark_stale_coupons_for_run', {
          p_retailer_key: retailerKey,
          p_region: body.region || null,
          p_seen_hashes: hashes,
        });
      }
    }

    if (allRejected.length > 0 && allRows.length === 0) runStatus = 'failed';
    else if (allRejected.length > 0 || runStatus === 'partial') runStatus = 'partial';

    await db.from('coupon_refresh_runs').update({
      finished_at: new Date().toISOString(),
      status: body.dry_run ? 'partial' : runStatus,
      coupons_found: couponsFound,
      coupons_verified: body.dry_run ? 0 : couponsVerified,
      coupons_hidden: couponsHidden,
      error_message: allRejected.slice(0, 10).join('; ') || null,
    }).eq('id', runId);

    return json({
      ok: runStatus !== 'failed',
      dry_run: Boolean(body.dry_run),
      status: body.dry_run ? 'partial' : runStatus,
      coupons_found: couponsFound,
      coupons_verified: body.dry_run ? 0 : couponsVerified,
      coupons_hidden: couponsHidden,
      steps,
      rejected: allRejected.slice(0, 25),
    }, runStatus === 'failed' ? 422 : 200);
  } catch (e) {
    await db.from('coupon_refresh_runs').update({
      finished_at: new Date().toISOString(),
      status: 'failed',
      coupons_found: couponsFound,
      coupons_verified: couponsVerified,
      coupons_hidden: couponsHidden,
      error_message: String(e).slice(0, 500),
    }).eq('id', runId);

    return json({ ok: false, error: String(e), steps }, 500);
  }
});
