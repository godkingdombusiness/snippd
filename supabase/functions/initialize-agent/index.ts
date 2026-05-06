// supabase/functions/initialize-agent/index.ts
// Saves the 7-step Concierge onboarding answers to user_persona,
// calculates a mock Initial Savings projection, and returns the
// Economic DNA snapshot to the client.
//
// Auth: Bearer JWT (authenticated user)
// Called by: LogicScanScreen.js during the 5-second processing animation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// ── CORS ─────────────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } })

// ── Savings calculation engine ────────────────────────────────
// Mock projections — will be replaced with real Vertex AI scoring in a future sprint.

const MISSION_RATE: Record<string, number> = {
  rent_killer: 0.18,
  save_goal:   0.15,
  find_deals:  0.22,
}

const POWER_MULTIPLIER: Record<string, number> = {
  notify_only: 0.70,
  ask_first:   1.00,
  full_auto:   1.35,
}

const LEAK_SAVINGS_CENTS: Record<string, number> = {
  amazon:    4500,  // $45
  food_apps: 3800,  // $38
  clothing:  6200,  // $62
}

const FLOOR_ITEMS: Record<string, number> = {
  casual_minimal:  6,
  trend_forward:  11,
  investment:      4,
}

interface PersonaInput {
  mission:               string
  monthly_budget_cents:  number
  power_level:           string
  leak_category:         string
  style_vibe:            string
  clothing_size:         string
  shoe_size:             string
  shop_frequency:        string
}

function calculateSavings(p: PersonaInput) {
  const rate       = MISSION_RATE[p.mission]       ?? 0.15
  const multiplier = POWER_MULTIPLIER[p.power_level] ?? 1.0
  const initial_savings_cents = Math.round(p.monthly_budget_cents * rate * multiplier)
  const leak_savings_cents    = LEAK_SAVINGS_CENTS[p.leak_category] ?? 4500
  const items_at_floor_price  = FLOOR_ITEMS[p.style_vibe] ?? 8
  return { initial_savings_cents, leak_savings_cents, items_at_floor_price }
}

// ── Handler ───────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST')   return json({ error: 'Method not allowed' }, 405)

  // Verify caller is authenticated
  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return json({ error: 'Unauthorized' }, 401)

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Resolve user from JWT
  const jwt = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt)
  if (authErr || !user) return json({ error: 'Invalid token' }, 401)

  // Parse body
  let body: PersonaInput
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  const required: (keyof PersonaInput)[] = [
    'mission', 'monthly_budget_cents', 'power_level',
    'leak_category', 'style_vibe', 'shop_frequency',
  ]
  for (const field of required) {
    if (body[field] == null) return json({ error: `Missing field: ${field}` }, 400)
  }

  // Calculate projections
  const { initial_savings_cents, leak_savings_cents, items_at_floor_price } = calculateSavings(body)

  // Build economic_dna snapshot
  const economic_dna = {
    ...body,
    initial_savings_cents,
    leak_savings_cents,
    items_at_floor_price,
    schema_version: 1,
    computed_at: new Date().toISOString(),
  }

  // Upsert into user_persona
  const { data: persona, error: upsertErr } = await supabase
    .from('user_persona')
    .upsert({
      user_id:               user.id,
      mission:               body.mission,
      monthly_budget_cents:  body.monthly_budget_cents,
      power_level:           body.power_level,
      leak_category:         body.leak_category,
      style_vibe:            body.style_vibe,
      clothing_size:         body.clothing_size ?? null,
      shoe_size:             body.shoe_size ?? null,
      shop_frequency:        body.shop_frequency,
      onboarding_completed_at: new Date().toISOString(),
      initial_savings_cents,
      leak_savings_cents,
      items_at_floor_price,
      economic_dna,
    }, { onConflict: 'user_id' })
    .select()
    .single()

  if (upsertErr) {
    console.error('[initialize-agent] Upsert failed:', upsertErr.message)
    return json({ error: 'Failed to save persona' }, 500)
  }

  // Return success + reveal data for the Magic Reveal screen
  return json({
    ok: true,
    persona,
    reveal: {
      initial_savings_cents,
      leak_savings_cents,
      items_at_floor_price,
      mission_label: {
        rent_killer: 'Rent-Killer',
        save_goal:   'Goal Saver',
        find_deals:  'Deal Hunter',
      }[body.mission] ?? 'Agent',
      leak_label: {
        amazon:    'Amazon',
        food_apps: 'Food Apps',
        clothing:  'Clothing',
      }[body.leak_category] ?? 'spending',
    },
  })
})
