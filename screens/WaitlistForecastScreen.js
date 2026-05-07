// screens/WaitlistForecastScreen.js
// The "Forecast" — Shopping Bestie DNA capture + personalized savings reveal
// Journey: The Table → The Leak → The Mission → The Baseline → The Reveal
// Voice: supportive, sharp, protective. "Your Shopping Bestie."

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, Share, KeyboardAvoidingView, Animated,
  Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── UUID helper (no imports needed) ──────────────────────────────────────────
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ── Design Tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.10)';
const GREEN_MED  = 'rgba(12,158,84,0.18)';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const NAVY       = '#1A237E';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const SLATE_SOFT = '#F8FAFC';
const BORDER     = '#E2E8F0';
const SHADOW_CLR = 'rgba(0,0,0,0.06)';

// ── Household members ─────────────────────────────────────────────────────────
const MEMBERS = [
  { key: 'infant',     label: 'Infant',     sub: '0–2 yrs',    featherIcon: 'sun',       multiplier: 0.08, bonus: 'Formula Shield'  },
  { key: 'toddler',    label: 'Toddler',    sub: '3–5 yrs',    featherIcon: 'smile',     multiplier: 0.04, bonus: null              },
  { key: 'school_age', label: 'School Age', sub: '6–12 yrs',   featherIcon: 'book-open', multiplier: 0.04, bonus: null              },
  { key: 'teenager',   label: 'Teenager',   sub: '13–17 yrs',  featherIcon: 'zap',       multiplier: 0.07, bonus: 'Caloric Surge'   },
  { key: 'adult',      label: 'Adult',      sub: '18–64 yrs',  featherIcon: 'user',      multiplier: 0.02, bonus: null              },
  { key: 'senior',     label: 'Senior',     sub: '65+ yrs',    featherIcon: 'activity',  multiplier: 0.06, bonus: 'Rx Optimizer'    },
  { key: 'pet',        label: 'Pet',        sub: 'Fur family', featherIcon: 'heart',     multiplier: 0.03, bonus: 'Pet Cost Cutter' },
];

// ── Leak categories ───────────────────────────────────────────────────────────
const LEAKS = [
  {
    key:        'convenience_tax',
    label:      'The Convenience Tax',
    sub:        'Delivery fees, last-minute runs, and pantry gaps that add up fast',
    icon:       'zap',
    multiplier: 0.12,
  },
  {
    key:        'brand_trap',
    label:      'The Brand Trap',
    sub:        'Paying premium for familiar names when the generic is identical',
    icon:       'tag',
    multiplier: 0.15,
  },
  {
    key:        'target_drift',
    label:      'The Target Drift',
    sub:        'Going in for toothpaste, leaving with $180 worth of stuff',
    icon:       'shopping-cart',
    multiplier: 0.08,
  },
  {
    key:        'healthy_premium',
    label:      'The Healthy Premium',
    sub:        'Paying full price to eat clean when the same quality exists on sale',
    icon:       'heart',
    multiplier: 0.10,
  },
];

// ── Mission options — multi-select ────────────────────────────────────────────
const MISSIONS = [
  {
    key:        'clinical_guardrails',
    label:      'Clinical Guardrails',
    sub:        "Allergies or medical diet requirements I can't compromise on",
    icon:       'shield',
    multiplier: 0.05,
  },
  {
    key:        'program_tracking',
    label:      'Program Tracking',
    sub:        "I'm on Noom, WW, Keto, or another structured plan",
    icon:       'activity',
    multiplier: 0.06,
  },
  {
    key:        'athletic_fuel',
    label:      'Athletic Fuel',
    sub:        'High protein, performance nutrition, body composition goals',
    icon:       'trending-up',
    multiplier: 0.08,
  },
  {
    key:        'pure_savings',
    label:      'Pure Savings',
    sub:        'Floor price on everything — maximum recovery, no frills',
    icon:       'dollar-sign',
    multiplier: 0.10,
  },
];

// ── Spend buckets — monthly ───────────────────────────────────────────────────
const SPEND_BUCKETS_MONTHLY = [
  { key: 'a', label: 'Under $400',      value: 300  },
  { key: 'b', label: '$400 – $700',     value: 550  },
  { key: 'c', label: '$700 – $1,000',   value: 850  },
  { key: 'd', label: '$1,000 – $1,500', value: 1250 },
  { key: 'e', label: '$1,500 – $2,500', value: 2000 },
  { key: 'f', label: '$2,500+',         value: 3000 },
];

// ── Spend buckets — weekly (value = weekly; monthlyValue = weekly × 4.33) ─────
const SPEND_BUCKETS_WEEKLY = [
  { key: 'a', label: 'Under $100',    value: 75,   monthlyValue: Math.round(75   * 4.33) },
  { key: 'b', label: '$100 – $175',   value: 137,  monthlyValue: Math.round(137  * 4.33) },
  { key: 'c', label: '$175 – $250',   value: 212,  monthlyValue: Math.round(212  * 4.33) },
  { key: 'd', label: '$250 – $375',   value: 312,  monthlyValue: Math.round(312  * 4.33) },
  { key: 'e', label: '$375 – $600',   value: 487,  monthlyValue: Math.round(487  * 4.33) },
  { key: 'f', label: '$600+ / week',  value: 750,  monthlyValue: Math.round(750  * 4.33) },
];

