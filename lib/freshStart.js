import { supabase } from './supabase';
import { AuditLogger } from './auditLogger';
import { buildWealthSnapshot } from '../services/WealthEngine';

// ── Fresh Start Orchestrator ──────────────────────────────────────────────────
//
// Runs after a receipt is verified. The full magic loop:
//   1. Atomic week-close via Postgres (fn_close_week)
//   2. Learn: update pantry_velocity with items from this trip
//   3. Learn: write ai_training_features snapshot
//   4. Personalize: call Gemini proxy → generate next-week feed for this user
//   5. Cache: store personalized feed in home_payload_cache
//   6. Return summary for the WinsScreen celebration
//
// Usage:
//   import { runFreshStart } from '../lib/freshStart';
//   const summary = await runFreshStart({ tripItems, storeName, totalSpentCents, savedCents });

const PROXY = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/gemini-proxy`;

export async function runFreshStart({ tripItems = [], storeName = '', totalSpentCents = 0, savedCents = 0 }) {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (!user || authError) throw new Error('Not authenticated');

  const { data: { session } } = await supabase.auth.getSession();

  // ── Step 1: Atomic week-close ──────────────────────────────────────────────
  const { data: closeResult, error: closeError } = await supabase.rpc('close_week', {
    p_user_id: user.id,
  });
  if (closeError) throw new Error(`Week close failed: ${closeError.message}`);

  // ── Step 2: Update pantry_velocity (purchase pattern learning) ────────────
  // For each item in the trip, upsert into pantry_velocity to track frequency
  if (tripItems.length > 0) {
    for (const item of tripItems) {
      const name = (item.product_name || item.item_name || '').toLowerCase().trim();
      if (!name) continue;

      const { data: existing } = await supabase
        .from('pantry_velocity')
        .select('id, purchase_count, last_purchase_date, avg_days_between_purchase')
        .eq('user_id', user.id)
        .eq('product_name', name)
        .single();

      if (existing) {
        const daysSinceLast = existing.last_purchase_date
          ? Math.round((Date.now() - new Date(existing.last_purchase_date).getTime()) / 86400000)
          : null;
        const newAvg = daysSinceLast
          ? Math.round(
              (existing.avg_days_between_purchase * (existing.purchase_count - 1) + daysSinceLast)
              / existing.purchase_count
            )
          : existing.avg_days_between_purchase;

        await supabase.from('pantry_velocity').update({
          purchase_count:           existing.purchase_count + 1,
          last_purchase_date:       new Date().toISOString().split('T')[0],
          avg_days_between_purchase: newAvg,
          predicted_exhaustion_date: newAvg
            ? new Date(Date.now() + newAvg * 86400000).toISOString().split('T')[0]
            : null,
        }).eq('id', existing.id);
      } else {
        await supabase.from('pantry_velocity').insert({
          user_id:          user.id,
          product_name:     name,
          purchase_count:   1,
          last_purchase_date: new Date().toISOString().split('T')[0],
        });
      }
    }
  }

  // ── Step 3: Write ai_training_features snapshot ───────────────────────────
  // Captures what this user bought, what they saved, and their profile DNA
  // for future recommendation tuning
  const { data: profileSnap } = await supabase
    .from('profiles')
    .select('dietary_tags, preferred_stores, household_size, weekly_budget, preferences')
    .eq('user_id', user.id)
    .single();

  const categories = {};
  tripItems.forEach(item => {
    const cat = item.category || 'Other';
    categories[cat] = (categories[cat] || 0) + 1;
  });

  await supabase.from('ai_training_features').insert({
    feature_type: 'trip_completion',
    user_dna_snapshot: {
      user_id:          user.id,
      dietary_tags:     profileSnap?.dietary_tags || [],
      preferred_stores: profileSnap?.preferred_stores || [],
      household_size:   profileSnap?.household_size,
      weekly_budget:    profileSnap?.weekly_budget,
      store_visited:    storeName,
    },
    stack_dna_snapshot: {
      items_purchased:  tripItems.length,
      categories_bought: categories,
      top_category:     Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Other',
      total_spent_cents: totalSpentCents,
      saved_cents:      savedCents,
    },
    outcome_metric: savedCents,
  });

  // ── Step 3B: Wealth momentum snapshot ───────────────────────────────────
  let wealthSnapshot = null;
  try {
    const snapshot = buildWealthSnapshot({
      totalSpentCents,
      totalSavedCents: savedCents,
      tripItems,
    });

    wealthSnapshot = snapshot;
    await supabase.from('wealth_momentum_snapshots').insert({
      user_id: user.id,
      ...snapshot,
    });
  } catch (snapshotError) {
    console.warn('[WealthEngine] snapshot insert failed:', snapshotError?.message || snapshotError);
  }

  // ── Step 4: Personalized Gemini feed for next week ────────────────────────
  // Fetch top velocity items (what they buy most often)
  const { data: velocityItems } = await supabase
    .from('pantry_velocity')
    .select('product_name, avg_days_between_purchase, purchase_count')
    .eq('user_id', user.id)
    .order('purchase_count', { ascending: false })
    .limit(10);

  // Fetch current live deals to ground Gemini in real data
  const { data: liveDeals } = await supabase
    .from('app_home_feed')
    .select('title, retailer, pay_price, save_price, category, tags')
    .eq('status', 'active')
    .eq('verification_status', 'verified_live')
    .order('save_price', { ascending: false })
    .limit(15);

  let personalizedFeed = null;

  if (session?.access_token && liveDeals?.length > 0) {
    try {
      const dietTags = (profileSnap?.dietary_tags || []).join(', ') || 'no restrictions';
      const stores = (profileSnap?.preferred_stores || [storeName]).join(', ');
      const staples = (velocityItems || []).map(v => v.product_name).join(', ') || 'general groceries';
      const topCat = Object.entries(categories).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Protein';
      const dealSummary = (liveDeals || [])
        .map(d => `"${d.title}" at ${d.retailer} — pay $${d.pay_price}, save $${d.save_price}`)
        .join('\n');

      const prompt = `You are Snippd's personalization engine. A user just completed their weekly shop.

