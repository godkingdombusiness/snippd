import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert,
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

const fmt     = (cents) => '$' + (cents / 100).toFixed(2);
const MONTHS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function barColor(ratio) {
  if (ratio >= 1.0) return RED;
  if (ratio >= 0.80) return AMBER;
  return GREEN;
}

// Format a date string as "Saturday, April 4th"
function formatDateHeader(dateStr) {
  const d = new Date(dateStr);
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
  const day = d.getDate();
  const suffix = day === 1 || day === 21 || day === 31 ? 'st'
               : day === 2 || day === 22 ? 'nd'
               : day === 3 || day === 23 ? 'rd' : 'th';
  return `${dayNames[d.getDay()]}, ${monthNames[d.getMonth()]} ${day}${suffix}`;
}

export default function CategoryInsightScreen({ navigation, route }) {
  const { category, am = false } = route.params || {};

  const [loading, setLoading]       = useState(true);
  const [chartData, setChartData]   = useState([]); // [{month, spendCents, budgetCents}]
  const [transactions, setTransactions] = useState([]); // [{date, items}]
  const [totalTxCount, setTotalTxCount] = useState(0);
  const [avgPerTrip, setAvgPerTrip]     = useState(0);
  const [thisMonthSpend, setThisMonthSpend] = useState(0);
  const [budgetCents, setBudgetCents]       = useState(0);
  const [householdMode, setHouseholdMode]   = useState(false);

  const load = useCallback(async () => {
    if (!category) return;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const now = new Date();

      // Build 6-month windows
      const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return {
          label: MONTHS[d.getMonth()],
          start: d.toISOString(),
          end:   new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).toISOString(),
          month: d.getMonth(),
          year:  d.getFullYear(),
        };
      });

      // Fetch profile for budget
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .single();

      const prefs    = profile?.preferences || {};
      const wkBudget = prefs.weekly_budget_cents || 12500;
      const moBudget = Math.round(wkBudget * 4.33);
      const catBudget = Math.round(moBudget * (category.weight || 0.1));
      setBudgetCents(catBudget);

      // Fetch receipt_items for this category across 6 months
      const sixMonthsAgo = months[0].start;
      const { data: items } = await supabase
        .from('receipt_items')
        .select('name, amount_cents, purchased_at, store_name, verified_by_username, receipt_id')
        .eq('user_id', user.id)
        .eq('category', category.key)
        .gte('purchased_at', sixMonthsAgo)
        .order('purchased_at', { ascending: false });

      const allItems = items || [];

      // Build 6-month chart data
      const chart = months.map(m => {
        const monthItems = allItems.filter(i => {
          const d = new Date(i.purchased_at);
          return d.getMonth() === m.month && d.getFullYear() === m.year;
        });
        const spendCents = monthItems.reduce((s, i) => s + (i.amount_cents || 0), 0);
        return { label: m.label, spendCents, budgetCents: catBudget };
      });
      setChartData(chart);

      // This month stats
      const thisMonth = chart[chart.length - 1];
      setThisMonthSpend(thisMonth.spendCents);

      // Transaction list: group by date for this month
      const thisMonthStart = months[months.length - 1].start;
      const thisMonthItems = allItems.filter(i => i.purchased_at >= thisMonthStart);
      const grouped = {};
      thisMonthItems.forEach(i => {
        const dateKey = i.purchased_at.split('T')[0];
        if (!grouped[dateKey]) grouped[dateKey] = [];
        grouped[dateKey].push(i);
      });
      const txList = Object.entries(grouped)
        .sort(([a], [b]) => b.localeCompare(a))
        .map(([date, txItems]) => ({ date, items: txItems }));
      setTransactions(txList);

      // Stats
      const tripCount = new Set(thisMonthItems.map(i => i.receipt_id)).size;
      setTotalTxCount(thisMonthItems.length);
      setAvgPerTrip(tripCount > 0 ? Math.round(thisMonth.spendCents / tripCount) : 0);

      // Check household membership for attribution mode
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .maybeSingle();
      setHouseholdMode(!!membership?.household_id);

      // Audit log: view_insight
      AuditLogger.log('VIEW_INSIGHT', {
        category: category.key,
        month: months[months.length - 1].label,
        spend_cents: thisMonth.spendCents,
        budget_cents: catBudget,
      }).catch(() => {});
    } catch (_) {
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  const isOver = budgetCents > 0 && thisMonthSpend > budgetCents;
  const isUnder = !isOver && thisMonthSpend < budgetCents * 0.75;

  // ── Chart max value for scaling bars ──────────────────────────────────────
  const maxSpend = Math.max(...chartData.map(d => d.spendCents), budgetCents, 1);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Text style={s.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>
          {category?.icon}  {category?.label}
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >
        {/* ── Month summary ────────────────────────────────────────────── */}
        <View style={s.pad}>
          <View style={[s.summaryCard, isOver && s.summaryCardOver]}>
            <Text style={[s.summaryLabel, am && s.amText]}>This Month</Text>
            <Text style={[s.summaryAmount, am && s.amSummaryAmount, { color: barColor(budgetCents > 0 ? thisMonthSpend / budgetCents : 0) }]}>
              {fmt(thisMonthSpend)}
            </Text>
            <Text style={[s.summaryBudget, am && s.amText]}>of {fmt(budgetCents)} budget</Text>

            <View style={s.statsRow}>
              <View style={s.statItem}>
                <Text style={[s.statVal, am && s.amText]}>{totalTxCount}</Text>
                <Text style={[s.statLbl, am && s.amText]}>items</Text>
              </View>
              <View style={s.statDivider} />
              <View style={s.statItem}>
                <Text style={[s.statVal, am && s.amText]}>{fmt(avgPerTrip)}</Text>
                <Text style={[s.statLbl, am && s.amText]}>avg/trip</Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── 6-Month Bar Chart ────────────────────────────────────────── */}
        <View style={s.pad}>
          <Text style={[s.sectionTitle, am && s.amSectionTitle]}>6-Month History</Text>
          <View style={s.chartCard}>
            {/* Budget reference line label */}
            <Text style={s.chartBudgetLabel}>Budget: {fmt(budgetCents)}</Text>
            <View style={s.chartBars}>
              {chartData.map((d, i) => {
                const ratio  = maxSpend > 0 ? d.spendCents / maxSpend : 0;
                const bc     = barColor(budgetCents > 0 ? d.spendCents / budgetCents : 0);
                const isThis = i === chartData.length - 1;
                const barH   = am ? Math.round(ratio * 110) : Math.round(ratio * 80);

                return (
                  <View key={d.label} style={s.chartBarCol}>
                    {/* Amount label */}
                    <Text style={[s.chartBarAmt, am && s.amChartAmt, { color: bc }]}>
                      {d.spendCents > 0 ? fmt(d.spendCents) : '—'}
                    </Text>
                    {/* Bar */}
                    <View style={[s.chartBarTrack, am && s.amChartBarTrack]}>
                      <View
                        style={[
                          s.chartBarFill,
                          { height: barH, backgroundColor: bc },
                          isThis && s.chartBarThisMonth,
                        ]}
                      />
                    </View>
                    {/* Month label */}
                    <Text style={[s.chartMonthLabel, isThis && s.chartMonthLabelThis, am && s.amChartMonth]}>
                      {d.label}
                    </Text>
                  </View>
                );
              })}
            </View>
          </View>
        </View>

        {/* ── Transaction list (this month) ────────────────────────────── */}
        {transactions.length > 0 && (
          <View style={s.pad}>
            <Text style={[s.sectionTitle, am && s.amSectionTitle]}>This Month's Items</Text>
            <View style={s.card}>
              {transactions.map((group, gi) => (
                <View key={group.date}>
                  {/* Date header */}
                  <View style={s.dateHeader}>
                    <Text style={[s.dateHeaderTxt, am && s.amText]}>
                      {formatDateHeader(group.date)}
                    </Text>
                  </View>
                  {/* Items */}
                  {group.items.map((item, ii) => (
                    <View
                      key={`${gi}-${ii}`}
                      style={[
                        s.txRow,
                        ii === group.items.length - 1 && gi === transactions.length - 1 && { borderBottomWidth: 0 },
                      ]}
                    >
                      <View style={s.txLeft}>
                        {/* Merchant icon: first letter of store in colored circle */}
                        <View style={[s.storeDot, { backgroundColor: category?.color ?? LIGHT_GREEN }]}>
                          <Text style={s.storeDotTxt}>
                            {(item.store_name || '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.txName, am && s.amText]} numberOfLines={1}>
                            {item.name}
                          </Text>
                          <View style={s.txMetaRow}>
                            <Text style={[s.txMeta, am && s.amText]} numberOfLines={1}>
                              {item.store_name || 'Unknown store'}
                            </Text>
                            {/* Household attribution: show verifier avatar + name */}
                            {householdMode && item.verified_by_username ? (
                              <View style={s.verifiedPill}>
                                <View style={s.verifiedAvatar}>
                                  <Text style={s.verifiedAvatarTxt}>
                                    {item.verified_by_username.charAt(0).toUpperCase()}
                                  </Text>
                                </View>
                                <Text style={s.verifiedTxt}>@{item.verified_by_username}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      </View>
                      <Text style={[s.txAmt, am && s.amText]}>{fmt(item.amount_cents || 0)}</Text>
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Recommendation Card ──────────────────────────────────────── */}
        <View style={s.pad}>
          {isOver ? (
            <View style={[s.recCard, s.recCardOver, am && s.amRecCard]}>
              <View style={s.recHeader}>
                <Feather name="trending-down" size={am ? 22 : 18} color={RED} />
                <Text style={[s.recTitle, { color: RED }, am && s.amRecTitle]}>
                  Save on {category?.label}
                </Text>
              </View>
              <Text style={[s.recBody, am && s.amRecBody]}>
                You've spent {fmt(thisMonthSpend - budgetCents)} over your {category?.label.toLowerCase()} budget this month. Swapping to store-brand options at Walmart Supercenter could save you up to 20% per trip.
              </Text>
              <View style={s.recTip}>
                <Feather name="tag" size={12} color={AMBER} />
                <Text style={[s.recTipTxt, am && s.amText]}>
                  Snippd Deal badges on {category?.label.toLowerCase()} items in Discover are prioritised for you now.
                </Text>
              </View>
              <TouchableOpacity
                style={s.recActionBtn}
                onPress={() => navigation.navigate('DiscoverTab')}
                activeOpacity={0.88}
              >
                <Text style={s.recActionTxt}>See Price Drop Deals</Text>
              </TouchableOpacity>
            </View>
          ) : isUnder ? (
            <View style={[s.recCard, s.recCardUnder, am && s.amRecCard]}>
              <View style={s.recHeader}>
                <Feather name="award" size={am ? 22 : 18} color={GREEN} />
                <Text style={[s.recTitle, { color: GREEN }, am && s.amRecTitle]}>
                  You're crushing it!
                </Text>
              </View>
              <Text style={[s.recBody, am && s.amRecBody]}>
                You're {fmt(budgetCents - thisMonthSpend)} under your {category?.label.toLowerCase()} budget. Keep this up and bank the surplus into your Stash Credits.
              </Text>
              <View style={s.recTip}>
                <Feather name="zap" size={12} color={GREEN} />
                <Text style={[s.recTipTxt, am && s.amText]}>
                  Every dollar under budget counts toward your Savings Mission.
                </Text>
              </View>
              <TouchableOpacity
                style={[s.recActionBtn, { backgroundColor: GREEN }]}
                onPress={() =>
                  Alert.alert(
                    'Bank the Savings',
                    `You're ${fmt(budgetCents - thisMonthSpend)} under budget on ${category?.label}. Snippd is already crediting this surplus to your Savings Mission automatically!`,
                    [{ text: 'Awesome!' }]
                  )
                }
                activeOpacity={0.88}
              >
                <Text style={s.recActionTxt}>Bank the Savings</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={[s.recCard, am && s.amRecCard]}>
              <View style={s.recHeader}>
                <Feather name="check-circle" size={am ? 22 : 18} color={GREEN} />
                <Text style={[s.recTitle, { color: NAVY }, am && s.amRecTitle]}>
                  On track
                </Text>
              </View>
              <Text style={[s.recBody, am && s.amRecBody]}>
                Your {category?.label.toLowerCase()} spending is right on track. Keep it up and you'll finish under budget!
              </Text>
            </View>
          )}
        </View>

        {/* ── Got It button ────────────────────────────────────────────── */}
        <View style={[s.pad, { marginTop: 8 }]}>
          <TouchableOpacity
            style={[s.gotItBtn, am && s.amGotItBtn]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.88}
          >
            <Text style={[s.gotItTxt, am && s.amGotItTxt]}>Got It</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:    { paddingBottom: 40 },
  pad:       { paddingHorizontal: 16, marginTop: 16 },

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

  summaryCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  summaryCardOver: { backgroundColor: '#FFF5F5', borderColor: '#FECACA' },
  summaryLabel:    { fontSize: 11, color: GRAY, fontWeight: 'bold', letterSpacing: 0.5 },
  summaryAmount:   { fontSize: 42, fontWeight: 'bold', letterSpacing: -1.5, lineHeight: 48, marginTop: 2 },
  amSummaryAmount: { fontSize: 52, lineHeight: 60 },
  summaryBudget:   { fontSize: 13, color: GRAY, marginTop: 2, marginBottom: 14 },
  statsRow:        { flexDirection: 'row', alignItems: 'center' },
  statItem:        { alignItems: 'center', flex: 1 },
  statVal:         { fontSize: 18, fontWeight: 'bold', color: NAVY },
  statLbl:         { fontSize: 10, color: GRAY, marginTop: 2 },
  statDivider:     { width: 1, height: 28, backgroundColor: BORDER },

  sectionTitle:   { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },
  amSectionTitle: { fontSize: 22 },

  chartCard: {
    backgroundColor: WHITE, borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  chartBudgetLabel: { fontSize: 10, color: GRAY, marginBottom: 8, fontWeight: 'bold' },
  chartBars:        { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 130 },
  chartBarCol:      { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  chartBarAmt:      { fontSize: 9, fontWeight: 'bold', marginBottom: 4, textAlign: 'center' },
  amChartAmt:       { fontSize: 11 },
  chartBarTrack:    { width: 28, backgroundColor: OFF_WHITE, borderRadius: 6, overflow: 'hidden', justifyContent: 'flex-end' },
  amChartBarTrack:  { width: 36 },
  chartBarFill:     { width: '100%', borderRadius: 6, minHeight: 3 },
  chartBarThisMonth:{ opacity: 1 },
  chartMonthLabel:       { fontSize: 9, color: GRAY, marginTop: 6, fontWeight: 'bold' },
  chartMonthLabelThis:   { color: NAVY },
  amChartMonth:          { fontSize: 11 },

  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  dateHeader:    { backgroundColor: OFF_WHITE, paddingHorizontal: 14, paddingVertical: 7 },
  dateHeaderTxt: { fontSize: 11, color: GRAY, fontWeight: 'bold', letterSpacing: 0.3 },
  txRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  txLeft:    { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  storeDot:  {
    width: 36, height: 36, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  storeDotTxt: { fontSize: 15, fontWeight: 'bold', color: GREEN },
  txName:    { fontSize: 13, fontWeight: 'bold', color: NAVY },
  txMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 2 },
  txMeta:    { fontSize: 10, color: GRAY },
  txAmt:     { fontSize: 13, fontWeight: 'bold', color: NAVY, flexShrink: 0 },

  // Household attribution pill
  verifiedPill:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  verifiedAvatar: {
    width: 14, height: 14, borderRadius: 7, backgroundColor: NAVY,
    alignItems: 'center', justifyContent: 'center',
  },
  verifiedAvatarTxt: { fontSize: 8, fontWeight: 'bold', color: WHITE },
  verifiedTxt:       { fontSize: 9, color: GRAY },

  recCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER, padding: 16, ...SHADOW,
  },
  recCardOver:  { backgroundColor: '#FFF5F5', borderColor: '#FECACA' },
  recCardUnder: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  amRecCard:    { padding: 20, borderWidth: 2 },
  recHeader:    { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  recTitle:     { fontSize: 15, fontWeight: 'bold' },
  amRecTitle:   { fontSize: 19 },
  recBody:      { fontSize: 13, color: NAVY, lineHeight: 20, marginBottom: 10 },
  amRecBody:    { fontSize: 16, lineHeight: 24 },
  recTip:       { flexDirection: 'row', alignItems: 'flex-start', gap: 6, backgroundColor: OFF_WHITE, borderRadius: 8, padding: 10, marginBottom: 12 },
  recTipTxt:    { flex: 1, fontSize: 11, color: GRAY, lineHeight: 16 },
  recActionBtn: {
    backgroundColor: NAVY, borderRadius: 10,
    paddingVertical: 11, alignItems: 'center',
  },
  recActionTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  gotItBtn: {
    backgroundColor: NAVY, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: NAVY,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
  },
  amGotItBtn:  { paddingVertical: 20, borderRadius: 18 },
  gotItTxt:    { color: WHITE, fontSize: 16, fontWeight: 'bold' },
  amGotItTxt:  { fontSize: 20 },

  amText: { fontSize: 15 },
});
