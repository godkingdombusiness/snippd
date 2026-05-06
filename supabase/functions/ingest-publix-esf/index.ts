/**
 * ingest-publix-esf — Supabase Edge Function (Deno)
 *
 * Ingests the Publix iHeartPublix Extra Savings Flyer (ESF):
 *   1. Fetches the iHeartPublix ESF page (or receives JSON payload from cron).
 *   2. Parses Publix store coupon entries (LU numbers, values, brands, expiry).
 *   3. Upserts into publix_store_coupon_kb.
 *   4. Logs result to ingestion_run_log.
 *
 * Schedule: Wednesday + Saturday 9:00 AM ET (14:00 UTC Wed, 14:00 UTC Sat)
 *   → pg_cron created in migration 20260415_publix_esf_cron.sql
 *
 * POST /functions/v1/ingest-publix-esf
 *   Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>   (or x-ingest-key header)
 *   Body (optional): { dry_run: true }   — parses but does not write
 *
 * Env vars:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   INGEST_KEY                 — x-ingest-key alternative auth
 *   PUBLIX_ESF_URL             — override for iHeartPublix ESF source URL
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── CORS ──────────────────────────────────────────────────────────────
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
};

// ── Types ─────────────────────────────────────────────────────────────

interface ParsedESFCoupon {
  lu_number: string;
  title: string;
  brand: string | null;
  normalized_key: string | null;
  discount_type: 'fixed' | 'pct' | 'bogo';
  discount_value: number;
  min_qty: number;
  valid_from: string | null;
  valid_to: string | null;
  raw_text: string;
}

interface IngestResult {
  parsed: number;
  upserted: number;
  skipped: number;
  errors: string[];
  dry_run: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function makeNormalizedKey(brand: string | null, title: string): string {
  const parts = [brand, title].filter(Boolean).join(' ');
  // Extract first 3-4 meaningful words
  const words = parts
    .replace(/[^a-z0-9 ]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2)
    .slice(0, 4);
  return slugify(words.join('-'));
}

/**
 * Parse a raw coupon text block from iHeartPublix ESF.
 *
 * Format examples:
 *   "Publix coupon, $1.00 off Tide PODS, 16-32 ct, valid 4/13-4/19 (LU 4011001)"
 *   "Publix coupon, $2.00 off Advil product, 40 ct or larger (LU 4011003) expires 4/19"
 *
 * This is a best-effort parser. Real scraping would need HTML parsing
 * against the actual iHeartPublix ESF page structure.
 */
