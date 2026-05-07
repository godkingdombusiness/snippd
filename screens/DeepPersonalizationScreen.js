// screens/DeepPersonalizationScreen.js
// 6-step deep personalization: stores → shopping habits → cooking → foods liked → foods avoided → weekly budget
// Saves to user_persona + navigates to PersonaReveal

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, KeyboardAvoidingView, Animated, Platform,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.10)';
const GREEN_MED  = 'rgba(12,158,84,0.18)';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const NAVY       = '#1A237E';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const SLATE_SOFT = '#F8FAFC';
const TOTAL_STEPS = 6;

// ── Step 0: Stores ────────────────────────────────────────────────────────────
const STORES = [
  { key: 'walmart',     label: 'Walmart',        icon: 'shopping-cart' },
  { key: 'target',      label: 'Target',         icon: 'target' },
  { key: 'publix',      label: 'Publix',         icon: 'shopping-bag' },
  { key: 'kroger',      label: 'Kroger',         icon: 'shopping-bag' },
  { key: 'aldi',        label: 'ALDI',           icon: 'tag' },
  { key: 'costco',      label: 'Costco',         icon: 'package' },
  { key: 'sams',        label: "Sam's Club",     icon: 'package' },
  { key: 'whole_foods', label: 'Whole Foods',    icon: 'heart' },
  { key: 'trader_joes', label: "Trader Joe's",   icon: 'star' },
  { key: 'heb',         label: 'H-E-B',          icon: 'shopping-cart' },
  { key: 'meijer',      label: 'Meijer',         icon: 'shopping-cart' },
  { key: 'safeway',     label: 'Safeway / Albertsons', icon: 'shopping-cart' },
  { key: 'sprouts',     label: 'Sprouts',        icon: 'feather' },
  { key: 'amazon_fresh',label: 'Amazon Fresh',   icon: 'truck' },
  { key: 'dollar_gen',  label: 'Dollar General', icon: 'dollar-sign' },
  { key: 'other_store', label: 'Other',          icon: 'more-horizontal' },
];

// ── Step 1: Shopping habits ───────────────────────────────────────────────────
const FREQUENCIES = [
  { key: 'daily',      label: 'A few times a week' },
  { key: 'weekly',     label: 'Once a week' },
  { key: 'biweekly',   label: 'Every 2 weeks' },
  { key: 'monthly',    label: 'Once a month' },
];
const SHOP_MODES = [
  { key: 'instore',   label: 'In-store only',        icon: 'map-pin' },
  { key: 'pickup',    label: 'Curbside pickup',       icon: 'truck' },
  { key: 'delivery',  label: 'Delivery',              icon: 'package' },
  { key: 'mix',       label: 'Mix of everything',     icon: 'shuffle' },
];

// ── Step 2: Cooking style ─────────────────────────────────────────────────────
const COOKING_STYLES = [
  { key: 'from_scratch', label: 'From Scratch',         icon: 'tool' },
  { key: 'meal_prep',    label: 'Meal Prep / Batch',    icon: 'layers' },
  { key: 'meal_kits',    label: 'Meal Kits',            icon: 'box' },
  { key: 'quick',        label: 'Quick & Easy (30 min)',icon: 'clock' },
  { key: 'slow_cooker',  label: 'Slow Cooker / Instant Pot', icon: 'thermometer' },
  { key: 'frozen',       label: 'Frozen / Convenience', icon: 'wind' },
  { key: 'grill',        label: 'Grill / BBQ',          icon: 'flame' },
  { key: 'takeout',      label: 'Mostly Takeout',       icon: 'coffee' },
];

