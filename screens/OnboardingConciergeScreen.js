// screens/OnboardingConciergeScreen.js
// The "Deep Brief" — 8-chapter Snippd Persona Activation
//
// The questions feel like a personality test.
// The answers build a behavioral model that makes the AI feel magic.
//
// Chapter 1 — Who's at Your Table?   (household structure)
// Chapter 2 — Your Shopping Archetype (personality test: who are you as a shopper?)
// Chapter 3 — Your Kitchen DNA        (cooking style, signature meal)
// Chapter 4 — Your Safety Net         (allergies + medical flags)
// Chapter 5 — Your Pantry DNA         (anchor products, price-watched)
// Chapter 6 — The Behavior Map        (non-obvious patterns: impulse, guilt, price-checks)
// Chapter 7 — Your Money & Stores     (financial goal, stores, loyalty, spend, multi-store)
// Chapter 8 — Your Snippd Mandate     (autonomy, stress behavior, the one thing to solve)
//
// Saves to user_persona with briefing_completed = true
// Then navigates to LogicScanScreen → MainApp

import React, { useState, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Animated, Dimensions, KeyboardAvoidingView,
  Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width: W } = Dimensions.get('window');

// ── Design tokens — intentional dark "war room" aesthetic ────────────────────
const BG         = '#050E08';
const SURFACE    = '#0C1A10';
const SURFACE_HI = '#142018';
const ACCENT     = '#0C9E54';
const ACCENT_DIM = 'rgba(12,158,84,0.12)';
const ACCENT_MED = 'rgba(12,158,84,0.22)';
const WHITE      = '#FFFFFF';
const SILVER     = '#A0AAA4';
const DIM        = '#2A3A2E';
const BORDER     = 'rgba(255,255,255,0.08)';
const BORDER_SEL = '#0C9E54';
const CORAL      = '#FF7043';
const MINT_POP   = '#C5FFBC';
const AMBER      = '#F59E0B';

const TOTAL_CHAPTERS = 8;

// ── Chapter labels for the top bar ────────────────────────────────────────────
const CHAPTER_LABELS = [
  'YOUR TABLE',
  'SHOPPING ARCHETYPE',
  'KITCHEN DNA',
  'SAFETY NET',
  'PANTRY DNA',
  'BEHAVIOR MAP',
  'MONEY & STORES',
  'YOUR MANDATE',
];

// ── Static data ───────────────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    key:   'hunter',
    label: 'The Deal Hunter',
    sub:   'I have the apps, the browser tabs, the Chrome extensions. I am the deal.',
    icon:  'crosshair',
  },
  {
    key:   'planner',
    label: 'The Systematic Planner',
    sub:   'I have a list. I stick to the list. Deviations irritate me.',
    icon:  'clipboard',
  },
  {
    key:   'optimist',
    label: 'The Optimistic Browser',
    sub:   'I go in with a rough idea and see what looks good. Sometimes it works out.',
    icon:  'smile',
  },
  {
    key:   'improviser',
    label: 'The Last-Minute Improviser',
    sub:   '"I\'ll figure it out when I get there." The cart surprises even me.',
    icon:  'zap',
  },
];

const CART_VS_LIST = [
  { key: 'exact',       label: 'Exactly what\'s on the list',        sub: 'I have discipline. I respect the list.',                        icon: 'check-square' },
  { key: 'mostly_same', label: '80% list, 20% "just grabbed it"',    sub: 'I stay close, but the end-cap gets me sometimes.',              icon: 'percent'      },
  { key: 'different',   label: 'Pretty different from the list',      sub: 'The list is a suggestion. The store decides.',                  icon: 'shuffle'      },
  { key: 'no_list',     label: 'I don\'t really make lists',          sub: 'I operate on vibes, memory, and what looks fresh.',             icon: 'wind'         },
];

const DEAL_IMPULSE = [
  { key: 'skip',       label: 'Skip it',                    sub: 'If it\'s not on the list, it doesn\'t exist.',        icon: 'x-circle'      },
  { key: 'buy_one',    label: 'Buy one just in case',       sub: 'Future me will thank me. Probably.',                  icon: 'shopping-bag'  },
  { key: 'stock_up',   label: 'Buy as many as the limit',   sub: 'BOGO is a command. I take it seriously.',              icon: 'layers'        },
  { key: 'depends',    label: 'Depends entirely on category', sub: 'Paper towels? Yes. Avocados? Absolutely not.',      icon: 'sliders'       },
];

