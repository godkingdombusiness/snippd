// screens/SnippdDeepBriefScreen.js
// The "Snippd Deep Brief" — 8-chapter optional personalization flow
//
// Help Snippd understand how your household really eats, shops, saves, and makes food decisions.
// This helps us build better weekly plans around your budget, favorite stores, food preferences, cooking habits, eat-out behavior, and real-life routines.
// You stay in control. Snippd simply gets smarter.
//
// Chapter 1 — Who Are We Planning For?   (household structure)
// Chapter 2 — How Do You Shop?           (shopping habits)
// Chapter 3 — How Do You Cook?           (cooking style)
// Chapter 4 — Food Preferences & Safety Notes (allergies, preferences)
// Chapter 5 — Your Everyday Staples      (pantry anchors)
// Chapter 6 — Your Real-Life Shopping Patterns (behavior map)
// Chapter 7 — Budget, Stores & Savings Goals (money & stores)
// Chapter 8 — What Should Snippd Help With Most? (support focus)
//
// Saves to user_persona with briefing_completed = true
// Then navigates back or to MainApp

import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  TextInput, Animated, Dimensions, KeyboardAvoidingView,
  Platform, StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const { width: W } = Dimensions.get('window');

// ── Design tokens — Snippd premium theme ────────────────────
const BG         = '#FAF8F1'; // Cream
const SURFACE    = '#FFFFFF'; // White
const SURFACE_HI = '#F9FAFB'; // Light gray
const ACCENT     = '#0C9E54'; // Primary Green
const ACCENT_DIM = 'rgba(12,158,84,0.1)';
const ACCENT_MED = 'rgba(12,158,84,0.2)';
const WHITE      = '#FFFFFF';
const SILVER     = '#6B7280'; // Gray
const DIM        = '#9CA3AF'; // Lighter gray
const BORDER     = '#E5E7EB'; // Border
const BORDER_SEL = '#0C9E54';
const CORAL      = '#FB5B5B'; // Coral
const MINT_POP   = '#C5FFBC'; // Light Green
const NAVY       = '#172250'; // Navy

const TOTAL_CHAPTERS = 8;

// ── Chapter labels for the top bar ────────────────────────────────────────────
const CHAPTER_LABELS = [
  'WHO ARE WE PLANNING FOR?',
  'HOW DO YOU SHOP?',
  'HOW DO YOU COOK?',
  'FOOD PREFERENCES & SAFETY NOTES',
  'YOUR EVERYDAY STAPLES',
  'YOUR REAL-LIFE SHOPPING PATTERNS',
  'BUDGET, STORES & SAVINGS GOALS',
  'WHAT SHOULD SNIPPD HELP WITH MOST?',
];

// ── Static data ───────────────────────────────────────────────────────────────

const ARCHETYPES = [
  {
    key:   'hunter',
    label: 'The Deal Hunter',
    sub:   'I like finding savings and comparing options.',
    icon:  'crosshair',
  },
  {
    key:   'planner',
    label: 'The Systematic Planner',
    sub:   'I shop with a list and try to stick to it.',
    icon:  'clipboard',
  },
  {
    key:   'optimist',
    label: 'The Flexible Browser',
    sub:   'I start with a plan but adjust based on what looks good.',
    icon:  'smile',
  },
  {
    key:   'improviser',
    label: 'The Last-Minute Improviser',
    sub:   'I usually figure it out when I get there.',
    icon:  'zap',
  },
];

const CART_VS_LIST = [
  { key: 'exact',       label: 'Exactly what\'s on the list',        sub: 'I stick closely to my plan.',                        icon: 'check-square' },
  { key: 'mostly_same', label: 'Mostly the same',    sub: 'I stay close, but the end-cap gets me sometimes.',              icon: 'percent'      },
  { key: 'different',   label: 'Pretty different',      sub: 'The list is a suggestion. The store decides.',                  icon: 'shuffle'      },
  { key: 'no_list',     label: 'I don\'t usually make lists',          sub: 'I operate on vibes, memory, and what looks fresh.',             icon: 'wind'         },
];

