'use client'
// app/waitlist/page.tsx
// Waitlist position page — shown to free-tier users.
// Includes an upgrade nudge and social sharing.

import { useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import { motion } from 'framer-motion'

// Mock position (in production: query Supabase for the actual count)
const WAITLIST_POSITION = 2847
const TOTAL_ON_WAITLIST = 11_392

function WaitlistContent() {
  const params = useSearchParams()
  const email  = params.get('email') ?? ''
  const [copied, setCopied] = useState(false)

  const shareUrl = `https://getsnippd.com/onboard?ref=${btoa(email).slice(0, 8)}`

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-screen bg-mint-bg flex flex-col items-center justify-start py-12 px-6">
      <div className="w-full max-w-sm flex flex-col gap-5">

        {/* Position card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}
          className="bg-navy rounded-3xl p-6 text-center"
        >
          <p className="text-xs text-mint/60 font-bold tracking-widest uppercase mb-2">Your Position</p>
          <p className="text-7xl font-black text-mint tracking-tight">#{WAITLIST_POSITION.toLocaleString()}</p>
          <p className="text-xs text-mint/50 mt-2">{TOTAL_ON_WAITLIST.toLocaleString()} people on the waitlist</p>
          {email && <p className="text-xs text-mint/40 mt-3 truncate">{email}</p>}
        </motion.div>

        {/* Move up tip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white rounded-2xl p-5 border border-mint-dim"
        >
          <p className="font-bold text-navy text-sm mb-1">Move up faster.</p>
          <p className="text-xs text-muted leading-relaxed">
            Share your referral link. Each friend who joins moves you up by 10 spots.
          </p>
          <div className="flex items-center gap-2 mt-4">
            <input
              readOnly value={shareUrl}
              className="flex-1 text-xs bg-mint-bg rounded-xl px-3 py-2.5 text-navy font-medium truncate border border-mint-dim"
            />
            <button
              onClick={copyLink}
              className="bg-navy text-mint text-xs font-bold px-4 py-2.5 rounded-xl hover:bg-navy-deep transition-colors flex-shrink-0"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </motion.div>

        {/* Upgrade nudge */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
          className="bg-white rounded-2xl p-5 border-2 border-coral/30"
        >
          <p className="text-xs font-bold text-coral tracking-widest uppercase mb-1">Skip the line</p>
          <p className="font-bold text-navy text-sm">Upgrade to Beta Pro for instant access.</p>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            $4.99/mo gets you in right now. No waiting. Cancel anytime.
          </p>
          <a
            href={`/onboard?email=${encodeURIComponent(email)}`}
            className="block w-full bg-navy text-mint font-extrabold rounded-xl py-3.5 text-center text-sm mt-4 hover:bg-navy-deep transition-colors"
          >
            Upgrade Anytime  →
          </a>
        </motion.div>

        {/* What's coming */}
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}
          className="text-xs text-center text-muted"
        >
          We'll email you at <span className="font-semibold text-navy">{email || 'your address'}</span> the moment your spot opens.
        </motion.p>
      </div>
    </div>
  )
}

export default function WaitlistPage() {
  return <Suspense><WaitlistContent /></Suspense>
}
