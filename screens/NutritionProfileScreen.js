/**
 * NutritionProfileScreen
 *
 * Captures household member calorie targets and dietary modes.
 * Used in TWO contexts:
 *   - fromOnboarding: true  → step between Dietary and Cooking in onboarding
 *   - fromOnboarding: false → editable from Profile settings anytime
 *
 * Data saved to profiles:
 *   household_members, daily_calorie_target_min/max,
 *   meal_calorie_target_min/max, dietary_modes, nutrition_profile_set
 *
 * Disclaimer: Calorie targets based on USDA Dietary Guidelines 2020–2025.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import {
  MEMBER_OPTIONS,
  DIETARY_MODES,
  DIETARY_MODE_CONFLICTS,
  computeHouseholdCalorieTarget,
  memberOptionToRecord,
} from '../src/constants/nutritionTargets';

// ── Colors ────────────────────────────────────────────────────────
const FOREST    = '#0C7A3D';
const DARK_GRN  = '#085041';
const MID_GREEN = '#1D9E75';
const SEL_BG    = '#E1F5EE';
const SEL_LABEL = '#085041';
const NAVY      = '#0D1B4B';
const GRAY      = '#64748B';
const GRAY_MID  = '#94A3B8';
const BORDER    = '#E2E8F0';
const WHITE     = '#FFFFFF';
const OFF_WHITE = '#F8F9FA';
const GREEN_CTA = '#2E7D32';
const AMBER     = '#F59E0B';
const AMBER_BG  = '#FFFBEB';

// ── Member type tile ─────────────────────────────────────────────

function MemberTypeTile({ option, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.memberTypeTile, selected && styles.memberTypeTileSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.memberTypeLabel, selected && styles.memberTypeLabelSelected]}>
        {option.label}
      </Text>
      <Text style={[styles.memberTypeSub, selected && styles.memberTypeSubSelected]}>
        {option.subLabel}
      </Text>
      {selected && (
        <View style={styles.memberTypeKcalPill}>
          <Text style={styles.memberTypeKcalTxt}>
            {option.kcalMin.toLocaleString()}–{option.kcalMax.toLocaleString()} kcal
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Member card ──────────────────────────────────────────────────

function MemberCard({ member, index, onRemove, onChangeType }) {
  const [expanded, setExpanded] = useState(!member.role);

  const opt = MEMBER_OPTIONS.find(o => o.id === member.role);
  const label = opt ? `${opt.label} · ${opt.subLabel}` : 'Select type';
  const kcalLabel = opt
    ? `${opt.kcalMin.toLocaleString()}–${opt.kcalMax.toLocaleString()} kcal`
    : '';

  return (
    <View style={styles.memberCard}>
      <View style={styles.memberCardHeader}>
        <View style={styles.memberCardHeaderLeft}>
          <View style={styles.memberIndexBadge}>
            <Text style={styles.memberIndexTxt}>{index + 1}</Text>
          </View>
          <View>
            <Text style={styles.memberCardLabel}>{label}</Text>
            {!!kcalLabel && (
              <Text style={styles.memberCardKcal}>{kcalLabel}/day</Text>
            )}
          </View>
        </View>
        <View style={styles.memberCardHeaderRight}>
          <TouchableOpacity
            style={styles.memberExpandBtn}
            onPress={() => setExpanded(e => !e)}
          >
            <Feather name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={GRAY} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.memberRemoveBtn} onPress={onRemove}>
            <Feather name="x" size={14} color={GRAY} />
          </TouchableOpacity>
        </View>
      </View>

      {expanded && (
        <View style={styles.memberTypeGrid}>
          {MEMBER_OPTIONS.map(opt => (
            <MemberTypeTile
              key={opt.id}
              option={opt}
              selected={member.role === opt.id}
              onPress={() => {
                onChangeType(opt.id);
                setExpanded(false);
              }}
            />
          ))}
        </View>
      )}
    </View>
  );
}

// ── Dietary mode tile ────────────────────────────────────────────

function DietaryModeTile({ mode, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[styles.modeTile, selected && styles.modeTileSelected]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <Text style={[styles.modeLabel, selected && styles.modeLabelSelected]}>
        {mode.label}
      </Text>
      <Text style={[styles.modeSub, selected && styles.modeSubSelected]}>
        {mode.sub}
      </Text>
    </TouchableOpacity>
  );
}

// ── Main Screen ──────────────────────────────────────────────────

export default function NutritionProfileScreen({ navigation, route }) {
  const { fromOnboarding = false } = route?.params ?? {};

  const [members,      setMembers]      = useState([]);
  const [dietaryModes, setDietaryModes] = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [modeNote,     setModeNote]     = useState('');

  // Load existing profile on mount
  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { setLoading(false); return; }

        const { data: profile } = await supabase
          .from('profiles')
          .select('household_members, dietary_modes, nutrition_profile_set')
          .eq('user_id', user.id)
          .single();

        if (profile?.household_members?.length > 0) {
          setMembers(profile.household_members);
        }
        if (profile?.dietary_modes?.length > 0) {
          setDietaryModes(profile.dietary_modes);
        }
      } catch (_) {}
      setLoading(false);
    })();
  }, []);

  // ── Member management ───────────────────────────────────────

  const addMember = () => {
    if (members.length >= 10) {
      Alert.alert('Maximum reached', 'You can add up to 10 household members.');
      return;
    }
    setMembers(prev => [...prev, { role: null, age_group: null, sex: null, kcal_min: 0, kcal_max: 0 }]);
  };

  const removeMember = (idx) => {
    setMembers(prev => prev.filter((_, i) => i !== idx));
  };

  const changeMemberType = (idx, optionId) => {
    const record = memberOptionToRecord(optionId);
    if (!record) return;
    setMembers(prev => prev.map((m, i) => (i === idx ? record : m)));
  };

  // ── Dietary mode toggling ───────────────────────────────────

  const toggleMode = (modeId) => {
    setModeNote('');
    setDietaryModes(prev => {
      const isOn = prev.includes(modeId);
      if (isOn) return prev.filter(m => m !== modeId);

      // Resolve conflicts
      const conflicts = DIETARY_MODE_CONFLICTS[modeId] ?? [];
      const deselected = conflicts.filter(c => prev.includes(c));
      const next = [...prev.filter(m => !conflicts.includes(m)), modeId];

      if (modeId === 'plant_based' && deselected.length > 0) {
        setModeNote(`Plant-based mode is active — keto and high protein adjusted accordingly.`);
      } else if (modeId === 'keto' && prev.includes('low_carb')) {
        setModeNote(`Keto sets carbs under 50g/day — this overrides low carb.`);
        return next.filter(m => m !== 'low_carb').concat('keto');
      }

      return next;
    });
  };

  // ── Live calorie targets ────────────────────────────────────

  const validMembers = members.filter(m => m.role);
  const calTargets = computeHouseholdCalorieTarget(validMembers);

  // ── Save ────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (validMembers.length === 0 && dietaryModes.length === 0) {
      // Allow saving even with no selections (marks as set)
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data: existing } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .single();

      await supabase
        .from('profiles')
        .update({
          household_members:        validMembers,
          daily_calorie_target_min: calTargets.min || null,
          daily_calorie_target_max: calTargets.max || null,
          meal_calorie_target_min:  calTargets.perMeal.min || null,
          meal_calorie_target_max:  calTargets.perMeal.max || null,
          dietary_modes:            dietaryModes,
          nutrition_profile_set:    true,
          preferences: {
            ...(existing?.preferences ?? {}),
            dietary_modes:     dietaryModes,
            household_members: validMembers,
          },
        })
        .eq('user_id', user.id);

      if (fromOnboarding) {
        // Return to OnboardingScreen at step 3 (Cooking)
        navigation.navigate('Onboarding', { resumeAtStep: 3 });
      } else {
        Alert.alert('Saved', 'Your nutrition profile has been updated.');
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Error', 'Could not save nutrition profile. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [validMembers, dietaryModes, calTargets, fromOnboarding]);

  const handleSkip = () => {
    if (fromOnboarding) {
      navigation.navigate('Onboarding', { resumeAtStep: 3 });
    } else {
      navigation.goBack();
    }
  };

  // ── Loading ─────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={FOREST} />
      </View>
    );
  }

  const modeActiveNames = dietaryModes
    .map(id => DIETARY_MODES.find(m => m.id === id)?.label)
    .filter(Boolean)
    .join(', ');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* Nav header */}
      <View style={styles.navHeader}>
        <TouchableOpacity style={styles.backBtn} onPress={handleSkip}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Nutrition Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── HEADER ─────────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={styles.headerEyebrow}>NUTRITION INTELLIGENCE</Text>
          <Text style={styles.headerTitle}>Tell us who needs what.</Text>
          <Text style={styles.headerSub}>
            Every meal gets built to hit the right calories and nutrients for everyone at your table.
          </Text>
        </View>

        {/* ── SECTION 1: WHO IS AT YOUR TABLE ────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Who is at your table?</Text>

          {members.map((member, idx) => (
            <MemberCard
              key={idx}
              member={member}
              index={idx}
              onRemove={() => removeMember(idx)}
              onChangeType={(optionId) => changeMemberType(idx, optionId)}
            />
          ))}

          {members.length < 10 && (
            <TouchableOpacity style={styles.addMemberBtn} onPress={addMember}>
              <Feather name="plus" size={16} color={MID_GREEN} />
              <Text style={styles.addMemberTxt}>Add another person</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── LIVE CALORIE SUMMARY ────────────────────────────── */}
        {validMembers.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Household calorie reference</Text>
            <View style={styles.calorieTable}>
              {validMembers.map((m, idx) => {
                const opt = MEMBER_OPTIONS.find(o => o.id === m.role);
                if (!opt) return null;
                return (
                  <View key={idx} style={styles.calorieRow}>
                    <Text style={styles.calorieRowLabel}>{opt.label} · {opt.subLabel}</Text>
                    <Text style={styles.calorieRowVal}>
                      {m.kcal_min.toLocaleString()}–{m.kcal_max.toLocaleString()} kcal
                    </Text>
                  </View>
                );
              })}
              <View style={[styles.calorieRow, styles.calorieTotalRow]}>
                <Text style={styles.calorieTotalLabel}>Household daily target</Text>
                <Text style={styles.calorieTotalVal}>
                  {calTargets.min.toLocaleString()}–{calTargets.max.toLocaleString()} kcal
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── SECTION 2: DIETARY MODES ────────────────────────── */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Any dietary modes?</Text>
          <Text style={styles.sectionSub}>Multi-select — these stack on your weekly plan.</Text>

          <View style={styles.modeGrid}>
            {DIETARY_MODES.map(mode => (
              <DietaryModeTile
                key={mode.id}
                mode={mode}
                selected={dietaryModes.includes(mode.id)}
                onPress={() => toggleMode(mode.id)}
              />
            ))}
          </View>

          {!!modeNote && (
            <View style={styles.modeNote}>
              <Feather name="info" size={12} color={AMBER} style={{ marginRight: 6 }} />
              <Text style={styles.modeNoteTxt}>{modeNote}</Text>
            </View>
          )}
        </View>

        {/* ── SECTION 3: SUMMARY ─────────────────────────────── */}
        {(validMembers.length > 0 || dietaryModes.length > 0) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your household nutrition summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Daily calorie target</Text>
                <Text style={styles.summaryVal}>
                  {calTargets.min > 0
                    ? `${calTargets.min.toLocaleString()}–${calTargets.max.toLocaleString()} kcal`
                    : '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Per dinner target</Text>
                <Text style={styles.summaryVal}>
                  {calTargets.perMeal.min > 0
                    ? `${calTargets.perMeal.min.toLocaleString()}–${calTargets.perMeal.max.toLocaleString()} kcal`
                    : '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Dietary modes active</Text>
                <Text style={styles.summaryVal}>{modeActiveNames || 'None'}</Text>
              </View>
              <View style={[styles.summaryRow, { borderBottomWidth: 0 }]}>
                <Text style={styles.summaryLabel}>Protein goal per meal</Text>
                <Text style={styles.summaryVal}>
                  {dietaryModes.includes('high_protein')
                    ? `30g+ per meal`
                    : `${Math.max(20, Math.round((validMembers.length || 1) * 20))}g+`}
                </Text>
              </View>

              <View style={styles.summaryFooter}>
                <Text style={styles.summaryFooterTxt}>
                  Every meal card will show nutrition vs your targets
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* ── USDA DISCLAIMER ────────────────────────────────── */}
        <View style={styles.disclaimer}>
          <Text style={styles.disclaimerTxt}>
            Calorie targets based on USDA Dietary Guidelines 2020–2025. Consult your doctor for medical nutrition advice.
          </Text>
        </View>

        {/* ── BUTTONS ────────────────────────────────────────── */}
        <View style={styles.buttonArea}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && { opacity: 0.6 }]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.88}
          >
            <Text style={styles.saveBtnTxt}>
              {saving
                ? 'Saving…'
                : fromOnboarding
                  ? 'Continue'
                  : 'Save nutrition profile'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={handleSkip}>
            <Text style={styles.skipBtnTxt}>
              {fromOnboarding ? 'Skip — set this up later' : 'Cancel'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll:    { paddingHorizontal: 16, paddingBottom: 40 },

  navHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  navTitle: { fontSize: 16, fontWeight: '700', color: NAVY },

  // Header
  header: {
    backgroundColor: FOREST, borderRadius: 14,
    paddingHorizontal: 20, paddingVertical: 22,
    marginTop: 16, marginBottom: 20,
  },
  headerEyebrow: {
    fontSize: 10, fontWeight: '700', letterSpacing: 1.2,
    color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', marginBottom: 8,
  },
  headerTitle: {
    fontSize: 22, fontWeight: '700', color: WHITE, lineHeight: 30, marginBottom: 8,
  },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 19 },

  // Sections
  section: { marginBottom: 20 },
  sectionTitle: {
    fontSize: 15, fontWeight: '700', color: NAVY, marginBottom: 4,
  },
  sectionSub: { fontSize: 12, color: GRAY, marginBottom: 12 },

  // Member cards
  memberCard: {
    backgroundColor: WHITE, borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    marginBottom: 10, overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4 },
      android: { elevation: 1 },
    }),
  },
  memberCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14,
  },
  memberCardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  memberCardHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  memberIndexBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: SEL_BG, alignItems: 'center', justifyContent: 'center',
  },
  memberIndexTxt: { fontSize: 12, fontWeight: '700', color: SEL_LABEL },
  memberCardLabel: { fontSize: 13, fontWeight: '600', color: NAVY },
  memberCardKcal:  { fontSize: 11, color: MID_GREEN, marginTop: 2 },
  memberExpandBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  memberRemoveBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center',
  },

  // Member type grid (2 columns)
  memberTypeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 8,
    paddingHorizontal: 12, paddingBottom: 12,
  },
  memberTypeTile: {
    width: '47%',
    backgroundColor: WHITE, borderRadius: 10,
    borderWidth: 0.5, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  memberTypeTileSelected: {
    backgroundColor: SEL_BG, borderWidth: 1.5, borderColor: MID_GREEN,
  },
  memberTypeLabel: { fontSize: 12, fontWeight: '700', color: NAVY, marginBottom: 2 },
  memberTypeLabelSelected: { color: SEL_LABEL },
  memberTypeSub:   { fontSize: 10, color: GRAY },
  memberTypeSubSelected: { color: '#0F6E56' },
  memberTypeKcalPill: {
    marginTop: 6, backgroundColor: MID_GREEN,
    borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  memberTypeKcalTxt: { fontSize: 9, color: WHITE, fontWeight: '700' },

  // Add member button
  addMemberBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: MID_GREEN, borderStyle: 'dashed',
    borderRadius: 12, padding: 14, justifyContent: 'center',
    backgroundColor: '#F0FDF9',
  },
  addMemberTxt: { fontSize: 13, fontWeight: '600', color: MID_GREEN },

  // Calorie table
  calorieTable: {
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  calorieRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  calorieRowLabel: { fontSize: 12, color: NAVY, flex: 1 },
  calorieRowVal:   { fontSize: 12, fontWeight: '600', color: GRAY, textAlign: 'right' },
  calorieTotalRow: { backgroundColor: '#F0FDF9', borderBottomWidth: 0 },
  calorieTotalLabel: { fontSize: 13, fontWeight: '700', color: DARK_GRN, flex: 1 },
  calorieTotalVal:   { fontSize: 13, fontWeight: '800', color: DARK_GRN, textAlign: 'right' },

  // Dietary mode grid
  modeGrid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 8,
  },
  modeTile: {
    width: '47.5%',
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 0.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  modeTileSelected: {
    backgroundColor: SEL_BG, borderWidth: 1.5, borderColor: MID_GREEN,
  },
  modeLabel: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 3 },
  modeLabelSelected: { color: SEL_LABEL },
  modeSub:   { fontSize: 11, color: GRAY, lineHeight: 15 },
  modeSubSelected: { color: '#0F6E56' },

  modeNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: AMBER_BG, borderRadius: 8,
    padding: 10, marginTop: 10,
  },
  modeNoteTxt: { fontSize: 11, color: '#92400E', flex: 1, lineHeight: 16 },

  // Summary card
  summaryCard: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  summaryLabel: { fontSize: 12, color: GRAY, flex: 1 },
  summaryVal:   { fontSize: 12, fontWeight: '600', color: NAVY, textAlign: 'right', flex: 1 },
  summaryFooter: {
    backgroundColor: FOREST, paddingHorizontal: 16, paddingVertical: 12,
  },
  summaryFooterTxt: { fontSize: 12, color: 'rgba(255,255,255,0.85)', textAlign: 'center' },

  // Disclaimer
  disclaimer: {
    marginBottom: 20, paddingHorizontal: 4,
  },
  disclaimerTxt: {
    fontSize: 10, color: GRAY_MID, lineHeight: 15, textAlign: 'center',
  },

  // Buttons
  buttonArea: { gap: 12 },
  saveBtn: {
    backgroundColor: GREEN_CTA, borderRadius: 14,
    paddingVertical: 18, alignItems: 'center',
    ...Platform.select({
      ios: { shadowColor: GREEN_CTA, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.28, shadowRadius: 10 },
      android: { elevation: 4 },
    }),
  },
  saveBtnTxt: { color: WHITE, fontSize: 16, fontWeight: '800' },
  skipBtn: {
    borderWidth: 1, borderColor: BORDER, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', backgroundColor: WHITE,
  },
  skipBtnTxt: { color: GRAY, fontSize: 13, fontWeight: '500' },
});