const DEAL_IMPULSE = [
  { key: 'skip',       label: 'Skip it',                    sub: 'If it\'s not on the list, it doesn\'t exist.',        icon: 'x-circle'      },
  { key: 'buy_one',    label: 'Buy one just in case',       sub: 'Future me will thank me. Probably.',                  icon: 'shopping-bag'  },
  { key: 'stock_up',   label: 'Stock up',   sub: 'BOGO is a command. I take it seriously.',              icon: 'layers'        },
  { key: 'depends',    label: 'Depends on the category', sub: 'Paper towels? Yes. Avocados? Absolutely not.',      icon: 'sliders'       },
];

const KITCHEN_VIBES = [
  { key: 'meal_prep',       label: 'Meal Prep Mode',            sub: 'I like planning meals ahead.',      icon: 'calendar'   },
  { key: 'fresh_spontaneous', label: 'Fresh & Flexible',     sub: 'I cook based on what sounds good or what is available.', icon: 'feather'  },
  { key: 'takeout_backup',  label: 'Cook Sometimes, Eat Out Sometimes', sub: 'I cook when I can, but real life happens.',          icon: 'package'    },
  { key: 'chef_mode',       label: 'From-Scratch Cook',            sub: 'I prefer making most things myself.',  icon: 'award'      },
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
  { key: 'general_wellness',        label: 'General wellness',      icon: '💚' },
  { key: 'lower_sugar',        label: 'Lower sugar',      icon: '🍬' },
  { key: 'lower_sodium',       label: 'Lower sodium',  icon: '🧂' },
  { key: 'high_protein',             label: 'High protein',       icon: '🥩' },
  { key: 'low_carb_keto',             label: 'Low carb / keto',       icon: '🥑' },
  { key: 'vegetarian',                label: 'Vegetarian',       icon: '🥕' },
  { key: 'vegan',                label: 'Vegan',       icon: '🌱' },
  { key: 'none',               label: 'No restrictions',                 icon: '✓'  },
];

const PANTRY_OPTIONS = [
  'Eggs', 'Milk', 'Butter', 'Greek Yogurt', 'Cheese',
  'Chicken Breast', 'Ground Beef', 'Salmon', 'Bacon',
  'Spinach', 'Broccoli', 'Sweet Potatoes', 'Avocados',
  'Bananas', 'Apples', 'Berries',
  'Rice', 'Pasta', 'Oats', 'Bread', 'Tortillas',
  'Olive Oil', 'Coconut Oil', 'Almond Butter', 'Peanut Butter',
  'Coffee', 'Protein Powder', 'Energy Drinks', 'Sparkling Water',
  'Baby Formula', 'Diapers', 'Dog Food', 'Cat Food',
  'Paper Towels', 'Laundry Detergent',
];

const PRICE_CHECK_FREQ = [
  { key: 'never',            label: 'Almost never',        sub: 'I find what I like and stay loyal.',                  icon: 'heart'         },
  { key: 'sometimes',        label: 'Sometimes',           sub: 'I check if something feels too expensive.',           icon: 'eye'           },
  { key: 'always',           label: 'Often',          sub: 'I know the unit price of many products.', icon: 'bar-chart-2' },
  { key: 'switched_recently',label: 'I recently switched brands because of price',   sub: 'The price gap finally got to me.', icon: 'refresh-cw'  },
];

const IMPULSE_CATEGORIES = [
  { key: 'snacks',     label: 'Snacks',          icon: '🍿' },
  { key: 'beverages',  label: 'Drinks',      icon: '🧃' },
  { key: 'home',       label: 'Home & cleaning items',         icon: '🧹' },
  { key: 'self_care',  label: 'Self-care items',      icon: '✨' },
  { key: 'candy',      label: 'Candy or checkout items',   icon: '🍬' },
  { key: 'none',       label: 'Nothing — I stick to the list', icon: '🧊' },
];

