import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const AMBER = '#F59E0B';
const RED = '#EF4444';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const SHADOW_SM = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const formatDate = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  }).toUpperCase();
};

const LEVELS = [
  { name: 'Savings Starter', min: 0, max: 10000, level: 1 },
  { name: 'Deal Hunter', min: 10000, max: 25000, level: 2 },
  { name: 'Stack Master', min: 25000, max: 50000, level: 3 },
  { name: 'Savings Expert', min: 50000, max: 100000, level: 4 },
  { name: 'Snippd Legend', min: 100000, max: 999999999, level: 5 },
];

const getLevel = (totalSavedCents) => {
  const level = LEVELS.find(l =>
    totalSavedCents >= l.min && totalSavedCents < l.max
  ) || LEVELS[0];
  const progress = level.max < 999999999
    ? ((totalSavedCents - level.min) / (level.max - level.min)) * 100
    : 100;
  const toNext = level.max < 999999999
    ? level.max - totalSavedCents
    : 0;
  return { ...level, progress, toNext };
};

const CATEGORY_COLORS = {
  Protein: RED,
  Produce: GREEN,
  Pantry: AMBER,
  Dairy: '#3B82F6',
  Snacks: '#A855F7',
  Household: '#0EA5E9',
  Other: GRAY,
};

const SEED_WINS = [
  { id: '1', store_name: 'Publix', total_savings_cents: 4280, total_spent_cents: 2800, verified_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), items_on_stack: 7 },
  { id: '2', store_name: 'Dollar General', total_savings_cents: 1220, total_spent_cents: 1800, verified_at: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString(), items_on_stack: 4 },
];

const COMMUNITY_CHALLENGES = [
  { title: 'Buy Local Week', desc: 'Shop at 2 local stores this week', progress: 0, target: 2, unit: 'stores' },
  { title: 'Zero Waste Month', desc: 'Use everything in your pantry before it expires', progress: 4, target: 10, unit: 'items used' },
  { title: 'Stack Streaker', desc: 'Verify receipts 3 weeks in a row', progress: 0, target: 3, unit: 'weeks' },
];

