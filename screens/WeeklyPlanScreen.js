/**
 * WeeklyPlanScreen — 5 home-cooked dinners built from this week's best deals.
 *
 * Sections (top to bottom):
 *   1. Hero Block          — forest green, week eyebrow, title, 3-chip stat row
 *   2. Anchor Bar          — restaurant cost comparison
 *   3. Section Label
 *   4. Meal List           — two-column rows (day/price | meal detail)
 *   5. Week Receipt        — line items + dark green footer
 *   6. Takeout Comparison  — red tint, savings kept
 *   7. Lock In Button
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

const { width } = Dimensions.get('window');

// ── Colors ─────────────────────────────────────────────────────
const FOREST    = '#0C7A3D';   // forest green — hero bg, lock btn
const GREEN     = '#0C9E54';   // dark green — price text
const TEAL      = '#0D9488';   // teal — subtext, total
const NAVY      = '#0D1B4B';
const WHITE     = '#FFFFFF';
const OFF_WHITE = '#F8F9FA';
const LIGHT_BG  = '#F0FAF5';
const BORDER    = '#E2E8F0';
const GRAY      = '#64748B';
const PURPLE    = '#7C3AED';
const RED_TINT  = '#FFF5F5';
const RED_TEXT  = '#C0392B';
const BLUE_BG   = '#EFF6FF';
const BLUE_TEXT = '#1D4ED8';

// ── Helpers ─────────────────────────────────────────────────────

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

/** Return "Week of Mon Apr 14 — Fri Apr 18" for the current week */
function getWeekRange() {
  const now   = new Date();
  const day   = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon   = new Date(now); mon.setDate(now.getDate() + diffToMon);
  const fri   = new Date(mon); fri.setDate(mon.getDate() + 4);
  const opts  = { month: 'short', day: 'numeric' };
  const m = mon.toLocaleDateString('en-US', opts);
  const f = fri.toLocaleDateString('en-US', opts);
  return `${m} — ${f}`;
}

// ── Deal-type chip colors ───────────────────────────────────────

const DEAL_COLORS = {
  BOGO:               { bg: '#DCFCE7', text: '#15803D' },
  SALE:               { bg: '#DBEAFE', text: '#1D4ED8' },
  DIGITAL_COUPON:     { bg: '#EDE9FE', text: '#6D28D9' },
  LOYALTY_PRICE:      { bg: '#FEF3C7', text: '#92400E' },
  MANUFACTURER_COUPON:{ bg: '#FCE7F3', text: '#9D174D' },
  MULTI:              { bg: '#FEE2E2', text: '#B91C1C' },
};

function dealChipStyle(dealType) {
  return DEAL_COLORS[dealType] || { bg: '#F1F5F9', text: GRAY };
}

// ── RPC helpers ─────────────────────────────────────────────────

const CACHE_KEY   = 'cached_weekly_plan';
const VIEWED_KEY  = 'weekly_plan_last_viewed';
const ADMIN_EMAIL = 'ddavis@getsnippd.com';
const DAY_ABBREV  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getNextWednesday() {
  const d = new Date();
  return d.toISOString().split('T')[0];
}

const toCents = (dollars) => Math.round((dollars || 0) * 100);

function buildMealName(protein, side, pantry) {
  const parts = [protein?.item_name, side?.item_name, pantry?.item_name].filter(Boolean);
  if (parts.length === 0) return 'Dinner';
  if (parts.length === 1) return parts[0];
  return parts[0] + ' with ' + parts.slice(1).join(' & ');
}

function buildCouponNote(protein, side, pantry) {
  const items = [protein, side, pantry].filter(Boolean);
  const couponItem = items.find(i => i.has_coupon);
  if (!couponItem) return null;
  return `Clip digital coupon for ${couponItem.item_name} before checkout`;
}

