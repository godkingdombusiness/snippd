/**
 * BarcodeScannerScreen
 *
 * Flow:
 *   1. Request camera permission
 *   2. Scan UPC/EAN barcode
 *   3. Call lookup-barcode Edge Function
 *   4. Show product card (name, image, nutrition, allergens)
 *   5. "Add to Cart" → writes to AsyncStorage cart
 *   6. "Not found" → prompt to search USDA manually
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, ScrollView, Image, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { readActiveCart } from '../src/services/cartStorage';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const CORAL  = '#FF7043';
const GRAY   = '#64748B';
const WHITE  = '#FFFFFF';
const BG     = '#F0FBF0';

const ALLERGEN_COLORS = {
  dairy:   { bg: '#FEF3C7', text: '#92400E' },
  gluten:  { bg: '#FEE2E2', text: '#991B1B' },
  nuts:    { bg: '#FFF7ED', text: '#C2410C' },
  soy:     { bg: '#EDE9FE', text: '#5B21B6' },
  default: { bg: '#F1F5F9', text: '#475569' },
};

function allergenColor(allergen) {
  const lower = allergen.toLowerCase();
  if (lower.includes('milk') || lower.includes('dairy')) return ALLERGEN_COLORS.dairy;
  if (lower.includes('gluten') || lower.includes('wheat')) return ALLERGEN_COLORS.gluten;
  if (lower.includes('nut') || lower.includes('peanut')) return ALLERGEN_COLORS.nuts;
  if (lower.includes('soy')) return ALLERGEN_COLORS.soy;
  return ALLERGEN_COLORS.default;
}

function NutritionRow({ label, value, unit }) {
  if (value == null) return null;
  return (
    <View style={s.nutritionRow}>
      <Text style={s.nutritionLabel}>{label}</Text>
      <Text style={s.nutritionValue}>{value}{unit}</Text>
    </View>
  );
}

function ProductCard({ product, onAddToCart, onScanAgain, adding }) {
  const { name, brand, image, image_url, allergens = [], nutrition } = product;
  const hasNutrition = nutrition && Object.values(nutrition).some(v => v != null);

  return (
    <ScrollView style={s.cardScroll} showsVerticalScrollIndicator={false}>
      <View style={s.productCard}>

        {/* Image */}
        {(image || image_url) ? (
          <Image source={{ uri: image || image_url }} style={s.productImage} resizeMode="contain" />
        ) : (
          <View style={[s.productImage, s.productImagePlaceholder]}>
            <Feather name="package" size={40} color={GRAY} />
          </View>
        )}

        {/* Name + brand */}
        <Text style={s.productName}>{name || 'Unknown product'}</Text>
        {brand ? <Text style={s.productBrand}>{brand}</Text> : null}

        {/* Allergens */}
        {allergens.length > 0 && (
          <View style={s.allergensWrap}>
            <Text style={s.allergensHeader}>Contains:</Text>
            <View style={s.allergenChips}>
              {allergens.slice(0, 6).map(a => {
                const c = allergenColor(a);
                return (
                  <View key={a} style={[s.allergenChip, { backgroundColor: c.bg }]}>
                    <Text style={[s.allergenText, { color: c.text }]}>
                      {a.charAt(0).toUpperCase() + a.slice(1)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        )}

        {/* Nutrition panel */}
        {hasNutrition && (
          <View style={s.nutritionPanel}>
            <Text style={s.nutritionTitle}>Nutrition per 100g</Text>
            <NutritionRow label="Calories"   value={nutrition.calories}  unit=" kcal" />
            <NutritionRow label="Protein"    value={nutrition.protein}   unit="g" />
            <NutritionRow label="Carbs"      value={nutrition.carbs}     unit="g" />
            <NutritionRow label="Fat"        value={nutrition.fat}       unit="g" />
            <NutritionRow label="Fiber"      value={nutrition.fiber}     unit="g" />
            <NutritionRow label="Sugar"      value={nutrition.sugar}     unit="g" />
            <NutritionRow label="Sodium"     value={nutrition.sodium}    unit="mg" />
          </View>
        )}

        {!hasNutrition && (
          <View style={s.noNutritionNote}>
            <Feather name="info" size={14} color={GRAY} />
            <Text style={s.noNutritionText}>Nutrition data not available for this product.</Text>
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={[s.addBtn, adding && s.addBtnDisabled]}
          onPress={onAddToCart}
          disabled={adding}
          activeOpacity={0.82}
        >
          {adding
            ? <ActivityIndicator size="small" color={WHITE} />
            : <Text style={s.addBtnTxt}>Add to Cart</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.scanAgainBtn} onPress={onScanAgain} activeOpacity={0.8}>
          <Feather name="camera" size={15} color={GREEN} style={{ marginRight: 6 }} />
          <Text style={s.scanAgainTxt}>Scan another item</Text>
        </TouchableOpacity>

      </View>
    </ScrollView>
  );
}

function NotFoundCard({ barcode, onSearchManual, onScanAgain }) {
  return (
    <View style={s.notFoundCard}>
      <Feather name="search" size={40} color={GRAY} />
      <Text style={s.notFoundTitle}>Item not found</Text>
      <Text style={s.notFoundSub}>
        Barcode {barcode} wasn't found in our database.{'\n'}Search manually to add it.
      </Text>
      <TouchableOpacity style={s.addBtn} onPress={onSearchManual} activeOpacity={0.82}>
        <Text style={s.addBtnTxt}>Search manually</Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.scanAgainBtn} onPress={onScanAgain} activeOpacity={0.8}>
        <Feather name="camera" size={15} color={GREEN} style={{ marginRight: 6 }} />
        <Text style={s.scanAgainTxt}>Try another barcode</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function BarcodeScannerScreen({ navigation }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning,   setScanning]   = useState(true);
  const [loading,    setLoading]    = useState(false);
  const [product,    setProduct]    = useState(null);   // ProductData | null
  const [notFound,   setNotFound]   = useState(false);
  const [lastBarcode, setLastBarcode] = useState('');
  const [adding,     setAdding]     = useState(false);

  const cooldownRef = useRef(false);

  // Reset to scanner after returning from navigation
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      setScanning(true);
      setProduct(null);
      setNotFound(false);
      setLastBarcode('');
      cooldownRef.current = false;
    });
    return unsubscribe;
  }, [navigation]);

  const handleBarcode = useCallback(async ({ data: barcode }) => {
    if (cooldownRef.current || loading) return;
    if (!barcode) return;
    cooldownRef.current = true;

    setScanning(false);
    setLoading(true);
    setLastBarcode(barcode);
    setProduct(null);
    setNotFound(false);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? '';

      const { data: fnData, error: fnErr } = await supabase.functions.invoke('lookup-barcode', {
        body: { barcode },
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (fnErr || !fnData) throw new Error(fnErr?.message ?? 'lookup failed');

      if (fnData.found || fnData.status === 'found') {
        const nextProduct = fnData.product || fnData;
        setProduct(nextProduct);
        recordMemoryEvent({
          event_type: 'product_scanned',
          entity_type: 'product',
          entity_id: nextProduct.barcode || barcode,
          product_id: nextProduct.barcode || barcode,
          barcode,
          nutrition_summary: nextProduct.nutrition || {},
          allergy_flags: Array.isArray(nextProduct.allergens) && nextProduct.allergens.length
            ? { allergens: nextProduct.allergens }
            : {},
          metadata: {
            source: 'BarcodeScannerScreen',
            lookup_source: fnData.source,
            nutrition_pending: Boolean(nextProduct.nutrition_pending),
          },
        });
      } else {
        setNotFound(true);
      }
    } catch (err) {
      console.error('[BarcodeScannerScreen] lookup error:', err);
      Alert.alert('Lookup error', 'Could not look up that barcode. Try again.');
      setScanning(true);
      cooldownRef.current = false;
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const addToCart = useCallback(async () => {
    if (!product || adding) return;
    setAdding(true);

    try {
      const { key, items } = await readActiveCart();
      const cartItem = {
        id:           `scan_${lastBarcode}_${Date.now()}`,
        product_name: product.name,
        name:         product.name,
        retailer:     'Scanned Item',
        source:       'barcode_scan',
        barcode:      lastBarcode,
        image:        product.image || product.image_url,
        sale_cents:   0,
        reg_cents:    0,
        deal_type:    null,
        added_at:     new Date().toISOString(),
      };
      const updated = [...items, cartItem];
      await AsyncStorage.setItem(key, JSON.stringify(updated));

      recordMemoryEvent({
        event_type: 'product_added_to_cart',
        entity_type: 'product',
        entity_id: product.barcode || lastBarcode,
        product_id: product.barcode || lastBarcode,
        barcode: lastBarcode,
        nutrition_summary: product.nutrition || {},
        allergy_flags: Array.isArray(product.allergens) && product.allergens.length
          ? { allergens: product.allergens }
          : {},
        metadata: {
          source: 'BarcodeScannerScreen',
          product_name: product.name,
          brand: product.brand,
        },
      });

      Alert.alert('Added!', `${product.name} added to your cart.`, [
        { text: 'Keep scanning', onPress: () => { setProduct(null); setScanning(true); cooldownRef.current = false; } },
        { text: 'View cart',    onPress: () => navigation.getParent()?.navigate('SnippdTab') },
      ]);
    } catch (err) {
      Alert.alert('Error', 'Could not add to cart. Try again.');
    } finally {
      setAdding(false);
    }
  }, [product, adding, lastBarcode, navigation]);

  const scanAgain = useCallback(() => {
    setProduct(null);
    setNotFound(false);
    setScanning(true);
    cooldownRef.current = false;
  }, []);

  const searchManual = useCallback(() => {
    navigation.getParent()?.navigate('DiscoverTab');
  }, [navigation]);

  // ── Permission not yet determined ─────────────────────────────────────────
  if (!permission) {
    return (
      <SafeAreaView style={s.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </SafeAreaView>
    );
  }

  // ── Permission denied ─────────────────────────────────────────────────────
  if (!permission.granted) {
    return (
      <SafeAreaView style={s.center} edges={['top', 'bottom']}>
        <Feather name="camera-off" size={48} color={GRAY} />
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permSub}>Snippd needs camera access to scan barcodes.</Text>
        <TouchableOpacity style={s.addBtn} onPress={requestPermission} activeOpacity={0.82}>
          <Text style={s.addBtnTxt}>Grant permission</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Scan Item</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Camera / results */}
      {scanning && !loading && (
        <View style={s.cameraWrap}>
          <CameraView
            style={s.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['upc_a', 'upc_e', 'ean13', 'ean8', 'code128', 'code39'] }}
            onBarcodeScanned={handleBarcode}
          />
          <View style={s.cameraOverlay} pointerEvents="none">
            <View style={s.scanFrame} />
          </View>
          <Text style={s.cameraHint}>Point at a product barcode</Text>
        </View>
      )}

      {loading && (
        <View style={s.center}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={s.loadingText}>Looking up barcode…</Text>
        </View>
      )}

      {product && !loading && (
        <ProductCard
          product={product}
          onAddToCart={addToCart}
          onScanAgain={scanAgain}
          adding={adding}
        />
      )}

      {notFound && !loading && (
        <NotFoundCard
          barcode={lastBarcode}
          onSearchManual={searchManual}
          onScanAgain={scanAgain}
        />
      )}

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: '#E2E8F0',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: NAVY },

  // Camera
  cameraWrap: { flex: 1, position: 'relative' },
  camera:     { flex: 1 },
  cameraOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 240,
    height: 180,
    borderWidth: 2.5,
    borderColor: GREEN,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  cameraHint: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    color: WHITE,
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },

  loadingText: { marginTop: 16, color: GRAY, fontSize: 14 },

  // Product card
  cardScroll: { flex: 1 },
  productCard: { padding: 20, gap: 14 },
  productImage: {
    width: '100%', height: 180, borderRadius: 12,
    backgroundColor: WHITE,
  },
  productImagePlaceholder: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  productName:  { fontSize: 18, fontWeight: '800', color: NAVY },
  productBrand: { fontSize: 13, color: GRAY, marginTop: -10 },

  // Allergens
  allergensWrap:   { gap: 6 },
  allergensHeader: { fontSize: 12, fontWeight: '700', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5 },
  allergenChips:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  allergenChip:    { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  allergenText:    { fontSize: 12, fontWeight: '600' },

  // Nutrition
  nutritionPanel: {
    backgroundColor: WHITE,
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nutritionTitle: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 2 },
  nutritionRow:   { flexDirection: 'row', justifyContent: 'space-between' },
  nutritionLabel: { fontSize: 13, color: GRAY },
  nutritionValue: { fontSize: 13, fontWeight: '600', color: NAVY },

  noNutritionNote: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12,
  },
  noNutritionText: { fontSize: 12, color: GRAY, flex: 1 },

  // Buttons
  addBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
  },
  addBtnDisabled: { backgroundColor: '#A7D7B8' },
  addBtnTxt: { color: WHITE, fontWeight: '700', fontSize: 15 },
  scanAgainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 12,
  },
  scanAgainTxt: { color: GREEN, fontSize: 14, fontWeight: '600' },

  // Not found
  notFoundCard: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14,
  },
  notFoundTitle: { fontSize: 20, fontWeight: '800', color: NAVY },
  notFoundSub:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },

  // Permissions
  permTitle: { fontSize: 18, fontWeight: '800', color: NAVY, marginTop: 16, textAlign: 'center' },
  permSub:   { fontSize: 14, color: GRAY, textAlign: 'center', marginBottom: 16, lineHeight: 20 },
});