export default function WinsScreen({ navigation, route }) {
  const freshStart = route?.params?.freshStart || null;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [trips, setTrips] = useState([]);
  const [profile, setProfile] = useState(null);
  const [totalSaved, setTotalSaved] = useState(0);
  const [totalTrips, setTotalTrips] = useState(0);
  const [avgYield, setAvgYield] = useState(0);
  const [stashCredits, setStashCredits] = useState(0);
  const [categorySpend, setCategorySpend] = useState({});
  const [showCelebration, setShowCelebration] = useState(!!freshStart);

  // Animate the celebration banner in
  const celebrationAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (freshStart) {
      Animated.spring(celebrationAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 60,
        friction: 8,
      }).start();
    }
  }, [freshStart]);

  const fetchWins = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('full_name, stash_credits, weekly_budget, preferences')
        .eq('user_id', user.id)
        .single();

      if (profileData) {
        setProfile(profileData);
        setStashCredits(profileData.stash_credits || 0);
      }

      // Fetch trip results
      const { data: tripData } = await supabase
        .from('trip_results')
        .select('*')
        .eq('user_id', user.id)
        .order('verified_at', { ascending: false })
        .limit(10);

      const trips = tripData || [];

      setTrips(trips);
      const lifetime = trips.reduce((s, t) => s + (t.total_savings_cents || 0), 0);
      setTotalSaved(lifetime);
      setTotalTrips(trips.length);

      if (trips.length > 0) {
        const yields = trips.map(t => {
          const retail = (t.total_savings_cents || 0) + (t.total_spent_cents || 0);
          return retail > 0 ? (t.total_savings_cents / retail) * 100 : 0;
        });
        setAvgYield(Math.round(yields.reduce((s, y) => s + y, 0) / yields.length));
      }

      // Category spend from receipt_items (correct table)
      const { data: receiptItems } = await supabase
        .from('receipt_items')
        .select('category, amount_cents')
        .eq('user_id', user.id);

      if (receiptItems?.length > 0) {
        const cats = {};
        receiptItems.forEach(item => {
          const cat = item.category
            ? item.category.charAt(0).toUpperCase() + item.category.slice(1)
            : 'Other';
          cats[cat] = (cats[cat] || 0) + (item.amount_cents || 0);
        });
        setCategorySpend(cats);
      }
    } catch (e) {
      
      setTrips(SEED_WINS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchWins(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchWins(); };

  const level = getLevel(totalSaved);
  const displayName = profile?.full_name?.split(' ')[0] || 'Dina';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Loading your wins...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Your Wins</Text>
          <Text style={styles.topSub}>Tracking your wealth through smarter shopping</Text>
        </View>
        <TouchableOpacity
          style={styles.topVerifyBtn}
          onPress={() => navigation.navigate('ReceiptUpload')}
        >
          <Text style={styles.topVerifyBtnTxt}>Verify Receipt</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── FRESH START CELEBRATION BANNER ─────────────────────────────── */}
        {freshStart && showCelebration && (
          <Animated.View style={[
            styles.pad,
            { opacity: celebrationAnim, transform: [{ scale: celebrationAnim }] },
          ]}>
            <View style={styles.celebCard}>
              {/* Dismiss */}
              <TouchableOpacity
                style={styles.celebDismiss}
                onPress={() => setShowCelebration(false)}
              >
                <Feather name="x" size={16} color={GRAY} />
              </TouchableOpacity>

              {/* Level-up badge */}
              {freshStart.leveledUp && (
                <View style={styles.levelUpBadge}>
                  <Feather name="arrow-up" size={12} color={WHITE} />
                  <Text style={styles.levelUpBadgeTxt}>
                    LEVEL {freshStart.levelBefore} → {freshStart.levelAfter}
                  </Text>
                </View>
              )}

              <Text style={styles.celebTitle}>Fresh Start Activated!</Text>
              <Text style={styles.celebSub}>
                {freshStart.personalizedFeed?.greeting ||
                  `Great shop at ${freshStart.storeName}. Your savings are locked in.`}
              </Text>

              {/* Stats row */}
              <View style={styles.celebStats}>
                <View style={styles.celebStat}>
                  <Text style={styles.celebStatVal}>{fmt(freshStart.savingsThisWeek)}</Text>
                  <Text style={styles.celebStatLabel}>SAVED</Text>
                </View>
                <View style={styles.celebStatDivider} />
                <View style={styles.celebStat}>
                  <Text style={styles.celebStatVal}>+{freshStart.creditsAwarded}</Text>
                  <Text style={styles.celebStatLabel}>CREDITS</Text>
                </View>
                <View style={styles.celebStatDivider} />
                <View style={styles.celebStat}>
                  <Text style={styles.celebStatVal}>{freshStart.streak}wk</Text>
                  <Text style={styles.celebStatLabel}>STREAK</Text>
                </View>
              </View>

              {/* Personalized top picks */}
              {freshStart.personalizedFeed?.top_picks?.length > 0 && (
                <View style={styles.celebPicks}>
                  <Text style={styles.celebPicksLabel}>YOUR PICKS FOR NEXT WEEK</Text>
                  {freshStart.personalizedFeed.top_picks.map((pick, i) => (
                    <View key={i} style={styles.celebPickRow}>
                      <View style={styles.celebPickDot} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.celebPickTitle}>{pick.title}</Text>
                        <Text style={styles.celebPickReason}>{pick.reason}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* Budget tip */}
              {freshStart.personalizedFeed?.budget_tip && (
                <View style={styles.celebTip}>
                  <Feather name="info" size={13} color={GREEN} />
                  <Text style={styles.celebTipTxt}>{freshStart.personalizedFeed.budget_tip}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        )}

        {/* ── LIFETIME IMPACT HERO ────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.impactCard}>
            <Text style={styles.impactEyebrow}>LIFETIME SAVINGS</Text>
            <Text style={styles.impactAmt}>{fmt(totalSaved)}</Text>
            <Text style={styles.impactSub}>since joining Snippd</Text>

            <View style={styles.impactDivider} />

            <View style={styles.impactStats}>
              <View style={styles.impactStat}>
                <Text style={styles.impactStatVal}>{totalTrips}</Text>
                <Text style={styles.impactStatLabel}>TRIPS</Text>
              </View>
              <View style={styles.impactStatDivider} />
              <View style={styles.impactStat}>
                <Text style={styles.impactStatVal}>{stashCredits}</Text>
                <Text style={styles.impactStatLabel}>CREDITS</Text>
              </View>
              <View style={styles.impactStatDivider} />
              <View style={styles.impactStat}>
                <Text style={styles.impactStatVal}>{avgYield}%</Text>
                <Text style={styles.impactStatLabel}>AVG YIELD</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── LEVEL PROGRESS ──────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.levelCard}>
            <View style={styles.levelTop}>
              <View>
                <Text style={styles.levelName}>{level.name}</Text>
                <Text style={styles.levelNum}>Level {level.level}</Text>
              </View>
              <View style={styles.levelBadge}>
                <Text style={styles.levelBadgeTxt}>LVL {level.level}</Text>
              </View>
            </View>

            <View style={styles.levelTrack}>
              <View style={[styles.levelFill, { width: `${Math.min(level.progress, 100)}%` }]} />
            </View>

            {level.toNext > 0 ? (
              <Text style={styles.levelNudge}>
                {fmt(level.toNext)} more in savings to reach Level {level.level + 1}
              </Text>
            ) : (
              <Text style={[styles.levelNudge, { color: GREEN }]}>
                Maximum level reached — Snippd Legend
              </Text>
            )}

            {/* Level milestones */}
            <View style={styles.levelMilestones}>
              {LEVELS.map(l => (
                <View
                  key={l.level}
                  style={[
                    styles.levelMilestoneDot,
                    l.level <= level.level && styles.levelMilestoneDotDone,
                  ]}
                >
                  <Text style={[
                    styles.levelMilestoneTxt,
                    l.level <= level.level && styles.levelMilestoneTxtDone,
                  ]}>
                    {l.level}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>

        {/* ── RECENT VICTORIES ────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Recent Victories</Text>
            <TouchableOpacity onPress={() => navigation.navigate('TripResults')}>
              <Text style={styles.sectionLink}>See all</Text>
            </TouchableOpacity>
          </View>

          {trips.length === 0 ? (
            <View style={styles.emptyWins}>
              <View style={styles.emptyWinsIcon}>
                <Text style={styles.emptyWinsIconTxt}>W</Text>
              </View>
              <Text style={styles.emptyWinsTitle}>No wins yet</Text>
              <Text style={styles.emptyWinsSub}>
                Verify your first receipt to start tracking your savings victories
              </Text>
              <TouchableOpacity
                style={styles.emptyWinsBtn}
                onPress={() => navigation.navigate('ReceiptUpload')}
              >
                <Text style={styles.emptyWinsBtnTxt}>Verify First Receipt</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.winsCard}>
              {trips.slice(0, 5).map((trip, i) => {
                const yieldPct = trip.total_savings_cents && trip.total_spent_cents
                  ? Math.round((trip.total_savings_cents / (trip.total_savings_cents + trip.total_spent_cents)) * 100)
                  : 0;
                return (
                  <TouchableOpacity
                    key={trip.id}
                    style={[
                      styles.winRow,
                      i === Math.min(trips.length, 5) - 1 && { borderBottomWidth: 0 },
                    ]}
                    onPress={() => navigation.navigate('TripResults', { trip })}
                    activeOpacity={0.8}
                  >
                    <View style={styles.winLeft}>
                      <View style={styles.winIconWrap}>
                        <Text style={styles.winIconTxt}>
                          {(trip.store_name || 'S').charAt(0).toUpperCase()}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.winDate}>{formatDate(trip.verified_at)}</Text>
                        <Text style={styles.winStore}>{trip.store_name || 'Receipt'}</Text>
                        <Text style={styles.winItems}>
                          {trip.items_on_stack || 0} stack items verified
                        </Text>
                      </View>
                    </View>
                    <View style={styles.winRight}>
                      <View style={styles.winSavedBadge}>
                        <Text style={styles.winSavedTxt}>
                          +{fmt(trip.total_savings_cents)}
                        </Text>
                      </View>
                      <Text style={styles.winYield}>{yieldPct}% yield</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>

        {/* ── CATEGORY SPENDING ───────────────────────────────────────────── */}
        {Object.keys(categorySpend).length > 0 && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Where Is My Stash Going?</Text>
            <View style={styles.categoryCard}>
              {Object.entries(categorySpend)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([cat, cents], i, arr) => {
                  const maxCents = arr[0][1];
                  const pct = Math.min((cents / maxCents) * 100, 100);
                  const color = CATEGORY_COLORS[cat] || GRAY;
                  return (
                    <View
                      key={cat}
                      style={[
                        styles.catRow,
                        i === arr.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={styles.catLeft}>
                        <View style={styles.catLabelRow}>
                          <View style={[styles.catDot, { backgroundColor: color }]} />
                          <Text style={styles.catName}>{cat}</Text>
                        </View>
                        <View style={styles.catBarWrap}>
                          <View style={[styles.catBarFill, {
                            width: `${pct}%`,
                            backgroundColor: color,
                          }]} />
                        </View>
                      </View>
                      <Text style={styles.catAmt}>{fmt(cents)}</Text>
                    </View>
                  );
                })}
            </View>
          </View>
        )}

        {/* ── COMMUNITY CHALLENGES ────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Community Challenges</Text>
          <View style={styles.card}>
            {COMMUNITY_CHALLENGES.map((challenge, i) => {
              const pct = Math.min((challenge.progress / challenge.target) * 100, 100);
              return (
                <View
                  key={i}
                  style={[
                    styles.challengeRow,
                    i === COMMUNITY_CHALLENGES.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.challengeInfo}>
                    <Text style={styles.challengeTitle}>{challenge.title}</Text>
                    <Text style={styles.challengeDesc}>{challenge.desc}</Text>
                    <View style={styles.challengeTrack}>
                      <View style={[styles.challengeFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.challengeProgress}>
                      {challenge.progress} of {challenge.target} {challenge.unit}
                    </Text>
                  </View>
                  <View style={[
                    styles.challengePct,
                    pct >= 100 && styles.challengePctDone,
                  ]}>
                    <Text style={[
                      styles.challengePctTxt,
                      pct >= 100 && styles.challengePctTxtDone,
                    ]}>
                      {Math.round(pct)}%
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>

        {/* ── MISSION ─────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.missionCard}>
            <Text style={styles.missionEyebrow}>COMMUNITY SAVINGS MISSION</Text>
            <Text style={styles.missionAmt}>
              {fmt(totalSaved)}
              <Text style={styles.missionOf}> of $1,000,000,000</Text>
            </Text>
            <View style={styles.missionBar}>
              <View style={[styles.missionFill, { width: `${Math.min((totalSaved / 100000000000) * 100, 100)}%` }]} />
            </View>
            <Text style={styles.missionSub}>
              Your lifetime savings contribute to the community total
            </Text>
            <TouchableOpacity
              style={styles.missionBtn}
              onPress={() => navigation.navigate('ReceiptUpload')}
            >
              <Text style={styles.missionBtnTxt}>Verify a Receipt to Contribute</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  topTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  topSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  topVerifyBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  topVerifyBtnTxt: { color: WHITE, fontSize: 12, fontWeight: 'bold' },

  // IMPACT CARD
  impactCard: {
    backgroundColor: NAVY, borderRadius: 22, padding: 22, ...SHADOW,
  },
  impactEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: GREEN, letterSpacing: 1.5, marginBottom: 8,
  },
  impactAmt: { fontSize: 44, fontWeight: 'bold', color: WHITE, letterSpacing: -2, marginBottom: 4 },
  impactSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 0 },
  impactDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 20 },
  impactStats: { flexDirection: 'row', justifyContent: 'space-around' },
  impactStat: { alignItems: 'center' },
  impactStatVal: { fontSize: 22, fontWeight: 'bold', color: WHITE, marginBottom: 4 },
  impactStatLabel: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.4)', letterSpacing: 1,
  },
  impactStatDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.1)' },

  // LEVEL CARD
  levelCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  levelTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 14,
  },
  levelName: { fontSize: 18, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  levelNum: { fontSize: 13, fontWeight: 'bold', color: GREEN },
  levelBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  levelBadgeTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },
  levelTrack: { height: 8, backgroundColor: '#F3F4F6', borderRadius: 4, marginBottom: 8, overflow: 'hidden' },
  levelFill: { height: 8, backgroundColor: GREEN, borderRadius: 4 },
  levelNudge: { fontSize: 12, color: GRAY, marginBottom: 14 },
  levelMilestones: { flexDirection: 'row', gap: 8 },
  levelMilestoneDot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  levelMilestoneDotDone: { backgroundColor: GREEN, borderColor: GREEN },
  levelMilestoneTxt: { fontSize: 11, fontWeight: 'bold', color: GRAY },
  levelMilestoneTxtDone: { color: WHITE },

  // SECTION
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },
  sectionLink: { fontSize: 13, fontWeight: 'bold', color: GREEN },

  // WINS
  emptyWins: {
    backgroundColor: WHITE, borderRadius: 18, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  emptyWinsIcon: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyWinsIconTxt: { fontSize: 24, fontWeight: 'bold', color: GREEN },
  emptyWinsTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  emptyWinsSub: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  emptyWinsBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 11,
  },
  emptyWinsBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  winsCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  winRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  winLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  winIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  winIconTxt: { fontSize: 16, fontWeight: 'bold', color: GREEN },
  winDate: { fontSize: 9, fontWeight: 'bold', color: GREEN, letterSpacing: 0.8, marginBottom: 2 },
  winStore: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 1 },
  winItems: { fontSize: 11, color: GRAY },
  winRight: { alignItems: 'flex-end', gap: 4 },
  winSavedBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  winSavedTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },
  winYield: { fontSize: 11, color: GRAY },

  // CATEGORY SPENDING
  categoryCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  catLeft: { flex: 1 },
  catLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  catDot: { width: 8, height: 8, borderRadius: 4 },
  catName: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  catBarWrap: { height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 },
  catBarFill: { height: 4, borderRadius: 2 },
  catAmt: { fontSize: 13, fontWeight: 'bold', color: NAVY },

  // CHALLENGES
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  challengeRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  challengeInfo: { flex: 1 },
  challengeTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  challengeDesc: { fontSize: 12, color: GRAY, marginBottom: 8 },
  challengeTrack: { height: 4, backgroundColor: '#F3F4F6', borderRadius: 2, marginBottom: 4 },
  challengeFill: { height: 4, backgroundColor: GREEN, borderRadius: 2 },
  challengeProgress: { fontSize: 11, color: GRAY },
  challengePct: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  challengePctDone: { backgroundColor: GREEN, borderColor: GREEN },
  challengePctTxt: { fontSize: 11, fontWeight: 'bold', color: GRAY },
  challengePctTxtDone: { color: WHITE },

  // MISSION
  missionCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 20, ...SHADOW,
  },
  missionEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 6,
  },
  missionAmt: { fontSize: 22, fontWeight: 'bold', color: WHITE, marginBottom: 12 },
  missionOf: { fontSize: 14, fontWeight: 'normal', opacity: 0.6 },
  missionBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2, marginBottom: 8 },
  missionFill: { height: 4, backgroundColor: GREEN, borderRadius: 2 },
  missionSub: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 14 },
  missionBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 12, alignItems: 'center',
  },
  missionBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // ── FRESH START CELEBRATION ───────────────────────────────────────────────
  celebCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20,
    borderWidth: 1.5, borderColor: GREEN + '40',
    ...SHADOW, marginBottom: 4,
  },
  celebDismiss: {
    position: 'absolute', top: 14, right: 14,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  levelUpBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: AMBER, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 10,
  },
  levelUpBadgeTxt: { fontSize: 10, fontWeight: 'bold', color: WHITE, letterSpacing: 0.5 },
  celebTitle: {
    fontSize: 20, fontWeight: 'bold', color: NAVY,
    marginBottom: 6, marginRight: 32,
  },
  celebSub: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 16 },
  celebStats: {
    flexDirection: 'row', backgroundColor: PALE_GREEN,
    borderRadius: 14, padding: 14, marginBottom: 16,
  },
  celebStat: { flex: 1, alignItems: 'center' },
  celebStatVal: { fontSize: 20, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  celebStatLabel: { fontSize: 9, fontWeight: 'bold', color: GRAY, letterSpacing: 1 },
  celebStatDivider: { width: 1, backgroundColor: BORDER, marginVertical: 4 },
  celebPicks: { marginBottom: 14 },
  celebPicksLabel: {
    fontSize: 9, fontWeight: 'bold', color: GREEN,
    letterSpacing: 1.5, marginBottom: 10,
  },
  celebPickRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  celebPickDot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: GREEN, marginTop: 5,
  },
  celebPickTitle: { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 1 },
  celebPickReason: { fontSize: 12, color: GRAY, lineHeight: 17 },
  celebTip: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: PALE_GREEN, borderRadius: 10, padding: 12,
  },
  celebTipTxt: { flex: 1, fontSize: 12, color: NAVY, lineHeight: 18 },
});