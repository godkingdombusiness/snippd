/**
 * PersonalizationSummaryScreen
 *
 * Shown after onboarding + personality completion, before the paywall.
 * Displays what Snippd learned about the user and surfaces the
 * "Begin My First Shop" CTA that triggers the paywall gate.
 *
 * Flow:
 *   Onboarding → PersonalizationSummary → (paywallGate) → FirstShopPaywall
 *                                                       → TodaySetupGate (if active)
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { checkFirstShopAccess } from '../src/services/paywallGateService';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

var SUMMARY_ICONS = {
  budget:   'dollar-sign',
  household:'users',
  rhythm:   'repeat',
  stores:   'map-pin',
  goals:    'target',
  pantry:   'home',
  eatout:   'coffee',
  stash:    'zap',
};

// ── Module-scope components ────────────────────────────────────────────────────

function SummaryCard({ icon, label, value }) {
  return (
    <View style={styles.summaryCard}>
      <View style={styles.summaryIconWrap}>
        <Feather name={icon} size={18} color={GREEN} />
      </View>
      <View style={styles.summaryText}>
        <Text style={styles.summaryLabel}>{label}</Text>
        <Text style={styles.summaryValue}>{value}</Text>
      </View>
    </View>
  );
}

function LoadingState() {
  return (
    <View style={styles.loadingWrap}>
      <ActivityIndicator color={GREEN} />
      <Text style={styles.loadingText}>Building your summary...</Text>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────
export default function PersonalizationSummaryScreen({ navigation }) {
  var [profile, setProfile] = useState(null);
  var [loading, setLoading] = useState(true);
  var [gating,  setGating]  = useState(false);
  var [userId,  setUserId]  = useState(null);

  useEffect(function () {
    loadProfile();
  }, []);

  async function loadProfile() {
    try {
      var { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      var { data } = await supabase
        .from('profiles')
        .select('weekly_budget, household_size, food_goals, preferred_stores, avoids, cooking_days, eat_out_days, brand_swap, stash_style, pantry_preference')
        .eq('user_id', user.id)
        .single();

      setProfile(data || {});
      tracker.track('personalization_summary_viewed', { user_id: user.id });
    } catch (e) {
      setProfile({});
    } finally {
      setLoading(false);
    }
  }

  async function handleBeginFirstShop() {
    if (gating) return;
    setGating(true);
    try {
      var result = await checkFirstShopAccess(userId, 'TodaySetupGate', {});
      if (result.allowed) {
        navigation.replace('TodaySetupGate');
      } else {
        navigation.navigate(result.nextRoute, result.nextParams);
      }
    } catch {
      navigation.replace('TodaySetupGate');
    } finally {
      setGating(false);
    }
  }

  function handleReviewAnswers() {
    navigation.navigate('Onboarding');
  }

  function buildSummaryItems(p) {
    var items = [];

    if (p.weekly_budget) {
      items.push({
        icon: SUMMARY_ICONS.budget,
        label: 'Weekly food budget',
        value: '$' + Math.round(p.weekly_budget) + ' per week',
      });
    }

    if (p.household_size) {
      items.push({
        icon: SUMMARY_ICONS.household,
        label: 'Household size',
        value: p.household_size + (p.household_size === 1 ? ' person' : ' people'),
      });
    }

    if (p.cooking_days != null) {
      var days = p.cooking_days;
      items.push({
        icon: SUMMARY_ICONS.rhythm,
        label: 'Cooking nights',
        value: days === 0 ? 'Rarely cook at home'
             : days === 7 ? 'Cook every night'
             : days + ' nights per week',
      });
    }

    if (p.preferred_stores && p.preferred_stores.length > 0) {
      items.push({
        icon: SUMMARY_ICONS.stores,
        label: 'Your stores',
        value: p.preferred_stores.slice(0, 3).join(', ') + (p.preferred_stores.length > 3 ? ' + more' : ''),
      });
    }

    if (p.food_goals && p.food_goals.length > 0) {
      items.push({
        icon: SUMMARY_ICONS.goals,
        label: 'Food goals',
        value: p.food_goals.slice(0, 3).join(', '),
      });
    }

    if (p.pantry_preference) {
      var pantryLabels = {
        use_first:       'Use pantry items first',
        shop_or_order:   'Shop or order as needed',
        not_sure:        'Help me decide',
      };
      items.push({
        icon: SUMMARY_ICONS.pantry,
        label: 'Pantry style',
        value: pantryLabels[p.pantry_preference] || p.pantry_preference,
      });
    }

    if (p.eat_out_days != null) {
      items.push({
        icon: SUMMARY_ICONS.eatout,
        label: 'Eating out',
        value: p.eat_out_days === 0 ? 'Rarely eat out'
             : p.eat_out_days + ' meal' + (p.eat_out_days !== 1 ? 's' : '') + ' out per week',
      });
    }

    if (p.stash_style) {
      var stashLabels = {
        smart:      'Smart — Stash clips top deals automatically',
        manual:     'Manual — I review and choose deals',
        aggressive: 'Maximum savings — clip everything',
      };
      items.push({
        icon: SUMMARY_ICONS.stash,
        label: 'Stash mode',
        value: stashLabels[p.stash_style] || p.stash_style,
      });
    }

    // Always show at least the placeholder cards
    if (items.length === 0) {
      items = [
        { icon: 'check-circle', label: 'Profile', value: 'Your preferences are saved' },
        { icon: 'zap',          label: 'Stash',   value: 'Ready to start clipping deals' },
      ];
    }

    return items;
  }

  var items = profile ? buildSummaryItems(profile) : [];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Badge */}
        <View style={styles.badge}>
          <Feather name="check" size={28} color={GREEN} />
        </View>

        <Text style={styles.headline}>Your plan is personalized.</Text>
        <Text style={styles.sub}>
          Snippd used your answers to understand how your household shops, cooks, eats out, and protects the weekly food budget.
        </Text>

        {/* Summary cards */}
        {loading ? <LoadingState /> : (
          <View style={styles.cardList}>
            {items.map(function (item, idx) {
              return (
                <SummaryCard
                  key={idx}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                />
              );
            })}
          </View>
        )}

        {/* Stash note */}
        <View style={styles.stashNote}>
          <View style={styles.stashAvatar}>
            <Text style={styles.stashAvatarText}>S</Text>
          </View>
          <Text style={styles.stashText}>
            Your plan gets smarter every week. The more you use it, the better it fits your life.
          </Text>
        </View>

        {/* Primary CTA */}
        <TouchableOpacity
          style={[styles.primaryBtn, gating && styles.primaryBtnDisabled]}
          onPress={handleBeginFirstShop}
          disabled={gating}
          activeOpacity={0.88}
        >
          {gating
            ? <ActivityIndicator color={WHITE} />
            : <Text style={styles.primaryBtnTxt}>Begin My First Shop</Text>
          }
        </TouchableOpacity>

        {/* Secondary */}
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={handleReviewAnswers}
          activeOpacity={0.75}
        >
          <Text style={styles.secondaryBtnTxt}>Review My Answers</Text>
        </TouchableOpacity>

        {/* Disclaimer */}
        <Text style={styles.disclaimer}>
          Prices, availability, savings, and nutrition estimates may vary by store, location, and time.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 48 },

  badge: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center', marginBottom: 20,
  },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 30, color: NAVY, letterSpacing: -0.8,
    textAlign: 'center', marginBottom: 12,
  },
  sub: {
    fontSize: 15, color: GRAY, lineHeight: 22,
    textAlign: 'center', marginBottom: 28, paddingHorizontal: 8,
  },

  loadingWrap: { alignItems: 'center', paddingVertical: 32, gap: 12 },
  loadingText: { fontSize: 14, color: GRAY },

  cardList: { gap: 10, marginBottom: 24 },
  summaryCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 16,
  },
  summaryIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: MINT, alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  summaryText:  { flex: 1 },
  summaryLabel: { fontSize: 11, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  summaryValue: { fontSize: 15, fontWeight: '600', color: NAVY, lineHeight: 20 },

  stashNote: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    backgroundColor: WHITE, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 28,
  },
  stashAvatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashAvatarText: { fontSize: 16, fontWeight: '800', color: WHITE },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 20 },

  primaryBtn: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28, shadowRadius: 10, elevation: 4,
  },
  primaryBtnDisabled: { opacity: 0.65 },
  primaryBtnTxt: { fontSize: 16, fontWeight: '700', color: WHITE, letterSpacing: 0.2 },

  secondaryBtn: {
    alignItems: 'center', paddingVertical: 14, marginBottom: 24,
  },
  secondaryBtnTxt: { fontSize: 14, color: NAVY, fontWeight: '500' },

  disclaimer: {
    fontSize: 11, color: GRAY, lineHeight: 16,
    textAlign: 'center', paddingHorizontal: 8,
  },
});
