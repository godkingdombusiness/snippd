import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { AuditLogger } from '../lib/auditLogger';

// ── Brand constants ────────────────────────────────────────────────────────────
const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const BORDER = '#F0F1F3';
const AMBER  = '#F59E0B';
const RED    = '#EF4444';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

// ── Category config ────────────────────────────────────────────────────────────
const CATEGORIES = [
  { key: 'protein',   label: 'Protein',   icon: '🥩', weight: 0.32 },
  { key: 'produce',   label: 'Produce',   icon: '🥦', weight: 0.16 },
  { key: 'dairy',     label: 'Dairy',     icon: '🥛', weight: 0.13 },
  { key: 'pantry',    label: 'Pantry',    icon: '🫙', weight: 0.11 },
  { key: 'snacks',    label: 'Snacks',    icon: '🍿', weight: 0.11 },
  { key: 'household', label: 'Household', icon: '🧹', weight: 0.17 },
];

const fmt = (cents) => '$' + (cents / 100).toFixed(2);
const fmtMonth = (d) => d.toLocaleString('default', { month: 'long', year: 'numeric' });

// bar color by spend ratio
function barColor(ratio) {
  if (ratio >= 1.0) return RED;
  if (ratio >= 0.80) return AMBER;
  return GREEN;
}

