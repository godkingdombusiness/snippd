import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, ActivityIndicator,
  RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';
import { resetToScreen } from '../lib/navigationRef';
import { clearEncryptionKeyCache } from '../lib/fieldEncryption';

const GREEN      = '#0C9E54';
const GREEN_DARK = '#0A8040';
const NAVY       = '#111827';
const WHITE      = '#FFFFFF';
const BG         = '#F8FAF9';
const MUTED      = '#6B7280';
const BORDER     = '#E5E7EB';
const RED        = '#EF4444';

const LOYALTY_STORES = [
  { key: 'publix',  name: 'Publix',  color: '#007A3D' },
  { key: 'kroger',  name: 'Kroger',  color: '#CF0024' },
  { key: 'target',  name: 'Target',  color: '#CC0000' },
  { key: 'walmart', name: 'Walmart', color: '#0071CE' },
];

const PERSONA_LABELS = {
  precision_nurturer:   'The Precision Nurturer',
  wellness_optimizer:   'The Wellness Optimizer',
  speed_strategist:     'The Speed Strategist',
  culinary_value_hunter:'The Culinary Value Hunter',
  efficiency_machine:   'The Efficiency Machine',
  conscious_saver:      'The Conscious Saver',
  selective_maximizer:  'The Selective Maximizer',
  balanced_strategist:  'The Balanced Strategist',
};

const ALL_NUTRITION_GOALS = [
  'High Protein', 'Low Carb', 'Gluten-Free', 'Dairy-Free',
  'GLP-1', 'Keto', 'Vegan', 'Low Sodium',
];

function getPersonaLabel(personaType) {
  if (!personaType) return 'The Balanced Strategist';
  const key = personaType.toLowerCase().replace(/ /g, '_');
  return PERSONA_LABELS[key] ?? personaType;
}