const POST_SHOP_FEELINGS = [
  { key: 'accomplished', label: 'Accomplished',          sub: 'I got deals. I stayed on budget.',      icon: 'trophy'        },
  { key: 'guilty',       label: 'A little guilty about something', sub: 'There\'s always that one thing.', icon: 'alert-circle' },
  { key: 'neutral',      label: 'Neutral',  sub: 'Task done. Moving on.',    icon: 'minus-circle'  },
  { key: 'irritated',    label: 'Frustrated by the total', sub: 'Every week it comes to that much.',      icon: 'frown'         },
];

const FIN_GOALS = [
  { key: 'debt_payoff',    label: 'Pay off debt',       sub: 'Every dollar saved goes toward eliminating what I owe', icon: 'credit-card'  },
  { key: 'build_wealth',   label: 'Build savings',       sub: 'I want to invest the difference — savings = assets',    icon: 'trending-up'  },
  { key: 'emergency_fund', label: 'Emergency fund',     sub: 'I need a safety net before anything else',              icon: 'shield'       },
  { key: 'stretch_budget', label: 'Make this month stretch',    sub: 'Tight month — I need every dollar to go further',       icon: 'percent'   },
  { key: 'spend_less',     label: 'Spend less without sacrificing meals', sub: 'Keep the quality but cut the cost', icon: 'dollar-sign' },
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
  { key: 'orders_delivery', label: 'I order delivery',    sub: 'A delivery app when I\'m fried',                     icon: 'package'  },
  { key: 'grabs_fast_food', label: 'I grab fast food',    sub: 'Drive-through is the backup plan',                   icon: 'map-pin'  },
  { key: 'still_cooks',     label: 'I still cook',        sub: 'Kitchen is my therapy, even on hard days',            icon: 'heart'    },
  { key: 'eats_whatever',   label: 'Whatever\'s there',   sub: 'Fridge roulette — meal planning goes out the window', icon: 'shuffle'  },
];