export default function BudgetDashboardScreen({ navigation }) {
  const [loading, setLoading]     = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [am, setAm]               = useState(false); // accessibility mode

  // Financial data
  const [stashCredits, setStashCredits]   = useState(0);
  const [monthlySpend, setMonthlySpend]   = useState(0);
  const [totalBudget, setTotalBudget]     = useState(0);
  const [budgetScore, setBudgetScore]     = useState(null);
  const [savingsMission, setSavingsMission] = useState({ earned: 0, goal: 5000 }); // cents
  const [categories, setCategories]       = useState([]);
  const [trendUp, setTrendUp]             = useState(false);
  const [monthLabel, setMonthLabel]       = useState('');
  const [dateRange, setDateRange]         = useState('month'); // 'week' | 'month'

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch profile: stash_credits, weekly_budget (user-set during onboarding), preferences
      const { data: profile } = await supabase
        .from('profiles')
        .select('stash_credits, weekly_budget, preferences')
        .eq('user_id', user.id)
        .single();

      setStashCredits(profile?.stash_credits || 0);
      setAm(profile?.preferences?.accessibility_mode === true);

      // weekly_budget is stored in cents in the profiles table (set during onboarding)
      const prefs = profile?.preferences || {};
      const weeklyBudgetCents = profile?.weekly_budget || 15000; // fallback $150
      const monthBudgetCents  = Math.round(weeklyBudgetCents * 4.33);
      const activeBudget      = dateRange === 'week' ? weeklyBudgetCents : monthBudgetCents;
      setTotalBudget(activeBudget);

      // Category budgets from preferences
      const prefCats = prefs.categories || [];

      // Date range: week or month
      const now   = new Date();
      let start, end, label;
      if (dateRange === 'week') {
        const dayOfWeek = now.getDay(); // 0=Sun
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        start = weekStart.toISOString();
        end   = now.toISOString();
        label = 'This Week';
      } else {
        start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        end   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        label = fmtMonth(now);
      }
      setMonthLabel(label);

      // Fetch household membership for savings
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // Savings Mission: aggregate save_cents from household cart items
      if (membership?.household_id) {
        const { data: cartItems } = await supabase
          .from('household_cart_items')
          .select('save_cents, quantity')
          .eq('household_id', membership.household_id)
          .eq('status', 'purchased');
        const totalSaved = (cartItems || []).reduce(
          (s, i) => s + (i.save_cents || 0) * (i.quantity || 1), 0
        );
        setSavingsMission({ earned: totalSaved, goal: 5000 });
      }

      // Fetch spend from receipt_summaries for the selected window
      const { data: receipts } = await supabase
        .from('receipt_summaries')
        .select('total_cents, created_at')
        .eq('user_id', user.id)
        .gte('created_at', start)
        .lte('created_at', end);

      const periodTotal = (receipts || []).reduce((s, r) => s + (r.total_cents || 0), 0);
      setMonthlySpend(periodTotal);

      // Previous period for trend comparison
      const prevStart = dateRange === 'week'
        ? new Date(new Date(start).getTime() - 7 * 86400_000).toISOString()
        : new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
      const prevEnd   = dateRange === 'week'
        ? start
        : new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();

      const { data: prevReceipts } = await supabase
        .from('receipt_summaries')
        .select('total_cents')
        .eq('user_id', user.id)
        .gte('created_at', prevStart)
        .lte('created_at', prevEnd);
      const prevTotal = (prevReceipts || []).reduce((s, r) => s + (r.total_cents || 0), 0);
      setTrendUp(periodTotal > prevTotal);

      // Budget score: (budget - spend) / budget, clamped 0–1
      const score = activeBudget > 0
        ? Math.max(0, Math.min(1, (activeBudget - periodTotal) / activeBudget))
        : null;
      setBudgetScore(score);

      // Build category rows
      const catRows = CATEGORIES.map(cat => {
        const prefCat   = prefCats.find(c => c.key === cat.key);
        const catBudget = prefCat?.budget_cents ?? Math.round(activeBudget * cat.weight);
        const catSpend  = Math.round(periodTotal * cat.weight);
        return {
          ...cat,
          budgetCents: catBudget,
          spendCents:  catSpend,
          ratio:       catBudget > 0 ? catSpend / catBudget : 0,
        };
      });
      setCategories(catRows);

      // Audit log
      AuditLogger.log('VIEW_DASHBOARD', { user_id: user.id, range: dateRange, label }).catch(() => {});
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [dateRange]);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const switchRange = (range) => {
    if (range === dateRange) return;
    setLoading(true);
    setDateRange(range);
  };

  const openCategory = (cat) => {
    navigation.navigate('CategoryInsight', { category: cat, am });
    AuditLogger.log('VIEW_INSIGHT', { category: cat.key }).catch(() => {});
  };

  // ── Header trend indicator ─────────────────────────────────────────────────
  const trendLabel = () => {
    if (budgetScore === null) return null;
    if (budgetScore >= 0.5) return { text: 'Savings Hero ✓', color: GREEN };
    if (monthlySpend === 0) return null;
    return { text: trendUp ? 'Higher than average ↑' : 'On track ↓', color: trendUp ? AMBER : GREEN };
  };

  // ── Budget Score display ───────────────────────────────────────────────────
  const scorePercent = budgetScore !== null ? Math.round(budgetScore * 100) : null;
  const scoreColor   = budgetScore !== null
    ? (budgetScore >= 0.5 ? GREEN : budgetScore >= 0.2 ? AMBER : RED)
    : GRAY;

  // ── Savings mission progress ───────────────────────────────────────────────
  const savingsRatio = Math.min(1, savingsMission.earned / savingsMission.goal);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  const trend = trendLabel();

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>Spending Intelligence</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        {/* ── Monthly Spend Summary ────────────────────────────────────── */}
        <View style={s.pad}>
          <View style={s.heroCard}>
            <Text style={s.heroEyebrow}>{monthLabel.toUpperCase()}</Text>
            <Text style={[s.heroAmount, am && s.amHeroAmount]}>
              {fmt(monthlySpend)}
            </Text>
            <Text style={[s.heroSub, am && s.amText]}>
              spent of {fmt(totalBudget)} monthly budget
            </Text>
            {trend && (
              <View style={[s.trendPill, { backgroundColor: trend.color + '22' }]}>
                <Text style={[s.trendPillTxt, { color: trend.color }]}>{trend.text}</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Score + Stash Credits row ────────────────────────────────── */}
        <View style={[s.pad, s.rowGap]}>
          {/* Budget Score */}
          <View style={[s.statCard, { flex: 1 }]}>
            <Text style={[s.statLabel, am && s.amText]}>Budget Score</Text>
            <Text style={[s.statValue, { color: scoreColor }, am && s.amStatValue]}>
              {scorePercent !== null ? `${scorePercent}` : '—'}
              {scorePercent !== null && <Text style={s.statUnit}>/100</Text>}
            </Text>
            <Text style={[s.statHint, am && s.amText]}>
              {scorePercent !== null
                ? scorePercent >= 50 ? 'Great job!' : 'Keep it up!'
                : 'No data yet'}
            </Text>
          </View>

          {/* Stash Credits */}
          <View style={[s.statCard, { flex: 1, backgroundColor: LIGHT_GREEN }]}>
            <Text style={[s.statLabel, { color: GREEN }, am && s.amText]}>Stash Credits</Text>
            <Text style={[s.statValue, { color: GREEN }, am && s.amStatValue]}>
              {stashCredits}
            </Text>
            <Text style={[s.statHint, { color: GREEN }, am && s.amText]}>available</Text>
          </View>
        </View>

        {/* ── Savings Mission ──────────────────────────────────────────── */}
        <View style={s.pad}>
          <View style={s.card}>
            <View style={s.missionHeader}>
              <Text style={[s.missionTitle, am && s.amText]}>Savings Mission</Text>
              <Text style={[s.missionAmt, am && s.amText]}>
                {fmt(savingsMission.earned)} / {fmt(savingsMission.goal)}
              </Text>
            </View>
            <View style={[s.progressTrack, am && s.amProgressTrack]}>
              <View style={[
                s.progressFill,
                { width: `${Math.round(savingsRatio * 100)}%` },
                am && s.amProgressFill,
              ]} />
            </View>
            <Text style={[s.missionSub, am && s.amText]}>
              Aggregate savings from household cart purchases
            </Text>
          </View>
        </View>

        {/* ── Category Spending Bars ───────────────────────────────────── */}
        <View style={s.pad}>
          <Text style={[s.sectionTitle, am && s.amSectionTitle]}>Category Breakdown</Text>
          <View style={s.card}>
            {categories.map((cat, i) => {
              const over     = cat.ratio >= 1.0;
              const nearing  = !over && cat.ratio >= 0.80;
              const bc       = barColor(cat.ratio);
              const isLast   = i === categories.length - 1;
              const fillPct  = Math.min(1, cat.ratio) * 100;

              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    s.catRowWrap,
                    isLast && s.catRowLast,
                    over && (am ? s.amOverRow : s.overRow),
                  ]}
                  onPress={() => openCategory(cat)}
                  activeOpacity={0.85}
                >
                  {/* Top: icon + label + badge/chevron */}
                  <View style={[s.catRow, am && s.amCatRow]}>
                    <View style={s.catLeft}>
                      <View style={[s.catIconWrap, { backgroundColor: bc + '18' }]}>
                        <Text style={[s.catIcon, am && s.amCatIcon]}>{cat.icon}</Text>
                      </View>
                      <View>
                        <Text style={[s.catLabel, am && s.amCatLabel]}>{cat.label}</Text>
                        <Text style={[s.catSpend, am && s.amText]}>
                          {fmt(cat.spendCents)}{' '}
                          <Text style={{ color: '#C4C9D6' }}>/ {fmt(cat.budgetCents)}</Text>
                        </Text>
                      </View>
                    </View>

                    <View style={s.catRight}>
                      {over ? (
                        am ? (
                          <View style={s.amOverBadge}>
                            <Text style={s.amOverBadgeTxt}>OVER BUDGET</Text>
                          </View>
                        ) : (
                          <View style={s.overBadge}>
                            <Text style={s.overBadgeTxt}>OVER</Text>
                          </View>
                        )
                      ) : nearing ? (
                        <View style={s.nearingBadge}>
                          <Text style={s.nearingBadgeTxt}>WATCH</Text>
                        </View>
                      ) : (
                        <Feather name="chevron-right" size={am ? 22 : 16} color={GRAY} />
                      )}
                    </View>
                  </View>

                  {/* Inline progress bar — anchored to its category row */}
                  <View style={[s.barTrack, am && s.amBarTrack]}>
                    <View
                      style={[
                        s.barFill,
                        { width: `${fillPct}%`, backgroundColor: bc, height: am ? 10 : 5 },
                      ]}
                    />
                    {over && (
                      <View style={[s.barOverflow, { backgroundColor: RED + '22', height: am ? 10 : 5 }]} />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Over-budget Price Drop Alert ─────────────────────────────── */}
        {categories.some(c => c.ratio >= 1.0) && (
          <View style={s.pad}>
            <View style={am ? s.amAlertCard : s.alertCard}>
              <View style={s.alertHeader}>
                <Feather name="alert-triangle" size={am ? 22 : 16} color={RED} />
                <Text style={[s.alertTitle, am && s.amAlertTitle]}>
                  Price Drop Alert Active
                </Text>
              </View>
              <Text style={[s.alertBody, am && s.amAlertBody]}>
                {categories.filter(c => c.ratio >= 1.0).map(c => c.label).join(', ')}
                {' '}
                {categories.filter(c => c.ratio >= 1.0).length === 1 ? 'is' : 'are'} over budget.
                Snippd is now prioritising price drop deals for these categories in your feed.
              </Text>
              <TouchableOpacity
                style={s.alertBtn}
                onPress={() => Alert.alert(
                  'Price Drop Alert',
                  'We\'ve activated price drop notifications for your over-budget categories. Check your Discover feed for the best deals at your preferred stores.',
                  [{ text: 'Got It' }]
                )}
              >
                <Text style={s.alertBtnTxt}>View Deals</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Date Range Selector ──────────────────────────────────────── */}
        <View style={[s.pad, s.rowGap]}>
          {[
            { key: 'week',   label: 'This Week' },
            { key: 'month',  label: 'This Month' },
          ].map(r => (
            <TouchableOpacity
              key={r.key}
              style={[s.rangeChip, dateRange === r.key && s.rangeChipOn]}
              onPress={() => switchRange(r.key)}
            >
              <Text style={[s.rangeChipTxt, dateRange === r.key && s.rangeChipOnTxt]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity
            style={s.rangeChip}
            onPress={() => Alert.alert('Custom Range', 'Custom date range coming soon.')}
          >
            <Text style={s.rangeChipTxt}>Custom</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Category bars are rendered inline; this builds a separate bar row ──────────
// (the bar rows are rendered inside the card above, after all category rows)

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: OFF_WHITE },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:       { paddingBottom: 40 },
  pad:          { paddingHorizontal: 16, marginTop: 16 },
  rowGap:       { flexDirection: 'row', gap: 12 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt:  { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },

  heroCard: {
    backgroundColor: NAVY, borderRadius: 20, padding: 22, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  heroAmount: {
    fontSize: 42, fontWeight: 'bold', color: WHITE,
    letterSpacing: -1.5, lineHeight: 48,
  },
  amHeroAmount: { fontSize: 52, lineHeight: 60 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4 },
  trendPill: {
    alignSelf: 'flex-start', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 12,
  },
  trendPillTxt: { fontSize: 12, fontWeight: 'bold' },

  statCard: {
    backgroundColor: WHITE, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  statLabel:  { fontSize: 11, color: GRAY, fontWeight: 'bold', letterSpacing: 0.5 },
  statValue:  { fontSize: 36, fontWeight: 'bold', color: NAVY, marginTop: 4, lineHeight: 40 },
  amStatValue:{ fontSize: 44, lineHeight: 50 },
  statUnit:   { fontSize: 16, fontWeight: 'normal' },
  statHint:   { fontSize: 11, color: GRAY, marginTop: 2 },

  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },

  missionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, paddingBottom: 8 },
  missionTitle:  { fontSize: 14, fontWeight: 'bold', color: NAVY },
  missionAmt:    { fontSize: 13, color: GRAY },
  progressTrack: {
    height: 8, backgroundColor: OFF_WHITE,
    marginHorizontal: 16, borderRadius: 4, overflow: 'hidden',
  },
  amProgressTrack: { height: 16, borderRadius: 8 },
  progressFill:    { height: '100%', backgroundColor: GREEN, borderRadius: 4 },
  amProgressFill:  { borderRadius: 8 },
  missionSub:      { fontSize: 11, color: GRAY, padding: 10, paddingTop: 8, paddingHorizontal: 16 },

  sectionTitle:   { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },
  amSectionTitle: { fontSize: 22 },

  catRowWrap: {
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  catRowLast: { borderBottomWidth: 0 },
  catRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 13, paddingBottom: 8,
  },
  amCatRow:  { paddingTop: 18, paddingBottom: 10 },
  overRow:   { backgroundColor: '#FFF5F5' },
  amOverRow: { backgroundColor: '#FFF5F5', borderLeftWidth: 4, borderLeftColor: RED },
  catLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  catIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  catIcon:   { fontSize: 18 },
  amCatIcon: { fontSize: 24 },
  catLabel:  { fontSize: 14, fontWeight: 'bold', color: NAVY },
  amCatLabel:{ fontSize: 18, fontWeight: 'bold', color: NAVY },
  catSpend:  { fontSize: 11, color: GRAY, marginTop: 1 },
  catRight:  { alignItems: 'flex-end' },

  overBadge: {
    backgroundColor: '#FEE2E2', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  overBadgeTxt:    { fontSize: 9, fontWeight: 'bold', color: RED, letterSpacing: 0.5 },
  amOverBadge:     { backgroundColor: RED, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  amOverBadgeTxt:  { fontSize: 13, fontWeight: 'bold', color: WHITE, letterSpacing: 0.5 },
  nearingBadge:    { backgroundColor: '#FEF3C7', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  nearingBadgeTxt: { fontSize: 9, fontWeight: 'bold', color: AMBER, letterSpacing: 0.5 },

  barTrack: {
    height: 5, backgroundColor: '#F0F1F3',
    marginHorizontal: 16, marginBottom: 8, borderRadius: 3,
    flexDirection: 'row', overflow: 'hidden',
  },
  amBarTrack: { height: 10, marginBottom: 12, borderRadius: 5 },
  barFill:     { borderRadius: 3 },
  barOverflow: { flex: 1 },

  alertCard: {
    backgroundColor: '#FFF5F5', borderRadius: 16,
    borderWidth: 1, borderColor: '#FECACA', padding: 16,
  },
  amAlertCard: {
    backgroundColor: '#FFF5F5', borderRadius: 16,
    borderWidth: 2, borderColor: RED, padding: 20,
  },
  alertHeader:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  alertTitle:   { fontSize: 14, fontWeight: 'bold', color: RED },
  amAlertTitle: { fontSize: 18 },
  alertBody:    { fontSize: 12, color: '#7F1D1D', lineHeight: 18, marginBottom: 12 },
  amAlertBody:  { fontSize: 15, lineHeight: 22 },
  alertBtn: {
    backgroundColor: RED, borderRadius: 10,
    paddingVertical: 10, alignItems: 'center',
  },
  alertBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  rangeChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12,
    backgroundColor: WHITE, alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  rangeChipOn:    { backgroundColor: NAVY, borderColor: NAVY },
  rangeChipTxt:   { fontSize: 11, color: GRAY, fontWeight: 'bold' },
  rangeChipOnTxt: { color: WHITE },

  // Accessibility mode text scale
  amText: { fontSize: 15 },
});
