import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const RED = '#EF4444';
const AMBER = '#F59E0B';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

// Fallback codes if Supabase table not yet populated
const FALLBACK_CODES = {
  SNIPPD10: { discount: '10% off your next order', type: 'percentage', val: 10 },
  WELCOME5: { discount: '$5 off orders over $30', type: 'fixed', val: 500 },
  SAVE20: { discount: '20% off your first stack', type: 'percentage', val: 20 },
  CLERMONT: { discount: '$3 off for Clermont locals', type: 'fixed', val: 300 },
};

const FEATURED_PROMOS = [
  { code: 'SNIPPD10', desc: '10% off your next order', exp: 'Limited time', tag: 'POPULAR' },
  { code: 'WELCOME5', desc: '$5 off orders over $30', exp: 'New users only', tag: 'NEW USER' },
  { code: 'CLERMONT', desc: '$3 off for Clermont locals', exp: 'Local deal', tag: 'LOCAL' },
];

export default function PromoCodesScreen({ navigation }) {
  const [code, setCode] = useState('');
  const [applied, setApplied] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);

  const fetchAppliedCodes = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .single();

      const savedCodes = data?.preferences?.applied_promo_codes || [];
      setApplied(savedCodes);
    } catch (e) {
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchAppliedCodes(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchAppliedCodes(); };

  const saveCodeToProfile = async (newApplied) => {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', userId)
        .single();

      const existing = data?.preferences || {};
      await supabase
        .from('profiles')
        .update({
          preferences: {
            ...existing,
            applied_promo_codes: newApplied,
          },
        })
        .eq('user_id', userId);
    } catch (e) {
      
    }
  };

  const applyCode = async () => {
    const upper = code.toUpperCase().trim();
    if (!upper) return;

    setError('');
    setApplying(true);

    try {
      // Check if already applied
      if (applied.find(a => a.code === upper)) {
        setError('You have already applied this code.');
        setApplying(false);
        return;
      }

      // First try Supabase promo_codes table
      let promoData = null;
      try {
        const { data } = await supabase
          .from('promo_codes')
          .select('*')
          .eq('code', upper)
          .eq('is_active', true)
          .single();
        promoData = data;
      } catch (e) {
        // Table may not exist yet — fall through to fallback
      }

      // Use fallback if Supabase didn't return anything
      if (!promoData && FALLBACK_CODES[upper]) {
        promoData = {
          code: upper,
          discount: FALLBACK_CODES[upper].discount,
          type: FALLBACK_CODES[upper].type,
          val: FALLBACK_CODES[upper].val,
        };
      }

      if (promoData) {
        const newEntry = {
          code: upper,
          discount: promoData.discount || promoData.description || 'Discount applied',
          type: promoData.type,
          val: promoData.val || promoData.value_cents || 0,
          applied_at: new Date().toISOString(),
        };
        const newApplied = [...applied, newEntry];
        setApplied(newApplied);
        await saveCodeToProfile(newApplied);
        setCode('');
        Alert.alert('Code Applied!', newEntry.discount);
      } else {
        setError('This code is not valid or has expired.');
      }
    } catch (e) {
      setError('Something went wrong. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const removeCode = (codeToRemove) => {
    Alert.alert('Remove Code', `Remove ${codeToRemove}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const newApplied = applied.filter(a => a.code !== codeToRemove);
          setApplied(newApplied);
          await saveCodeToProfile(newApplied);
        },
      },
    ]);
  };

  const useFeatureCode = (featCode) => {
    setCode(featCode);
    setError('');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Promo Codes</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
        keyboardShouldPersistTaps="handled"
      >

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <View style={styles.hero}>
          <View style={styles.heroLeft}>
            <Text style={styles.heroEyebrow}>UNLOCK SAVINGS</Text>
            <Text style={styles.heroTitle}>Promo Codes</Text>
            <Text style={styles.heroSub}>Apply a code to unlock extra savings on your stacks.</Text>
          </View>
          <View style={styles.heroRight}>
            <Text style={styles.heroAmt}>{applied.length}</Text>
            <Text style={styles.heroAmtLabel}>active</Text>
          </View>
        </View>

        {/* ── INPUT ──────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.inputLabel}>Enter a code</Text>
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              placeholder="e.g. SNIPPD10"
              placeholderTextColor="#C4C9D6"
              value={code}
              onChangeText={t => { setCode(t.toUpperCase()); setError(''); }}
              autoCapitalize="characters"
              returnKeyType="done"
              onSubmitEditing={applyCode}
              editable={!applying}
            />
            <TouchableOpacity
              style={[styles.applyBtn, (!code.trim() || applying) && styles.applyBtnDisabled]}
              onPress={applyCode}
              disabled={!code.trim() || applying}
              activeOpacity={0.88}
            >
              {applying ? (
                <ActivityIndicator size="small" color={WHITE} />
              ) : (
                <Text style={styles.applyBtnTxt}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
          {error ? (
            <View style={styles.errorRow}>
              <Text style={styles.errorTxt}>{error}</Text>
            </View>
          ) : null}
        </View>

        {/* ── APPLIED CODES ──────────────────────────────────────────────── */}
        {applied.length > 0 && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Applied Codes</Text>
            <View style={styles.card}>
              {applied.map((a, i) => (
                <View
                  key={a.code}
                  style={[
                    styles.appliedRow,
                    i === applied.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.appliedLeft}>
                    <View style={styles.appliedCodeBadge}>
                      <Text style={styles.appliedCodeTxt}>{a.code}</Text>
                    </View>
                    <View>
                      <Text style={styles.appliedDiscount}>{a.discount}</Text>
                      {a.applied_at && (
                        <Text style={styles.appliedDate}>
                          Applied {new Date(a.applied_at).toLocaleDateString()}
                        </Text>
                      )}
                    </View>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeCode(a.code)}
                  >
                    <Text style={styles.removeBtnTxt}>×</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── FEATURED PROMOS ────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Available Promotions</Text>
          <View style={styles.card}>
            {FEATURED_PROMOS.map((promo, i) => {
              const isApplied = applied.find(a => a.code === promo.code);
              return (
                <View
                  key={promo.code}
                  style={[
                    styles.promoRow,
                    i === FEATURED_PROMOS.length - 1 && { borderBottomWidth: 0 },
                    isApplied && styles.promoRowApplied,
                  ]}
                >
                  <View style={styles.promoLeft}>
                    <View style={styles.promoTagRow}>
                      <Text style={styles.promoCode}>{promo.code}</Text>
                      <View style={styles.promoTag}>
                        <Text style={styles.promoTagTxt}>{promo.tag}</Text>
                      </View>
                    </View>
                    <Text style={styles.promoDesc}>{promo.desc}</Text>
                    <Text style={styles.promoExp}>{promo.exp}</Text>
                  </View>
                  {isApplied ? (
                    <View style={styles.appliedActiveBadge}>
                      <Text style={styles.appliedActiveTxt}>Active</Text>
                    </View>
                  ) : (
                    <TouchableOpacity
                      style={styles.useBtn}
                      onPress={() => useFeatureCode(promo.code)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.useBtnTxt}>Use</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── HOW IT WORKS ───────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>How Codes Work</Text>
          <View style={styles.card}>
            {[
              { num: '1', title: 'Enter your code', desc: 'Type or paste your promo code above' },
              { num: '2', title: 'Code is verified', desc: 'Snippd checks your code against active promotions' },
              { num: '3', title: 'Savings unlocked', desc: 'Your discount is applied automatically to eligible stacks' },
            ].map((step, i, arr) => (
              <View
                key={step.num}
                style={[
                  styles.howRow,
                  i === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.howNum}>
                  <Text style={styles.howNumTxt}>{step.num}</Text>
                </View>
                <View style={styles.howInfo}>
                  <Text style={styles.howTitle}>{step.title}</Text>
                  <Text style={styles.howDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── REFERRAL CTA ───────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.referralCard}
            onPress={() => navigation.navigate('InviteFriends')}
            activeOpacity={0.88}
          >
            <View>
              <Text style={styles.referralTitle}>Have a referral code?</Text>
              <Text style={styles.referralSub}>Invite friends and earn 50 Stash Credits each</Text>
            </View>
            <Text style={styles.referralArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  pad: { paddingHorizontal: 16, marginTop: 20 },

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

  // HERO
  hero: {
    backgroundColor: GREEN,
    marginHorizontal: 16, marginTop: 16,
    borderRadius: 20, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    ...SHADOW,
  },
  heroLeft: { flex: 1 },
  heroEyebrow: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 4 },
  heroTitle: { fontSize: 22, fontWeight: 'bold', color: WHITE, marginBottom: 4 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18 },
  heroRight: { alignItems: 'center', marginLeft: 16 },
  heroAmt: { fontSize: 40, fontWeight: 'bold', color: WHITE, letterSpacing: -1 },
  heroAmtLabel: { fontSize: 11, color: 'rgba(255,255,255,0.7)', marginTop: -4 },

  // INPUT
  inputLabel: { fontSize: 12, fontWeight: 'bold', color: GRAY, marginBottom: 8 },
  inputRow: {
    flexDirection: 'row',
    backgroundColor: WHITE, borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1.5, borderColor: BORDER,
    ...SHADOW,
  },
  input: {
    flex: 1, paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 16, fontWeight: 'bold', color: NAVY,
    letterSpacing: 1.5,
  },
  applyBtn: {
    backgroundColor: GREEN,
    paddingHorizontal: 20, justifyContent: 'center',
    minWidth: 80, alignItems: 'center',
  },
  applyBtnDisabled: { backgroundColor: '#C4C9D6' },
  applyBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },
  errorRow: {
    backgroundColor: '#FEF2F2', borderRadius: 10,
    padding: 10, marginTop: 8,
    borderWidth: 1, borderColor: '#FECACA',
  },
  errorTxt: { fontSize: 13, color: RED, fontWeight: 'normal' },

  // SECTION TITLE
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    ...SHADOW,
  },

  // APPLIED CODES
  appliedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  appliedLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  appliedCodeBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
  },
  appliedCodeTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN, letterSpacing: 1 },
  appliedDiscount: { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  appliedDate: { fontSize: 11, color: GRAY },
  removeBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnTxt: { fontSize: 18, color: GRAY, lineHeight: 22 },

  // FEATURED PROMOS
  promoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  promoRowApplied: { backgroundColor: PALE_GREEN },
  promoLeft: { flex: 1, marginRight: 12 },
  promoTagRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  promoCode: { fontSize: 15, fontWeight: 'bold', color: NAVY, letterSpacing: 0.5 },
  promoTag: {
    backgroundColor: LIGHT_GREEN, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  promoTagTxt: { fontSize: 8, fontWeight: 'bold', color: GREEN, letterSpacing: 0.5 },
  promoDesc: { fontSize: 13, color: GRAY, marginBottom: 3 },
  promoExp: { fontSize: 11, color: AMBER, fontWeight: 'normal' },
  useBtn: {
    backgroundColor: PALE_GREEN, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    borderWidth: 1.5, borderColor: GREEN,
  },
  useBtnTxt: { fontSize: 13, fontWeight: 'bold', color: GREEN },
  appliedActiveBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  appliedActiveTxt: { fontSize: 11, fontWeight: 'bold', color: GREEN },

  // HOW IT WORKS
  howRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  howNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginTop: 2,
  },
  howNumTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },
  howInfo: { flex: 1 },
  howTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  howDesc: { fontSize: 12, color: GRAY, lineHeight: 18 },

  // REFERRAL CTA
  referralCard: {
    backgroundColor: NAVY, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...SHADOW,
  },
  referralTitle: { fontSize: 15, fontWeight: 'bold', color: WHITE, marginBottom: 4 },
  referralSub: { fontSize: 12, color: 'rgba(255,255,255,0.7)' },
  referralArrow: { fontSize: 28, color: 'rgba(255,255,255,0.4)' },
});