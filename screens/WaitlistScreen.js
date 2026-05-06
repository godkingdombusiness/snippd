// screens/WaitlistScreen.js
// Three-lane waitlist:
//   Paid  #1–200   → instant beta (first 200 who pay via Stripe)
//   Gifted #201–300 → Snippd admin grants (influencers, featured picks)
//   Free  #301+    → organic waitlist, gamified climb
//
// Position is read from waitlist_positions table and updates live via Supabase
// real-time. Users climb by completing actions tracked in waitlist_actions.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Share, StyleSheet,
  Animated, TouchableOpacity, Linking, Platform, Alert, AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

// ── Design tokens ─────────────────────────────────────────────────────────────
const GREEN      = '#0C9E54';
const GREEN_SOFT = 'rgba(12,158,84,0.12)';
const GREEN_MED  = 'rgba(12,158,84,0.22)';
const MINT       = '#F0FBF0';
const MINT_DEEP  = '#E8F5E9';
const NAVY       = '#1A237E';
const NAVY_DEEP  = '#04361D';
const WHITE      = '#FFFFFF';
const SLATE      = '#64748B';
const BORDER     = '#E2E8F0';
const CORAL      = '#FF7043';
const CORAL_SOFT = 'rgba(255,112,67,0.12)';
const MINT_POP   = '#C5FFBC';
const AMBER      = '#F59E0B';
const AMBER_SOFT = 'rgba(245,158,11,0.12)';

// ── Config — swap Stripe links when ready ────────────────────────────────────
// Set EXPO_PUBLIC_STRIPE_BETA_PRO and EXPO_PUBLIC_STRIPE_FOUNDER in .env
const STRIPE_BETA_PRO = process.env.EXPO_PUBLIC_STRIPE_BETA_PRO  ?? 'https://buy.stripe.com/snippd-beta-pro';
const STRIPE_FOUNDER  = process.env.EXPO_PUBLIC_STRIPE_FOUNDER   ?? 'https://buy.stripe.com/snippd-founder';

// ── Social handles ────────────────────────────────────────────────────────────
const SOCIALS = [
  { key: 'share_ig',    label: 'Instagram', url: 'https://instagram.com/getsnippd', icon: 'instagram' },
  { key: 'share_tiktok',label: 'TikTok',    url: 'https://tiktok.com/@getsnippd',  icon: 'video'      },
  { key: 'share_x',     label: 'X',         url: 'https://x.com/getsnippd',        icon: 'twitter'    },
];

// ── Move-up action definitions ────────────────────────────────────────────────
const ACTIONS = [
  {
    key:     'complete_briefing',
    label:   'Complete your profile',
    sub:     'Finish the 5-chapter Deep Brief so your agent knows your household',
    icon:    'user-check',
    spots:   10,
    color:   GREEN,
    bg:      GREEN_SOFT,
    auto:    true,   // verified automatically
  },
  {
    key:     'share_ig',
    label:   'Tag us on Instagram',
    sub:     'Post your savings forecast and tag @getsnippd — we review and credit you',
    icon:    'instagram',
    spots:   25,
    color:   CORAL,
    bg:      CORAL_SOFT,
    auto:    false,
  },
  {
    key:     'share_tiktok',
    label:   'Tag us on TikTok',
    sub:     'Show your forecast on TikTok, tag @getsnippd for credit',
    icon:    'video',
    spots:   25,
    color:   CORAL,
    bg:      CORAL_SOFT,
    auto:    false,
  },
  {
    key:     'share_x',
    label:   'Post on X',
    sub:     'Share your savings number on X, tag @getsnippd',
    icon:    'twitter',
    spots:   25,
    color:   CORAL,
    bg:      CORAL_SOFT,
    auto:    false,
  },
  {
    key:     'referral_join',
    label:   'Refer a friend',
    sub:     'Friend joins the waitlist using your link — auto-credited when they complete forecast',
    icon:    'user-plus',
    spots:   50,
    color:   NAVY,
    bg:      'rgba(26,35,126,0.08)',
    auto:    true,
  },
  {
    key:     'referral_paid',
    label:   'Refer a friend who pays',
    sub:     'Friend pays for Beta Pro or Founder using your link — biggest jump on the board',
    icon:    'dollar-sign',
    spots:   100,
    color:   AMBER,
    bg:      AMBER_SOFT,
    auto:    true,
  },
];

