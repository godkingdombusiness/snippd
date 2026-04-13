import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
  Dimensions, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { AuditLogger } from '../lib/auditLogger';

const { width } = Dimensions.get('window');
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

const SHADOW_SM = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const BUDGET_OPTIONS = [
  { key: '50_100',  label: '$50 to $100',  sub: 'Tight and strategic', val: 7500 },
  { key: '100_150', label: '$100 to $150', sub: 'Balanced approach',   val: 12500 },
  { key: '150_200', label: '$150 to $200', sub: 'Room to breathe',     val: 17500 },
  { key: '200_plus', label: '$200 plus',  sub: 'Flexible budget',      val: 25000 },
  { key: 'custom',  label: 'Custom',       sub: 'Enter your own amount', val: 0 },
];

// Category split weights (sum = 1.0) — used for auto-scaling
const CAT_WEIGHTS = {
  protein:   0.32,
  produce:   0.16,
  dairy:     0.13,
  pantry:    0.11,
  snacks:    0.11,
  household: 0.17,
};

const CATEGORY_BUDGETS = [
  { key: 'protein',   label: 'Protein and Meat',       defaultCents: 6000 },
  { key: 'produce',   label: 'Produce',                defaultCents: 3000 },
  { key: 'dairy',     label: 'Dairy and Eggs',         defaultCents: 2500 },
  { key: 'pantry',    label: 'Pantry and Dry Goods',   defaultCents: 2000 },
  { key: 'snacks',    label: 'Snacks and Beverages',   defaultCents: 2000 },
  { key: 'household', label: 'Household and Cleaning', defaultCents: 3000 },
];

const SAVINGS_GOAL_OPTIONS = [
  { key: '100', label: '$100', sub: 'per month', val: 10000 },
  { key: '200', label: '$200', sub: 'per month', val: 20000 },
  { key: '500', label: '$500', sub: 'per month', val: 50000 },
  { key: 'custom', label: 'Custom', sub: 'set your own', val: 0 },
];

const getBudgetKey = (cents) => {
  if (cents <= 7500) return '50_100';
  if (cents <= 12500) return '100_150';
  if (cents <= 17500) return '150_200';
  if (cents <= 30000) return '200_plus';
  return 'custom';
};

