// screens/SoftPersonalizationScreen.js
// Step 3 of the new onboarding flow — 4 optional questions.
// Every question has a Skip button. Partial answers are saved.
// On complete → navigates to MainApp.

import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Platform, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

const GREEN  = '#0C9E54';
const NAVY   = '#1A237E';
const MINT   = '#F0FBF0';
const WHITE  = '#FFFFFF';
const SLATE  = '#64748B';
const BORDER = '#E2E8F0';
const LIGHT_BG = '#F8FAFC';

// ── Question data ─────────────────────────────────────────────────────────────

const STORE_OPTIONS = [
  { name: 'Kroger',         initial: 'K',  color: '#0057A6' },
  { name: 'Walmart',        initial: 'W',  color: '#0071CE' },
  { name: 'Target',         initial: 'T',  color: '#CC0000' },
  { name: 'Costco',         initial: 'C',  color: '#005DAA' },
  { name: 'Aldi',           initial: 'A',  color: '#FF6600' },
  { name: "Trader Joe's",   initial: 'TJ', color: '#B22222' },
  { name: 'Whole Foods',    initial: 'WF', color: '#2E7D32' },
  { name: 'Publix',         initial: 'P',  color: '#1B5E20' },
  { name: 'H-E-B',          initial: 'H',  color: '#E31837' },
  { name: 'Meijer',         initial: 'M',  color: '#003087' },
  { name: 'Safeway',        initial: 'S',  color: '#E31837' },
  { name: 'Wegmans',        initial: 'W',  color: '#006940' },
  { name: "Sam's Club",     initial: 'SC', color: '#007DC6' },
  { name: 'Food Lion',      initial: 'FL', color: '#E2001A' },
  { name: 'ShopRite',       initial: 'SR', color: '#0066CC' },
  { name: 'CVS',            initial: 'CV', color: '#CC0000' },
  { name: 'Dollar General', initial: 'DG', color: '#F8C300' },
  { name: 'Walgreens',      initial: 'WG', color: '#E31837' },
];

const DIET_OPTIONS = [
  { key: 'omnivore',    label: 'Omnivore',       sub: 'No restrictions' },
  { key: 'vegetarian',  label: 'Vegetarian',     sub: 'No meat' },
  { key: 'vegan',       label: 'Vegan',          sub: 'No animal products' },
  { key: 'keto',        label: 'Keto',           sub: 'Low carb, high fat' },
  { key: 'paleo',       label: 'Paleo',          sub: 'Whole foods focus' },
  { key: 'gluten_free', label: 'Gluten-free',    sub: 'No wheat / gluten' },
  { key: 'dairy_free',  label: 'Dairy-free',     sub: 'No milk products' },
  { key: 'halal',       label: 'Halal',          sub: 'Halal certified' },
  { key: 'kosher',      label: 'Kosher',         sub: 'Kosher certified' },
];

const FOOD_OPTIONS = [
  'Chicken', 'Beef', 'Pork', 'Seafood', 'Eggs', 'Tofu',
  'Pasta', 'Rice', 'Bread', 'Potatoes',
  'Salads', 'Sandwiches', 'Soups & Stews', 'Tacos',
  'Asian cuisine', 'Mediterranean', 'Mexican', 'Italian',
  'Breakfast foods', 'Snacks & Chips', 'Frozen meals', 'Deli items',
  'Fresh produce', 'Organic', 'Meal kits',
];

const ALLERGY_OPTIONS = [
  'Peanuts', 'Tree nuts', 'Dairy', 'Eggs', 'Wheat / Gluten',
  'Soy', 'Shellfish', 'Fish', 'Sesame', 'None',
];

const COUPON_OPTIONS = [
  { key: 'love',       label: 'Love coupons',     sub: 'I clip everything I can' },
  { key: 'occasional', label: 'Occasional',        sub: "If it's easy and obvious" },
  { key: 'easy_only',  label: 'Easy only',         sub: 'Digital auto-apply only' },
  { key: 'not_into',   label: 'Not interested',    sub: 'Just show me lowest prices' },
];

const STEPS = ['stores', 'diet', 'foods', 'allergies', 'coupons'];

const STEP_META = {
  stores:    { title: 'Where do you shop?',          sub: 'Select all stores you visit regularly.', icon: 'shopping-bag' },
  diet:      { title: 'Dietary preference',          sub: "We'll filter deals to match. Pick all that apply.", icon: 'heart' },
  foods:     { title: 'Foods you love',              sub: "We'll prioritize deals on things you actually eat.", icon: 'star' },
  allergies: { title: 'Allergies or foods to avoid', sub: "We'll flag anything unsafe.",             icon: 'shield' },
  coupons:   { title: 'Coupon comfort level',        sub: 'How do you prefer to save?',             icon: 'tag' },
};