function buildMealCard(dinner, index) {
  const { night_index, protein, side, pantry_item } = dinner;
  const dayAbbrev = DAY_ABBREV[index] || 'Day';

  const toIngredient = (item) => {
    if (!item) return null;
    const dealType = item.is_bogo ? 'BOGO' : (item.sale_savings > 0 ? 'SALE' : null);
    return {
      name:       item.item_name,
      sale_cents: toCents(item.final_price),
      reg_cents:  toCents(item.base_price),
      deal_type:  dealType,
    };
  };

  const ingredients = [
    toIngredient(protein),
    toIngredient(side),
    toIngredient(pantry_item),
  ].filter(Boolean);

  const totalCal = (protein?.calories || 0) + (side?.calories || 0) + (pantry_item?.calories || 0);
  const cookMin  = protein?.category === 'meat' ? 30 : 20;

  return {
    id:          night_index,
    day:         dayAbbrev,
    leftovers:   false,
    name:        buildMealName(protein, side, pantry_item),
    ingredients,
    prep_min:    10,
    cook_min:    cookMin,
    cal:         totalCal,
    coupon:      buildCouponNote(protein, side, pantry_item),
  };
}

function getCalorieStatus(cal, calMin, calMax, headcount) {
  if (!cal || !calMin || !calMax || !headcount) return null;
  const perPerson  = cal / headcount;
  const targetMin  = calMin  / headcount;
  const targetMax  = calMax  / headcount;
  if (perPerson >= targetMin && perPerson <= targetMax) return 'on_target';
  if (perPerson >= targetMin * 0.8)                      return 'close';
  if (perPerson > targetMax * 1.2)                       return 'high';
  return null;
}

// ── Sample meal data (fallback when no Supabase data) ──────────

function buildSampleMeals(hh) {
  // All ingredient prices are the ingredient bill to make the meal
  // for `hh` people (no per-person multiplication — the price IS the household price)
  return [
    {
      id: 1, day: 'Mon', leftovers: false,
      name: 'Sheet Pan Lemon Herb Chicken Thighs',
      ingredients: [
        { name: 'Chicken Thighs 3lb', sale_cents: 699,  reg_cents: 1099, deal_type: 'BOGO' },
        { name: 'Baby Potatoes 1.5lb',sale_cents: 249,  reg_cents: 349,  deal_type: 'SALE' },
        { name: 'Lemons 3ct',         sale_cents: 149,  reg_cents: 199,  deal_type: 'SALE' },
        { name: 'Olive Oil (pantry)',  sale_cents: 0,    reg_cents: 0,    deal_type: null },
      ],
      prep_min: 10, cook_min: 35, cal: 490,
      coupon: null,
    },
    {
      id: 2, day: 'Tue', leftovers: true,
      name: 'Ground Beef Taco Bowl with Black Beans',
      ingredients: [
        { name: 'Ground Beef 1.5lb',  sale_cents: 649,  reg_cents: 899,  deal_type: 'SALE' },
        { name: 'Black Beans 2ct',    sale_cents: 199,  reg_cents: 279,  deal_type: 'MULTI' },
        { name: 'Shredded Cheese 8oz',sale_cents: 299,  reg_cents: 449,  deal_type: 'BOGO' },
        { name: 'Taco Seasoning',     sale_cents: 99,   reg_cents: 149,  deal_type: 'SALE' },
      ],
      prep_min: 10, cook_min: 20, cal: 540,
      coupon: null,
    },
    {
      id: 3, day: 'Wed', leftovers: false,
      name: 'Garlic Butter Salmon with Asparagus',
      ingredients: [
        { name: 'Salmon Fillets 1.5lb',sale_cents: 1099, reg_cents: 1499, deal_type: 'SALE' },
        { name: 'Asparagus 1lb',       sale_cents: 299,  reg_cents: 399,  deal_type: 'SALE' },
        { name: 'Butter (pantry)',      sale_cents: 0,    reg_cents: 0,    deal_type: null },
      ],
      prep_min: 8, cook_min: 18, cal: 420,
      coupon: 'Clip digital coupon in Publix app before checkout',
    },
    {
      id: 4, day: 'Thu', leftovers: true,
      name: 'Slow Cooker Chicken & White Bean Stew',
      ingredients: [
        { name: 'Chicken Breast 2lb', sale_cents: 799,  reg_cents: 1099, deal_type: 'SALE' },
        { name: 'White Beans 2ct',    sale_cents: 179,  reg_cents: 259,  deal_type: 'MULTI' },
        { name: 'Diced Tomatoes 2ct', sale_cents: 189,  reg_cents: 258,  deal_type: 'MULTI' },
        { name: 'Chicken Broth 32oz', sale_cents: 249,  reg_cents: 349,  deal_type: 'LOYALTY_PRICE' },
      ],
      prep_min: 15, cook_min: 240, cal: 380,
      coupon: null,
    },
    {
      id: 5, day: 'Fri', leftovers: false,
      name: 'Pork Tenderloin with Roasted Veggie Medley',
      ingredients: [
        { name: 'Pork Tenderloin 1.5lb',sale_cents: 749,  reg_cents: 1099, deal_type: 'BOGO' },
        { name: 'Broccoli Florets 12oz', sale_cents: 249,  reg_cents: 349,  deal_type: 'SALE' },
        { name: 'Bell Peppers 3ct',      sale_cents: 299,  reg_cents: 399,  deal_type: 'SALE' },
        { name: 'Olive Oil (pantry)',     sale_cents: 0,    reg_cents: 0,    deal_type: null },
      ],
      prep_min: 12, cook_min: 28, cal: 450,
      coupon: null,
    },
  ];
}