export default function BudgetPreferencesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userId, setUserId] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Weekly budget
  const [weeklyBudgetKey, setWeeklyBudgetKey] = useState('100_150');
  const [originalBudgetKey, setOriginalBudgetKey] = useState('100_150');
  const [customBudget, setCustomBudget] = useState('');
  const [showCustomBudget, setShowCustomBudget] = useState(false);
  const [householdSize, setHouseholdSize] = useState(1);

  // Monthly savings goal
  const [savingsGoalKey, setSavingsGoalKey] = useState('200');
  const [customGoal, setCustomGoal] = useState('');
  const [showCustomGoal, setShowCustomGoal] = useState(false);

  // Category budgets — stored as dollars (string) for input
  const [categoryBudgets, setCategoryBudgets] = useState(
    Object.fromEntries(CATEGORY_BUDGETS.map(c => [c.key, String(c.defaultCents / 100)]))
  );
  const [originalCategoryBudgets, setOriginalCategoryBudgets] = useState({});

  // Computed values
  const weeklyBudgetCents = weeklyBudgetKey === 'custom'
    ? Math.round((parseFloat(customBudget) || 0) * 100)
    : (BUDGET_OPTIONS.find(b => b.key === weeklyBudgetKey)?.val || 12500);
  const categoryTotal = Object.values(categoryBudgets).reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const categoryTotalCents = Math.round(categoryTotal * 100);
  const isOverBudget = categoryTotalCents > weeklyBudgetCents && weeklyBudgetCents > 0;

  // Auto-scale category budgets when a new weekly total is selected
  const selectBudgetKey = (key) => {
    setWeeklyBudgetKey(key);
    setShowCustomBudget(key === 'custom');

    const opt = BUDGET_OPTIONS.find(b => b.key === key);
    if (!opt || key === 'custom') return;

    // Scale each category by its weight × household size multiplier
    const sizeMult = Math.max(1, householdSize) / 2; // base = 2-person household
    const scaled = Object.fromEntries(
      CATEGORY_BUDGETS.map(c => [
        c.key,
        String(((opt.val * (CAT_WEIGHTS[c.key] || 0.1)) * Math.min(sizeMult, 3) / 100).toFixed(2)),
      ])
    );
    setCategoryBudgets(scaled);
  };

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('profiles')
        .select('weekly_budget, preferences, household_size')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const hhSize = data.household_size || data.preferences?.household_size || 1;
        setHouseholdSize(hhSize);

        const savedBudget = data.weekly_budget || 12500;
        const budgetKey = getBudgetKey(savedBudget);
        setWeeklyBudgetKey(budgetKey);
        setOriginalBudgetKey(budgetKey);

        // If it was a custom value, populate the custom input
        if (budgetKey === 'custom') {
          setCustomBudget(String(savedBudget / 100));
          setShowCustomBudget(true);
        }

        const savedCategories = data.preferences?.category_budgets;
        if (savedCategories) {
          const loaded = Object.fromEntries(
            CATEGORY_BUDGETS.map(c => [
              c.key,
              String((savedCategories[c.key] || c.defaultCents) / 100),
            ])
          );
          setCategoryBudgets(loaded);
          setOriginalCategoryBudgets(loaded);
        } else {
          const defaults = Object.fromEntries(
            CATEGORY_BUDGETS.map(c => [c.key, String(c.defaultCents / 100)])
          );
          setOriginalCategoryBudgets(defaults);
        }

        const goalCents = data.preferences?.monthly_savings_goal;
        if (goalCents) {
          const goalDollars = goalCents / 100;
          const match = SAVINGS_GOAL_OPTIONS.find(o => o.val === goalCents && o.key !== 'custom');
          if (match) {
            setSavingsGoalKey(match.key);
          } else {
            setSavingsGoalKey('custom');
            setCustomGoal(String(goalDollars));
            setShowCustomGoal(true);
          }
        }
      }
    } catch (e) {
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPreferences(); }, []);

  // Detect changes
  useEffect(() => {
    const budgetChanged = weeklyBudgetKey !== originalBudgetKey;
    const catsChanged = JSON.stringify(categoryBudgets) !== JSON.stringify(originalCategoryBudgets);
    setHasChanges(budgetChanged || catsChanged);
  }, [weeklyBudgetKey, categoryBudgets, originalBudgetKey, originalCategoryBudgets]);

  const onRefresh = () => { setRefreshing(true); fetchPreferences(); };

  const updateCategoryBudget = (key, val) => {
    // Only allow numbers and single decimal point
    const clean = val.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
    setCategoryBudgets(prev => ({ ...prev, [key]: clean }));
  };

  const save = async () => {
    if (!hasChanges) {
      Alert.alert('No Changes', 'You have not made any changes to save.');
      return;
    }

    setSaving(true);
    try {
      // Resolve final weekly budget (custom or preset)
      const weeklyBudgetCentsToSave = weeklyBudgetKey === 'custom'
        ? Math.round((parseFloat(customBudget) || 0) * 100)
        : (BUDGET_OPTIONS.find(b => b.key === weeklyBudgetKey)?.val || 12500);

      if (weeklyBudgetCentsToSave <= 0) {
        Alert.alert('Invalid Budget', 'Please enter a budget greater than $0.');
        setSaving(false);
        return;
      }

      // Category budgets in cents
      const categoryBudgetsCents = Object.fromEntries(
        CATEGORY_BUDGETS.map(c => [
          c.key,
          Math.round((parseFloat(categoryBudgets[c.key]) || 0) * 100),
        ])
      );

      // Monthly goal in cents
      let monthlyGoalCents = 20000;
      if (savingsGoalKey === 'custom') {
        monthlyGoalCents = Math.round((parseFloat(customGoal) || 0) * 100);
      } else {
        const goalOpt = SAVINGS_GOAL_OPTIONS.find(o => o.key === savingsGoalKey);
        monthlyGoalCents = goalOpt?.val || 20000;
      }

      // Fetch existing preferences to merge
      const { data: existing } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', userId)
        .single();

      const { error } = await supabase
        .from('profiles')
        .update({
          weekly_budget: weeklyBudgetCentsToSave,
          preferences: {
            ...(existing?.preferences || {}),
            category_budgets: categoryBudgetsCents,
            monthly_savings_goal: monthlyGoalCents,
          },
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) throw error;

      // Audit log — triggers AI learning for future deal prioritization
      await AuditLogger.log(AuditLogger.events.BUDGET_UPDATE, {
        table:               'profiles',
        weekly_budget_cents: weeklyBudgetCentsToSave,
        category_budgets:    categoryBudgetsCents,
        household_size:      householdSize,
        budget_key:          weeklyBudgetKey,
      });

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        tracker.trackPreferenceChanged({
          user_id: session.user.id,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'BudgetPreferencesScreen',
          preference_key: 'budget_preferences',
          changed_fields: {
            weekly_budget: weeklyBudgetCentsToSave,
            category_budgets: categoryBudgetsCents,
            monthly_savings_goal: monthlyGoalCents,
          },
        });
      }

      setOriginalBudgetKey(weeklyBudgetKey);
      setOriginalCategoryBudgets({ ...categoryBudgets });
      setHasChanges(false);

      Alert.alert(
        'Budget Saved',
        `Your weekly budget of ${fmt(weeklyBudgetCentsToSave)} has been updated. Snippd will alert you when you are getting close.`,
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save your budget. Please try again.');
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

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Budget Preferences</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!hasChanges || saving}
        >
          {saving
            ? <ActivityIndicator color={WHITE} size="small" />
            : <Text style={styles.saveBtnTxt}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
          }
        >

          {/* ── HERO ───────────────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>BUDGET CONTROL</Text>
              <Text style={styles.heroTitle}>
                {fmt(weeklyBudgetCents)}
                <Text style={styles.heroTitleSub}> / week</Text>
              </Text>
              <Text style={styles.heroSub}>
                Snippd will alert you when you are approaching your limit
              </Text>
              <View style={styles.heroBudgetBar}>
                <View style={[styles.heroBudgetFill, {
                  width: `${Math.min((categoryTotalCents / weeklyBudgetCents) * 100, 100)}%`,
                  backgroundColor: isOverBudget ? RED : WHITE,
                }]} />
              </View>
              <View style={styles.heroBarLabels}>
                <Text style={styles.heroBarLabel}>
                  {fmt(categoryTotalCents)} allocated
                </Text>
                <Text style={[styles.heroBarLabel, isOverBudget && { color: '#FEF2F2' }]}>
                  {isOverBudget ? 'OVER BUDGET' : `${fmt(weeklyBudgetCents - categoryTotalCents)} unallocated`}
                </Text>
              </View>
            </View>
          </View>

          {/* ── WEEKLY BUDGET ──────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Weekly Grocery Budget</Text>
            <Text style={styles.sectionSub}>
              Set a realistic weekly target. Snippd tracks your spending across all stacks.
            </Text>
            <View style={styles.card}>
              {BUDGET_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optRow,
                    weeklyBudgetKey === opt.key && styles.optRowOn,
                    i === BUDGET_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => selectBudgetKey(opt.key)}
                  activeOpacity={0.8}
                >
                  <View style={styles.optLeft}>
                    <Text style={[
                      styles.optLabel,
                      weeklyBudgetKey === opt.key && styles.optLabelOn,
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optSub}>{opt.sub}</Text>
                  </View>
                  <View style={[styles.radio, weeklyBudgetKey === opt.key && styles.radioOn]}>
                    {weeklyBudgetKey === opt.key && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Custom weekly budget input */}
          {showCustomBudget && (
            <View style={[styles.pad, { marginTop: 0 }]}>
              <View style={styles.customGoalWrap}>
                <Text style={styles.customGoalLabel}>Custom weekly budget</Text>
                <View style={styles.customGoalInputRow}>
                  <Text style={styles.customGoalDollar}>$</Text>
                  <TextInput
                    style={styles.customGoalInput}
                    value={customBudget}
                    onChangeText={v => setCustomBudget(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#C4C9D6"
                    keyboardType="numeric"
                    autoFocus
                  />
                  <Text style={styles.customGoalPeriod}>per week</Text>
                </View>
              </View>
            </View>
          )}

          {/* ── MONTHLY SAVINGS GOAL ───────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Monthly Savings Goal</Text>
            <Text style={styles.sectionSub}>
              How much do you want to save per month? Snippd tracks your progress.
            </Text>
            <View style={styles.card}>
              {SAVINGS_GOAL_OPTIONS.map((opt, i) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.optRow,
                    savingsGoalKey === opt.key && styles.optRowOn,
                    i === SAVINGS_GOAL_OPTIONS.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => {
                    setSavingsGoalKey(opt.key);
                    setShowCustomGoal(opt.key === 'custom');
                  }}
                  activeOpacity={0.8}
                >
                  <View style={styles.optLeft}>
                    <Text style={[
                      styles.optLabel,
                      savingsGoalKey === opt.key && styles.optLabelOn,
                    ]}>
                      {opt.label}
                    </Text>
                    <Text style={styles.optSub}>{opt.sub}</Text>
                  </View>
                  <View style={[styles.radio, savingsGoalKey === opt.key && styles.radioOn]}>
                    {savingsGoalKey === opt.key && <View style={styles.radioDot} />}
                  </View>
                </TouchableOpacity>
              ))}
            </View>

            {/* Custom goal input */}
            {showCustomGoal && (
              <View style={styles.customGoalWrap}>
                <Text style={styles.customGoalLabel}>Custom monthly goal</Text>
                <View style={styles.customGoalInputRow}>
                  <Text style={styles.customGoalDollar}>$</Text>
                  <TextInput
                    style={styles.customGoalInput}
                    value={customGoal}
                    onChangeText={v => setCustomGoal(v.replace(/[^0-9.]/g, ''))}
                    placeholder="0"
                    placeholderTextColor="#C4C9D6"
                    keyboardType="numeric"
                    autoFocus
                  />
                  <Text style={styles.customGoalPeriod}>per month</Text>
                </View>
              </View>
            )}
          </View>

          {/* ── CATEGORY BUDGETS ───────────────────────────────────────────── */}
          <View style={styles.pad}>
            <View style={styles.sectionHead}>
              <View>
                <Text style={styles.sectionTitle}>Category Budgets</Text>
                <Text style={styles.sectionSub}>Weekly allocation per category</Text>
              </View>
              {isOverBudget && (
                <View style={styles.overBudgetBadge}>
                  <Text style={styles.overBudgetTxt}>OVER</Text>
                </View>
              )}
            </View>

            <View style={styles.card}>
              {CATEGORY_BUDGETS.map((cat, i) => {
                const dollarVal = parseFloat(categoryBudgets[cat.key]) || 0;
                const cents = Math.round(dollarVal * 100);
                const pct = weeklyBudgetCents > 0
                  ? Math.min((cents / weeklyBudgetCents) * 100, 100)
                  : 0;
                const isOver = cents > cat.defaultCents * 1.5;

                return (
                  <View
                    key={cat.key}
                    style={[
                      styles.catRow,
                      i === CATEGORY_BUDGETS.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={styles.catLeft}>
                      <View style={styles.catLabelRow}>
                        <Text style={styles.catLabel}>{cat.label}</Text>
                      </View>
                      <View style={styles.catBarWrap}>
                        <View style={[
                          styles.catBarFill,
                          {
                            width: `${pct}%`,
                            backgroundColor: isOver ? AMBER : GREEN,
                          },
                        ]} />
                      </View>
                    </View>
                    <View style={styles.catInputWrap}>
                      <Text style={styles.catInputDollar}>$</Text>
                      <TextInput
                        style={styles.catInput}
                        value={categoryBudgets[cat.key]}
                        onChangeText={v => updateCategoryBudget(cat.key, v)}
                        keyboardType="numeric"
                        placeholder="0"
                        placeholderTextColor="#C4C9D6"
                        selectTextOnFocus
                      />
                    </View>
                  </View>
                );
              })}

              {/* Total row */}
              <View style={[styles.catRow, styles.catTotalRow]}>
                <Text style={styles.catTotalLabel}>Total Allocated</Text>
                <Text style={[
                  styles.catTotalVal,
                  isOverBudget && { color: RED },
                ]}>
                  {fmt(categoryTotalCents)}
                </Text>
              </View>
            </View>

            {isOverBudget && (
              <View style={styles.overBudgetNote}>
                <View style={styles.overBudgetNoteDot} />
                <Text style={styles.overBudgetNoteText}>
                  Your category totals exceed your weekly budget by {fmt(categoryTotalCents - weeklyBudgetCents)}. Consider adjusting individual categories.
                </Text>
              </View>
            )}
          </View>

          {/* ── ALERT SETTINGS ─────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Budget Alerts</Text>
            <View style={styles.alertsCard}>
              {[
                { pct: 75, label: '75% of budget', desc: 'Early warning when spending picks up' },
                { pct: 90, label: '90% of budget', desc: 'Final warning before you hit your limit' },
                { pct: 100, label: 'Budget reached', desc: 'Alert when you hit your weekly limit' },
              ].map((alert, i, arr) => (
                <View
                  key={alert.pct}
                  style={[
                    styles.alertRow,
                    i === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.alertLeft}>
                    <View style={styles.alertPctBadge}>
                      <Text style={styles.alertPctTxt}>{alert.pct}%</Text>
                    </View>
                    <View>
                      <Text style={styles.alertLabel}>{alert.label}</Text>
                      <Text style={styles.alertDesc}>{alert.desc}</Text>
                    </View>
                  </View>
                  <View style={styles.alertCheckOn}>
                    <Text style={styles.alertCheckTxt}>✓</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* ── SAVE BUTTON ─────────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <TouchableOpacity
              style={[styles.saveBtnLarge, (!hasChanges || saving) && styles.saveBtnLargeDisabled]}
              onPress={save}
              disabled={!hasChanges || saving}
            >
              {saving
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.saveBtnLargeTxt}>
                    {hasChanges ? 'Save Budget Preferences' : 'No Changes to Save'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  saveBtn: {
    backgroundColor: GREEN, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    minWidth: 60, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#C4C9D6' },
  saveBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // HERO
  hero: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  heroTitle: {
    fontSize: 36, fontWeight: 'bold', color: WHITE,
    letterSpacing: -1, marginBottom: 4,
  },
  heroTitleSub: { fontSize: 18, fontWeight: 'normal', opacity: 0.8 },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 18, marginBottom: 16 },
  heroBudgetBar: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 3, marginBottom: 8, overflow: 'hidden',
  },
  heroBudgetFill: { height: 6, borderRadius: 3 },
  heroBarLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  heroBarLabel: { fontSize: 11, color: 'rgba(255,255,255,0.75)', fontWeight: 'normal' },

  // SECTION
  sectionHead: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 6,
  },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 4 },
  sectionSub: { fontSize: 12, color: GRAY, lineHeight: 18, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },

  // OPTION ROWS
  optRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  optRowOn: { backgroundColor: PALE_GREEN },
  optLeft: { flex: 1 },
  optLabel: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  optLabelOn: { color: GREEN },
  optSub: { fontSize: 12, color: GRAY },
  radio: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  radioOn: { borderColor: GREEN },
  radioDot: { width: 12, height: 12, borderRadius: 6, backgroundColor: GREEN },

  // CUSTOM GOAL
  customGoalWrap: {
    backgroundColor: WHITE, borderRadius: 14, padding: 16,
    marginTop: 10, borderWidth: 1.5, borderColor: GREEN, ...SHADOW_SM,
  },
  customGoalLabel: { fontSize: 12, fontWeight: 'bold', color: GRAY, marginBottom: 10 },
  customGoalInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customGoalDollar: { fontSize: 28, fontWeight: 'bold', color: NAVY },
  customGoalInput: {
    flex: 1, fontSize: 32, fontWeight: 'bold', color: NAVY,
    borderBottomWidth: 2, borderBottomColor: GREEN, paddingBottom: 4,
  },
  customGoalPeriod: { fontSize: 14, color: GRAY },

  // CATEGORY BUDGETS
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  catLeft: { flex: 1 },
  catLabelRow: { marginBottom: 6 },
  catLabel: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  catBarWrap: { height: 4, backgroundColor: '#F3F4F6', borderRadius: 2 },
  catBarFill: { height: 4, borderRadius: 2 },
  catInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1.5, borderBottomColor: BORDER,
    paddingBottom: 2, gap: 2,
  },
  catInputDollar: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  catInput: {
    fontSize: 16, fontWeight: 'bold', color: NAVY,
    width: 64, textAlign: 'right',
  },
  catTotalRow: {
    backgroundColor: OFF_WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
    borderBottomWidth: 0,
  },
  catTotalLabel: { flex: 1, fontSize: 14, fontWeight: 'bold', color: NAVY },
  catTotalVal: { fontSize: 16, fontWeight: 'bold', color: NAVY },

  // OVER BUDGET
  overBudgetBadge: {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  overBudgetTxt: { fontSize: 10, fontWeight: 'bold', color: RED },
  overBudgetNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12,
    marginTop: 10, gap: 8,
    borderWidth: 1, borderColor: '#FECACA',
  },
  overBudgetNoteDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: RED, marginTop: 5 },
  overBudgetNoteText: { flex: 1, fontSize: 12, color: '#991B1B', lineHeight: 18 },

  // ALERTS
  alertsCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW_SM,
  },
  alertRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  alertLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  alertPctBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    minWidth: 48, alignItems: 'center',
  },
  alertPctTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },
  alertLabel: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  alertDesc: { fontSize: 11, color: GRAY, lineHeight: 16 },
  alertCheckOn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  alertCheckTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // SAVE LARGE
  saveBtnLarge: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnLargeDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  saveBtnLargeTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
});