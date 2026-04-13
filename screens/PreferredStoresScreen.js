import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const BRAND = {
  primaryGreen: '#0C9E54',
  mintPop:      '#C5FFBC',
  darkSection:  '#04361D',
  pale:         '#F0FDF4',
  white:        '#FFFFFF',
  bgLight:      '#F8FAFC',
  greyText:     '#64748B',
  border:       '#E2E8F0',
  navy:         '#0D1B4B',
};

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const ALL_STORES = [
  {
    key: 'publix',
    name: 'Publix',
    desc: 'Weekly BOGO sales + digital coupons',
    tag: 'BEST FOR STACKS',
    hasApp: true,
    color: '#006B3F',
  },
  {
    key: 'dollar_general',
    name: 'Dollar General',
    desc: 'DG Cash + digital coupons',
    tag: 'BEST VALUE',
    hasApp: true,
    color: '#FFD700',
  },
  {
    key: 'aldi',
    name: 'Aldi',
    desc: 'Everyday low prices, no loyalty card needed',
    tag: null,
    hasApp: false,
    color: '#00549F',
  },
  {
    key: 'target',
    name: 'Target',
    desc: 'Target Circle rewards + weekly deals',
    tag: null,
    hasApp: true,
    color: '#CC0000',
  },
  {
    key: 'walgreens',
    name: 'Walgreens',
    desc: 'myWalgreens cash rewards',
    tag: null,
    hasApp: true,
    color: '#E31837',
  },
  {
    key: 'sprouts',
    name: 'Sprouts',
    desc: 'Weekly specials + organic deals',
    tag: null,
    hasApp: true,
    color: '#5A9E38',
  },
  {
    key: 'cvs',
    name: 'CVS',
    desc: 'ExtraCare rewards + weekly specials',
    tag: null,
    hasApp: true,
    color: '#CC0000',
  },
  {
    key: 'walmart',
    name: 'Walmart',
    desc: 'Rollback deals + Walmart+ savings',
    tag: null,
    hasApp: true,
    color: '#0071CE',
  },
  {
    key: 'costco',
    name: 'Costco',
    desc: 'Bulk savings for members',
    tag: null,
    hasApp: false,
    color: '#005DAA',
  },
  {
    key: 'whole_foods',
    name: 'Whole Foods',
    desc: 'Prime member exclusive deals',
    tag: null,
    hasApp: true,
    color: '#00674B',
  },
  {
    key: 'trader_joes',
    name: "Trader Joe's",
    desc: 'Unique products at low prices',
    tag: null,
    hasApp: false,
    color: '#BB2828',
  },
  {
    key: 'winn_dixie',
    name: 'Winn-Dixie',
    desc: 'Weekly specials + SE Grocers rewards',
    tag: null,
    hasApp: true,
    color: '#003087',
  },
];