// ── Sub-components (outside parent to avoid remount) ──────────────────────────

function StoreCard({ store, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.storeCard, selected && styles.storeCardActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.storeCircle, { backgroundColor: store.color }]}>
        <Text style={styles.storeInitial}>{store.initial}</Text>
      </View>
      {selected && (
        <View style={styles.storeCheck}>
          <Feather name="check" size={10} color={WHITE} />
        </View>
      )}
      <Text style={[styles.storeName, selected && styles.storeNameActive]} numberOfLines={1}>
        {store.name}
      </Text>
    </TouchableOpacity>
  );
}

function DietChip({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.dietChip, selected && styles.dietChipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.dietCheck, selected && styles.dietCheckActive]}>
        {selected && <Feather name="check" size={11} color={WHITE} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.dietLabel, selected && styles.dietLabelActive]}>{item.label}</Text>
        <Text style={styles.dietSub}>{item.sub}</Text>
      </View>
    </TouchableOpacity>
  );
}

function AllergyChip({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.chip, selected && styles.chipActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {selected && <Feather name="check" size={12} color={WHITE} style={{ marginRight: 4 }} />}
      <Text style={[styles.chipText, selected && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function CouponRow({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.optionRow, selected && styles.optionRowActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionLabel, selected && styles.optionLabelActive]}>{item.label}</Text>
        {item.sub ? <Text style={styles.optionSub}>{item.sub}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioActive]}>
        {selected && <View style={styles.radioDot} />}
      </View>
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function SoftPersonalizationScreen({ route, navigation }) {
  const { budgetRange, household, goal, fromPersonalityReveal } = route?.params ?? {};
  const isOnboarding = !!fromPersonalityReveal;

  const [step,         setStep]       = useState(0);
  const [stores,       setStores]     = useState([]);
  const [otherStore,   setOtherStore] = useState('');
  const [diets,        setDiets]      = useState([]);   // multi-select array
  const [foods,        setFoods]      = useState([]);   // positive food preferences
  const [allergies,    setAllergies]  = useState([]);
  const [otherAllergy, setOtherAllergy] = useState('');
  const [couponLevel,  setCoupon]     = useState(null);
  const [saving,       setSaving]     = useState(false);
  const [skippedAll,   setSkippedAll] = useState(0);

  const currentKey = STEPS[step];
  const meta       = STEP_META[currentKey];

  // ── Toggling ──────────────────────────────────────────────────────────────

  function toggleStore(name) {
    setStores(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  }

  function toggleDiet(key) {
    setDiets(prev => {
      if (key === 'omnivore') return prev.includes('omnivore') ? [] : ['omnivore'];
      const without = prev.filter(x => x !== 'omnivore');
      return without.includes(key) ? without.filter(x => x !== key) : [...without, key];
    });
  }

  function toggleFood(f) {
    setFoods(prev => prev.includes(f) ? prev.filter(x => x !== f) : [...prev, f]);
  }

  function toggleAllergy(a) {
    if (a === 'None') { setAllergies(['None']); return; }
    setAllergies(prev => {
      const without = prev.filter(x => x !== 'None');
      return without.includes(a) ? without.filter(x => x !== a) : [...without, a];
    });
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function handleSkip() {
    setSkippedAll(n => n + 1);
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      finishAndProceed(true);
    }
  }

  function handleContinue() {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1);
    } else {
      finishAndProceed(false);
    }
  }

  async function finishAndProceed(allSkipped) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const profileUpdate = {};
        if (stores.length)    profileUpdate.preferred_stores = stores;
        if (allergies.length) profileUpdate.allergies = allergies.filter(a => a !== 'None');

        const lifestyleUpdate = {};
        if (diets.length)  lifestyleUpdate.dietary_preference = diets;
        if (foods.length)  lifestyleUpdate.favorite_foods     = foods;
        if (couponLevel)   lifestyleUpdate.coupon_comfort      = couponLevel;

        if (Object.keys(profileUpdate).length || Object.keys(lifestyleUpdate).length) {
          const { data: existing } = await supabase
            .from('profiles')
            .select('lifestyle_concierge, progressive_profile')
            .eq('user_id', user.id)
            .maybeSingle();

          await supabase.from('profiles').upsert({
            user_id: user.id,
            ...profileUpdate,
            lifestyle_concierge: {
              ...(existing?.lifestyle_concierge ?? {}),
              ...lifestyleUpdate,
            },
            progressive_profile: {
              ...(existing?.progressive_profile ?? {}),
              soft_personalization_done: true,
              soft_personalization_at:   new Date().toISOString(),
            },
          }, { onConflict: 'user_id' });
        }

        recordMemoryEvent({
          event_type: allSkipped ? 'personalization_skipped' : 'personalization_started',
          metadata: {
            stores_selected:  stores.length,
            diets_selected:   diets.length,
            foods_selected:   foods.length,
            allergies_count:  allergies.length,
            coupon_selected:  !!couponLevel,
            skips:            skippedAll,
          },
        });
      }
    } catch (_) { /* non-fatal */ }
    setSaving(false);
    if (isOnboarding) {
      navigation.replace('MainApp');
    } else {
      navigation.goBack();
    }
  }

  // ── Step renders ─────────────────────────────────────────────────────────

  function renderStores() {
    return (
      <View>
        <View style={styles.storeGrid}>
          {STORE_OPTIONS.map(store => (
            <StoreCard
              key={store.name}
              store={store}
              selected={stores.includes(store.name)}
              onPress={() => toggleStore(store.name)}
            />
          ))}
        </View>
        <TextInput
          style={styles.otherInput}
          placeholder="Other store…"
          placeholderTextColor={SLATE}
          value={otherStore}
          onChangeText={setOtherStore}
          onBlur={() => {
            if (otherStore.trim()) { toggleStore(otherStore.trim()); setOtherStore(''); }
          }}
        />
      </View>
    );
  }

  function renderDiet() {
    return (
      <View style={styles.dietGrid}>
        {DIET_OPTIONS.map(opt => (
          <DietChip
            key={opt.key}
            item={opt}
            selected={diets.includes(opt.key)}
            onPress={() => toggleDiet(opt.key)}
          />
        ))}
      </View>
    );
  }

  function renderFoods() {
    return (
      <View style={styles.chipWrap}>
        {FOOD_OPTIONS.map(f => (
          <AllergyChip
            key={f}
            label={f}
            selected={foods.includes(f)}
            onPress={() => toggleFood(f)}
          />
        ))}
      </View>
    );
  }

  function renderAllergies() {
    return (
      <View>
        <View style={styles.chipWrap}>
          {ALLERGY_OPTIONS.map(a => (
            <AllergyChip
              key={a}
              label={a}
              selected={allergies.includes(a)}
              onPress={() => toggleAllergy(a)}
            />
          ))}
        </View>
        <TextInput
          style={styles.otherInput}
          placeholder="Other allergy / food to avoid…"
          placeholderTextColor={SLATE}
          value={otherAllergy}
          onChangeText={setOtherAllergy}
          onBlur={() => {
            if (otherAllergy.trim()) { toggleAllergy(otherAllergy.trim()); setOtherAllergy(''); }
          }}
        />
      </View>
    );
  }

  function renderCoupons() {
    return (
      <View style={styles.optionList}>
        {COUPON_OPTIONS.map(opt => (
          <CouponRow
            key={opt.key}
            item={opt}
            selected={couponLevel === opt.key}
            onPress={() => setCoupon(opt.key)}
          />
        ))}
      </View>
    );
  }

  const hasAnswer =
    (currentKey === 'stores'    && stores.length > 0) ||
    (currentKey === 'diet'      && diets.length > 0) ||
    (currentKey === 'foods'     && foods.length > 0) ||
    (currentKey === 'allergies' && allergies.length > 0) ||
    (currentKey === 'coupons'   && couponLevel != null);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.stepIconWrap, { backgroundColor: GREEN + '18' }]}>
            <Feather name={meta.icon} size={18} color={GREEN} />
          </View>
          <Text style={styles.headerTitle}>
            "Want Snippd to build this{'\n'}around your actual household?"
          </Text>
        </View>
        <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipAll}>Skip all</Text>
        </TouchableOpacity>
      </View>

      {/* Progress dots */}
      <View style={styles.progressRow}>
        {STEPS.map((_, i) => (
          <View key={i} style={[styles.progressDot, i <= step && styles.progressDotActive]} />
        ))}
      </View>

      {/* Question headline */}
      <View style={styles.questionHeader}>
        <Text style={styles.questionTitle}>{meta.title}</Text>
        <Text style={styles.questionSub}>{meta.sub}</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {currentKey === 'stores'    && renderStores()}
        {currentKey === 'diet'      && renderDiet()}
        {currentKey === 'foods'     && renderFoods()}
        {currentKey === 'allergies' && renderAllergies()}
        {currentKey === 'coupons'   && renderCoupons()}
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.continueBtn, !hasAnswer && styles.continueBtnOutline]}
          onPress={hasAnswer ? handleContinue : handleSkip}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving
            ? <ActivityIndicator color={hasAnswer ? WHITE : GREEN} />
            : (
              <>
                <Text style={[styles.continueBtnText, !hasAnswer && styles.continueBtnTextOutline]}>
                  {hasAnswer
                    ? (step < STEPS.length - 1 ? 'Continue' : 'Save & continue')
                    : 'Skip this one'}
                </Text>
                <Feather name="arrow-right" size={15} color={hasAnswer ? WHITE : GREEN} />
              </>
            )
          }
        </TouchableOpacity>
        <Text style={styles.footerNote}>
          {STEPS.length - step - 1 > 0
            ? `${STEPS.length - step - 1} question${STEPS.length - step - 1 !== 1 ? 's' : ''} left · all optional`
            : 'Last question · optional'}
        </Text>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: WHITE },

  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6, gap: 10,
  },
  headerLeft: { flex: 1, flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2,
  },
  headerTitle: { fontSize: 13, fontWeight: '700', color: NAVY, lineHeight: 19, flex: 1 },
  skipAll: { fontSize: 13, fontWeight: '600', color: SLATE, paddingTop: 4 },

  progressRow: {
    flexDirection: 'row', gap: 6, paddingHorizontal: 20,
    marginBottom: 16, marginTop: 4,
  },
  progressDot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: BORDER },
  progressDotActive: { backgroundColor: GREEN },

  questionHeader: { paddingHorizontal: 20, marginBottom: 14 },
  questionTitle: { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 4 },
  questionSub: { fontSize: 14, color: SLATE, lineHeight: 20 },

  body: { paddingHorizontal: 20, paddingBottom: 24 },

  // ── Store grid ──────────────────────────────────────────────────────────────
  storeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10,
    marginBottom: 12,
  },
  storeCard: {
    width: '30%',                        // 3 columns
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 14, paddingHorizontal: 6,
    alignItems: 'center', gap: 8,
  },
  storeCardActive: { borderColor: GREEN, backgroundColor: 'rgba(12,158,84,0.05)' },
  storeCircle: {
    width: 48, height: 48, borderRadius: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  storeInitial: { fontSize: 14, fontWeight: '800', color: WHITE, letterSpacing: 0.3 },
  storeCheck: {
    position: 'absolute', top: 8, right: 8,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  storeName: {
    fontSize: 11, fontWeight: '600', color: NAVY,
    textAlign: 'center', lineHeight: 14,
  },
  storeNameActive: { color: GREEN },

  // ── Diet chips ──────────────────────────────────────────────────────────────
  dietGrid: { gap: 8 },
  dietChip: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: LIGHT_BG,
    borderRadius: 14, borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 13, paddingHorizontal: 14,
  },
  dietChipActive: { borderColor: GREEN, backgroundColor: 'rgba(12,158,84,0.06)' },
  dietCheck: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  dietCheckActive: { backgroundColor: GREEN, borderColor: GREEN },
  dietLabel: { fontSize: 15, fontWeight: '700', color: NAVY },
  dietLabelActive: { color: GREEN },
  dietSub: { fontSize: 12, color: SLATE, marginTop: 1 },

  // ── Allergy chips ───────────────────────────────────────────────────────────
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: BORDER,
    borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: WHITE,
  },
  chipActive: { backgroundColor: GREEN, borderColor: GREEN },
  chipText: { fontSize: 14, fontWeight: '600', color: NAVY },
  chipTextActive: { color: WHITE },

  // ── Coupon option rows ──────────────────────────────────────────────────────
  optionList: { gap: 10 },
  optionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: LIGHT_BG, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingVertical: 16, paddingHorizontal: 16,
  },
  optionRowActive: { borderColor: GREEN, backgroundColor: 'rgba(12,158,84,0.05)' },
  optionLabel: { fontSize: 15, fontWeight: '600', color: NAVY },
  optionLabelActive: { color: GREEN },
  optionSub: { fontSize: 12, color: SLATE, marginTop: 2 },
  radio: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  radioActive: { borderColor: GREEN },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: GREEN },

  // ── Shared input ────────────────────────────────────────────────────────────
  otherInput: {
    borderWidth: 1.5, borderColor: BORDER, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: NAVY,
    backgroundColor: WHITE,
  },

  // ── Footer ──────────────────────────────────────────────────────────────────
  footer: {
    paddingHorizontal: 20, paddingBottom: Platform.OS === 'ios' ? 16 : 24,
    paddingTop: 12, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: WHITE,
    gap: 8,
  },
  continueBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 8,
    elevation: 4,
  },
  continueBtnOutline: {
    backgroundColor: WHITE, borderWidth: 1.5, borderColor: GREEN,
    shadowOpacity: 0, elevation: 0,
  },
  continueBtnText: { fontSize: 16, fontWeight: '800', color: WHITE },
  continueBtnTextOutline: { color: GREEN },
  footerNote: { textAlign: 'center', fontSize: 12, color: SLATE },
});
