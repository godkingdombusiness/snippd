import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  if (req.method !== 'GET') {
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

    // 1. Get last 8 wealth_momentum_snapshots
    const { data: snapshots, error: snapshotsError } = await supabase
      .from('wealth_momentum_snapshots')
      .select('*')
      .eq('user_id', user.id)
      .order('timestamp', { ascending: false })
      .limit(8);

    if (snapshotsError) {
      throw new Error(`Failed to fetch wealth snapshots: ${snapshotsError.message}`);
    }

    // 2. Calculate current velocity_score (from latest snapshot)
    const currentVelocity = snapshots?.[0]?.velocity_score || 0;

    // 3. Calculate lifetime realized_savings sum
    const { data: lifetimeData, error: lifetimeError } = await supabase
      .from('wealth_momentum_snapshots')
      .select('realized_savings')
      .eq('user_id', user.id);

    if (lifetimeError) {
      throw new Error(`Failed to fetch lifetime savings: ${lifetimeError.message}`);
    }

    const lifetimeRealizedSavings = lifetimeData?.reduce(
      (sum, snap) => sum + (snap.realized_savings || 0),
      0
    ) || 0;

    // 4. Get inflation_shield_total (sum of all inflation_offset)
    const inflationShieldTotal = lifetimeData?.reduce(
      (sum, snap) => sum + (snap.inflation_offset || 0),
      0
    ) || 0;

    // 5. Get transparency_report from latest snapshot
    const latestTransparencyReport = snapshots?.[0]?.transparency_report || null;

    // 6. Format time_series array for charting
    const timeSeries = (snapshots || []).reverse().map(snap => ({
      date: snap.timestamp.split('T')[0], // YYYY-MM-DD format
      savings: snap.realized_savings || 0,
      momentum: snap.projected_annual_wealth || 0, // Using projected_annual_wealth as momentum
      inflation_offset: snap.inflation_offset || 0,
    }));

    return json({
      success: true,
      data: {
        snapshots: snapshots || [],
        current_velocity_score: currentVelocity,
        lifetime_realized_savings: lifetimeRealizedSavings,
        inflation_shield_total: inflationShieldTotal,
        transparency_report: latestTransparencyReport,
        time_series: timeSeries,
      },
    });

  } catch (error) {
    console.error('[get-wealth-momentum]', error);
    return json({
      error: error.message || 'Internal server error',
      success: false
    }, 500);
  }
});