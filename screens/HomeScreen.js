import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  LayoutAnimation,
  UIManager,
  Image,
  Dimensions,
  ActivityIndicator,
  TextInput,
  DeviceEventEmitter,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';
import { runCouponClip, fmtSavings } from '../src/services/CouponClippingService';
import { buildMomentumTicker } from '../src/services/wealthMomentumEngine';
import { createGeofenceWatcher } from '../src/services/GeofenceService';
import { readActiveCart } from '../src/services/cartStorage';
import { fetchTop3StoreEngine, engineTotalsForDisplay } from '../src/services/top3StoreEngine';
import { generateStacks, loadVerifiedStacks } from '../src/lib/generateStacks';
import { getExperienceType, getTopCategories } from '../src/lib/experienceType';
import BestSavingsPreview from '../src/components/BestSavingsPreview';
import QuickOnboardingModal from '../src/components/QuickOnboardingModal';
import { DEFAULT_HOME_LAYOUT, fetchDynamicHomeLayout, recordMemoryEvent } from '../src/lib/memoryEvents';
import { WEEKLY_BUDGET_UPDATED, fetchWeeklyBudgetCents, saveWeeklyBudgetEverywhere } from '../lib/weeklyBudget';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');
const isWide = width >= 720;

const BRAND = {
  primaryGreen: '#0C9E54',
  deepGreen: '#004B28',
  darkSection: '#04361D',
  ink: '#111827',
  white: '#FFFFFF',
  bgLight: '#F7FAF8',
  greyText: '#64748B',
  border: '#E2E8F0',
  mintPop: '#C5FFBC',
  lightGreen: '#E8F8F0',
  orange: '#EA580C',
  purple: '#5B3FD2',
};

const CARD_SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.08,
  shadowRadius: 18,
  elevation: 4,
};

const CATEGORY_IMAGES = {
  dairy: require('../assets/cat-dairy.png'),
  produce: require('../assets/cat-fruits.png'),
  fruit: require('../assets/cat-fruits.png'),
  fruits: require('../assets/cat-fruits.png'),
  vegetables: require('../assets/cat-veggies.png'),
  veggie: require('../assets/cat-veggies.png'),
  meat: require('../assets/cat-protein.png'),
  meats: require('../assets/cat-protein.png'),
  protein: require('../assets/cat-protein.png'),
  seafood: require('../assets/cat-protein.png'),
  snack: require('../assets/cat-snacks.png'),
  snacks: require('../assets/cat-snacks.png'),
  pantry: require('../assets/cat-pantry.png'),
  household: require('../assets/cat-household.png'),
  bogo: require('../assets/cat-bogo.png'),
};

const DEFAULT_DEAL_IMAGE = require('../assets/stack-produce.png.png');

// ── Personalization constants (module-level — no re-creation per render) ──────

const SECTION_LABELS = {
  saver: {
    topStacks: 'Top Savings Deals',
    topIcon:   'tag',
    hotDeals:  'Budget Deals',
  },
  convenience: {
    topStacks: 'Quick Pick',
    topIcon:   'zap',
    hotDeals:  'Deals',
  },
  explorer: {
    topStacks: 'New Deals',
    topIcon:   'compass',
    hotDeals:  'Trending Bundles',
  },
};

// Section render order — fixed to match spec: budget context first, then deals, then receipt CTA.
// featureGrid (dinner plan / savings momentum) lives on the Plan tab, not home.
const SECTION_ORDER = {
  saver:       ['buyingPower', 'topStacks'],
  convenience: ['buyingPower', 'topStacks'],
  explorer:    ['buyingPower', 'topStacks'],
};

const MEMORY_SECTION_TO_HOME_SECTION = {
  weekly_budget: 'buyingPower',
  plan_my_week: 'featureGrid',
  scan_item: 'featureGrid',
  hottest_deals: 'hotDeals',
  best_value_deals: 'topStacks',
  high_protein_deals: 'hotDeals',
  safe_picks: 'topStacks',
  better_value_meals: 'featureGrid',
  recent_savings: 'receipt',
  survey_followup: 'receipt',
  cart_summary: 'buyingPower',
  new_picks: 'hotDeals',
};

const HOME_HIDDEN_SECTIONS = new Set(['hotDeals', 'receipt']);

function mapMemoryLayoutToHomeSections(sections = DEFAULT_HOME_LAYOUT, fallbackOrder = SECTION_ORDER.saver) {
  const mapped = sections
    .map(section => MEMORY_SECTION_TO_HOME_SECTION[section])
    .filter(Boolean)
    .filter(section => !HOME_HIDDEN_SECTIONS.has(section));
  return [...new Set([...mapped, ...fallbackOrder.filter(section => !HOME_HIDDEN_SECTIONS.has(section))])];
}

const EXPERIENCE_META = {
  saver:       { label: 'Personalized for You', sub: 'Savings-first view',  icon: 'tag' },
  convenience: { label: 'Personalized for You', sub: 'Quick picks view',    icon: 'zap' },
  explorer:    { label: 'Personalized for You', sub: 'Explorer view',       icon: 'compass' },
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function toCents(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n > 1000 ? n : n * 100);
}

function centsFromAny(obj, centsKeys = [], dollarKeys = [], fallback = 0) {
  if (!obj) return fallback;
  for (const key of centsKeys) {
    if (obj?.[key] != null && Number.isFinite(Number(obj[key]))) {
      return Math.round(Number(obj[key]));
    }
  }
  for (const key of dollarKeys) {
    if (obj?.[key] != null && Number.isFinite(Number(obj[key]))) {
      return toCents(obj[key], fallback);
    }
  }
  return fallback;
}

