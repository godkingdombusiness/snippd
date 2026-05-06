import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
})

export const PRICES = {
  beta:     process.env.STRIPE_BETA_PRICE_ID!,      // $4.99/mo recurring
  lifetime: process.env.STRIPE_LIFETIME_PRICE_ID!,  // $99 one-time
}