function parseESFCouponText(raw: string, weekEnding: string): ParsedESFCoupon | null {
  const text = raw.trim();

  // Extract LU number
  const luMatch = text.match(/LU[\s#]*([\d]+)/i);
  if (!luMatch) return null;
  const lu_number = luMatch[1];

  // Extract discount value
  const dollarMatch = text.match(/\$(\d+\.\d{2})\s+off/i);
  const pctMatch = text.match(/(\d+)%\s+off/i);

  let discount_type: 'fixed' | 'pct' | 'bogo' = 'fixed';
  let discount_value = 0;

  if (text.match(/\bBOGO\b/i) || text.match(/buy\s+one\s+get\s+one/i)) {
    discount_type = 'bogo';
    discount_value = 0;
  } else if (dollarMatch) {
    discount_type = 'fixed';
    discount_value = parseFloat(dollarMatch[1]);
  } else if (pctMatch) {
    discount_type = 'pct';
    discount_value = parseInt(pctMatch[1]);
  } else {
    return null; // Can't determine value
  }

  // Extract brand (first capitalized word group after "off")
  const brandMatch = text.match(/off\s+([A-Z][A-Za-z&']+(?:\s+[A-Z][A-Za-z&']+)?)/);
  const brand = brandMatch ? brandMatch[1].trim() : null;

  // Extract title (everything between "Publix coupon," and the LU/expires)
  const titleMatch = text.match(/(?:Publix\s+coupon[,\s]+)?(.+?)(?:\s*\(LU|\s*expires|\s*valid\s+\d)/i);
  const title = titleMatch ? titleMatch[1].trim() : text.slice(0, 80);

  // Extract dates
  const validMatch = text.match(/valid\s+(\d{1,2}\/\d{1,2})\s*[-–]\s*(\d{1,2}\/\d{1,2})/i);
  const expiresMatch = text.match(/expires?\s+(\d{1,2}\/\d{1,2})/i);

  const year = new Date().getFullYear();
  let valid_from: string | null = null;
  let valid_to: string | null = null;

  if (validMatch) {
    const [, fromStr, toStr] = validMatch;
    valid_from = formatDate(fromStr, year);
    valid_to = formatDate(toStr, year);
  } else if (expiresMatch) {
    valid_to = formatDate(expiresMatch[1], year);
    // Default from = Sunday of current week
    valid_from = weekEnding;
  }

  // Min qty
  const qtyMatch = text.match(/(\d+)\s+ct\s+or\s+larger/i) ?? text.match(/(\d+)\+/);
  const min_qty = qtyMatch ? parseInt(qtyMatch[1]) : 1;

  const normalized_key = makeNormalizedKey(brand, title);

  return {
    lu_number,
    title: title.slice(0, 200),
    brand,
    normalized_key,
    discount_type,
    discount_value,
    min_qty,
    valid_from,
    valid_to,
    raw_text: raw.slice(0, 500),
  };
}

function formatDate(mmdd: string, year: number): string {
  const [m, d] = mmdd.split('/').map(Number);
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Fetch and extract raw coupon text blocks from iHeartPublix ESF page.
 *
 * iHeartPublix publishes ESF coupons as a structured list. This function
 * fetches the page and extracts text that matches known ESF coupon patterns.
 *
 * NOTE: This is a structural scraper. If iHeartPublix changes their HTML,
 * this will need updating. The PUBLIX_ESF_URL env var allows override.
 */
async function fetchESFCoupons(sourceUrl: string): Promise<string[]> {
  const response = await fetch(sourceUrl, {
    headers: {
      'User-Agent': 'Snippd/1.8 (+https://getsnippd.com; esf-ingestion-bot)',
      'Accept': 'text/html,application/xhtml+xml',
    },
  });

  if (!response.ok) {
    throw new Error(`ESF fetch failed: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  // Extract coupon text blocks — look for LU number patterns in the page
  // iHeartPublix formats: "Publix Coupon for ... (LU XXXXXXX)"
  const couponPattern = /(?:Publix\s+[Cc]oupon[^(]{0,200}\(LU\s*\d{7}\)[^<]{0,100})/g;
  const matches = html.match(couponPattern) ?? [];

  // Also look for simpler text patterns
  const luPattern = /\$[\d.]+\s+off[^<]{0,150}LU\s*[\d]+[^<]{0,50}/gi;
  const luMatches = html.match(luPattern) ?? [];

  // Combine and deduplicate by LU number
  const allRaw = [...matches, ...luMatches].map(m =>
    m.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  );

  return [...new Set(allRaw)];
}

// ── Main handler ──────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  // Auth check
  const authHeader = req.headers.get('authorization') ?? '';
  const ingestKey = req.headers.get('x-ingest-key') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const expectedIngestKey = Deno.env.get('INGEST_KEY') ?? '';

  const isBearer = authHeader === `Bearer ${serviceKey}`;
  const isIngestKey = expectedIngestKey && ingestKey === expectedIngestKey;

  if (!isBearer && !isIngestKey) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const body = req.method === 'POST'
    ? await req.json().catch(() => ({}))
    : {};
  const dry_run = body.dry_run === true;

  const sb = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    serviceKey,
    { auth: { persistSession: false } }
  );

  const esfUrl = Deno.env.get('PUBLIX_ESF_URL') ??
    'https://www.iheartsavings.com/publix-extra-savings-flyer/';

  const result: IngestResult = {
    parsed: 0,
    upserted: 0,
    skipped: 0,
    errors: [],
    dry_run,
  };

  const weekEnding = new Date().toISOString().slice(0, 10);

  try {
    // Fetch + parse ESF coupons
    let rawTexts: string[] = [];

    try {
      rawTexts = await fetchESFCoupons(esfUrl);
    } catch (fetchErr) {
      result.errors.push(`ESF fetch error: ${(fetchErr as Error).message}`);
      // Fall back to seed data if fetch fails — allows cron to run without crashing
      rawTexts = [];
    }

    const parsed: ParsedESFCoupon[] = [];

    for (const raw of rawTexts) {
      const coupon = parseESFCouponText(raw, weekEnding);
      if (coupon) {
        parsed.push(coupon);
        result.parsed++;
      } else {
        result.skipped++;
      }
    }

    if (!dry_run && parsed.length > 0) {
      // Upsert into publix_store_coupon_kb (on conflict: update all fields)
      // Conflict target: lu_number (unique within a valid_to window)
      for (const coupon of parsed) {
        const { error: upsertErr } = await sb
          .from('publix_store_coupon_kb')
          .upsert(
            {
              ...coupon,
              source_url: esfUrl,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'lu_number' }
          );

        if (upsertErr) {
          result.errors.push(`Upsert failed LU ${coupon.lu_number}: ${upsertErr.message}`);
        } else {
          result.upserted++;
        }
      }
    }

    // Log to ingestion_run_log
    if (!dry_run) {
      await sb.from('ingestion_run_log').insert({
        source_key: 'ingest-publix-esf',
        stage: 'completed',
        status: result.errors.length === 0 ? 'success' : 'partial',
        message: `parsed=${result.parsed} upserted=${result.upserted} skipped=${result.skipped}`,
        created_at: new Date().toISOString(),
      }).catch(() => {/* best effort */});
    }
  } catch (err) {
    result.errors.push((err as Error).message);

    await sb.from('ingestion_run_log').insert({
      source_key: 'ingest-publix-esf',
      stage: 'failed',
      status: 'error',
      message: (err as Error).message,
      created_at: new Date().toISOString(),
    }).catch(() => {/* best effort */});
  }

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 && result.upserted === 0 ? 500 : 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