// ── Savings calculator ────────────────────────────────────────────────────────
// missions is now an array of keys
function calcProjection(household, leak, missions, monthlySpend) {
  let rate = 0.18;

  MEMBERS.forEach(m => {
    const count = household[m.key] ?? 0;
    if (count > 0) rate += m.multiplier * count;
  });

  const leakObj = LEAKS.find(l => l.key === leak);
  if (leakObj) rate += leakObj.multiplier;

  // Sum all selected mission multipliers
  missions.forEach(mk => {
    const mObj = MISSIONS.find(m => m.key === mk);
    if (mObj) rate += mObj.multiplier;
  });

  rate = Math.min(rate, 0.40);
  const monthly = Math.round((monthlySpend ?? 0) * rate);
  return { monthly, annual: monthly * 12, rate: Math.round(rate * 100) };
}

// ── Household description builder ─────────────────────────────────────────────
function buildHouseholdDesc(household) {
  const parts = [];
  MEMBERS.forEach(m => {
    const count = household[m.key] ?? 0;
    if (count === 0) return;
    parts.push(`${count > 1 ? count + ' ' : ''}${count > 1 ? m.label + 's' : m.label}`);
  });
  if (parts.length === 0) return 'your household';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return parts.join(' and ');
  return parts.slice(0, -1).join(', ') + ', and ' + parts[parts.length - 1];
}

