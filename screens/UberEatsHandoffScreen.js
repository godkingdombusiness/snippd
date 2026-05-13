import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ScrollView,
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

var OPTION_META = {
  uber_eats_pickup: {
    label:        'Uber Eats Pickup',
    icon:         'map-pin',
    etaLabel:     '15 – 25 min',
    feeLabel:     'No delivery fee',
    description:  'Order from nearby restaurants and pick up on your way home. No delivery fee — just the food.',
  },
  uber_eats_delivery: {
    label:        'Uber Eats Delivery',
    icon:         'truck',
    etaLabel:     '30 – 50 min',
    feeLabel:     'Delivery fee + tip applies',
    description:  'Order from nearby restaurants and have it delivered. Delivery fee and tip will apply on checkout.',
  },
};

function StashBubble(props) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}>
        <Text style={styles.stashIconText}>S</Text>
      </View>
      <Text style={styles.stashText}>{props.message}</Text>
    </View>
  );
}

export default function UberEatsHandoffScreen(props) {
  var navigation = props.navigation;
  var params     = props.route ? props.route.params : {};
  var optionType = params.optionType || 'uber_eats_pickup';
  var score      = params.score || null;

  var meta = OPTION_META[optionType] || OPTION_META.uber_eats_pickup;

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.iconRow}>
          <View style={styles.iconCircle}>
            <Feather name={meta.icon} size={26} color={GREEN} />
          </View>
        </View>

        <Text style={styles.headline}>{meta.label}</Text>
        <Text style={styles.description}>{meta.description}</Text>

        {/* Details card */}
        <View style={styles.detailCard}>
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
              <Feather name="clock" size={15} color={GREEN} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Estimated time</Text>
              <Text style={styles.detailValue}>{meta.etaLabel}</Text>
            </View>
          </View>
          <View style={styles.detailDivider} />
          <View style={styles.detailRow}>
            <View style={styles.detailIconWrap}>
              <Feather name="dollar-sign" size={15} color={AMBER} />
            </View>
            <View>
              <Text style={styles.detailLabel}>Fee note</Text>
              <Text style={styles.detailValue}>{meta.feeLabel}</Text>
            </View>
          </View>
          {score !== null && (
            <>
              <View style={styles.detailDivider} />
              <View style={styles.detailRow}>
                <View style={styles.detailIconWrap}>
                  <Feather name="bar-chart-2" size={15} color={GREEN} />
                </View>
                <View>
                  <Text style={styles.detailLabel}>Snippd fit score</Text>
                  <Text style={styles.detailValue}>{score} / 100</Text>
                </View>
              </View>
            </>
          )}
        </View>

        {/* Integration notice */}
        <View style={styles.noticeCard}>
          <Feather name="info" size={15} color={AMBER} style={{ marginTop: 1 }} />
          <Text style={styles.noticeText}>
            Uber Eats integration testing is underway for approved eat-out and grocery handoff workflows. Full handoff will be available in a future update.
          </Text>
        </View>

        <StashBubble message="Snippd scored all your options before showing this one. You're always in control — this is a recommendation, not an automatic order." />

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleBack}
          activeOpacity={0.88}
        >
          <Feather name="layers" size={16} color={WHITE} />
          <Text style={styles.primaryBtnText}>Back to my options</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => navigation.navigate('WeeklyDinnerPlan')}
          activeOpacity={0.85}
        >
          <Feather name="calendar" size={15} color={NAVY} />
          <Text style={styles.secondaryBtnText}>View weekly food plan instead</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  root:   { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 48 },

  backBtn: { marginBottom: 24, alignSelf: 'flex-start' },

  iconRow:   { alignItems: 'center', marginBottom: 16 },
  iconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#C8E6C9',
  },

  headline: {
    fontSize: 26,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 14,
    color: GRAY,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 24,
  },

  detailCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    marginBottom: 16,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  detailIconWrap: {
    width: 32, height: 32, borderRadius: 8,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center',
  },
  detailDivider: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  detailLabel:   { fontSize: 10, color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
  detailValue:   { fontSize: 15, fontWeight: '700', color: NAVY },

  noticeCard: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
    marginBottom: 20,
  },
  noticeText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 18 },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 24,
  },
  stashIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '900' },
  stashText:     { flex: 1, fontSize: 13, color: NAVY, lineHeight: 20 },

  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 12,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 13,
  },
  secondaryBtnText: { fontSize: 14, fontWeight: '600', color: NAVY },
});
