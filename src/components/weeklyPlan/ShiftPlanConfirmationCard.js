import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var AMBER  = '#F59E0B';

function ShiftPlanConfirmationCard(props) {
  var shiftType      = props.shiftType;   // 'shift' | 'skip' | 'keep'
  var mealName       = props.mealName || 'Tonight\'s dinner';
  var budgetImpact   = props.budgetImpact || null;
  var wasteItems     = props.wasteItems   || [];
  var onViewPlan     = props.onViewPlan;
  var onDismiss      = props.onDismiss;

  var CONFIG = {
    shift: {
      icon:    'calendar',
      title:   'Your plan was shifted.',
      message: 'Tonight\'s meal moved to tomorrow. The rest of your week was adjusted so your groceries still make sense.',
      color:   GREEN,
      bg:      MINT,
    },
    skip: {
      icon:    'minus-circle',
      title:   'Meal skipped.',
      message: 'Tonight\'s meal was removed from the plan. Your grocery list was updated to reflect this.',
      color:   NAVY,
      bg:      '#F0F4FF',
    },
    keep: {
      icon:    'check-circle',
      title:   'Plan unchanged.',
      message: 'Keeping the original plan for the week.',
      color:   GRAY,
      bg:      '#F9FAFB',
    },
  };

  var cfg = CONFIG[shiftType] || CONFIG.shift;

  return (
    <View style={styles.card}>
      {/* Icon + title */}
      <View style={styles.topRow}>
        <View style={[styles.iconCircle, { backgroundColor: cfg.bg }]}>
          <Feather name={cfg.icon} size={20} color={cfg.color} />
        </View>
        <Text style={styles.title}>{cfg.title}</Text>
      </View>

      <Text style={styles.message}>{cfg.message}</Text>

      {/* Waste warning */}
      {wasteItems.length > 0 && (
        <View style={styles.wasteRow}>
          <Feather name="alert-triangle" size={13} color={AMBER} />
          <Text style={styles.wasteText}>
            {'Watch freshness for: ' + wasteItems.map(function (i) { return i.name; }).join(', ') + '.'}
          </Text>
        </View>
      )}

      {/* Budget impact */}
      {budgetImpact != null && (
        <View style={styles.budgetRow}>
          <Feather name="dollar-sign" size={13} color={GREEN} />
          <Text style={styles.budgetText}>
            {budgetImpact > 0
              ? '$' + (budgetImpact / 100).toFixed(2) + ' added to estimated weekly spend'
              : 'No budget impact'}
          </Text>
        </View>
      )}

      {/* CTAs */}
      <View style={styles.ctaRow}>
        {onViewPlan && (
          <TouchableOpacity style={styles.ctaPrimary} onPress={onViewPlan} activeOpacity={0.85}>
            <Text style={styles.ctaPrimaryText}>View updated plan</Text>
          </TouchableOpacity>
        )}
        {onDismiss && (
          <TouchableOpacity style={styles.ctaSecondary} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.ctaSecondaryText}>Done</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 18,
    gap: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconCircle: {
    width: 44, height: 44, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  title:   { fontSize: 17, fontWeight: '800', color: NAVY, flex: 1 },
  message: { fontSize: 14, color: GRAY, lineHeight: 20 },
  wasteRow: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: '#FFFBEB', borderRadius: 10,
    borderWidth: 1, borderColor: '#FDE68A', padding: 10,
  },
  wasteText: { flex: 1, fontSize: 12, color: '#92400E', lineHeight: 17 },
  budgetRow: { flexDirection: 'row', gap: 7, alignItems: 'center' },
  budgetText: { fontSize: 13, color: GREEN, fontWeight: '500' },
  ctaRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  ctaPrimary: {
    flex: 1, backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  ctaPrimaryText:   { fontSize: 14, fontWeight: '700', color: WHITE },
  ctaSecondary:     { paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center' },
  ctaSecondaryText: { fontSize: 14, color: GRAY, fontWeight: '500' },
});

export default ShiftPlanConfirmationCard;