export default function ProfileScreen({ navigation }) {
  const [profile,     setProfile]     = useState(null);
  const [authEmail,   setAuthEmail]   = useState('');
  const [loading,     setLoading]     = useState(true);
  const [refreshing,  setRefreshing]  = useState(false);
  const [signingOut,  setSigningOut]  = useState(false);
  const [deleting,    setDeleting]    = useState(false);
  const [wealthData,  setWealthData]  = useState(null);
  const [receipts,    setReceipts]    = useState([]);
  const [couponCounts, setCouponCounts] = useState({});
  const [activeGoals, setActiveGoals] = useState([]);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setAuthEmail(user.email ?? '');

      const { data: profileRes } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (profileRes) {
        setProfile(profileRes);
        const constraints = profileRes.preferences?.health_constraints ?? [];
        setActiveGoals(constraints);
      }

      // Fetch last 3 approved receipts
      const { data: receiptRows } = await supabase
        .from('checkout_math_snapshots')
        .select('id, computed_at, response_payload, request_payload')
        .eq('user_id', user.id)
        .eq('status', 'APPROVED')
        .order('computed_at', { ascending: false })
        .limit(3);

      if (receiptRows) setReceipts(receiptRows);

      // Wealth momentum
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-wealth-momentum`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (resp.ok) setWealthData(await resp.json());
        } catch { /* non-critical */ }

        // Coupon counts per store
        try {
          const { data: clipData } = await supabase
            .from('clip_session_items')
            .select('retailer_key')
            .eq('user_id', user.id)
            .eq('status', 'done');
          if (clipData) {
            const counts = clipData.reduce((acc, row) => {
              const k = (row.retailer_key ?? 'other').toLowerCase();
              acc[k] = (acc[k] ?? 0) + 1;
              return acc;
            }, {});
            setCouponCounts(counts);
          }
        } catch { /* non-critical */ }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      clearEncryptionKeyCache();
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      console.warn('signOut error', e);
    } finally {
      setSigningOut(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you sure?',
              'Your savings history and all data will be gone permanently.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Yes, delete everything',
                  style: 'destructive',
                  onPress: async () => {
                    setDeleting(true);
                    try {
                      clearEncryptionKeyCache();
                      const { data, error } = await supabase.functions.invoke('delete-account');
                      if (error) throw error;
                      if (data?.error) throw new Error(data.error);
                      await supabase.auth.signOut({ scope: 'local' });
                      resetToScreen('Auth');
                    } catch (e) {
                      setDeleting(false);
                      Alert.alert('Error', e?.message ?? 'Could not delete account. Try again.');
                    }
                  },
                },
              ],
            );
          },
        },
      ],
    );
  };

  const toggleGoal = async (goal) => {
    const next = activeGoals.includes(goal)
      ? activeGoals.filter(g => g !== goal)
      : [...activeGoals, goal];
    setActiveGoals(next);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from('profiles')
        .update({ preferences: { ...(profile?.preferences ?? {}), health_constraints: next } })
        .eq('user_id', user.id);
    } catch { /* non-critical */ }
  };

  if (loading) return (
    <View style={s.center}>
      <ActivityIndicator size="large" color={GREEN} />
    </View>
  );

  const displayName  = profile?.full_name || authEmail.split('@')[0] || 'Snippd User';
  const initials     = displayName.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const personaLabel = getPersonaLabel(profile?.preferences?.persona_type);
  const credits      = profile?.credits_balance ?? 0;
  const preferredStores = profile?.preferred_stores ?? [];

  const lifetimeSaved = ((wealthData?.lifetime_wealth_created ?? 0) / 100).toFixed(2);
  const velocity      = ((wealthData?.current_velocity ?? 0) / 100).toFixed(2);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >

        {/* ── PROFILE HERO CARD ─────────────────────── */}
        <LinearGradient colors={[GREEN, GREEN_DARK]} style={s.heroCard}>
          <View style={s.heroRow}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{initials}</Text>
            </View>
            <View style={s.heroInfo}>
              <Text style={s.heroName}>{displayName}</Text>
              <Text style={s.heroPersona}>{personaLabel}</Text>
            </View>
          </View>

          <View style={s.heroStats}>
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>${lifetimeSaved}</Text>
              <Text style={s.heroStatLabel}>Lifetime Saved</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>${velocity}/wk</Text>
              <Text style={s.heroStatLabel}>Velocity</Text>
            </View>
            <View style={s.heroStatDivider} />
            <View style={s.heroStat}>
              <Text style={s.heroStatNum}>{credits}</Text>
              <Text style={s.heroStatLabel}>Credits</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── LOYALTY ACCOUNTS ─────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>LOYALTY ACCOUNTS</Text>
          {LOYALTY_STORES.map((store, i) => {
            const connected = preferredStores
              .map(x => x.toLowerCase())
              .includes(store.key);
            const count = couponCounts[store.key] ?? 0;
            const isLast = i === LOYALTY_STORES.length - 1;
            return (
              <View key={store.key} style={[s.loyaltyRow, isLast && s.noBorder]}>
                <View style={[s.storeCircle, { backgroundColor: store.color }]}>
                  <Text style={s.storeInitial}>{store.name[0]}</Text>
                </View>
                <View style={s.loyaltyInfo}>
                  <Text style={s.loyaltyName}>{store.name}</Text>
                  {connected
                    ? <Text style={s.loyaltyConnected}>{count > 0 ? `${count} coupons clipped` : 'Connected'}</Text>
                    : <Text style={s.loyaltyDisconnected}>Not connected</Text>
                  }
                </View>
                {connected ? (
                  <View style={s.connectedBadge}>
                    <Ionicons name="checkmark-circle" size={14} color={GREEN} />
                    <Text style={s.connectedText}>Connected</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={s.connectBtn}
                    onPress={() => navigation.navigate('PreferredStores')}
                    activeOpacity={0.8}
                  >
                    <Text style={s.connectBtnText}>Connect</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}
        </View>

        {/* ── NUTRITION GOALS ───────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>NUTRITION GOALS</Text>
          <Text style={s.cardHint}>Tap to add or remove goals from your plan.</Text>
          <View style={s.pillRow}>
            {ALL_NUTRITION_GOALS.map(goal => {
              const active = activeGoals.includes(goal);
              return (
                <TouchableOpacity
                  key={goal}
                  style={[s.pill, active && s.pillActive]}
                  onPress={() => toggleGoal(goal)}
                  activeOpacity={0.8}
                >
                  {active && <Ionicons name="checkmark" size={12} color={GREEN} style={{ marginRight: 4 }} />}
                  <Text style={[s.pillText, active && s.pillTextActive]}>{goal}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <TouchableOpacity
          style={s.deepBriefProfileCard}
          onPress={() => {
            tracker.track('deep_brief_cta_clicked', { source: 'profile' });
            navigation.navigate('ConciergeOnboarding', { returnTo: 'Profile' });
          }}
          activeOpacity={0.88}
        >
          <Text style={s.deepBriefProfileTitle}>Personalize your household plan</Text>
          <Text style={s.deepBriefProfileText}>Optional: tell Snippd more about your cooking, shopping habits, and savings goals so your plan better fits your family.</Text>
          <View style={s.deepBriefProfileAction}>
            <Text style={s.deepBriefProfileActionText}>Open Deep Brief</Text>
            <Ionicons name="arrow-forward" size={16} color={GREEN} />
          </View>
        </TouchableOpacity>

        {/* ── RECEIPT HISTORY ───────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>RECEIPT HISTORY</Text>
          {receipts.length === 0 ? (
            <View style={s.emptyRow}>
              <Ionicons name="receipt-outline" size={28} color={MUTED} />
              <Text style={s.emptyText}>No verified trips yet.{'\n'}Upload a receipt to earn credits.</Text>
              <TouchableOpacity
                style={s.emptyBtn}
                onPress={() => navigation.navigate('ReceiptUpload')}
                activeOpacity={0.9}
              >
                <Text style={s.emptyBtnText}>Upload Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            receipts.map((r, i) => {
              const savings = ((r.response_payload?.savings_cents ?? 0) / 100).toFixed(2);
              const paid    = ((r.response_payload?.you_pay_cents ?? 0) / 100).toFixed(2);
              const store   = r.response_payload?.retailer_node
                ?? r.request_payload?.retailer
                ?? 'Store';
              const date    = r.computed_at
                ? new Date(r.computed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                : '—';
              return (
                <View key={r.id} style={[s.receiptRow, i === receipts.length - 1 && s.noBorder]}>
                  <View style={s.receiptLeft}>
                    <Text style={s.receiptStore}>{store}</Text>
                    <Text style={s.receiptDate}>{date}</Text>
                  </View>
                  <View style={s.receiptRight}>
                    <View style={s.savingsBadge}>
                      <Text style={s.savingsBadgeText}>Saved ${savings}</Text>
                    </View>
                    <Text style={s.receiptPaid}>You paid ${paid}</Text>
                  </View>
                </View>
              );
            })
          )}
          {receipts.length > 0 && (
            <TouchableOpacity
              style={s.viewAllBtn}
              onPress={() => navigation.navigate('Wins')}
              activeOpacity={0.8}
            >
              <Text style={s.viewAllText}>View all savings</Text>
              <Ionicons name="arrow-forward" size={14} color={GREEN} />
            </TouchableOpacity>
          )}
        </View>

        {/* ── ACCOUNT SETTINGS ─────────────────────── */}
        <View style={s.card}>
          <Text style={s.cardLabel}>ACCOUNT SETTINGS</Text>
          {[
            { label: 'Edit Profile',        icon: 'person-outline',        screen: 'EditProfile' },
            { label: 'Budget Preferences',  icon: 'wallet-outline',        screen: 'BudgetPreferences' },
            { label: 'Preferred Stores',    icon: 'storefront-outline',    screen: 'PreferredStores' },
            { label: 'Nutrition Profile',   icon: 'nutrition-outline',     screen: 'NutritionProfile' },
            { label: 'Wealth Momentum',     icon: 'trending-up-outline',   screen: 'WealthMomentum' },
            { label: 'Credits Store',       icon: 'gift-outline',          screen: 'CreditsStore' },
          ].map((item, i, arr) => (
            <TouchableOpacity
              key={item.screen}
              style={[s.settingsRow, i === arr.length - 1 && s.noBorder]}
              onPress={() => navigation.navigate(item.screen)}
              activeOpacity={0.8}
            >
              <View style={s.settingsIcon}>
                <Ionicons name={item.icon} size={18} color={GREEN} />
              </View>
              <Text style={s.settingsLabel}>{item.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={MUTED} />
            </TouchableOpacity>
          ))}
        </View>

        {/* ── SIGN OUT ──────────────────────────────── */}
        <View style={s.actionSection}>
          <TouchableOpacity
            style={s.signOutBtn}
            onPress={handleSignOut}
            disabled={signingOut}
            activeOpacity={0.8}
          >
            <Ionicons name="log-out-outline" size={18} color={NAVY} style={{ marginRight: 8 }} />
            <Text style={s.signOutText}>{signingOut ? 'Signing Out...' : 'Sign Out'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[s.deleteBtn, deleting && { opacity: 0.5 }]}
            onPress={handleDeleteAccount}
            disabled={deleting}
            activeOpacity={0.8}
          >
            <Text style={s.deleteBtnText}>{deleting ? 'Deleting...' : 'Delete Account'}</Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  scroll:    { paddingBottom: 60 },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: BG },

  // ── Hero card ──
  heroCard: {
    paddingTop: 28,
    paddingBottom: 24,
    paddingHorizontal: 24,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 24,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.5,
  },
  heroInfo: { flex: 1 },
  heroName: {
    fontSize: 22,
    fontWeight: '800',
    color: WHITE,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroPersona: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.75)',
  },

  heroStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 16,
    paddingVertical: 14,
  },
  heroStat:       { flex: 1, alignItems: 'center' },
  heroStatNum:    { fontSize: 16, fontWeight: '800', color: WHITE, marginBottom: 2 },
  heroStatLabel:  { fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.7)' },
  heroStatDivider:{ width: 1, backgroundColor: 'rgba(255,255,255,0.2)' },

  // ── Shared card ──
  card: {
    backgroundColor: WHITE,
    marginTop: 8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: BORDER,
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: MUTED,
    letterSpacing: 1.2,
    marginBottom: 16,
  },
  cardHint: {
    fontSize: 12,
    color: MUTED,
    fontWeight: '500',
    marginTop: -10,
    marginBottom: 14,
  },
  deepBriefProfileCard: {
    backgroundColor: '#F0FBF0',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#C5FFBC',
    padding: 16,
    marginBottom: 20,
  },
  deepBriefProfileTitle: { fontSize: 14, fontWeight: '900', color: '#0C9E54' },
  deepBriefProfileText: { fontSize: 12, color: '#38533F', marginTop: 6, marginBottom: 12, lineHeight: 18 },
  deepBriefProfileAction: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  deepBriefProfileActionText: { fontSize: 13, fontWeight: '900', color: GREEN },
  noBorder: { borderBottomWidth: 0 },

  // ── Loyalty ──
  loyaltyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  storeCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  storeInitial: { fontSize: 16, fontWeight: '800', color: WHITE },
  loyaltyInfo:  { flex: 1 },
  loyaltyName:  { fontSize: 15, fontWeight: '700', color: NAVY },
  loyaltyConnected:    { fontSize: 12, color: GREEN, fontWeight: '600', marginTop: 2 },
  loyaltyDisconnected: { fontSize: 12, color: MUTED, fontWeight: '500', marginTop: 2 },

  connectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FBF5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectedText: { fontSize: 12, fontWeight: '700', color: GREEN },

  connectBtn: {
    borderWidth: 1.5,
    borderColor: GREEN,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
  },
  connectBtnText: { fontSize: 12, fontWeight: '700', color: GREEN },

  // ── Nutrition pills ──
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingBottom: 12,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F9FAFB',
  },
  pillActive: {
    borderColor: GREEN,
    backgroundColor: '#F0FBF5',
  },
  pillText:       { fontSize: 13, fontWeight: '600', color: NAVY },
  pillTextActive: { color: GREEN },

  // ── Receipt history ──
  receiptRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  receiptLeft:  {},
  receiptStore: { fontSize: 15, fontWeight: '700', color: NAVY },
  receiptDate:  { fontSize: 12, color: MUTED, marginTop: 2, fontWeight: '500' },
  receiptRight: { alignItems: 'flex-end' },
  savingsBadge: {
    backgroundColor: '#F0FBF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 4,
  },
  savingsBadgeText: { fontSize: 13, fontWeight: '700', color: GREEN },
  receiptPaid:      { fontSize: 11, color: MUTED, fontWeight: '500' },

  emptyRow: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    lineHeight: 20,
    fontWeight: '500',
  },
  emptyBtn: {
    marginTop: 8,
    backgroundColor: GREEN,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  emptyBtnText: { color: WHITE, fontWeight: '800', fontSize: 14 },

  viewAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
  },
  viewAllText: { fontSize: 14, fontWeight: '700', color: GREEN },

  // ── Settings ──
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingsIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F0FBF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  settingsLabel: { flex: 1, fontSize: 15, fontWeight: '600', color: NAVY },

  // ── Actions ──
  actionSection: {
    marginTop: 8,
    marginHorizontal: 16,
    gap: 10,
    paddingBottom: 8,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: WHITE,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  signOutText: { fontSize: 15, fontWeight: '700', color: NAVY },

  deleteBtn: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  deleteBtnText: { fontSize: 14, fontWeight: '700', color: RED },
});