const LEAK_LABELS = {
  convenience_tax: 'Convenience Tax',
  brand_trap:      'Brand Trap',
  target_drift:    'Target Drift',
  healthy_premium: 'Healthy Premium',
};

export default function WaitlistScreen({ route, navigation }) {
  const routeProjection = route?.params?.projection ?? null;

  const [userId,        setUserId]        = useState(null);
  const [email,         setEmail]         = useState('');
  const [projection,    setProjection]    = useState(routeProjection);
  const [leakLabel,     setLeakLabel]     = useState(null);
  const [briefingDone,  setBriefingDone]  = useState(false);

  // Position data from waitlist_positions table
  const [posRow,        setPosRow]        = useState(null); // full row
  const [totalOnList,   setTotalOnList]   = useState(null);
  const [myActions,     setMyActions]     = useState([]);   // waitlist_actions rows
  const [posLoading,    setPosLoading]    = useState(true);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [recordingKey,  setRecordingKey]  = useState(null); // action being submitted

  const fadeAnim        = useRef(new Animated.Value(0)).current;
  const wentToStripeRef = useRef(false);  // true after user taps a "Pay now" button
  const pollCountRef    = useRef(0);
  const slideAnim = useRef(new Animated.Value(24)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // ── Load position + actions ──────────────────────────────────────────────
  const refreshData = useCallback(async (uid) => {
    const targetId = uid ?? userId;
    if (!targetId) return;
    setPosLoading(true);
    try {
      // My position row
      const { data: pos } = await supabase
        .from('waitlist_positions')
        .select('*')
        .eq('user_id', targetId)
        .maybeSingle();

      setPosRow(pos ?? null);

      // My action log
      const { data: acts } = await supabase
        .from('waitlist_actions')
        .select('action_type, spots_awarded, verified, created_at')
        .eq('user_id', targetId)
        .order('created_at', { ascending: false })
        .limit(20);

      setMyActions(acts ?? []);

      // Community total from the stats view
      const { data: stats } = await supabase
        .from('v_waitlist_stats')
        .select('total_on_waitlist')
        .maybeSingle();

      setTotalOnList(stats?.total_on_waitlist ?? null);
      setLastUpdated(new Date());
    } catch (_) {
      // Silently fail — stale data is fine
    } finally {
      setPosLoading(false);
    }
  }, [userId]);

  // ── Record a share/social action ─────────────────────────────────────────
  const recordAction = useCallback(async (action) => {
    if (!userId) return;
    if (recordingKey) return;

    // Check if already done (honor-system actions can be re-submitted but
    // auto actions should only credit once)
    const alreadyDone = myActions.some(a => a.action_type === action.key);

    if (action.auto && alreadyDone) {
      Alert.alert('Already credited', `You already earned ${action.spots} spots for this action.`);
      return;
    }

    // For social shares — open the platform first, then record the claim
    const social = SOCIALS.find(s => s.key === action.key);
    if (social) {
      Linking.openURL(social.url).catch(() => {});
      // Record claim (unverified — Snippd team reviews)
      setRecordingKey(action.key);
      try {
        await supabase.rpc('record_waitlist_action', {
          p_user_id:     userId,
          p_action_type: action.key,
          p_spots:       action.spots,
          p_verified:    false,
          p_note:        'Honor-system share claim — pending Snippd review',
        });
        await refreshData(userId);
      } catch (_) {}
      setRecordingKey(null);
      return;
    }

    // Complete briefing — navigate there if not done
    if (action.key === 'complete_briefing') {
      if (briefingDone) {
        Alert.alert('Already done', 'Your profile is complete. Spots already credited.');
        return;
      }
      navigation.navigate('ConciergeOnboarding');
      return;
    }
  }, [userId, myActions, recordingKey, briefingDone, navigation, refreshData]);

  // ── Initial load ─────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email ?? '');

      const { data: persona } = await supabase
        .from('user_persona')
        .select('projected_monthly_recovery_cents, leak_category, briefing_completed')
        .eq('user_id', user.id)
        .single();

      if (persona && !routeProjection) {
        const monthly = Math.round((persona.projected_monthly_recovery_cents ?? 0) / 100);
        setProjection({ monthly, annual: monthly * 12 });
      }
      if (persona?.leak_category)    setLeakLabel(LEAK_LABELS[persona.leak_category] ?? null);
      if (persona?.briefing_completed) setBriefingDone(true);

      await refreshData(user.id);

      Animated.parallel([
        Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.04, duration: 1200, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.00, duration: 1200, useNativeDriver: true }),
        ])
      ).start();
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Refresh on screen focus — also re-checks payment status ─────────────
  // After a Stripe payment, the user returns to this screen. The webhook may
  // have updated user_persona.status to 'paid_beta'. We re-check and navigate.
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      refreshData(userId);

      // Re-check persona status in case Stripe webhook fired while in browser
      (async () => {
        try {
          const [{ data: persona }, { data: betaFlag }] = await Promise.all([
            supabase
              .from('user_persona')
              .select('status, briefing_completed')
              .eq('user_id', userId)
              .maybeSingle(),
            supabase
              .from('snippd_integrations')
              .select('value')
              .eq('key', 'is_beta_live')
              .maybeSingle(),
          ]);

          const status       = persona?.status;
          const briefingDone = persona?.briefing_completed ?? false;

          // paid_beta: always enter — paid users are never held by is_beta_live flag
          if (status === 'paid_beta') {
            navigation.replace(briefingDone ? 'FounderDashboard' : 'ConciergeOnboarding');
          } else if (status === 'launched') {
            navigation.replace(briefingDone ? 'MainApp' : 'ConciergeOnboarding');
          }
        } catch { /* non-fatal — stay on waitlist screen */ }
      })();
    }, [userId, refreshData, navigation])
  );

  // ── Real-time position updates ───────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel('waitlist-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist_positions' },
        () => refreshData(userId))
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'waitlist_actions',
        filter: `user_id=eq.${userId}` },
        () => refreshData(userId))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [userId, refreshData]);

  // ── AppState listener — auto-poll after returning from Stripe ───────────
  // When the user opens a Stripe payment link we set wentToStripeRef=true.
  // When the app comes back to the foreground we poll user_persona up to 6
  // times (every 3s = 18s window) so the navigation fires automatically
  // without the user needing to tap "Check my access".
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener('change', async (nextState) => {
      if (nextState !== 'active') return;
      if (!wentToStripeRef.current) return;
      if (pollCountRef.current >= 6) { wentToStripeRef.current = false; pollCountRef.current = 0; return; }

      pollCountRef.current += 1;
      try {
        const { data: persona } = await supabase
          .from('user_persona')
          .select('status, briefing_completed')
          .eq('user_id', userId)
          .maybeSingle();

        const status = persona?.status;
        if (status === 'paid_beta' || status === 'launched') {
          wentToStripeRef.current = false;
          pollCountRef.current    = 0;
          const dest = status === 'paid_beta'
            ? (persona.briefing_completed ? 'FounderDashboard' : 'ConciergeOnboarding')
            : (persona.briefing_completed ? 'MainApp'          : 'ConciergeOnboarding');
          navigation.replace(dest);
        } else if (pollCountRef.current < 6) {
          // Webhook may not have fired yet — schedule another check in 3 s
          setTimeout(async () => {
            if (!wentToStripeRef.current) return;
            pollCountRef.current += 1;
            try {
              const { data: p2 } = await supabase
                .from('user_persona')
                .select('status, briefing_completed')
                .eq('user_id', userId)
                .maybeSingle();
              if (p2?.status === 'paid_beta' || p2?.status === 'launched') {
                wentToStripeRef.current = false;
                pollCountRef.current    = 0;
                const d2 = p2.status === 'paid_beta'
                  ? (p2.briefing_completed ? 'FounderDashboard' : 'ConciergeOnboarding')
                  : (p2.briefing_completed ? 'MainApp'          : 'ConciergeOnboarding');
                navigation.replace(d2);
              }
            } catch {}
          }, 3000);
        }
      } catch {}
    });
    return () => sub.remove();
  }, [userId, navigation]);

  // ── Share handler ────────────────────────────────────────────────────────
  const handleShare = useCallback(async () => {
    const handle   = email.split('@')[0] ?? 'friend';
    const link     = `https://snippd.com/join?ref=${handle}`;
    const monthly  = projection?.monthly ?? 0;
    const pos      = posRow?.current_position;
    const msg = monthly > 0
      ? `I'm #${pos} on the Snippd waitlist — my Shopping Concierge is going to save me $${monthly}/mo.\n\nUse my link to skip ahead when beta opens:\n${link}\n\n@getsnippd #Snippd`
      : `I claimed my spot on the Snippd waitlist. An AI concierge that finds the floor price on everything.\n\nJoin me: ${link}\n\n@getsnippd #Snippd`;
    try { await Share.share({ message: msg, url: link }); } catch {}
  }, [email, projection, posRow]);

  // ── Derived display values ───────────────────────────────────────────────
  const currentPos    = posRow?.current_position;
  const posDisplay    = currentPos != null ? `#${currentPos.toLocaleString()}` : (posLoading ? '...' : '—');
  const spotsGained   = posRow?.spots_gained ?? 0;
  const tier          = posRow?.tier ?? 'free';
  const isApproved    = posRow?.status === 'approved';
  const totalDisplay  = totalOnList != null ? Number(totalOnList).toLocaleString() : '—';
  const monthlyAmt    = projection?.monthly ?? 0;
  const annualAmt     = projection?.annual  ?? monthlyAmt * 12;
  const referralLink  = `snippd.com/join?ref=${email.split('@')[0] ?? 'friend'}`;
  const updatedTime   = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  // Which actions haven't been claimed yet
  const claimedKeys   = new Set(myActions.map(a => a.action_type));

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>
          {isApproved ? 'You are in' : 'Your spot is reserved'}
        </Text>

        {isApproved ? (
          <View style={styles.approvedBadge}>
            <Feather name="check-circle" size={32} color={MINT_POP} />
            <Text style={styles.approvedText}>Beta access granted</Text>
            <TouchableOpacity
              style={styles.accessNowBtn}
              onPress={() => navigation.replace('MainApp')}
              activeOpacity={0.85}
            >
              <Text style={styles.accessNowBtnTxt}>ACCESS NOW</Text>
              <Feather name="arrow-right" size={18} color={WHITE} />
            </TouchableOpacity>
          </View>
        ) : (
          <Animated.View style={[styles.posBadgeWrap, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.posNumber}>{posDisplay}</Text>
            <Text style={styles.posLabel}>in line</Text>
            {spotsGained > 0 && (
              <View style={styles.spotsGainedBadge}>
                <Feather name="trending-up" size={11} color={GREEN} />
                <Text style={styles.spotsGainedText}>+{spotsGained} spots earned</Text>
              </View>
            )}
            {updatedTime && (
              <View style={styles.liveIndicator}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>Live · {updatedTime}</Text>
              </View>
            )}
          </Animated.View>
        )}

        {/* Tier badge */}
        {tier === 'paid' && (
          <View style={[styles.tierBadge, styles.tierBadgePaid]}>
            <Feather name="star" size={11} color={AMBER} />
            <Text style={[styles.tierBadgeText, { color: AMBER }]}>Paid fast track</Text>
          </View>
        )}
        {tier === 'gifted' && (
          <View style={[styles.tierBadge, styles.tierBadgeGifted]}>
            <Feather name="gift" size={11} color={CORAL} />
            <Text style={[styles.tierBadgeText, { color: CORAL }]}>Reserved spot</Text>
          </View>
        )}

        {/* Community count */}
        {totalOnList != null && (
          <Text style={styles.communityCount}>
            {totalDisplay} people on the waitlist
          </Text>
        )}

        {/* Projection */}
        {monthlyAmt > 0 && (
          <View style={styles.heroProjCard}>
            <Text style={styles.heroProjEyebrow}>
              {leakLabel ? `Your ${leakLabel} is costing you` : 'Your Shopping Concierge projects'}
            </Text>
            <Text style={styles.heroProjAmount}>${monthlyAmt}/mo in recovery</Text>
            <Text style={styles.heroProjAnnual}>
              ${annualAmt.toLocaleString()} back every year
            </Text>
          </View>
        )}
      </View>

      {/* ── Scrollable body ──────────────────────────────────────────────── */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>

          {/* ── Unlock beta shortcuts ────────────────────────────────────── */}
          {!isApproved && (
            <View style={styles.unlockShortcutCard}>
              <View style={styles.unlockShortcutHeader}>
                <Feather name="unlock" size={16} color={GREEN} />
                <Text style={styles.unlockShortcutTitle}>Skip the wait — unlock now</Text>
              </View>
              <Text style={styles.unlockShortcutSub}>
                Have a promo code or ready to pay? Get in immediately.
              </Text>
              <View style={styles.unlockShortcutRow}>
                <TouchableOpacity
                  style={styles.unlockPromoBtn}
                  onPress={() => {
                    recordMemoryEvent({ event_type: 'promo_code_entered', metadata: { source: 'waitlist_shortcut' } });
                    navigation.navigate('UnlockBeta', { openPromo: true });
                  }}
                  activeOpacity={0.8}
                >
                  <Feather name="tag" size={14} color={CORAL} />
                  <Text style={styles.unlockPromoBtnText}>Enter promo code</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.unlockPayBtn}
                  onPress={() => navigation.navigate('UnlockBeta', { openPromo: false })}
                  activeOpacity={0.85}
                >
                  <Text style={styles.unlockPayBtnText}>Unlock now</Text>
                  <Feather name="arrow-right" size={14} color={WHITE} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Skip the line — Stripe ───────────────────────────────────── */}
          {!isApproved && tier === 'free' && (
            <View style={styles.upgradeCard}>
              <View style={styles.upgradeBadge}>
                <Text style={styles.upgradeBadgeText}>Skip the line</Text>
              </View>
              <Text style={styles.upgradeTitle}>Get instant beta access</Text>
              <Text style={styles.upgradeSub}>
                First 200 paid members get in automatically.
                {'\n'}Your referral link locks in your friends when beta opens.
              </Text>

              {/* After paying in browser, user taps this to resume without re-launching */}
              <TouchableOpacity
                style={styles.checkAccessBtn}
                onPress={async () => {
                  try {
                    const { data: persona } = await supabase
                      .from('user_persona')
                      .select('status, briefing_completed')
                      .eq('user_id', userId)
                      .maybeSingle();
                    const { data: betaFlag } = await supabase
                      .from('snippd_integrations')
                      .select('value')
                      .eq('key', 'is_beta_live')
                      .maybeSingle();
                    if (persona?.status === 'paid_beta') {
                      navigation.replace(persona.briefing_completed ? 'FounderDashboard' : 'ConciergeOnboarding');
                    } else if (persona?.status === 'launched') {
                      navigation.replace(persona.briefing_completed ? 'MainApp' : 'ConciergeOnboarding');
                    } else {
                      Alert.alert('Still processing', 'Your payment may take a moment to confirm. Try again in 30 seconds.');
                    }
                  } catch { Alert.alert('Error', 'Could not check status. Try again.'); }
                }}
                activeOpacity={0.85}
              >
                <Feather name="refresh-cw" size={14} color={GREEN} />
                <Text style={styles.checkAccessTxt}>Already paid? Check my access</Text>
              </TouchableOpacity>

              <View style={styles.upgradeTierRow}>
                <TouchableOpacity
                  style={styles.upgradeTierBtn}
                  onPress={() => { wentToStripeRef.current = true; pollCountRef.current = 0; Linking.openURL(STRIPE_BETA_PRO); }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.upgradeTierName}>Beta Pro</Text>
                  <Text style={styles.upgradeTierPrice}>$4.99<Text style={styles.upgradeTierPer}>/mo</Text></Text>
                  <Text style={styles.upgradeTierDesc}>Full access while in beta</Text>
                  <View style={styles.upgradeTierCta}>
                    <Text style={styles.upgradeTierCtaText}>Pay now</Text>
                    <Feather name="arrow-right" size={13} color={WHITE} />
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.upgradeTierBtn, styles.upgradeTierBtnFounder]}
                  onPress={() => { wentToStripeRef.current = true; pollCountRef.current = 0; Linking.openURL(STRIPE_FOUNDER); }}
                  activeOpacity={0.85}
                >
                  <View style={styles.founderPill}>
                    <Text style={styles.founderPillText}>Best value</Text>
                  </View>
                  <Text style={[styles.upgradeTierName, { color: CORAL }]}>Founder</Text>
                  <Text style={[styles.upgradeTierPrice, { color: CORAL }]}>$99<Text style={[styles.upgradeTierPer, { color: CORAL }]}> once</Text></Text>
                  <Text style={styles.upgradeTierDesc}>Lifetime access + Founders Wall</Text>
                  <View style={[styles.upgradeTierCta, { backgroundColor: CORAL }]}>
                    <Text style={styles.upgradeTierCtaText}>Pay now</Text>
                    <Feather name="arrow-right" size={13} color={WHITE} />
                  </View>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Move up faster — gamification ────────────────────────────── */}
          {!isApproved && (
            <View style={styles.climbCard}>
              <Text style={styles.sectionTitle}>Move up faster</Text>
              <Text style={styles.climbSub}>
                Complete actions to climb the list. Every verified action moves you up automatically.
              </Text>

              {ACTIONS.map(action => {
                const done    = claimedKeys.has(action.key);
                const loading = recordingKey === action.key;
                return (
                  <TouchableOpacity
                    key={action.key}
                    style={[styles.actionRow, done && styles.actionRowDone]}
                    onPress={() => recordAction(action)}
                    disabled={loading}
                    activeOpacity={0.8}
                  >
                    <View style={[styles.actionIconWrap, { backgroundColor: done ? 'rgba(0,0,0,0.04)' : action.bg }]}>
                      <Feather
                        name={done ? 'check' : action.icon}
                        size={18}
                        color={done ? SLATE : action.color}
                      />
                    </View>
                    <View style={styles.actionInfo}>
                      <Text style={[styles.actionLabel, done && styles.actionLabelDone]}>
                        {action.label}
                      </Text>
                      <Text style={styles.actionSub}>{action.sub}</Text>
                    </View>
                    <View style={[styles.spotsBadge, done && styles.spotsBadgeDone]}>
                      <Text style={[styles.spotsBadgeText, done && styles.spotsBadgeTextDone]}>
                        {done ? 'Done' : `+${action.spots}`}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {spotsGained > 0 && (
                <View style={styles.totalSpotsRow}>
                  <Feather name="trending-up" size={14} color={GREEN} />
                  <Text style={styles.totalSpotsText}>
                    You have moved up {spotsGained} spots total
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* ── Referral card ─────────────────────────────────────────────── */}
          <View style={styles.referralCard}>
            <View style={styles.referralHeader}>
              <View style={styles.referralIconWrap}>
                <Feather name="link" size={18} color={GREEN} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.referralTitle}>Your referral link</Text>
                <Text style={styles.referralSub}>
                  Friends who join through your link skip ahead when beta opens.
                  If they pay, you jump 100 spots automatically.
                </Text>
              </View>
            </View>
            <View style={styles.referralBox}>
              <Text style={styles.referralLinkText} numberOfLines={1}>{referralLink}</Text>
            </View>
            <TouchableOpacity style={styles.shareBtn} onPress={handleShare} activeOpacity={0.85}>
              <Feather name="share-2" size={16} color={WHITE} />
              <Text style={styles.shareBtnText}>Share my forecast</Text>
            </TouchableOpacity>
            <View style={styles.socialRow}>
              {SOCIALS.map((s, i) => (
                <React.Fragment key={s.key}>
                  <TouchableOpacity
                    onPress={() => Linking.openURL(s.url).catch(() => {})}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.socialLink}>{s.label}</Text>
                  </TouchableOpacity>
                  {i < SOCIALS.length - 1 && <Text style={styles.socialDot}> · </Text>}
                </React.Fragment>
              ))}
            </View>
          </View>

          {/* ── Check position ───────────────────────────────────────────── */}
          <TouchableOpacity
            style={styles.refreshRow}
            onPress={() => refreshData()}
            activeOpacity={0.7}
          >
            <Feather name="refresh-cw" size={14} color={GREEN} />
            <Text style={styles.refreshText}>Check my position</Text>
            {updatedTime && <Text style={styles.refreshTime}>Updated {updatedTime}</Text>}
          </TouchableOpacity>

          {/* ── What happens next ────────────────────────────────────────── */}
          <View style={styles.nextCard}>
            <Text style={styles.sectionTitle}>What happens next</Text>
            {[
              { icon: 'mail',        text: "You'll get an email the moment beta opens for your batch." },
              { icon: 'cpu',         text: 'Your Shopping Concierge activates and runs your first full scan.' },
              { icon: 'trending-up', text: 'Your first Savings Stack is ready before your next grocery run.' },
            ].map(({ icon, text }) => (
              <View key={icon} style={styles.nextRow}>
                <View style={styles.nextIconWrap}>
                  <Feather name={icon} size={15} color={GREEN} />
                </View>
                <Text style={styles.nextText}>{text}</Text>
              </View>
            ))}
          </View>

          {/* ── Agent standing by ────────────────────────────────────────── */}
          <View style={styles.agentCard}>
            <View style={styles.agentDot} />
            <View style={{ flex: 1 }}>
              <Text style={styles.agentTitle}>Your concierge is standing by.</Text>
              <Text style={styles.agentSub}>
                The moment you are activated it starts scanning your categories,
                building your first Savings Stack, and alerting you to price drops
                on your anchor products.
              </Text>
            </View>
          </View>

        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: NAVY_DEEP },

  // ── Hero ─────────────────────────────────────────────────────────────────
  hero: {
    backgroundColor: NAVY_DEEP,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 28,
    alignItems: 'center',
  },
  heroEyebrow: {
    fontSize: 11, fontWeight: '700', color: MINT_POP,
    letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12,
  },
  approvedBadge: { alignItems: 'center', gap: 8, marginBottom: 12 },
  approvedText: { fontSize: 22, fontWeight: '900', color: WHITE },
  accessNowBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 16, paddingHorizontal: 32,
    marginTop: 8, minWidth: 220,
  },
  accessNowBtnTxt: { fontSize: 16, fontWeight: '900', color: WHITE, letterSpacing: 1 },
  posBadgeWrap: { alignItems: 'center', marginBottom: 8 },
  posNumber: {
    fontSize: 64, fontWeight: '900', color: WHITE,
    letterSpacing: -2, lineHeight: 70,
  },
  posLabel: {
    fontSize: 13, color: 'rgba(255,255,255,0.45)',
    fontWeight: '500', letterSpacing: 1, textTransform: 'uppercase',
  },
  spotsGainedBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN_MED, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
  },
  spotsGainedText: { fontSize: 12, fontWeight: '700', color: MINT_POP },
  liveIndicator: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6,
  },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  liveText: {
    fontSize: 11, color: 'rgba(255,255,255,0.45)',
    fontWeight: '500', letterSpacing: 0.3,
  },
  tierBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderRadius: 20, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 8,
  },
  tierBadgePaid:   { backgroundColor: AMBER_SOFT },
  tierBadgeGifted: { backgroundColor: CORAL_SOFT },
  tierBadgeText: { fontSize: 11, fontWeight: '700' },
  communityCount: {
    fontSize: 13, color: 'rgba(255,255,255,0.35)',
    marginBottom: 14, fontWeight: '500',
  },
  heroProjCard: {
    backgroundColor: 'rgba(12,158,84,0.15)',
    borderRadius: 16, borderWidth: 1,
    borderColor: 'rgba(12,158,84,0.3)',
    paddingHorizontal: 20, paddingVertical: 14,
    alignItems: 'center', width: '100%', marginTop: 4,
  },
  heroProjEyebrow: {
    fontSize: 12, color: MINT_POP, fontWeight: '500',
    marginBottom: 4, textAlign: 'center',
  },
  heroProjAmount: {
    fontSize: 22, fontWeight: '900', color: WHITE, textAlign: 'center',
  },
  heroProjAnnual: {
    fontSize: 13, color: 'rgba(255,255,255,0.6)',
    marginTop: 2, textAlign: 'center',
  },

  // ── Body ──────────────────────────────────────────────────────────────────
  body: {
    backgroundColor: MINT,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingTop: 24, paddingBottom: 60, gap: 16,
  },

  // ── Unlock shortcuts card ─────────────────────────────────────────────────
  unlockShortcutCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18, gap: 10,
    borderWidth: 1.5, borderColor: GREEN,
  },
  unlockShortcutHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  unlockShortcutTitle: { fontSize: 16, fontWeight: '800', color: NAVY },
  unlockShortcutSub: { fontSize: 13, color: SLATE, lineHeight: 19 },
  unlockShortcutRow: { flexDirection: 'row', gap: 10 },
  unlockPromoBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    borderWidth: 1.5, borderColor: CORAL, borderRadius: 12,
    paddingVertical: 12, backgroundColor: CORAL_SOFT,
  },
  unlockPromoBtnText: { fontSize: 13, fontWeight: '700', color: CORAL },
  unlockPayBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12,
  },
  unlockPayBtnText: { fontSize: 13, fontWeight: '700', color: WHITE },

  // ── Upgrade / Stripe card ─────────────────────────────────────────────────
  upgradeCard: {
    backgroundColor: NAVY_DEEP, borderRadius: 20, padding: 22,
  },
  upgradeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: CORAL_SOFT,
    borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4,
    marginBottom: 12, borderWidth: 1, borderColor: CORAL,
  },
  upgradeBadgeText: {
    fontSize: 10, fontWeight: '800', color: CORAL,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  upgradeTitle: {
    fontSize: 20, fontWeight: '900', color: WHITE, marginBottom: 6,
  },
  upgradeSub: {
    fontSize: 14, color: 'rgba(255,255,255,0.6)',
    lineHeight: 21, marginBottom: 18,
  },
  checkAccessBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: GREEN, borderRadius: 12, paddingVertical: 12, marginBottom: 14 },
  checkAccessTxt: { color: GREEN, fontSize: 13, fontWeight: '700' },
  upgradeTierRow: { flexDirection: 'row', gap: 12 },
  upgradeTierBtn: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 16, padding: 16, alignItems: 'center', gap: 4,
  },
  upgradeTierBtnFounder: {
    backgroundColor: 'rgba(255,112,67,0.10)',
    borderWidth: 1, borderColor: 'rgba(255,112,67,0.35)',
  },
  founderPill: {
    backgroundColor: CORAL, borderRadius: 20,
    paddingHorizontal: 8, paddingVertical: 3, marginBottom: 4,
  },
  founderPillText: { fontSize: 9, fontWeight: '800', color: WHITE, letterSpacing: 0.5 },
  upgradeTierName: {
    fontSize: 11, fontWeight: '700', color: MINT_POP,
    textTransform: 'uppercase', letterSpacing: 0.8,
  },
  upgradeTierPrice: { fontSize: 22, fontWeight: '900', color: WHITE },
  upgradeTierPer: { fontSize: 13, fontWeight: '500' },
  upgradeTierDesc: {
    fontSize: 11, color: 'rgba(255,255,255,0.45)',
    textAlign: 'center', lineHeight: 15,
  },
  upgradeTierCta: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: GREEN, borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 8, marginTop: 10,
  },
  upgradeTierCtaText: { fontSize: 13, fontWeight: '700', color: WHITE },

  // ── Climb card (gamification) ─────────────────────────────────────────────
  climbCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 12,
  },
  climbSub: { fontSize: 13, color: SLATE, lineHeight: 19, marginBottom: 4 },
  actionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#FAFAFA', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: BORDER,
  },
  actionRowDone: { opacity: 0.55 },
  actionIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  actionInfo: { flex: 1 },
  actionLabel: {
    fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 2,
  },
  actionLabelDone: { color: SLATE },
  actionSub: { fontSize: 12, color: SLATE, lineHeight: 17 },
  spotsBadge: {
    backgroundColor: GREEN_SOFT, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, flexShrink: 0,
  },
  spotsBadgeDone: { backgroundColor: 'rgba(0,0,0,0.04)' },
  spotsBadgeText: { fontSize: 12, fontWeight: '800', color: GREEN },
  spotsBadgeTextDone: { color: SLATE },
  totalSpotsRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: GREEN_SOFT, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  totalSpotsText: { fontSize: 13, color: GREEN, fontWeight: '600' },

  // ── Referral card ─────────────────────────────────────────────────────────
  referralCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: GREEN, gap: 12,
    ...Platform.select({
      web: { boxShadow: '0px 4px 12px rgba(12,158,84,0.12)' },
      default: { shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 4 },
    }),
  },
  referralHeader: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  referralIconWrap: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: GREEN_SOFT, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  referralTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginBottom: 4 },
  referralSub: { fontSize: 13, color: SLATE, lineHeight: 19 },
  referralBox: {
    backgroundColor: MINT_DEEP, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  referralLinkText: {
    fontSize: 13, color: NAVY,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 14,
  },
  shareBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  socialRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  socialLink: { fontSize: 13, fontWeight: '700', color: GREEN, textDecorationLine: 'underline' },
  socialDot: { fontSize: 13, color: SLATE },

  // ── Refresh row ───────────────────────────────────────────────────────────
  refreshRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: WHITE, borderRadius: 12,
    paddingHorizontal: 16, paddingVertical: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  refreshText: { fontSize: 14, fontWeight: '600', color: GREEN, flex: 1 },
  refreshTime: { fontSize: 12, color: SLATE },

  // ── What's next ───────────────────────────────────────────────────────────
  nextCard: { backgroundColor: WHITE, borderRadius: 20, padding: 20, gap: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: NAVY, marginBottom: 2 },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  nextIconWrap: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: GREEN_SOFT, alignItems: 'center', justifyContent: 'center',
    marginTop: 1, flexShrink: 0,
  },
  nextText: { flex: 1, fontSize: 14, color: SLATE, lineHeight: 20 },

  // ── Agent card ────────────────────────────────────────────────────────────
  agentCard: {
    flexDirection: 'row', gap: 14,
    backgroundColor: WHITE, borderRadius: 16, padding: 18,
  },
  agentDot: {
    width: 10, height: 10, borderRadius: 5,
    backgroundColor: SLATE, marginTop: 4, flexShrink: 0,
  },
  agentTitle: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 4 },
  agentSub: { fontSize: 13, color: SLATE, lineHeight: 19, flex: 1 },
});
