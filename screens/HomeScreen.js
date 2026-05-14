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

// â”€â”€ Personalization constants (module-level â€” no re-creation per render) â”€â”€â”€â”€â”€â”€

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

// Section render order â€” fixed to match spec: budget context first, then deals, then receipt CTA.
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

// â”€â”€ Pure helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
  const validation = String(row.validation_status || row.verification_status || '').toLowerCase();
  const active = row.is_active !== false && row.status !== 'inactive' && row.status !== 'blocked';
  const blocked = validation === 'blocked' || validation === 'needs_review' || validation === 'rejected';
  return active && !blocked;
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
    .not('validation_status', 'eq', 'blocked')
    .not('validation_status', 'eq', 'needs_review')
    .order('confidence_score', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  const filtered = (data || []).filter(isVerifiedSystemStack).map(normalizeStack);
  if (filtered.length > 0) return filtered;
  // Fallback: any active feed row
  const { data: fallback } = await supabase
    .from('app_home_feed')
    .select('*')
    .eq('is_active', true)
    .order('published_at', { ascending: false })
    .limit(limit);
  return (fallback || []).map(normalizeStack);
}

// â”€â”€ Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export default function HomeScreen({ navigation }) {
  // â”€â”€ Existing state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  const [intelligenceProfile, setIntelligenceProfile] = useState(null);

  // â”€â”€ Personalization state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Category-biased stack ordering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  const goToProfileTab = () => {
    const parent = navigation?.getParent?.();
    if (parent?.navigate) parent.navigate('ProfileTab');
    else navigation?.navigate('SoftPersonalization');
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

  // â”€â”€ Personalization: load + track â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      } else {
        // Bootstrap a default row â€” fire and forget
        supabase.from('user_preferences').upsert({
          user_id:          user.id,
          budget_range:     150,
          preferred_stores: [],
          category_clicks:  {},
          last_actions:     {},
          experience_type:  'saver',
          updated_at:       new Date().toISOString(),
        }, { onConflict: 'user_id' });
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

    // Optimistic local update â€” recalculate experience type immediately
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

    // Debounced DB write â€” reads latest value via ref, not stale closure
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

  // â”€â”€ Data loading â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        setIntelligenceProfile({
          persona:      data.preferences?.persona_type ?? null,
          stores:       data.preferred_stores ?? [],
          diet:         data.lifestyle_concierge?.dietary_preference ?? [],
          foods:        data.lifestyle_concierge?.favorite_foods ?? [],
          disliked:     data.lifestyle_concierge?.disliked_foods ?? [],
          couponComfort: data.lifestyle_concierge?.coupon_comfort ?? null,
          budgetRange:  Math.round(data.weekly_budget ?? data.preferences?.budget_range ?? 0),
        });
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
      if (!stacks.length) {
        console.info('[HomeScreen] app_home_feed empty; showing weekly deal engine warming state', {
          table: 'app_home_feed',
          source: 'verified_home_feed',
        });
      }
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

      if (!stacks.length) {
        console.info('[HomeScreen] no verified stacks available after refresh', {
          table: 'app_home_feed',
          triggerGenerate,
        });
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

  // â”€â”€ Effects â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Computed display values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  // â”€â”€ Personalization locals (read once per render) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const labels = SECTION_LABELS[experienceType] || SECTION_LABELS.saver;
  const meta   = EXPERIENCE_META[experienceType] || EXPERIENCE_META.saver;
  const fallbackOrder = SECTION_ORDER[experienceType] || SECTION_ORDER.saver;
  const order  = mapMemoryLayoutToHomeSections(dynamicLayout?.sections, fallbackOrder);
  const homeAlerts = Array.isArray(dynamicLayout?.alerts) ? dynamicLayout.alerts : [];

  // â”€â”€ New design computed values â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const greetingWord = (() => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; })();
  const todayBadge = (() => { const d = ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY']; return d[new Date().getDay()] + ' ONLY'; })();
  const topDeal = sortedTopStacks[0] || null;
  const moreDeals = sortedTopStacks.slice(1, 4);
  const remainingCents = Math.max(0, weeklyBudgetCents - cartSpendCents);
  const budgetUsedPct = weeklyBudgetCents > 0 ? Math.min(1, cartSpendCents / weeklyBudgetCents) : 0;

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  return (
    <View style={s.container}>
      <StatusBar barStyle="dark-content" />

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <SafeAreaView style={s.safeHeader} edges={['top']}>
        <View style={s.headerRow}>
          <View style={s.logoBox}>
            <Image
              source={require('../assets/Snippd-White-Cart .png')}
              style={s.logoImg}
              resizeMode="contain"
            />
          </View>
          <View style={s.headerCenter}>
            <Text style={s.greeting}>
              Good {greetingWord}{firstName ? `, ${firstName}` : ''}!
            </Text>
            <Text style={s.greetingSub}>Let's save some money today.</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity onPress={() => handlePress('Wins')} style={s.bellBtn}>
              <Feather name="bell" size={22} color="#1A237E" />
            </TouchableOpacity>
            <TouchableOpacity style={s.creditsPill} onPress={openBudgetEditor} activeOpacity={0.85}>
              <Text style={s.creditsTxt}>{credits} Credits</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>

      {/* â”€â”€ Scroll body â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefreshHome}
            tintColor="#0C9E54"
          />
        }
      >
        {/* WEEK SAVINGS HERO */}
        <WeekSavingsHero
          weekRange={getWeekRange()}
          baselineCents={hasCart && cartRegularCents > 0 ? cartRegularCents : weeklyBudgetCents}
          optimizedCents={hasCart && cartSpendCents > 0 ? cartSpendCents : optimizedSpendCents}
          savingsCents={hasCart ? cartSavingsCents : estimatedSavingsCents}
          budgetCents={weeklyBudgetCents}
          items={optimizedDeals}
          stores={storeCount}
          hasCart={hasCart}
          onPress={goToSmartCart}
        />

        {/* YOUR TOP STACK */}
        {stacksLoading && !topDeal ? (
          <View style={s.loadingCard}>
            <ActivityIndicator color="#0C9E54" size="large" />
            <Text style={s.loadingTxt}>Finding your best deals...</Text>
          </View>
        ) : topDeal ? (
          <TopStackCard
            stack={topDeal}
            todayBadge={todayBadge}
            onPress={() => navigateToStack(topDeal)}
          />
        ) : (
          <View style={s.emptyCard}>
            <View style={s.dataStatusBadge}>
              <Text style={s.dataStatusTxt}>Waiting for weekly deals</Text>
            </View>
            <Feather name="inbox" size={28} color="#0C9E54" />
            <Text style={s.emptyTitle}>Your weekly deal engine is warming up</Text>
            <Text style={s.emptySub}>
              Snippd did not find active rows in app_home_feed for your verified stores yet. This usually means the weekly deals refresh has not published stacks for your profile.
            </Text>
            <View style={s.emptyActionRow}>
              <TouchableOpacity style={s.emptyPrimaryBtn} onPress={goToProfileTab} activeOpacity={0.86}>
                <Text style={s.emptyPrimaryTxt}>Build profile</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.emptySecondaryBtn} onPress={openBudgetEditor} activeOpacity={0.86}>
                <Text style={s.emptySecondaryTxt}>Add grocery budget</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.emptyWideBtn} onPress={() => loadTopStacks(false)} activeOpacity={0.86}>
              <Text style={s.emptyWideTxt}>Check back after weekly deals refresh</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Snippd Deep Brief CTA */}
        <View style={s.deepBriefCard}>
          <View style={s.deepBriefHeader}>
            <Text style={s.deepBriefTitle}>Make Snippd Smarter</Text>
            <Text style={s.deepBriefSub}>Answer a few optional questions to improve future plans for your household.</Text>
          </View>
          <TouchableOpacity
            style={s.deepBriefBtn}
            onPress={() => {
              tracker.track('deep_brief_cta_clicked', { source: 'home' });
              navigation.navigate('ConciergeOnboarding');
            }}
            activeOpacity={0.88}
          >
            <Text style={s.deepBriefBtnText}>Open Snippd Deep Brief</Text>
            <Feather name="arrow-right" size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* MORE STACKS FOR YOU */}
        {moreDeals.length > 0 && (
          <View style={s.section}>
            <View style={s.sectionHeaderRow}>
              <Text style={s.sectionTitle}>MORE STACKS FOR YOU</Text>
              <TouchableOpacity onPress={goToExplore} activeOpacity={0.8}>
                <Text style={s.seeAll}>See all</Text>
              </TouchableOpacity>
            </View>
            {moreDeals.map(stack => (
              <StackListRow
                key={stack.id}
                stack={stack}
                onPress={() => navigateToStack(stack)}
              />
            ))}
          </View>
        )}

        {/* WEEKLY DINNER PLAN ENTRY */}
        <TouchableOpacity
          style={s.weeklyPlanBanner}
          onPress={() => handlePress('WeeklyDinnerPlan')}
          activeOpacity={0.88}
        >
          <View style={s.weeklyPlanBannerLeft}>
            <Text style={s.weeklyPlanBannerLabel}>YOUR WEEKLY DINNER PLAN</Text>
            <Text style={s.weeklyPlanBannerTitle}>7 dinners built around your budget</Text>
            <Text style={s.weeklyPlanBannerSub}>Meals, store breakdown, and nutrition — all in one view.</Text>
          </View>
          <View style={s.weeklyPlanBannerArrow}>
            <Feather name="calendar" size={20} color="#0C9E54" />
            <Feather name="chevron-right" size={16} color="#0C9E54" style={{ marginTop: 4 }} />
          </View>
        </TouchableOpacity>

        {/* YOUR BUDGET */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>YOUR BUDGET</Text>
          <TouchableOpacity style={s.budgetCard} onPress={openBudgetEditor} activeOpacity={0.95}>
            <View style={s.budgetRow}>
              <Text style={s.budgetMain}>{fmtCents(weeklyBudgetCents)}</Text>
              <Text style={s.budgetLabel}> weekly budget</Text>
            </View>
            <View style={s.budgetRow}>
              <Text style={s.budgetRemaining}>{fmtCents(remainingCents)}</Text>
              <Text style={s.budgetLabel}> remaining</Text>
            </View>
            <View style={s.progressTrack}>
              <View style={[s.progressFill, { width: `${Math.round(budgetUsedPct * 100)}%` }]} />
            </View>
          </TouchableOpacity>
        </View>

        {/* SCAN RECEIPT & EARN */}
        <TouchableOpacity
          style={s.scanRow}
          onPress={() => handlePress('ReceiptUpload')}
          activeOpacity={0.85}
        >
          <View style={s.scanIconWrap}>
            <Feather name="camera" size={22} color="#0C9E54" />

          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.scanTitle}>Scan Receipt & Earn</Text>
            <Text style={s.scanSub}>Snap your receipt to earn credits</Text>
          </View>
          <View style={s.scanCameraBtn}>
            <Feather name="camera" size={18} color="#94A3B8" />
          </View>
        </TouchableOpacity>

        {/* PANTRY SCAN */}
        <TouchableOpacity
          style={[s.scanRow, { marginTop: -8 }]}
          onPress={() => handlePress('PantryScan')}
          activeOpacity={0.85}
        >
          <View style={[s.scanIconWrap, { backgroundColor: '#E8F5E9' }]}>
            <Feather name="package" size={22} color="#0C9E54" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.scanTitle}>Scan Your Pantry</Text>
            <Text style={s.scanSub}>See what you already have before you shop</Text>
          </View>
          <View style={s.scanCameraBtn}>
            <Feather name="chevron-right" size={18} color="#94A3B8" />
          </View>
        </TouchableOpacity>

        {/* INTELLIGENCE PROFILE */}
        {intelligenceProfile && (
          <View style={s.intelSection}>
            <View style={s.intelHeader}>
              <Text style={s.intelHeaderLabel}>INTELLIGENCE PROFILE</Text>
              <TouchableOpacity onPress={() => handlePress('SoftPersonalization')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={s.intelEditLink}>Edit</Text>
              </TouchableOpacity>
            </View>
            <View style={s.intelCard}>
              {/* Persona row */}
              {intelligenceProfile.persona ? (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Shopper type</Text>
                  <View style={s.intelPersonaPill}>
                    <Text style={s.intelPersonaText}>{intelligenceProfile.persona}</Text>
                  </View>
                </View>
              ) : null}

              {/* Stores row */}
              {intelligenceProfile.stores.length > 0 && (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Your stores</Text>
                  <View style={s.intelChipRow}>
                    {intelligenceProfile.stores.slice(0, 3).map(store => (
                      <View key={store} style={s.intelChip}>
                        <Text style={s.intelChipText}>{store}</Text>
                      </View>
                    ))}
                    {intelligenceProfile.stores.length > 3 && (
                      <View style={s.intelChip}>
                        <Text style={s.intelChipText}>+{intelligenceProfile.stores.length - 3}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Diet row */}
              {intelligenceProfile.diet.length > 0 && (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Diet</Text>
                  <View style={s.intelChipRow}>
                    {intelligenceProfile.diet.slice(0, 2).map(d => (
                      <View key={d} style={s.intelChip}>
                        <Text style={s.intelChipText}>{d.replace(/_/g, '-')}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Foods row */}
              {intelligenceProfile.foods.length > 0 && (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Loves</Text>
                  <View style={s.intelChipRow}>
                    {intelligenceProfile.foods.slice(0, 3).map(f => (
                      <View key={f} style={s.intelChip}>
                        <Text style={s.intelChipText}>{f}</Text>
                      </View>
                    ))}
                    {intelligenceProfile.foods.length > 3 && (
                      <View style={s.intelChip}>
                        <Text style={s.intelChipText}>+{intelligenceProfile.foods.length - 3}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Avoids row */}
              {intelligenceProfile.disliked?.length > 0 && (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Avoids</Text>
                  <View style={s.intelChipRow}>
                    {intelligenceProfile.disliked.slice(0, 3).map(f => (
                      <View key={f} style={[s.intelChip, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                        <Text style={[s.intelChipText, { color: '#C2410C' }]}>{f}</Text>
                      </View>
                    ))}
                    {intelligenceProfile.disliked.length > 3 && (
                      <View style={[s.intelChip, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                        <Text style={[s.intelChipText, { color: '#C2410C' }]}>+{intelligenceProfile.disliked.length - 3}</Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Budget row */}
              {intelligenceProfile.budgetRange > 0 && (
                <View style={s.intelRow}>
                  <Text style={s.intelRowLabel}>Weekly budget</Text>
                  <Text style={s.intelBudgetValue}>${intelligenceProfile.budgetRange}</Text>
                </View>
              )}

              {/* Empty state nudge */}
              {!intelligenceProfile.persona && intelligenceProfile.stores.length === 0 && (
                <TouchableOpacity style={s.intelNudge} onPress={() => handlePress('SoftPersonalization')}>
                  <Feather name="sliders" size={14} color="#0C9E54" />
                  <Text style={s.intelNudgeText}>Finish your profile so Snippd can personalize your stacks</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* â”€â”€ Budget modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <Modal
        visible={budgetModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setBudgetModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.budgetModalCard}>
            <View style={s.modalHeaderRow}>
              <Text style={s.modalTitle}>Update Weekly Budget</Text>
              <TouchableOpacity
                onPress={() => setBudgetModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Feather name="x" size={20} color="#111827" />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSub}>
              This updates your weekly budget everywhere Snippd uses it.
            </Text>
            <View style={s.budgetInputWrap}>
              <Text style={s.budgetDollar}>$</Text>
              <TextInput
                value={budgetDraft}
                onChangeText={setBudgetDraft}
                keyboardType="decimal-pad"
                placeholder="150"
                placeholderTextColor="#94A3B8"
                style={s.budgetInput}
              />
            </View>
            <TouchableOpacity
              style={[s.saveBudgetBtn, budgetSaving && { opacity: 0.7 }]}
              onPress={saveWeeklyBudget}
              disabled={budgetSaving}
              activeOpacity={0.88}
            >
              {budgetSaving
                ? <ActivityIndicator size="small" color="#FFFFFF" />
                : <Text style={s.saveBudgetTxt}>Save Budget</Text>
              }
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// â”€â”€ Store helpers (module-level) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function storeInitials(name) {
  const raw = String(name || '').toUpperCase().replace(/[^A-Z0-9\s]/g, '').trim();
  if (!raw) return '?';
  if (raw.startsWith('DOLLAR GENERAL')) return 'DG';
  const words = raw.split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2);
  return words[0][0] + (words[1][0] || '');
}

function storeLogoColor(name) {
  const n = String(name || '').toLowerCase();
  if (n.includes('publix')) return '#007A47';
  if (n.includes('walgreen')) return '#E31837';
  if (n.includes('cvs')) return '#C8102E';
  if (n.includes('dollar general') || n.includes('dollar_general')) return '#F7B731';
  if (n.includes('walmart')) return '#0071CE';
  if (n.includes('target')) return '#CC0000';
  if (n.includes('kroger')) return '#003087';
  if (n.includes('aldi')) return '#003982';
  return '#0C9E54';
}

// â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const WeekSavingsHero = ({ weekRange, baselineCents, optimizedCents, savingsCents, budgetCents, items, stores, hasCart, onPress }) => {
  // Pct saved vs retail (not vs budget — budget is a user input, not the price without deals)
  const savePct = baselineCents > 0 && optimizedCents > 0 && optimizedCents < baselineCents
    ? Math.min(99, Math.round(((baselineCents - optimizedCents) / baselineCents) * 100))
    : 0;
  const budgetUsed = budgetCents > 0 && optimizedCents > 0
    ? Math.min(1, optimizedCents / budgetCents)
    : 0;
  const overBudget = budgetCents > 0 && optimizedCents > budgetCents;

  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.93} style={{ marginBottom: 20 }}>
      <LinearGradient
        colors={['#0C9E54', '#087038']}
        style={s.heroCard}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <Text style={s.heroEyebrow}>{weekRange.toUpperCase()}</Text>

        {hasCart && baselineCents > 0 ? (
          /* Cart loaded — show retail price → deal price */
          <View style={s.heroPriceFlow}>
            <View style={s.heroPriceBlock}>
              <Text style={s.heroPriceWas}>{fmtCents(baselineCents)}</Text>
              <Text style={s.heroPriceLbl}>full retail</Text>
            </View>
            <Feather name="arrow-right" size={22} color="rgba(255,255,255,0.45)" />
            <View style={s.heroPriceBlock}>
              <Text style={s.heroPriceNow}>{fmtCents(optimizedCents)}</Text>
              <Text style={s.heroPriceLbl}>with deals</Text>
            </View>
          </View>
        ) : (
          /* No cart yet — show weekly budget as context */
          <View style={{ marginBottom: 16 }}>
            <Text style={s.heroNoPlanBig}>{fmtCents(budgetCents)}</Text>
            <Text style={s.heroNoPlanSub}>weekly budget  ·  Build your smart plan</Text>
          </View>
        )}

        <View style={s.heroChipRow}>
          {savingsCents > 0 && (
            <View style={s.heroChip}><Text style={s.heroChipTxt}>Save {fmtCents(savingsCents)}</Text></View>
          )}
          {savePct > 0 && (
            <View style={s.heroChip}><Text style={s.heroChipTxt}>{savePct}% less</Text></View>
          )}
          {stores > 0 && (
            <View style={s.heroChip}><Text style={s.heroChipTxt}>{stores} store{stores !== 1 ? 's' : ''}</Text></View>
          )}
          {items > 0 && (
            <View style={s.heroChip}><Text style={s.heroChipTxt}>{items} item{items !== 1 ? 's' : ''}</Text></View>
          )}
        </View>

        {/* Budget progress — always shown */}
        <View style={s.heroBudgetRow}>
          <View style={s.heroBudgetTrack}>
            <View style={[s.heroBudgetFill, { width: `${Math.round(budgetUsed * 100)}%`, backgroundColor: overBudget ? '#FCA5A5' : 'rgba(255,255,255,0.7)' }]} />
          </View>
          <Text style={[s.heroBudgetLbl, overBudget && { color: '#FCA5A5' }]}>
            {hasCart && optimizedCents > 0
              ? `${fmtCents(optimizedCents)} / ${fmtCents(budgetCents)} budget${overBudget ? ` · ${fmtCents(optimizedCents - budgetCents)} over` : ''}`
              : `${fmtCents(budgetCents)} weekly budget`}
          </Text>
        </View>

        <View style={s.heroAction}>
          <Text style={s.heroActionTxt}>See Smart Plan</Text>
          <Feather name="arrow-right" size={15} color="rgba(255,255,255,0.9)" />
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );
};

const TopStackCard = ({ stack, todayBadge, onPress }) => (
  <TouchableOpacity style={s.featuredCard} onPress={onPress} activeOpacity={0.9}>
    <View style={s.featuredHeader}>
      <Text style={s.featuredEyebrow}>YOUR TOP STACK</Text>
      <View style={s.dayBadge}>
        <Text style={s.dayBadgeTxt}>{todayBadge}</Text>
      </View>
    </View>

    <Text style={s.featuredTitle} numberOfLines={2}>{stack.title || 'Snippd Deal'}</Text>
    {(stack.item_count > 0 || stack.stack_items?.length > 0) && (
      <Text style={s.featuredItemCount}>
        {stack.item_count || stack.stack_items?.length || 1} items
      </Text>
    )}

    <View style={s.payRow}>
      <View style={s.payBlock}>
        <Text style={s.payLabel}>Pay</Text>
        <Text style={s.payValue}>{fmtCents(stack.final_out_of_pocket_cents)}</Text>
      </View>
      <View style={s.saveBlock}>
        <Text style={s.saveLabel}>Save</Text>
        <Text style={s.saveValue}>{stack.savings_percent || 0}%</Text>
      </View>
      <Image
        source={imageForCategory(stack.meal_type || '', stack.stack_type, stack.title)}
        style={s.featuredImage}
        resizeMode="contain"
      />
    </View>

    <View style={s.featuredFooterRow}>
      {stack.subtotal_cents > 0 && (
        <Text style={s.featuredSubtotal}>Est. Subtotal {fmtCents(stack.subtotal_cents)}</Text>
      )}
      {stack.best_shop_window ? (
        <Text style={s.featuredExpiry}>Expires {stack.best_shop_window}</Text>
      ) : null}
    </View>

    <View style={s.startBtn}>
      <Text style={s.startBtnTxt}>Start This Stack  â†’</Text>
    </View>
  </TouchableOpacity>
);

const StackListRow = ({ stack, onPress }) => (
  <TouchableOpacity style={s.stackRow} onPress={onPress} activeOpacity={0.85}>
    <View style={[s.storeCircle, { backgroundColor: storeLogoColor(stack.store) }]}>
      <Text style={s.storeInitialsTxt}>{storeInitials(stack.store)}</Text>
    </View>
    <View style={{ flex: 1 }}>
      <Text style={s.stackRowName} numberOfLines={1}>{stack.title || 'Snippd Deal'}</Text>
      <Text style={s.stackRowMeta}>
        Pay {fmtCents(stack.final_out_of_pocket_cents)}  Â·  Save {stack.savings_percent || 0}%
      </Text>
    </View>
    <Feather name="chevron-right" size={18} color="#CBD5E1" />
  </TouchableOpacity>
);

// â”€â”€ Styles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  // Header
  safeHeader: { backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  headerRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 10,
  },
  logoBox: {
    width: 40, height: 40, borderRadius: 10, backgroundColor: '#0C9E54',
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  logoImg: { width: 24, height: 24 },
  headerCenter: { flex: 1 },
  greeting: { fontSize: 17, fontWeight: '900', color: '#0D1B4B' },
  greetingSub: { fontSize: 13, color: '#64748B', marginTop: 1 },
  headerRight: { alignItems: 'flex-end', gap: 6 },
  bellBtn: { padding: 2 },
  creditsPill: {
    backgroundColor: '#0C9E54', borderRadius: 12,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  creditsTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },

  scroll: { padding: 16 },

  // Week Savings Hero
  heroCard: { borderRadius: 22, padding: 22, overflow: 'hidden' },
  heroEyebrow: { fontSize: 10, fontWeight: '800', color: 'rgba(255,255,255,0.6)', letterSpacing: 1.8, marginBottom: 14 },
  heroPriceFlow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  heroPriceBlock: { flex: 1 },
  heroPriceWas: { fontSize: 28, fontWeight: '900', color: 'rgba(255,255,255,0.45)', textDecorationLine: 'line-through', letterSpacing: -0.5 },
  heroPriceNow: { fontSize: 38, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1 },
  heroPriceLbl: { fontSize: 10, color: 'rgba(255,255,255,0.6)', fontWeight: '800', marginTop: 3, textTransform: 'uppercase', letterSpacing: 1.2 },
  heroNoPlanBig: { fontSize: 38, fontWeight: '900', color: '#FFFFFF', letterSpacing: -1, marginBottom: 4 },
  heroNoPlanSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', fontWeight: '600' },
  heroChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  heroBudgetRow: { marginBottom: 16 },
  heroBudgetTrack: { height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.25)', overflow: 'hidden', marginBottom: 5 },
  heroBudgetFill: { height: '100%', borderRadius: 2 },
  heroBudgetLbl: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: '700' },
  heroChip: { backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, paddingHorizontal: 11, paddingVertical: 5 },
  heroChipTxt: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  heroAction: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingTop: 14, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.18)',
  },
  heroActionTxt: { fontSize: 14, fontWeight: '800', color: '#FFFFFF', flex: 1 },

  deepBriefCard: {
    borderRadius: 18,
    backgroundColor: '#F0FBF0',
    borderWidth: 1,
    borderColor: '#C5FFBC',
    padding: 18,
    marginBottom: 20,
  },
  deepBriefHeader: { marginBottom: 12 },
  deepBriefTitle: { fontSize: 15, fontWeight: '900', color: '#0C9E54', marginBottom: 4 },
  deepBriefSub: { fontSize: 13, color: '#38533F', lineHeight: 20 },
  deepBriefBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#0C9E54', paddingVertical: 14, borderRadius: 14 },
  deepBriefBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900' },

  weeklyPlanBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FBF0',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C5FFBC',
    padding: 18,
    marginBottom: 20,
    marginHorizontal: 0,
  },
  weeklyPlanBannerLeft: { flex: 1, marginRight: 12 },
  weeklyPlanBannerLabel: { fontSize: 10, fontWeight: '800', color: '#0C9E54', letterSpacing: 0.8, marginBottom: 4, textTransform: 'uppercase' },
  weeklyPlanBannerTitle: { fontSize: 15, fontWeight: '900', color: '#111827', marginBottom: 4 },
  weeklyPlanBannerSub: { fontSize: 12, color: '#38533F', lineHeight: 18 },
  weeklyPlanBannerArrow: { alignItems: 'center', justifyContent: 'center' },

  // Featured "Your Top Stack" card
  featuredCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20, marginBottom: 20,
    shadowColor: '#0D1B4B', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  featuredHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  featuredEyebrow: {
    fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5,
  },
  dayBadge: {
    backgroundColor: '#FFF3E0', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
  },
  dayBadgeTxt: { fontSize: 10, fontWeight: '800', color: '#E65100', letterSpacing: 0.8 },
  featuredTitle: {
    fontSize: 22, fontWeight: '900', color: '#0D1B4B', lineHeight: 28, marginBottom: 4,
  },
  featuredItemCount: { fontSize: 12, color: '#0C9E54', fontWeight: '700', marginBottom: 16 },
  payRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 16 },
  payBlock: { flex: 1 },
  saveBlock: { flex: 1 },
  payLabel: {
    fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 2,
  },
  payValue: { fontSize: 34, fontWeight: '900', color: '#0D1B4B', letterSpacing: -1 },
  saveLabel: {
    fontSize: 10, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.2, marginBottom: 2,
  },
  saveValue: { fontSize: 34, fontWeight: '900', color: '#0C9E54', letterSpacing: -1 },
  featuredImage: { width: 96, height: 96, marginLeft: 'auto' },
  featuredFooterRow: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16,
  },
  featuredSubtotal: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  featuredExpiry: { fontSize: 12, color: '#64748B', fontWeight: '500' },
  startBtn: {
    borderWidth: 1.5, borderColor: '#0D1B4B', borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  startBtnTxt: { fontSize: 14, fontWeight: '800', color: '#0D1B4B' },

  // Section
  section: { marginBottom: 20 },
  sectionHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  sectionTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', letterSpacing: 1.5 },
  seeAll: { fontSize: 13, fontWeight: '700', color: '#0C9E54' },

  // Stack list row
  stackRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#0D1B4B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  storeCircle: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  storeInitialsTxt: { color: '#FFFFFF', fontSize: 13, fontWeight: '900' },
  stackRowName: { fontSize: 14, fontWeight: '700', color: '#0D1B4B', marginBottom: 2 },
  stackRowMeta: { fontSize: 12, color: '#64748B', fontWeight: '500' },

  // Budget
  budgetCard: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#0D1B4B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  budgetRow: { flexDirection: 'row', alignItems: 'baseline', marginBottom: 4 },
  budgetMain: { fontSize: 18, fontWeight: '900', color: '#0D1B4B' },
  budgetRemaining: { fontSize: 18, fontWeight: '900', color: '#0D1B4B' },
  budgetLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
  progressTrack: {
    height: 8, borderRadius: 4, backgroundColor: '#F1F5F9',
    overflow: 'hidden', marginTop: 10,
  },
  progressFill: { height: '100%', borderRadius: 4, backgroundColor: '#0C9E54' },

  // Scan receipt row
  scanRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: '#F1F5F9',
    shadowColor: '#0D1B4B', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  scanIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#F0FDF4', alignItems: 'center', justifyContent: 'center',
  },
  scanTitle: { fontSize: 14, fontWeight: '800', color: '#0D1B4B' },
  scanSub: { fontSize: 12, color: '#64748B', marginTop: 2 },
  scanCameraBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: '#F8FAFC', alignItems: 'center', justifyContent: 'center',
  },

  // Loading / empty
  loadingCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 40,
    alignItems: 'center', gap: 12, marginBottom: 20,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  loadingTxt: { fontSize: 14, color: '#64748B', fontWeight: '600' },
  emptyCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 40,
    alignItems: 'center', gap: 8, marginBottom: 20,
    borderWidth: 1, borderColor: '#F1F5F9',
  },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#0D1B4B', textAlign: 'center' },
  emptySub: { fontSize: 13, color: '#64748B', textAlign: 'center', lineHeight: 19 },
  dataStatusBadge: { alignSelf: 'center', backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 4 },
  dataStatusTxt: { fontSize: 10, fontWeight: '900', color: '#92400E', textTransform: 'uppercase', letterSpacing: 0.6 },
  emptyActionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  emptyPrimaryBtn: { backgroundColor: '#0C9E54', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  emptyPrimaryTxt: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  emptySecondaryBtn: { backgroundColor: '#F0FDF4', borderColor: '#BDF3CD', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  emptySecondaryTxt: { color: '#0C7A3D', fontSize: 12, fontWeight: '900' },
  emptyWideBtn: { marginTop: 4, backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  emptyWideTxt: { color: '#0D1B4B', fontSize: 12, fontWeight: '900', textAlign: 'center' },

  // Intelligence Profile card
  intelSection: { marginBottom: 20 },
  intelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  intelHeaderLabel: { fontSize: 11, fontWeight: '900', color: '#64748B', letterSpacing: 1.1 },
  intelEditLink: { fontSize: 12, fontWeight: '700', color: '#0C9E54' },
  intelCard: {
    backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#E2E8F0',
    gap: 12,
  },
  intelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  intelRowLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', flexShrink: 0 },
  intelChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1, justifyContent: 'flex-end' },
  intelChip: {
    backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#BDF3CD',
  },
  intelChipText: { fontSize: 11, fontWeight: '700', color: '#0C9E54' },
  intelPersonaPill: {
    backgroundColor: '#0C9E54', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5,
  },
  intelPersonaText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },
  intelBudgetValue: { fontSize: 16, fontWeight: '900', color: '#0D1B4B' },
  intelNudge: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F0FDF4', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#BDF3CD',
  },
  intelNudgeText: { fontSize: 12, fontWeight: '600', color: '#0C9E54', flex: 1 },

  // Budget modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(4,54,29,0.42)', justifyContent: 'center', padding: 22,
  },
  budgetModalCard: {
    backgroundColor: '#FFFFFF', borderRadius: 18, padding: 20,
    borderWidth: 1, borderColor: '#BDF3CD',
  },
  modalHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8,
  },
  modalTitle: { color: '#004B28', fontSize: 20, fontWeight: '900' },
  modalSub: { color: '#64748B', fontSize: 13, lineHeight: 19, marginBottom: 16 },
  budgetInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 14,
    backgroundColor: '#F8FAFC', paddingHorizontal: 14, marginBottom: 16,
  },
  budgetDollar: { color: '#004B28', fontSize: 28, fontWeight: '900', marginRight: 8 },
  budgetInput: { flex: 1, minHeight: 56, color: '#111827', fontSize: 28, fontWeight: '900' },
  saveBudgetBtn: {
    height: 52, borderRadius: 14, backgroundColor: '#0C9E54',
    alignItems: 'center', justifyContent: 'center',
  },
  saveBudgetTxt: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
});