export default function PreferredStoresScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);

  const fetchStores = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('preferred_stores')
        .eq('user_id', user.id)
        .single();

      if (data?.preferred_stores?.length > 0) {
        setSelected(data.preferred_stores);
      } else {
        // Default to Publix + Dollar General for Clermont area
        setSelected(['publix', 'dollar_general']);
      }
    } catch (e) {
      
      setSelected(['publix', 'dollar_general']);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchStores(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchStores(); };

  const toggle = (key) => {
    setSelected(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    if (selected.length === 0) {
      Alert.alert('Select at least one store', 'Please choose at least one store to continue.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferred_stores: selected })
        .eq('user_id', userId);

      if (error) throw error;

      Alert.alert(
        'Stores Saved',
        `Your ${selected.length} preferred store${selected.length !== 1 ? 's' : ''} have been updated. Snippd will now build your stacks around these stores.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save stores. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  const selectedStores = ALL_STORES.filter(s => selected.includes(s.key));
  const unselectedStores = ALL_STORES.filter(s => !selected.includes(s.key));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Preferred Stores</Text>
        <View style={styles.headerCountBadge}>
          <Text style={styles.headerCountTxt}>{selected.length}</Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.hero}>
            <View style={styles.heroLeft}>
              <Text style={styles.heroEyebrow}>YOUR SHOPPING NETWORK</Text>
              <Text style={styles.heroTitle}>Where do you{'\n'}like to shop?</Text>
              <Text style={styles.heroSub}>Snippd builds your stacks around these stores only.</Text>
            </View>
            <View style={styles.heroRight}>
              <Text style={styles.heroCount}>{selected.length}</Text>
              <Text style={styles.heroCountLabel}>stores{'\n'}selected</Text>
            </View>
          </View>
        </View>

        {/* ── SELECTED STORES ────────────────────────────────────────────── */}
        {selectedStores.length > 0 && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Your Stores</Text>
            <View style={styles.card}>
              {selectedStores.map((store, index) => (
                <TouchableOpacity
                  key={store.key}
                  style={[
                    styles.storeRow,
                    styles.storeRowOn,
                    index === selectedStores.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => toggle(store.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.storeLeft}>
                    <View style={[styles.storeIcon, { backgroundColor: store.color + '18' }]}>
                      <Text style={[styles.storeIconTxt, { color: store.color }]}>
                        {store.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.storeInfo}>
                      <View style={styles.storeNameRow}>
                        <Text style={[styles.storeName, { color: NAVY }]}>{store.name}</Text>
                        {store.tag && (
                          <View style={styles.storeTag}>
                            <Text style={styles.storeTagTxt}>{store.tag}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.storeDesc}>{store.desc}</Text>
                      {store.hasApp && (
                        <Text style={styles.storeAppTxt}>App available</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.checkboxOn}>
                    <Text style={styles.checkboxTxt}>✓</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── ADD MORE ───────────────────────────────────────────────────── */}
        {unselectedStores.length > 0 && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Add More Stores</Text>
            <View style={styles.card}>
              {unselectedStores.map((store, index) => (
                <TouchableOpacity
                  key={store.key}
                  style={[
                    styles.storeRow,
                    index === unselectedStores.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => toggle(store.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.storeLeft}>
                    <View style={[styles.storeIcon, { backgroundColor: OFF_WHITE }]}>
                      <Text style={[styles.storeIconTxt, { color: GRAY }]}>
                        {store.name.charAt(0)}
                      </Text>
                    </View>
                    <View style={styles.storeInfo}>
                      <View style={styles.storeNameRow}>
                        <Text style={styles.storeName}>{store.name}</Text>
                        {store.tag && (
                          <View style={styles.storeTag}>
                            <Text style={styles.storeTagTxt}>{store.tag}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.storeDesc}>{store.desc}</Text>
                      {store.hasApp && (
                        <Text style={styles.storeAppTxt}>App available</Text>
                      )}
                    </View>
                  </View>
                  <View style={styles.checkbox}>
                    <Text style={styles.checkboxEmptyTxt}>+</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── INFO CARD ──────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.infoCard}>
            <View style={styles.infoDot} />
            <Text style={styles.infoTxt}>
              Snippd currently has verified deals for Publix and Dollar General in the Clermont, FL area. More stores are being added weekly.
            </Text>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── STICKY SAVE BUTTON ─────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            (saving || selected.length === 0) && styles.saveBtnDisabled,
          ]}
          onPress={save}
          disabled={saving || selected.length === 0}
          activeOpacity={0.88}
        >
          {saving ? (
            <ActivityIndicator color={WHITE} size="small" />
          ) : (
            <Text style={styles.saveBtnTxt}>
              Save {selected.length} Store{selected.length !== 1 ? 's' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </View>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  headerCountBadge: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  headerCountTxt: { fontSize: 16, fontWeight: 'bold', color: GREEN },

  // HERO
  hero: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...SHADOW,
  },
  heroLeft: { flex: 1 },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: WHITE, lineHeight: 28, marginBottom: 6 },
  heroSub: { fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  heroRight: { alignItems: 'center', marginLeft: 16 },
  heroCount: { fontSize: 48, fontWeight: 'bold', color: WHITE, letterSpacing: -2 },
  heroCountLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', textAlign: 'center', lineHeight: 16 },

  // SECTION
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    ...SHADOW,
  },

  // STORE ROW
  storeRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  storeRowOn: { backgroundColor: PALE_GREEN },
  storeLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  storeIcon: {
    width: 46, height: 46, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  storeIconTxt: { fontSize: 20, fontWeight: 'bold' },
  storeInfo: { flex: 1 },
  storeNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  storeName: { fontSize: 15, fontWeight: 'bold', color: NAVY },
  storeTag: {
    backgroundColor: LIGHT_GREEN, borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  storeTagTxt: { fontSize: 8, fontWeight: 'bold', color: GREEN, letterSpacing: 0.5 },
  storeDesc: { fontSize: 12, color: GRAY, lineHeight: 17 },
  storeAppTxt: { fontSize: 10, color: GREEN, fontWeight: 'bold', marginTop: 3 },

  // CHECKBOX
  checkbox: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: WHITE,
  },
  checkboxEmptyTxt: { fontSize: 16, color: GRAY, lineHeight: 22 },
  checkboxOn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // INFO CARD
  infoCard: {
    backgroundColor: WHITE, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'flex-start',
    gap: 10, borderWidth: 1, borderColor: BORDER,
  },
  infoDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 5 },
  infoTxt: { flex: 1, fontSize: 12, color: GRAY, lineHeight: 18 },

  // FOOTER
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE,
    paddingHorizontal: 16, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: BORDER,
  },
  saveBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  saveBtnTxt: { color: WHITE, fontSize: 16, fontWeight: 'bold' },
});