const KITCHEN_VIBES = [
  { key: 'meal_prep',       label: 'Meal-Prep Mode',            sub: 'Sunday is for cooking. I build for the whole week.',      icon: 'calendar'   },
  { key: 'fresh_spontaneous', label: 'Fresh & Spontaneous',     sub: 'I cook based on what looks good today. Recipes are loose.', icon: 'feather'  },
  { key: 'takeout_backup',  label: 'Practical — Takeout Backup', sub: 'I cook 3–4 times a week. The rest is handled.',          icon: 'package'    },
  { key: 'chef_mode',       label: 'Full Chef Mode',            sub: 'I cook everything from scratch. Shortcuts are cheating.',  icon: 'award'      },
];

const ALLERGIES = [
  { key: 'peanut',    label: 'Peanut',         icon: '🥜' },
  { key: 'tree_nut',  label: 'Tree Nut',        icon: '🌰' },
  { key: 'gluten',    label: 'Gluten / Wheat',  icon: '🌾' },
  { key: 'dairy',     label: 'Dairy',           icon: '🥛' },
  { key: 'shellfish', label: 'Shellfish',        icon: '🦐' },
  { key: 'soy',       label: 'Soy',             icon: '🫘' },
  { key: 'egg',       label: 'Egg',             icon: '🥚' },
  { key: 'fish',      label: 'Fish',            icon: '🐟' },
];

const DIAGNOSES = [
  { key: 'diabetes_t2',        label: 'Type 2 Diabetes',      icon: '💉' },
  { key: 'diabetes_t1',        label: 'Type 1 Diabetes',      icon: '💉' },
  { key: 'hypertension',       label: 'High Blood Pressure',  icon: '❤️' },
  { key: 'celiac',             label: 'Celiac Disease',       icon: '🌾' },
  { key: 'ibs',                label: 'IBS / Crohn\'s',       icon: '🫁' },
  { key: 'lactose_intolerant', label: 'Lactose Intolerance',  icon: '🥛' },
  { key: 'kidney_disease',     label: 'Kidney Disease',       icon: '🫘' },
  { key: 'none',               label: 'None',                 icon: '✓'  },
];

const PANTRY_OPTIONS = [
  'Eggs', 'Organic Milk', 'Butter', 'Greek Yogurt', 'Cheese',
  'Chicken Breast', 'Ground Beef', 'Salmon', 'Bacon',
  'Organic Spinach', 'Broccoli', 'Sweet Potatoes', 'Avocados',
  'Bananas', 'Apples', 'Berries',
  'Rice', 'Pasta', 'Oats', 'Bread', 'Tortillas',
  'Olive Oil', 'Coconut Oil', 'Almond Butter', 'Peanut Butter',
  'Coffee', 'Protein Powder', 'Energy Drinks', 'Sparkling Water',
  'Baby Formula', 'Diapers', 'Dog Food', 'Cat Food',
  'Paper Towels', 'Laundry Detergent',
];

const PRICE_CHECK_FREQ = [
  { key: 'never',            label: 'Never crossed my mind',        sub: 'I find what I like and stay loyal.',                  icon: 'heart'         },
  { key: 'sometimes',        label: 'Every now and then',           sub: 'I check if something feels too expensive.',           icon: 'eye'           },
  { key: 'always',           label: 'I do it religiously',          sub: 'I know the unit price of 30 products off the top of my head.', icon: 'bar-chart-2' },
  { key: 'switched_recently',label: 'I switched brands recently',   sub: 'The price gap finally got to me. The new one is fine.', icon: 'refresh-cw'  },
];

const IMPULSE_CATEGORIES = [
  { key: 'snacks',     label: 'Snacks & Chips',          icon: '🍿' },
  { key: 'beverages',  label: 'Drinks & Beverages',      icon: '🧃' },
  { key: 'home',       label: 'Home & Cleaning',         icon: '🧹' },
  { key: 'self_care',  label: 'Self-Care & Beauty',      icon: '✨' },
  { key: 'candy',      label: 'Candy & Checkout Lane',   icon: '🍬' },
  { key: 'none',       label: 'Nothing — I stick to the list', icon: '🧊' },
];

