import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';

var SAFETY_NOTE = 'Cooking times may vary by appliance. Always cook food to safe internal temperatures.';

function CookingInstructionCard(props) {
  var steps       = props.steps || [];
  var methodLabel = props.methodLabel || '';
  var timeNote    = props.timeNote    || '';
  var mealName    = props.mealName    || '';
  var showSafety  = props.showSafety !== false;

  return (
    <View style={styles.card}>
      {/* Header */}
      {(mealName || methodLabel) && (
        <View style={styles.header}>
          {mealName ? <Text style={styles.mealName}>{mealName}</Text> : null}
          {methodLabel ? (
            <View style={styles.methodBadge}>
              <Text style={styles.methodBadgeText}>{methodLabel + ' version'}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* Time note */}
      {timeNote ? (
        <View style={styles.timeRow}>
          <Feather name="clock" size={13} color={GREEN} />
          <Text style={styles.timeText}>{timeNote}</Text>
        </View>
      ) : null}

      {/* Steps */}
      <Text style={styles.stepsHeading}>Steps</Text>
      {steps.map(function (step, idx) {
        return (
          <View key={idx} style={styles.stepRow}>
            <View style={styles.stepNum}>
              <Text style={styles.stepNumText}>{idx + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        );
      })}

      {/* Safety */}
      {showSafety && (
        <View style={styles.safetyCard}>
          <Feather name="alert-triangle" size={13} color={AMBER} style={{ marginTop: 1 }} />
          <Text style={styles.safetyText}>{SAFETY_NOTE}</Text>
        </View>
      )}
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
    gap: 12,
  },
  header:      { gap: 4 },
  mealName:    { fontSize: 16, fontWeight: '800', color: NAVY },
  methodBadge: {
    alignSelf: 'flex-start',
    backgroundColor: MINT, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  methodBadgeText: { fontSize: 11, fontWeight: '700', color: GREEN },
  timeRow:  { flexDirection: 'row', alignItems: 'center', gap: 6 },
  timeText: { fontSize: 12, color: GREEN, fontWeight: '500' },
  stepsHeading: { fontSize: 13, fontWeight: '700', color: NAVY },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: MINT,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: GREEN },
  stepText:    { flex: 1, fontSize: 14, color: NAVY, lineHeight: 20 },
  safetyCard: {
    flexDirection: 'row', gap: 7, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB',
    borderRadius: 10, borderWidth: 1, borderColor: '#FDE68A',
    padding: 10,
  },
  safetyText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
});

export default CookingInstructionCard;