// ── Step 3: Foods loved ───────────────────────────────────────────────────────
const FOODS_LOVED = [
  { key: 'chicken',    label: 'Chicken',         group: 'Proteins' },
  { key: 'beef',       label: 'Beef',            group: 'Proteins' },
  { key: 'fish',       label: 'Fish & Seafood',  group: 'Proteins' },
  { key: 'pork',       label: 'Pork',            group: 'Proteins' },
  { key: 'plant',      label: 'Plant-Based',     group: 'Proteins' },
  { key: 'fruits',     label: 'Fruits',          group: 'Produce' },
  { key: 'veggies',    label: 'Vegetables',      group: 'Produce' },
  { key: 'herbs',      label: 'Fresh Herbs',     group: 'Produce' },
  { key: 'rice',       label: 'Rice & Grains',   group: 'Pantry' },
  { key: 'pasta',      label: 'Pasta',           group: 'Pantry' },
  { key: 'beans',      label: 'Beans & Legumes', group: 'Pantry' },
  { key: 'cheese',     label: 'Cheese',          group: 'Dairy' },
  { key: 'yogurt',     label: 'Yogurt',          group: 'Dairy' },
  { key: 'milk',       label: 'Milk',            group: 'Dairy' },
  { key: 'snacks',     label: 'Snacks',          group: 'Extras' },
  { key: 'breakfast',  label: 'Breakfast Items', group: 'Extras' },
  { key: 'intl',       label: 'International',   group: 'Extras' },
  { key: 'comfort',    label: 'Comfort Food',    group: 'Extras' },
];