const POST_SHOP_FEELINGS = [
  { key: 'accomplished', label: 'Accomplished',          sub: 'I got deals. I stayed on budget. That felt good.',      icon: 'trophy'        },
  { key: 'guilty',       label: 'Guilty about something', sub: 'There\'s always that one thing I shouldn\'t have bought.', icon: 'alert-circle' },
  { key: 'neutral',      label: 'It\'s just groceries',  sub: 'Task done. Moving on. Not a moment for reflection.',    icon: 'minus-circle'  },
  { key: 'irritated',    label: 'Irritated at the total', sub: 'Every week I\'m surprised it came to that much.',      icon: 'frown'         },
];

const FIN_GOALS = [
  { key: 'debt_payoff',    label: 'Pay off debt',       sub: 'Every dollar saved goes toward eliminating what I owe', icon: 'credit-card'  },
  { key: 'build_wealth',   label: 'Build wealth',       sub: 'I want to invest the difference — savings = assets',    icon: 'trending-up'  },
  { key: 'emergency_fund', label: 'Emergency fund',     sub: 'I need a safety net before anything else',              icon: 'shield'       },
  { key: 'stretch_budget', label: 'Make it stretch',    sub: 'Tight month — I need every dollar to go further',       icon: 'maximize-2'   },
];

const STORES = [
  { key: 'walmart',     label: 'Walmart',      icon: '🛒' },
  { key: 'kroger',      label: 'Kroger',       icon: '🛒' },
  { key: 'target',      label: 'Target',       icon: '🎯' },
  { key: 'costco',      label: 'Costco',       icon: '📦' },
  { key: 'aldi',        label: 'Aldi',         icon: '🛒' },
  { key: 'whole_foods', label: 'Whole Foods',  icon: '🌿' },
  { key: 'publix',      label: 'Publix',       icon: '🛒' },
  { key: 'heb',         label: 'H-E-B',        icon: '🛒' },
  { key: 'sprouts',     label: 'Sprouts',      icon: '🌱' },
  { key: 'trader_joes', label: "Trader Joe's", icon: '🛒' },
  { key: 'amazon',      label: 'Amazon Fresh', icon: '📦' },
  { key: 'instacart',   label: 'Instacart',    icon: '🛍️' },
];

const STRESS_BEHAVIORS = [
  { key: 'orders_delivery', label: 'I order delivery',    sub: 'DoorDash, Uber Eats, or Instacart when I\'m fried',  icon: 'package'  },
  { key: 'grabs_fast_food', label: 'I grab fast food',    sub: 'Drive-through is the backup plan',                   icon: 'map-pin'  },
  { key: 'still_cooks',     label: 'I still cook',        sub: 'Kitchen is my therapy, even on hard days',            icon: 'heart'    },
  { key: 'eats_whatever',   label: 'Whatever\'s there',   sub: 'Fridge roulette — meal planning goes out the window', icon: 'shuffle'  },
];

const AUTONOMY = [
  { key: 'show_deals', label: 'Just show me the deals',    sub: 'Surface the best prices — I\'ll decide what to buy', icon: 'eye'           },
  { key: 'build_cart', label: 'Build my cart, I\'ll approve', sub: 'Pre-fill my optimal cart. I review and confirm', icon: 'shopping-cart' },
  { key: 'full_auto',  label: 'Handle it — I trust you',  sub: 'Fully autonomous. Alert me only if I\'m about to overpay', icon: 'cpu'    },
];

// ── Pill (multi-select) — defined outside component to prevent remounting ─────
function Pill({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.pill, selected && styles.pillSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      {item.icon && <Text style={styles.pillIcon}>{item.icon}</Text>}
      <Text style={[styles.pillLabel, selected && styles.pillLabelSelected]}>
        {item.label}
      </Text>
      {selected && <Feather name="check" size={13} color={ACCENT} style={{ marginLeft: 4 }} />}
    </TouchableOpacity>
  );
}

