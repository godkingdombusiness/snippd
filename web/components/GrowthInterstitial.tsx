'use client'
// components/GrowthInterstitial.tsx
// "Boost Your Agent" social follow card — shown after Q3 and Q5.
// Tracks follow intent but doesn't block progression (users can skip).

import { motion } from 'framer-motion'

interface Props {
  variant: 'a' | 'b'          // 'a' after Q3, 'b' after Q5
  onContinue: () => void
}

const VARIANTS = {
  a: {
    headline: 'Unlock exclusive Market Intel.',
    body:     'Agents trained on live market data perform 3× better. Follow us for real-time retail intel that trains your model.',
    cta:      'Boost My Agent',
    platforms: [
      { label: 'Follow on LinkedIn', href: 'https://linkedin.com/company/getsnippd', icon: '💼', bg: 'bg-[#0A66C2]' },
      { label: 'Follow on TikTok',   href: 'https://tiktok.com/@snippd',            icon: '🎵', bg: 'bg-[#010101]' },
    ],
  },
  b: {
    headline: 'Your agent is learning fast.',
    body:     'Join the community where 12,000+ shoppers share price-floor data. The more intel we gather, the more you save.',
    cta:      'Join the Network',
    platforms: [
      { label: 'Join on TikTok',   href: 'https://tiktok.com/@snippd',            icon: '🎵', bg: 'bg-[#010101]' },
      { label: 'Follow on X',      href: 'https://twitter.com/getsnippd',         icon: '𝕏',  bg: 'bg-[#14171A]' },
    ],
  },
}

export default function GrowthInterstitial({ variant, onContinue }: Props) {
  const v = VARIANTS[variant]

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-sm mx-auto flex flex-col gap-6"
    >
      {/* Badge */}
      <div className="flex items-center gap-2 self-start">
        <div className="w-2 h-2 rounded-full bg-green animate-pulse-slow" />
        <span className="text-xs font-bold text-green tracking-widest uppercase">Agent Boost</span>
      </div>

      {/* Headline */}
      <div>
        <h2 className="text-3xl font-black text-navy leading-tight tracking-tight">{v.headline}</h2>
        <p className="mt-2 text-sm text-muted leading-relaxed">{v.body}</p>
      </div>

      {/* Social buttons */}
      <div className="flex flex-col gap-3">
        {v.platforms.map(p => (
          <a
            key={p.label}
            href={p.href}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-3 ${p.bg} text-white rounded-2xl px-5 py-4 font-bold text-sm transition-opacity hover:opacity-90`}
          >
            <span className="text-xl">{p.icon}</span>
            {p.label}
            <span className="ml-auto text-xs opacity-60">↗</span>
          </a>
        ))}
      </div>

      {/* Skip */}
      <button
        onClick={onContinue}
        className="w-full bg-navy text-mint rounded-2xl py-[18px] font-extrabold text-base tracking-wide hover:bg-navy-deep transition-colors"
      >
        {v.cta}  →
      </button>
      <button onClick={onContinue} className="text-xs text-muted underline text-center">
        Skip for now
      </button>
    </motion.div>
  )
}
