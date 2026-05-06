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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Platform, Animated, Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';
import { AgenticLedger, DecisionType } from '../src/services/agenticLedger';
import { addItemsToActiveCart } from '../src/services/cartStorage';
import { fetchTop3StoreEngine, engineTotalsForDisplay } from '../src/services/top3StoreEngine';
import { generateStacks, loadVerifiedStacks } from '../src/lib/generateStacks';

const { width } = Dimensions.get('window');

const STORES = [
  { key: 'best_overall',   label: 'Best Overall'   },
  { key: 'publix',         label: 'Publix'          },
  { key: 'dollar_general', label: 'Dollar General'  },
  { key: 'walmart',        label: 'Walmart'         },
];

const HOW_IT_WORKS = [
  'We scan this week\'s store flyers and find the best deals and digital coupons',
  'We build 5 dinners matched to your household size and nutrition goals',
  'We organize your list and tell you exactly which coupons to clip before you shop',
  'Walk in, scan your coupons at checkout, walk out with real savings',
];

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

/** Return "Mon Apr 14 — Sun Apr 20" for the current week (7-day foundation) */
function getWeekRange() {
  const now   = new Date();
  const day   = now.getDay(); // 0=Sun
  const diffToMon = (day === 0 ? -6 : 1 - day);
  const mon   = new Date(now); mon.setDate(now.getDate() + diffToMon);
  const sun   = new Date(mon); sun.setDate(mon.getDate() + 6);
  const opts  = { month: 'short', day: 'numeric' };
  const m = mon.toLocaleDateString('en-US', opts);
  const s = sun.toLocaleDateString('en-US', opts);
  return `${m} — ${s}`;
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
const MEAL_SLOTS  = ['Breakfast', 'Lunch', 'Dinner'];

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
  const couponItem = items.find(i => i.verified_coupon_id || i.exact_coupon_url);
  if (!couponItem) return null;
  return `Verified digital coupon for ${couponItem.item_name} before checkout`;
}

function buildMealCard(dinner, index) {
  const { night_index, protein, side, pantry_item } = dinner;
  const slot = typeof night_index === 'number' ? night_index : index;
  const dayAbbrev = DAY_ABBREV[slot % 7] || DAY_ABBREV[index % 7] || 'Day';

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
    id:          typeof night_index === 'number' ? night_index : index,
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
    {
      id: 6, day: 'Sat', leftovers: false,
      name: 'Vegetable Stir-Fry with Rice Noodles',
      ingredients: [
        { name: 'Stir-Fry Veggie Mix 12oz', sale_cents: 279, reg_cents: 399, deal_type: 'SALE' },
        { name: 'Rice Noodles 8oz',         sale_cents: 199, reg_cents: 259, deal_type: 'MULTI' },
        { name: 'Tofu Firm 14oz',           sale_cents: 249, reg_cents: 329, deal_type: 'SALE' },
        { name: 'Soy Sauce (pantry)',       sale_cents: 0,   reg_cents: 0,   deal_type: null },
      ],
      prep_min: 10, cook_min: 15, cal: 410,
      coupon: null,
    },
    {
      id: 7, day: 'Sun', leftovers: true,
      name: 'Skillet Sausage with Peppers & Onions',
      ingredients: [
        { name: 'Italian Sausage 1lb', sale_cents: 449, reg_cents: 699, deal_type: 'SALE' },
        { name: 'Sweet Onions 2ct',    sale_cents: 179, reg_cents: 249, deal_type: 'MULTI' },
        { name: 'Hoagie Rolls 6ct',    sale_cents: 299, reg_cents: 399, deal_type: 'BOGO' },
      ],
      prep_min: 8, cook_min: 22, cal: 520,
      coupon: 'Clip store app coupon for sausage if available',
    },
  ];
}

/** Ensure RPC / cache always exposes seven dinner slots (preferences still shape menu via RPC). */
function padDinnersToSeven(dinners) {
  const list = Array.isArray(dinners) ? [...dinners] : [];
  if (list.length === 0) return list;
  while (list.length < 7) {
    const last = list[list.length - 1];
    list.push({
      ...last,
      night_index: list.length,
    });
  }
  return list.slice(0, 7);
}

// ── Compute totals from meals ────────────────────────────────────

function computeMealPrice(meal) {
  return meal.ingredients.reduce((s, i) => s + i.sale_cents, 0);
}