function parseMaybeJson(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'string') return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function titleCase(value) {
  if (!value) return '';
  return String(value)
    .replace(/[_-]+/g, ' ')
    .replace(/\w\S*/g, word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}

function fmtCents(cents) {
  const safe = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return `$${(Math.max(0, safe) / 100).toFixed(2)}`;
}

function getWeekRange() {
  const today = new Date();
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return `${fmt(monday)} - ${fmt(sunday)}`;
}

function imageForCategory(category, dealType, name = '') {
  const haystack = `${category || ''} ${dealType || ''} ${name}`.toLowerCase();
  if (haystack.includes('bogo')) return CATEGORY_IMAGES.bogo;
  if (haystack.match(/yogurt|milk|cheese|dairy/)) return CATEGORY_IMAGES.dairy;
  if (haystack.match(/straw|apple|berry|fruit|produce/)) return CATEGORY_IMAGES.produce;
  if (haystack.match(/vegetable|broccoli|asparagus|pepper|salad/)) return CATEGORY_IMAGES.vegetables;
  if (haystack.match(/chicken|beef|pork|meat|protein|salmon|seafood/)) return CATEGORY_IMAGES.protein;
  if (haystack.match(/chip|snack|cracker/)) return CATEGORY_IMAGES.snacks;
  if (haystack.match(/paper|clean|detergent|household/)) return CATEGORY_IMAGES.household;
  if (haystack.match(/pantry|pasta|rice|bean|sauce/)) return CATEGORY_IMAGES.pantry;
  return DEFAULT_DEAL_IMAGE;
}

function isVerifiedSystemStack(row) {
  if (!row) return false;
  const validation = String(
    row.validation_status || row.verification_status || ''
  ).toLowerCase();
  const sourceType = row.source_type
    ? String(row.source_type).toUpperCase()
    : 'SNIPPD_GENERATED';
  const active = row.is_active !== false && row.status !== 'inactive';
  const isVerified =
    validation === 'system_generated_verified' ||
    validation === 'verified_live';
  const isSnippd =
    sourceType === 'SNIPPD_GENERATED' || sourceType.includes('SNIPPD');
  return active && isVerified && isSnippd;
}

function stackItemsFromRow(row) {
  return parseMaybeJson(
    row?.stack_items
      ?? row?.items
      ?? row?.breakdown_list
      ?? row?.metadata?.stack_items,
    []
  );
}

function normalizeStack(row) {
  const items = stackItemsFromRow(row);
  const firstItem = items[0] || {};
  const subtotalCents = centsFromAny(
    row,
    ['subtotal_cents', 'regular_total_cents', 'retail_total_cents'],
    ['subtotal', 'regular_total', 'retail_total'],
    0
  );
  const finalCents = centsFromAny(
    row,
    ['final_out_of_pocket_cents', 'final_price_cents', 'final_estimated_total_cents', 'final_estimated_cents'],
    ['final_out_of_pocket', 'final_price', 'pay_price', 'sale_price'],
    0
  );
  const discountCents = centsFromAny(
    row,
    ['total_discounts_cents', 'savings_cents', 'total_savings_cents'],
    ['total_discounts', 'savings', 'save_price'],
    Math.max(0, subtotalCents - finalCents)
  );
  const savingsPercent = Number.isFinite(Number(row?.savings_percent))
    ? Math.round(Number(row.savings_percent))
    : subtotalCents > 0
      ? Math.round((discountCents / subtotalCents) * 100)
      : 0;
  const retailerKey = row?.retailer_key || row?.retailer || row?.store || firstItem?.retailer_key || firstItem?.store || 'store';
  const storeName = titleCase(row?.store || row?.retailer || row?.retailer_name || retailerKey);
  const title = row?.title
    || row?.stack_title
    || row?.product_name
    || row?.item_name
    || firstItem?.display_name
    || firstItem?.name
    || 'Snippd Deal';

  return {
    ...row,
    id: String(row?.id || `${retailerKey}_${title}`),
    retailer_key: retailerKey,
    retailer: storeName,
    store: storeName,
    title,
    stack_items: items,
    item_count: Number(row?.item_count || items.length || 0),
    subtotal_cents: subtotalCents,
    total_discounts_cents: discountCents,
    final_out_of_pocket_cents: finalCents,
    savings_percent: savingsPercent,
    stack_type: row?.stack_type || row?.deal_type || 'BASKET_ENGINEERED_STACK',
    confidence: row?.confidence || row?.confidence_label || row?.confidence_score || 'VERIFIED',
    best_shop_window: row?.best_shop_window || row?.deal_expiration_date || row?.expires_at || null,
    validation_status: row?.validation_status,
    source_type: row?.source_type || row?.source,
  };
}

function normalizeHomeDeal(row, source = 'app_home_feed') {
  const stack = normalizeStack(row);
  const firstItem = stack.stack_items?.[0] || {};
  const category = row?.category || row?.primary_category || firstItem?.category || '';
  const dealType = stack.stack_type;
  const oldCents = Math.max(stack.subtotal_cents, stack.final_out_of_pocket_cents);
  const newCents = stack.final_out_of_pocket_cents;
  const saveCents = stack.total_discounts_cents;
  const dropPct = stack.savings_percent;

  return {
    id: stack.id,
    brand: stack.store,
    name: stack.title,
    image: imageForCategory(category, dealType, stack.title),
    oldCents,
    newCents,
    saveCents,
    dropPct,
    lowestLabel: stack.confidence ? `${String(stack.confidence).replace(/_/g, ' ')} confidence` : 'Verified stack',
    stackNote: `${stack.item_count} item${stack.item_count === 1 ? '' : 's'} in this stack`,
    retailer: stack.store.charAt(0).toUpperCase(),
    retailerName: stack.store,
    source,
    stack,
  };
}

function normalizePlanDinner(plan) {
  const dinner = plan?.dinners?.find(d => d?.protein || d?.side || d?.pantry_item) || plan?.meals?.[0];
  if (!dinner) return null;
  if (dinner.name) return dinner;

  const parts = [dinner.protein?.item_name, dinner.side?.item_name, dinner.pantry_item?.item_name].filter(Boolean);
  const ingredients = [dinner.protein, dinner.side, dinner.pantry_item].filter(Boolean);
  const total = ingredients.reduce((sum, item) => sum + toCents(item.final_price), 0);
  const regular = ingredients.reduce((sum, item) => sum + toCents(item.base_price), 0);

  return {
    name: parts.length ? parts.join(' with ') : 'Tonight dinner plan',
    price_cents: total,
    regular_cents: regular,
    stores: [...new Set(ingredients.map(i => titleCase(i.retailer || i.retailer_key)).filter(Boolean))],
  };
}

async function queryVerifiedHomeFeed(limit = 6) {
  const { data, error } = await supabase
    .from('app_home_feed')
    .select('*')
    .eq('is_active', true)
    .eq('validation_status', 'system_generated_verified')
    .eq('source_type', 'SNIPPD_GENERATED')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []).filter(isVerifiedSystemStack).map(normalizeStack);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  // ── Existing state ──────────────────────────────────────────────────────────
  const [refreshing, setRefreshing] = useState(false);
  const [budget, setBudget] = useState({ spent: 0, goal: 150.00 });
  const [budgetModalVisible, setBudgetModalVisible] = useState(false);
  const [budgetDraft, setBudgetDraft] = useState('150');
  const [budgetSaving, setBudgetSaving] = useState(false);
  const [savingsTotal, setSavingsTotal] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [credits, setCredits] = useState(0);
  const [streakWeeks, setStreakWeeks] = useState(0);
  const [weeklySavingsCents, setWeeklySavingsCents] = useState(0);
  const [previousWeekSavingsCents, setPreviousWeekSavingsCents] = useState(0);
  const [weeklyPlan, setWeeklyPlan] = useState(null);
  const [wealthData, setWealthData] = useState(null);
  const [digitalSavings, setDigitalSavings] = useState(0);
  const [matchedCoupons, setMatchedCoupons] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [homeDeals, setHomeDeals] = useState([]);
  const [enginePayload, setEnginePayload] = useState(null);
  const [anticipatoryPlan, setAnticipatoryPlan] = useState(null);
  const [momentumTicker, setMomentumTicker] = useState(null);
  const [liveCard, setLiveCard] = useState(null);
  const [topStacks, setTopStacks] = useState([]);
  const [stacksLoading, setStacksLoading] = useState(false);

  // ── Personalization state ───────────────────────────────────────────────────
  const [experienceType, setExperienceType] = useState('saver');
  const [userPrefs, setUserPrefs] = useState(null);
  const [showQuickOnboarding, setShowQuickOnboarding] = useState(false);
  const [onboardingUserId,    setOnboardingUserId]    = useState(null);
  const [profileCompletePct,  setProfileCompletePct]  = useState(0);
  const [dynamicLayout, setDynamicLayout] = useState({
    sections: DEFAULT_HOME_LAYOUT,
    alerts: [],
    emphasized_actions: [],
    fallback: true,
  });

  // Refs: keep userPrefs accessible in debounced callbacks without stale closures
  const userPrefsRef    = useRef(null);
  const trackDebounceRef = useRef(null);

  useEffect(() => { userPrefsRef.current = userPrefs; }, [userPrefs]);

  // ── Category-biased stack ordering ─────────────────────────────────────────
  const sortedTopStacks = useMemo(() => {
    if (!topStacks.length) return topStacks;
    const topCats = getTopCategories(userPrefs?.category_clicks || {});
    if (!topCats.length) return topStacks;
    return [...topStacks].sort((a, b) => {
      const catA = (a.meal_type || '').toLowerCase();
      const catB = (b.meal_type || '').toLowerCase();
      const ra = topCats.findIndex(c => catA.includes(c));
      const rb = topCats.findIndex(c => catB.includes(c));
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
  }, [topStacks, userPrefs?.category_clicks]);

  const sortedHomeDeals = useMemo(() => {
    if (!homeDeals.length) return homeDeals;
    const topCats = getTopCategories(userPrefs?.category_clicks || {});
    if (!topCats.length) return homeDeals;
    return [...homeDeals].sort((a, b) => {
      const catA = (a.stack?.meal_type || '').toLowerCase();
      const catB = (b.stack?.meal_type || '').toLowerCase();
      const ra = topCats.findIndex(c => catA.includes(c));
      const rb = topCats.findIndex(c => catB.includes(c));
      return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb);
    });
  }, [homeDeals, userPrefs?.category_clicks]);

  const topStack = sortedTopStacks[0] || null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handlePress = (routeName, params = {}) => {
    if (navigation) navigation.navigate(routeName, params);
  };

  const navigateToStack = (rawStack) => {
    trackInteraction(rawStack?.meal_type || rawStack?.stack_type || 'deal', 'stack_click');
    trackMemoryInteraction({
      event_type: 'deal_viewed',
      entity_type: 'deal',
      entity_id: String(rawStack?.id || rawStack?.stack_id || rawStack?.title || 'deal'),
      store_id: rawStack?.retailer_key || rawStack?.store,
      deal_id: String(rawStack?.id || rawStack?.stack_id || ''),
      savings: rawStack?.total_discounts_cents != null ? rawStack.total_discounts_cents / 100 : undefined,
      cost: rawStack?.final_out_of_pocket_cents != null ? rawStack.final_out_of_pocket_cents / 100 : undefined,
      metadata: {
        source: 'HomeScreen',
        title: rawStack?.title,
        savings_percent: rawStack?.savings_percent,
      },
    });
    navigation.navigate('StackDetail', { stack: rawStack, deal: rawStack });
  };

  const goToSmartCart = () => {
    navigation?.navigate('PlanTab', { screen: 'WeeklyPlan' });
  };

  const goToExplore = () => {
    navigation?.navigate('DiscoverTab');
  };

  const openBudgetEditor = () => {
    setBudgetDraft(String(Math.round(budget.goal || 150)));
    setBudgetModalVisible(true);
  };

  const saveWeeklyBudget = async () => {
    const dollars = Number(String(budgetDraft).replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(dollars) || dollars <= 0) {
      Alert.alert('Budget needed', 'Enter a weekly budget greater than $0.');
      return;
    }

    const weeklyBudgetCents = Math.round(dollars * 100);
    setBudgetSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('No active user');

      await saveWeeklyBudgetEverywhere(weeklyBudgetCents);
      setBudget({ spent: 0, goal: dollars });
      setBudgetDraft(String(Math.round(dollars)));
      setBudgetModalVisible(false);
      fetchTop3StoreEngine({ forceRefresh: true }).then(setEnginePayload).catch(() => {});
      loadWeeklyPlan();
      Alert.alert('Budget updated', `Your weekly budget is now ${fmtCents(weeklyBudgetCents).replace('.00', '')}.`);
    } catch (error) {
      Alert.alert('Could not save budget', error?.message || 'Please try again.');
    } finally {
      setBudgetSaving(false);
    }
  };

  // ── Personalization: load + track ───────────────────────────────────────────

  async function loadUserPreferences() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        setUserPrefs(data);
        setExperienceType(getExperienceType(data));
        // Show quick onboarding if dietary step was never completed
        if (!data.quick_onboarding_done) {
          setOnboardingUserId(user.id);
          setShowQuickOnboarding(true);
        }
      } else {
        // Bootstrap a default row — fire and forget
        supabase.from('user_preferences').upsert({
          user_id:          user.id,
          budget_range:     150,
          preferred_stores: [],
          category_clicks:  {},
          last_actions:     {},
          experience_type:  'saver',
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'user_id' });
        // New user — show onboarding immediately
        setOnboardingUserId(user.id);
        setShowQuickOnboarding(true);
      }
    } catch {
      // Non-fatal: migration may not be applied yet
    }
  }

  async function loadDynamicLayout() {
    const layout = await fetchDynamicHomeLayout();
    setDynamicLayout(layout);
  }

  function trackInteraction(category, action) {
    if (!category) return;
    if (trackDebounceRef.current) clearTimeout(trackDebounceRef.current);

    // Optimistic local update — recalculate experience type immediately
    setUserPrefs(prev => {
      const clicks  = { ...(prev?.category_clicks || {}) };
      clicks[category] = (clicks[category] || 0) + 1;
      const recent  = [
        { action, category, at: Date.now() },
        ...(prev?.last_actions?.recent || []),
      ].slice(0, 5);
      const updated = { ...(prev || {}), category_clicks: clicks, last_actions: { recent }, updated_at: new Date().toISOString() };
      setExperienceType(getExperienceType(updated));
      return updated;
    });

    // Debounced DB write — reads latest value via ref, not stale closure
    trackDebounceRef.current = setTimeout(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const latest = userPrefsRef.current;
        if (!latest) return;
        await supabase.from('user_preferences').upsert({
          user_id:         user.id,
          category_clicks: latest.category_clicks,
          last_actions:    latest.last_actions,
          updated_at:      latest.updated_at,
        }, { onConflict: 'user_id' });
      } catch {
        // Non-fatal
      }
    }, 2000);
  }

  function trackMemoryInteraction(event) {
    recordMemoryEvent(event);
  }

  // ── Data loading ─────────────────────────────────────────────────────────────

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, weekly_budget, preferences, savings_streak_weeks, credits_balance, preferred_stores, allergies, household_size, lifestyle_concierge, nutrition_goals')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const weeklyBudgetDollars = (await fetchWeeklyBudgetCents()) / 100;
        setBudget({ spent: 0, goal: weeklyBudgetDollars });
        setBudgetDraft(String(Math.round(weeklyBudgetDollars)));
        setCredits(data.credits_balance ?? data.preferences?.credit_balance ?? 0);
        setStreakWeeks(data.savings_streak_weeks ?? 0);
        if (data.full_name) {
          setFirstName(data.full_name.trim().split(' ')[0] || '');
        }
        // Compute profile completion (8 key fields)
        const fields = [
          data.full_name,
          data.weekly_budget,
          data.household_size,
          data.preferred_stores?.length,
          data.lifestyle_concierge?.dietary_preference,
          data.lifestyle_concierge?.coupon_comfort,
          data.nutrition_goals?.length,
          data.allergies != null,
        ];
        const filled = fields.filter(Boolean).length;
        setProfileCompletePct(Math.round((filled / fields.length) * 100));
      }

      const { data: snaps } = await supabase
        .from('checkout_math_snapshots')
        .select('response_payload, created_at')
        .eq('user_id', user.id)
        .eq('status', 'APPROVED');

      if (snaps?.length) {
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        const previousWeekStart = new Date(weekStart);
        previousWeekStart.setDate(weekStart.getDate() - 7);

        const totalCents = snaps.reduce((acc, r) => {
          const v = r.response_payload?.savings_cents ?? r.response_payload?.at_register_savings_cents;
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);
        const currentWeekCents = snaps.reduce((acc, r) => {
          const createdAt = r.created_at ? new Date(r.created_at) : null;
          if (!createdAt || createdAt < weekStart) return acc;
          const v = r.response_payload?.savings_cents ?? r.response_payload?.at_register_savings_cents;
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);
        const lastWeekCents = snaps.reduce((acc, r) => {
          const createdAt = r.created_at ? new Date(r.created_at) : null;
          if (!createdAt || createdAt < previousWeekStart || createdAt >= weekStart) return acc;
          const v = r.response_payload?.savings_cents ?? r.response_payload?.at_register_savings_cents;
          return acc + (typeof v === 'number' ? v : 0);
        }, 0);

        setSavingsTotal(totalCents / 100);
        setWeeklySavingsCents(currentWeekCents);
        setPreviousWeekSavingsCents(lastWeekCents);

        if (totalCents > 0) {
          const latestSnap = snaps[0];
          const weekCents = latestSnap?.response_payload?.savings_cents
            ?? latestSnap?.response_payload?.at_register_savings_cents
            ?? Math.round(totalCents / snaps.length);
          setMomentumTicker(buildMomentumTicker(weekCents));
        }
      }

      const { items } = await readActiveCart();
      setCartItems(items || []);
      fetchTop3StoreEngine({ items: items || [] }).then(setEnginePayload).catch(() => {});

      runCouponClip(user.id).then(result => {
        setDigitalSavings(result.savingsCents || 0);
        setMatchedCoupons(result.matchedCount || result.coupons?.length || 0);
      }).catch(() => {});
    } catch (e) {
      console.error(e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(WEEKLY_BUDGET_UPDATED, cents => {
      const dollars = Math.round(Number(cents || 0)) / 100;
      if (dollars > 0) {
        setBudget(prev => ({ ...prev, goal: dollars }));
        setBudgetDraft(String(Math.round(dollars)));
      }
    });
    return () => sub.remove();
  }, []);

  useFocusEffect(useCallback(() => {
    fetchProfile();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) return;
      tracker.trackEvent({
        event_name: 'HOME_FEED_VIEWED',
        user_id: session.user.id,
        session_id: session.access_token || String(Date.now()),
        screen_name: 'HomeScreen',
      });
    });
  }, [fetchProfile]));

  async function loadWeeklyPlan() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-weekly-plan`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      const fresh = await res.json();
      if (fresh && !fresh.no_deals) setWeeklyPlan(fresh);
    } catch {
      setWeeklyPlan(null);
    }
  }

  async function loadHomeData() {
    try {
      const stacks = await queryVerifiedHomeFeed(6);
      setTopStacks(stacks.slice(0, 4));
      setHomeDeals(stacks.slice(0, 6).map(row => normalizeHomeDeal(row, 'app_home_feed')));
      await loadWeeklyPlan();
    } catch (err) {
      console.error('loadHomeData failed:', err);
      setTopStacks([]);
      setHomeDeals([]);
    }
  }

  async function loadTopStacks(triggerGenerate = false) {
    setStacksLoading(true);
    try {
      if (triggerGenerate) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await generateStacks({
            userId: user.id,
            region: 'US-Southeast',
            stores: ['publix', 'dollar_general', 'walmart'],
            savingsThreshold: 40,
            mode: 'stack_first_curated',
          });
        }
      }

      let stacks = [];
      try {
        const serviceStacks = await loadVerifiedStacks({ limit: 6 });
        stacks = (serviceStacks || []).filter(isVerifiedSystemStack).map(normalizeStack);
      } catch {
        stacks = [];
      }

      if (!stacks.length) {
        stacks = await queryVerifiedHomeFeed(6);
      }

      setTopStacks(stacks.slice(0, 4));
      setHomeDeals(stacks.slice(0, 6).map(row => normalizeHomeDeal(row, 'app_home_feed')));
    } catch (err) {
      console.error('loadTopStacks failed:', err);
      setTopStacks([]);
      setHomeDeals([]);
    } finally {
      setStacksLoading(false);
      setRefreshing(false);
    }
  }

  // ── Effects ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadUserPreferences();
    loadDynamicLayout();
    loadHomeData();
    loadTopStacks();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await AsyncStorage.getItem('weekly_plan_last_viewed');
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase.rpc('get_this_week_anticipatory_plan', { p_user_id: user.id });
        if (data?.[0]) setAnticipatoryPlan(data[0]);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    let watcher = null;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        watcher = createGeofenceWatcher(user.id);
        await watcher.start(card => setLiveCard(card));
      } catch {}
    })();
    return () => { watcher?.stop(); };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('user_persona')
          .select('*')
          .eq('user_id', user.id)
          .single();
        if (data) {
          const savedCents = data.initial_savings_cents ?? 0;
          setWealthData({
            location: data.location ?? 'your area',
            vibe: data.style_vibe ?? 'your style',
            annualRecoveryCents: savedCents * 12,
          });
        }
      } catch {}
    })();
  }, []);

  // ── Computed display values ──────────────────────────────────────────────────

  const handleResetWeek = () => {
    Alert.alert(
      'Start New Week?',
      'Ready to clear your spending and start a fresh strategy?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Fresh',
          onPress: async () => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setBudget(prev => ({ ...prev, spent: 0 }));
          },
        },
      ]
    );
  };

  const weeklyBudgetCents = Math.round(budget.goal * 100);
  const hasCart = cartItems.length > 0;
  const cartSpendCents = cartItems.reduce((sum, item) => {
    const sale = centsFromAny(item, ['sale_cents', 'final_price_cents'], ['sale_price', 'pay_price', 'final_price'], 0);
    return sum + sale * (Number(item.quantity) || 1);
  }, 0);
  const cartRegularCents = cartItems.reduce((sum, item) => {
    const sale = centsFromAny(item, ['sale_cents', 'final_price_cents'], ['sale_price', 'pay_price', 'final_price'], 0);
    const regular = centsFromAny(item, ['reg_cents', 'regular_price_cents'], ['regular_price', 'reg_price', 'base_price'], sale);
    return sum + regular * (Number(item.quantity) || 1);
  }, 0);
  const cartSavingsCents = Math.max(0, cartRegularCents - cartSpendCents);
  const observedSavingsCents = Math.round(savingsTotal * 100);
  const currentTripSavingsCents = cartSavingsCents + (hasCart ? digitalSavings : 0);
  const engineTotals = engineTotalsForDisplay(enginePayload);

  const optimizedSpendCents = topStack?.final_out_of_pocket_cents
    ?? (hasCart ? (engineTotals.final_estimated_total_cents || cartSpendCents || 0) : 0);
  const estimatedSavingsCents = topStack?.total_discounts_cents
    ?? (hasCart ? (engineTotals.stack_savings_cents || currentTripSavingsCents || 0) : 0);

  const totalVerifiedSavingsCents = observedSavingsCents;
  const savingsPct = topStack?.savings_percent
    ?? (hasCart && weeklyBudgetCents > 0 ? Math.round((estimatedSavingsCents / weeklyBudgetCents) * 100) : 0);

  const optimizedDeals = cartItems.length;
  const cartStoreNames = [...new Set(
    cartItems.map(item => titleCase(item.retailer || item.retailer_key)).filter(Boolean)
  )];
  const storeCount = cartStoreNames.length;
  const progressPct = optimizedSpendCents && weeklyBudgetCents > 0
    ? `${Math.min(100, Math.round((optimizedSpendCents / weeklyBudgetCents) * 100))}%`
    : '0%';

  const dinnerPlan = normalizePlanDinner(weeklyPlan);
  const dinnerPrice = dinnerPlan?.price_per_serving
    ?? (dinnerPlan?.price_cents ? dinnerPlan.price_cents / 100 : null);
  const dinnerName = dinnerPlan?.name;
  const dinnerStores = dinnerPlan?.stores?.slice?.(0, 2)?.join(' + ')
    || weeklyPlan?.stores?.slice?.(0, 2)?.join(' + ')
    || cartStoreNames.slice(0, 2).join(' + ');
  const hasDinnerPlan = Boolean(dinnerPlan && dinnerName);

  const hasLiveOptimization = hasCart && (estimatedSavingsCents > 0 || optimizedSpendCents > 0);
  const heroTitle = hasLiveOptimization
    ? `You're saving ${fmtCents(estimatedSavingsCents)} on this cart.`
    : 'Your smartest week starts here.';
  const heroSub = hasLiveOptimization
    ? (enginePayload?.best_store?.retailer_key
      ? enginePayload.explanation || `Best option: ${titleCase(enginePayload.best_store.retailer_key)}. Verified coupons applied.`
      : `${optimizedDeals} item${optimizedDeals !== 1 ? 's' : ''} optimized${storeCount ? ` across ${storeCount} ${storeCount === 1 ? 'store' : 'stores'}` : ''}.`)
    : 'Add items to your cart to see your real savings, optimized across local stores.';

  const momentumDeltaPct = previousWeekSavingsCents > 0
    ? Math.round(((weeklySavingsCents - previousWeekSavingsCents) / previousWeekSavingsCents) * 100)
    : null;
  const momentumHeadline = momentumDeltaPct != null
    ? `${Math.abs(momentumDeltaPct)}%`
    : weeklySavingsCents > 0
      ? fmtCents(weeklySavingsCents)
      : matchedCoupons > 0
        ? String(matchedCoupons)
        : `${sortedTopStacks.length || sortedHomeDeals.length}`;
  const momentumContext = momentumDeltaPct != null
    ? `${momentumDeltaPct >= 0 ? 'more' : 'less'} than last week`
    : weeklySavingsCents > 0
      ? 'verified savings this week'
      : matchedCoupons > 0
        ? `matched coupon${matchedCoupons !== 1 ? 's' : ''} ready`
        : 'verified deals available this week';
  const momentumRankTitle = streakWeeks > 0
    ? `${streakWeeks} week streak`
    : totalVerifiedSavingsCents > 0
      ? fmtCents(totalVerifiedSavingsCents)
      : 'No trips yet';
  const momentumRankSub = streakWeeks > 0
    ? 'from verified shopping activity'
    : totalVerifiedSavingsCents > 0
      ? 'total verified savings'
      : `available in ${wealthData?.location || 'your area'}`;

  const onRefreshHome = () => {
    setRefreshing(true);
    fetchProfile();
    loadDynamicLayout();
    loadTopStacks(true);
    loadWeeklyPlan();
  };

  // ── Personalization locals (read once per render) ───────────────────────────
  const labels = SECTION_LABELS[experienceType] || SECTION_LABELS.saver;
  const meta   = EXPERIENCE_META[experienceType] || EXPERIENCE_META.saver;
  const fallbackOrder = SECTION_ORDER[experienceType] || SECTION_ORDER.saver;
  const order  = mapMemoryLayoutToHomeSections(dynamicLayout?.sections, fallbackOrder);
  const homeAlerts = Array.isArray(dynamicLayout?.alerts) ? dynamicLayout.alerts : [];

  // ── Section render helpers (inner functions — called with {fn()}, not <Fn/>) ─

  function renderTopStacks() {
    return (
      <View style={styles.topStacksSection}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Feather name={labels.topIcon} size={18} color={BRAND.primaryGreen} />
            <Text style={styles.sectionTitle}>{labels.topStacks}</Text>
          </View>
          {sortedTopStacks.length > 1 && (
            <TouchableOpacity style={styles.seeAllBtn} onPress={goToExplore}>
              <Text style={styles.seeAllTxt}>See all</Text>
              <Feather name="chevron-right" size={18} color={BRAND.ink} />
            </TouchableOpacity>
          )}
        </View>

        {stacksLoading && sortedTopStacks.length === 0 && (
          <ActivityIndicator size="small" color={BRAND.primaryGreen} style={{ marginVertical: 16 }} />
        )}

        {!stacksLoading && sortedTopStacks.length === 0 && (
          <View style={styles.emptyStackBox}>
            <Feather name="database" size={22} color={BRAND.primaryGreen} />
            <View style={{ flex: 1 }}>
              <Text style={styles.emptyStackTitle}>Waiting for live deal feed.</Text>
              <Text style={styles.emptyStackSub}>Pull to refresh after deals are generated.</Text>
            </View>
          </View>
        )}

        {sortedTopStacks[0] && <FeaturedStackCard stack={sortedTopStacks[0]} onPress={navigateToStack} />}

        {sortedTopStacks.slice(1).map((stack) => (
          <CompactStackRow key={stack.id} stack={stack} onPress={navigateToStack} />
        ))}
      </View>
    );
  }

  function renderHotDeals() {
    return (
      <View>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionTitleRow}>
            <Feather name="trending-down" size={18} color={BRAND.orange} />
            <Text style={styles.sectionTitle}>{labels.hotDeals}</Text>
            <View style={styles.newLowsPill}>
              <Text style={styles.newLowsTxt}>{sortedHomeDeals.length} live</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.seeAllBtn} onPress={goToExplore}>
            <Text style={styles.seeAllTxt}>See all</Text>
            <Feather name="chevron-right" size={18} color={BRAND.ink} />
          </TouchableOpacity>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.priceDropRail}>
          {sortedHomeDeals.map(item => (
            <PriceDropCard
              key={`${item.id}`}
              item={item}
              onPress={() => {
                trackInteraction(item.stack?.meal_type || 'deal', 'deal_click');
                navigateToStack(item.stack);
              }}
            />
          ))}
          {sortedHomeDeals.length === 0 && (
            <View style={styles.emptyDealCard}>
              <Feather name="database" size={28} color={BRAND.primaryGreen} />
              <Text style={styles.emptyDealTitle}>Waiting for live deal feed.</Text>
              <Text style={styles.emptyDealSub}>Verified Snippd deals will appear here after /generate-stacks writes to app_home_feed.</Text>
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  function renderBuyingPower() {
    return (
      <View style={styles.buyingPowerCard}>
        <LinearGradient colors={['#F1FFF6', '#FFFFFF']} style={styles.buyingPowerTop}>
          <Feather name="bar-chart-2" size={20} color={BRAND.deepGreen} />
          <Text style={styles.buyingPowerTitle}>Your Weekly Buying Power</Text>
          <TouchableOpacity style={styles.budgetEditBtn} onPress={openBudgetEditor} activeOpacity={0.85}>
            <Feather name="edit-2" size={13} color={BRAND.deepGreen} />
            <Text style={styles.budgetEditTxt}>Update</Text>
          </TouchableOpacity>
        </LinearGradient>
        <View style={styles.buyingPowerBody}>
          <View style={styles.budgetBlock}>
            <Text style={styles.metricLabel}>Weekly Budget</Text>
            <Text style={styles.bigBudget}>{fmtCents(weeklyBudgetCents).replace('.00', '')}</Text>
            <Text style={styles.metricSub}>for {getWeekRange()}</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.optimizedBlock}>
            <View style={styles.inlineMetrics}>
              <View>
                <Text style={styles.metricLabel}>Optimized Spend</Text>
                <Text style={styles.optimizedSpend}>{fmtCents(optimizedSpendCents).replace('.00', '')}</Text>
              </View>
              <View>
                <Text style={styles.metricLabel}>Est. Savings</Text>
                <Text style={styles.savingsMetric}>{fmtCents(estimatedSavingsCents).replace('.00', '')}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: progressPct }]} />
            </View>
            {savingsPct > 0
              ? <Text style={styles.savingsLine}>You're saving {savingsPct}% this week.</Text>
              : <Text style={styles.savingsLine}>Add items to your cart to see savings.</Text>
            }
          </View>
        </View>
      </View>
    );
  }

  function renderFeatureGrid() {
    return (
      <View style={styles.featureGrid}>
        <TouchableOpacity
          style={[styles.dinnerCard, isWide && styles.gridHalf]}
          activeOpacity={0.88}
          onPress={() => {
            trackInteraction('meal', 'dinner_plan_click');
            trackMemoryInteraction({
              event_type: 'meal_viewed',
              entity_type: 'meal',
              entity_id: dinnerName || 'weekly_dinner_plan',
                cost: dinnerPrice ?? undefined,
                metadata: { source: 'HomeScreen', stores: dinnerStores },
            });
            handlePress('ChefStash', { source: 'home_tonights_dinner' });
          }}
        >
          <View style={styles.dinnerCopy}>
            <View style={styles.cardLabelRow}>
              <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={BRAND.orange} />
              <Text style={[styles.featureLabel, { color: BRAND.orange }]}>Tonight's Dinner</Text>
            </View>
            <Text style={styles.dinnerPrice}>
              {hasDinnerPlan && dinnerPrice != null ? `$${Number(dinnerPrice).toFixed(2)}` : 'Plan syncing'}{' '}
              <Text style={styles.perServing}>{hasDinnerPlan && dinnerPrice != null ? 'per serving' : ''}</Text>
            </Text>
            <Text style={styles.dinnerName}>{hasDinnerPlan ? dinnerName : 'Dinner plan pending live prices'}</Text>
            <Text style={styles.dinnerSub}>
              {hasDinnerPlan && dinnerStores ? `Optimized across ${dinnerStores}` : 'Refresh after the weekly plan is generated.'}
            </Text>
            <View style={styles.recipeBtn}>
              <Text style={styles.recipeBtnTxt}>{hasDinnerPlan ? 'View Recipe Breakdown' : 'Refresh Live Deals'}</Text>
              <Feather name="chevron-right" size={18} color={BRAND.orange} />
            </View>
          </View>
          {hasDinnerPlan ? (
            <Image source={require('../assets/stack-protein.png.png')} style={styles.dinnerImage} resizeMode="contain" />
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity style={[styles.momentumPanel, isWide && styles.gridHalf]} activeOpacity={0.88} onPress={() => handlePress('Wins')}>
          <View style={styles.cardLabelRow}>
            <Feather name="bar-chart-2" size={18} color={BRAND.purple} />
            <Text style={[styles.featureLabel, { color: BRAND.purple }]}>Savings Momentum</Text>
          </View>
          <Text style={styles.momentumIntro}>You're saving</Text>
          <Text style={styles.momentumBig}>{momentumHeadline}</Text>
          <Text style={styles.momentumSmall}>{momentumContext}</Text>
          <View style={styles.momentumRule} />
          <View style={styles.rankRow}>
            <View style={styles.rankIcon}>
              <Feather name="award" size={20} color={BRAND.purple} />
            </View>
            <View>
              <Text style={styles.rankTitle}>{momentumRankTitle}</Text>
              <Text style={styles.rankSub}>{momentumRankSub}</Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  function renderReceipt() {
    return (
      <View>
        <View style={styles.receiptCard}>
          <View style={styles.scanIcon}>
            <MaterialCommunityIcons name="receipt-text-outline" size={30} color={BRAND.primaryGreen} />
          </View>
          <View style={styles.receiptCopy}>
            <Text style={styles.receiptTitle}>Scan & Unlock Hidden Savings</Text>
            <Text style={styles.receiptSub}>
              {matchedCoupons > 0
                ? `${matchedCoupons} matched coupon${matchedCoupons !== 1 ? 's' : ''} found for this cart.`
                : 'Snap your receipt to earn credits and improve your future deals.'}
            </Text>
          </View>
          <TouchableOpacity style={styles.receiptBtn} onPress={() => handlePress('ReceiptUpload')} activeOpacity={0.88}>
            <Feather name="camera" size={17} color={BRAND.white} />
            <Text style={styles.receiptBtnTxt}>Snap Receipt</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.receiptEarn}>
          {digitalSavings > 0 ? `${fmtSavings(digitalSavings)} in digital savings ready` : 'Earn 5 credits'}
        </Text>
      </View>
    );
  }

  function renderQuickActions() {
    const actions = [
      { icon: 'calendar', label: 'Plan My Week', onPress: () => handlePress('PlanTab', { screen: 'WeeklyPlan' }) },
      { icon: 'camera', label: 'Scan Item', onPress: () => navigation.navigate('BarcodeScanner') },
    ];
    return (
      <View style={styles.quickActionsRow}>
        {actions.map(({ icon, label, onPress }) => (
          <TouchableOpacity key={label} style={styles.quickActionBtn} onPress={onPress} activeOpacity={0.85}>
            <View style={styles.quickActionIcon}>
              <Feather name={icon} size={20} color={BRAND.primaryGreen} />
            </View>
            <Text style={styles.quickActionLabel}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  function renderSection(key) {
    switch (key) {
      case 'topStacks':   return renderTopStacks();
      case 'hotDeals':    return renderHotDeals();
      case 'buyingPower': return renderBuyingPower();
      case 'featureGrid': return renderFeatureGrid();
      case 'receipt':     return renderReceipt();
      default:            return null;
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {showQuickOnboarding && onboardingUserId && (
        <QuickOnboardingModal
          userId={onboardingUserId}
          onDone={() => {
            setShowQuickOnboarding(false);
            recordMemoryEvent({
              event_type: 'onboarding_completed',
              entity_type: 'user',
              entity_id: onboardingUserId,
              metadata: { source: 'QuickOnboardingModal' },
            });
            // Reload prefs so dietary filters apply immediately
            loadUserPreferences();
            loadDynamicLayout();
          }}
        />
      )}

      <SafeAreaView style={styles.headerShell} edges={['top']}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.brandMark} onPress={goToSmartCart} activeOpacity={0.85}>
            <Image source={require('../assets/Snippd-White-Cart .png')} style={styles.brandMarkImage} resizeMode="contain" />
          </TouchableOpacity>
          <View style={styles.headerCopy}>
            <Text style={styles.greetingTitle}>Good morning{firstName ? `, ${firstName}` : ''}</Text>
            <Text style={styles.greetingSub}>Your smart cart is ready to save.</Text>
          </View>
          <TouchableOpacity style={styles.bellBtn} onPress={() => handlePress('Wins')} activeOpacity={0.8}>
            <MaterialCommunityIcons name="bell-outline" size={25} color={BRAND.deepGreen} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>

        <View style={styles.headerBottomRow}>
          <Text style={styles.creditPillTxt}>{credits} Credits</Text>
          <View style={styles.personalizedPill}>
            <Feather name={meta.icon} size={11} color={BRAND.primaryGreen} />
            <Text style={styles.personalizedTxt}>{meta.label}</Text>
            <Text style={styles.personalizedSub}> · {meta.sub}</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        refreshControl={(
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshHome}
            tintColor={BRAND.primaryGreen}
          />
        )}
      >
        {/* ── Hero — always first ─────────────────────────────────────────── */}
        <TouchableOpacity activeOpacity={0.92} onPress={goToSmartCart}>
          <LinearGradient
            colors={[BRAND.deepGreen, '#006D3B']}
            style={styles.smartHero}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.heroCopy}>
              <Text style={styles.heroEyebrow}>This Week's Optimized Plan</Text>
              <Text style={styles.heroTitle}>{heroTitle}</Text>
              <Text style={styles.heroSub}>{heroSub}</Text>
              <View style={styles.heroCta}>
                <Text style={styles.heroCtaTxt}>{topStack ? 'View My Smart Cart' : 'Build My Plan'}</Text>
                <Feather name="chevron-right" size={22} color={BRAND.deepGreen} />
              </View>
            </View>
            <Image source={require('../assets/hero-banner.png')} style={styles.heroImage} resizeMode="contain" />
          </LinearGradient>
        </TouchableOpacity>

        {/* ── Quick action buttons ────────────────────────────────────────── */}
        {renderQuickActions()}

        {/* ── Live geofence card ──────────────────────────────────────────── */}
        {liveCard && (
          <TouchableOpacity style={styles.liveCardBanner} activeOpacity={0.9} onPress={() => setLiveCard(null)}>
            <View style={styles.liveCardPulse} />
            <View style={{ flex: 1 }}>
              <Text style={styles.liveCardStore}>{liveCard.store.store_name}</Text>
              <Text style={styles.liveCardSavings}>
                {liveCard.items.length} list items nearby. Save ${(liveCard.total_savings / 100).toFixed(2)} today.
              </Text>
              {liveCard.items.slice(0, 3).map((item, i) => (
                <Text key={`${item.name}-${i}`} style={styles.liveCardItem}>{item.name}</Text>
              ))}
            </View>
            <Feather name="x" size={16} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}

        {/* ── Anticipatory plan strip ─────────────────────────────────────── */}
        {anticipatoryPlan && (
          <TouchableOpacity
            style={styles.optimizedStrip}
            activeOpacity={0.88}
            onPress={async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (user) {
                  await supabase.rpc('mark_plan_viewed', {
                    p_plan_id: anticipatoryPlan.plan_id,
                    p_user_id: user.id,
                  });
                }
              } catch {}
              setAnticipatoryPlan(null);
              handlePress('PlanTab');
            }}
          >
            <Feather name="zap" size={20} color={BRAND.primaryGreen} />
            <View style={{ flex: 1 }}>
              <Text style={styles.optimizedStripTitle}>
                {anticipatoryPlan.essentials_matched} essentials hit low prices this week
              </Text>
              <Text style={styles.optimizedStripSub}>
                Estimated savings: {fmtCents(anticipatoryPlan.total_savings_cents || 0)}
              </Text>
            </View>
            <Feather name="chevron-right" size={18} color={BRAND.primaryGreen} />
          </TouchableOpacity>
        )}

        {/* ── Dynamic sections — order driven by experienceType ───────────── */}
        {homeAlerts.map(alert => (
          <View key={alert.type || alert.message} style={styles.memoryAlert}>
            <Feather
              name={alert.type === 'store_accuracy' ? 'alert-triangle' : 'shield'}
              size={16}
              color={BRAND.deepGreen}
            />
            <Text style={styles.memoryAlertText}>{alert.message}</Text>
          </View>
        ))}

        {/* ── Profile completion prompt — hidden once profile is ≥80% ──────── */}
        {profileCompletePct < 80 && profileCompletePct > 0 && (
          <TouchableOpacity
            style={styles.profilePromptCard}
            onPress={() => navigation.navigate('ProfileTab')}
            activeOpacity={0.85}
          >
            <View style={styles.profilePromptLeft}>
              <View style={styles.profilePromptIcon}>
                <Feather name="user" size={16} color={BRAND.primaryGreen} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.profilePromptTitle}>Make your next plan smarter</Text>
                <Text style={styles.profilePromptSub}>
                  Profile {profileCompletePct}% complete — your deals get better each time.
                </Text>
                <View style={styles.profilePromptBar}>
                  <View style={[styles.profilePromptBarFill, { width: `${profileCompletePct}%` }]} />
                </View>
              </View>
            </View>
            <View style={styles.profilePromptCta}>
              <Text style={styles.profilePromptCtaText}>Answer 2 quick questions</Text>
              <Feather name="chevron-right" size={14} color={BRAND.primaryGreen} />
            </View>
          </TouchableOpacity>
        )}

        {order.map(key => (
          <React.Fragment key={key}>
            {renderSection(key)}
          </React.Fragment>
        ))}

        {/* ── Normalized offer engine: best savings (safe, renders nothing when empty) */}
        <BestSavingsPreview />

        {/* ── Fixed footer ────────────────────────────────────────────────── */}
        {streakWeeks > 0 && (
          <TouchableOpacity style={styles.streakStrip} activeOpacity={0.86} onPress={handleResetWeek}>
            <Feather name="repeat" size={17} color={BRAND.deepGreen} />
            <Text style={styles.streakStripTxt}>{streakWeeks} week savings streak. Tap when you're ready to reset this week's spend.</Text>
          </TouchableOpacity>
        )}

        {momentumTicker && (
          <Text style={styles.disclosureText}>{momentumTicker.tagline}</Text>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      <Modal
        visible={budgetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBudgetModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.budgetModalCard}>
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalTitle}>Update Weekly Budget</Text>
              <TouchableOpacity onPress={() => setBudgetModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={20} color={BRAND.ink} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSub}>This updates your weekly budget everywhere Snippd uses it.</Text>
            <View style={styles.budgetInputWrap}>
              <Text style={styles.budgetDollar}>$</Text>
              <TextInput
                value={budgetDraft}
                onChangeText={setBudgetDraft}
                keyboardType="decimal-pad"
                placeholder="150"
                placeholderTextColor="#94A3B8"
                style={styles.budgetInput}
              />
            </View>
            <TouchableOpacity
              style={[styles.saveBudgetBtn, budgetSaving && { opacity: 0.7 }]}
              onPress={saveWeeklyBudget}
              disabled={budgetSaving}
              activeOpacity={0.88}
            >
              {budgetSaving
                ? <ActivityIndicator size="small" color={BRAND.white} />
                : <Text style={styles.saveBudgetTxt}>Save Budget</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Sub-components (defined outside to prevent remount on parent re-render) ───

const FeaturedStackCard = ({ stack, onPress }) => (
  <TouchableOpacity style={styles.topStackFeatured} onPress={() => onPress(stack)} activeOpacity={0.88}>
    <View style={styles.topStackFeaturedHeader}>
      <View style={styles.topStoreBadge}>
        <Text style={styles.topStoreBadgeTxt}>{String(stack.store || 'Store').toUpperCase()}</Text>
      </View>
      {stack.best_shop_window ? <Text style={styles.shopWindowTxt}>{stack.best_shop_window}</Text> : null}
    </View>
    <Text style={styles.topStackTitle} numberOfLines={2}>{stack.title || 'Snippd Deal'}</Text>
    <View style={styles.topStackMetrics}>
      <View>
        <Text style={styles.topStackPrice}>{fmtCents(stack.final_out_of_pocket_cents)}</Text>
        <Text style={styles.topStackPriceSub}>out of pocket</Text>
      </View>
      <View style={styles.topStackSavingsBadge}>
        <Text style={styles.topStackSavingsPct}>{stack.savings_percent || 0}%</Text>
        <Text style={styles.topStackSavingsSub}>savings</Text>
      </View>
    </View>
    {stack.item_count > 0 && (
      <Text style={styles.topStackItemCount}>{stack.item_count} item{stack.item_count !== 1 ? 's' : ''} · {String(stack.stack_type || 'Stack').replace(/_/g, ' ')}</Text>
    )}
    <View style={styles.topStackCta}>
      <Feather name="layers" size={15} color={BRAND.white} />
      <Text style={styles.topStackCtaTxt}>Start Deal</Text>
      <Feather name="chevron-right" size={15} color={BRAND.white} />
    </View>
  </TouchableOpacity>
);

const CompactStackRow = ({ stack, onPress }) => (
  <TouchableOpacity style={styles.moreStackRow} onPress={() => onPress(stack)} activeOpacity={0.85}>
    <View style={styles.moreStackIcon}>
      <Feather name="layers" size={18} color={BRAND.primaryGreen} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={styles.moreStackStore} numberOfLines={1}>{stack.store}</Text>
      <Text style={styles.moreStackTitle} numberOfLines={1}>{stack.title || 'Snippd Deal'}</Text>
      {stack.item_count > 0 && <Text style={styles.moreStackMeta}>{stack.item_count} items</Text>}
    </View>
    <View style={styles.moreStackRight}>
      <Text style={styles.moreStackPrice}>{fmtCents(stack.final_out_of_pocket_cents)}</Text>
      <View style={[styles.moreStackPct, stack.savings_percent >= 50 && { backgroundColor: '#DCFCE7' }]}>
        <Text style={[styles.moreStackPctTxt, stack.savings_percent >= 50 && { color: BRAND.primaryGreen }]}>
          {stack.savings_percent || 0}%
        </Text>
      </View>
    </View>
    <Feather name="chevron-right" size={16} color={BRAND.greyText} />
  </TouchableOpacity>
);

const PriceDropCard = ({ item, onPress }) => (
  <TouchableOpacity style={styles.priceDropCard} onPress={onPress} activeOpacity={0.9}>
    <View style={styles.dropBadge}>
      <Text style={styles.dropBadgeTxt}>-{item.dropPct || 0}%</Text>
    </View>
    <Image source={item.image} style={styles.priceDropImage} resizeMode="contain" />
    <Text style={styles.priceBrand}>{item.brand}</Text>
    <Text style={styles.priceName}>{item.name}</Text>
    <View style={styles.priceRow}>
      {item.oldCents > item.newCents && <Text style={styles.oldPrice}>{fmtCents(item.oldCents)}</Text>}
      <Text style={styles.newPrice}>{fmtCents(item.newCents)}</Text>
    </View>
    <Text style={styles.stackNote}>{item.stackNote}</Text>
    <View style={styles.cardFooterRow}>
      <View style={styles.lowestPill}>
        <Text style={styles.lowestTxt}>{item.lowestLabel}</Text>
      </View>
      <View style={styles.retailerBubble}>
        <Text style={styles.retailerTxt}>{item.retailer}</Text>
      </View>
    </View>
  </TouchableOpacity>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgLight },
  headerShell: { backgroundColor: BRAND.bgLight, paddingBottom: 10 },
  headerInner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 10, gap: 14 },
  brandMark: { width: 58, height: 58, borderRadius: 16, backgroundColor: BRAND.deepGreen, alignItems: 'center', justifyContent: 'center', ...CARD_SHADOW },
  brandMarkImage: { width: 34, height: 34 },
  headerCopy: { flex: 1 },
  greetingTitle: { fontSize: 24, fontWeight: '900', color: '#10172A' },
  greetingSub: { fontSize: 15, color: '#475569', marginTop: 3 },
  bellBtn: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', right: 9, top: 8, width: 7, height: 7, borderRadius: 4, backgroundColor: BRAND.primaryGreen },

  // Header bottom row: credits + personalized pill side by side
  headerBottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 4 },
  creditPillTxt: { overflow: 'hidden', backgroundColor: '#DDFADD', color: BRAND.deepGreen, fontSize: 13, fontWeight: '800', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 14 },

  // "Personalized for You" indicator
  personalizedPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F0FDF4', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#BBF7D0' },
  personalizedTxt: { color: BRAND.primaryGreen, fontSize: 11, fontWeight: '800' },
  personalizedSub: { color: '#64748B', fontSize: 11, fontWeight: '500' },

  scrollBody: { paddingHorizontal: 20, paddingTop: 8 },
  smartHero: { minHeight: 244, borderRadius: 18, padding: 28, overflow: 'hidden', flexDirection: 'row', alignItems: 'center', ...CARD_SHADOW },
  heroCopy: { flex: 1.1, zIndex: 2 },
  heroEyebrow: { color: BRAND.white, fontSize: 16, fontWeight: '900', marginBottom: 14 },
  heroTitle: { color: BRAND.white, fontSize: width < 380 ? 27 : 32, lineHeight: width < 380 ? 34 : 40, fontWeight: '900', maxWidth: 430 },
  heroSub: { color: 'rgba(255,255,255,0.9)', fontSize: 16, lineHeight: 24, marginTop: 14, maxWidth: 410 },
  heroCta: { marginTop: 26, backgroundColor: BRAND.white, borderRadius: 16, paddingHorizontal: 18, height: 56, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 18 },
  heroCtaTxt: { color: BRAND.deepGreen, fontSize: 16, fontWeight: '900' },
  heroImage: { width: width < 430 ? 160 : 235, height: width < 430 ? 170 : 220, marginRight: -28, marginBottom: -52, alignSelf: 'flex-end' },
  liveCardBanner: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#0D1B4B', borderRadius: 16, marginTop: 16, padding: 14, gap: 10 },
  liveCardPulse: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ADE80', marginTop: 4, flexShrink: 0 },
  liveCardStore: { fontSize: 14, fontWeight: '900', color: BRAND.white, marginBottom: 4 },
  liveCardSavings: { fontSize: 12, color: '#86EFAC', marginBottom: 4 },
  liveCardItem: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  optimizedStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 1, borderColor: '#BDF3CD', padding: 14, marginTop: 16 },
  optimizedStripTitle: { color: BRAND.deepGreen, fontSize: 14, fontWeight: '900' },
  optimizedStripSub: { color: '#3F7C55', fontSize: 12, marginTop: 3 },
  memoryAlert: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF3', borderRadius: 14, borderWidth: 1, borderColor: '#BDF3CD', padding: 13, marginTop: 12 },
  memoryAlertText: { flex: 1, color: BRAND.deepGreen, fontSize: 13, fontWeight: '800', lineHeight: 18 },

  // ── Profile completion card ───────────────────────────────────────────────
  profilePromptCard: {
    backgroundColor: BRAND.white, borderRadius: 16, padding: 16, gap: 10,
    marginHorizontal: 16, marginTop: 12,
    borderWidth: 1, borderColor: BRAND.border,
    ...Platform.select({
      web: { boxShadow: '0px 2px 8px rgba(0,0,0,0.06)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
    }),
  },
  profilePromptLeft: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  profilePromptIcon: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: BRAND.lightGreen, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  profilePromptTitle: { fontSize: 14, fontWeight: '700', color: BRAND.ink, marginBottom: 2 },
  profilePromptSub:   { fontSize: 12, color: BRAND.greyText, marginBottom: 8, lineHeight: 17 },
  profilePromptBar:   { height: 4, backgroundColor: BRAND.border, borderRadius: 2, overflow: 'hidden' },
  profilePromptBarFill: { height: '100%', backgroundColor: BRAND.primaryGreen, borderRadius: 2 },
  profilePromptCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4,
  },
  profilePromptCtaText: { fontSize: 12, fontWeight: '700', color: BRAND.primaryGreen },
  sectionHeader: { marginTop: 34, marginBottom: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sectionTitleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: { color: BRAND.ink, fontSize: 19, fontWeight: '900' },
  newLowsPill: { backgroundColor: '#DDFADD', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 },
  newLowsTxt: { color: BRAND.deepGreen, fontSize: 12, fontWeight: '800' },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 4 },
  seeAllTxt: { color: BRAND.ink, fontSize: 14, fontWeight: '700' },
  priceDropRail: { gap: 12, paddingRight: 20, paddingBottom: 4 },
  priceDropCard: { width: 218, minHeight: 286, backgroundColor: BRAND.white, borderRadius: 14, borderWidth: 1, borderColor: '#EDF2F7', padding: 14, ...CARD_SHADOW },
  dropBadge: { position: 'absolute', left: 14, top: 14, zIndex: 2, backgroundColor: '#FFE1EA', borderRadius: 13, paddingHorizontal: 10, paddingVertical: 6 },
  dropBadgeTxt: { color: '#E11D48', fontSize: 13, fontWeight: '900' },
  priceDropImage: { width: '100%', height: 108, marginTop: 12, marginBottom: 14 },
  priceBrand: { color: BRAND.ink, fontSize: 15, fontWeight: '800' },
  priceName: { color: '#334155', fontSize: 14, marginTop: 2, minHeight: 36 },
  priceRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, marginTop: 8 },
  oldPrice: { color: '#64748B', fontSize: 14, textDecorationLine: 'line-through', marginBottom: 3 },
  newPrice: { color: BRAND.primaryGreen, fontSize: 24, fontWeight: '900' },
  stackNote: { color: '#64748B', fontSize: 11, lineHeight: 15, marginTop: 6, minHeight: 30 },
  cardFooterRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, gap: 8 },
  lowestPill: { flex: 1, backgroundColor: '#DDFADD', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 8 },
  lowestTxt: { color: BRAND.deepGreen, fontSize: 11, fontWeight: '800' },
  retailerBubble: { width: 28, height: 28, borderRadius: 14, backgroundColor: BRAND.primaryGreen, alignItems: 'center', justifyContent: 'center' },
  retailerTxt: { color: BRAND.white, fontSize: 13, fontWeight: '900' },
  emptyDealCard: { width: 280, minHeight: 220, backgroundColor: BRAND.white, borderRadius: 14, borderWidth: 1, borderColor: '#BDF3CD', padding: 22, alignItems: 'center', justifyContent: 'center', gap: 10, ...CARD_SHADOW },
  emptyDealTitle: { color: BRAND.ink, fontSize: 15, fontWeight: '800', textAlign: 'center', marginTop: 6 },
  emptyDealSub: { color: BRAND.greyText, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  buyingPowerCard: { backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 1, borderColor: '#BDF3CD', overflow: 'hidden', marginTop: 34, ...CARD_SHADOW },
  buyingPowerTop: { minHeight: 58, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10 },
  buyingPowerTitle: { color: BRAND.deepGreen, fontSize: 18, fontWeight: '900' },
  budgetEditBtn: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#E8F8F0', borderWidth: 1, borderColor: '#BDF3CD', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 999 },
  budgetEditTxt: { color: BRAND.deepGreen, fontSize: 12, fontWeight: '900' },
  buyingPowerBody: { padding: 22, flexDirection: isWide ? 'row' : 'column', gap: 22 },
  budgetBlock: { minWidth: isWide ? 210 : 'auto' },
  metricLabel: { color: '#475569', fontSize: 14, marginBottom: 8 },
  bigBudget: { color: BRAND.deepGreen, fontSize: 58, fontWeight: '900', lineHeight: 64 },
  metricSub: { color: BRAND.ink, fontSize: 14, marginTop: 6 },
  metricDivider: { width: isWide ? 1 : '100%', height: isWide ? '100%' : 1, minHeight: isWide ? 110 : 1, backgroundColor: '#E5E7EB' },
  optimizedBlock: { flex: 1, justifyContent: 'center' },
  inlineMetrics: { flexDirection: 'row', justifyContent: 'space-between', gap: 18 },
  optimizedSpend: { color: '#475569', fontSize: 28, fontWeight: '900' },
  savingsMetric: { color: BRAND.deepGreen, fontSize: 28, fontWeight: '900' },
  progressTrack: { height: 14, borderRadius: 8, backgroundColor: '#EEF3EF', overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', backgroundColor: '#7BCB5E', borderRadius: 8 },
  savingsLine: { color: BRAND.primaryGreen, fontSize: 15, fontWeight: '800', marginTop: 12 },
  featureGrid: { flexDirection: isWide ? 'row' : 'column', gap: 16, marginTop: 28 },
  gridHalf: { flex: 1 },
  dinnerCard: { minHeight: 258, backgroundColor: '#FFF8EA', borderRadius: 18, borderWidth: 1, borderColor: '#FED7AA', padding: 22, overflow: 'hidden', flexDirection: 'row', ...CARD_SHADOW },
  dinnerCopy: { flex: 1, zIndex: 2 },
  cardLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 },
  featureLabel: { fontSize: 16, fontWeight: '900' },
  dinnerPrice: { color: '#111827', fontSize: 32, fontWeight: '900' },
  perServing: { fontSize: 15, fontWeight: '600' },
  dinnerName: { color: '#111827', fontSize: 16, fontWeight: '800', marginTop: 10 },
  dinnerSub: { color: '#475569', fontSize: 14, lineHeight: 20, marginTop: 6, maxWidth: 200 },
  recipeBtn: { marginTop: 22, borderWidth: 1, borderColor: '#FDBA74', borderRadius: 14, paddingHorizontal: 14, height: 44, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.white },
  recipeBtnTxt: { color: BRAND.orange, fontSize: 13, fontWeight: '900' },
  dinnerImage: { width: 150, height: 150, alignSelf: 'center', marginRight: -36 },
  scanItemCard: { backgroundColor: '#F0FDF4', borderRadius: 18, borderWidth: 1, borderColor: '#A7F3D0', padding: 20, gap: 4, ...CARD_SHADOW },
  scanItemTitle: { fontSize: 18, fontWeight: '800', color: BRAND.deepGreen },
  scanItemSub:   { fontSize: 13, color: BRAND.greyText, lineHeight: 18 },
  momentumPanel: { minHeight: 258, backgroundColor: '#FBFAFF', borderRadius: 18, borderWidth: 1, borderColor: '#DDD6FE', padding: 24, ...CARD_SHADOW },
  momentumIntro: { color: BRAND.ink, fontSize: 15, marginTop: 2 },
  momentumBig: { color: BRAND.purple, fontSize: 48, fontWeight: '900', marginTop: 4 },
  momentumSmall: { color: BRAND.ink, fontSize: 15 },
  momentumRule: { height: 1, backgroundColor: '#DDD6FE', marginVertical: 22 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rankIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: '#ECE7FF', alignItems: 'center', justifyContent: 'center' },
  rankTitle: { color: BRAND.purple, fontSize: 22, fontWeight: '900' },
  rankSub: { color: '#475569', fontSize: 13, marginTop: 2 },
  receiptCard: { marginTop: 28, backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 1, borderColor: '#BDF3CD', padding: 20, flexDirection: isWide ? 'row' : 'column', alignItems: isWide ? 'center' : 'stretch', gap: 18, ...CARD_SHADOW },
  scanIcon: { width: 66, height: 66, borderRadius: 18, borderWidth: 2, borderColor: BRAND.primaryGreen, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FDF4' },
  receiptCopy: { flex: 1 },
  receiptTitle: { color: BRAND.deepGreen, fontSize: 18, fontWeight: '900' },
  receiptSub: { color: '#475569', fontSize: 15, lineHeight: 22, marginTop: 4 },
  receiptBtn: { height: 52, borderRadius: 14, backgroundColor: BRAND.primaryGreen, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  receiptBtnTxt: { color: BRAND.white, fontSize: 15, fontWeight: '900' },
  receiptEarn: { alignSelf: isWide ? 'flex-end' : 'center', color: BRAND.deepGreen, fontSize: 13, fontWeight: '800', marginTop: 8, marginRight: isWide ? 84 : 0 },
  aiStatus: { marginTop: 24, backgroundColor: BRAND.deepGreen, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...CARD_SHADOW },
  aiSparkle: { width: 38, height: 38, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  aiTitle: { color: BRAND.white, fontSize: 15, fontWeight: '900' },
  aiSub: { color: 'rgba(255,255,255,0.85)', fontSize: 14, marginTop: 2 },
  aiStoreBadgeRow: { flexDirection: 'row', alignItems: 'center' },
  aiStoreBadge: { width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.white, borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)', alignItems: 'center', justifyContent: 'center', marginLeft: -5 },
  aiStoreBadgeTxt: { color: BRAND.deepGreen, fontSize: 14, fontWeight: '900' },
  streakStrip: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#ECFDF3', borderRadius: 14, padding: 14 },
  streakStripTxt: { flex: 1, color: BRAND.deepGreen, fontSize: 13, fontWeight: '700' },
  disclosureText: { color: '#64748B', fontSize: 12, lineHeight: 18, textAlign: 'center', marginTop: 16 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(4, 54, 29, 0.42)', justifyContent: 'center', padding: 22 },
  budgetModalCard: { backgroundColor: BRAND.white, borderRadius: 18, padding: 20, borderWidth: 1, borderColor: '#BDF3CD', ...CARD_SHADOW },
  modalHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { color: BRAND.deepGreen, fontSize: 20, fontWeight: '900' },
  modalSub: { color: BRAND.greyText, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  budgetInputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: BRAND.border, borderRadius: 14, backgroundColor: '#F8FAFC', paddingHorizontal: 14, marginBottom: 16 },
  budgetDollar: { color: BRAND.deepGreen, fontSize: 28, fontWeight: '900', marginRight: 8 },
  budgetInput: { flex: 1, minHeight: 56, color: BRAND.ink, fontSize: 28, fontWeight: '900' },
  saveBudgetBtn: { height: 52, borderRadius: 14, backgroundColor: BRAND.primaryGreen, alignItems: 'center', justifyContent: 'center' },
  saveBudgetTxt: { color: BRAND.white, fontSize: 15, fontWeight: '900' },
  topStacksSection: { marginBottom: 8 },
  topStackFeatured: { backgroundColor: BRAND.deepGreen, borderRadius: 18, padding: 20, marginBottom: 8, ...CARD_SHADOW },
  topStackFeaturedHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  topStoreBadge: { backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  topStoreBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#C5FFBC', letterSpacing: 1.5 },
  shopWindowTxt: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  topStackTitle: { fontSize: 18, fontWeight: '900', color: BRAND.white, marginBottom: 12, lineHeight: 24 },
  topStackMetrics: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 8 },
  topStackPrice: { fontSize: 38, fontWeight: '900', color: BRAND.white, letterSpacing: -1 },
  topStackPriceSub: { fontSize: 11, color: 'rgba(255,255,255,0.55)', fontWeight: '600' },
  topStackSavingsBadge: { backgroundColor: BRAND.primaryGreen, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 10, alignItems: 'center' },
  topStackSavingsPct: { fontSize: 24, fontWeight: '900', color: BRAND.white, lineHeight: 28 },
  topStackSavingsSub: { fontSize: 10, color: 'rgba(255,255,255,0.8)', fontWeight: '700', letterSpacing: 0.5 },
  topStackItemCount: { fontSize: 12, color: 'rgba(255,255,255,0.5)', fontWeight: '600', marginBottom: 12 },
  topStackCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, paddingVertical: 12 },
  topStackCtaTxt: { fontSize: 14, fontWeight: '800', color: BRAND.white },
  moreStackRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND.white, borderRadius: 14, padding: 14, marginBottom: 6, ...CARD_SHADOW },
  moreStackIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: '#F0FBF0', alignItems: 'center', justifyContent: 'center' },
  moreStackStore: { fontSize: 10, fontWeight: '800', color: BRAND.primaryGreen, letterSpacing: 1, marginBottom: 2 },
  moreStackTitle: { fontSize: 14, fontWeight: '700', color: BRAND.ink },
  moreStackMeta: { fontSize: 11, color: BRAND.greyText, marginTop: 2 },
  moreStackRight: { alignItems: 'flex-end', gap: 4 },
  moreStackPrice: { fontSize: 16, fontWeight: '900', color: BRAND.ink },
  moreStackPct: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  moreStackPctTxt: { fontSize: 12, fontWeight: '800', color: BRAND.greyText },
  emptyStackBox: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: BRAND.white, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BDF3CD', ...CARD_SHADOW },
  emptyStackTitle: { color: BRAND.deepGreen, fontSize: 14, fontWeight: '900' },
  emptyStackSub: { color: BRAND.greyText, fontSize: 12, marginTop: 2 },

  // ── Quick Actions strip ───────────────────────────────────────────────────
  quickActionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  quickActionBtn: {
    flex: 1, alignItems: 'center', backgroundColor: BRAND.white,
    borderRadius: 16, paddingVertical: 16, paddingHorizontal: 8, gap: 8,
    borderWidth: 1, borderColor: BRAND.border, ...CARD_SHADOW,
  },
  quickActionIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: BRAND.lightGreen, alignItems: 'center', justifyContent: 'center',
  },
  quickActionLabel: { fontSize: 11, fontWeight: '700', color: BRAND.ink, textAlign: 'center' },
});
