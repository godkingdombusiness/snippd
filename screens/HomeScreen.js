/**
 * HomeScreen.js — Today Decision Hub
 *
 * Layout mirrors the Snippd premium UI template:
 *   Header (logo + notification + profile)
 *   Greeting + Budget widget
 *   Context stats row (horizontal scroll)
 *   Best Match hero card (#1 ranked option)
 *   "Other great options" horizontal scroll
 *   Smart insight card
 *
 * Data: Supabase profile → decision engine → ranked options.
 * Navigation: each option card routes to the correct destination screen.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  RefreshControl,
  Image,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';

var { rankOptions, OPTION_TYPES } = require('../src/services/foodOptions/decisionEngineService');
var { getPersonalizedDeals }      = require('../src/services/weeklyDealsService');

// ── Colors ────────────────────────────────────────────────────────────────────
var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var MINT   = '#E8F5E9';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var AMBER  = '#F59E0B';
var LIGHT_BLUE = '#EFF6FF';
var BLUE   = '#3B82F6';

// ── Static option configuration ───────────────────────────────────────────────

var OPTION_META = {
  cook_from_pantry:   { icon: 'home',          label: 'Cook from pantry',   iconColor: GREEN },
  quick_grocery_run:  { icon: 'shopping-cart', label: 'Quick grocery run',  iconColor: GREEN },
  grocery_pickup:     { icon: 'shopping-bag',  label: 'Grocery pickup',     iconColor: GREEN },
  uber_eats_pickup:   { icon: 'package',       label: 'Uber Eats pickup',   iconColor: GREEN },
  eat_out_smart:      { icon: 'star',          label: 'Eat out smart',      iconColor: AMBER  },
  uber_eats_delivery: { icon: 'truck',         label: 'Uber Eats delivery', iconColor: AMBER  },
};

var HERO_MEAL_META = {
  cook_from_pantry: {
    mealName: 'Chicken Rice Bowls',
    bullets:  ['Uses ingredients you already have', 'Only 1 item to buy', 'Keeps you under budget'],
    timeLabel: '25 min',
    image: require('../assets/cat-protein.png'),
  },
  quick_grocery_run: {
    mealName: 'Ground Beef Tacos',
    bullets:  ['Only 3 items from the store', 'Budget-friendly for any household', 'Ready in under 25 min'],
    timeLabel: '25 min',
    image: require('../assets/cat-pantry.png'),
  },
  grocery_pickup: {
    mealName: 'Pasta Night',
    bullets:  ['Order ahead — no browsing in-store', 'Ready for pickup in under an hour', 'Great value per person'],
    timeLabel: '50 min',
    image: require('../assets/cat-pantry.png'),
  },
  uber_eats_pickup: {
    mealName: 'Skip the wait',
    bullets:  ['Order ahead online', 'Pick up in 20 min', 'No delivery fee'],
    timeLabel: '20 min',
    image: require('../assets/cat-snacks.png'),
  },
  eat_out_smart: {
    mealName: 'Local budget options',
    bullets:  ['Ranked by your remaining budget', 'Filtered by household size', 'No surprise fees'],
    timeLabel: 'Varies',
    image: require('../assets/cat-fruits.png'),
  },
  uber_eats_delivery: {
    mealName: 'Delivered to your door',
    bullets:  ['Most convenient option tonight', 'Compare delivery totals before ordering', 'Fees shown upfront'],
    timeLabel: '25-45 min',
    image: require('../assets/cat-protein.png'),
  },
};

var PER_PERSON_CENTS = {
  cook_from_pantry:   250,
  quick_grocery_run:  450,
  grocery_pickup:     600,
  uber_eats_pickup:   1050,
  eat_out_smart:      1100,
  uber_eats_delivery: 1350,
};

var MINI_TIME_LABELS = {
  cook_from_pantry:   '25 min',
  quick_grocery_run:  '35 min',
  grocery_pickup:     'Varies',
  uber_eats_pickup:   '20 min',
  eat_out_smart:      'Varies',
  uber_eats_delivery: '25-45 min',
};

var MINI_SUBTITLES = {
  cook_from_pantry:   'Free pantry meal',
  quick_grocery_run:  'Fast shop, budget-friendly',
  grocery_pickup:     'No browsing, order ahead',
  uber_eats_pickup:   'Skip the wait',
  eat_out_smart:      'Local deals that fit your budget',
  uber_eats_delivery: 'Most convenient',
};

// ── Pure helpers ──────────────────────────────────────────────────────────────

function getGreeting() {
  var h = new Date().getHours();
  if (h >= 5 && h < 12)  return 'Good morning';
  if (h >= 12 && h < 17) return 'Good afternoon';
  if (h >= 17 && h < 21) return 'Good evening';
  return 'Good night';
}

function extractFirstName(profile, email) {
  if (profile && profile.full_name) {
    return profile.full_name.split(' ')[0];
  }
  if (email) {
    return email.split('@')[0].replace(/[^a-zA-Z]/g, ' ').trim().split(' ')[0];
  }
  return 'there';
}

function formatDollars(cents) {
  return '$' + Math.round(cents / 100);
}

function formatDollarsFull(cents) {
  return '$' + (cents / 100).toFixed(2);
}

function scaleCost(baseCentsPerPerson, householdSize) {
  return Math.round(baseCentsPerPerson * (householdSize || 2));
}

function fitLabel(scoreLabel) {
  if (scoreLabel === 'Best fit' || scoreLabel === 'Good fit') return 'Good fit';
  if (scoreLabel === 'Possible') return 'Possible';
  return 'Possible';
}

function fitColor(scoreLabel) {
  if (scoreLabel === 'Best fit' || scoreLabel === 'Good fit') return BLUE;
  return AMBER;
}

function buildContextFromProfile(profile, pantryCount) {
  var weekly = profile?.weekly_budget || 150;
  var budgetCents = Math.round(weekly * 100);
  // Midweek heuristic for remaining budget
  var dow = new Date().getDay();
  var weekProgress = [0, 0.14, 0.28, 0.43, 0.57, 0.71, 0.86][dow] || 0.43;
  var remainingCents = Math.round(budgetCents * (1 - weekProgress * 0.5));

  var pantryPct = profile?.pantry_preference === 'use_first' ? 1 : 0.7;
  var estimatedPantryCount = pantryCount > 0 ? pantryCount : Math.round(pantryPct * 10);

  return {
    weeklyBudgetCents:    budgetCents,
    remainingBudgetCents: remainingCents,
    householdSize:        profile?.household_size || 2,
    cookingTimeMin:       30,
    foodGoals:            [],
    pantryCount:          estimatedPantryCount,
    hasKids:              false,
    preferenceStyle:      'saver',
  };
}

function buildSmartInsight(profile) {
  var cookingDays = profile?.cooking_days || 4;
  var eatOutDays  = profile?.eat_out_days || 2;
  var dow = new Date().getDay();
  var isWeekend = dow === 0 || dow === 6;

  if (isWeekend && eatOutDays >= 2) {
    return {
      title: 'Smart insight for you',
      body: 'You usually eat out on weekends. Cooking tonight is a great way to save before a night out.',
    };
  }
  if (cookingDays >= 4) {
    return {
      title: 'Smart insight for you',
      body: 'You usually cook on weekdays and eat out on weekends. Cooking tonight helps protect your budget for the weekend.',
    };
  }
  return {
    title: 'Smart insight for you',
    body: 'Cooking a simple pantry meal tonight could save your household $15–25 compared to ordering out.',
  };
}

function navigateForOption(navigation, optionType, context) {
  switch (optionType) {
    case 'cook_from_pantry':
      navigation.navigate('PantryInventory');
      break;
    case 'quick_grocery_run':
      navigation.navigate('QuickGroceryRun', { context: context });
      break;
    case 'grocery_pickup':
      navigation.navigate('StorePickupHandoff');
      break;
    case 'uber_eats_pickup':
      navigation.navigate('UberEatsPickupHandoff');
      break;
    case 'eat_out_smart':
      navigation.navigate('EatOutSmart', { context: context });
      break;
    case 'uber_eats_delivery':
      navigation.navigate('UberEatsDelivery');
      break;
    default:
      navigation.navigate('TodayOptionsRanked', { context: context });
  }
}

// ── Module-scope components ───────────────────────────────────────────────────

function StatCard(props) {
  var icon  = props.icon;
  var value = props.value;
  var label = props.label;
  var sub   = props.sub;
  return (
    <View style={styles.statCard}>
      <View style={styles.statIconWrap}>
        <Feather name={icon} size={18} color={GREEN} />
      </View>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {sub ? <Text style={styles.statSub}>{sub}</Text> : null}
    </View>
  );
}

function HeroCard(props) {
  var option        = props.option;
  var householdSize = props.householdSize || 2;
  var onPress       = props.onPress;

  var meta     = HERO_MEAL_META[option.optionType] || HERO_MEAL_META.cook_from_pantry;
  var optMeta  = OPTION_META[option.optionType] || OPTION_META.cook_from_pantry;
  var costCents = scaleCost(PER_PERSON_CENTS[option.optionType] || 0, householdSize);

  return (
    <View style={styles.heroCard}>
      {/* Left content */}
      <View style={styles.heroLeft}>
        <View style={styles.heroBestMatchBadge}>
          <Text style={styles.heroBestMatchText}>BEST MATCH</Text>
        </View>

        <Text style={styles.heroTitle}>{optMeta.label}</Text>
        <Text style={styles.heroMealName}>{meta.mealName}</Text>

        <View style={styles.heroBullets}>
          {meta.bullets.map(function (b, i) {
            return (
              <View key={i} style={styles.heroBulletRow}>
                <View style={styles.heroBulletCheck}>
                  <Feather name="check" size={11} color={GREEN} />
                </View>
                <Text style={styles.heroBulletText}>{b}</Text>
              </View>
            );
          })}
        </View>

        <View style={styles.heroStats}>
          <View style={styles.heroStatBox}>
            <Text style={styles.heroStatLabel}>Est. additional cost</Text>
            <Text style={styles.heroStatValue}>{formatDollarsFull(costCents)}</Text>
          </View>
          <View style={styles.heroStatDivider} />
          <View style={styles.heroStatBox}>
            <Text style={styles.heroStatLabel}>Ready in</Text>
            <Text style={styles.heroStatValue}>{meta.timeLabel}</Text>
          </View>
        </View>
      </View>

      {/* Right: image + CTA */}
      <View style={styles.heroRight}>
        <View style={styles.heroImageWrap}>
          <Image
            source={meta.image}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroImageOverlay} />
        </View>
        <TouchableOpacity style={styles.heroCtaBtn} onPress={onPress} activeOpacity={0.85}>
          <Text style={styles.heroCtaBtnText}>View Meal</Text>
          <Feather name="chevron-right" size={14} color={NAVY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function MiniOptionCard(props) {
  var option        = props.option;
  var householdSize = props.householdSize || 2;
  var onPress       = props.onPress;

  var meta     = OPTION_META[option.optionType]      || OPTION_META.cook_from_pantry;
  var perPerson = PER_PERSON_CENTS[option.optionType] || 0;
  var totalCents = scaleCost(perPerson, householdSize);
  var timeLabel  = MINI_TIME_LABELS[option.optionType] || '';
  var subtitle   = MINI_SUBTITLES[option.optionType]   || '';
  var fit        = fitLabel(option.scoreLabel);
  var fColor     = fitColor(option.scoreLabel);

  return (
    <TouchableOpacity style={styles.miniCard} onPress={onPress} activeOpacity={0.82}>
      <View style={[styles.miniIconWrap, { backgroundColor: meta.iconColor + '18' }]}>
        <Feather name={meta.icon} size={20} color={meta.iconColor} />
      </View>
      <Text style={styles.miniLabel}>{meta.label}</Text>
      <Text style={styles.miniSubtitle} numberOfLines={2}>{subtitle}</Text>
      <View style={styles.miniArrow}>
        <Feather name="chevron-right" size={14} color={GRAY} />
      </View>
      <Text style={styles.miniCost}>
        {totalCents === 0 ? 'Free' : formatDollars(totalCents)}
        {'  '}
        <Text style={styles.miniTime}>{timeLabel}</Text>
      </Text>
      <View style={[styles.miniFitBadge, { backgroundColor: fColor + '18' }]}>
        <Text style={[styles.miniFitText, { color: fColor }]}>{fit}</Text>
      </View>
    </TouchableOpacity>
  );
}

function InsightCard(props) {
  var insight = props.insight;
  var onPress = props.onPress;
  return (
    <TouchableOpacity style={styles.insightCard} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.insightIconWrap}>
        <Feather name="zap" size={20} color={WHITE} />
      </View>
      <View style={styles.insightText}>
        <Text style={styles.insightTitle}>{insight.title}</Text>
        <Text style={styles.insightBody}>{insight.body}</Text>
      </View>
      <Feather name="chevron-right" size={18} color={GRAY} />
    </TouchableOpacity>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  var [loading,    setLoading]    = useState(true);
  var [refreshing, setRefreshing] = useState(false);
  var [profile,    setProfile]    = useState(null);
  var [userName,   setUserName]   = useState('');
  var [pantryCount, setPantryCount] = useState(0);
  var [options,    setOptions]    = useState([]);
  var [context,    setContext]    = useState(null);
  var [notifCount, setNotifCount] = useState(3);
  var [weeklyDeals, setWeeklyDeals] = useState([]);
  var tapCount = useRef(0);
  var tapTimer = useRef(null);

  useFocusEffect(
    useCallback(function () {
      loadAll();
      return function () {};
    }, [])
  );

  async function loadAll() {
    try {
      var authResult = await supabase.auth.getUser();
      var user = authResult?.data?.user;
      if (!user) { setLoading(false); return; }

      var [profileResult, pantryResult] = await Promise.all([
        supabase.from('profiles').select('*').eq('user_id', user.id).maybeSingle(),
        supabase.from('pantry_items').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      ]);

      var prof  = profileResult?.data || {};
      var pCount = pantryResult?.count || 0;

      setProfile(prof);
      setPantryCount(pCount);
      setUserName(extractFirstName(prof, user.email));

      var profileForDeals = {
        preferred_stores: prof.preferred_stores || [],
        dealPreferences:  prof.deal_preferences || [],
        weeklyBudget:     prof.weekly_budget    || 0,
      };
      setWeeklyDeals(getPersonalizedDeals(profileForDeals));

      var ctx = buildContextFromProfile(prof, pCount);
      setContext(ctx);

      var allTypes = Object.values(OPTION_TYPES);
      var ranked   = rankOptions(allTypes, ctx);
      setOptions(ranked);

      tracker.track('home_viewed', { user_id: user.id });
    } catch (e) {
      // Non-blocking — show defaults
      var defaultCtx = buildContextFromProfile({}, 0);
      setContext(defaultCtx);
      var allTypes = Object.values(OPTION_TYPES);
      setOptions(rankOptions(allTypes, defaultCtx));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  function handleRefresh() {
    setRefreshing(true);
    loadAll();
  }

  function handleSeeAll() {
    if (context) {
      navigation.navigate('TodayOptionsRanked', { context: context });
    } else {
      navigation.navigate('TodaySetupGate');
    }
  }

  function handleHeroPress() {
    if (!options[0] || !context) return;
    navigateForOption(navigation, options[0].optionType, context);
    tracker.track('home_hero_tapped', { option_type: options[0].optionType });
  }

  function handleMiniPress(option) {
    if (!context) return;
    navigateForOption(navigation, option.optionType, context);
    tracker.track('home_mini_option_tapped', { option_type: option.optionType });
  }

  function handleInsightPress() {
    navigation.navigate('TodaySetupGate');
  }

  function handleProfileAvatarTap() {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(function () { tapCount.current = 0; }, 1500);
    if (tapCount.current >= 5) {
      tapCount.current = 0;
      navigation.navigate('DemoAdmin');
    } else {
      // Navigate to Profile tab from within HomeStack
      try { navigation.getParent()?.navigate('ProfileTab'); } catch (_) {}
    }
  }

  // ── Derived values ─────────────────────────────────────────────────────────
  var hero          = options[0] || null;
  var otherOptions  = options.slice(1);
  var householdSize = profile?.household_size || 2;
  var weeklyBudget  = profile?.weekly_budget  || 0;
  var remainingCents = context?.remainingBudgetCents || 0;
  var cookingDays   = profile?.cooking_days   || 4;
  var eatOutDays    = profile?.eat_out_days   || 2;
  var pantryChecked = pantryCount > 0;
  var insight       = buildSmartInsight(profile || {});
  var greeting      = getGreeting();
  var groceryStatus = profile?.grocery_status;
  var groceryLabel  = groceryStatus === 'yes' ? 'Shopped' : groceryStatus === 'partially' ? 'Partially' : 'Not yet';

  // Setup gate: show banner when profile is incomplete (no budget or onboarding not done)
  var timeLabel = context ? (context.cookingTimeMin + ' min') : '--';
  var onboardingDone = !!(profile?.onboarding_complete || profile?.onboarding_completed);
  var showSetupBanner = !onboardingDone || weeklyBudget === 0;

  if (loading) {
    return (
      <SafeAreaView style={styles.root} edges={['top']}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={GREEN} />
        }
      >

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerLogo}>snippd</Text>
            <Text style={styles.headerTagline}>Save more, stress less.</Text>
          </View>
          <View style={styles.headerRight}>
            <TouchableOpacity style={styles.headerIconBtn} activeOpacity={0.7}>
              <Feather name="bell" size={22} color={NAVY} />
              {notifCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{notifCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerIconBtn}
              activeOpacity={0.7}
              onPress={handleProfileAvatarTap}
            >
              <Feather name="user" size={22} color={NAVY} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Greeting + Budget Widget ── */}
        <View style={styles.greetingRow}>
          <View style={styles.greetingLeft}>
            <Text style={styles.greetingText}>
              {greeting + (userName ? ', ' + userName : '') + '  '}
              <Text style={styles.greetingWave}>👋</Text>
            </Text>
            <Text style={styles.greetingSub}>Here's your best move for dinner tonight.</Text>
          </View>
          <TouchableOpacity
            style={styles.budgetWidget}
            onPress={function () { navigation.navigate('TodaySetupGate'); }}
            activeOpacity={0.82}
          >
            <Text style={styles.budgetAmount}>
              {weeklyBudget > 0 ? formatDollars(remainingCents) : '--'}
            </Text>
            <Text style={styles.budgetLabel}>left this week</Text>
            <Feather name="trending-up" size={16} color={GREEN} style={styles.budgetIcon} />
          </TouchableOpacity>
        </View>

        {/* ── Setup Gate Banner ── */}
        {showSetupBanner && (
          <TouchableOpacity
            style={styles.setupBanner}
            onPress={function () { navigation.navigate('TodaySetupGate'); }}
            activeOpacity={0.85}
          >
            <View style={styles.setupBannerIconWrap}>
              <Feather name="alert-circle" size={18} color={AMBER} />
            </View>
            <View style={styles.setupBannerText}>
              <Text style={styles.setupBannerTitle}>Build profile</Text>
              <Text style={styles.setupBannerSub}>Your weekly deal engine is warming up. Add grocery budget and preferences to get personalized recommendations.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={GRAY} />
          </TouchableOpacity>
        )}

        {/* ── Context Stats ── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.statsScroll}
          contentContainerStyle={styles.statsScrollContent}
        >
          <StatCard
            icon="users"
            value={String(householdSize)}
            label="Tonight"
            sub="People eating"
          />
          <StatCard
            icon="clock"
            value={timeLabel}
            label="Before dinner"
            sub="Time available"
          />
          <StatCard
            icon="shopping-bag"
            value={groceryLabel}
            label="This week"
            sub="Grocery status"
          />
          <StatCard
            icon="calendar"
            value={'Cook ' + cookingDays + ' days'}
            label={'Eat out ' + eatOutDays + ' days'}
            sub="Your rhythm"
          />
          <StatCard
            icon="package"
            value={pantryChecked ? 'Yes' : 'Not checked'}
            label={pantryChecked ? pantryCount + ' items found' : 'Tap to scan'}
            sub="Pantry checked"
          />
        </ScrollView>

        {/* ── Hero: Best Match ── */}
        {hero ? (
          <>
            <HeroCard
              option={hero}
              householdSize={householdSize}
              onPress={handleHeroPress}
            />
          </>
        ) : (
          <TouchableOpacity
            style={styles.setupPromptCard}
            onPress={function () { navigation.navigate('TodaySetupGate'); }}
            activeOpacity={0.85}
          >
            <Feather name="sliders" size={24} color={GREEN} />
            <View style={styles.setupPromptText}>
              <Text style={styles.setupPromptTitle}>Set up tonight's options</Text>
              <Text style={styles.setupPromptSub}>Tell Snippd about your budget and household to get ranked recommendations.</Text>
            </View>
            <Feather name="chevron-right" size={18} color={GRAY} />
          </TouchableOpacity>
        )}

        {/* ── Other great options ── */}
        {otherOptions.length > 0 && (
          <View style={styles.otherSection}>
            <View style={styles.otherHeader}>
              <Text style={styles.otherTitle}>Other great options for tonight</Text>
              <TouchableOpacity onPress={handleSeeAll} activeOpacity={0.75}>
                <Text style={styles.seeAllText}>See all  ›</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.miniCardsRow}
            >
              {otherOptions.map(function (option) {
                return (
                  <MiniOptionCard
                    key={option.optionType}
                    option={option}
                    householdSize={householdSize}
                    onPress={function () { handleMiniPress(option); }}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* ── Smart Insight ── */}
        <InsightCard insight={insight} onPress={handleInsightPress} />

        {/* ── Weekly Deals ── */}
        {weeklyDeals.length > 0 && (
          <View style={styles.dealsSection}>
            <Text style={styles.dealsSectionTitle}>This week's best savings for you</Text>
            <Text style={styles.dealsSectionSub}>Based on your stores, budget, and preferences.</Text>
            {weeklyDeals.slice(0, 5).map(function (deal) {
              var savingsLabel = deal.savings_percent ? deal.savings_percent + '% off' : null;
              var priceLabel = deal.final_price_cents
                ? '$' + (deal.final_price_cents / 100).toFixed(2)
                : null;
              var expiresLabel = deal.expires_at
                ? 'Expires ' + deal.expires_at.slice(5).replace('-', '/')
                : null;
              return (
                <View key={deal.id} style={styles.dealCard}>
                  <View style={styles.dealCardLeft}>
                    <View style={styles.dealStoreBadge}>
                      <Text style={styles.dealStoreText}>{deal.store_name.slice(0, 2).toUpperCase()}</Text>
                    </View>
                  </View>
                  <View style={styles.dealCardBody}>
                    <Text style={styles.dealTitle} numberOfLines={1}>{deal.title}</Text>
                    <Text style={styles.dealDesc} numberOfLines={1}>{deal.description}</Text>
                    <View style={styles.dealMeta}>
                      {savingsLabel ? (
                        <View style={styles.dealSavingsBadge}>
                          <Text style={styles.dealSavingsText}>{savingsLabel}</Text>
                        </View>
                      ) : null}
                      {deal.requires_loyalty ? (
                        <View style={styles.dealLoyaltyBadge}>
                          <Feather name="star" size={10} color={AMBER} />
                          <Text style={styles.dealLoyaltyText}>Loyalty</Text>
                        </View>
                      ) : null}
                      {expiresLabel ? (
                        <Text style={styles.dealExpires}>{expiresLabel}</Text>
                      ) : null}
                    </View>
                  </View>
                  {priceLabel ? (
                    <Text style={styles.dealPrice}>{priceLabel}</Text>
                  ) : null}
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

var styles = StyleSheet.create({
  root:        { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:      { flex: 1 },
  scrollContent: { paddingBottom: 120 },

  // Setup gate banner
  setupBanner: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: AMBER + '55',
    padding: 14, gap: 12,
    shadowColor: AMBER, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  setupBannerIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: AMBER + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  setupBannerText: { flex: 1 },
  setupBannerTitle: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 2 },
  setupBannerSub:   { fontSize: 11, color: GRAY, lineHeight: 15 },

  // Header
  header: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    paddingVertical:   14,
  },
  headerLeft: {},
  headerLogo: {
    fontSize:      24,
    fontWeight:    '900',
    color:         NAVY,
    fontFamily:    Platform.OS === 'ios' ? 'Sublima-ExtraBold' : undefined,
    letterSpacing: -0.5,
  },
  headerTagline: {
    fontSize:   11,
    color:      GREEN,
    fontWeight: '600',
    marginTop:  1,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headerIconBtn: {
    width:           40,
    height:          40,
    borderRadius:    20,
    alignItems:      'center',
    justifyContent:  'center',
    position:        'relative',
  },
  notifBadge: {
    position:        'absolute',
    top:             4,
    right:           4,
    width:           17,
    height:          17,
    borderRadius:    9,
    backgroundColor: '#EF4444',
    alignItems:      'center',
    justifyContent:  'center',
  },
  notifBadgeText: { fontSize: 9, fontWeight: '800', color: WHITE },

  // Greeting
  greetingRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingHorizontal: 20,
    marginBottom:      20,
    gap:               12,
  },
  greetingLeft:   { flex: 1 },
  greetingText:   { fontSize: 22, fontWeight: '800', color: NAVY, letterSpacing: -0.3, marginBottom: 4 },
  greetingWave:   { fontSize: 20 },
  greetingSub:    { fontSize: 14, color: GRAY, lineHeight: 20 },

  budgetWidget: {
    backgroundColor: WHITE,
    borderRadius:    16,
    padding:         14,
    alignItems:      'center',
    minWidth:        96,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 2 },
    shadowOpacity:   0.06,
    shadowRadius:    8,
    elevation:       2,
    borderWidth:     1,
    borderColor:     BORDER,
    position:        'relative',
  },
  budgetAmount: { fontSize: 22, fontWeight: '800', color: NAVY, letterSpacing: -0.5 },
  budgetLabel:  { fontSize: 11, color: GRAY, fontWeight: '500', marginTop: 2 },
  budgetIcon:   { position: 'absolute', top: 10, right: 10 },

  // Stats scroll
  statsScroll:        { flexGrow: 0, marginBottom: 20 },
  statsScrollContent: { paddingHorizontal: 20, gap: 10 },
  statCard: {
    backgroundColor: WHITE,
    borderRadius:    14,
    padding:         14,
    alignItems:      'center',
    minWidth:        86,
    borderWidth:     1,
    borderColor:     BORDER,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.04,
    shadowRadius:    4,
    elevation:       1,
    marginRight:     4,
  },
  statIconWrap: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: MINT,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    8,
  },
  statValue: { fontSize: 14, fontWeight: '800', color: NAVY, textAlign: 'center', marginBottom: 2 },
  statLabel: { fontSize: 10, color: GRAY,  fontWeight: '600', textAlign: 'center', lineHeight: 14 },
  statSub:   { fontSize: 9,  color: GRAY,  textAlign: 'center', marginTop: 2, lineHeight: 12 },

  // Hero card
  heroCard: {
    flexDirection:     'row',
    backgroundColor:   WHITE,
    borderRadius:      22,
    marginHorizontal:  20,
    marginBottom:      20,
    overflow:          'hidden',
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.08,
    shadowRadius:      12,
    elevation:         3,
    borderWidth:       1,
    borderColor:       BORDER,
    minHeight:         240,
  },
  heroLeft: {
    flex:    1,
    padding: 18,
  },
  heroBestMatchBadge: {
    alignSelf:         'flex-start',
    backgroundColor:   GREEN,
    borderRadius:      20,
    paddingHorizontal: 10,
    paddingVertical:   4,
    marginBottom:      10,
  },
  heroBestMatchText: { fontSize: 10, fontWeight: '900', color: WHITE, letterSpacing: 0.8 },

  heroTitle:    { fontSize: 20, fontWeight: '800', color: NAVY, marginBottom: 2, letterSpacing: -0.3 },
  heroMealName: { fontSize: 13, color: GRAY, fontStyle: 'italic', marginBottom: 12 },

  heroBullets:  { gap: 6, marginBottom: 14 },
  heroBulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  heroBulletCheck: {
    width:           18,
    height:          18,
    borderRadius:    9,
    backgroundColor: MINT,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
    marginTop:       1,
  },
  heroBulletText: { flex: 1, fontSize: 12, color: NAVY, lineHeight: 18 },

  heroStats: {
    flexDirection:    'row',
    alignItems:       'stretch',
    backgroundColor:  CREAM,
    borderRadius:     12,
    padding:          10,
    gap:              0,
  },
  heroStatBox:   { flex: 1, alignItems: 'center' },
  heroStatLabel: { fontSize: 9, color: GRAY, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 3 },
  heroStatValue: { fontSize: 14, fontWeight: '800', color: GREEN },
  heroStatDivider: { width: 1, backgroundColor: BORDER, marginHorizontal: 8 },

  heroRight: {
    width:          120,
    position:       'relative',
    justifyContent: 'flex-end',
  },
  heroImageWrap: {
    position:   'absolute',
    top:        0,
    right:      0,
    bottom:     0,
    left:       0,
  },
  heroImage: {
    width:     '100%',
    height:    '100%',
  },
  heroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(247,250,247,0.15)',
  },
  heroCtaBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:            4,
    backgroundColor: WHITE,
    margin:         12,
    borderRadius:   12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 2 },
    shadowOpacity:  0.1,
    shadowRadius:   4,
    elevation:      3,
  },
  heroCtaBtnText: { fontSize: 13, fontWeight: '700', color: NAVY },

  // Setup prompt fallback
  setupPromptCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             14,
    backgroundColor: WHITE,
    borderRadius:    18,
    padding:         18,
    marginHorizontal: 20,
    marginBottom:    20,
    borderWidth:     1,
    borderColor:     BORDER,
  },
  setupPromptText:  { flex: 1 },
  setupPromptTitle: { fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 3 },
  setupPromptSub:   { fontSize: 13, color: GRAY, lineHeight: 18 },

  // Other options section
  otherSection:    { marginBottom: 20 },
  otherHeader: {
    flexDirection:     'row',
    alignItems:        'center',
    justifyContent:    'space-between',
    paddingHorizontal: 20,
    marginBottom:      14,
  },
  otherTitle:  { fontSize: 16, fontWeight: '800', color: NAVY },
  seeAllText:  { fontSize: 14, color: GREEN, fontWeight: '600' },

  miniCardsRow: { paddingHorizontal: 20, gap: 10 },

  miniCard: {
    backgroundColor: WHITE,
    borderRadius:    18,
    padding:         14,
    width:           148,
    borderWidth:     1,
    borderColor:     BORDER,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.04,
    shadowRadius:    4,
    elevation:       1,
    position:        'relative',
  },
  miniIconWrap: {
    width:           40,
    height:          40,
    borderRadius:    12,
    alignItems:      'center',
    justifyContent:  'center',
    marginBottom:    8,
  },
  miniLabel:    { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 3, lineHeight: 17 },
  miniSubtitle: { fontSize: 11, color: GRAY,  lineHeight: 15, marginBottom: 10 },
  miniArrow: {
    position:  'absolute',
    top:       12,
    right:     12,
  },
  miniCost: {
    fontSize:     12,
    fontWeight:   '700',
    color:        NAVY,
    marginBottom: 8,
  },
  miniTime: { fontWeight: '400', color: GRAY },
  miniFitBadge: {
    alignSelf:         'flex-start',
    borderRadius:      8,
    paddingHorizontal: 8,
    paddingVertical:   3,
  },
  miniFitText: { fontSize: 10, fontWeight: '700' },

  // Insight card
  insightCard: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             14,
    backgroundColor: WHITE,
    borderRadius:    18,
    padding:         16,
    marginHorizontal: 20,
    marginBottom:    16,
    borderWidth:     1,
    borderColor:     BORDER,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 1 },
    shadowOpacity:   0.04,
    shadowRadius:    4,
    elevation:       1,
  },
  insightIconWrap: {
    width:           40,
    height:          40,
    borderRadius:    12,
    backgroundColor: GREEN,
    alignItems:      'center',
    justifyContent:  'center',
    flexShrink:      0,
  },
  insightText:  { flex: 1 },
  insightTitle: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 4 },
  insightBody:  { fontSize: 12, color: GRAY,  lineHeight: 17 },

  bottomSpacer: { height: 20 },

  // Weekly deals section
  dealsSection: { paddingHorizontal: 16, marginTop: 8, marginBottom: 8 },
  dealsSectionTitle: { fontSize: 17, fontWeight: '800', color: NAVY, marginBottom: 4 },
  dealsSectionSub:   { fontSize: 13, color: GRAY, marginBottom: 14, lineHeight: 18 },
  dealCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WHITE, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  dealCardLeft: {},
  dealStoreBadge: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
  },
  dealStoreText:  { fontSize: 14, fontWeight: '800', color: GREEN },
  dealCardBody:   { flex: 1 },
  dealTitle:      { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2 },
  dealDesc:       { fontSize: 12, color: GRAY, marginBottom: 6, lineHeight: 17 },
  dealMeta:       { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  dealSavingsBadge: {
    backgroundColor: '#DCFCE7', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  dealSavingsText:  { fontSize: 11, fontWeight: '700', color: GREEN },
  dealLoyaltyBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3,
  },
  dealLoyaltyText:  { fontSize: 11, fontWeight: '600', color: AMBER },
  dealExpires:      { fontSize: 11, color: GRAY },
  dealPrice:        { fontSize: 16, fontWeight: '800', color: GREEN, flexShrink: 0 },
});
