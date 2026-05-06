/**
 * CreditsStoreScreen — Stash Credits redemption store.
 *
 * Users spend accumulated credits on:
 *   Streak Shield (50)  · Chef Stash Recipe (25) · Multi-Store Plan (75)
 *   Trial Extension (100) · Pro Week Pass (300)
 *
 * ALL spending goes through the redeem_store_item() PostgreSQL RPC.
 * That function uses SELECT FOR UPDATE to acquire a row-level lock, making
 * 100-concurrent-request ToCTOU attacks impossible. No direct profile.update()
 * for credits — ever.
 */

import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../lib/supabase';

// ── Sovereign palette ─────────────────────────────────────────────────────────
const BG      = '#050805';
const CARD    = '#101410';
const GREEN   = '#0C9E54';
const GLOW    = 'rgba(12,158,84,0.12)';
const BORDER  = 'rgba(255,255,255,0.07)';
const WHITE   = '#FFFFFF';
const MUTED   = '#A0A0A0';
const DIM     = '#525252';
const AMBER   = '#F59E0B';
const SKY     = '#38BDF8';
const PURPLE  = '#A78BFA';

// ── Store catalogue ───────────────────────────────────────────────────────────
const STORE_ITEMS = [
  {
    key:         'STREAK_SHIELD',
    icon:        'shield',
    name:        'Streak Shield',
    description: 'Automatically absorbs one missed week so your streak stays intact. Stack up to 5.',
    cost:        50,
    color:       GREEN,
    maxHeld:     5,
  },
  {
    key:         'CHEF_STASH_RECIPE',
    icon:        'book-open',
    name:        'Chef Stash Recipe',
    description: 'Generate one AI recipe from your active stack ingredients. Credit added to your balance.',
    cost:        25,
    color:       AMBER,
    maxHeld:     null,
  },
  {
    key:         'MULTI_STORE_PLAN',
    icon:        'map-pin',
    name:        'Multi-Store Plan',
    description: 'Build a plan spanning up to 3 stores at once for one full week.',
    cost:        75,
    color:       SKY,
    maxHeld:     null,
  },
  {
    key:         'TRIAL_EXTENSION',
    icon:        'clock',
    name:        'Trial Extension',
    description: 'Adds 3 days to your active free trial. Limit: 2 extensions per account.',
    cost:        100,
    color:       PURPLE,
    maxHeld:     2, // max extensions total, not held
  },
  {
    key:         'PRO_WEEK_PASS',
    icon:        'star',
    name:        'Pro Week Pass',
    description: 'Unlock all Pro features for 7 days. Stackable — each redemption adds another 7 days.',
    cost:        300,
    color:       AMBER,
    maxHeld:     null,
  },
];

