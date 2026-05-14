import React from 'react';
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

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';
var CORAL  = '#fb5b5b';

var BEST_OPTION = {
  label:              'Cook Chicken Rice Bowls',
  option_type:        'cook_from_pantry',
  score:              84,
  score_label:        'Best fit',
  why:                'You have 9 of 11 ingredients. Budget is fine. Takes 25 minutes.',
  budget_impact:      '$6.80 total · $1.70 per person',
  time_impact:        '25 min',
  pantry_impact:      'Uses 9 pantry items',
  nutrition_label:    '42g protein, 520 cal',
  missing_items:      ['Sesame oil', 'Green onions'],
};

var COMPARISON_OPTIONS = [
  {
    label:         'Quick grocery run + cook',
    score:         71,
    cost_note:     '$12.40 total',
    time_note:     '45 min (drive + cook)',
    score_label:   'Good fit',
    score_color:   GREEN,
  },
  {
    label:         'Uber Eats pickup',
    score:         54,
    cost_note:     '$28–36 est.',
    time_note:     '20 min pickup',
    score_label:   'Possible',
    score_color:   AMBER,
  },
  {
    label:         'Uber Eats delivery',
    score:         41,
    cost_note:     '$32–42 est. + fees',
    time_note:     '35–50 min',
    score_label:   'Possible',
    score_color:   AMBER,
  },
];

var DISCLAIMER = 'Uber Eats integration is in sandbox testing. Prices are estimates only.';

function ScoreBar(score) {
  return (
    <View style={scoreBarStyles.wrap}>
      <View style={scoreBarStyles.track}>
        <View style={[scoreBarStyles.fill, { width: score + '%' }]} />
      </View>
      <Text style={scoreBarStyles.label}>{score}</Text>
    </View>
  );
}

