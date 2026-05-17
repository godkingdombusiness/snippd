// screens/RecipeCartManifest.js
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

const BASE_ITEMS = [
  { name: 'Garlic-Herb Chicken', amount: '1.5 lb', price: '$5.92', coupon: '$1.00 clipped' },
  { name: 'Fresh Asparagus', amount: '1 bundle', price: '$1.75', coupon: 'BOGO match' },
  { name: 'Brown Rice', amount: '1 pouch', price: '$0.75', coupon: 'Pantry check eligible' },
];

export default function RecipeCartManifest({ navigation, route }) {
  const { profileData = DEFAULT_PROFILE_DATA } = route?.params ?? {};
  const activeProfile = { ...DEFAULT_PROFILE_DATA, ...profileData };
  const storeName = activeProfile.favoriteStore || 'Publix';
  const barcodeCode = `SNIPPD-350-${storeName.toUpperCase()}`;

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handlePickup() {
    navigation.navigate('StorePickupHandoff', { profileData: activeProfile, preferredStore: storeName });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.72}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>

        <Text style={styles.kicker}>RECIPE CART MANIFEST</Text>
        <Text style={styles.title}>Quick Garlic-Herb Chicken & Asparagus</Text>
        <Text style={styles.subtitle}>Fulfillment: {storeName} Curbside / In-Store</Text>

        <View style={styles.savingsCard}>
          <View style={styles.savingsIcon}>
            <Feather name="tag" size={22} color={WHITE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.savingsTitle}>Coupon stack locked</Text>
            <Text style={styles.savingsText}>
              ${Number(activeProfile.couponSavings).toFixed(2)} in digital savings is attached to this manifest before checkout.
            </Text>
          </View>
        </View>

        <View style={styles.manifestCard}>
          <View style={styles.manifestHeader}>
            <Text style={styles.manifestTitle}>Shopping List</Text>
            <Text style={styles.manifestMeta}>{activeProfile.tonightEatersCount} portions</Text>
          </View>
          {BASE_ITEMS.map((item) => (
            <View key={item.name} style={styles.itemRow}>
              <View style={styles.itemCheck}>
                <Feather name="check" size={13} color={WHITE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.itemDetail}>{item.amount} · {item.coupon}</Text>
              </View>
              <Text style={styles.itemPrice}>{item.price}</Text>
            </View>
          ))}
        </View>

        <View style={styles.barcodeCard}>
          <Text style={styles.barcodeLabel}>Checkout barcode</Text>
          <View style={styles.barcodeBox}>
            <Text style={styles.barcodeText}>{barcodeCode}</Text>
          </View>
          <Text style={styles.barcodeHelp}>Show this at checkout or use it inside your {storeName} pickup flow.</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handlePickup} activeOpacity={0.86}>
          <Text style={styles.primaryButtonText}>Continue to {storeName} Pickup</Text>
          <Feather name="arrow-right" size={20} color={WHITE} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: CREAM },
  scroll: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 36 },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  kicker: { fontSize: 11, fontWeight: '900', color: GREEN, letterSpacing: 0.8, marginBottom: 8 },
  title: { fontSize: 28, lineHeight: 34, fontWeight: '900', color: NAVY, letterSpacing: 0 },
  subtitle: { fontSize: 15, color: SLATE, marginTop: 8, marginBottom: 20 },
  savingsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT_SOFT,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 16,
    marginBottom: 18,
  },
  savingsIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  savingsTitle: { fontSize: 16, fontWeight: '900', color: NAVY },
  savingsText: { fontSize: 13, color: SLATE, lineHeight: 19, marginTop: 2 },
  manifestCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 18,
  },
  manifestHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  manifestTitle: { fontSize: 18, fontWeight: '900', color: NAVY },
  manifestMeta: { fontSize: 12, fontWeight: '800', color: GRAY },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingVertical: 13,
  },
  itemCheck: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  itemName: { fontSize: 15, fontWeight: '800', color: NAVY },
  itemDetail: { fontSize: 12, color: SLATE, marginTop: 2 },
  itemPrice: { fontSize: 14, fontWeight: '900', color: NAVY, marginLeft: 8 },
  barcodeCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 20,
  },
  barcodeLabel: { fontSize: 12, fontWeight: '900', color: GRAY, textTransform: 'uppercase', marginBottom: 10 },
  barcodeBox: {
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 18,
    alignItems: 'center',
  },
  barcodeText: { fontSize: 18, fontWeight: '900', color: NAVY, letterSpacing: 0.6 },
  barcodeHelp: { fontSize: 12, color: SLATE, lineHeight: 18, marginTop: 10 },
  primaryButton: {
    minHeight: 56,
    borderRadius: 14,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  primaryButtonText: { color: WHITE, fontSize: 16, fontWeight: '900' },
});