// ── OptionCard (single-select) — defined outside component ───────────────────
function OptionCard({ item, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.optCard, selected && styles.optCardSelected]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={[styles.optIconWrap, selected && styles.optIconWrapSelected]}>
        <Feather name={item.icon} size={18} color={selected ? BG : ACCENT} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optLabel, selected && styles.optLabelSelected]}>{item.label}</Text>
        <Text style={[styles.optSub, selected && { color: ACCENT }]}>{item.sub}</Text>
      </View>
      {selected && <Feather name="check-circle" size={18} color={ACCENT} />}
    </TouchableOpacity>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function OnboardingConciergeScreen({ navigation, route }) {
  const preHousehold = route?.params?.household ?? {};

  const [chapter,    setChapter]    = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Ch 1 — Household
  const [childAges,      setChildAges]      = useState('');

  // Ch 2 — Shopping Archetype
  const [archetype,      setArchetype]      = useState(null);
  const [cartVsList,     setCartVsList]      = useState(null);
  const [dealImpulse,    setDealImpulse]    = useState(null);

  // Ch 3 — Kitchen DNA
  const [kitchenVibe,    setKitchenVibe]    = useState(null);
  const [weeklyMeal,     setWeeklyMeal]     = useState('');

  // Ch 4 — Safety Net
  const [allergies,      setAllergies]      = useState([]);
  const [diagnoses,      setDiagnoses]      = useState([]);

  // Ch 5 — Pantry DNA
  const [anchors,        setAnchors]        = useState([]);
  const [customAnchor,   setCustomAnchor]   = useState('');

  // Ch 6 — Behavior Map
  const [priceCheckFreq, setPriceCheckFreq] = useState(null);
  const [impulseCategory, setImpulseCategory] = useState(null);
  const [postShopFeeling, setPostShopFeeling] = useState(null);

  // Ch 7 — Money & Stores
  const [finGoal,        setFinGoal]        = useState(null);
  const [stores,         setStores]         = useState([]);
  const [loyalCards,     setLoyalCards]     = useState([]);
  const [weeklySpend,    setWeeklySpend]    = useState('');
  const [multiStore,     setMultiStore]     = useState(null); // 'always'|'sometimes'|'no'

  // Ch 8 — Mandate
  const [stressBehavior, setStressBehavior] = useState(null);
  const [autonomy,       setAutonomy]       = useState(null);
  const [snippdSolveFor, setSnippdSolveFor] = useState('');
  const [personaNotes,   setPersonaNotes]   = useState('');

  const fadeAnim  = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;

  const goToChapter = useCallback((next) => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 140, useNativeDriver: true }),
    ]).start(() => {
      setChapter(next);
      slideAnim.setValue(20);
      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    });
  }, [fadeAnim, slideAnim]);

  const toggleItem = useCallback((list, setList, key) => {
    setList(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const canAdvance = useCallback(() => {
    if (chapter === 0) return true;                              // household optional
    if (chapter === 1) return !!archetype && !!cartVsList;       // archetype required
    if (chapter === 2) return !!kitchenVibe;                     // kitchen vibe required
    if (chapter === 3) return true;                              // allergies optional
    if (chapter === 4) return anchors.length > 0;               // at least 1 anchor
    if (chapter === 5) return !!priceCheckFreq && !!postShopFeeling; // behavior required
    if (chapter === 6) return !!finGoal && stores.length > 0;   // money & stores required
    if (chapter === 7) return !!stressBehavior && !!autonomy;   // mandate required
    return false;
  }, [chapter, archetype, cartVsList, kitchenVibe, anchors, priceCheckFreq, postShopFeeling, finGoal, stores, stressBehavior, autonomy]);

  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigation.replace('Auth'); return; }

      const parsedAges = childAges
        .split(/[\s,]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0 && n <= 17);

      const allAnchors = [...anchors, ...(customAnchor.trim() ? [customAnchor.trim()] : [])];

      const weeklyGroceryCents = weeklySpend
        ? Math.round(parseFloat(weeklySpend.replace(/[^0-9.]/g, '')) * 100) || null
        : null;

      await supabase.from('user_persona').upsert({
        user_id:                 user.id,
        // Ch 1
        child_ages:              parsedAges,
        // Ch 2
        shopping_archetype:      archetype,
        cart_vs_list_behavior:   cartVsList,
        deal_impulse:            dealImpulse,
        // Ch 3
        kitchen_vibe:            kitchenVibe,
        weekly_signature_meal:   weeklyMeal.trim() || null,
        // Ch 4
        clinical_allergies:      allergies,
        clinical_diagnoses:      diagnoses,
        // Ch 5
        pantry_anchors:          allAnchors,
        // Ch 6
        price_check_frequency:   priceCheckFreq,
        impulse_category:        impulseCategory,
        post_shop_feeling:       postShopFeeling,
        // Ch 7
        financial_goal:          finGoal,
        preferred_stores:        stores,
        loyalty_cards:           loyalCards,
        weekly_grocery_cents:    weeklyGroceryCents,
        multi_store_shopper:     multiStore === 'always' ? true : multiStore === 'no' ? false : null,
        // Ch 8
        stress_behavior:         stressBehavior,
        autonomy_level:          autonomy,
        snippd_solve_for:        snippdSolveFor.trim() || null,
        persona_notes:           personaNotes.trim() || null,
        briefing_completed:      true,
      }, { onConflict: 'user_id' });

      navigation.replace('LogicScan');
    } catch (e) {
      console.error('DeepBrief save error:', e);
    } finally {
      setSubmitting(false);
    }
  }, [
    childAges, archetype, cartVsList, dealImpulse, kitchenVibe, weeklyMeal,
    allergies, diagnoses, anchors, customAnchor, priceCheckFreq, impulseCategory,
    postShopFeeling, finGoal, stores, loyalCards, weeklySpend, multiStore,
    stressBehavior, autonomy, snippdSolveFor, personaNotes, navigation,
  ]);

  // ── Chapter renders (called as functions, not mounted as JSX components) ────

  function renderChapter0() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 1 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Who's at Your Table?</Text>
          <Text style={styles.chapterSub}>
            I need to know the exact composition of your household — not just headcount. The age of a child changes everything: formula, school lunches, teenage metabolism. Tell me who I'm feeding.
          </Text>
        </View>
        <Text style={styles.fieldLabel}>Ages of your children (optional)</Text>
        <Text style={styles.fieldHint}>Separate ages with commas — e.g. 3, 8, 14</Text>
        <TextInput
          style={styles.textInput}
          value={childAges}
          onChangeText={setChildAges}
          placeholder="3, 8, 14"
          placeholderTextColor={DIM}
          keyboardType="numbers-and-punctuation"
          returnKeyType="done"
        />
        <View style={styles.infoCard}>
          <Feather name="info" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            A teen at 15 costs $40–80/week more than they did at 12. Your agent accounts for this automatically.
          </Text>
        </View>
        <View style={styles.infoCard}>
          <Feather name="calendar" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            Infant under 12 months? I'll pre-monitor formula, purees, and diaper prices at every connected retailer around the clock.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter1() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 2 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Shopping Archetype</Text>
          <Text style={styles.chapterSub}>
            Before I build your stack, I need to understand who you actually are in a grocery store. There's no wrong answer — these tell me how to communicate with you.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Pick the one that sounds most like you on a Sunday before groceries:</Text>
        {ARCHETYPES.map(a => (
          <OptionCard key={a.key} item={a} selected={archetype === a.key} onPress={() => setArchetype(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Your cart compared to your list is usually:</Text>
        {CART_VS_LIST.map(a => (
          <OptionCard key={a.key} item={a} selected={cartVsList === a.key} onPress={() => setCartVsList(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>You spot a BOGO deal on something not on your list. You:</Text>
        <Text style={styles.fieldHint}>This tells me how aggressively to surface opportunistic deals</Text>
        {DEAL_IMPULSE.map(a => (
          <OptionCard key={a.key} item={a} selected={dealImpulse === a.key} onPress={() => setDealImpulse(a.key)} />
        ))}
      </ScrollView>
    );
  }

  function renderChapter2() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 3 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Kitchen DNA</Text>
          <Text style={styles.chapterSub}>
            How you cook tells me what to buy and when. A meal-prepper needs bulk deals on Sunday. A spontaneous cook needs daily freshness alerts. Which one are you?
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Your kitchen vibe is closest to:</Text>
        {KITCHEN_VIBES.map(k => (
          <OptionCard key={k.key} item={k} selected={kitchenVibe === k.key} onPress={() => setKitchenVibe(k.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>That one meal you cook every single week, no matter what:</Text>
        <Text style={styles.fieldHint}>Could be tacos, pasta, sheet-pan chicken — whatever it is, I'll protect the ingredients.</Text>
        <TextInput
          style={styles.textInput}
          value={weeklyMeal}
          onChangeText={setWeeklyMeal}
          placeholder="e.g. Taco Tuesday, Sunday Pasta"
          placeholderTextColor={DIM}
          returnKeyType="done"
          blurOnSubmit
        />
      </ScrollView>
    );
  }

  function renderChapter3() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 4 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Safety Net</Text>
          <Text style={styles.chapterSub}>
            Your agent will never recommend a product your household can't have. This is stored encrypted, never sold, never shared — it exists only to protect you.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Allergies to flag</Text>
        <Text style={styles.fieldHint}>Every recommendation is filtered through this</Text>
        <View style={styles.pillGrid}>
          {ALLERGIES.map(a => (
            <Pill key={a.key} item={a} selected={allergies.includes(a.key)} onPress={() => toggleItem(allergies, setAllergies, a.key)} />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Medical conditions</Text>
        <Text style={styles.fieldHint}>Guides ingredient filtering and macro-aware deal scoring</Text>
        <View style={styles.pillGrid}>
          {DIAGNOSES.map(d => (
            <Pill
              key={d.key}
              item={d}
              selected={diagnoses.includes(d.key)}
              onPress={() => {
                if (d.key === 'none') {
                  setDiagnoses(['none']);
                } else {
                  setDiagnoses(prev =>
                    prev.filter(k => k !== 'none').includes(d.key)
                      ? prev.filter(k => k !== d.key)
                      : [...prev.filter(k => k !== 'none'), d.key]
                  );
                }
              }}
            />
          ))}
        </View>
        <View style={styles.infoCard}>
          <Feather name="lock" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            Encrypted at rest. Used only to filter recommendations. Never shared externally.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter4() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 5 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Pantry DNA</Text>
          <Text style={styles.chapterSub}>
            These are your non-negotiables. I watch their price at every connected retailer, 24/7. The moment a deal hits your threshold, you're the first to know.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>What's in your cart almost every week?</Text>
        <Text style={styles.fieldHint}>Pick everything that never really leaves your list</Text>
        <View style={styles.pillGridWrap}>
          {PANTRY_OPTIONS.map(item => (
            <Pill key={item} item={{ label: item }} selected={anchors.includes(item)} onPress={() => toggleItem(anchors, setAnchors, item)} />
          ))}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Anything I missed?</Text>
        <TextInput
          style={styles.textInput}
          value={customAnchor}
          onChangeText={setCustomAnchor}
          placeholder="e.g. Kirkland Protein Bars, Chomps Beef Sticks"
          placeholderTextColor={DIM}
          returnKeyType="done"
          blurOnSubmit
        />
        {anchors.length > 0 && (
          <View style={styles.anchorCount}>
            <Feather name="check-circle" size={14} color={ACCENT} />
            <Text style={styles.anchorCountText}>
              {anchors.length} anchor product{anchors.length !== 1 ? 's' : ''} — watched continuously.
            </Text>
          </View>
        )}
      </ScrollView>
    );
  }

  function renderChapter5() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 6 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>The Behavior Map</Text>
          <Text style={styles.chapterSub}>
            These questions don't look like they matter. They do. The answers train the part of your agent that predicts what you'll actually need — before you know you need it.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>When's the last time you checked if you could get the same product for less?</Text>
        {PRICE_CHECK_FREQ.map(p => (
          <OptionCard key={p.key} item={p} selected={priceCheckFreq === p.key} onPress={() => setPriceCheckFreq(p.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>That thing that always ends up in your cart — even when it's not on the list:</Text>
        <Text style={styles.fieldHint}>Pick the category that gets you most often</Text>
        <View style={styles.pillGrid}>
          {IMPULSE_CATEGORIES.map(i => (
            <Pill key={i.key} item={i} selected={impulseCategory === i.key} onPress={() => setImpulseCategory(i.key)} />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>After you leave the grocery store, you usually feel:</Text>
        {POST_SHOP_FEELINGS.map(p => (
          <OptionCard key={p.key} item={p} selected={postShopFeeling === p.key} onPress={() => setPostShopFeeling(p.key)} />
        ))}
      </ScrollView>
    );
  }

  function renderChapter6() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 7 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Money & Stores</Text>
          <Text style={styles.chapterSub}>
            Where you shop and what you're saving for changes everything about how your stack is built. Be specific — even approximate numbers unlock better recommendations.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>What's the financial goal right now?</Text>
        {FIN_GOALS.map(g => (
          <OptionCard key={g.key} item={g} selected={finGoal === g.key} onPress={() => setFinGoal(g.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>How much do you typically spend on groceries each week?</Text>
        <Text style={styles.fieldHint}>Approximate is fine — this calibrates your weekly savings target</Text>
        <View style={styles.spendRow}>
          <Text style={styles.spendPrefix}>$</Text>
          <TextInput
            style={styles.spendInput}
            value={weeklySpend}
            onChangeText={setWeeklySpend}
            placeholder="150"
            placeholderTextColor={DIM}
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text style={styles.spendSuffix}>/week</Text>
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Do you shop at multiple stores to save money?</Text>
        <View style={styles.triToggleRow}>
          {[
            { key: 'always',    label: 'Yes, always' },
            { key: 'sometimes', label: 'Sometimes' },
            { key: 'no',        label: 'No, one store' },
          ].map(opt => (
            <TouchableOpacity
              key={opt.key}
              style={[styles.triToggle, multiStore === opt.key && styles.triToggleSelected]}
              onPress={() => setMultiStore(opt.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.triToggleTxt, multiStore === opt.key && styles.triToggleTxtSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>Where do you shop?</Text>
        <Text style={styles.fieldHint}>Select all — we match deals across every connected retailer</Text>
        <View style={styles.pillGrid}>
          {STORES.map(s => (
            <Pill key={s.key} item={s} selected={stores.includes(s.key)} onPress={() => toggleItem(stores, setStores, s.key)} />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Loyalty or rewards cards?</Text>
        <Text style={styles.fieldHint}>These unlock digital coupon stacking deals</Text>
        <View style={styles.pillGrid}>
          {STORES.map(s => (
            <Pill key={s.key + '_loyal'} item={{ label: s.label, icon: s.icon }} selected={loyalCards.includes(s.key)} onPress={() => toggleItem(loyalCards, setLoyalCards, s.key)} />
          ))}
        </View>
      </ScrollView>
    );
  }

  function renderChapter7() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 8 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Snippd Mandate</Text>
          <Text style={styles.chapterSub}>
            Last chapter. These answers define the rules your agent lives by — even when you forget you set them.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>When you're slammed or stressed, what usually happens with food?</Text>
        <Text style={styles.fieldHint}>I'll pre-build for your stress pattern so you're never caught empty</Text>
        {STRESS_BEHAVIORS.map(s => (
          <OptionCard key={s.key} item={s} selected={stressBehavior === s.key} onPress={() => setStressBehavior(s.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>How much do you want me to handle?</Text>
        {AUTONOMY.map(a => (
          <OptionCard key={a.key} item={a} selected={autonomy === a.key} onPress={() => setAutonomy(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>The one thing you most want Snippd to solve for you:</Text>
        <Text style={styles.fieldHint}>
          This becomes the first priority your agent optimizes for. Be specific. "Stop me from overspending at Target" is better than "save money."
        </Text>
        <TextInput
          style={[styles.textInput, { minHeight: 90 }]}
          value={snippdSolveFor}
          onChangeText={setSnippdSolveFor}
          placeholder={`"Stop me from buying things I don't need at Costco."`}
          placeholderTextColor={DIM}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />
        {snippdSolveFor.length > 0 && (
          <Text style={styles.charCount}>{300 - snippdSolveFor.length} remaining</Text>
        )}

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Anything else your agent should always remember? (optional)</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 70 }]}
          value={personaNotes}
          onChangeText={setPersonaNotes}
          placeholder={`"My kids won't eat anything green. My husband is obsessed with Triscuits."`}
          placeholderTextColor={DIM}
          multiline
          maxLength={200}
          textAlignVertical="top"
        />
      </ScrollView>
    );
  }

  const chapterRenders = [
    renderChapter0, renderChapter1, renderChapter2, renderChapter3,
    renderChapter4, renderChapter5, renderChapter6, renderChapter7,
  ];

  const pct = ((chapter + 1) / TOTAL_CHAPTERS) * 100;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.progressWrap}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.topBarLabel}>{CHAPTER_LABELS[chapter]}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={20}>
        <Animated.View style={[{ flex: 1 }, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          {chapterRenders[chapter]()}
        </Animated.View>

        <View style={styles.footer}>
          {chapter > 0 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => goToChapter(chapter - 1)} activeOpacity={0.7}>
              <Feather name="arrow-left" size={18} color={SILVER} />
            </TouchableOpacity>
          )}
          {chapter < TOTAL_CHAPTERS - 2 && (
            <TouchableOpacity style={styles.skipBtn} onPress={() => goToChapter(chapter + 1)} activeOpacity={0.7}>
              <Text style={styles.skipBtnText}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.nextBtn, !canAdvance() && styles.nextBtnDisabled]}
            onPress={() => { if (chapter < TOTAL_CHAPTERS - 1) goToChapter(chapter + 1); else handleComplete(); }}
            disabled={!canAdvance() || submitting}
            activeOpacity={0.85}
          >
            <Text style={styles.nextBtnText}>
              {chapter === TOTAL_CHAPTERS - 1 ? (submitting ? 'Activating…' : 'Activate my agent →') : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },

  topBar: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14, gap: 8 },
  progressWrap: { height: 3, backgroundColor: DIM, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: ACCENT, borderRadius: 2 },
  topBarLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 1.5, textTransform: 'uppercase' },

  chapterContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 4 },
  chapterHeader: { marginBottom: 24, gap: 6 },
  chapterEyebrow: { fontSize: 11, fontWeight: '700', color: SILVER, letterSpacing: 1.5, textTransform: 'uppercase' },
  chapterTitle: { fontSize: 28, fontWeight: '900', color: WHITE, lineHeight: 34 },
  chapterSub: { fontSize: 14, color: SILVER, lineHeight: 22, marginTop: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '800', color: WHITE, marginTop: 8, marginBottom: 8 },
  fieldHint: { fontSize: 12, color: SILVER, marginBottom: 12, lineHeight: 18 },

  textInput: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: WHITE,
    fontSize: 15,
    marginBottom: 8,
  },

  spendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  spendPrefix: { color: ACCENT, fontSize: 18, fontWeight: '800' },
  spendInput: { flex: 1, color: WHITE, fontSize: 22, fontWeight: '800', padding: 0 },
  spendSuffix: { color: SILVER, fontSize: 13, fontWeight: '600' },

  triToggleRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  triToggle: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: BORDER, paddingVertical: 12, alignItems: 'center', backgroundColor: SURFACE },
  triToggleSelected: { borderColor: ACCENT, backgroundColor: ACCENT_DIM },
  triToggleTxt: { fontSize: 11, fontWeight: '700', color: SILVER },
  triToggleTxtSelected: { color: ACCENT },

  pillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pillGridWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: BORDER, backgroundColor: SURFACE },
  pillSelected: { borderColor: ACCENT, backgroundColor: ACCENT_DIM },
  pillIcon: { fontSize: 13 },
  pillLabel: { fontSize: 12, fontWeight: '700', color: SILVER },
  pillLabelSelected: { color: WHITE },

  optCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 14, marginBottom: 8 },
  optCardSelected: { borderColor: ACCENT, backgroundColor: ACCENT_DIM },
  optIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: ACCENT_DIM, alignItems: 'center', justifyContent: 'center' },
  optIconWrapSelected: { backgroundColor: ACCENT },
  optLabel: { fontSize: 14, fontWeight: '800', color: WHITE, marginBottom: 2 },
  optLabelSelected: { color: MINT_POP },
  optSub: { fontSize: 12, color: SILVER, lineHeight: 17 },

  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: SURFACE_HI, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: BORDER },
  infoText: { flex: 1, fontSize: 12, color: SILVER, lineHeight: 18 },

  anchorCount: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, padding: 10, backgroundColor: ACCENT_DIM, borderRadius: 8 },
  anchorCountText: { flex: 1, fontSize: 12, color: ACCENT, fontWeight: '700' },

  charCount: { fontSize: 11, color: DIM, marginTop: 4, textAlign: 'right' },

  footer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingVertical: 16, backgroundColor: BG, borderTopWidth: 1, borderTopColor: BORDER },
  backBtn: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: BORDER, alignItems: 'center', justifyContent: 'center' },
  skipBtn: { flex: 0, paddingHorizontal: 16, paddingVertical: 12 },
  skipBtnText: { color: SILVER, fontSize: 13, fontWeight: '600' },
  nextBtn: { flex: 1, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center' },
  nextBtnDisabled: { backgroundColor: DIM },
  nextBtnText: { color: WHITE, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },
});
