// app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout session for beta ($4.99/mo) or lifetime ($99).
// Passes user data as metadata so the webhook can update agent_initialization.

import { NextRequest, NextResponse } from 'next/server'
import { stripe, PRICES } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  try {
    const { tier, email, agentId } = await req.json()

    if (!['beta', 'lifetime'].includes(tier)) {
      return NextResponse.json({ error: 'Invalid tier' }, { status: 400 })
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
    const isBeta = tier === 'beta'

    const session = await stripe.checkout.sessions.create({
      mode:                isBeta ? 'subscription' : 'payment',
      customer_email:      email,
      line_items: [{
        price:    isBeta ? PRICES.beta : PRICES.lifetime,
        quantity: 1,
      }],
      metadata: {
        tier,
        agent_id:  agentId ?? '',
        email:     email ?? '',
      },
      success_url: `${appUrl}/beta?session_id={CHECKOUT_SESSION_ID}&tier=${tier}`,
      cancel_url:  `${appUrl}/onboard?cancelled=true`,
      allow_promotion_codes: true,
      billing_address_collection: 'auto',
    })

    return NextResponse.json({ url: session.url })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Checkout error'
    console.error('[stripe/checkout]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
