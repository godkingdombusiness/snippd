import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { adjustCookingInstructions } from '../src/services/contextualCookingService';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';

var METHODS = [
  { id: 'air_fryer',   label: 'Air Fryer',   icon: 'wind',        time: '18 min' },
  { id: 'oven',        label: 'Oven',         icon: 'thermometer', time: '35 min' },
  { id: 'stovetop',    label: 'Stovetop',     icon: 'flame',       time: '20 min' },
  { id: 'grill',       label: 'Grill',        icon: 'sun',         time: '25 min' },
  { id: 'slow_cooker', label: 'Slow Cooker',  icon: 'clock',       time: '6 hr' },
  { id: 'microwave',   label: 'Microwave',    icon: 'zap',         time: '8 min' },
  { id: 'low_effort',  label: 'No-cook',      icon: 'minus-circle',time: '5 min' },
];

var SEEDED_MEAL = {
  meal_id:     'seeded_001',
  meal_name:   'Chicken Rice Bowls',
  ingredients: ['chicken breast', 'rice', 'broccoli', 'soy sauce', 'garlic'],
};

var SAFETY_NOTE = 'Cooking times may vary by appliance. Always cook food to safe internal temperatures.';

function ContextualCookingScreen(props) {
  var navigation = props.navigation;
  var params  = props.route ? props.route.params : {};
  var meal    = params.meal || SEEDED_MEAL;

  var [activeMethod, setActiveMethod] = useState('air_fryer');
  var result = adjustCookingInstructions(meal, activeMethod);

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>How to Cook It</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.mealTitle}>{meal.meal_name}</Text>
        <Text style={styles.mealSub}>Choose your cooking method:</Text>

        {/* Method selector grid */}
        <View style={styles.methodGrid}>
          {METHODS.map(function (m) {
            var isActive = activeMethod === m.id;
            return (
              <TouchableOpacity
                key={m.id}
                style={[styles.methodChip, isActive && styles.methodChipActive]}
                onPress={function () { setActiveMethod(m.id); }}
                activeOpacity={0.75}
              >
                <Feather name={m.icon} size={16} color={isActive ? WHITE : GRAY} />
                <Text style={[styles.methodLabel, isActive && styles.methodLabelActive]}>
                  {m.label}
                </Text>
                <Text style={[styles.methodTime, isActive && styles.methodTimeActive]}>
                  {m.time}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Metadata strip */}
        <View style={styles.metaStrip}>
          {result.time_note ? (
            <View style={styles.metaItem}>
              <Feather name="clock" size={13} color={GREEN} />
              <Text style={styles.metaText}>{result.time_note}</Text>
            </View>
          ) : null}
          {result.method_label ? (
            <View style={styles.metaItem}>
              <Feather name="tool" size={13} color={GREEN} />
              <Text style={styles.metaText}>{result.method_label}</Text>
            </View>
          ) : null}
        </View>

        {/* Steps */}
        <View style={styles.stepsCard}>
          <Text style={styles.stepsHeading}>Steps</Text>
          {(result.steps || []).map(function (step, idx) {
            return (
              <View key={idx} style={styles.stepRow}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{idx + 1}</Text>
                </View>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            );
          })}
        </View>

        {/* Safety note */}
        <View style={styles.safetyCard}>
          <Feather name="alert-triangle" size={14} color={AMBER} style={{ marginTop: 1 }} />
          <Text style={styles.safetyText}>{SAFETY_NOTE}</Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  scroll:   { paddingHorizontal: 16, paddingTop: 4 },
  mealTitle: { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 4 },
  mealSub:   { fontSize: 14, color: GRAY, marginBottom: 16 },
  methodGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  methodChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  methodChipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  methodLabel: { fontSize: 13, fontWeight: '600', color: GRAY },
  methodLabelActive: { color: WHITE },
  methodTime: { fontSize: 11, color: GRAY },
  methodTimeActive: { color: 'rgba(255,255,255,0.8)' },
  metaStrip: {
    flexDirection: 'row',
    gap: 16,
    backgroundColor: MINT,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  metaText:  { fontSize: 12, color: NAVY, fontWeight: '600' },
  stepsCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    marginBottom: 14,
    gap: 14,
  },
  stepsHeading: { fontSize: 15, fontWeight: '700', color: NAVY },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stepNumText: { fontSize: 12, fontWeight: '800', color: GREEN },
  stepText:    { flex: 1, fontSize: 14, color: NAVY, lineHeight: 20 },
  safetyCard: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
  },
  safetyText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },
});

export default ContextualCookingScreen;