User profile:
- Diet: ${dietTags}
- Preferred stores: ${stores}
- Household size: ${profileSnap?.household_size || 'not set'}
- Regular staples they buy: ${staples}
- This week's top category: ${topCat}
- They saved $${(savedCents / 100).toFixed(2)} this trip

Available live deals for next week:
${dealSummary}

Task: Return ONLY a JSON object like this (no markdown):
{
  "greeting": "one warm personalized sentence referencing their savings win",
  "top_picks": [
    { "title": "deal title from above", "reason": "why this fits them specifically", "priority": 1 }
  ],
  "budget_tip": "one sentence personalized budget advice based on their spending pattern",
  "meal_suggestion": "one meal idea based on their top category and diet"
}

Rules: top_picks must reference real deal titles from the list above. Max 3 picks. Keep it warm, not robotic.`;

      const res = await fetch(PROXY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 400 },
        }),
      });

      const json = await res.json();
      const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const clean = raw.replace(/```json|```/g, '').trim();
      personalizedFeed = JSON.parse(clean);
    } catch (_) {
      // Gemini failure is non-fatal — fallback to standard feed
    }
  }

  // ── Step 5: Cache personalized feed ──────────────────────────────────────
  if (personalizedFeed) {
    // Delete any existing cache for this user first
    await supabase
      .from('home_payload_cache')
      .delete()
      .eq('user_id', user.id)
      .eq('cache_key', 'personalized_feed');

    await supabase.from('home_payload_cache').insert({
      user_id:      user.id,
      cache_key:    'personalized_feed',
      payload:      personalizedFeed,
      source:       'fresh_start',
      generated_at: new Date().toISOString(),
      expires_at:   new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    });
  }

  // ── Step 6: Audit log ─────────────────────────────────────────────────────
  await AuditLogger.log(AuditLogger.events.FRESH_START, {
    table:            'profiles',
    store:            storeName,
    saved_cents:      savedCents,
    spent_cents:      totalSpentCents,
    streak:           closeResult?.streak,
    leveled_up:       closeResult?.leveled_up,
    credits_awarded:  closeResult?.credits_awarded,
  });

  // ── Return celebration summary ────────────────────────────────────────────
  return {
    savingsThisWeek:  closeResult?.savings_this_week || savedCents,
    lifetimeSavings:  closeResult?.lifetime_savings || 0,
    streak:           closeResult?.streak || 1,
    streakBroken:     closeResult?.streak_broken || false,
    creditsAwarded:   closeResult?.credits_awarded || 10,
    leveledUp:        closeResult?.leveled_up || false,
    levelBefore:      closeResult?.level_before || 1,
    levelAfter:       closeResult?.level_after || 1,
    personalizedFeed,
    wealthSnapshot,
    storeName,
  };
}
