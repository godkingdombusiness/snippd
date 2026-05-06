'use client'
// app/onboard/page.tsx
// Full Concierge Onboarding flow — 12 states:
//   Q1 Q2 Q3 → Interstitial A → Q4 Q5 → Interstitial B → Q6 Q7 → Email → Scan → Offer

import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import LogicScan, { type RevealData } from '@/components/LogicScan'
import GrowthInterstitial from '@/components/GrowthInterstitial'
import OfferWall from '@/components/OfferWall'

// ── Types ─────────────────────────────────────────────────────
interface PersonaData {
  mission:              string | null
  monthly_budget_cents: number | null
  power_level:          string | null
  leak_category:        string | null
  style_vibe:           string | null
  clothing_size:        string | null
  shoe_size:            string
  shop_frequency:       string | null
}

// ── Step map  (12 states: 0–11) ───────────────────────────────
// 0  Q1: Mission        3  Interstitial A    7  Q6: Sizes
// 1  Q2: Budget         4  Q4: Leak          8  Q7: Frequency
// 2  Q3: Power          5  Q5: Style Vibe    9  Email
//                       6  Interstitial B   10  Scan
//                                          11  Offer Wall
const QUESTION_INDICES = [0, 1, 2, 4, 5, 7, 8]  // steps that are questions
const TOTAL_QUESTIONS  = 7

function questionProgress(step: number) {
  const qSteps = QUESTION_INDICES.filter(i => i <= step)
  return qSteps.length
}

// ── Option card ───────────────────────────────────────────────
function OptionCard({
  label, sub, emoji, selected, onClick, accent = '#0C9E54',
}: { label: string; sub?: string; emoji?: string; selected: boolean; onClick: () => void; accent?: string }) {
  return (
    <button
      onClick={onClick}
      style={selected ? { borderColor: accent, background: '#EAF9E7' } : {}}
      className={`flex items-center gap-4 w-full text-left bg-white rounded-2xl p-4 border-2 transition-all ${selected ? 'shadow-sm' : 'border-mint-dim hover:border-muted/40'}`}
    >
      {emoji && <span className="text-2xl flex-shrink-0">{emoji}</span>}
      <div className="flex-1 min-w-0">
        <p className={`font-bold text-navy text-sm ${selected ? 'font-extrabold' : ''}`}>{label}</p>
        {sub && <p className="text-xs text-muted mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      {selected && (
        <span className="text-white text-xs font-bold px-2 py-1 rounded-full flex-shrink-0"
          style={{ background: accent }}>✓</span>
      )}
    </button>
  )
}

// ── Budget presets ────────────────────────────────────────────
const BUDGETS = [200, 400, 600, 800, 1000, 1500]

// ── Clothing sizes ────────────────────────────────────────────
const CLOTHING_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL']

// ── Step content components ───────────────────────────────────

function StepMission({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionCard emoji="🏠" label="Pay My Rent"     sub="Crush fixed costs. Every month."           selected={value === 'rent_killer'} onClick={() => onChange('rent_killer')} accent="#FB5B5B" />
      <OptionCard emoji="🎯" label="Save for a Goal"  sub="Stack savings toward something real."      selected={value === 'save_goal'}   onClick={() => onChange('save_goal')}   accent="#172250" />
      <OptionCard emoji="🔍" label="Just Find Deals"  sub="Hunt every discount that exists."          selected={value === 'find_deals'}  onClick={() => onChange('find_deals')}  accent="#0C9E54" />
    </div>
  )
}

function StepBudget({ value, onChange }: { value: number | null; onChange: (v: number) => void }) {
  const [custom, setCustom] = useState('')
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-2">
        {BUDGETS.map(d => (
          <button key={d}
            onClick={() => { onChange(d * 100); setCustom('') }}
            className={`py-3 rounded-xl font-bold text-sm transition-all border-2 ${value === d * 100 ? 'bg-navy text-mint border-navy' : 'bg-white border-mint-dim text-navy hover:border-muted/40'}`}
          >${d.toLocaleString()}</button>
        ))}
      </div>
      <p className="text-center text-xs text-muted">— or enter your own —</p>
      <div className="flex items-center bg-white border-2 border-mint-dim rounded-xl px-4 py-3 gap-2 focus-within:border-green">
        <span className="font-black text-navy text-lg">$</span>
        <input
          type="number" inputMode="numeric" placeholder="0"
          value={custom}
          onChange={e => { setCustom(e.target.value); const n = parseInt(e.target.value); if (!isNaN(n) && n > 0) onChange(n * 100) }}
          className="flex-1 font-bold text-navy text-lg outline-none bg-transparent placeholder:text-muted/40"
        />
        <span className="text-xs text-muted font-medium">/mo</span>
      </div>
    </div>
  )
}