var scoreBarStyles = StyleSheet.create({
  wrap:  { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  track: {
    flex: 1, height: 6, borderRadius: 3,
    backgroundColor: BORDER, overflow: 'hidden',
  },
  fill:  { height: 6, borderRadius: 3, backgroundColor: GREEN },
  label: { fontSize: 12, fontWeight: '700', color: NAVY, width: 24 },
});

function TodayRecommendationScreen(props) {
  var navigation = props.navigation;

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleCook() {
    navigation.navigate('ContextualCooking', {
      meal: {
        meal_id:     'seeded_001',
        meal_name:   'Chicken Rice Bowls',
        ingredients: ['chicken breast', 'rice', 'broccoli', 'soy sauce', 'garlic'],
      },
    });
  }

  function handleViewPlan() {
    navigation.navigate('WeeklyDinnerPlan');
  }

  function handleUber() {
    navigation.navigate('UberEatsHandoff', { optionType: 'uber_eats_pickup', score: 54 });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Tonight's Best Move</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {/* Eyebrow */}
        <Text style={styles.eyebrow}>Snippd recommends</Text>

        {/* Hero card */}
        <View style={styles.heroCard}>
          <View style={styles.heroTop}>
            <View style={styles.scoreBadge}>
              <Text style={styles.scoreBadgeText}>{BEST_OPTION.score}</Text>
            </View>
            <View style={styles.heroInfo}>
              <Text style={styles.heroLabel}>{BEST_OPTION.label}</Text>
              <View style={[styles.fitPill, { backgroundColor: MINT }]}>
                <Text style={[styles.fitPillText, { color: GREEN }]}>{BEST_OPTION.score_label}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.heroWhy}>{BEST_OPTION.why}</Text>

          {/* Impact grid */}
          <View style={styles.impactGrid}>
            <View style={styles.impactItem}>
              <Feather name="dollar-sign" size={14} color={GREEN} />
              <View>
                <Text style={styles.impactLabel}>Cost</Text>
                <Text style={styles.impactValue}>{BEST_OPTION.budget_impact}</Text>
              </View>
            </View>
            <View style={styles.impactItem}>
              <Feather name="clock" size={14} color={GREEN} />
              <View>
                <Text style={styles.impactLabel}>Time</Text>
                <Text style={styles.impactValue}>{BEST_OPTION.time_impact}</Text>
              </View>
            </View>
            <View style={styles.impactItem}>
              <Feather name="package" size={14} color={GREEN} />
              <View>
                <Text style={styles.impactLabel}>Pantry</Text>
                <Text style={styles.impactValue}>{BEST_OPTION.pantry_impact}</Text>
              </View>
            </View>
            <View style={styles.impactItem}>
              <Feather name="activity" size={14} color={GREEN} />
              <View>
                <Text style={styles.impactLabel}>Nutrition</Text>
                <Text style={styles.impactValue}>{BEST_OPTION.nutrition_label}</Text>
              </View>
            </View>
          </View>

          {/* Missing items */}
          {BEST_OPTION.missing_items.length > 0 && (
            <View style={styles.missingRow}>
              <Feather name="shopping-cart" size={13} color={AMBER} />
              <Text style={styles.missingText}>
                {'Grab: ' + BEST_OPTION.missing_items.join(', ')}
              </Text>
            </View>
          )}

          <TouchableOpacity style={styles.cookBtn} onPress={handleCook} activeOpacity={0.85}>
            <Feather name="book-open" size={16} color={WHITE} />
            <Text style={styles.cookBtnText}>How to cook this</Text>
          </TouchableOpacity>
        </View>

        {/* Other options */}
        <Text style={styles.sectionLabel}>Other options ranked</Text>

        {COMPARISON_OPTIONS.map(function (opt, idx) {
          return (
            <View key={idx} style={styles.compCard}>
              <View style={styles.compTop}>
                <Text style={styles.compLabel}>{opt.label}</Text>
                <View style={[styles.fitPill, { backgroundColor: opt.score < 60 ? '#FFFBEB' : MINT }]}>
                  <Text style={[styles.fitPillText, { color: opt.score_color }]}>{opt.score_label}</Text>
                </View>
              </View>
              <View style={styles.compScoreRow}>
                {ScoreBar(opt.score)}
              </View>
              <View style={styles.compMeta}>
                <Text style={styles.compMetaText}>{opt.cost_note}</Text>
                <Text style={styles.compMetaDivider}> · </Text>
                <Text style={styles.compMetaText}>{opt.time_note}</Text>
              </View>
            </View>
          );
        })}

        {/* Uber disclaimer */}
        <View style={styles.disclaimerCard}>
          <Feather name="info" size={13} color={AMBER} style={{ marginTop: 1 }} />
          <Text style={styles.disclaimerText}>{DISCLAIMER}</Text>
        </View>

        <TouchableOpacity style={styles.planBtn} onPress={handleViewPlan} activeOpacity={0.8}>
          <Feather name="calendar" size={15} color={NAVY} />
          <Text style={styles.planBtnText}>View full weekly plan</Text>
        </TouchableOpacity>

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
  eyebrow:  { fontSize: 12, fontWeight: '700', color: GREEN, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  heroCard: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 18,
    marginBottom: 20,
    gap: 14,
  },
  heroTop: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  scoreBadge: {
    width: 52, height: 52,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  scoreBadgeText: { fontSize: 20, fontWeight: '900', color: WHITE },
  heroInfo: { flex: 1, gap: 6 },
  heroLabel: { fontSize: 18, fontWeight: '800', color: NAVY, lineHeight: 24 },
  fitPill: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  fitPillText: { fontSize: 11, fontWeight: '700' },
  heroWhy: { fontSize: 14, color: GRAY, lineHeight: 20 },
  impactGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  impactItem: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    width: '45%',
  },
  impactLabel: { fontSize: 10, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.4 },
  impactValue: { fontSize: 13, fontWeight: '600', color: NAVY, lineHeight: 18 },
  missingRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 10,
    padding: 10,
  },
  missingText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  cookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 13,
    paddingVertical: 13,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  cookBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  compCard: {
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    marginBottom: 10,
    gap: 8,
  },
  compTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  compLabel: { fontSize: 14, fontWeight: '700', color: NAVY, flex: 1, marginRight: 8 },
  compScoreRow: { flexDirection: 'row', alignItems: 'center' },
  compMeta: { flexDirection: 'row', alignItems: 'center' },
  compMetaText: { fontSize: 12, color: GRAY },
  compMetaDivider: { fontSize: 12, color: BORDER },
  disclaimerCard: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 14,
  },
  disclaimerText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  planBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    borderColor: NAVY,
    borderRadius: 13,
    paddingVertical: 13,
    backgroundColor: WHITE,
  },
  planBtnText: { fontSize: 14, fontWeight: '700', color: NAVY },
});

export default TodayRecommendationScreen;
