/**
 * OnboardingScreen — 12-step premium onboarding.
 * Step-machine: single component, `step` state, render functions called as {steps[step]()}.
 * No emojis. Stash uses clean "S" monogram.
 */

import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, TextInput,
  StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';
const CORAL  = '#fb5b5b';

const TOTAL_STEPS = 12;

// ── Atom components (module-scope — never define inside the parent component) ──

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashAvatar}>
        <Text style={styles.stashAvatarText}>S</Text>
      </View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function StepHeader({ current, total, onBack }) {
  return (
    <View style={styles.stepHeader}>
      <TouchableOpacity
        style={styles.backBtn}
        onPress={onBack}
        disabled={current === 0}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Feather name="arrow-left" size={20} color={current === 0 ? 'transparent' : NAVY} />
      </TouchableOpacity>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${((current + 1) / total) * 100}%` }]} />
      </View>
      <Text style={styles.stepCount}>{current + 1}/{total}</Text>
    </View>
  );
}

function PrimaryBtn({ label, onPress, loading }) {
  return (
    <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.8} disabled={!!loading}>
      {loading
        ? <ActivityIndicator color={WHITE} size="small" />
        : <Text style={styles.primaryBtnText}>{label}</Text>
      }
    </TouchableOpacity>
  );
}

function SelectCard({ label, sublabel, selected, onPress, icon }) {
  return (
    <TouchableOpacity
      style={[styles.selectCard, selected && styles.selectCardActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {icon ? (
        <View style={[styles.selectCardIcon, selected && styles.selectCardIconActive]}>
          <Feather name={icon} size={18} color={selected ? WHITE : GREEN} />
        </View>
      ) : null}
      <View style={styles.selectCardBody}>
        <Text style={[styles.selectCardLabel, selected && styles.selectCardLabelActive]}>{label}</Text>
        {sublabel ? (
          <Text style={[styles.selectCardSub, selected && styles.selectCardSubActive]}>{sublabel}</Text>
        ) : null}
      </View>
      {selected ? <Feather name="check-circle" size={18} color={WHITE} /> : null}
    </TouchableOpacity>
  );
}

function Pill({ label, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillActive]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.pillText, selected && styles.pillTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SectionLabel({ text }) {
  return <Text style={styles.sectionLabel}>{text}</Text>;
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [budgetWarning, setBudgetWarning] = useState('');
  const [data, setData] = useState({
    weeklyBudget: '',
    groceryPct: 70,
    householdSize: 2,
    hasKids: false,
    foodGoals: [],
    stores: [],
    avoids: [],
    allergyAcknowledged: false,
    cookingDays: 3,
    cookingTime: '30',
    cookingSkill: 'medium',
    eatOutDays: 2,
    eatOutTypes: [],
    brandSwap: 'sometimes',
    stashStyle: 'smart',
  });

  function update(key, value) {
    setData(prev => ({ ...prev, [key]: value }));
  }

  function toggleArray(key, value) {
    setData(prev => {
      const arr = prev[key];
      return {
        ...prev,
        [key]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  }

  function next() {
    if (step < TOTAL_STEPS - 1) setStep(s => s + 1);
  }

  function back() {
    if (step > 0) setStep(s => s - 1);
  }

  async function finishOnboarding() {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const budget = parseFloat(data.weeklyBudget) || 0;
        await supabase.from('profiles').upsert({
          user_id: user.id,
          weekly_budget: budget,
          grocery_pct: data.groceryPct,
          household_size: data.householdSize,
          has_kids: data.hasKids,
          food_goals: data.foodGoals,
          preferred_stores: data.stores,
          avoids: data.avoids,
          cooking_days: data.cookingDays,
          cooking_time: data.cookingTime,
          cooking_skill: data.cookingSkill,
          eat_out_days: data.eatOutDays,
          eat_out_types: data.eatOutTypes,
          brand_swap: data.brandSwap,
          stash_style: data.stashStyle,
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
        await supabase.from('user_persona').upsert({
          user_id: user.id,
          status: 'onboarded',
          onboarding_completed: true,
        }, { onConflict: 'user_id' });
      }
    } catch (e) {
      console.warn('[Onboarding] save error', e);
    }
    setSaving(false);
    navigation.reset({ index: 0, routes: [{ name: 'PersonalizationSummary' }] });
  }

  // ── Step 0: Welcome ──────────────────────────────────────────────────────────
  function renderWelcome() {
    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeCenter}>
          <View style={styles.welcomeBadge}>
            <Text style={styles.welcomeBadgeText}>S</Text>
          </View>
          <Text style={styles.headline}>Meet Stash.</Text>
          <Text style={styles.sub}>
            Your personal grocery concierge. I learn your budget, your stores, and your household — then I build your weekly plan, clip your deals, and track your savings automatically.
          </Text>
        </View>
        <StashBubble message="This setup takes about 3 minutes. The more you tell me, the smarter your plan gets." />
        <PrimaryBtn label="Let's get started" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 1: Budget ───────────────────────────────────────────────────────────
  function renderBudget() {
    function handleChange(text) {
      const cleaned = text.replace(/[^0-9]/g, '');
      update('weeklyBudget', cleaned);
      const val = parseInt(cleaned, 10);
      if (!cleaned) { setBudgetWarning(''); return; }
      if (val < 25) setBudgetWarning('Plans work best with at least $25 a week.');
      else if (val > 700) setBudgetWarning('That seems high — double-check your weekly amount.');
      else setBudgetWarning('');
    }

    const QUICK = ['100', '150', '200', '250', '300'];

    return (
      <KeyboardAvoidingView style={styles.stepContent} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <Text style={styles.headline}>What's your weekly food budget?</Text>
          <Text style={styles.sub}>Include groceries and any eating out. I'll help you stay inside it.</Text>

          <View style={styles.budgetRow}>
            <Text style={styles.budgetDollar}>$</Text>
            <TextInput
              style={styles.budgetInput}
              keyboardType="number-pad"
              value={data.weeklyBudget}
              onChangeText={handleChange}
              placeholder="0"
              placeholderTextColor={BORDER}
              maxLength={4}
              autoFocus
            />
            <Text style={styles.budgetUnit}>/week</Text>
          </View>

          {budgetWarning ? <Text style={styles.budgetWarning}>{budgetWarning}</Text> : null}

          <SectionLabel text="Common budgets" />
          <View style={styles.pillRow}>
            {QUICK.map(q => (
              <Pill
                key={q}
                label={`$${q}`}
                selected={data.weeklyBudget === q}
                onPress={() => { update('weeklyBudget', q); setBudgetWarning(''); }}
              />
            ))}
          </View>

          <StashBubble message="I won't judge your number. I'll just build the smartest plan for it." />
          <PrimaryBtn label="Continue" onPress={next} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── Step 2: Budget Split ─────────────────────────────────────────────────────
  function renderBudgetSplit() {
    const SPLITS = [
      { label: 'Mostly groceries',   sub: '80% groceries / 20% eating out', grocery: 80, icon: 'shopping-bag' },
      { label: 'Balanced split',     sub: '70% groceries / 30% eating out', grocery: 70, icon: 'sliders' },
      { label: 'Equal split',        sub: '50% groceries / 50% eating out', grocery: 50, icon: 'activity' },
      { label: 'Mostly eating out',  sub: '30% groceries / 70% eating out', grocery: 30, icon: 'coffee' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>How do you split your budget?</Text>
        <Text style={styles.sub}>I'll use this to balance your grocery plan and eat-out recommendations.</Text>
        <View style={styles.cardList}>
          {SPLITS.map(s => (
            <SelectCard
              key={s.grocery}
              label={s.label}
              sublabel={s.sub}
              selected={data.groceryPct === s.grocery}
              onPress={() => update('groceryPct', s.grocery)}
              icon={s.icon}
            />
          ))}
        </View>
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 3: Household ────────────────────────────────────────────────────────
  function renderHousehold() {
    const SIZES = [1, 2, 3, 4, 5, 6];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>Who are you shopping for?</Text>
        <Text style={styles.sub}>I'll scale portion sizes and quantities to fit your household.</Text>

        <SectionLabel text="Household size" />
        <View style={styles.pillRow}>
          {SIZES.map(n => (
            <Pill
              key={n}
              label={n === 6 ? '6+' : String(n)}
              selected={data.householdSize === n}
              onPress={() => update('householdSize', n)}
            />
          ))}
        </View>

        <SectionLabel text="Any kids at home?" />
        <View style={styles.cardList}>
          <SelectCard
            label="Yes, I have kids"
            sublabel="I'll include family-friendly options"
            selected={data.hasKids}
            onPress={() => update('hasKids', true)}
            icon="users"
          />
          <SelectCard
            label="No kids"
            sublabel="Adult-focused meal planning"
            selected={!data.hasKids}
            onPress={() => update('hasKids', false)}
            icon="user"
          />
        </View>

        <StashBubble message="Larger households often save more per person. I'll factor this into every plan." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 4: Food Goals ───────────────────────────────────────────────────────
  function renderFoodGoals() {
    const GOALS = [
      { id: 'save_money',      label: 'Save as much as possible' },
      { id: 'high_protein',    label: 'High protein meals' },
      { id: 'low_carb',        label: 'Low carb / fewer grains' },
      { id: 'quick_meals',     label: 'Quick, easy meals' },
      { id: 'variety',         label: 'Try new things' },
      { id: 'reduce_waste',    label: 'Reduce food waste' },
      { id: 'family_friendly', label: 'Kid-friendly meals' },
      { id: 'plant_based',     label: 'More plant-based options' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>What matters most to you?</Text>
        <Text style={styles.sub}>Pick any that apply. I'll use these to score and rank every plan I build.</Text>
        <View style={styles.pillWrap}>
          {GOALS.map(g => (
            <Pill
              key={g.id}
              label={g.label}
              selected={data.foodGoals.includes(g.id)}
              onPress={() => toggleArray('foodGoals', g.id)}
            />
          ))}
        </View>
        <StashBubble message="No wrong answers. This just helps me prioritize the right deals for you." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 5: Stores ───────────────────────────────────────────────────────────
  function renderStores() {
    const STORES = [
      { id: 'aldi',           label: 'Aldi',             sub: 'Best for staples and protein' },
      { id: 'publix',         label: 'Publix',           sub: 'Best for BOGO and produce' },
      { id: 'kroger',         label: 'Kroger',           sub: 'Digital coupons and loyalty deals' },
      { id: 'walmart',        label: 'Walmart',          sub: 'Everyday low prices' },
      { id: 'target',         label: 'Target',           sub: 'Circle deals and grocery pickup' },
      { id: 'trader_joes',    label: "Trader Joe's",     sub: 'Private label and seasonal items' },
      { id: 'whole_foods',    label: 'Whole Foods',      sub: 'Prime member discounts' },
      { id: 'dollar_general', label: 'Dollar General',   sub: 'Household staples and DG coupons' },
      { id: 'costco',         label: 'Costco',           sub: 'Bulk savings for larger households' },
      { id: 'food_lion',      label: 'Food Lion',        sub: 'MVP Card deals' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>Which stores do you shop at?</Text>
        <Text style={styles.sub}>Select all that you visit at least once a month.</Text>
        <View style={styles.cardList}>
          {STORES.map(s => (
            <SelectCard
              key={s.id}
              label={s.label}
              sublabel={s.sub}
              selected={data.stores.includes(s.id)}
              onPress={() => toggleArray('stores', s.id)}
              icon="map-pin"
            />
          ))}
        </View>
        <StashBubble message="I'll build your plan around the stores you actually use — no detours." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 6: Preferences and Allergies ───────────────────────────────────────
  function renderPreferencesAllergies() {
    const AVOIDS = [
      { id: 'gluten',    label: 'Gluten' },
      { id: 'dairy',     label: 'Dairy' },
      { id: 'nuts',      label: 'Tree Nuts' },
      { id: 'peanuts',   label: 'Peanuts' },
      { id: 'shellfish', label: 'Shellfish' },
      { id: 'pork',      label: 'Pork' },
      { id: 'beef',      label: 'Beef' },
      { id: 'soy',       label: 'Soy' },
      { id: 'eggs',      label: 'Eggs' },
      { id: 'fish',      label: 'Fish' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>Any foods to avoid?</Text>
        <Text style={styles.sub}>
          I'll filter these out of every recommendation — meals, deals, and plan suggestions.
        </Text>

        <View style={styles.pillWrap}>
          {AVOIDS.map(a => (
            <Pill
              key={a.id}
              label={a.label}
              selected={data.avoids.includes(a.id)}
              onPress={() => toggleArray('avoids', a.id)}
            />
          ))}
        </View>

        {data.avoids.length > 0 ? (
          <View style={styles.allergyNote}>
            <Feather name="alert-circle" size={14} color={CORAL} />
            <Text style={styles.allergyNoteText}>
              Snippd is a planning tool, not a medical guide. Always verify ingredient labels yourself, especially for severe allergies.
            </Text>
          </View>
        ) : null}

        {data.avoids.length > 0 ? (
          <TouchableOpacity
            style={styles.allergyAck}
            onPress={() => update('allergyAcknowledged', !data.allergyAcknowledged)}
            activeOpacity={0.75}
          >
            <View style={[styles.allergyCheckbox, data.allergyAcknowledged && styles.allergyCheckboxChecked]}>
              {data.allergyAcknowledged ? <Feather name="check" size={12} color={WHITE} /> : null}
            </View>
            <Text style={styles.allergyAckText}>I understand Snippd is a planning tool, not a medical guide.</Text>
          </TouchableOpacity>
        ) : null}

        <StashBubble message="You can always add more restrictions from your profile. Nothing is locked in." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 7: Cooking Style ────────────────────────────────────────────────────
  function renderCookingStyle() {
    const DAYS = [1, 2, 3, 4, 5, 6, 7];
    const TIMES = [
      { id: '15',  label: '15 min',  sub: 'Fast and simple' },
      { id: '30',  label: '30 min',  sub: 'Weeknight meals' },
      { id: '45',  label: '45 min',  sub: 'Casual cooking' },
      { id: '60+', label: '60+ min', sub: 'Weekend projects' },
    ];
    const SKILLS = [
      { id: 'beginner', label: 'Beginner',    sub: 'Simple recipes, few steps' },
      { id: 'medium',   label: 'Comfortable', sub: 'Confident with most recipes' },
      { id: 'advanced', label: 'Advanced',    sub: 'Complex techniques, fine cooking' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>How do you cook?</Text>
        <Text style={styles.sub}>I'll match your plan to how often and how long you actually cook.</Text>

        <SectionLabel text="How many nights a week do you cook at home?" />
        <View style={styles.pillRow}>
          {DAYS.map(d => (
            <Pill
              key={d}
              label={d === 7 ? 'Every day' : String(d)}
              selected={data.cookingDays === d}
              onPress={() => update('cookingDays', d)}
            />
          ))}
        </View>

        <SectionLabel text="How long are you willing to cook?" />
        <View style={styles.cardList}>
          {TIMES.map(t => (
            <SelectCard
              key={t.id}
              label={t.label}
              sublabel={t.sub}
              selected={data.cookingTime === t.id}
              onPress={() => update('cookingTime', t.id)}
              icon="clock"
            />
          ))}
        </View>

        <SectionLabel text="Cooking skill level" />
        <View style={styles.cardList}>
          {SKILLS.map(s => (
            <SelectCard
              key={s.id}
              label={s.label}
              sublabel={s.sub}
              selected={data.cookingSkill === s.id}
              onPress={() => update('cookingSkill', s.id)}
              icon="award"
            />
          ))}
        </View>

        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 8: Eat Out ──────────────────────────────────────────────────────────
  function renderEatOut() {
    const EAT_DAYS = [0, 1, 2, 3, 4, 5];
    const TYPES = [
      { id: 'fast_food',  label: 'Fast food' },
      { id: 'casual',     label: 'Casual sit-down' },
      { id: 'coffee',     label: 'Coffee shops' },
      { id: 'pizza',      label: 'Pizza and delivery' },
      { id: 'asian',      label: 'Asian cuisine' },
      { id: 'mexican',    label: 'Mexican' },
      { id: 'sandwiches', label: 'Sandwiches and subs' },
      { id: 'burgers',    label: 'Burgers' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>How often do you eat out?</Text>
        <Text style={styles.sub}>
          I'll plan your grocery list around the meals you're actually cooking — not the ones you won't.
        </Text>

        <SectionLabel text="Meals out per week (roughly)" />
        <View style={styles.pillRow}>
          {EAT_DAYS.map(d => (
            <Pill
              key={d}
              label={d === 0 ? 'Rarely' : d === 5 ? '5+' : String(d)}
              selected={data.eatOutDays === d}
              onPress={() => update('eatOutDays', d)}
            />
          ))}
        </View>

        <SectionLabel text="What kinds of places do you go to?" />
        <View style={styles.pillWrap}>
          {TYPES.map(t => (
            <Pill
              key={t.id}
              label={t.label}
              selected={data.eatOutTypes.includes(t.id)}
              onPress={() => toggleArray('eatOutTypes', t.id)}
            />
          ))}
        </View>

        <StashBubble message="Knowing where you eat out helps me suggest deals that actually fit your habits." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 9: Brand Swap ───────────────────────────────────────────────────────
  function renderBrandSwap() {
    const OPTIONS = [
      { id: 'always',    label: 'Always swap to store brand',        sub: 'Maximum savings — I trust the quality',   icon: 'package' },
      { id: 'sometimes', label: 'Swap when savings are significant', sub: 'I like name brands for a few things',     icon: 'sliders' },
      { id: 'never',     label: 'Keep name brands I know',           sub: 'Quality and familiarity over savings',    icon: 'shield' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>Store brand or name brand?</Text>
        <Text style={styles.sub}>I'll follow your preference when building your cart and clipping deals.</Text>
        <View style={styles.cardList}>
          {OPTIONS.map(o => (
            <SelectCard
              key={o.id}
              label={o.label}
              sublabel={o.sub}
              selected={data.brandSwap === o.id}
              onPress={() => update('brandSwap', o.id)}
              icon={o.icon}
            />
          ))}
        </View>
        <StashBubble message="You can always override this item by item. This is just my default when I have a choice." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 10: Stash Style ─────────────────────────────────────────────────────
  function renderStashStyle() {
    const OPTIONS = [
      { id: 'smart',      label: 'Smart mode',      sub: "Stash auto-clips top deals that match your plan — no decisions needed",   icon: 'zap' },
      { id: 'manual',     label: 'Manual mode',     sub: "Show me deals, I'll choose what to clip",                                 icon: 'list' },
      { id: 'aggressive', label: 'Maximum savings', sub: "Clip everything applicable — I'll sort through it myself",               icon: 'trending-up' },
    ];

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>How should Stash clip your deals?</Text>
        <Text style={styles.sub}>You can change this any time from your profile.</Text>
        <View style={styles.cardList}>
          {OPTIONS.map(o => (
            <SelectCard
              key={o.id}
              label={o.label}
              sublabel={o.sub}
              selected={data.stashStyle === o.id}
              onPress={() => update('stashStyle', o.id)}
              icon={o.icon}
            />
          ))}
        </View>
        <StashBubble message="Most people start with Smart mode and switch to Manual as they learn what they like." />
        <PrimaryBtn label="Continue" onPress={next} />
      </ScrollView>
    );
  }

  // ── Step 11: All Set ─────────────────────────────────────────────────────────
  function renderAllSet() {
    const budget = data.weeklyBudget ? `$${data.weeklyBudget}/week` : 'your budget';
    const storeCount = data.stores.length;
    const goalCount = data.foodGoals.length;

    return (
      <ScrollView style={styles.stepContent} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.allSetBadge}>
          <Feather name="check" size={32} color={GREEN} />
        </View>

        <Text style={styles.headline}>You're all set.</Text>
        <Text style={styles.sub}>
          I'm building your first grocery plan right now. It'll be ready in about 15 seconds.
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <Feather name="dollar-sign" size={16} color={GREEN} />
            <Text style={styles.summaryText}>Weekly budget: {budget}</Text>
          </View>
          {storeCount > 0 ? (
            <View style={styles.summaryRow}>
              <Feather name="map-pin" size={16} color={GREEN} />
              <Text style={styles.summaryText}>{storeCount} store{storeCount !== 1 ? 's' : ''} in your plan</Text>
            </View>
          ) : null}
          {goalCount > 0 ? (
            <View style={styles.summaryRow}>
              <Feather name="target" size={16} color={GREEN} />
              <Text style={styles.summaryText}>{goalCount} goal{goalCount !== 1 ? 's' : ''} locked in</Text>
            </View>
          ) : null}
          <View style={styles.summaryRow}>
            <Feather name="zap" size={16} color={GREEN} />
            <Text style={styles.summaryText}>Stash is ready to start clipping</Text>
          </View>
        </View>

        <StashBubble message="Your plan gets smarter every week. The more you use it, the better it fits your life." />
        <PrimaryBtn label="Build my plan" onPress={finishOnboarding} loading={saving} />
      </ScrollView>
    );
  }

  // ── Step registry ────────────────────────────────────────────────────────────
  const steps = [
    renderWelcome,
    renderBudget,
    renderBudgetSplit,
    renderHousehold,
    renderFoodGoals,
    renderStores,
    renderPreferencesAllergies,
    renderCookingStyle,
    renderEatOut,
    renderBrandSwap,
    renderStashStyle,
    renderAllSet,
  ];

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StepHeader current={step} total={TOTAL_STEPS} onBack={back} />
      {steps[step]()}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  stepContent: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },

  // Step header
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    gap: 12,
  },
  backBtn: { width: 32, alignItems: 'flex-start' },
  progressTrack: {
    flex: 1,
    height: 4,
    backgroundColor: BORDER,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: GREEN, borderRadius: 2 },
  stepCount: { fontSize: 12, color: GRAY, fontWeight: '500', width: 32, textAlign: 'right' },

  // Typography
  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28,
    color: NAVY,
    letterSpacing: -0.6,
    lineHeight: 34,
    marginBottom: 10,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 28 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 1.1,
    marginBottom: 12,
    marginTop: 8,
  },

  // Welcome
  welcomeCenter: { alignItems: 'center', paddingTop: 24, paddingBottom: 8 },
  welcomeBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 28,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  welcomeBadgeText: { fontSize: 36, fontWeight: '800', color: WHITE, letterSpacing: -1 },

  // Budget input
  budgetRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 6,
  },
  budgetDollar: { fontSize: 40, fontWeight: '300', color: NAVY },
  budgetInput: {
    fontSize: 64,
    fontWeight: '700',
    color: NAVY,
    minWidth: 80,
    textAlign: 'center',
    letterSpacing: -2,
    padding: 0,
  },
  budgetUnit: { fontSize: 18, color: GRAY, fontWeight: '300', marginBottom: 8 },
  budgetWarning: { fontSize: 13, color: CORAL, textAlign: 'center', marginBottom: 12, marginTop: 4 },

  // Pills
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  pill: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: WHITE,
  },
  pillActive: { backgroundColor: GREEN, borderColor: GREEN },
  pillText: { fontSize: 14, fontWeight: '500', color: NAVY },
  pillTextActive: { color: WHITE },

  // Card list
  cardList: { gap: 10, marginBottom: 24 },

  // SelectCard
  selectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  selectCardActive: { backgroundColor: GREEN, borderColor: GREEN },
  selectCardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  selectCardIconActive: { backgroundColor: 'rgba(255,255,255,0.2)' },
  selectCardBody: { flex: 1 },
  selectCardLabel: { fontSize: 15, fontWeight: '600', color: NAVY },
  selectCardLabelActive: { color: WHITE },
  selectCardSub: { fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 18 },
  selectCardSubActive: { color: 'rgba(255,255,255,0.8)' },

  // Stash bubble
  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  stashAvatar: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashAvatarText: { fontSize: 15, fontWeight: '800', color: WHITE, letterSpacing: -0.5 },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21, fontWeight: '400' },

  // Primary button
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 16,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  // Allergy
  allergyNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#FFF5F5',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 16,
  },
  allergyNoteText: { flex: 1, fontSize: 13, color: '#B91C1C', lineHeight: 19 },
  allergyAck: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 24,
  },
  allergyCheckbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: WHITE,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    marginTop: 1,
  },
  allergyCheckboxChecked: { backgroundColor: GREEN, borderColor: GREEN },
  allergyAckText: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 20 },

  // All Set
  allSetBadge: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    marginTop: 16,
    marginBottom: 28,
    borderWidth: 1.5, borderColor: '#C8E6C9',
  },
  summaryCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
    marginBottom: 24,
  },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  summaryText: { fontSize: 14, color: NAVY, fontWeight: '500', flex: 1 },
});
