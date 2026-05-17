// screens/CookAtHomeTriage.js
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

// ── Global Design Token Matrix ─────────────────────────────────────────────
const GREEN     = '#0C9E54';
const NAVY      = '#0A192F';
const CREAM     = '#FAF8F1';
const WHITE     = '#FFFFFF';
const GRAY      = '#6B7280';
const SLATE     = '#475569';
const BORDER    = '#E5E7EB';
const MINT_SOFT = '#F0FDF4';

const DEFAULT_PROFILE_DATA = {
  remainingBudget: 163.00,
  couponSavings: 3.50,
  favoriteStore: 'Publix',
  storeBrandColor: GREEN,
  tonightEatersCount: 2,
};

export default function CookAtHomeTriage({ navigation, route }) {
  const { profileData = DEFAULT_PROFILE_DATA } = route?.params ?? {};
  const activeProfile = { ...DEFAULT_PROFILE_DATA, ...profileData };

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handlePantryScan() {
    navigation.navigate('PantryScan', { profileData: activeProfile });
  }

  function handleManifest() {
    navigation.navigate('RecipeCartManifest', { profileData: activeProfile });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.72}>
            <Feather name="chevron-left" size={34} color={GREEN} />
          </TouchableOpacity>
          <View style={styles.headerTextWrap}>
            <Text style={styles.title}>Cook at Home</Text>
            <Text style={styles.subtitle}>Let's maximize your meal savings</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.budgetBanner}>
          <View style={styles.budgetIconWrap}>
            <Feather name="dollar-sign" size={34} color={WHITE} />
          </View>
          <Text style={styles.budgetText}>
            Optimizing your <Text style={styles.greenText}>$8.42</Text> meal choice against your remaining{' '}
            <Text style={styles.greenText}>${Number(activeProfile.remainingBudget).toFixed(2)}</Text> balance.
          </Text>
        </View>

        <View style={styles.pathCard}>
          <View style={styles.pathTopRow}>
            <View style={styles.largeIconWrap}>
              <Feather name="camera" size={46} color={GREEN} />
            </View>
            <View style={styles.pathBadge}>
              <Text style={styles.pathBadgeText}>ZERO WASTE</Text>
            </View>
          </View>
          <Text style={styles.pathTitle}>Scan Your Pantry First</Text>
          <Text style={styles.pathBody}>
            Take 10 seconds to scan your kitchen. Snippd will instantly subtract items you already own from this meal's cost and rewrite the recipe around your exact inventory.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handlePantryScan} activeOpacity={0.86}>
            <Text style={styles.primaryButtonText}>Start 10-Sec Pantry Scan</Text>
            <Feather name="arrow-right" size={24} color={WHITE} style={{ marginLeft: 10 }} />
          </TouchableOpacity>
        </View>

        <View style={styles.pathCard}>
          <View style={styles.pathTopRow}>
            <View style={styles.largeIconWrap}>
              <Feather name="shopping-bag" size={46} color={activeProfile.storeBrandColor || GREEN} />
            </View>
            <View style={styles.pathBadgeSoft}>
              <Text style={styles.pathBadgeSoftText}>NO DELIVERY FEES</Text>
            </View>
          </View>
          <Text style={styles.pathTitle}>{activeProfile.favoriteStore} Curbside Pickup</Text>
          <Text style={styles.pathBody}>
            Skip Instacart's high delivery markups. Generate a clean recipe manifestation sheet and itemized shopping list loaded with our live digital coupon stacks for easy in-store grab or free curbside pickup scheduling.
          </Text>
          <TouchableOpacity style={styles.outlineButton} onPress={handleManifest} activeOpacity={0.86}>
            <Text style={styles.outlineButtonText}>Generate Shopping List & Clip Coupons</Text>
            <Feather name="arrow-right" size={23} color={GREEN} style={{ marginLeft: 10 }} />
          </TouchableOpacity>
        </View>

        <View style={styles.guardrailRow}>
          <View style={styles.guardrailIcon}>
            <Feather name="check" size={24} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guardrailTitle}>We protect your budget.</Text>
            <Text style={styles.guardrailText}>Every choice is optimized for maximum savings.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: WHITE },
  scroll: { paddingHorizontal: 20, paddingBottom: 32 },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 8, marginBottom: 24 },
  backBtn: { width: 42, height: 42, justifyContent: 'center' },
  headerTextWrap: { flex: 1, alignItems: 'center' },
  headerSpacer: { width: 42 },
  title: { fontSize: 26, fontWeight: '900', color: NAVY, letterSpacing: 0 },
  subtitle: { fontSize: 15, color: SLATE, marginTop: 4, fontWeight: '500' },
  budgetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT_SOFT,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 18,
    marginBottom: 22,
  },
  budgetIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 18,
  },
  budgetText: { flex: 1, fontSize: 20, lineHeight: 31, color: NAVY, fontWeight: '600' },
  greenText: { color: GREEN, fontWeight: '900' },
  pathCard: {
    backgroundColor: WHITE,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 22,
    marginBottom: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 4,
  },
  pathTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 },
  largeIconWrap: { width: 74, height: 74, alignItems: 'center', justifyContent: 'center' },
  pathBadge: { backgroundColor: '#F3F4F6', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12 },
  pathBadgeText: { color: NAVY, fontSize: 13, fontWeight: '900' },
  pathBadgeSoft: { backgroundColor: '#DCFCE7', borderRadius: 18, paddingHorizontal: 18, paddingVertical: 12 },
  pathBadgeSoftText: { color: GREEN, fontSize: 13, fontWeight: '900' },
  pathTitle: { fontSize: 25, lineHeight: 31, color: NAVY, fontWeight: '900', marginBottom: 16 },
  pathBody: { fontSize: 17, lineHeight: 27, color: SLATE, fontWeight: '500', marginBottom: 28 },
  primaryButton: {
    minHeight: 64,
    borderRadius: 32,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primaryButtonText: { color: WHITE, fontSize: 19, fontWeight: '900', textAlign: 'center' },
  outlineButton: {
    minHeight: 64,
    borderRadius: 32,
    backgroundColor: WHITE,
    borderWidth: 2,
    borderColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  outlineButtonText: { color: GREEN, fontSize: 17, fontWeight: '900', textAlign: 'center' },
  guardrailRow: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 10 },
  guardrailIcon: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guardrailTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  guardrailText: { fontSize: 14, color: SLATE, marginTop: 2 },
});
