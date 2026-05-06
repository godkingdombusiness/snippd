// app/api/stripe/webhook/route.ts
// Receives Stripe webhook events and updates agent_initialization status.
// Stripe API version: 2025-08-27
// Handles: checkout.session.completed (beta + lifetime)
//          customer.subscription.deleted (beta cancellation → downgrade to waitlist)
// Configure in Stripe Dashboard: https://dashboard.stripe.com/webhooks

import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { sendToEmailFunnel } from '@/lib/emailFunnel'
import type Stripe from 'stripe'

export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err) {
    console.error('[webhook] Signature verification failed:', err)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // ── checkout.session.completed ────────────────────────────
  if (event.type === 'checkout.session.completed') {
    const session   = event.data.object as Stripe.Checkout.Session
    const { tier, email } = session.metadata ?? {}

    // In API 2025-08-27 payment_intent is a string ID (not expanded by default)
    const paymentId = (typeof session.subscription === 'string' ? session.subscription
                    : typeof session.payment_intent === 'string' ? session.payment_intent
                    : '') ?? ''
    const customerId = typeof session.customer === 'string' ? session.customer : null
    const status = tier === 'lifetime' ? 'lifetime' : 'beta'

    if (email) {
      await db
        .from('agent_initialization')
        .update({ status, payment_id: paymentId, stripe_customer_id: customerId })
        .eq('email', email)

      // Also upgrade user_persona.status if the user has a mobile account
      await Promise.resolve(
        db
          .from('user_persona')
          .update({ status: 'paid_beta' })
          .eq('user_id',
            db.from('auth.users').select('id').eq('email', email).single() as unknown as string
          )
          .throwOnError()
      ).catch(() => {/* user may not have mobile account yet */})

      await sendToEmailFunnel({
        email, mission: null, budget_cents: null,
        power_level: null, leak_category: null, style_vibe: null,
        status: status as 'beta' | 'lifetime',
      }).catch(err => console.warn('[webhook] emailFunnel error:', err))

      console.log(`[webhook] Upgraded ${email} → ${status} (payment: ${paymentId})`)
    }
  }

  // ── customer.subscription.deleted (beta cancellation) ────
  if (event.type === 'customer.subscription.deleted') {
    const sub      = event.data.object as Stripe.Subscription
    const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id

    if (customer) {
      await db
        .from('agent_initialization')
        .update({ status: 'waitlist', payment_id: null })
        .eq('stripe_customer_id', customer)

      console.log(`[webhook] Subscription cancelled for customer ${customer} → waitlist`)
    }
  }

  return NextResponse.json({ received: true })
}

// Next.js App Router: read raw body via req.text() above — no bodyParser config needed