// ── Active bonus badges ────────────────────────────────────────────────────────
function getActiveBonuses(household) {
  return MEMBERS
    .filter(m => m.bonus && (household[m.key] ?? 0) > 0)
    .map(m => ({ label: m.bonus, icon: m.featherIcon }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
// ── Mission detail follow-up questions ───────────────────────────────────────
const MISSION_DETAILS = {
  clinical_guardrails: {
    question: 'What restrictions do you manage?',
    options: [
      { key: 'nut_allergy',    label: 'Tree Nuts' },
      { key: 'peanut',         label: 'Peanuts' },
      { key: 'gluten_free',    label: 'Gluten-Free' },
      { key: 'dairy_free',     label: 'Dairy-Free' },
      { key: 'diabetic',       label: 'Diabetic' },
      { key: 'low_sodium',     label: 'Low Sodium' },
      { key: 'vegan',          label: 'Vegan' },
      { key: 'kosher',         label: 'Kosher/Halal' },
    ],
  },
  program_tracking: {
    question: 'Which program are you following?',
    options: [
      { key: 'keto',            label: 'Keto' },
      { key: 'ww',              label: 'WW / Weight Watchers' },
      { key: 'noom',            label: 'Noom' },
      { key: 'whole30',         label: 'Whole30' },
      { key: 'paleo',           label: 'Paleo' },
      { key: 'if',              label: 'Intermittent Fasting' },
      { key: 'calorie_count',   label: 'Calorie Counting' },
      { key: 'other_program',   label: 'Other' },
    ],
  },
  athletic_fuel: {
    question: "What's your primary fitness goal?",
    options: [
      { key: 'build_muscle',    label: 'Build Muscle' },
      { key: 'lose_weight',     label: 'Lose Weight' },
      { key: 'endurance',       label: 'Endurance / Cardio' },
      { key: 'maintain',        label: 'Maintain Weight' },
      { key: 'performance',     label: 'Athletic Performance' },
    ],
  },
  pure_savings: {
    question: 'Which categories matter most?',
    options: [
      { key: 'all_groceries',   label: 'All Groceries' },
      { key: 'meat_seafood',    label: 'Meat & Seafood' },
      { key: 'produce',         label: 'Produce' },
      { key: 'dairy',           label: 'Dairy' },
      { key: 'pantry',          label: 'Pantry Staples' },
      { key: 'household',       label: 'Household Items' },
      { key: 'baby',            label: 'Baby Products' },
      { key: 'pet',             label: 'Pet Food' },
    ],
  },
};

export default function WaitlistForecastScreen({ navigation }) {
  const [step,          setStep]          = useState(0);
  const [household,     setHousehold]     = useState({});
  const [leak,          setLeak]          = useState(null);
  const [missions,      setMissions]      = useState([]);   // multi-select array
  const [missionDetails, setMissionDetails] = useState({}); // { mission_key: [detail_keys] }
  const [bucket,        setBucket]        = useState(null);
  const [spendMode,     setSpendMode]     = useState('monthly'); // 'monthly' | 'weekly'
  const [whyText,       setWhyText]       = useState('');
  const [whySaved,      setWhySaved]      = useState(false);
  const [whySaving,     setWhySaving]     = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [displayAmt,    setDisplayAmt]    = useState(0);

  const fadeAnim   = useRef(new Animated.Value(1)).current;
  const slideAnim  = useRef(new Animated.Value(0)).current;
  const revealAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(0.88)).current;

  const buckets = spendMode === 'weekly' ? SPEND_BUCKETS_WEEKLY : SPEND_BUCKETS_MONTHLY;

  // Monthly spend value accounting for weekly mode
  const monthlySpend = bucket
    ? (spendMode === 'weekly' ? bucket.monthlyValue : bucket.value)
    : 0;

  const projection = calcProjection(household, leak, missions, monthlySpend);
  const bonuses    = getActiveBonuses(household);

  // Reset bucket when mode switches so stale value doesn't carry over
  const handleSpendModeChange = useCallback((mode) => {
    setSpendMode(mode);
    setBucket(null);
  }, []);

  // ── Count-up on reveal ──────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 4) return;
    Animated.parallel([
      Animated.timing(revealAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim,  { toValue: 1, tension: 60, friction: 8, useNativeDriver: true }),
    ]).start();

    const target  = projection.monthly;
    const fps     = 60;
    const dur     = 1800;
    const step_ms = dur / fps;
    let current   = 0;
    const inc     = target / fps;
    const timer   = setInterval(() => {
      current += inc;
      if (current >= target) { setDisplayAmt(target); clearInterval(timer); }
      else                   { setDisplayAmt(Math.round(current)); }
    }, step_ms);
    return () => clearInterval(timer);
  }, [step]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Step transition ──────────────────────────────────────────────────────
  const goToStep = useCallback((next) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  // ── Household helpers ────────────────────────────────────────────────────
  const addMember = useCallback((key) => {
    setHousehold(prev => ({ ...prev, [key]: (prev[key] ?? 0) + 1 }));
  }, []);
  const removeMember = useCallback((key) => {
    setHousehold(prev => {
      const next = { ...prev, [key]: Math.max(0, (prev[key] ?? 0) - 1) };
      if (next[key] === 0) delete next[key];
      return next;
    });
  }, []);

  // ── Mission toggle ───────────────────────────────────────────────────────
  const toggleMission = useCallback((key) => {
    setMissions(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  }, []);

  // ── Mission detail toggle ─────────────────────────────────────────────────
  const toggleMissionDetail = useCallback((missionKey, detailKey) => {
    setMissionDetails(prev => {
      const current = prev[missionKey] ?? [];
      const next = current.includes(detailKey)
        ? current.filter(k => k !== detailKey)
        : [...current, detailKey];
      return { ...prev, [missionKey]: next };
    });
  }, []);

  // ── Save just the "why" text ──────────────────────────────────────────────
  const handleSaveWhy = useCallback(async () => {
    if (!whyText.trim() || whySaving) return;
    setWhySaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase.from('user_persona').upsert(
        { user_id: user.id, why_snippd: whyText.trim() },
        { onConflict: 'user_id' }
      );
      setWhySaved(true);
    } catch (_) {}
    setWhySaving(false);
  }, [whyText, whySaving]);

  // ── Can advance ──────────────────────────────────────────────────────────
  const canAdvance = useCallback(() => {
    if (step === 0) return Object.values(household).some(v => v > 0);
    if (step === 1) return !!leak;
    if (step === 2) return missions.length > 0;
    if (step === 3) return !!bucket;
    return false;
  }, [step, household, leak, missions, bucket]);

  // ── Save and navigate ────────────────────────────────────────────────────
  const handleJoinWaitlist = useCallback(async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigation.replace('Auth'); return; }

      const proj = calcProjection(household, leak, missions, monthlySpend);

      await supabase.from('user_persona').upsert({
        user_id:                          user.id,
        status:                           'waitlist',
        household_composition:            household,
        leak_category:                    leak,
        mission_type:                     missions.join(','),
        mission_details:                  Object.keys(missionDetails).length > 0 ? missionDetails : null,
        monthly_spend_cents:              monthlySpend * 100,
        projected_monthly_recovery_cents: proj.monthly * 100,
        why_snippd:                       whyText.trim() || null,
        forecast_completed:               true,
      }, { onConflict: 'user_id' });

      // Assign the free waitlist position directly — this is the reliable path.
      // assign_free_waitlist_position is SECURITY DEFINER and idempotent
      // (ON CONFLICT DO NOTHING), so duplicate calls are safe.
      try {
        await supabase.rpc('assign_free_waitlist_position', { p_user_id: user.id });
      } catch (_) {
        // Non-fatal — position row will be created on retry or via admin.
      }

      // Also fire the ingest event for analytics (fire-and-forget).
      supabase.functions.invoke('ingest-event', {
        body: {
          user_id:    user.id,
          event_name: 'forecast_completed',
          session_id: generateUUID(),
        },
      }).catch(() => {});

      navigation.replace('MainApp');
    } catch (e) {
      console.error('WaitlistForecast save error:', e);
    } finally {
      setSubmitting(false);
    }
  }, [household, leak, missions, monthlySpend, whyText, navigation]);

  // ── Share ────────────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const leakObj   = LEAKS.find(l => l.key === leak);
    const leakLabel = leakObj ? leakObj.label.replace(/^The /, '').toLowerCase() : 'spending leaks';
    const msg = `My Shopping Bestie just told me I'm losing $${projection.monthly}/mo to ${leakLabel}.\n\nI joined the Snippd waitlist to take it back. You should too.\n\nhttps://snippd.com/join\n\n@getsnippd #Snippd #ShoppingBestie`;
    try { await Share.share({ message: msg }); } catch {}
  }, [leak, projection]);

  // ── Projection pill ──────────────────────────────────────────────────────
  function ProjectionPill() {
    if (step < 2 || step > 3 || monthlySpend === 0) return null;
    return (
      <View style={styles.projPill}>
        <Feather name="trending-up" size={12} color={GREEN} />
        <Text style={styles.projPillText}>
          {projection.monthly > 0
            ? `Your projection: $${projection.monthly}/mo`
            : 'Projection building...'}
        </Text>
      </View>
    );
  }

  // ── Progress dots ────────────────────────────────────────────────────────
  function ProgressDots() {
    return (
      <View style={styles.dotsRow}>
        {[0,1,2,3].map(i => (
          <View
            key={i}
            style={[styles.dot, i <= (step === 4 ? 3 : step) && styles.dotActive]}
          />
        ))}
      </View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 0 — The Table
  // ─────────────────────────────────────────────────────────────────────────
  function renderTableStep() {
    const totalCount = Object.values(household).reduce((s, v) => s + v, 0);
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step 1 of 4 — The Table</Text>
        <Text style={styles.headline}>Who are we{'\n'}fueling?</Text>
        <Text style={styles.subtitle}>
          Add each person at your table. Your agent calibrates portion intelligence, bulk triggers, and growth-spurt savings to match.
        </Text>

        <View style={styles.memberList}>
          {MEMBERS.map(m => {
            const count  = household[m.key] ?? 0;
            const active = count > 0;
            return (
              <View key={m.key} style={[styles.memberRow, active && styles.memberRowActive]}>
                <View style={[styles.memberIconWrap, active && styles.memberIconWrapActive]}>
                  <Feather name={m.featherIcon} size={20} color={active ? WHITE : GREEN} />
                </View>
                <View style={styles.memberInfo}>
                  <Text style={[styles.memberLabel, active && styles.memberLabelActive]}>{m.label}</Text>
                  <Text style={styles.memberSub}>{m.sub}</Text>
                </View>
                {active && m.bonus && (
                  <View style={styles.memberBonus}>
                    <Text style={styles.memberBonusText}>{m.bonus}</Text>
                  </View>
                )}
                <View style={styles.memberCounter}>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => removeMember(m.key)}
                    disabled={count === 0}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="minus" size={16} color={count === 0 ? BORDER : SLATE} />
                  </TouchableOpacity>
                  <Text style={styles.counterNum}>{count}</Text>
                  <TouchableOpacity
                    style={styles.counterBtn}
                    onPress={() => addMember(m.key)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="plus" size={16} color={GREEN} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}
        </View>

        {totalCount > 0 && (
          <View style={styles.tableSummary}>
            <Feather name="users" size={14} color={GREEN} />
            <Text style={styles.tableSummaryText}>
              Feeding {buildHouseholdDesc(household)}
            </Text>
          </View>
        )}

        {bonuses.length > 0 && (
          <View style={styles.bonusRow}>
            {bonuses.map(b => (
              <View key={b.label} style={styles.bonusBadge}>
                <Feather name={b.icon} size={11} color={GREEN} />
                <Text style={styles.bonusBadgeText}>{b.label} Activated</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 1 — The Leak
  // ─────────────────────────────────────────────────────────────────────────
  function renderLeakStep() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step 2 of 4 — The Leak</Text>
        <Text style={styles.headline}>Where does the{'\n'}money go?</Text>
        <Text style={styles.subtitle}>
          Pick your biggest budget villain. I'll target it first.
        </Text>

        {LEAKS.map(l => {
          const sel = leak === l.key;
          return (
            <TouchableOpacity
              key={l.key}
              style={[styles.optionCard, sel && styles.optionCardSelected]}
              onPress={() => setLeak(l.key)}
              activeOpacity={0.8}
            >
              <View style={[styles.optionIconWrap, sel && styles.optionIconWrapSelected]}>
                <Feather name={l.icon} size={20} color={sel ? WHITE : GREEN} />
              </View>
              <View style={styles.optionText}>
                <Text style={[styles.optionLabel, sel && styles.optionLabelSelected]}>
                  {l.label}
                </Text>
                <Text style={styles.optionSub}>{l.sub}</Text>
              </View>
              {sel && <Feather name="check-circle" size={18} color={GREEN} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 2 — The Mission (multi-select + inline detail follow-ups)
  // ─────────────────────────────────────────────────────────────────────────
  function renderMissionStep() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step 3 of 4 — The Mission</Text>
        <Text style={styles.headline}>What's{'\n'}the goal?</Text>
        <Text style={styles.subtitle}>
          Select all that apply — I'll stack every angle that works for your household.
        </Text>

        {MISSIONS.map(m => {
          const sel     = missions.includes(m.key);
          const details = MISSION_DETAILS[m.key];
          const chosen  = missionDetails[m.key] ?? [];
          return (
            <View key={m.key} style={styles.missionCardWrap}>
              <TouchableOpacity
                style={[styles.optionCard, sel && styles.optionCardSelected, { marginBottom: 0 }]}
                onPress={() => toggleMission(m.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.optionIconWrap, sel && styles.optionIconWrapSelected]}>
                  <Feather name={m.icon} size={20} color={sel ? WHITE : GREEN} />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, sel && styles.optionLabelSelected]}>
                    {m.label}
                  </Text>
                  <Text style={styles.optionSub}>{m.sub}</Text>
                </View>
                <View style={[styles.multiCheckBox, sel && styles.multiCheckBoxSelected]}>
                  {sel && <Feather name="check" size={13} color={WHITE} />}
                </View>
              </TouchableOpacity>

              {/* Inline follow-up — visible only when selected */}
              {sel && details && (
                <View style={styles.missionDetailPanel}>
                  <Text style={styles.missionDetailQ}>{details.question}</Text>
                  <View style={styles.missionDetailChips}>
                    {details.options.map(opt => {
                      const active = chosen.includes(opt.key);
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          style={[styles.detailChip, active && styles.detailChipActive]}
                          onPress={() => toggleMissionDetail(m.key, opt.key)}
                          activeOpacity={0.8}
                        >
                          <Text style={[styles.detailChipText, active && styles.detailChipTextActive]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  {chosen.length > 0 && (
                    <View style={styles.detailChosenRow}>
                      <Feather name="check-circle" size={12} color={GREEN} />
                      <Text style={styles.detailChosenText}>
                        {chosen.length} selected — I'll prioritize these
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}

        {missions.length > 1 && (
          <View style={styles.multiSelectNote}>
            <Feather name="layers" size={13} color={GREEN} />
            <Text style={styles.multiSelectNoteText}>
              {missions.length} goals selected — your savings stack multiplies
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 3 — The Baseline (weekly / monthly toggle)
  // ─────────────────────────────────────────────────────────────────────────
  function renderBaselineStep() {
    const liveProj = bucket
      ? calcProjection(household, leak, missions, monthlySpend)
      : null;

    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>Step 4 of 4 — The Baseline</Text>
        <Text style={styles.headline}>
          {spendMode === 'weekly' ? 'What do you spend\nper week?' : 'What do you spend\nmonthly?'}
        </Text>
        <Text style={styles.subtitle}>
          Groceries + dining out combined. Be honest — I won't judge, I'll just fight harder.
        </Text>

        {/* Weekly / Monthly toggle */}
        <View style={styles.modeToggle}>
          <TouchableOpacity
            style={[styles.modeBtn, spendMode === 'monthly' && styles.modeBtnActive]}
            onPress={() => handleSpendModeChange('monthly')}
          >
            <Text style={[styles.modeBtnText, spendMode === 'monthly' && styles.modeBtnTextActive]}>
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeBtn, spendMode === 'weekly' && styles.modeBtnActive]}
            onPress={() => handleSpendModeChange('weekly')}
          >
            <Text style={[styles.modeBtnText, spendMode === 'weekly' && styles.modeBtnTextActive]}>
              Weekly
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.bucketGrid}>
          {buckets.map(b => {
            const sel      = bucket?.key === b.key;
            const selProj  = sel && liveProj;
            return (
              <TouchableOpacity
                key={b.key}
                style={[styles.bucketCard, sel && styles.bucketCardSelected]}
                onPress={() => setBucket(b)}
                activeOpacity={0.8}
              >
                <Text style={[styles.bucketLabel, sel && styles.bucketLabelSelected]}>
                  {b.label}
                </Text>
                {selProj && (
                  <Text style={styles.bucketProjection}>~${selProj.monthly}/mo back</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {liveProj && (
          <View style={styles.baselineProjCard}>
            <Text style={styles.baselineProjLabel}>Your Shopping Bestie projects</Text>
            <Text style={styles.baselineProjAmount}>${liveProj.monthly}</Text>
            <Text style={styles.baselineProjSub}>per month in recovery</Text>
            <Text style={styles.baselineProjAnnual}>
              ${liveProj.annual.toLocaleString()} per year
            </Text>
            {spendMode === 'weekly' && (
              <Text style={styles.baselineProjNote}>
                Based on ${monthlySpend.toLocaleString()}/mo ({bucket.label}/wk x 4.3)
              </Text>
            )}
          </View>
        )}
      </ScrollView>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STEP 4 — The Reveal
  // ─────────────────────────────────────────────────────────────────────────
  function renderRevealStep() {
    const desc    = buildHouseholdDesc(household);
    const leakObj = LEAKS.find(l => l.key === leak);
    const leakLabel = leakObj
      ? leakObj.label.replace(/^The /, '').toLowerCase()
      : 'spending leaks';

    return (
      <Animated.View
        style={[styles.revealContainer, { opacity: revealAnim, transform: [{ scale: scaleAnim }] }]}
      >
        <ScrollView contentContainerStyle={styles.revealContent} showsVerticalScrollIndicator={false}>
          {/* Header */}
          <View style={styles.revealHeader}>
            <View style={styles.revealLogoWrap}>
              <Feather name="cpu" size={28} color={GREEN} />
            </View>
            <Text style={styles.revealEyebrow}>Your Shopping Bestie ran the numbers.</Text>
          </View>

          {/* Based on your... */}
          <Text style={styles.revealBased}>
            {`Feeding ${desc} and targeting your ${leakLabel},`}
          </Text>

          {/* The Big Number */}
          <View style={styles.revealAmountWrap}>
            <Text style={styles.revealCurrency}>$</Text>
            <Text style={styles.revealAmount}>{displayAmt.toLocaleString()}</Text>
          </View>
          <Text style={styles.revealAmountSub}>per month in projected recovery</Text>
          <Text style={styles.revealAnnual}>
            That's ${projection.annual.toLocaleString()} back every year.
          </Text>

          {/* Active bonus engines */}
          {bonuses.length > 0 && (
            <View style={styles.revealBonusWrap}>
              <Text style={styles.revealBonusTitle}>Savings engines activated:</Text>
              <View style={styles.revealBonusRow}>
                {bonuses.map(b => (
                  <View key={b.label} style={styles.revealBonusBadge}>
                    <Feather name={b.icon} size={12} color={GREEN} />
                    <Text style={styles.revealBonusBadgeText}>{b.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Why do you need Snippd */}
          <View style={styles.revealWhyCard}>
            <Text style={styles.revealWhyLabel}>Why do you need Snippd?</Text>
            <Text style={styles.revealWhyHint}>
              Share your reason. If we feature it, you jump 500 spots.
            </Text>
            <TextInput
              style={[styles.revealWhyInput, Platform.OS === 'web' && { outline: 'none' }]}
              placeholder={"\"I'm tired of choosing between eating healthy and my savings account.\""}
              placeholderTextColor={SLATE}
              value={whyText}
              onChangeText={text => { setWhyText(text); setWhySaved(false); }}
              multiline
              maxLength={140}
              returnKeyType="done"
            />
            <View style={styles.revealWhyFooter}>
              {whyText.length > 0 && (
                <Text style={styles.revealWhyCount}>{140 - whyText.length} left</Text>
              )}
              {whyText.trim().length > 0 && (
                <TouchableOpacity
                  style={[styles.whySaveBtn, whySaved && styles.whySaveBtnDone]}
                  onPress={handleSaveWhy}
                  disabled={whySaving || whySaved}
                  activeOpacity={0.85}
                >
                  {whySaved ? (
                    <>
                      <Feather name="check" size={13} color={GREEN} />
                      <Text style={[styles.whySaveBtnText, { color: GREEN }]}>Saved</Text>
                    </>
                  ) : (
                    <Text style={styles.whySaveBtnText}>
                      {whySaving ? 'Saving…' : 'Submit my reason'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Viral trigger */}
          <View style={styles.revealViralCard}>
            <Feather name="share-2" size={16} color={GREEN} />
            <Text style={styles.revealViralText}>
              Screenshot your forecast. Tag{' '}
              <Text style={styles.revealViralHandle}>@getsnippd</Text>
              {' '}on IG, TikTok, or X and jump the line.
            </Text>
          </View>

          {/* CTAs */}
          <TouchableOpacity
            style={styles.shareBtn}
            onPress={handleShare}
            activeOpacity={0.85}
          >
            <Feather name="share" size={16} color={GREEN} />
            <Text style={styles.shareBtnText}>Share my forecast</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.ctaBtn, submitting && styles.ctaBtnDisabled]}
            onPress={handleJoinWaitlist}
            disabled={submitting}
            activeOpacity={0.9}
          >
            <Text style={styles.ctaBtnText}>
              {submitting ? 'Saving your spot...' : 'Join the waitlist'}
            </Text>
            {!submitting && <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />}
          </TouchableOpacity>
        </ScrollView>
      </Animated.View>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Root render
  // ─────────────────────────────────────────────────────────────────────────
  const isReveal = step === 4;

  return (
    <SafeAreaView style={[styles.safe, isReveal && styles.safeReveal]}>
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />

      {!isReveal && (
        <View style={styles.topBar}>
          <ProgressDots />
          <ProjectionPill />
        </View>
      )}

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={20}
      >
        <Animated.View
          style={[styles.animWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
        >
          {step === 0 && renderTableStep()}
          {step === 1 && renderLeakStep()}
          {step === 2 && renderMissionStep()}
          {step === 3 && renderBaselineStep()}
          {step === 4 && renderRevealStep()}
        </Animated.View>

        {!isReveal && (
          <View style={styles.footer}>
            {step < 3 && (
              <TouchableOpacity
                style={styles.skipBtn}
                onPress={() => goToStep(step + 1)}
                activeOpacity={0.7}
              >
                <Text style={styles.skipBtnText}>Skip</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
              onPress={() => {
                if (step < 3) { goToStep(step + 1); }
                else if (step === 3) { goToStep(4); }
              }}
              disabled={!canAdvance()}
              activeOpacity={0.85}
            >
              <Text style={styles.nextBtnText}>
                {step === 3 ? 'See my forecast' : 'Next'}
              </Text>
              <Feather
                name="arrow-right"
                size={16}
                color={canAdvance() ? WHITE : SLATE}
                style={{ marginLeft: 6 }}
              />
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: MINT,
  },
  safeReveal: {
    backgroundColor: WHITE,
  },

  // ── Top bar ──────────────────────────────────────────────────────────────
  topBar: {
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: BORDER,
  },
  dotActive: {
    backgroundColor: GREEN,
    width: 20,
  },

  // ── Projection pill ──────────────────────────────────────────────────────
  projPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GREEN_SOFT,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  projPillText: {
    fontSize: 11,
    fontWeight: '600',
    color: GREEN,
  },

  animWrap: { flex: 1 },

  // ── Step content ──────────────────────────────────────────────────────────
  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  headline: {
    fontSize: 30,
    fontWeight: '800',
    color: NAVY,
    lineHeight: 36,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: SLATE,
    lineHeight: 21,
    marginBottom: 24,
  },

  // ── Member list (Step 0) ─────────────────────────────────────────────────
  memberList: {
    gap: 10,
    marginBottom: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...Platform.select({
      web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.05)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    }),
  },
  memberRowActive: {
    borderColor: GREEN,
    backgroundColor: GREEN_SOFT,
  },
  memberIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  memberIconWrapActive: {
    backgroundColor: GREEN,
  },
  memberInfo: {
    flex: 1,
  },
  memberLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
  },
  memberLabelActive: {
    color: GREEN,
  },
  memberSub: {
    fontSize: 12,
    color: SLATE,
    marginTop: 1,
  },
  memberBonus: {
    backgroundColor: GREEN_MED,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 10,
  },
  memberBonusText: {
    fontSize: 10,
    fontWeight: '700',
    color: GREEN,
  },
  memberCounter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  counterBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: BORDER,
  },
  counterNum: {
    fontSize: 15,
    fontWeight: '800',
    color: NAVY,
    minWidth: 18,
    textAlign: 'center',
  },

  // ── Bonus badges ──────────────────────────────────────────────────────────
  bonusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  bonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GREEN_MED,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bonusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: GREEN,
  },

  // ── Table summary ─────────────────────────────────────────────────────────
  tableSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: WHITE,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: MINT_DEEP,
    marginBottom: 12,
  },
  tableSummaryText: {
    fontSize: 13,
    color: NAVY,
    fontWeight: '500',
    flex: 1,
    flexWrap: 'wrap',
  },

  // ── Option cards (Steps 1 & 2) ────────────────────────────────────────────
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
    ...Platform.select({
      web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.05)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    }),
  },
  optionCardSelected: {
    borderColor: GREEN,
    backgroundColor: GREEN_SOFT,
  },
  optionIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  optionIconWrapSelected: {
    backgroundColor: GREEN,
  },
  optionText: {
    flex: 1,
    flexShrink: 1,
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 3,
  },
  optionLabelSelected: {
    color: GREEN,
  },
  optionSub: {
    fontSize: 12,
    color: SLATE,
    lineHeight: 17,
    flexWrap: 'wrap',
  },

  // ── Multi-select checkbox ─────────────────────────────────────────────────
  multiCheckBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
    flexShrink: 0,
  },
  multiCheckBoxSelected: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  multiSelectNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GREEN_SOFT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 4,
  },
  multiSelectNoteText: {
    fontSize: 13,
    color: GREEN,
    fontWeight: '600',
  },

  // ── Spend mode toggle ─────────────────────────────────────────────────────
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 3,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },
  modeBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 9,
  },
  modeBtnActive: {
    backgroundColor: GREEN,
  },
  modeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: SLATE,
  },
  modeBtnTextActive: {
    color: WHITE,
  },

  // ── Spend buckets (Step 3) ────────────────────────────────────────────────
  bucketGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  bucketCard: {
    width: '47%',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    ...Platform.select({
      web: { boxShadow: '0px 2px 6px rgba(0,0,0,0.05)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
    }),
  },
  bucketCardSelected: {
    borderColor: GREEN,
    backgroundColor: GREEN_SOFT,
  },
  bucketLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: NAVY,
    textAlign: 'center',
  },
  bucketLabelSelected: {
    color: GREEN,
  },
  bucketProjection: {
    fontSize: 11,
    color: GREEN,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  baselineProjCard: {
    backgroundColor: NAVY,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginTop: 4,
  },
  baselineProjLabel: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.65)',
    fontWeight: '500',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  baselineProjAmount: {
    fontSize: 56,
    fontWeight: '900',
    color: WHITE,
    lineHeight: 64,
  },
  baselineProjSub: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.65)',
    marginBottom: 4,
  },
  baselineProjAnnual: {
    fontSize: 17,
    color: '#C5FFBC',
    fontWeight: '700',
    marginTop: 4,
  },
  baselineProjNote: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.5)',
    marginTop: 8,
    textAlign: 'center',
  },

  // ── Footer nav ─────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 36 : 20,
    paddingTop: 12,
    backgroundColor: MINT,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  skipBtn: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  skipBtnText: {
    fontSize: 14,
    color: SLATE,
    fontWeight: '500',
  },
  nextBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  nextBtnDisabled: {
    backgroundColor: BORDER,
  },
  nextBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: WHITE,
  },

  // ── Reveal ───────────────────────────────────────────────────────────────
  revealContainer: {
    flex: 1,
    backgroundColor: WHITE,
  },
  revealContent: {
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 60,
  },
  revealHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  revealLogoWrap: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: GREEN_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  revealEyebrow: {
    fontSize: 13,
    color: SLATE,
    fontWeight: '500',
    textAlign: 'center',
  },
  revealBased: {
    fontSize: 16,
    color: NAVY,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: 8,
  },
  revealAmountWrap: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'center',
    marginTop: 6,
  },
  revealCurrency: {
    fontSize: 28,
    fontWeight: '800',
    color: GREEN,
    marginTop: 10,
  },
  revealAmount: {
    fontSize: 80,
    fontWeight: '900',
    color: GREEN,
    lineHeight: 88,
  },
  revealAmountSub: {
    fontSize: 15,
    color: SLATE,
    textAlign: 'center',
    marginBottom: 4,
  },
  revealAnnual: {
    fontSize: 18,
    fontWeight: '700',
    color: NAVY,
    textAlign: 'center',
    marginBottom: 24,
  },
  revealBonusWrap: {
    marginBottom: 24,
  },
  revealBonusTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  revealBonusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  revealBonusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GREEN_SOFT,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  revealBonusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: GREEN,
  },
  revealWhyCard: {
    backgroundColor: SLATE_SOFT,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: BORDER,
  },
  revealWhyLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 4,
  },
  revealWhyHint: {
    fontSize: 12,
    color: SLATE,
    marginBottom: 12,
    lineHeight: 17,
  },
  revealWhyInput: {
    fontSize: 14,
    color: NAVY,
    minHeight: 72,
    textAlignVertical: 'top',
    lineHeight: 21,
  },
  revealWhyFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    flexWrap: 'wrap',
    gap: 8,
  },
  revealWhyCount: {
    fontSize: 11,
    color: SLATE,
  },
  whySaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  whySaveBtnDone: {
    backgroundColor: GREEN_SOFT,
    borderWidth: 1,
    borderColor: GREEN,
  },
  whySaveBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: WHITE,
  },

  // ── Mission detail follow-up panels ──────────────────────────────────────
  missionCardWrap: {
    marginBottom: 10,
  },
  missionDetailPanel: {
    backgroundColor: GREEN_SOFT,
    borderLeftWidth: 3,
    borderLeftColor: GREEN,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
  },
  missionDetailQ: {
    fontSize: 12,
    fontWeight: '700',
    color: NAVY,
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  missionDetailChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  detailChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: GREEN,
    backgroundColor: WHITE,
  },
  detailChipActive: {
    backgroundColor: GREEN,
  },
  detailChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: GREEN,
  },
  detailChipTextActive: {
    color: WHITE,
  },
  detailChosenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 10,
  },
  detailChosenText: {
    fontSize: 11,
    color: GREEN,
    fontWeight: '600',
  },
  revealViralCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: GREEN_SOFT,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  revealViralText: {
    flex: 1,
    fontSize: 13,
    color: NAVY,
    lineHeight: 19,
  },
  revealViralHandle: {
    fontWeight: '700',
    color: GREEN,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  shareBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: GREEN,
  },
  ctaBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  ctaBtnDisabled: {
    backgroundColor: SLATE,
  },
  ctaBtnText: {
    fontSize: 17,
    fontWeight: '800',
    color: WHITE,
  },
});
