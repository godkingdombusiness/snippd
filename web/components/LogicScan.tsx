'use client'
// components/LogicScan.tsx
// 5-second "Arbitrage Calculation" animation using Framer Motion.
// Rotates through 4 processing messages, then calls the reveal callback.

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface Props {
  mission:      string | null
  leakCategory: string | null
  onReveal:     (revealData: RevealData) => void
}

export interface RevealData {
  initial_savings_cents: number
  leak_savings_cents:    number
  items_at_floor_price:  number
  mission_label:         string
  leak_label:            string
}

const SCAN_DURATION = 5000
const TICK = SCAN_DURATION / 4  // message rotates every 1.25s

const MISSION_LABELS: Record<string, string> = {
  rent_killer: 'Rent-Killer', save_goal: 'Goal Saver', find_deals: 'Deal Hunter',
}
const LEAK_LABELS: Record<string, string> = {
  amazon: 'Amazon', food_apps: 'Food Apps', clothing: 'Clothing',
}

function buildMessages(mission: string | null, leak: string | null) {
  const mLabel = MISSION_LABELS[mission ?? ''] ?? 'Agent'
  const lLabel = LEAK_LABELS[leak ?? ''] ?? 'spending'
  return [
    { icon: '🔍', title: 'Scanning Prices', body: `Checking current prices across 5,000+ stores to find the floor price for your style.` },
    { icon: '📊', title: 'Categorizing',    body: `Organizing your ${mLabel} fund based on your monthly budget goals.` },
    { icon: '✂️', title: 'Coupon Check',    body: `Looking for active promo codes and stacking opportunities for your ${lLabel} category.` },
    { icon: '🔔', title: 'Alert Setup',     body: `Setting up price-drop triggers so you never pay full price for your vibe again.` },
  ]
}

export default function LogicScan({ mission, leakCategory, onReveal }: Props) {
  const [msgIdx, setMsgIdx] = useState(0)
  const messages = buildMessages(mission, leakCategory)

  // Message rotation
  useEffect(() => {
    const timers = [1, 2, 3].map(i =>
      setTimeout(() => setMsgIdx(i), i * TICK)
    )
    return () => timers.forEach(clearTimeout)
  }, [])

  // Fire reveal after full scan
  useEffect(() => {
    const t = setTimeout(() => {
      const mRate = { rent_killer: 0.18, save_goal: 0.15, find_deals: 0.22 }[mission ?? ''] ?? 0.18
      onReveal({
        initial_savings_cents: Math.round(60000 * mRate),  // uses default $600 if no budget
        leak_savings_cents:    { amazon: 4500, food_apps: 3800, clothing: 6200 }[leakCategory ?? ''] ?? 4500,
        items_at_floor_price:  8,
        mission_label:         MISSION_LABELS[mission ?? ''] ?? 'Agent',
        leak_label:            LEAK_LABELS[leakCategory ?? ''] ?? 'spending',
      })
    }, SCAN_DURATION)
    return () => clearTimeout(t)
  }, [mission, leakCategory, onReveal])

  const msg = messages[msgIdx]

  return (
    <div className="w-full max-w-sm mx-auto flex flex-col items-center gap-8">

      {/* Pulsing orb */}
      <div className="relative flex items-center justify-center">
        <motion.div
          animate={{ scale: [1, 1.15, 1], opacity: [0.3, 0.15, 0.3] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute w-28 h-28 rounded-full bg-green/20"
        />
        <motion.div
          animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.25, 0.5] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: 0.4 }}
          className="absolute w-20 h-20 rounded-full bg-green/30"
        />
        <div className="relative w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg">
          <span className="text-3xl">🤖</span>
        </div>
      </div>

      {/* Heading */}
      <div className="text-center">
        <h2 className="text-2xl font-black text-navy tracking-tight">
          Connecting to the retail engine…
        </h2>
        <p className="mt-2 text-sm text-muted">Please wait while I calibrate your agent.</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-mint-dim rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: '100%' }}
          transition={{ duration: SCAN_DURATION / 1000, ease: 'linear' }}
          className="h-full bg-green rounded-full"
        />
      </div>

      {/* Rotating message card */}
      <div className="w-full min-h-[90px] relative">
        <AnimatePresence mode="wait">
          <motion.div
            key={msgIdx}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{   opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 flex items-start gap-4 bg-white rounded-2xl p-5 shadow-sm"
          >
            <span className="text-2xl mt-0.5 flex-shrink-0">{msg.icon}</span>
            <div>
              <p className="font-bold text-navy text-sm">{msg.title}</p>
              <p className="text-xs text-muted mt-1 leading-relaxed">{msg.body}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Step dots */}
      <div className="flex gap-2">
        {messages.map((_, i) => (
          <motion.div
            key={i}
            animate={{ width: i === msgIdx ? 20 : 8, backgroundColor: i <= msgIdx ? '#0C9E54' : '#D4EDCE' }}
            transition={{ duration: 0.3 }}
            className="h-2 rounded-full"
          />
        ))}
      </div>
    </div>
  )
}
