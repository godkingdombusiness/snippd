'use client'
// components/OfferWall.tsx
// The Closer — 3-tier conversion gate shown after the Logic Scan reveal.
// Tier A: Free Waitlist | Tier B: Beta Pro $4.99/mo | Tier C: Lifetime $99

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { RevealData } from './LogicScan'

interface Props {
  revealData:  RevealData
  email:       string
  agentId:     string | null
  onWaitlist:  () => void   // user chose free tier
}

const fmt = (cents: number) => `$${(cents / 100).toFixed(0)}`
const LIFETIME_SPOTS_REMAINING = 183  // static urgency — update periodically

export default function OfferWall({ revealData, email, agentId, onWaitlist }: Props) {
  const [loading, setLoading] = useState<'beta' | 'lifetime' | null>(null)
  const [error, setError]     = useState<string | null>(null)

  const startCheckout = async (tier: 'beta' | 'lifetime') => {
    setLoading(tier)
    setError(null)
    try {
      const res = await fetch('/api/stripe/checkout', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ tier, email, agentId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      window.location.href = data.url
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(null)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45 }}
      className="w-full max-w-sm mx-auto flex flex-col gap-5"
    >
      {/* Reveal summary */}
      <div className="bg-navy rounded-2xl p-5 text-center">
        <p className="text-xs font-bold text-mint/70 tracking-widest uppercase mb-1">Agent Report</p>
        <p className="text-4xl font-black text-mint tracking-tight">{fmt(revealData.initial_savings_cents)}</p>
        <p className="text-xs text-mint/60 mt-1">projected savings per month</p>
        <div className="flex items-center justify-center gap-4 mt-3 pt-3 border-t border-white/10">
          <div className="text-center">
            <p className="text-lg font-black text-mint">{revealData.items_at_floor_price}</p>
            <p className="text-[10px] text-mint/50 mt-0.5">at floor price</p>
          </div>
          <div className="w-px h-8 bg-white/10" />
          <div className="text-center">
            <p className="text-lg font-black text-mint">{fmt(revealData.leak_savings_cents)}</p>
            <p className="text-[10px] text-mint/50 mt-0.5">in {revealData.leak_label}</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-center text-muted font-semibold tracking-wide uppercase">
        Choose your access level
      </p>

      {/* ── Tier C: Lifetime (featured) ── */}
      <div className="relative bg-navy rounded-3xl p-5 border-2 border-mint/40 overflow-hidden">
        <div className="absolute top-3 right-3 bg-coral text-white text-[10px] font-black px-2.5 py-1 rounded-full tracking-wide uppercase">
          {LIFETIME_SPOTS_REMAINING} spots left
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">👑</span>
          <div>
            <p className="text-xs text-mint/60 font-bold tracking-widest uppercase">Lifetime Founder</p>
            <p className="text-2xl font-black text-white">$99 <span className="text-sm font-semibold text-white/50">once</span></p>
          </div>
        </div>
        <ul className="space-y-1.5 mb-4">
          {['Instant beta access', 'Lifetime updates — never pay again', 'Founder badge + priority support', 'First access to every new feature'].map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-mint/80">
              <span className="text-green text-xs">✓</span>{f}
            </li>
          ))}
        </ul>
        <button
          onClick={() => startCheckout('lifetime')}
          disabled={!!loading}
          className="w-full bg-mint text-navy font-black rounded-xl py-4 text-sm tracking-wide hover:bg-mint/90 transition-colors disabled:opacity-60"
        >
          {loading === 'lifetime' ? 'Redirecting…' : 'Claim Lifetime  →'}
        </button>
      </div>

      {/* ── Tier B: Beta Pro ── */}
      <div className="bg-white rounded-3xl p-5 border border-mint-dim">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xl">⚡</span>
          <div>
            <p className="text-xs text-muted font-bold tracking-widest uppercase">Beta Pro</p>
            <p className="text-2xl font-black text-navy">$4.99 <span className="text-sm font-semibold text-muted">/mo</span></p>
          </div>
        </div>
        <ul className="space-y-1.5 mb-4">
          {['Instant beta access', 'Priority deal alerts', 'Full agent autonomy', 'Cancel anytime'].map(f => (
            <li key={f} className="flex items-center gap-2 text-sm text-navy/70">
              <span className="text-green text-xs">✓</span>{f}
            </li>
          ))}
        </ul>
        <button
          onClick={() => startCheckout('beta')}
          disabled={!!loading}
          className="w-full bg-navy text-mint font-black rounded-xl py-4 text-sm tracking-wide hover:bg-navy-deep transition-colors disabled:opacity-60"
        >
          {loading === 'beta' ? 'Redirecting…' : 'Start Beta — $4.99/mo  →'}
        </button>
      </div>

      {/* ── Tier A: Free Waitlist ── */}
      <button
        onClick={onWaitlist}
        className="w-full bg-mint-bg border border-mint-dim text-navy/70 font-semibold rounded-2xl py-4 text-sm hover:bg-mint-dim/50 transition-colors"
      >
        Join Free Waitlist — Standard access
      </button>

      {error && <p className="text-xs text-coral text-center">{error}</p>}
      <p className="text-[10px] text-center text-muted">
        Stripe-secured payment · Cancel anytime · 30-day refund guarantee
      </p>
    </motion.div>
  )
}
