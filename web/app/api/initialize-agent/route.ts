// app/api/initialize-agent/route.ts
// Saves onboarding data to agent_initialization, calls emailFunnel.
// Called by the onboard page after email capture, before the Logic Scan.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendToEmailFunnel } from '@/lib/emailFunnel'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, mission, monthly_budget_cents, power_level, leak_category,
            style_vibe, clothing_size, shoe_size, shop_frequency } = body

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

    const db = supabaseAdmin()

    const { data, error } = await db
      .from('agent_initialization')
      .upsert({
        email,
        mission,
        budget_cents:  monthly_budget_cents,
        power_level,
        leak_category,
        style_vibe,
        clothing_size,
        shoe_size,
        shop_frequency,
        status: 'waitlist',
        crm_tags: [
          { rent_killer: 'Rent-Killer-Segment', save_goal: 'Goal-Saver-Segment', find_deals: 'Deal-Hunter-Segment' }[mission as string] ?? 'Unknown',
        ],
        economic_dna: body,
      }, { onConflict: 'email' })
      .select()
      .single()

    if (error) throw error

    // Tag in CRM (non-blocking)
    sendToEmailFunnel({ email, mission, budget_cents: monthly_budget_cents,
                        power_level, leak_category, style_vibe, status: 'waitlist' })
      .catch(err => console.warn('[initAgent] emailFunnel error:', err))

    return NextResponse.json({ ok: true, id: data.id })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[initialize-agent]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