function StepPower({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionCard emoji="🔔" label="Notify Only"   sub="I'll surface deals. You decide everything."         selected={value === 'notify_only'} onClick={() => onChange('notify_only')} />
      <OptionCard emoji="💬" label="Ask Me First"  sub="I'll ask before taking any action."                 selected={value === 'ask_first'}   onClick={() => onChange('ask_first')}   />
      <OptionCard emoji="⚡" label="Full Auto"     sub="I hunt and act. Maximum savings, zero friction."   selected={value === 'full_auto'}   onClick={() => onChange('full_auto')}   />
    </div>
  )
}

function StepLeak({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionCard emoji="📦" label="Amazon"    sub="Online impulse buys & subscriptions."   selected={value === 'amazon'}    onClick={() => onChange('amazon')}    />
      <OptionCard emoji="🍔" label="Food Apps" sub="Delivery, dining, and convenience."     selected={value === 'food_apps'} onClick={() => onChange('food_apps')} />
      <OptionCard emoji="👕" label="Clothing"  sub="Fashion, apparel, and accessories."     selected={value === 'clothing'}  onClick={() => onChange('clothing')}  />
    </div>
  )
}

function StepStyleVibe({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  const vibes = [
    { key: 'casual_minimal', emoji: '🤍', label: 'Casual & Minimal',  sub: 'Clean basics. Neutral palette. Timeless over trendy.' },
    { key: 'trend_forward',  emoji: '✨', label: 'Trend-Forward',     sub: 'New drops, seasonal looks, fast fashion done smart.'  },
    { key: 'investment',     emoji: '🎯', label: 'Investment Pieces', sub: 'Quality over quantity. Built to last. Price-per-wear.' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted font-semibold">Tap the one that looks like your taste.</p>
      {vibes.map(v => (
        <OptionCard key={v.key} emoji={v.emoji} label={v.label} sub={v.sub}
          selected={value === v.key} onClick={() => onChange(v.key)} />
      ))}
    </div>
  )
}

function StepSizes({ value, onChange }: { value: PersonaData; onChange: (k: keyof PersonaData, v: string | null) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-xs font-bold text-navy mb-2 tracking-wide">Clothing Size</p>
        <div className="flex gap-2">
          {CLOTHING_SIZES.map(s => (
            <button key={s}
              onClick={() => onChange('clothing_size', s)}
              className={`flex-1 py-3 rounded-xl font-bold text-xs transition-all border-2 ${value.clothing_size === s ? 'bg-navy text-mint border-navy' : 'bg-white border-mint-dim text-navy hover:border-muted/40'}`}
            >{s}</button>
          ))}
        </div>
      </div>
      <div>
        <p className="text-xs font-bold text-navy mb-2 tracking-wide">Shoe Size</p>
        <div className="flex items-center bg-white border-2 border-mint-dim rounded-xl px-4 py-3 gap-2 focus-within:border-green">
          <span className="text-sm">👟</span>
          <input
            type="text" inputMode="decimal" placeholder="e.g. 10 or 10.5"
            value={value.shoe_size}
            onChange={e => onChange('shoe_size', e.target.value)}
            className="flex-1 font-semibold text-navy text-sm outline-none bg-transparent placeholder:text-muted/40"
          />
        </div>
      </div>
      <p className="text-xs text-muted">Skip if not relevant — update anytime from your profile.</p>
    </div>
  )
}

function StepFrequency({ value, onChange }: { value: string | null; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <OptionCard emoji="⚡" label="Daily"           sub="Always browsing, always hunting."          selected={value === 'daily'}      onClick={() => onChange('daily')}      />
      <OptionCard emoji="🗓" label="Weekly"          sub="Regular grocery runs and restock."         selected={value === 'weekly'}     onClick={() => onChange('weekly')}     />
      <OptionCard emoji="🎁" label="Big Events Only" sub="Seasonal hauls and intentional buys."      selected={value === 'big_events'} onClick={() => onChange('big_events')} />
    </div>
  )
}

function StepEmail({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted leading-relaxed">
        Your agent report is ready. Enter your email to receive it and activate your account.
      </p>
      <div className="flex items-center bg-white border-2 border-mint-dim rounded-xl px-4 py-4 gap-3 focus-within:border-green">
        <span className="text-lg">✉️</span>
        <input
          type="email" inputMode="email" autoComplete="email"
          placeholder="your@email.com"
          value={value}
          onChange={e => onChange(e.target.value)}
          className="flex-1 font-semibold text-navy text-base outline-none bg-transparent placeholder:text-muted/40"
        />
      </div>
      <p className="text-xs text-muted">No spam. Unsubscribe anytime. We'll send your personalized savings report.</p>
    </div>
  )
}

// ── Step config ───────────────────────────────────────────────
const STEP_LABELS = [
  'Mission', 'Budget', 'Power', null, 'Leak', 'Vibe', null, 'Sizes', 'Rhythm', 'Email', null, null,
]
const STEP_TITLES = [
  'What\'s your mission?',
  'What\'s your monthly spend?',
  'How much control should I have?',
  null, // interstitial
  'Where does money disappear?',
  'What\'s your shopping vibe?',
  null, // interstitial
  'Your Size DNA.',
  'How often do you shop?',
  'One last thing.',
  null, // scan
  null, // offer
]
const STEP_SUBTITLES = [
  'Tell us what you\'re fighting for.',
  'We\'ll find every dollar of slack.',
  'Set your agent\'s autonomy level.',
  null,
  'Honest answers unlock your biggest wins.',
  'Your taste fingerprint shapes every recommendation.',
  null,
  'Zero irrelevant offers. Ever.',
  'Timing is half the battle.',
  'Your agent report is almost ready.',
  null,
  null,
]

// ── Main page ─────────────────────────────────────────────────
export default function OnboardPage() {
  const [step, setStep]     = useState(0)
  const [email, setEmail]   = useState('')
  const [agentId, setAgentId] = useState<string | null>(null)
  const [revealData, setRevealData] = useState<RevealData | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [persona, setPersona] = useState<PersonaData>({
    mission:              null,
    monthly_budget_cents: null,
    power_level:          null,
    leak_category:        null,
    style_vibe:           null,
    clothing_size:        null,
    shoe_size:            '',
    shop_frequency:       null,
  })

  const set = <K extends keyof PersonaData>(k: K, v: PersonaData[K]) =>
    setPersona(p => ({ ...p, [k]: v }))

  // Which steps count as questions for the progress bar
  const qProgress = questionProgress(step)

  const canAdvance = (() => {
    if (step === 0)  return !!persona.mission
    if (step === 1)  return !!persona.monthly_budget_cents
    if (step === 2)  return !!persona.power_level
    if (step === 3)  return true  // interstitial A
    if (step === 4)  return !!persona.leak_category
    if (step === 5)  return !!persona.style_vibe
    if (step === 6)  return true  // interstitial B
    if (step === 7)  return true  // sizes optional
    if (step === 8)  return !!persona.shop_frequency
    if (step === 9)  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    return false
  })()

  const advance = async () => {
    if (!canAdvance) return

    // Email step → call API before going to scan
    if (step === 9) {
      setSubmitting(true)
      try {
        const res = await fetch('/api/initialize-agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, ...persona }),
        })
        const data = await res.json()
        if (data.id) setAgentId(data.id)
      } catch { /* non-fatal — scan proceeds regardless */ }
      setSubmitting(false)
    }

    setStep(s => s + 1)
  }

  const back = () => {
    if (step === 0) return
    setStep(s => s - 1)
  }

  const handleReveal = useCallback((data: RevealData) => {
    setRevealData(data)
    setStep(11)
  }, [])

  const handleWaitlist = () => {
    window.location.href = `/waitlist?email=${encodeURIComponent(email)}`
  }

  // ── Interstitials / special phases ───────────────────────
  if (step === 3) {
    return <Shell step={step} total={12} qProgress={qProgress} onBack={back}>
      <GrowthInterstitial variant="a" onContinue={() => setStep(4)} />
    </Shell>
  }
  if (step === 6) {
    return <Shell step={step} total={12} qProgress={qProgress} onBack={back}>
      <GrowthInterstitial variant="b" onContinue={() => setStep(7)} />
    </Shell>
  }
  if (step === 10) {
    return (
      <div className="min-h-screen bg-mint-bg flex flex-col items-center justify-center p-6">
        <LogicScan mission={persona.mission} leakCategory={persona.leak_category} onReveal={handleReveal} />
      </div>
    )
  }
  if (step === 11 && revealData) {
    return (
      <div className="min-h-screen bg-mint-bg flex flex-col items-center justify-start py-10 px-6 overflow-y-auto">
        <div className="w-full max-w-sm mb-6">
          <p className="text-xs font-bold text-green tracking-widest uppercase">Your Agent Is Ready</p>
          <h1 className="text-3xl font-black text-navy mt-1 tracking-tight">Choose your access.</h1>
        </div>
        <OfferWall
          revealData={revealData}
          email={email}
          agentId={agentId}
          onWaitlist={handleWaitlist}
        />
      </div>
    )
  }

  // ── Question step title ───────────────────────────────────
  const title    = STEP_TITLES[step]
  const subtitle = STEP_SUBTITLES[step]

  const stepContent: Record<number, React.ReactNode> = {
    0: <StepMission    value={persona.mission}              onChange={v => set('mission', v)} />,
    1: <StepBudget     value={persona.monthly_budget_cents}  onChange={v => set('monthly_budget_cents', v)} />,
    2: <StepPower      value={persona.power_level}           onChange={v => set('power_level', v)} />,
    4: <StepLeak       value={persona.leak_category}         onChange={v => set('leak_category', v)} />,
    5: <StepStyleVibe  value={persona.style_vibe}            onChange={v => set('style_vibe', v)} />,
    7: <StepSizes      value={persona} onChange={(k, v) => set(k, v as never)} />,
    8: <StepFrequency  value={persona.shop_frequency}        onChange={v => set('shop_frequency', v)} />,
    9: <StepEmail      value={email}                         onChange={setEmail} />,
  }

  return (
    <Shell step={step} total={12} qProgress={qProgress} onBack={back}>
      {/* Title */}
      {title && (
        <div className="mb-5">
          <h2 className="text-3xl font-black text-navy tracking-tight leading-tight">{title}</h2>
          {subtitle && <p className="text-sm text-muted mt-1.5 leading-relaxed">{subtitle}</p>}
        </div>
      )}

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{   opacity: 0, x: -16 }}
          transition={{ duration: 0.22 }}
        >
          {stepContent[step]}
        </motion.div>
      </AnimatePresence>

      {/* CTA */}
      <div className="mt-6 flex flex-col gap-3">
        <button
          onClick={advance}
          disabled={!canAdvance || submitting}
          className="w-full bg-navy text-mint font-extrabold rounded-2xl py-[18px] text-base tracking-wide disabled:opacity-40 hover:bg-navy-deep transition-colors"
        >
          {submitting ? 'One moment…' : step === 9 ? 'Build My Agent  →' : 'Next  →'}
        </button>
        {step === 7 && (
          <button onClick={advance} className="text-xs text-center text-muted underline">
            Skip sizes for now
          </button>
        )}
      </div>
    </Shell>
  )
}

// ── Layout shell ──────────────────────────────────────────────
function Shell({ step, total, qProgress, onBack, children }: {
  step: number; total: number; qProgress: number; onBack: () => void; children: React.ReactNode
}) {
  const barPct = Math.min(100, (qProgress / TOTAL_QUESTIONS) * 100)

  return (
    <div className="min-h-screen bg-mint-bg flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-3">
        <button onClick={onBack} className="w-9 h-9 bg-white rounded-full flex items-center justify-center shadow-sm hover:bg-mint-dim transition-colors">
          <span className="text-navy text-sm font-bold">←</span>
        </button>
        <span className="text-xs font-bold text-muted tracking-widest">
          {qProgress > 0 && qProgress <= TOTAL_QUESTIONS ? `${qProgress} of ${TOTAL_QUESTIONS}` : ''}
        </span>
        <div className="w-9" />
      </div>

      {/* Progress */}
      <div className="mx-5 h-1 bg-mint-dim rounded-full overflow-hidden">
        <motion.div
          animate={{ width: `${barPct}%` }}
          transition={{ duration: 0.35 }}
          className="h-full bg-green rounded-full"
        />
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-6 pb-10 scrollbar-hide">
        {children}
      </div>
    </div>
  )
}