// ── Compute totals from meals ────────────────────────────────────

function computeMealPrice(meal) {
  return meal.ingredients.reduce((s, i) => s + i.sale_cents, 0);
}

function computeMealRegular(meal) {
  return meal.ingredients.reduce((s, i) => s + i.reg_cents, 0);
}

// ── Component ───────────────────────────────────────────────────

export default function WeeklyPlanScreen({ navigation, route }) {
  const params       = route?.params ?? {};
  const headcount    = params.headcount ?? 4;
  const nights       = params.nights    ?? 5;
  const focus        = params.focus     ?? 'none';

  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [meals,      setMeals]      = useState([]);
  const [noDeals,    setNoDeals]    = useState(false);
  const [loadError,  setLoadError]  = useState(false);
  const [isAdmin,    setIsAdmin]    = useState(false);
  const [householdSize, setHouseholdSize] = useState(headcount);
  const [platform,   setPlatform]   = useState('Snippd');
  const [planMeta,   setPlanMeta]   = useState({ calMin: null, calMax: null });

  // Skeleton pulse animation
  const skelOpacity = useRef(new Animated.Value(0.4)).current;
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(skelOpacity, { toValue: 1,   duration: 700, useNativeDriver: true }),
        Animated.timing(skelOpacity, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [skelOpacity]);

  const weekRange = getWeekRange();

  const load = useCallback(async (forceRefresh = false) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setMeals(buildSampleMeals(headcount)); setLoading(false); return; }

      // Check admin
      const { data: authUser } = await supabase.auth.getUser();
      if (authUser?.user?.email === ADMIN_EMAIL) setIsAdmin(true);

      // Try cache if not force-refreshing
      if (!forceRefresh) {
        try {
          const raw = await AsyncStorage.getItem(CACHE_KEY);
          if (raw) {
            const { data: cached, saved_at } = JSON.parse(raw);
            const ageDays = (Date.now() - new Date(saved_at).getTime()) / (1000 * 60 * 60 * 24);
            if (ageDays < 7 && cached?.dinners?.length) {
              applyPlan(cached, user);
              setLoading(false);
              setRefreshing(false);
              return;
            }
          }
        } catch { /* cache miss is fine */ }
      }

      const { data: plan, error: rpcError } = await supabase.rpc('get_weekly_plan', {
        p_user_id:   user.id,
        p_headcount: headcount,
        p_nights:    nights,
        p_focus:     focus,
        p_week_of:   getNextWednesday(),
      });

      if (rpcError) throw rpcError;
      if (!plan) throw new Error('No plan returned');

      // Persist cache
      try {
        await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data: plan, saved_at: new Date().toISOString() }));
      } catch { /* cache write failure is non-critical */ }

      applyPlan(plan, user);

      // Track view
      await AsyncStorage.setItem(VIEWED_KEY, new Date().toISOString());

    } catch {
      setLoadError(true);
      // Try cache as fallback
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        if (raw) {
          const { data: cached } = JSON.parse(raw);
          if (cached?.dinners?.length) {
            const { data: { user } } = await supabase.auth.getUser();
            applyPlan(cached, user);
            setLoadError(false);
          }
        }
      } catch { /* no cache */ }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [headcount, nights, focus]);

  function applyPlan(plan, user) {
    const dinners = plan.dinners ?? [];
    const hasMeals = dinners.some(d => d.protein || d.side || d.pantry_item);
    if (!hasMeals) { setNoDeals(true); setMeals([]); return; }

    setNoDeals(false);
    setPlanMeta({ calMin: plan.meal_calorie_target_min, calMax: plan.meal_calorie_target_max });
    const built = dinners.map((d, i) => buildMealCard(d, i));
    setMeals(built);
  }

  useEffect(() => { load(); }, []);

  const onRefresh = () => { setRefreshing(true); load(true); };

  // ── Derived values ───────────────────────────────────────────

  const mealPrices   = meals.map(computeMealPrice);
  const mealRegulars = meals.map(computeMealRegular);

  const totalDinnerCents  = mealPrices.reduce((s, p) => s + p, 0);
  const totalRegularCents = mealRegulars.reduce((s, p) => s + p, 0);
  const totalSavedCents   = totalRegularCents - totalDinnerCents;

  // Snippd range = cheapest meal to most expensive meal
  const snippdLow  = meals.length ? Math.min(...mealPrices) : 0;
  const snippdHigh = meals.length ? Math.max(...mealPrices) : 0;

  // Restaurant estimate: household_size * $20–$30 per night * 1 night (per-dinner comparison)
  const restLowPerNight  = householdSize * 2000;   // $20/person
  const restHighPerNight = householdSize * 3000;   // $30/person

  // Week receipt line items (sample breakdown — replace with real data)
  const dinnersBill      = totalDinnerCents;
  const householdStack   = Math.round(totalDinnerCents * 0.08);  // ~8% household staples
  const refillItems      = Math.round(totalDinnerCents * 0.12);  // ~12% pantry refills
  const platformRebates  = Math.round(totalSavedCents * 0.15);   // 15% of savings as rebates
  const planTotal        = dinnersBill + householdStack + refillItems - platformRebates;

  // Takeout comparison
  const takeoutLow   = householdSize * 5 * 1800;  // $18/person/night
  const takeoutHigh  = householdSize * 5 * 2800;  // $28/person/night
  const diffLow      = Math.max(0, takeoutLow  - planTotal);
  const diffHigh     = Math.max(0, takeoutHigh - planTotal);

  const withoutSnippd = totalRegularCents + householdStack + refillItems;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={18} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Weekly Dinner Plan</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Animated.View style={[styles.skelBlock, { opacity: skelOpacity, marginBottom: 12 }]} />
          <Animated.View style={[styles.skelBlock, { opacity: skelOpacity, width: '70%', height: 16 }]} />
          <Text style={[styles.loadTxt, { marginTop: 20 }]}>Building your week…</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loadError && meals.length === 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={18} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Weekly Dinner Plan</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Feather name="wifi-off" size={36} color={GRAY} />
          <Text style={[styles.loadTxt, { marginTop: 12 }]}>Couldn't load plan — check your connection.</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => { setLoadError(false); setLoading(true); load(true); }}>
            <Text style={styles.retryTxt}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (noDeals) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.navHeader}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={18} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Weekly Dinner Plan</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.center}>
          <Feather name="inbox" size={36} color={GRAY} />
          <Text style={styles.emptyTitle}>No deals loaded yet</Text>
          <Text style={styles.emptyBody}>Upload this week's circulars to generate a plan.</Text>
          {isAdmin && (
            <TouchableOpacity style={styles.uploadBtn} onPress={() => navigation.navigate('AdminCircularUpload')}>
              <Text style={styles.uploadBtnTxt}>Upload circulars now</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── NAV HEADER ─────────────────────────────────────────── */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Weekly Dinner Plan</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => { setRefreshing(true); load(); }}>
          <Feather name="refresh-cw" size={16} color={GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={FOREST} />}
      >

        {/* ── 1. HERO BLOCK ─────────────────────────────────────── */}
        <View style={styles.heroPad}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroEyebrow}>WEEK OF {weekRange.toUpperCase()}</Text>
            <Text style={styles.heroTitle}>
              {nights} home-cooked dinners.{'\n'}Built from this week's best deals.
            </Text>

            {/* 3-chip stat row */}
            <View style={styles.heroChipRow}>
              {/* Chip 1: total dinner cost */}
              <View style={styles.heroChip}>
                <Text style={styles.heroChipValue}>{fmt(totalDinnerCents)}</Text>
                <Text style={styles.heroChipLabel}>all 5 dinners</Text>
              </View>

              <View style={styles.heroChipDivider} />

              {/* Chip 2: savings vs regular */}
              <View style={styles.heroChip}>
                <Text style={styles.heroChipValue}>{fmt(totalSavedCents)}</Text>
                <Text style={styles.heroChipLabel}>you save vs. regular</Text>
              </View>

              <View style={styles.heroChipDivider} />

              {/* Chip 3: household size */}
              <View style={styles.heroChip}>
                <Text style={styles.heroChipValue}>{householdSize}</Text>
                <Text style={styles.heroChipLabel}>people fed</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 2. ANCHOR BAR ─────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.anchorBar}>
            <Text style={styles.anchorLeft}>
              Compare: dinner out for {householdSize}
            </Text>
            <View style={styles.anchorRight}>
              <Text style={styles.anchorRest}>
                Restaurant ~${(restLowPerNight / 100).toFixed(0)}–${(restHighPerNight / 100).toFixed(0)}/night
              </Text>
              <Text style={styles.anchorVs}>vs</Text>
              <Text style={styles.anchorSnippd}>
                Snippd ~{fmt(snippdLow)}–{fmt(snippdHigh)}/dinner
              </Text>
            </View>
          </View>
        </View>

        {/* ── 3. SECTION LABEL ──────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionLabel}>
            Your {nights} dinners — tap any meal to see full recipe
          </Text>
        </View>

        {/* ── 4. MEAL LIST ──────────────────────────────────────── */}
        <View style={[styles.pad, { marginTop: 0 }]}>
          <View style={styles.mealContainer}>
            {meals.map((meal, idx) => {
              const mealTotal = mealPrices[idx];
              const mealReg   = mealRegulars[idx];
              const mealSaved = mealReg - mealTotal;
              const isLast    = idx === meals.length - 1;

              return (
                <TouchableOpacity
                  key={meal.id}
                  style={[styles.mealRow, !isLast && styles.mealRowBorder]}
                  onPress={() => navigation.navigate('RecipeDetail', { meal, householdSize })}
                  activeOpacity={0.78}
                >
                  {/* LEFT COLUMN — 52px fixed */}
                  <View style={styles.mealLeft}>
                    <Text style={styles.mealDay}>{meal.day.toUpperCase()}</Text>
                    <Text style={styles.mealPrice}>{fmt(mealTotal)}</Text>
                    <Text style={styles.mealPriceSub}>
                      {meal.leftovers
                        ? `for ${householdSize} + leftovers`
                        : `for ${householdSize} people`}
                    </Text>
                  </View>

                  {/* VERTICAL DIVIDER */}
                  <View style={styles.mealDivider} />

                  {/* RIGHT COLUMN — flex 1 */}
                  <View style={styles.mealRight}>
                    {/* Meal name */}
                    <Text style={styles.mealName}>{meal.name}</Text>

                    {/* Ingredient chips */}
                    <View style={styles.chipRow}>
                      {meal.ingredients
                        .filter(i => i.deal_type)
                        .map((ing, i) => {
                          const cs = dealChipStyle(ing.deal_type);
                          return (
                            <View key={i} style={[styles.ingChip, { backgroundColor: cs.bg }]}>
                              <Text style={[styles.ingChipTxt, { color: cs.text }]}>{ing.name}</Text>
                            </View>
                          );
                        })}
                    </View>

                    {/* Meta row: Prep · Cook · cal each */}
                    <Text style={styles.mealMeta}>
                      Prep {meal.prep_min}m · Cook {meal.cook_min}m{meal.cal > 0 ? ` · ${meal.cal} cal` : ''}
                    </Text>

                    {/* Calorie status badge */}
                    {(() => {
                      const status = getCalorieStatus(meal.cal, planMeta.calMin, planMeta.calMax, householdSize);
                      if (!status) return null;
                      const map = {
                        on_target: { bg: '#DCFCE7', text: '#15803D', label: 'On target' },
                        close:     { bg: '#FEF3C7', text: '#92400E', label: 'Near target' },
                        high:      { bg: '#FEE2E2', text: '#B91C1C', label: 'Above target' },
                      };
                      const s = map[status];
                      if (!s) return null;
                      return (
                        <View style={[styles.calBadge, { backgroundColor: s.bg }]}>
                          <Text style={[styles.calBadgeTxt, { color: s.text }]}>{s.label}</Text>
                        </View>
                      );
                    })()}

                    {/* Save row */}
                    {mealSaved > 0 && (
                      <View style={styles.saveRow}>
                        <Text style={styles.regPrice}>{fmt(mealReg)}</Text>
                        <View style={styles.savePill}>
                          <Text style={styles.savePillTxt}>save {fmt(mealSaved)}</Text>
                        </View>
                      </View>
                    )}

                    {/* Coupon note */}
                    {meal.coupon && (
                      <View style={styles.couponNote}>
                        <Feather name="tag" size={10} color={BLUE_TEXT} style={{ marginRight: 4 }} />
                        <Text style={styles.couponNoteTxt}>{meal.coupon}</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── 5. WEEK RECEIPT ───────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.receiptCard}>
            {/* Line items */}
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>{nights} dinners</Text>
              <Text style={styles.receiptVal}>{fmt(dinnersBill)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Household stack</Text>
              <Text style={styles.receiptVal}>{fmt(householdStack)}</Text>
            </View>
            <View style={styles.receiptRow}>
              <Text style={styles.receiptLabel}>Refill items</Text>
              <Text style={styles.receiptVal}>{fmt(refillItems)}</Text>
            </View>
            <View style={[styles.receiptRow, { marginBottom: 0 }]}>
              <Text style={[styles.receiptLabel, { color: PURPLE }]}>{platform} rebates</Text>
              <Text style={[styles.receiptVal, { color: PURPLE }]}>−{fmt(platformRebates)}</Text>
            </View>

            {/* Footer */}
            <View style={styles.receiptFooter}>
              <View style={styles.receiptFooterLeft}>
                <Text style={styles.receiptFooterTitle}>Your week — true cost</Text>
                <Text style={styles.receiptFooterSub}>
                  without Snippd{' '}
                  <Text style={styles.receiptStrike}>{fmt(withoutSnippd)}</Text>
                </Text>
              </View>
              <Text style={styles.receiptTotal}>{fmt(planTotal)}</Text>
            </View>
          </View>
        </View>

        {/* ── 6. TAKEOUT COMPARISON BAR ─────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.takeoutBar}>
            <Text style={styles.takeoutIntro}>
              {nights} nights of takeout or delivery for {householdSize}{' '}
              {householdSize === 1 ? 'person' : 'people'} would run
            </Text>
            <Text style={styles.takeoutRange}>
              {fmt(takeoutLow)} – {fmt(takeoutHigh)} this week
            </Text>
            <Text style={styles.takeoutKeep}>
              You are keeping{' '}
              <Text style={styles.takeoutKeepAmt}>{fmt(diffLow)} – {fmt(diffHigh)}</Text>
              {' '}in your pocket.
            </Text>
          </View>
        </View>

        {/* ── 7. LOCK IN BUTTON ─────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={async () => {
              // Build flat array of all ingredient items across all meals
              const cartItems = meals.flatMap((meal) =>
                meal.ingredients
                  .filter(i => i.name)
                  .map(i => ({
                    id: `plan_${meal.id}_${(i.name).replace(/\s+/g, '_')}`,
                    product_name: i.name,
                    sale_cents:   i.sale_cents || 0,
                    reg_cents:    i.reg_cents  || i.sale_cents || 0,
                    deal_type:    i.deal_type  || null,
                    // BOGO: quantity=2, customer pays for 1
                    quantity:     i.deal_type === 'BOGO' ? 2 : 1,
                    source:       'meal_plan',
                    day:          meal.day,
                    meal_name:    meal.name,
                    retailer:     platform || 'Snippd',
                  }))
              );
              try {
                await AsyncStorage.setItem('snippd_cart', JSON.stringify(cartItems));
                // Track the event
                const { data: { session } } = await supabase.auth.getSession();
                if (session?.user?.id) {
                  tracker.track('cart_accepted', {
                    user_id: session.user.id,
                    session_id: session.access_token || String(Date.now()),
                    metadata: {
                      plan_type: 'weekly',
                      items_count: cartItems.length,
                      total_savings_cents: totalSavedCents,
                    },
                  });
                }
              } catch { /* AsyncStorage failure is non-critical */ }
              // Navigate to cart tab
              navigation.getParent()?.navigate('SnippdTab');
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.lockBtnTxt}>Lock in this week's plan</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  scroll:     { paddingBottom: 32 },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12, paddingHorizontal: 32 },
  loadTxt:    { fontSize: 14, color: GRAY, textAlign: 'center' },

  skelBlock: { width: '85%', height: 22, borderRadius: 8, backgroundColor: BORDER },

  emptyTitle: { fontSize: 18, fontWeight: '700', color: NAVY, marginTop: 12, textAlign: 'center' },
  emptyBody:  { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },
  uploadBtn:  { marginTop: 16, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  uploadBtnTxt: { color: WHITE, fontWeight: '700', fontSize: 14 },

  retryBtn:   { marginTop: 16, backgroundColor: FOREST, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 12 },
  retryTxt:   { color: WHITE, fontWeight: '700', fontSize: 14 },

  calBadge:   { alignSelf: 'flex-start', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  calBadgeTxt:{ fontSize: 10, fontWeight: '700' },

  // Nav header
  navHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: NAVY },

  // ── 1. HERO BLOCK ────────────────────────────────────────────
  heroPad:  { paddingHorizontal: 16, marginTop: 16 },
  heroBlock: {
    backgroundColor: FOREST,
    borderRadius: 12,
    padding: 20,
  },
  heroEyebrow: {
    fontSize: 10, fontWeight: '700',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 8,
  },
  heroTitle: {
    fontSize: 22, fontWeight: '500', color: WHITE,
    lineHeight: 30, marginBottom: 20,
  },
  heroChipRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10, padding: 14,
  },
  heroChip: { flex: 1, alignItems: 'center' },
  heroChipValue: {
    fontSize: 18, fontWeight: '800', color: TEAL,
    marginBottom: 3,
  },
  heroChipLabel: {
    fontSize: 10, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', lineHeight: 13,
  },
  heroChipDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },

  // ── 2. ANCHOR BAR ────────────────────────────────────────────
  pad: { paddingHorizontal: 16, marginTop: 14 },
  anchorBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: LIGHT_BG,
    borderWidth: 1, borderColor: '#BBF7D0',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12,
    flexWrap: 'wrap', gap: 6,
  },
  anchorLeft: {
    fontSize: 12, fontWeight: '600', color: NAVY,
    flexShrink: 1,
  },
  anchorRight: {
    flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  anchorRest:   { fontSize: 11, color: GRAY },
  anchorVs:     { fontSize: 11, fontWeight: '700', color: NAVY },
  anchorSnippd: { fontSize: 11, fontWeight: '700', color: GREEN },

  // ── 3. SECTION LABEL ─────────────────────────────────────────
  sectionLabel: {
    fontSize: 14, fontWeight: '700', color: NAVY,
    letterSpacing: -0.2,
  },

  // ── 4. MEAL LIST ─────────────────────────────────────────────
  mealContainer: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  mealRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingVertical: 14, paddingHorizontal: 0,
  },
  mealRowBorder: {
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },

  // Left column — fixed 52px
  mealLeft: {
    width: 52, alignItems: 'center', justifyContent: 'flex-start',
    paddingTop: 2, paddingLeft: 10,
  },
  mealDay: {
    fontSize: 10, fontWeight: '700', color: GRAY,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4,
  },
  mealPrice: {
    fontSize: 18, fontWeight: '800', color: GREEN, lineHeight: 20,
  },
  mealPriceSub: {
    fontSize: 9, color: TEAL, textAlign: 'center', marginTop: 2, lineHeight: 12,
  },

  // Vertical divider
  mealDivider: {
    width: 1, backgroundColor: BORDER,
    marginHorizontal: 10,
    alignSelf: 'stretch',
  },

  // Right column
  mealRight: { flex: 1, paddingRight: 12 },
  mealName: {
    fontSize: 13, fontWeight: '700', color: NAVY,
    lineHeight: 18, marginBottom: 8,
  },

  // Ingredient chips
  chipRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 8,
  },
  ingChip: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 20,
  },
  ingChipTxt: { fontSize: 10, fontWeight: '600' },

  // Meta row
  mealMeta: {
    fontSize: 11, color: GRAY, marginBottom: 6,
  },

  // Save row
  saveRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end',
    gap: 8, marginBottom: 4,
  },
  regPrice: {
    fontSize: 11, color: GRAY,
    textDecorationLine: 'line-through',
  },
  savePill: {
    backgroundColor: '#DCFCE7', borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  savePillTxt: { fontSize: 11, fontWeight: '700', color: GREEN },

  // Coupon note
  couponNote: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: BLUE_BG, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 5,
    marginTop: 2,
  },
  couponNoteTxt: { fontSize: 10, color: BLUE_TEXT, flex: 1, lineHeight: 14 },

  // ── 5. WEEK RECEIPT ──────────────────────────────────────────
  receiptCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  receiptRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  receiptLabel: { fontSize: 13, color: NAVY },
  receiptVal:   { fontSize: 13, fontWeight: '600', color: NAVY },

  receiptFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: FOREST, paddingHorizontal: 16, paddingVertical: 14,
  },
  receiptFooterLeft: { flex: 1 },
  receiptFooterTitle: { fontSize: 13, fontWeight: '700', color: WHITE, marginBottom: 3 },
  receiptFooterSub:   { fontSize: 11, color: 'rgba(255,255,255,0.6)' },
  receiptStrike: {
    textDecorationLine: 'line-through', color: 'rgba(255,255,255,0.5)',
  },
  receiptTotal: {
    fontSize: 26, fontWeight: '900', color: TEAL, marginLeft: 12,
  },

  // ── 6. TAKEOUT COMPARISON BAR ────────────────────────────────
  takeoutBar: {
    backgroundColor: RED_TINT, borderRadius: 12,
    borderWidth: 1, borderColor: '#FECACA',
    padding: 16,
  },
  takeoutIntro: {
    fontSize: 13, color: RED_TEXT, lineHeight: 19, marginBottom: 8,
  },
  takeoutRange: {
    fontSize: 22, fontWeight: '900', color: RED_TEXT, marginBottom: 6,
  },
  takeoutKeep: {
    fontSize: 13, color: RED_TEXT, lineHeight: 19,
  },
  takeoutKeepAmt: { fontWeight: '800' },

  // ── 7. LOCK IN BUTTON ────────────────────────────────────────
  lockBtn: {
    backgroundColor: FOREST, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10,
    elevation: 4,
  },
  lockBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },
});
