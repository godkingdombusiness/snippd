// screens/CookAtHomeTriage.js
import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const SLATE  = '#475569';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

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
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Cook at Home</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.headline}>Let's maximize your meal savings</Text>

        <View style={styles.budgetBanner}>
          <View style={styles.budgetIconWrap}>
            <Feather name="dollar-sign" size={20} color={WHITE} />
          </View>
          <Text style={styles.budgetText}>
            Optimizing your <Text style={styles.greenText}>$8.42</Text> meal against your{' '}
            <Text style={styles.greenText}>${Number(activeProfile.remainingBudget).toFixed(2)}</Text> balance.
          </Text>
        </View>

        <View style={styles.pathCard}>
          <View style={styles.pathTopRow}>
            <View style={styles.iconWrap}>
              <Feather name="camera" size={24} color={GREEN} />
            </View>
            <View style={styles.pathBadge}>
              <Text style={styles.pathBadgeText}>ZERO WASTE</Text>
            </View>
          </View>
          <Text style={styles.pathTitle}>Scan Your Pantry First</Text>
          <Text style={styles.pathBody}>
            Take 10 seconds to scan your kitchen. Snippd will subtract items you already own from this meal's cost and rewrite the recipe around your exact inventory.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handlePantryScan} activeOpacity={0.86}>
            <Text style={styles.primaryButtonText}>Start 10-Sec Pantry Scan</Text>
            <Feather name="arrow-right" size={18} color={WHITE} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        <View style={styles.pathCard}>
          <View style={styles.pathTopRow}>
            <View style={styles.iconWrap}>
              <Feather name="shopping-bag" size={24} color={activeProfile.storeBrandColor || GREEN} />
            </View>
            <View style={styles.pathBadgeSoft}>
              <Text style={styles.pathBadgeSoftText}>NO DELIVERY FEES</Text>
            </View>
          </View>
          <Text style={styles.pathTitle}>{activeProfile.favoriteStore} Curbside Pickup</Text>
          <Text style={styles.pathBody}>
            Skip Instacart's high delivery markups. Generate a shopping list loaded with live digital coupon stacks for easy in-store grab or free curbside pickup.
          </Text>
          <TouchableOpacity style={styles.outlineButton} onPress={handleManifest} activeOpacity={0.86}>
            <Text style={styles.outlineButtonText}>Generate Shopping List & Clip Coupons</Text>
            <Feather name="arrow-right" size={18} color={GREEN} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        </View>

        <View style={styles.guardrailRow}>
          <View style={styles.guardrailIcon}>
            <Feather name="check" size={16} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.guardrailTitle}>We protect your budget.</Text>
            <Text style={styles.guardrailText}>Every choice is optimized for maximum savings.</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  scroll: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 32 },
  headline: { fontSize: 22, fontWeight: '800', color: NAVY, letterSpacing: -0.4, marginBottom: 16 },
  budgetBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 14,
    marginBottom: 18,
    gap: 12,
  },
  budgetIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  budgetText: { flex: 1, fontSize: 14, lineHeight: 22, color: NAVY, fontWeight: '600' },
  greenText: { color: GREEN, fontWeight: '800' },
  pathCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  pathTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pathBadge: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pathBadgeText: { color: NAVY, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  pathBadgeSoft: {
    backgroundColor: '#DCFCE7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pathBadgeSoftText: { color: GREEN, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  pathTitle: { fontSize: 20, lineHeight: 26, color: NAVY, fontWeight: '800', marginBottom: 10, letterSpacing: -0.3 },
  pathBody: { fontSize: 14, lineHeight: 22, color: SLATE, fontWeight: '500', marginBottom: 18 },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 4,
  },
  primaryButtonText: { color: WHITE, fontSize: 15, fontWeight: '800' },
  outlineButton: {
    borderRadius: 14,
    backgroundColor: WHITE,
    borderWidth: 2,
    borderColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    paddingHorizontal: 16,
  },
  outlineButtonText: { color: GREEN, fontSize: 15, fontWeight: '800' },
  guardrailRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  guardrailIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  guardrailTitle: { fontSize: 14, fontWeight: '800', color: NAVY },
  guardrailText: { fontSize: 13, color: SLATE, marginTop: 2 },
});
