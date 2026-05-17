// screens/TodayDecisionScreen.js
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar, ActivityIndicator
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

// ── Design Tokens ─────────────────────────────────────────────────────────────
const GREEN  = '#0C9E54';
const NAVY   = '#0A192F';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const SLATE  = '#475569';
const BORDER = '#E5E7EB';
const MINT   = '#E6FFFA';
const BLACK  = '#000000';

export default function TodayDecisionScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [isDinnerTime, setIsDinnerTime] = useState(false);
  const [profileData, setProfileData] = useState({
    weeklyBudget: 250,
    remainingBudget: 163.00,
    tonightEatersCount: 2,
    daysLeftInWeek: 4,
    mode: 'plan_tonight',
    couponSavings: 3.50,
    promoCode: 'SNIPPD20'
  });

  useEffect(() => {
    checkActiveTimeWindow();
    fetchUserDataAndSync();
  }, []);

  function checkActiveTimeWindow() {
    // Evaluation framework: Is it between 4:00 PM and 8:00 PM?
    const currentHour = new Date().getHours();
    if (currentHour >= 16 && currentHour <= 20) {
      setIsDinnerTime(true);
    }
  }

  async function fetchUserDataAndSync() {
    try {
      const authResult = await supabase.auth.getUser();
      const user = authResult.data && authResult.data.user;

      if (!user) {
        setLoading(false);
        return;
      }

      const profileResult = await supabase
        .from('profiles')
        .select('full_name, weekly_budget, household_size, grocery_status, today_goal')
        .eq('user_id', user.id)
        .single();

      const profile = profileResult.data || {};
      const name = profile.full_name || '';
      setFirstName(name.split(' ')[0] || '');

      const budgetMax = Number(profile.weekly_budget) || 250;

      setProfileData({
        weeklyBudget: budgetMax,
        remainingBudget: budgetMax * 0.65 || 163.00,
        tonightEatersCount: Number(profile.household_size) || 2,
        daysLeftInWeek: 4,
        mode: profile.grocery_status === 'not_yet' ? 'live_stacks' : 'plan_tonight',
        couponSavings: profile.today_goal === 'spend_least' ? 5.20 : 3.50, // Scales based on preference profile
        promoCode: 'SNIPPD20'
      });

    } catch (e) {
      console.log('Context retrieval execution failure, using fallbacks:', e);
    } finally {
      setLoading(false);
    }
  }

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={GREEN} size="large" />
          <Text style={styles.loadingText}>Syncing onboarding parameters...</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── BRANCH A: THE LIVE STACKS FEED (If user has NOT shopped yet) ───────────
  if (profileData.mode === 'live_stacks') {
    return (
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <StatusBar barStyle="dark-content" backgroundColor={CREAM} />
        <View style={styles.navBar}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
            <Feather name="arrow-left" size={22} color={NAVY} />
          </TouchableOpacity>
          <Text style={styles.navTitle}>Your Stacks Are Live</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={{ flex: 1 }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
            <Text style={styles.subTitle}>Optimized store paths generated from your onboarding parameters.</Text>

            <View style={styles.savingsBanner}>
              <Feather name="tag" size={20} color={GREEN} />
              <View style={{ marginLeft: 12 }}>
                <Text style={styles.bannerMainText}>Potential Savings This Week: $42.80</Text>
                <Text style={styles.bannerSubText}>Projected run-rate: $1,950/yr cash retained</Text>
              </View>
            </View>

            {/* Publix Target Deal Stack Card */}
            <View style={styles.storeCard}>
              <View style={styles.storeHeader}>
                <View style={styles.storeBrandRow}>
                  <View style={[styles.logoPlaceholder, { backgroundColor: '#E8F5E9' }]}>
                    <Text style={{ color: GREEN, fontWeight: '800' }}>P</Text>
                  </View>
                  <Text style={styles.storeTitle}>Publix</Text>
                </View>
                <View style={styles.matchesBadge}>
                  <Text style={styles.matchesBadgeText}>12 MATCHES</Text>
                </View>
              </View>

              <View style={styles.preferencesRow}>
                <Text style={styles.preferencesText}>Filtered for: High Protein, ${profileData.weeklyBudget} Budget</Text>
                <TouchableOpacity style={styles.refineLink} activeOpacity={0.7}>
                  <Feather name="sliders" size={12} color={SLATE} style={{ marginRight: 4 }} />
                  <Text style={styles.refineLinkText}>Refine Stack</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.itemRow}>
                <View style={styles.itemDetailsCol}>
                  <Text style={styles.itemTitle}>Organic Grass-Fed Ribeye</Text>
                  <Text style={styles.itemMeta}>1lb · BOGO Promotion</Text>
                </View>
                <View style={styles.itemFinancialCol}>
                  <Text style={styles.savingsValue}>-$14.99</Text>
                  <Text style={styles.savingsLabel}>SAVED</Text>
                </View>
              </View>

              <TouchableOpacity style={styles.storeCta} onPress={() => navigation.navigate('WeeklyDinnerPlan')}>
                <Text style={styles.storeCtaText}>Open Full Publix Route Stack</Text>
                <Feather name="arrow-right" size={16} color={GREEN} style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Time-Activated Floating Evening Quick Action Bar */}
          {isDinnerTime && (
            <TouchableOpacity
              style={styles.floatingDinnerHub}
              activeOpacity={0.9}
              onPress={() => setProfileData(prev => ({ ...prev, mode: 'plan_tonight' }))}
            >
              <Text style={styles.floatingDinnerHubText}>🍽️ Decide Tonight's Dinner in 1 Tap →</Text>
            </TouchableOpacity>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── BRANCH B: THE DINNER TRIAGE HUB (If user HAS shopped previously) ──────
  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>What's the plan for tonight?</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.subTitle}>Hello {firstName || 'there'}. Choose the option that fits your active budget timeline.</Text>

        {/* Dynamic Budget Notification Row Container */}
        <View style={styles.walletCard}>
          <View style={styles.walletLeft}>
            <View style={styles.walletIconWrap}>
              <Feather name="credit-card" size={20} color={GREEN} />
            </View>
            <View style={{ marginLeft: 14, flex: 1 }}>
              <Text style={styles.walletTitle}>You have <Text style={{ color: GREEN }}>${profileData.remainingBudget.toFixed(2)}</Text> remaining</Text>
              <Text style={styles.walletSubtitle}>of your ${profileData.weeklyBudget} weekly budget. Target limit: ${(profileData.remainingBudget / profileData.daysLeftInWeek).toFixed(2)}/day.</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={20} color={GREEN} />
        </View>

        {/* CHOICE CARD 1: Cook at Home (Fulfillment: Publix) */}
        <View style={styles.triageCard}>
          <View style={[styles.sideIndicator, { backgroundColor: GREEN }]}>
            <Feather name="home" size={20} color={WHITE} />
            <Text style={styles.sideIndicatorText}>Cook at{"\n"}Home</Text>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>MAX SAVINGS</Text></View>
          </View>

          <View style={styles.triageCardMain}>
            <View style={styles.cardInfoSplit}>
              <View style={styles.imgPlaceholder} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.mealTitle}>Quick Garlic-Herb Chicken & Asparagus</Text>
                <Text style={styles.mealDesc}>Ingredients ready for pickup at Publix.</Text>
              </View>
            </View>

            {/* HERO FEATURE: High-Contrast Coupon Savings Banner */}
            <View style={styles.heroSavingsBadge}>
              <Text style={styles.heroSavingsBadgeText}>
                🎟️ Coupon Stack Applied · Saved ${profileData.couponSavings.toFixed(2)} Extra
              </Text>
              <Text style={styles.heroSavingsSubText}>
                Auto-clipped: $1.00 off Tyson Chicken + matching private-label BOGOs
              </Text>
            </View>

            <View style={styles.metricsContainer}>
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>$8.42</Text>
                <Text style={styles.metricLabel}>TOTAL COST (WITH SAVINGS)</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>15 MINS</Text>
                <Text style={styles.metricLabel}>ACTIVE TIME</Text>
              </View>
            </View>

            {/* ROUTE CORRECTION: Straight to Cook At Home Pantry/Curbside Triage */}
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: GREEN }]}
              onPress={() => navigation.navigate('CookAtHomeTriage', { profileData })}
            >
              <Text style={styles.actionButtonText}>Order Curbside Pickup</Text>
              <Feather name="arrow-right" size={16} color={WHITE} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>

        {/* CHOICE CARD 2: Store Delivery (Fulfillment: Instacart) */}
        <View style={styles.triageCard}>
          <View style={[styles.sideIndicator, { backgroundColor: '#1565C0' }]}>
            <Feather name="truck" size={20} color={WHITE} />
            <Text style={styles.sideIndicatorText}>Store{"\n"}Delivery</Text>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>CONVENIENT</Text></View>
          </View>

          <View style={styles.triageCardMain}>
            <View style={styles.cardInfoSplit}>
              <View style={styles.imgPlaceholder} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.mealTitle}>Port ingredients directly to your door.</Text>
                <Text style={styles.mealDesc}>Fulfill via Instacart using your balance parameters.</Text>
              </View>
            </View>

            {/* HERO FEATURE: High-Contrast Delivery Savings Banner */}
            <View style={[styles.heroSavingsBadge, { backgroundColor: '#E3F2FD' }]}>
              <Text style={[styles.heroSavingsBadgeText, { color: '#1565C0' }]}>
                🚙 Clipped to Cart · Saved ${profileData.couponSavings.toFixed(2)}
              </Text>
              <Text style={[styles.heroSavingsSubText, { color: '#1E3A8A' }]}>
                Your live digital coupon stack has been ported to offset delivery fees
              </Text>
            </View>

            <View style={styles.metricsContainer}>
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>$8.42<Text style={{ fontSize: 11, color: GRAY }}>+fees</Text></Text>
                <Text style={styles.metricLabel}>TOTAL COST</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>35 MINS</Text>
                <Text style={styles.metricLabel}>TO YOUR DOOR</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.actionButton, { backgroundColor: WHITE, borderWidth: 1, borderColor: '#1565C0' }]} onPress={() => navigation.navigate('UberEatsHandoff', { optionType: 'uber_eats_delivery' })}>
              <Text style={[styles.actionButtonText, { color: '#1565C0' }]}>Send to Instacart Cart</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* CHOICE CARD 3: Takeout / Eat Out (Fulfillment: Uber Eats API) */}
        <View style={styles.triageCard}>
          <View style={[styles.sideIndicator, { backgroundColor: BLACK }]}>
            <Feather name="shopping-bag" size={20} color={WHITE} />
            <Text style={styles.sideIndicatorText}>Eat Out /{"\n"}Takeout</Text>
            <View style={styles.tagPill}><Text style={styles.tagPillText}>SMART CHOICE</Text></View>
          </View>

          <View style={styles.triageCardMain}>
            <View style={styles.cardInfoSplit}>
              <View style={styles.imgPlaceholder} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.mealTitle}>Chipotle High-Protein Bowl Match</Text>
                <Text style={styles.mealDesc}>Mapped directly to your active macro profiles.</Text>
              </View>
            </View>

            {/* HERO FEATURE: High-Contrast Takeout Savings Banner */}
            <View style={[styles.heroSavingsBadge, { backgroundColor: '#F1F5F9' }]}>
              <Text style={[styles.heroSavingsBadgeText, { color: BLACK }]}>
                🏷️ Promo Applied · Code '{profileData.promoCode}' Injecting...
              </Text>
              <Text style={[styles.heroSavingsSubText, { color: SLATE }]}>
                20% in-app discount code applied to lock this option under your budget limit
              </Text>
            </View>

            <View style={styles.metricsContainer}>
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>~$12.50</Text>
                <Text style={styles.metricLabel}>TOTAL COST (WITH PROMO)</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricStack}>
                <Text style={styles.metricValue}>~{(12.50 / profileData.tonightEatersCount).toFixed(2)}</Text>
                <Text style={styles.metricLabel}>PER PERSON</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.actionButton, { backgroundColor: WHITE, borderWidth: 1, borderColor: BLACK }]} onPress={() => navigation.navigate('UberEatsHandoff', { optionType: 'uber_eats_pickup' })}>
              <Text style={[styles.actionButtonText, { color: BLACK }]}>View Clean Takeout Match</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Design Layout Styles ──────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WHITE },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: GRAY, fontWeight: '500' },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 12, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER
  },
  navTitle: { fontSize: 17, fontWeight: '800', color: NAVY },
  scroll: { paddingHorizontal: 16, paddingBottom: 40 },
  subTitle: { fontSize: 13, color: GRAY, marginTop: 10, marginBottom: 16, lineHeight: 18 },

  // Stacks layouts
  savingsBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#E6FFFA', borderRadius: 12, padding: 16, marginBottom: 20 },
  bannerMainText: { fontSize: 15, fontWeight: '800', color: GREEN },
  bannerSubText: { fontSize: 12, color: SLATE, marginTop: 2 },
  storeCard: { backgroundColor: WHITE, borderRadius: 16, borderWidth: 1.5, borderColor: BORDER, padding: 16, marginBottom: 16 },
  storeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  storeBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logoPlaceholder: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  storeTitle: { fontSize: 18, fontWeight: '800', color: NAVY },
  matchesBadge: { backgroundColor: GREEN, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  matchesBadgeText: { fontSize: 10, fontWeight: '700', color: WHITE },
  preferencesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 16 },
  preferencesText: { fontSize: 12, color: GRAY },
  refineLink: { flexDirection: 'row', alignItems: 'center' },
  refineLinkText: { fontSize: 12, color: SLATE, textDecorationLine: 'underline', fontWeight: '600' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: BORDER, paddingBottom: 12, marginBottom: 12 },
  itemDetailsCol: { flex: 1 },
  itemTitle: { fontSize: 15, fontWeight: '700', color: NAVY },
  itemMeta: { fontSize: 12, color: GRAY, marginTop: 2 },
  itemFinancialCol: { alignItems: 'flex-end' },
  savingsValue: { fontSize: 16, fontWeight: '800', color: GREEN },
  savingsLabel: { fontSize: 9, fontWeight: '700', color: GRAY, letterSpacing: 0.5 },
  storeCta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  storeCtaText: { fontSize: 14, fontWeight: '700', color: GREEN },

  // Floating Hub
  floatingDinnerHub: { position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 6 },
  floatingDinnerHubText: { color: WHITE, fontSize: 15, fontWeight: '800' },

  // Triage layouts
  walletCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#A7F3D0', backgroundColor: WHITE, borderRadius: 14, padding: 14, marginBottom: 20 },
  walletLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  walletIconWrap: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' },
  walletTitle: { fontSize: 15, fontWeight: '800', color: NAVY },
  walletSubtitle: { fontSize: 12, color: GRAY, marginTop: 3, lineHeight: 16 },
  triageCard: { flexDirection: 'row', backgroundColor: WHITE, borderRadius: 16, borderWidth: 1, borderColor: BORDER, overflow: 'hidden', marginBottom: 16 },
  sideIndicator: { width: 88, alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8, minHeight: 260 },
  sideIndicatorText: { fontSize: 12, fontWeight: '800', color: WHITE, textAlign: 'center', lineHeight: 16 },
  tagPill: { backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  tagPillText: { fontSize: 8, fontWeight: '800', color: WHITE, letterSpacing: 0.3 },
  triageCardMain: { flex: 1, padding: 16, justifyContent: 'space-between' },
  cardInfoSplit: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  imgPlaceholder: { width: 56, height: 56, borderRadius: 12, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: BORDER, flexShrink: 0 },
  mealTitle: { fontSize: 15, fontWeight: '700', color: NAVY, lineHeight: 20 },
  mealDesc: { fontSize: 12, color: GRAY, marginTop: 2 },
  overlayTag: { alignSelf: 'flex-start', backgroundColor: '#F1F5F9', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3, marginTop: 6 },
  overlayTagText: { fontSize: 10, fontWeight: '700', color: SLATE },
  metricsContainer: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 14, gap: 16 },
  metricStack: { flex: 1 },
  metricValue: { fontSize: 18, fontWeight: '800', color: NAVY },
  metricLabel: { fontSize: 9, fontWeight: '700', color: GRAY, letterSpacing: 0.5, marginTop: 2 },
  metricDivider: { width: 1, height: 24, backgroundColor: BORDER },
  heroSavingsBadge: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#DCFCE7'
  },
  heroSavingsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: GREEN,
    textTransform: 'uppercase',
    letterSpacing: 0.3
  },
  heroSavingsSubText: {
    fontSize: 11,
    color: SLATE,
    marginTop: 2,
    lineHeight: 15,
    fontWeight: '500'
  },
  nestedCouponCard: { backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginBottom: 16, gap: 4 },
  couponHeader: { fontSize: 11, fontWeight: '700', color: GREEN },
  couponLine: { fontSize: 11, color: SLATE },
  actionButton: { borderRadius: 12, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  actionButtonText: { fontSize: 14, fontWeight: '800', color: WHITE }
});