function computeMealRegular(meal) {
  return meal.ingredients.reduce((s, i) => s + i.reg_cents, 0);
}

function parseMaybeJson(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

function centsFrom(value, mode = 'auto') {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (mode === 'cents') return Math.round(n);
  if (mode === 'dollars') return Math.round(n * 100);
  return n < 500 ? Math.round(n * 100) : Math.round(n);
}

function stackItemName(item) {
  return String(
    item.display_name ??
    item.name ??
    item.item ??
    item.product_name ??
    'Item'
  );
}

function stackItemFinalCents(item) {
  if (item.final_price_cents != null) return centsFrom(item.final_price_cents, 'cents');
  if (item.price_cents != null) return centsFrom(item.price_cents, 'cents');
  const raw = item.final_price ?? item.pay_price ?? item.price;
  return centsFrom(raw, Number(raw) >= 100 ? 'cents' : 'dollars');
}

function stackItemRegularCents(item) {
  if (item.price_cents != null) return centsFrom(item.price_cents, 'cents');
  if (item.regular_price_cents != null) return centsFrom(item.regular_price_cents, 'cents');
  const raw = item.regular_price ?? item.price;
  return centsFrom(raw, Number(raw) >= 100 ? 'cents' : 'dollars');
}

function isDinnerStack(stack, ingredients) {
  const text = `${stack.title || ''} ${ingredients.map(i => i.name).join(' ')}`.toLowerCase();
  const nonDinner = [
    'cola', 'coca-cola', 'pepsi', 'soda', 'drink', 'beverage', 'yogurt', 'ice cream',
    'snack', 'chips', 'cookie', 'cookies', 'candy', 'eggs', 'cage-free', 'breakfast',
  ];
  const dinnerWords = [
    'chicken', 'beef', 'pork', 'turkey', 'sausage', 'salmon', 'fish', 'taco', 'pasta',
    'pizza', 'dinner', 'family feast', 'grill', 'pantry stock', 'soup',
  ];
  return ingredients.length >= 2 && !nonDinner.some(w => text.includes(w)) && dinnerWords.some(w => text.includes(w));
}

function buildMealsFromStacks(stacks) {
  return (stacks || []).map((stack, index) => {
    const items = parseMaybeJson(stack.breakdown_list ?? stack.stack_items ?? stack.items, []);
    const ingredients = items
      .filter(item => item?.type !== 'digital_coupon' && Number(item?.price ?? item?.price_cents ?? 0) >= 0)
      .slice(0, 5)
      .map(item => {
      const sale = stackItemFinalCents(item);
      const reg = stackItemRegularCents(item) || sale;
      const dealType = (item.deal_type || item.coupon_status === 'verified')
        ? (item.deal_type || 'DIGITAL_COUPON')
        : null;
      return {
        name: stackItemName(item),
        sale_cents: sale,
        reg_cents: reg,
        deal_type: dealType,
      };
    }).filter(i => i.name && (i.sale_cents || i.reg_cents));

    const finalCents = stack.final_out_of_pocket_cents || stackItemFinalCents(stack) || ingredients.reduce((s, i) => s + i.sale_cents, 0);
    const subtotalCents = stack.subtotal_cents || ingredients.reduce((s, i) => s + (i.reg_cents || i.sale_cents), 0);
    const safeIngredients = ingredients.length
      ? ingredients
      : [{ name: stack.title || 'Store stack', sale_cents: finalCents, reg_cents: subtotalCents || finalCents, deal_type: stack.stack_type || null }];

    if (!isDinnerStack(stack, safeIngredients)) return null;

    return {
      id: stack.id || `store_stack_${index}`,
      day: DAY_ABBREV[index % 7],
      leftovers: false,
      name: stack.title || `${stack.retailer || 'Store'} Dinner Stack`,
      ingredients: safeIngredients,
      prep_min: 10,
      cook_min: 20,
      cal: 0,
      coupon: stack.official_coupon_url ? 'Open official retailer coupons before checkout' : null,
      source_stack: stack,
    };
  }).filter(Boolean).slice(0, 7);
}

function buildSupportMeal(slot, dayIndex, storeLabel) {
  const breakfast = [
    ['Oatmeal + Bananas + Yogurt', 325, 470],
    ['Eggs + Toast + Fruit', 410, 590],
    ['Greek Yogurt Bowl + Granola', 365, 525],
    ['Breakfast Tacos', 445, 650],
    ['Peanut Butter Banana Toast', 315, 450],
    ['Cereal + Milk + Fruit', 285, 420],
    ['Egg Sandwich + Apple', 395, 560],
  ];
  const lunch = [
    ['Turkey Wraps + Salad', 625, 850],
    ['Chicken Rice Bowls', 735, 980],
    ['Tuna Salad Sandwiches', 510, 730],
    ['Pasta Salad + Fruit', 580, 790],
    ['Bean Burrito Bowls', 545, 760],
    ['Soup + Grilled Cheese', 620, 840],
    ['Chicken Caesar Wraps', 690, 925],
  ];
  const [name, sale, reg] = (slot === 'Breakfast' ? breakfast : lunch)[dayIndex % 7];
  return {
    id: `${slot}_${dayIndex}`,
    day: DAY_ABBREV[dayIndex],
    mealSlot: slot,
    leftovers: false,
    name,
    ingredients: [
      { name: `${storeLabel} ${slot} basics`, sale_cents: sale, reg_cents: reg, deal_type: 'SALE' },
    ],
    prep_min: slot === 'Breakfast' ? 5 : 10,
    cook_min: slot === 'Breakfast' ? 5 : 15,
    cal: 0,
    coupon: null,
  };
}

function buildDailyMealPlan(dinners, storeLabel) {
  const dinnerList = dinners.length ? dinners : buildSampleMeals(4);
  return DAY_ABBREV.map((day, dayIndex) => {
    const dinner = {
      ...dinnerList[dayIndex % dinnerList.length],
      day,
      mealSlot: 'Dinner',
      id: `Dinner_${dayIndex}_${dinnerList[dayIndex % dinnerList.length]?.id ?? dayIndex}`,
    };
    return {
      day,
      meals: [
        buildSupportMeal('Breakfast', dayIndex, storeLabel),
        buildSupportMeal('Lunch', dayIndex, storeLabel),
        dinner,
      ],
    };
  });
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
  const [enginePayload, setEnginePayload] = useState(null);

  // ── Store selector + live deal state ──────────────────────────────────────
  const [selectedStore,   setSelectedStore]   = useState('best_overall');
  const [storeStacks,     setStoreStacks]     = useState([]);
  const [refreshingDeals, setRefreshingDeals] = useState(false);
  const [showStorePicker, setShowStorePicker] = useState(false);
  const [allStorePrices,  setAllStorePrices]  = useState({});

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
        p_nights:    7,
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
    let dinners = plan.dinners ?? [];
    dinners = padDinnersToSeven(dinners);
    const hasMeals = dinners.some(d => d.protein || d.side || d.pantry_item);
    if (!hasMeals) { setNoDeals(true); setMeals([]); return; }

    setNoDeals(false);
    setPlanMeta({ calMin: plan.meal_calorie_target_min, calMax: plan.meal_calorie_target_max });
    const built = dinners.map((d, i) => buildMealCard({ ...d, night_index: i }, i));
    setMeals(built);
    fetchTop3StoreEngine({ items: built.flatMap(meal => meal.ingredients) }).then(setEnginePayload).catch(() => {});
  }

  // ── Load live stacks from app_home_feed via verified-only client ─────────────
  const loadStoreDeals = useCallback(async (store = 'best_overall') => {
    setRefreshingDeals(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await generateStacks({
          userId: user.id,
          region: 'US-Southeast',
          stores: store === 'best_overall'
            ? ['publix', 'dollar_general', 'walmart']
            : [store],
        });
      }
      const stacks = await loadVerifiedStacks({ retailer: store, limit: 10 });
      setStoreStacks(stacks);
    } catch { /* non-fatal */ }
    finally { setRefreshingDeals(false); }
  }, []);

  // Load cheapest verified stack price per store for comparison modal
  const loadAllStorePrices = useCallback(async () => {
    try {
      const stacks = await loadVerifiedStacks({ limit: 60 });
      const prices = {};
      for (const row of stacks) {
        const key = (row.retailer || '').toLowerCase().replace(/[\s-]+/g, '_');
        if (key && !prices[key]) prices[key] = row.final_out_of_pocket_cents;
      }
      setAllStorePrices(prices);
    } catch {}
  }, []);

  useEffect(() => { load(); loadStoreDeals('best_overall'); loadAllStorePrices(); }, []);

  const onRefresh = () => { setRefreshing(true); load(true); loadStoreDeals(selectedStore); };

  // ── Derived values ───────────────────────────────────────────

  const selectedStoreLabel = STORES.find(s => s.key === selectedStore)?.label ?? 'store';
  const displayMeals = useMemo(() => {
    const storeMeals = storeStacks.length ? buildMealsFromStacks(storeStacks) : [];
    return storeMeals.length ? storeMeals : meals;
  }, [storeStacks, meals]);
  const dayPlans = useMemo(
    () => buildDailyMealPlan(displayMeals, selectedStoreLabel),
    [displayMeals, selectedStoreLabel]
  );
  const allPlanMeals = dayPlans.flatMap(day => day.meals);

  const mealPrices   = allPlanMeals.map(computeMealPrice);
  const mealRegulars = allPlanMeals.map(computeMealRegular);

  const totalDinnerCents  = mealPrices.reduce((s, p) => s + p, 0);
  const totalRegularCents = mealRegulars.reduce((s, p) => s + p, 0);
  const engineTotals = engineTotalsForDisplay(enginePayload);
  const planSavedCents   = engineTotals.stack_savings_cents || (totalRegularCents - totalDinnerCents);

  // Snippd range = cheapest meal to most expensive meal
  const snippdLow  = allPlanMeals.length ? Math.min(...mealPrices) : 0;
  const snippdHigh = allPlanMeals.length ? Math.max(...mealPrices) : 0;

  // Restaurant estimate: household_size * $20–$30 per night * 1 night (per-dinner comparison)
  const restLowPerNight  = householdSize * 2000;   // $20/person
  const restHighPerNight = householdSize * 3000;   // $30/person

  // Week receipt line items (sample breakdown — replace with real data)
  const dinnersBill      = totalDinnerCents;
  const householdStack   = Math.round(totalDinnerCents * 0.08);  // ~8% household staples
  const refillItems      = Math.round(totalDinnerCents * 0.12);  // ~12% pantry refills
  const postRegisterCredits  = Math.round(planSavedCents * 0.15);   // 15% of savings as rebates
  const planTotal        = engineTotals.final_estimated_total_cents || (dinnersBill + householdStack + refillItems - postRegisterCredits);

  // Takeout comparison
  const planNights   = Math.max(dayPlans.length || 0, nights || 7);
  const takeoutLow   = householdSize * planNights * 1800;  // $18/person/night
  const takeoutHigh  = householdSize * planNights * 2800;  // $28/person/night
  const diffLow      = Math.max(0, takeoutLow  - planTotal);
  const diffHigh     = Math.max(0, takeoutHigh - planTotal);

  const withoutSnippd = totalRegularCents + householdStack + refillItems;

  // Stack totals from backend — display only, no computation
  const stackFinalCents   = 0;
  const stackSavingsCents = 0;
  const bestShopWindow    = storeStacks[0]?.best_shop_window ?? null;
  // Fall back to computed meal totals if no stacks loaded yet
  const youPayCents  = stackFinalCents   || totalDinnerCents;
  const youSaveCents = stackSavingsCents || planSavedCents;

  // Nutrition estimates from meal calorie data (4 kcal/g protein & carb, 9 kcal/g fat)
  const totalPlanCal = allPlanMeals.reduce((s, m) => s + (m.cal || 0), 0);
  const estProtein   = totalPlanCal > 0 ? Math.round((totalPlanCal * 0.25) / 4) : 0;
  const estCarbs     = totalPlanCal > 0 ? Math.round((totalPlanCal * 0.50) / 4) : 0;
  const estFat       = totalPlanCal > 0 ? Math.round((totalPlanCal * 0.25) / 9) : 0;

  // Cost breakdown — use backend stack totals, fall back to meal-computed values
  const regularTotal = totalRegularCents;
  const totalSavings = planSavedCents;

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

        {/* ── HERO BLOCK ────────────────────────────────────────── */}
        <View style={styles.heroPad}>
          <View style={styles.heroBlock}>
            <Text style={styles.heroWeekLabel}>WEEK OF {weekRange.toUpperCase()}</Text>
            <Text style={styles.heroDinnersTitle}>
              {dayPlans.length} dinners for {householdSize}
            </Text>
            <View style={styles.heroStatsRow}>
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>Out of pocket</Text>
                <Text style={styles.heroStatValue}>{fmt(youPayCents)}</Text>
              </View>
              <View style={styles.heroStatDivider} />
              <View style={styles.heroStat}>
                <Text style={styles.heroStatLabel}>You save</Text>
                <Text style={[styles.heroStatValue, { color: '#C5FFBC' }]}>{fmt(youSaveCents)}</Text>
              </View>
            </View>
            <View style={styles.heroFooterRow}>
              <Text style={styles.heroFooterTxt}>Stores: {selectedStoreLabel}</Text>
              {bestShopWindow && <Text style={styles.heroFooterTxt}>Best shop window: {bestShopWindow}</Text>}
            </View>
          </View>
        </View>

        {/* ── STORE FILTER TABS (below hero) ────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.storeTabsWrap}
          contentContainerStyle={styles.storeTabsContent}
        >
          {STORES.map(store => (
            <TouchableOpacity
              key={store.key}
              style={[styles.storeTab, selectedStore === store.key && styles.storeTabActive]}
              onPress={() => { setSelectedStore(store.key); loadStoreDeals(store.key); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.storeTabTxt, selectedStore === store.key && styles.storeTabTxtActive]}>
                {store.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* ── SECTION LABEL ─────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionLabel}>Your week — breakfast, lunch & dinner</Text>
        </View>

        {/* ── 4. MEAL LIST ──────────────────────────────────────── */}
        <View style={[styles.pad, { marginTop: 0 }]}>
          <View style={styles.mealContainer}>
            {allPlanMeals.map((meal, idx) => {
              const mealTotal   = mealPrices[idx];
              const mealReg     = mealRegulars[idx];
              const mealSaved   = Math.max(0, mealReg - mealTotal);
              const isLast      = idx === allPlanMeals.length - 1;
              const startsDay   = (meal.mealSlot || '').toLowerCase() === 'breakfast';
              const couponCount = meal.ingredients.filter(i => i.deal_type).length;
              const dayPlan     = startsDay ? dayPlans.find(d => d.day === meal.day) : null;
              const dayTotal    = dayPlan ? dayPlan.meals.reduce((s, m) => s + computeMealPrice(m), 0) : 0;

              return (
                <React.Fragment key={`${meal.day}_${meal.mealSlot || 'Meal'}_${meal.id}`}>
                  {/* Day group header */}
                  {startsDay && (
                    <View style={styles.dayHeader}>
                      <Text style={styles.dayHeaderTxt}>{meal.day.toUpperCase()}</Text>
                      <Text style={styles.dayHeaderTotal}>{fmt(dayTotal)} total</Text>
                    </View>
                  )}

                  <TouchableOpacity
                    style={[styles.mealRow, !isLast && styles.mealRowBorder]}
                    onPress={() => navigation.navigate('MealDetail', { meal, householdSize })}
                    activeOpacity={0.78}
                  >
                    {/* Meal slot badge */}
                    <View style={styles.mealSlotBadge}>
                      <Text style={styles.mealSlotTxt}>{(meal.mealSlot || 'Meal').slice(0, 3).toUpperCase()}</Text>
                    </View>

                    {/* Main content */}
                    <View style={styles.mealInfo}>
                      <Text style={styles.mealName} numberOfLines={2}>{meal.name}</Text>
                      <View style={styles.mealPriceRow}>
                        <Text style={styles.mealPriceBig}>{fmt(mealTotal)}</Text>
                        <Text style={styles.mealPriceFor}>for {householdSize}</Text>
                        {mealSaved > 0 && (
                          <View style={styles.savePill}>
                            <Text style={styles.savePillTxt}>Save {fmt(mealSaved)}</Text>
                          </View>
                        )}
                      </View>
                      {(couponCount > 0 || meal.cal > 0) && (
                        <Text style={styles.mealMetaTxt}>
                          {[
                            couponCount > 0 ? `${couponCount} coupon${couponCount !== 1 ? 's' : ''}` : null,
                            meal.cal > 0 ? `${meal.cal} cal / serving` : null,
                          ].filter(Boolean).join('  ·  ')}
                        </Text>
                      )}
                    </View>

                    <Feather name="chevron-right" size={16} color={GRAY} />
                  </TouchableOpacity>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {/* ── 5. PLAN SUMMARY ───────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.planSummaryCard}>
            <Text style={styles.planSummaryTitle}>Plan Summary</Text>

            {/* Nutrition row */}
            {totalPlanCal > 0 && (
              <View style={styles.nutritionRow}>
                <View style={styles.nutriItem}>
                  <Text style={styles.nutriVal}>{totalPlanCal.toLocaleString()}</Text>
                  <Text style={styles.nutriLabel}>cal</Text>
                </View>
                <View style={styles.nutriDivider} />
                <View style={styles.nutriItem}>
                  <Text style={styles.nutriVal}>{estProtein}g</Text>
                  <Text style={styles.nutriLabel}>protein</Text>
                </View>
                <View style={styles.nutriDivider} />
                <View style={styles.nutriItem}>
                  <Text style={styles.nutriVal}>{estCarbs}g</Text>
                  <Text style={styles.nutriLabel}>carbs</Text>
                </View>
                <View style={styles.nutriDivider} />
                <View style={styles.nutriItem}>
                  <Text style={styles.nutriVal}>{estFat}g</Text>
                  <Text style={styles.nutriLabel}>fat</Text>
                </View>
              </View>
            )}

            {/* Cost breakdown */}
            <View style={styles.costBreakdown}>
              <View style={styles.costRow}>
                <Text style={styles.costLabel}>Regular total</Text>
                <Text style={styles.costVal}>{fmt(regularTotal)}</Text>
              </View>
              <View style={styles.costRow}>
                <Text style={[styles.costLabel, { color: GREEN }]}>Total savings</Text>
                <Text style={[styles.costVal, { color: GREEN }]}>−{fmt(totalSavings)}</Text>
              </View>
              <View style={[styles.costRow, styles.costRowFinal]}>
                <Text style={styles.costLabelFinal}>Final out of pocket</Text>
                <Text style={styles.costValFinal}>{fmt(youPayCents)}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 6. HOW IT WORKS ───────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.howTitle}>HOW IT WORKS</Text>
          <View style={styles.howCard}>
            {HOW_IT_WORKS.map((step, i) => (
              <View key={i} style={[styles.howRow, i < HOW_IT_WORKS.length - 1 && styles.howRowBorder]}>
                <View style={styles.howNum}>
                  <Text style={styles.howNumTxt}>{i + 1}</Text>
                </View>
                <Text style={styles.howTxt}>{step}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 7. ADD TO CART (Premium Concierge) ───────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.lockBtn}
            onPress={async () => {
              const cartItems = allPlanMeals.flatMap((meal) =>
                meal.ingredients
                  .filter(i => i.name)
                  .map(i => ({
                    id: `plan_${meal.id}_${(i.name).replace(/\s+/g, '_')}`,
                    product_name: i.name,
                    sale_cents:   i.sale_cents || 0,
                    reg_cents:    i.reg_cents  || i.sale_cents || 0,
                    deal_type:    i.deal_type  || null,
                    quantity:     i.deal_type === 'BOGO' ? 2 : 1,
                    source:       'meal_plan',
                    day:          meal.day,
                    meal_name:    meal.name,
                    retailer:     platform || 'Snippd',
                  }))
              );
              const storeKey = String(platform || 'publix').toLowerCase().replace(/\s+/g, '_');
              const listRows = allPlanMeals.flatMap((meal) =>
                meal.ingredients
                  .filter(i => i.name && (i.sale_cents || 0) > 0)
                  .map((i, j) => ({
                    id: `planlist_${meal.id}_${j}_${String(i.name).slice(0, 24).replace(/\s+/g, '_')}`,
                    name: i.name,
                    store: storeKey === 'snippd' ? 'publix' : storeKey,
                    price_cents: i.sale_cents || 0,
                    checked: false,
                    from_stack: true,
                    category: 'meal_plan',
                  }))
              );
              const planNameSet = [
                ...new Set(cartItems.map(c => String(c.product_name || '').toLowerCase().trim()).filter(Boolean)),
              ];
              try {
                await addItemsToActiveCart(cartItems, { replace: true });
                await AsyncStorage.setItem('snippd_my_list_import', JSON.stringify({ items: listRows, saved_at: new Date().toISOString() }));
                await AsyncStorage.setItem('snippd_weekly_plan_ingredient_names', JSON.stringify(planNameSet));
                const { data: { session } } = await supabase.auth.getSession();
                // Save plan to DB and store weekly_plan_id for receipt comparison
                if (session?.access_token) {
                  const monday = (() => {
                    const d = new Date(); const day = d.getDay();
                    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
                    return d.toISOString().split('T')[0];
                  })();
                  supabase.functions.invoke('generate-weekly-plan', {
                    body: {
                      meals: allPlanMeals,
                      projected_total_cents:         youPayCents,
                      baseline_without_snippd_cents: withoutSnippd,
                      budget_target_cents:           youPayCents > 0 ? Math.round(youPayCents * 1.05) : 15000,
                      household_size:                householdSize,
                      preferred_stores:              [selectedStoreLabel],
                      week_start:                    monday,
                    },
                    headers: { Authorization: `Bearer ${session.access_token}` },
                  }).then(({ data: pd }) => {
                    if (pd?.weekly_plan_id) {
                      AsyncStorage.setItem('snippd_weekly_plan_id', pd.weekly_plan_id).catch(() => {});
                    }
                  }).catch(() => {});
                }
                if (session?.user?.id) {
                  tracker.track('cart_accepted', {
                    user_id: session.user.id,
                    session_id: session.access_token || String(Date.now()),
                    metadata: {
                      plan_type: 'weekly',
                      items_count: cartItems.length,
                      total_savings_cents: planSavedCents,
                      concierge_bridge: 'add_to_cart_my_list',
                    },
                  });
                  await AgenticLedger.log({
                    user_id: session.user.id,
                    decision_type: DecisionType.CONCIERGE_ADD_TO_CART,
                    actor: 'WeeklyPlanScreen',
                    result: 'approved',
                    metadata: {
                      items_count: cartItems.length,
                      list_rows: listRows.length,
                      plan_nights: planNights,
                      mirror_neo4j: true,
                    },
                  });
                }
              } catch { /* non-critical */ }
              const tabNav = navigation.getParent?.();
              tabNav?.navigate('SnippdTab', { screen: 'MyList' });
            }}
            activeOpacity={0.88}
          >
            <Text style={styles.lockBtnTxt}>Add All to My List</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── STORE PICKER MODAL ──────────────────────────────────── */}
      <Modal
        visible={showStorePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowStorePicker(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowStorePicker(false)}
        >
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Select store to update plan</Text>
            {STORES.filter(s => s.key !== 'best_overall').map(store => {
              const key = store.label.toLowerCase().replace(/\s+/g, '_');
              const priceCents = allStorePrices[key] ?? allStorePrices[store.key] ?? null;
              const isActive = selectedStore === store.key;
              return (
                <TouchableOpacity
                  key={store.key}
                  style={[styles.storePickerRow, isActive && styles.storePickerRowActive]}
                  onPress={() => {
                    setSelectedStore(store.key);
                    loadStoreDeals(store.key);
                    setShowStorePicker(false);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[styles.storePickerRadio, isActive && styles.storePickerRadioActive]}>
                    {isActive && <View style={styles.storePickerRadioDot} />}
                  </View>
                  <Text style={[styles.storePickerLabel, isActive && { color: FOREST, fontWeight: '800' }]}>
                    {store.label}
                  </Text>
                  {priceCents != null && (
                    <Text style={styles.storePickerPrice}>{fmt(priceCents)}</Text>
                  )}
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={styles.storePickerBest}
              onPress={() => {
                setSelectedStore('best_overall');
                loadStoreDeals('best_overall');
                setShowStorePicker(false);
              }}
              activeOpacity={0.75}
            >
              <Text style={styles.storePickerBestTxt}>Compare all stores (Best Overall)</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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

  // ── HERO BLOCK ───────────────────────────────────────────────
  heroPad:  { paddingHorizontal: 16, marginTop: 16 },
  heroBlock: { backgroundColor: FOREST, borderRadius: 16, padding: 22 },
  heroWeekLabel: {
    fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  heroDinnersTitle: {
    fontSize: 26, fontWeight: '900', color: WHITE, lineHeight: 32, marginBottom: 18,
  },
  heroStatsRow: {
    flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12, padding: 16, marginBottom: 14,
  },
  heroStat:        { flex: 1, alignItems: 'center' },
  heroStatLabel:   { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600', marginBottom: 4 },
  heroStatValue:   { fontSize: 26, fontWeight: '900', color: WHITE },
  heroStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 8 },
  heroFooterRow:   { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 },
  heroFooterTxt:   { fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },

  // ── STORE TABS (below hero) ───────────────────────────────────
  storeTabsWrap:    { marginTop: 14, paddingLeft: 16 },
  storeTabsContent: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  storeTab:         { borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: WHITE },
  storeTabActive:   { backgroundColor: FOREST, borderColor: FOREST },
  storeTabTxt:      { fontSize: 13, fontWeight: '700', color: GRAY },
  storeTabTxtActive:{ color: WHITE },

  // ── SECTION LABEL ─────────────────────────────────────────────
  pad: { paddingHorizontal: 16, marginTop: 14 },
  sectionLabel: { fontSize: 14, fontWeight: '700', color: NAVY, letterSpacing: -0.2 },

  // ── MEAL LIST ─────────────────────────────────────────────────
  mealContainer: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  mealRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 14, gap: 12,
  },
  mealRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  dayHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: LIGHT_BG, paddingHorizontal: 14, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  dayHeaderTxt:   { fontSize: 12, fontWeight: '900', color: FOREST, letterSpacing: 1.2 },
  dayHeaderTotal: { fontSize: 12, fontWeight: '700', color: GRAY },

  // Meal slot badge
  mealSlotBadge: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: LIGHT_BG, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  mealSlotTxt: { fontSize: 9, fontWeight: '900', color: FOREST, letterSpacing: 0.5 },

  // Meal info
  mealInfo:     { flex: 1 },
  mealName:     { fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 19, marginBottom: 4 },
  mealPriceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  mealPriceBig: { fontSize: 16, fontWeight: '900', color: GREEN },
  mealPriceFor: { fontSize: 12, color: GRAY, fontWeight: '500' },
  mealMetaTxt:  { fontSize: 11, color: GRAY, marginTop: 4 },

  savePill:    { backgroundColor: '#DCFCE7', borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  savePillTxt: { fontSize: 11, fontWeight: '700', color: GREEN },

  // ── 5. PLAN SUMMARY ──────────────────────────────────────────
  planSummaryCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  planSummaryTitle: {
    fontSize: 13, fontWeight: '800', color: NAVY,
    letterSpacing: 0.3, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10,
  },
  nutritionRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LIGHT_BG,
    paddingVertical: 12, paddingHorizontal: 16,
    marginBottom: 2,
  },
  nutriItem:   { flex: 1, alignItems: 'center' },
  nutriVal:    { fontSize: 15, fontWeight: '800', color: NAVY },
  nutriLabel:  { fontSize: 10, color: GRAY, marginTop: 2 },
  nutriDivider:{ width: 1, height: 28, backgroundColor: BORDER, marginHorizontal: 4 },
  costBreakdown: { paddingHorizontal: 16, paddingBottom: 4 },
  costRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  costRowFinal: {
    borderBottomWidth: 0, paddingBottom: 14,
  },
  costLabel:     { fontSize: 13, color: GRAY },
  costVal:       { fontSize: 13, fontWeight: '600', color: NAVY },
  costLabelFinal:{ fontSize: 14, fontWeight: '800', color: NAVY },
  costValFinal:  { fontSize: 18, fontWeight: '900', color: FOREST },

  // ── 6. HOW IT WORKS ──────────────────────────────────────────
  howTitle: {
    fontSize: 11, fontWeight: '800', color: GRAY,
    letterSpacing: 1.2, textTransform: 'uppercase',
    marginBottom: 10,
  },
  howCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 13, gap: 12,
  },
  howRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  howNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: FOREST, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  howNumTxt: { fontSize: 11, fontWeight: '900', color: WHITE },
  howTxt:    { flex: 1, fontSize: 13, color: NAVY, lineHeight: 19 },

  // ── STORE PICKER MODAL ───────────────────────────────────────
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: WHITE, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingBottom: 36, paddingHorizontal: 16,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: BORDER,
    alignSelf: 'center', marginTop: 12, marginBottom: 18,
  },
  modalTitle: {
    fontSize: 15, fontWeight: '800', color: NAVY, marginBottom: 14,
  },
  storePickerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 12,
  },
  storePickerRowActive: { backgroundColor: LIGHT_BG },
  storePickerRadio: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  storePickerRadioActive: { borderColor: FOREST },
  storePickerRadioDot: {
    width: 10, height: 10, borderRadius: 5, backgroundColor: FOREST,
  },
  storePickerLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: NAVY },
  storePickerPrice: { fontSize: 14, fontWeight: '800', color: FOREST },
  storePickerBest: {
    marginTop: 14, alignItems: 'center', paddingVertical: 12,
    backgroundColor: LIGHT_BG, borderRadius: 10,
  },
  storePickerBestTxt: { fontSize: 13, fontWeight: '700', color: FOREST },

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