// ── Step 4: Foods to avoid ────────────────────────────────────────────────────
const FOODS_AVOIDED = [
  { key: 'tree_nuts',  label: 'Tree Nuts' },
  { key: 'peanuts',    label: 'Peanuts' },
  { key: 'gluten',     label: 'Gluten / Wheat' },
  { key: 'dairy_av',   label: 'Dairy' },
  { key: 'eggs_av',    label: 'Eggs' },
  { key: 'shellfish',  label: 'Shellfish' },
  { key: 'fish_av',    label: 'Fish' },
  { key: 'soy',        label: 'Soy' },
  { key: 'pork_av',    label: 'Pork' },
  { key: 'beef_av',    label: 'Beef' },
  { key: 'spicy',      label: 'Spicy Foods' },
  { key: 'cilantro',   label: 'Cilantro' },
  { key: 'processed',  label: 'Processed Foods' },
  { key: 'artificial', label: 'Artificial Sweeteners' },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function DeepPersonalizationScreen({ route, navigation }) {
  const existingData = route?.params ?? {};

  const [step,              setStep]              = useState(0);
  const [selectedStores,    setSelectedStores]    = useState([]);
  const [shopFrequency,     setShopFrequency]     = useState(null);
  const [shopMode,          setShopMode]          = useState(null);
  const [cookingStyle,      setCookingStyle]      = useState([]);
  const [foodsLiked,        setFoodsLiked]        = useState([]);
  const [foodsAvoided,      setFoodsAvoided]      = useState([]);
  const [avoidOther,        setAvoidOther]        = useState('');
  const [weeklyBudget,      setWeeklyBudget]      = useState('');
  const [saving,            setSaving]            = useState(false);

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goToStep = useCallback((next) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -18, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setStep(next);
      slideAnim.setValue(18);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const canAdvance = useCallback(() => {
    if (step === 0) return selectedStores.length > 0;
    if (step === 1) return !!shopFrequency && !!shopMode;
    if (step === 2) return cookingStyle.length > 0;
    if (step === 3) return foodsLiked.length > 0;
    if (step === 4) return true; // optional — can skip
    if (step === 5) return weeklyBudget.trim().length > 0 && !isNaN(Number(weeklyBudget));
    return false;
  }, [step, selectedStores, shopFrequency, shopMode, cookingStyle, foodsLiked, weeklyBudget]);

  const toggleItem = (list, setList, key) => {
    setList(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const handleFinish = useCallback(async () => {
    setSaving(true);
    const budgetCents = Math.round(parseFloat(weeklyBudget) * 100) || 0;
    const payload = {
      preferred_stores:    selectedStores,
      shopping_frequency:  shopFrequency,
      shopping_mode:       shopMode,
      cooking_preferences: cookingStyle,
      foods_liked:         foodsLiked,
      foods_avoided:       [...foodsAvoided, ...(avoidOther.trim() ? ['other:' + avoidOther.trim()] : [])],
      weekly_budget_cents: budgetCents,
    };
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('user_persona').upsert(
          { user_id: user.id, ...payload, briefing_completed: true },
          { onConflict: 'user_id' }
        );
      }
    } catch (_) {}
    setSaving(false);
    navigation.navigate('PersonaReveal', {
      ...existingData,
      ...payload,
      weeklyBudget: parseFloat(weeklyBudget) || 0,
    });
  }, [
    selectedStores, shopFrequency, shopMode, cookingStyle,
    foodsLiked, foodsAvoided, avoidOther, weeklyBudget,
    navigation, existingData,
  ]);

  // ── Step renderers ────────────────────────────────────────────────────────

  function StepStores() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>1 of 6 — Your Stores</Text>
        <Text style={styles.headline}>Where do{'\n'}you shop?</Text>
        <Text style={styles.subtitle}>
          Pick all that apply — I'll watch prices and activate coupons at every one.
        </Text>
        <View style={styles.chipGrid}>
          {STORES.map(s => {
            const active = selectedStores.includes(s.key);
            return (
              <TouchableOpacity
                key={s.key}
                style={[styles.storeChip, active && styles.storeChipActive]}
                onPress={() => toggleItem(selectedStores, setSelectedStores, s.key)}
                activeOpacity={0.8}
              >
                <Feather name={s.icon} size={14} color={active ? WHITE : GREEN} />
                <Text style={[styles.storeChipText, active && styles.storeChipTextActive]}>
                  {s.label}
                </Text>
                {active && <Feather name="check" size={12} color={WHITE} />}
              </TouchableOpacity>
            );
          })}
        </View>
        {selectedStores.length > 0 && (
          <View style={styles.selectionNote}>
            <Feather name="map-pin" size={13} color={GREEN} />
            <Text style={styles.selectionNoteText}>
              {selectedStores.length} store{selectedStores.length > 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function StepHabits() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>2 of 6 — Shopping Habits</Text>
        <Text style={styles.headline}>How do{'\n'}you shop?</Text>
        <Text style={styles.subtitle}>
          This helps me time your alerts and stack deals before you leave.
        </Text>

        <Text style={styles.sectionHeader}>How often?</Text>
        <View style={styles.radioGroup}>
          {FREQUENCIES.map(f => {
            const active = shopFrequency === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.radioRow, active && styles.radioRowActive]}
                onPress={() => setShopFrequency(f.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.radioCircle, active && styles.radioCircleActive]}>
                  {active && <View style={styles.radioInner} />}
                </View>
                <Text style={[styles.radioLabel, active && styles.radioLabelActive]}>
                  {f.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionHeader, { marginTop: 20 }]}>How do you shop?</Text>
        <View style={styles.modeGrid}>
          {SHOP_MODES.map(m => {
            const active = shopMode === m.key;
            return (
              <TouchableOpacity
                key={m.key}
                style={[styles.modeCard, active && styles.modeCardActive]}
                onPress={() => setShopMode(m.key)}
                activeOpacity={0.8}
              >
                <Feather name={m.icon} size={20} color={active ? WHITE : GREEN} />
                <Text style={[styles.modeCardText, active && styles.modeCardTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    );
  }

  function StepCooking() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>3 of 6 — Cooking Style</Text>
        <Text style={styles.headline}>How do{'\n'}you cook?</Text>
        <Text style={styles.subtitle}>
          This tells me whether to prioritize fresh ingredients, pantry deals, or convenience items.
        </Text>
        <View style={styles.cookGrid}>
          {COOKING_STYLES.map(c => {
            const active = cookingStyle.includes(c.key);
            return (
              <TouchableOpacity
                key={c.key}
                style={[styles.cookCard, active && styles.cookCardActive]}
                onPress={() => toggleItem(cookingStyle, setCookingStyle, c.key)}
                activeOpacity={0.8}
              >
                <Feather name={c.icon} size={22} color={active ? WHITE : GREEN} />
                <Text style={[styles.cookCardText, active && styles.cookCardTextActive]}>
                  {c.label}
                </Text>
                {active && (
                  <View style={styles.cookCheck}>
                    <Feather name="check" size={11} color={GREEN} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
        {cookingStyle.length > 0 && (
          <View style={styles.selectionNote}>
            <Feather name="check-circle" size={13} color={GREEN} />
            <Text style={styles.selectionNoteText}>
              {cookingStyle.length} style{cookingStyle.length > 1 ? 's' : ''} selected
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function StepFoodsLiked() {
    const groups = [...new Set(FOODS_LOVED.map(f => f.group))];
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>4 of 6 — Foods You Love</Text>
        <Text style={styles.headline}>What does your{'\n'}household love?</Text>
        <Text style={styles.subtitle}>
          I'll make sure your favorites are always stacked with the best deals.
        </Text>
        {groups.map(group => (
          <View key={group} style={styles.foodGroup}>
            <Text style={styles.foodGroupLabel}>{group}</Text>
            <View style={styles.foodChipRow}>
              {FOODS_LOVED.filter(f => f.group === group).map(f => {
                const active = foodsLiked.includes(f.key);
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.foodChip, active && styles.foodChipActive]}
                    onPress={() => toggleItem(foodsLiked, setFoodsLiked, f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.foodChipText, active && styles.foodChipTextActive]}>
                      {f.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}
        {foodsLiked.length > 0 && (
          <View style={styles.selectionNote}>
            <Feather name="heart" size={13} color={GREEN} />
            <Text style={styles.selectionNoteText}>
              {foodsLiked.length} item{foodsLiked.length > 1 ? 's' : ''} — I'll prioritize these
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function StepFoodsAvoided() {
    return (
      <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.stepLabel}>5 of 6 — Foods to Avoid</Text>
        <Text style={styles.headline}>Anything{'\n'}off-limits?</Text>
        <Text style={styles.subtitle}>
          Allergies, dietary restrictions, or just stuff nobody eats. I'll filter these out automatically.
        </Text>
        <View style={styles.foodChipRow} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
          {FOODS_AVOIDED.map(f => {
            const active = foodsAvoided.includes(f.key);
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.avoidChip, active && styles.avoidChipActive]}
                onPress={() => toggleItem(foodsAvoided, setFoodsAvoided, f.key)}
                activeOpacity={0.8}
              >
                <Text style={[styles.avoidChipText, active && styles.avoidChipTextActive]}>
                  {f.label}
                </Text>
                {active && <Feather name="x" size={11} color={WHITE} />}
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.sectionHeader}>Anything else? (optional)</Text>
        <TextInput
          style={[styles.otherInput, Platform.OS === 'web' && { outline: 'none' }]}
          value={avoidOther}
          onChangeText={setAvoidOther}
          placeholder="e.g. sesame, MSG, artificial dyes..."
          placeholderTextColor={SLATE}
          autoCapitalize="none"
          returnKeyType="done"
        />
        <Text style={styles.skipHint}>No restrictions? Skip this step — tap Next.</Text>
      </ScrollView>
    );
  }

  function StepBudget() {
    const parsed = parseFloat(weeklyBudget);
    const isValid = !isNaN(parsed) && parsed > 0;
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <ScrollView contentContainerStyle={styles.stepContent} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepLabel}>6 of 6 — Weekly Budget</Text>
          <Text style={styles.headline}>What's your{'\n'}grocery budget?</Text>
          <Text style={styles.subtitle}>
            Not a range — the actual dollar amount you want to work with this week. I'll build your savings plan around this number.
          </Text>

          <View style={styles.budgetInputWrap}>
            <Text style={styles.budgetDollar}>$</Text>
            <TextInput
              style={[styles.budgetInput, Platform.OS === 'web' && { outline: 'none' }]}
              value={weeklyBudget}
              onChangeText={text => setWeeklyBudget(text.replace(/[^0-9.]/g, ''))}
              placeholder="0"
              placeholderTextColor="rgba(26,35,126,0.25)"
              keyboardType="decimal-pad"
              returnKeyType="done"
              autoFocus={Platform.OS !== 'web'}
              selectionColor={GREEN}
              cursorColor={GREEN}
            />
          </View>

          {isValid && (
            <View style={styles.budgetPreview}>
              <Feather name="trending-up" size={14} color={GREEN} />
              <Text style={styles.budgetPreviewText}>
                ${parsed.toFixed(0)}/week · ~${Math.round(parsed * 4.33).toLocaleString()}/month
              </Text>
            </View>
          )}

          <View style={styles.budgetTips}>
            {[
              "I'll find deals that stretch this further",
              'Your stack will always fit inside this budget',
              "You can update this any time in settings",
            ].map((tip, i) => (
              <View key={i} style={styles.budgetTipRow}>
                <Feather name="check" size={13} color={GREEN} />
                <Text style={styles.budgetTipText}>{tip}</Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Progress bar ──────────────────────────────────────────────────────────
  const progress = (step + 1) / TOTAL_STEPS;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={MINT} />

      {/* Header */}
      <View style={styles.header}>
        {step > 0 ? (
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => goToStep(step - 1)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
        ) : (
          <View style={styles.backBtn} />
        )}
        <View style={styles.progressBarWrap}>
          <View style={styles.progressBarTrack}>
            <Animated.View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
          <Text style={styles.progressLabel}>{step + 1} / {TOTAL_STEPS}</Text>
        </View>
        <View style={styles.backBtn} />
      </View>

      {/* Step content — animated */}
      <Animated.View
        style={[styles.animWrap, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}
      >
        {step === 0 && StepStores()}
        {step === 1 && StepHabits()}
        {step === 2 && StepCooking()}
        {step === 3 && StepFoodsLiked()}
        {step === 4 && StepFoodsAvoided()}
        {step === 5 && StepBudget()}
      </Animated.View>

      {/* Footer nav */}
      <View style={styles.footer}>
        {(step === 4) && (
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
            if (step < TOTAL_STEPS - 1) goToStep(step + 1);
            else handleFinish();
          }}
          disabled={!canAdvance() || saving}
          activeOpacity={0.88}
        >
          <Text style={styles.nextBtnText}>
            {step === TOTAL_STEPS - 1
              ? (saving ? 'Building your profile…' : 'Build My Profile')
              : 'Next'}
          </Text>
          {!saving && (
            <Feather
              name="arrow-right"
              size={16}
              color={canAdvance() ? WHITE : SLATE}
              style={{ marginLeft: 6 }}
            />
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: MINT },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBarWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  progressBarTrack: {
    width: '100%',
    height: 4,
    backgroundColor: BORDER,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: GREEN,
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 11,
    color: SLATE,
    fontWeight: '600',
    letterSpacing: 0.5,
  },

  animWrap: { flex: 1 },

  stepContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 120,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  stepLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: NAVY,
    lineHeight: 34,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: SLATE,
    lineHeight: 21,
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: NAVY,
    letterSpacing: 0.5,
    marginBottom: 10,
    textTransform: 'uppercase',
  },

  // ── Store chips ───────────────────────────────────────────────────────────
  chipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  storeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: WHITE,
  },
  storeChipActive: { backgroundColor: GREEN },
  storeChipText: { fontSize: 13, fontWeight: '600', color: GREEN },
  storeChipTextActive: { color: WHITE },

  // ── Shopping habits ───────────────────────────────────────────────────────
  radioGroup: { gap: 8, marginBottom: 8 },
  radioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  radioRowActive: { borderColor: GREEN, backgroundColor: GREEN_SOFT },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: { borderColor: GREEN },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GREEN,
  },
  radioLabel: { fontSize: 14, fontWeight: '600', color: NAVY, flex: 1 },
  radioLabelActive: { color: GREEN },
  modeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  modeCard: {
    width: '47%',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 18,
    paddingHorizontal: 14,
    alignItems: 'center',
    gap: 8,
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.05)' },
      default: { elevation: 1 },
    }),
  },
  modeCardActive: { borderColor: GREEN, backgroundColor: GREEN },
  modeCardText: { fontSize: 13, fontWeight: '600', color: NAVY, textAlign: 'center' },
  modeCardTextActive: { color: WHITE },

  // ── Cooking style ─────────────────────────────────────────────────────────
  cookGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  cookCard: {
    width: '47%',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 6,
    position: 'relative',
    ...Platform.select({
      web: { boxShadow: '0 2px 6px rgba(0,0,0,0.05)' },
      default: { elevation: 1 },
    }),
  },
  cookCardActive: { borderColor: GREEN, backgroundColor: GREEN },
  cookCardText: {
    fontSize: 12,
    fontWeight: '600',
    color: NAVY,
    textAlign: 'center',
    lineHeight: 16,
  },
  cookCardTextActive: { color: WHITE },
  cookCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Foods ─────────────────────────────────────────────────────────────────
  foodGroup: { marginBottom: 16 },
  foodGroupLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: SLATE,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  foodChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  foodChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  foodChipActive: { backgroundColor: GREEN, borderColor: GREEN },
  foodChipText: { fontSize: 13, fontWeight: '600', color: NAVY },
  foodChipTextActive: { color: WHITE },

  // ── Avoid chips ───────────────────────────────────────────────────────────
  avoidChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FB5B5B',
    backgroundColor: WHITE,
  },
  avoidChipActive: { backgroundColor: '#FB5B5B' },
  avoidChipText: { fontSize: 13, fontWeight: '600', color: '#FB5B5B' },
  avoidChipTextActive: { color: WHITE },
  otherInput: {
    backgroundColor: WHITE,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: NAVY,
    marginBottom: 12,
  },
  skipHint: {
    fontSize: 12,
    color: SLATE,
    textAlign: 'center',
    marginTop: 4,
  },

  // ── Budget ────────────────────────────────────────────────────────────────
  budgetInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderWidth: 2,
    borderColor: GREEN,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
    marginBottom: 16,
    ...Platform.select({
      web: { boxShadow: '0 0 0 4px rgba(12,158,84,0.12)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.14, shadowRadius: 8, elevation: 3 },
    }),
  },
  budgetDollar: {
    fontSize: 36,
    fontWeight: '900',
    color: NAVY,
    marginRight: 4,
  },
  budgetInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: '900',
    color: NAVY,
    paddingVertical: 0,
    ...Platform.select({
      web: { outline: 'none', borderWidth: 0 },
    }),
  },
  budgetPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GREEN_SOFT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 24,
  },
  budgetPreviewText: { fontSize: 13, fontWeight: '600', color: GREEN },
  budgetTips: { gap: 10 },
  budgetTipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  budgetTipText: { fontSize: 14, color: SLATE, lineHeight: 20, flex: 1 },

  // ── Shared ────────────────────────────────────────────────────────────────
  selectionNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GREEN_SOFT,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 8,
  },
  selectionNoteText: { fontSize: 13, color: GREEN, fontWeight: '600' },

  // ── Footer ────────────────────────────────────────────────────────────────
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
  skipBtn: { paddingHorizontal: 12, paddingVertical: 14 },
  skipBtnText: { fontSize: 14, color: SLATE, fontWeight: '500' },
  nextBtn: {
    flex: 1,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  nextBtnDisabled: { backgroundColor: BORDER },
  nextBtnText: { fontSize: 16, fontWeight: '700', color: WHITE },
});
