// ============================================================
// Snippd — Anticipatory Plan Generator
// supabase/functions/anticipatory-plan/index.ts
//
// POST /functions/v1/anticipatory-plan
// Auth: x-ingest-key (server-to-server, pg_cron every Monday 6AM)
//   OR  Bearer JWT  (user requests a manual refresh)
//
// Flow:
//   1. For each user with push_notifications_on = true:
//   2. Load their household_cart_items (pending essentials)
//   3. Load this week's stack_candidates for their preferred stores
//   4. Match essentials → deals (normalized_key / brand fuzzy)
//   5. Compute total_savings_cents
//   6. Upsert into anticipatory_plans (UNIQUE user_id + week_of)
//   7. Send Expo push notification via Expo Push API
//   8. Mark push_sent_at
//
// Single-user refresh (Bearer JWT):
//   POST body: { force_refresh: true }
//   Returns: the plan JSON immediately
// ============================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-ingest-key',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });

// ── Expo Push API ─────────────────────────────────────────────

interface PushTicket {
  status: 'ok' | 'error';
  id?:    string;
  message?: string;
}

async function sendExpoPush(
  token:     string,
  title:     string,
  body:      string,
  data:      Record<string, unknown> = {},
): Promise<PushTicket> {
  try {
    const resp = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify({ to: token, title, body, data, sound: 'default', priority: 'high' }),
    });
    if (!resp.ok) return { status: 'error', message: `HTTP ${resp.status}` };
    const result = await resp.json();
    return result.data ?? { status: 'error' };
  } catch (e) {
    return { status: 'error', message: String(e) };
  }
}

// ── Fuzzy match helper ─────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function essentialMatchesDeal(
  itemName:      string,
  normalizedKey: string | null,
  brand:         string | null,
): boolean {
  const slug = slugify(itemName);
  if (normalizedKey && slug.includes(normalizedKey.split('-')[0])) return true;
  if (brand && slugify(brand).split('-').some(w => w.length > 3 && slug.includes(w))) return true;
  // Also check reverse: does the deal key appear in the item name?
  if (normalizedKey) {
    const dealWords = normalizedKey.split('-').filter(w => w.length > 3);
    return dealWords.some(w => slug.includes(w));
  }
  return false;
}

// ── Build plan for a single user ─────────────────────────────

interface PlanItem {
  item_name:      string;
  retailer_key:   string;
  deal_type:      string;
  savings_cents:  number;
  normalized_key: string;
}

interface BuildResult {
  plan_items:         PlanItem[];
  total_savings_cents: number;
  essentials_matched: number;
}

async function buildPlanForUser(
  db:     ReturnType<typeof createClient>,
  userId: string,
): Promise<BuildResult> {
  // Load household essentials
  const { data: essentials } = await db
    .from('household_cart_items')
    .select('item_name, quantity')
    .eq('user_id', userId)
    .eq('status', 'pending')
    .limit(30);

  // Load preferred retailers
  const { data: persona } = await db
    .from('user_persona')
    .select('preferred_stores')
    .eq('user_id', userId)
    .single();

  const preferredStores: string[] = persona?.preferred_stores ?? [
    'publix', 'kroger', 'walmart', 'target',
  ];

  // Load this week's stack_candidates for preferred retailers
  const monday = new Date();
  monday.setDate(monday.getDate() - monday.getDay() + 1); // Monday
  const weekOf = monday.toISOString().split('T')[0];

  const { data: deals } = await db
    .from('stack_candidates')
    .select('retailer_key, normalized_key, primary_brand, stack_rank_score, deal_type_label')
    .in('retailer_key', preferredStores)
    .gte('week_of', weekOf)
    .eq('validation_status', 'approved')
    .order('stack_rank_score', { ascending: false })
    .limit(100);

  if (!essentials?.length || !deals?.length) {
    return { plan_items: [], total_savings_cents: 0, essentials_matched: 0 };
  }

  const matchedItems: PlanItem[] = [];
  const matchedEssentialNames = new Set<string>();

  for (const deal of deals) {
    for (const essential of essentials) {
      if (matchedEssentialNames.has(essential.item_name)) continue;
      if (essentialMatchesDeal(essential.item_name, deal.normalized_key, deal.primary_brand)) {
        matchedItems.push({
          item_name:     essential.item_name,
          retailer_key:  deal.retailer_key,
          deal_type:     deal.deal_type_label ?? 'SALE',
          savings_cents: Math.round((deal.stack_rank_score ?? 0) * 100),
          normalized_key: deal.normalized_key ?? slugify(essential.item_name),
        });
        matchedEssentialNames.add(essential.item_name);
        break; // one deal per essential
      }
    }
  }

  const totalSavings = matchedItems.reduce((s, i) => s + i.savings_cents, 0);

  return {
    plan_items:          matchedItems,
    total_savings_cents: totalSavings,
    essentials_matched:  matchedItems.length,
  };
}