// ── Success copy ──────────────────────────────────────────────────────────────
function successMessage(key) {
  switch (key) {
    case 'STREAK_SHIELD':      return 'Shield active. It will protect your next missed week automatically.';
    case 'CHEF_STASH_RECIPE':  return 'Recipe credit added. Open Chef Stash to use it.';
    case 'MULTI_STORE_PLAN':   return 'Multi-store plan credit added. Use it on your next weekly plan.';
    case 'TRIAL_EXTENSION':    return 'Your free trial has been extended by 3 days.';
    case 'PRO_WEEK_PASS':      return '7 days of Pro access added to your account.';
    default:                   return 'Redeemed successfully.';
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function CreditsStoreScreen({ navigation }) {
  const [balance,  setBalance]  = useState(null);
  const [shields,  setShields]  = useState(0);
  const [prefs,    setPrefs]    = useState({});
  const [loading,  setLoading]  = useState(true);
  const [redeeming, setRedeeming] = useState(null); // key of item mid-redemption

  // ── Load profile data ─────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('profiles')
        .select('credits_balance, streak_shield_count, preferences')
        .eq('user_id', user.id)
        .single();
      setBalance(data?.credits_balance ?? 0);
      setShields(data?.streak_shield_count ?? 0);
      setPrefs(data?.preferences ?? {});
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { setLoading(true); load(); }, [load]));

  // ── Redemption logic ──────────────────────────────────────────────────────
  const redeem = useCallback(async (item) => {
    Alert.alert(
      `Redeem ${item.name}?`,
      `This will spend ${item.cost} credits from your balance of ${balance}.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: `Spend ${item.cost}`,
          style: 'default',
          onPress: async () => {
            setRedeeming(item.key);
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error('Not signed in');

              // ── Single atomic RPC — SELECT FOR UPDATE row lock inside the fn.
              // Serializes concurrent requests. ToCTOU impossible.
              const { data: result, error: rpcErr } = await supabase.rpc(
                'redeem_store_item',
                { p_user_id: user.id, p_item_key: item.key }
              );

              if (rpcErr) throw rpcErr;

              if (!result?.ok) {
                const msg =
                  result?.error === 'insufficient_credits'
                    ? `You need ${item.cost} credits but only have ${result?.balance ?? 0}.`
                    : result?.error === 'max_shields_held'
                    ? `You can hold at most ${item.maxHeld} Streak Shields at once.`
                    : result?.error === 'trial_extension_limit_reached'
                    ? 'You have already used both trial extensions.'
                    : result?.error ?? 'Redemption failed — try again.';
                Alert.alert('Cannot redeem', msg);
                return;
              }

              await load();
              Alert.alert('Redeemed!', successMessage(item.key));
            } catch (e) {
              Alert.alert('Error', e?.message ?? 'Could not complete redemption. Try again.');
            } finally {
              setRedeeming(null);
            }
          },
        },
      ]
    );
  }, [balance, load]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <StatusBar barStyle="light-content" backgroundColor={BG} />
        <View style={s.center}>
          <ActivityIndicator color={GREEN} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={BG} />

      {/* ── Header ── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={WHITE} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>STASH CREDITS</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Balance hero ── */}
      <View style={s.balanceHero}>
        <Text style={s.balanceEyebrow}>YOUR BALANCE</Text>
        <Text style={s.balanceNum}>{(balance ?? 0).toLocaleString()}</Text>
        <Text style={s.balanceSub}>credits</Text>
        {shields > 0 && (
          <View style={s.shieldPill}>
            <Feather name="shield" size={13} color={GREEN} />
            <Text style={s.shieldPillTxt}>
              {shields} streak shield{shields !== 1 ? 's' : ''} active
            </Text>
          </View>
        )}
      </View>

      {/* ── Earn hint ── */}
      <View style={s.earnRow}>
        <Feather name="trending-up" size={13} color={DIM} />
        <Text style={s.earnTxt}>
          Earn credits: verify receipts (+10 each) · complete profile (+50 once) · maintain your streak (+25 / +100 bonus)
        </Text>
      </View>

      {/* ── Store items ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.list}
        showsVerticalScrollIndicator={false}
      >
        {STORE_ITEMS.map(item => {
          const canAfford  = balance >= item.cost;
          const isBusy     = redeeming === item.key;
          const atCapacity = item.key === 'STREAK_SHIELD' && shields >= (item.maxHeld ?? 99);
          const maxedOut   = item.key === 'TRIAL_EXTENSION' &&
            (prefs.trial_extensions_used ?? 0) >= (item.maxHeld ?? 99);
          const disabled = !canAfford || atCapacity || maxedOut;

          return (
            <View
              key={item.key}
              style={[s.card, disabled && s.cardDisabled]}
            >
              {/* Icon */}
              <View style={[
                s.iconWrap,
                { backgroundColor: disabled ? 'rgba(255,255,255,0.04)' : `${item.color}18` },
              ]}>
                <Feather
                  name={item.icon}
                  size={22}
                  color={disabled ? DIM : item.color}
                />
              </View>

              {/* Text */}
              <View style={s.cardBody}>
                <Text style={[s.cardName, disabled && { color: MUTED }]}>
                  {item.name}
                </Text>
                <Text style={s.cardDesc}>{item.description}</Text>
                {item.key === 'STREAK_SHIELD' && shields > 0 && (
                  <Text style={s.heldHint}>
                    Holding {shields} / {item.maxHeld}
                  </Text>
                )}
                {(atCapacity || maxedOut) && (
                  <Text style={[s.heldHint, { color: MUTED }]}>
                    {atCapacity ? `Maximum ${item.maxHeld} held` : 'Limit reached'}
                  </Text>
                )}
              </View>

              {/* Cost + CTA */}
              <View style={s.cardRight}>
                <Text style={[s.costNum, { color: disabled ? DIM : item.color }]}>
                  {item.cost}
                </Text>
                <Text style={s.costLabel}>cr</Text>
                <TouchableOpacity
                  style={[
                    s.redeemBtn,
                    disabled
                      ? s.redeemBtnOff
                      : { borderColor: item.color },
                  ]}
                  onPress={() => !disabled && redeem(item)}
                  disabled={disabled || isBusy}
                  activeOpacity={0.75}
                >
                  {isBusy
                    ? <ActivityIndicator size="small" color={item.color} />
                    : (
                      <Text style={[
                        s.redeemBtnTxt,
                        disabled ? { color: DIM } : { color: item.color },
                      ]}>
                        {atCapacity || maxedOut ? 'MAX' : 'REDEEM'}
                      </Text>
                    )
                  }
                </TouchableOpacity>
              </View>
            </View>
          );
        })}

        {/* Earn more nudge */}
        <View style={s.earnCard}>
          <Feather name="award" size={18} color={GREEN} style={{ marginBottom: 8 }} />
          <Text style={s.earnCardTitle}>Need more credits?</Text>
          <Text style={s.earnCardBody}>
            Verify your receipt each week to earn +10. Hit a 7-week streak for a +25 bonus.
            A 30-week streak earns +100 all at once.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:          { flex: 1, backgroundColor: BG },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: CARD, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  headerTitle: {
    color: WHITE, fontSize: 13, fontWeight: '900', letterSpacing: 1.5,
  },

  balanceHero: {
    alignItems: 'center', paddingVertical: 28,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    marginHorizontal: 16,
  },
  balanceEyebrow: {
    color: DIM, fontSize: 10, fontWeight: '900', letterSpacing: 2, marginBottom: 6,
  },
  balanceNum: {
    color: WHITE, fontSize: 60, fontWeight: '900', letterSpacing: -2, lineHeight: 68,
  },
  balanceSub: {
    color: MUTED, fontSize: 14, fontWeight: '600', marginTop: 2,
  },
  shieldPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: GLOW, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 6,
    marginTop: 14, borderWidth: 1, borderColor: `${GREEN}30`,
  },
  shieldPillTxt: { color: GREEN, fontSize: 12, fontWeight: '700' },

  earnRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    marginHorizontal: 16, marginVertical: 12,
    backgroundColor: CARD, borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  earnTxt: { flex: 1, color: DIM, fontSize: 11, lineHeight: 17 },

  list: { padding: 16, gap: 10, paddingBottom: 60 },

  card: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: CARD, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  cardDisabled: { opacity: 0.45 },

  iconWrap: {
    width: 48, height: 48, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  cardBody:  { flex: 1, gap: 3 },
  cardName:  { color: WHITE, fontSize: 15, fontWeight: '800' },
  cardDesc:  { color: MUTED, fontSize: 12, lineHeight: 17 },
  heldHint:  { color: GREEN, fontSize: 11, fontWeight: '700', marginTop: 2 },

  cardRight: { alignItems: 'center', gap: 1, flexShrink: 0, minWidth: 72 },
  costNum:   { fontSize: 24, fontWeight: '900', lineHeight: 28, letterSpacing: -0.5 },
  costLabel: { color: DIM, fontSize: 10, fontWeight: '700' },

  redeemBtn: {
    marginTop: 6, borderWidth: 1.5, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 7,
    width: 72, alignItems: 'center',
  },
  redeemBtnOff:  { borderColor: BORDER },
  redeemBtnTxt:  { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },

  earnCard: {
    marginTop: 6, backgroundColor: GLOW, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: `${GREEN}25`, alignItems: 'center',
  },
  earnCardTitle: { color: WHITE, fontSize: 14, fontWeight: '800', marginBottom: 6 },
  earnCardBody:  { color: MUTED, fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
