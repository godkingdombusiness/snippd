import { supabase } from './supabase';

const GEMINI_PROXY = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/gemini-proxy`;

// ─── Tables that must exist and be RLS-accessible ────────────────────────────
const REQUIRED_TABLES = [
  'profiles',
  'carts',
  'cart_items',
  'curated_stacks',
  'offer_sources',
  'trip_results',
  'shopping_list_items',
  'food_waste_log',
  'households',
  'creator_content',
];

// ─── ConnectionAgent ──────────────────────────────────────────────────────────
export const ConnectionAgent = {

  // Full diagnostic — returns a structured report
  runFullAudit: async () => {
    const t0 = Date.now();
    const errors = [];
    const tableStatus = {};

    // 1. Auth check
    let authOk = false;
    let userEmail = null;
    try {
      const { data: { user }, error } = await supabase.auth.getUser();
      authOk = !!user && !error;
      userEmail = user?.email || null;
    } catch (e) {
      errors.push(`Auth: ${e.message}`);
    }

    // 2. Database reachability — ping each required table
    let dbOk = true;
    for (const table of REQUIRED_TABLES) {
      try {
        const { error } = await supabase.from(table).select('count', { count: 'exact', head: true });
        tableStatus[table] = !error;
        if (error) {
          dbOk = false;
          errors.push(`${table}: ${error.message}`);
        }
      } catch (e) {
        tableStatus[table] = false;
        dbOk = false;
        errors.push(`${table}: ${e.message}`);
      }
    }

    // 3. Gemini API check
    let geminiOk = false;
    let geminiModel = 'gemini-2.0-flash-lite (proxy)';
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(GEMINI_PROXY, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Reply with just OK' }] }],
          generationConfig: { maxOutputTokens: 5 },
        }),
      });
      const json = await res.json();
      geminiOk = !!json?.candidates?.[0]?.content;
      if (!geminiOk && json?.error) errors.push(`Gemini: ${json.error.message}`);
    } catch (e) {
      errors.push(`Gemini: ${e.message}`);
    }

    // 4. OCR endpoint check (browser CORS will block — treat as warn not error)
    let ocrStatus = 'untested';
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(
        'https://ais-dev-aodcl4gyy3vr7rpoefybkr-82246655629.us-east1.run.app/api/parse-receipt',
        { method: 'GET', signal: controller.signal }
      );
      clearTimeout(timeout);
      ocrStatus = res.ok || res.status === 405 ? 'online' : `error_${res.status}`;
    } catch (e) {
      ocrStatus = e.name === 'AbortError' ? 'timeout' : 'cors_blocked';
    }

    const latency = Date.now() - t0;
    const success = authOk && dbOk && geminiOk;

    return {
      success,
      timestamp: new Date().toISOString(),
      results: {
        auth: authOk,
        userEmail,
        database: dbOk,
        tableStatus,
        gemini: geminiOk,
        geminiModel,
        ocr: ocrStatus,
        latency,
        errors,
      },
    };
  },
};