// ── Main handler ──────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const ingestKey    = Deno.env.get('INGEST_KEY') ?? '';

  if (!supabaseUrl || !serviceKey) return json({ error: 'Server misconfigured' }, 500);

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // ── Auth: Bearer JWT (single user) or x-ingest-key (batch) ──
  const authHeader  = req.headers.get('authorization') ?? '';
  const ingestHeader = req.headers.get('x-ingest-key') ?? '';

  let singleUserId: string | null = null;
  let isBatch = false;

  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const { data: { user }, error } = await db.auth.getUser(authHeader.slice(7));
    if (error || !user) return json({ error: 'Unauthorized' }, 401);
    singleUserId = user.id;
  } else if (ingestHeader && ingestKey && ingestHeader === ingestKey) {
    isBatch = true;
  } else {
    return json({ error: 'Unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay() + 1);
  const weekOfStr = weekOf.toISOString().split('T')[0];

  // ── Single-user refresh ───────────────────────────────────────
  if (singleUserId) {
    const planData = await buildPlanForUser(db, singleUserId);

    const { data: upserted } = await db
      .from('anticipatory_plans')
      .upsert({
        user_id:             singleUserId,
        week_of:             weekOfStr,
        plan_items:          planData.plan_items,
        total_savings_cents: planData.total_savings_cents,
        item_count:          planData.plan_items.length,
        essentials_matched:  planData.essentials_matched,
        status:              'ready',
        updated_at:          new Date().toISOString(),
      }, { onConflict: 'user_id,week_of' })
      .select()
      .single();

    return json({
      ok:                  true,
      plan_id:             upserted?.id,
      total_savings_cents: planData.total_savings_cents,
      item_count:          planData.plan_items.length,
      essentials_matched:  planData.essentials_matched,
      plan_items:          planData.plan_items,
    });
  }

  // ── Batch: all users with push tokens (Monday morning cron) ──
  if (!isBatch) return json({ error: 'Forbidden' }, 403);

  const { data: users } = await db
    .from('profiles')
    .select('user_id, expo_push_token')
    .eq('push_notifications_on', true)
    .not('expo_push_token', 'is', null)
    .limit(500);

  if (!users?.length) return json({ ok: true, processed: 0, message: 'No users with push tokens' });

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const profile of users) {
    try {
      // Skip if plan already sent this week
      const { data: existing } = await db
        .from('anticipatory_plans')
        .select('id, push_sent_at')
        .eq('user_id', profile.user_id)
        .eq('week_of', weekOfStr)
        .single();

      if (existing?.push_sent_at) { skipped++; continue; }

      const planData = await buildPlanForUser(db, profile.user_id);
      if (planData.plan_items.length === 0) { skipped++; continue; }

      const savings = '$' + (planData.total_savings_cents / 100).toFixed(2);

      // Upsert plan
      const { data: plan } = await db
        .from('anticipatory_plans')
        .upsert({
          user_id:             profile.user_id,
          week_of:             weekOfStr,
          plan_items:          planData.plan_items,
          total_savings_cents: planData.total_savings_cents,
          item_count:          planData.plan_items.length,
          essentials_matched:  planData.essentials_matched,
          status:              'ready',
          push_token:          profile.expo_push_token,
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'user_id,week_of' })
        .select('id')
        .single();

      // Send push
      const ticket = await sendExpoPush(
        profile.expo_push_token,
        `Your ${savings} Savings Plan is ready`,
        `${planData.essentials_matched} of your weekly essentials are at their best price this week. Tap to clip all.`,
        { screen: 'AnticipatoryPlan', plan_id: plan?.id },
      );

      // Mark sent
      await db
        .from('anticipatory_plans')
        .update({ push_sent_at: new Date().toISOString() })
        .eq('id', plan?.id);

      if (ticket.status === 'ok') sent++;
      else errors.push(`${profile.user_id}: ${ticket.message}`);

    } catch (e) {
      errors.push(`${profile.user_id}: ${String(e)}`);
    }
  }

  return json({
    ok:       true,
    processed: users.length,
    sent,
    skipped,
    errors:   errors.slice(0, 10), // cap error list
  });
});