const AUTONOMY = [
  { key: 'show_deals', label: 'Just show me the deals',    sub: 'Surface the best prices — I\'ll decide what to buy', icon: 'eye'           },
  { key: 'build_cart', label: 'Build my food plan, I\'ll approve', sub: 'Pre-fill my weekly plan. I review and confirm', icon: 'calendar' },
  { key: 'full_auto',  label: 'Fully guided — I trust the plan', sub: 'Handle my weekly plan. Alert me if I\'m over budget',  icon: 'cpu'     },
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
export default function SnippdDeepBriefScreen({ navigation, route }) {
  const preHousehold = route?.params?.household ?? {};
  const returnTo = route?.params?.returnTo;

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
  const [disclaimerAcknowledged, setDisclaimerAcknowledged] = useState(false);

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

  useEffect(() => {
    tracker.track('deep_brief_started');
  }, []);

  const goToChapter = useCallback((next) => {
    if (next > chapter) {
      tracker.track('deep_brief_chapter_completed', { chapter: next + 1 });
    }
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
  }, [fadeAnim, slideAnim, chapter]);

  const toggleItem = useCallback((list, setList, key) => {
    setList(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }, []);

  const canAdvance = useCallback(() => {
    if (chapter === 0) return true;                              // household optional
    if (chapter === 1) return !!archetype && !!cartVsList;       // archetype required
    if (chapter === 2) return !!kitchenVibe;                     // kitchen vibe required
    if (chapter === 3) return disclaimerAcknowledged;           // disclaimer required
    if (chapter === 4) return anchors.length > 0;               // at least 1 anchor
    if (chapter === 5) return !!priceCheckFreq && !!postShopFeeling; // behavior required
    if (chapter === 6) return !!finGoal && stores.length > 0;   // money & stores required
    if (chapter === 7) return !!stressBehavior && !!autonomy;   // mandate required
    return false;
  }, [chapter, archetype, cartVsList, kitchenVibe, disclaimerAcknowledged, anchors, priceCheckFreq, postShopFeeling, finGoal, stores, stressBehavior, autonomy]);

  const handleComplete = useCallback(async () => {
    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigation.replace('Auth'); return; }

      const parsedAges = childAges
        .split(/[,\s]+/)
        .map(s => parseInt(s, 10))
        .filter(n => !isNaN(n) && n >= 0 && n <= 17);

      const allAnchors = [...anchors, ...(customAnchor.trim() ? [customAnchor.trim()] : [])];

      const weeklyGroceryCents = weeklySpend
        ? Math.round(parseFloat(weeklySpend.replace(/[^0-9.]/g, '')) * 100) || null
        : null;

      const personaData = {
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
        allergy_disclaimer_acknowledged: disclaimerAcknowledged,
        allergy_disclaimer_acknowledged_at: disclaimerAcknowledged ? new Date().toISOString() : null,
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
        completed_at:            new Date().toISOString(),
      };

      await supabase.from('user_persona').upsert(personaData, { onConflict: 'user_id' });

      // Firebase compatibility placeholder
      try {
        if (global.firebase) {
          const firestore = global.firebase.firestore();
          await firestore.collection('userPersona').doc(user.id).set(personaData, { merge: true });
        }
      } catch (firebaseError) {
        console.warn('Firebase placeholder write failed:', firebaseError);
      }

      // Neo4j placeholder sync
      try {
        syncDeepBriefToNeo4j(user.id, personaData);
        tracker.track('neo4j_deep_brief_sync_queued', { userId: user.id });
      } catch (neoError) {
        console.warn('Neo4j sync placeholder error:', neoError);
      }

      tracker.track('persona_saved', { userId: user.id, completed: true });
      tracker.track('deep_brief_completed', { chapter: chapter + 1 });

      const finishAction = () => {
        if (returnTo) {
          navigation.goBack();
        } else {
          navigation.replace('MainApp');
        }
      };
      Alert.alert(
        'Snippd Deep Brief saved',
        'Your profile is now ready to help Snippd make better weekly plans for your household. You can update this anytime from your profile.',
        [{ text: 'Done', onPress: finishAction }],
        { cancelable: false }
      );
    } catch (e) {
      console.error('DeepBrief save error:', e);
    } finally {
      setSubmitting(false);
    }
  }, [
    childAges, archetype, cartVsList, dealImpulse, kitchenVibe, weeklyMeal,
    allergies, diagnoses, anchors, customAnchor, disclaimerAcknowledged, priceCheckFreq, impulseCategory,
    postShopFeeling, finGoal, stores, loyalCards, weeklySpend, multiStore,
    stressBehavior, autonomy, snippdSolveFor, personaNotes, navigation, chapter,
  ]);

  // ── Chapter renders (called as functions, not mounted as JSX components) ────

  function renderChapter0() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 1 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Who Are We Planning For?</Text>
          <Text style={styles.chapterSub}>
            Tell Snippd a little more about your household so your weekly plan fits real life.
          </Text>
        </View>
        <Text style={styles.fieldLabel}>Household details help Snippd plan portions, grocery needs, savings opportunities, and food routines more accurately.</Text>
        <Text style={styles.fieldLabel}>Ages of children, if applicable</Text>
        <Text style={styles.fieldHint}>Example: 3, 8, 14</Text>
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
            The more I understand your household, the better I can help you save more and stress less.
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
          <Text style={styles.chapterTitle}>How Do You Shop?</Text>
          <Text style={styles.chapterSub}>
            Everyone shops differently. Snippd uses this to guide your plan in a way that actually fits your habits.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Which sounds most like you?</Text>
        {ARCHETYPES.map(a => (
          <OptionCard key={a.key} item={a} selected={archetype === a.key} onPress={() => setArchetype(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>How close is your cart to your list?</Text>
        {CART_VS_LIST.map(a => (
          <OptionCard key={a.key} item={a} selected={cartVsList === a.key} onPress={() => setCartVsList(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>When you see a good deal that was not on your list, you usually:</Text>
        {DEAL_IMPULSE.map(a => (
          <OptionCard key={a.key} item={a} selected={dealImpulse === a.key} onPress={() => setDealImpulse(a.key)} />
        ))}

        <View style={styles.infoCard}>
          <Feather name="heart" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            No judgment. I just want to help your plan match how you really shop.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter2() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 3 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>How Do You Cook?</Text>
          <Text style={styles.chapterSub}>
            Your cooking style helps Snippd recommend meals, grocery items, and eat-out alternatives that fit your week.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>Which sounds most like your kitchen?</Text>
        {KITCHEN_VIBES.map(k => (
          <OptionCard key={k.key} item={k} selected={kitchenVibe === k.key} onPress={() => setKitchenVibe(k.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>What is one meal you make almost every week?</Text>
        <Text style={styles.fieldHint}>Example: tacos, pasta, chicken bowls, breakfast sandwiches</Text>
        <TextInput
          style={styles.textInput}
          value={weeklyMeal}
          onChangeText={setWeeklyMeal}
          placeholder="tacos, pasta, chicken bowls, breakfast sandwiches"
          placeholderTextColor={DIM}
          returnKeyType="done"
          blurOnSubmit
        />

        <View style={styles.infoCard}>
          <Feather name="heart" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            I'll help protect the ingredients and routines your household already loves.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter3() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 4 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Food Preferences & Safety Notes</Text>
          <Text style={styles.chapterSub}>
            Select preferences or allergies you want Snippd to keep in mind when guiding your weekly plan.
          </Text>
        </View>

        <View style={styles.disclaimerCard}>
          <Feather name="alert-triangle" size={16} color={CORAL} />
          <Text style={styles.disclaimerText}>
            Important: Snippd does not verify allergens, ingredients, cross-contact, or medical suitability. Always read product labels, review restaurant ingredient information, and consult a qualified medical professional. Snippd provides planning support only.
          </Text>
        </View>

        {!disclaimerAcknowledged && (
          <TouchableOpacity
            style={styles.acknowledgeBtn}
            onPress={() => setDisclaimerAcknowledged(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.acknowledgeBtnText}>I Understand & Continue</Text>
          </TouchableOpacity>
        )}

        {disclaimerAcknowledged && (
          <>
            <Text style={styles.fieldLabel}>Allergies</Text>
            <Text style={styles.fieldHint}>Select any allergies to keep in mind</Text>
            <View style={styles.pillGrid}>
              {ALLERGIES.map(a => (
                <Pill key={a.key} item={a} selected={allergies.includes(a.key)} onPress={() => toggleItem(allergies, setAllergies, a.key)} />
              ))}
            </View>

            <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Food preferences</Text>
            <Text style={styles.fieldHint}>Select any preferences to guide suggestions</Text>
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
              <Feather name="heart" size={14} color={ACCENT} />
              <Text style={styles.infoText}>
                I'll help guide your plan, but labels and medical guidance always come first.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    );
  }

  function renderChapter4() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 5 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Everyday Staples</Text>
          <Text style={styles.chapterSub}>
            Tell Snippd what usually ends up in your cart so future plans can better reflect what your household actually buys.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>What is in your cart almost every week?</Text>
        <Text style={styles.fieldHint}>Select all that apply</Text>
        <View style={styles.pillGridWrap}>
          {PANTRY_OPTIONS.map(item => (
            <Pill key={item} item={{ label: item }} selected={anchors.includes(item)} onPress={() => toggleItem(anchors, setAnchors, item)} />
          ))}
        </View>
        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Anything we missed?</Text>
        <TextInput
          style={styles.textInput}
          value={customAnchor}
          onChangeText={setCustomAnchor}
          placeholder="Add another staple item"
          placeholderTextColor={DIM}
          returnKeyType="done"
          blurOnSubmit
        />
        {anchors.length > 0 && (
          <View style={styles.anchorCount}>
            <Feather name="check-circle" size={14} color={ACCENT} />
            <Text style={styles.anchorCountText}>
              {anchors.length} staple{anchors.length !== 1 ? 's' : ''} selected.
            </Text>
          </View>
        )}

        <View style={styles.infoCard}>
          <Feather name="heart" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            Staples matter. I'll use these to help make future plans feel more like your household.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter5() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 6 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Your Real-Life Shopping Patterns</Text>
          <Text style={styles.chapterSub}>
            These questions help Snippd understand where your food budget usually gets stretched.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>How often do you compare prices?</Text>
        {PRICE_CHECK_FREQ.map(p => (
          <OptionCard key={p.key} item={p} selected={priceCheckFreq === p.key} onPress={() => setPriceCheckFreq(p.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>What usually sneaks into your cart?</Text>
        <Text style={styles.fieldHint}>Select all that apply</Text>
        <View style={styles.pillGrid}>
          {IMPULSE_CATEGORIES.map(i => (
            <Pill key={i.key} item={i} selected={impulseCategory === i.key} onPress={() => setImpulseCategory(i.key)} />
          ))}
        </View>

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>After grocery shopping, you usually feel:</Text>
        {POST_SHOP_FEELINGS.map(p => (
          <OptionCard key={p.key} item={p} selected={postShopFeeling === p.key} onPress={() => setPostShopFeeling(p.key)} />
        ))}

        <View style={styles.infoCard}>
          <Feather name="heart" size={14} color={ACCENT} />
          <Text style={styles.infoText}>
            This helps me catch budget leaks earlier, without making you feel bad about real life.
          </Text>
        </View>
      </ScrollView>
    );
  }

  function renderChapter6() {
    return (
      <ScrollView contentContainerStyle={styles.chapterContent} showsVerticalScrollIndicator={false}>
        <View style={styles.chapterHeader}>
          <Text style={styles.chapterEyebrow}>Chapter 7 of {TOTAL_CHAPTERS}</Text>
          <Text style={styles.chapterTitle}>Budget, Stores & Savings Goals</Text>
          <Text style={styles.chapterSub}>
            Tell Snippd what you are trying to accomplish financially and where you usually shop.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>What is your main savings goal right now?</Text>
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
            placeholder="185"
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
            { key: 'no',        label: 'No, usually one store' },
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

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Which stores have loyalty or rewards accounts?</Text>
        <Text style={styles.fieldHint}>These help unlock digital savings deals</Text>
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
          <Text style={styles.chapterTitle}>What Should Snippd Help With Most?</Text>
          <Text style={styles.chapterSub}>
            Last step. Tell Snippd what kind of support would make your food planning feel easier.
          </Text>
        </View>

        <Text style={styles.fieldLabel}>When you are busy or stressed, what usually happens with food?</Text>
        <Text style={styles.fieldHint}>This helps Snippd support your routine, not override it.</Text>
        {STRESS_BEHAVIORS.map(s => (
          <OptionCard key={s.key} item={s} selected={stressBehavior === s.key} onPress={() => setStressBehavior(s.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>How much help do you want from Snippd?</Text>
        {AUTONOMY.map(a => (
          <OptionCard key={a.key} item={a} selected={autonomy === a.key} onPress={() => setAutonomy(a.key)} />
        ))}

        <Text style={[styles.fieldLabel, { marginTop: 24 }]}>What is the one thing you most want Snippd to help solve?</Text>
        <Text style={styles.fieldHint}>Example: Help me stop overspending when I shop tired.</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 90 }]}
          value={snippdSolveFor}
          onChangeText={setSnippdSolveFor}
          placeholder="Help me stop overspending when I shop tired."
          placeholderTextColor={DIM}
          multiline
          maxLength={300}
          textAlignVertical="top"
        />
        {snippdSolveFor.length > 0 && (
          <Text style={styles.charCount}>{300 - snippdSolveFor.length} remaining</Text>
        )}

        <Text style={[styles.fieldLabel, { marginTop: 20 }]}>Anything else Snippd should remember?</Text>
        <TextInput
          style={[styles.textInput, { minHeight: 70 }]}
          value={personaNotes}
          onChangeText={setPersonaNotes}
          placeholder="My kids do not like spicy food. We always need easy breakfast options."
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
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Top bar */}
      <View style={styles.topBar}>
        <View style={styles.progressWrap}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>
        <Text style={styles.topBarLabel}>{CHAPTER_LABELS[chapter]}</Text>
      </View>

      {/* Intro */}
      {chapter === 0 && (
        <View style={styles.introContainer}>
          <Text style={styles.introTitle}>Snippd Deep Brief</Text>
          <Text style={styles.introText}>
            Answer a few deeper questions so Snippd can better understand your household, shopping habits, cooking style, savings goals, and food preferences.
          </Text>
        </View>
      )}

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
              {chapter === TOTAL_CHAPTERS - 1 ? (submitting ? 'Saving…' : 'Finish & Save') : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function syncDeepBriefToNeo4j(userId, personaData) {
  console.log('Neo4j sync payload:', {
    userId,
    relationships: {
      shoppingArchetype: personaData.shopping_archetype,
      kitchenVibe: personaData.kitchen_vibe,
      preferredStores: personaData.preferred_stores,
      pantryAnchors: personaData.pantry_anchors,
      impulseCategory: personaData.impulse_category,
      financialGoal: personaData.financial_goal,
      stressBehavior: personaData.stress_behavior,
      supportProblem: personaData.snippd_solve_for,
    },
  });
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BG },
  topBar: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 14, gap: 8 },
  progressWrap: { height: 3, backgroundColor: DIM, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: 3, backgroundColor: ACCENT, borderRadius: 2 },
  topBarLabel: { fontSize: 11, fontWeight: '700', color: ACCENT, letterSpacing: 1.5, textTransform: 'uppercase' },

  chapterContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 4 },
  chapterHeader: { marginBottom: 24, gap: 6 },
  chapterEyebrow: { fontSize: 11, fontWeight: '700', color: SILVER, letterSpacing: 1.5, textTransform: 'uppercase' },
  chapterTitle: { fontSize: 28, fontWeight: '900', color: NAVY, lineHeight: 34 },
  chapterSub: { fontSize: 14, color: SILVER, lineHeight: 22, marginTop: 4 },

  fieldLabel: { fontSize: 13, fontWeight: '800', color: NAVY, marginTop: 8, marginBottom: 8 },
  fieldHint: { fontSize: 12, color: SILVER, marginBottom: 12, lineHeight: 18 },

  textInput: {
    backgroundColor: SURFACE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: NAVY,
    fontSize: 15,
    marginBottom: 8,
  },

  spendRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12, marginBottom: 8 },
  spendPrefix: { color: ACCENT, fontSize: 18, fontWeight: '800' },
  spendInput: { flex: 1, color: NAVY, fontSize: 22, fontWeight: '800', padding: 0 },
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
  optLabel: { fontSize: 14, fontWeight: '800', color: NAVY, marginBottom: 2 },
  optLabelSelected: { color: MINT_POP },
  optSub: { fontSize: 12, color: SILVER, lineHeight: 17 },

  infoCard: { flexDirection: 'row', gap: 10, backgroundColor: SURFACE_HI, borderRadius: 10, padding: 12, marginTop: 8, borderWidth: 1, borderColor: BORDER },
  infoText: { flex: 1, fontSize: 12, color: SILVER, lineHeight: 18 },

  disclaimerCard: { flexDirection: 'row', gap: 10, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 12, marginBottom: 16, borderWidth: 1, borderColor: CORAL },
  disclaimerText: { flex: 1, fontSize: 12, color: NAVY, lineHeight: 18 },

  acknowledgeBtn: { backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 15, alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  acknowledgeBtnText: { color: WHITE, fontSize: 15, fontWeight: '900', letterSpacing: 0.3 },

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

  introContainer: { paddingHorizontal: 24, paddingVertical: 16, backgroundColor: BG },
  introTitle: { fontSize: 24, fontWeight: '900', color: NAVY, textAlign: 'center', marginBottom: 8 },
  introText: { fontSize: 16, color: SILVER, textAlign: 'center', lineHeight: 24 },
});
