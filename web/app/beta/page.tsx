'use client'
// app/beta/page.tsx
// Beta Dashboard — shown to users who complete paid checkout (beta or lifetime).

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect } from 'react'
import { motion } from 'framer-motion'

function BetaContent() {
  const params = useSearchParams()
  const tier   = params.get('tier') ?? 'beta'
  const sessionId = params.get('session_id') ?? ''
  const isLifetime = tier === 'lifetime'
  const appDeepLink = `snippd://payment/success?tier=${encodeURIComponent(tier)}&session_id=${encodeURIComponent(sessionId)}`

  useEffect(() => {
    const timer = window.setTimeout(() => {
      window.location.href = appDeepLink
    }, 700)
    return () => window.clearTimeout(timer)
  }, [appDeepLink])

  const features = [
    { icon: '🔍', label: 'Price Floor Scanner',    sub: 'Live across 5,000+ stores' },
    { icon: '✂️', label: 'Coupon Stacker',          sub: 'Auto-applies best stack' },
    { icon: '🔔', label: 'Drop Alerts',             sub: 'Instant price-drop push' },
    { icon: '📊', label: 'Savings Dashboard',       sub: 'Full spend intelligence' },
    { icon: '🤖', label: 'Autonomous Agent',        sub: isLifetime ? 'Full auto — live' : 'Ask-first mode — live' },
    { icon: '👑', label: isLifetime ? 'Founder Badge' : 'Beta Access', sub: isLifetime ? 'Permanent status' : 'Priority support' },
  ]

  return (
    <div className="min-h-screen bg-mint-bg flex flex-col items-center justify-start py-12 px-6">
      <div className="w-full max-w-sm flex flex-col gap-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="text-center">
          <div className="w-16 h-16 rounded-full bg-green flex items-center justify-center mx-auto mb-4 shadow-lg shadow-green/30">
            <span className="text-3xl">{isLifetime ? '👑' : '⚡'}</span>
          </div>
          <h1 className="text-4xl font-black text-navy tracking-tight">Welcome in.</h1>
          <p className="text-sm text-muted mt-2">
            {isLifetime ? 'You\'re a Lifetime Founder. The agent is yours.' : 'Your Beta Pro agent is calibrated and live.'}
          </p>
        </motion.div>

        {/* Feature grid */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.4 }}
          className="grid grid-cols-2 gap-3"
        >
          {features.map(f => (
            <div key={f.label} className="bg-white rounded-2xl p-4 border border-mint-dim">
              <span className="text-2xl">{f.icon}</span>
              <p className="font-bold text-navy text-xs mt-2">{f.label}</p>
              <p className="text-[10px] text-muted mt-0.5">{f.sub}</p>
            </div>
          ))}
        </motion.div>

        {/* Coming soon banner */}
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
          className="bg-navy rounded-2xl p-5 text-center"
        >
          <p className="text-xs text-mint/60 font-bold tracking-widest uppercase mb-1">Mobile App</p>
          <p className="text-sm text-mint/80">Opening Snippd now. If it does not switch automatically, tap the button below.</p>
        </motion.div>

        {/* CTA */}
        <a
          href={appDeepLink}
          className="w-full bg-green text-white font-extrabold rounded-2xl py-4 text-center text-sm tracking-wide hover:bg-green/90 transition-colors"
        >
          Open Snippd App  â†’
        </a>
        <a
          href="https://getsnippd.com"
          className="w-full bg-navy text-mint font-extrabold rounded-2xl py-4 text-center text-sm tracking-wide hover:bg-navy-deep transition-colors"
        >
          Explore Snippd  →
        </a>
      </div>
    </div>
  )
}

export default function BetaPage() {
  return <Suspense><BetaContent /></Suspense>
}
