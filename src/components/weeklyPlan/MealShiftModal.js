import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';
var CORAL  = '#fb5b5b';
var AMBER  = '#F59E0B';

var SHIFT_OPTIONS = [
  {
    id:        'shift',
    icon:      'calendar',
    label:     'Shift the plan',
    sub:       'Move tonight\'s meal to tomorrow. Adjust the rest of the week forward.',
    highlight: true,
  },
  {
    id:    'skip',
    icon:  'minus-circle',
    label: 'Skip this meal only',
    sub:   'Remove tonight\'s dinner from the plan without affecting other days.',
  },
  {
    id:    'keep',
    icon:  'check-circle',
    label: 'Keep the plan as-is',
    sub:   'Stick with the original plan. No changes.',
  },
];

function MealShiftModal(props) {
  var visible      = props.visible;
  var mealName     = props.mealName || 'Tonight\'s meal';
  var onShift      = props.onShift;
  var onSkip       = props.onSkip;
  var onKeep       = props.onKeep;
  var onDismiss    = props.onDismiss;
  var wasteItems   = props.wasteItems || [];

  var [selected, setSelected] = useState(null);

  function handleConfirm() {
    if (selected === 'shift' && onShift)  { onShift();  return; }
    if (selected === 'skip'  && onSkip)   { onSkip();   return; }
    if (selected === 'keep'  && onKeep)   { onKeep();   return; }
    if (onDismiss) onDismiss();
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onDismiss}
    >
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onDismiss}>
        <TouchableOpacity style={styles.sheet} activeOpacity={1}>
          <View style={styles.handle} />

          <Text style={styles.headline}>Want me to shift the week?</Text>
          <Text style={styles.sub}>
            {mealName + ' is changing. Snippd can move the remaining meals forward so nothing gets wasted.'}
          </Text>

          {/* Perishable warning */}
          {wasteItems.length > 0 && (
            <View style={styles.wasteWarn}>
              <Feather name="alert-triangle" size={14} color={AMBER} style={{ marginTop: 1 }} />
              <Text style={styles.wasteWarnText}>
                {'This may affect freshness for: ' + wasteItems.map(i => i.name).join(', ') + '.'}
              </Text>
            </View>
          )}

          {/* Options */}
          <View style={styles.options}>
            {SHIFT_OPTIONS.map(opt => (
              <TouchableOpacity
                key={opt.id}
                style={[
                  styles.option,
                  opt.highlight && styles.optionHighlight,
                  selected === opt.id && styles.optionSelected,
                ]}
                onPress={() => setSelected(opt.id)}
                activeOpacity={0.78}
              >
                <View style={[
                  styles.optionIcon,
                  selected === opt.id && styles.optionIconSelected,
                  opt.highlight && selected !== opt.id && styles.optionIconHighlight,
                ]}>
                  <Feather
                    name={opt.icon}
                    size={18}
                    color={selected === opt.id ? WHITE : opt.highlight ? GREEN : GRAY}
                  />
                </View>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, selected === opt.id && styles.optionLabelSelected]}>
                    {opt.label}
                  </Text>
                  <Text style={styles.optionSub}>{opt.sub}</Text>
                </View>
                {selected === opt.id && (
                  <Feather name="check-circle" size={16} color={GREEN} />
                )}
              </TouchableOpacity>
            ))}
          </View>

          {/* CTAs */}
          <TouchableOpacity
            style={[styles.primaryBtn, !selected && styles.primaryBtnDim]}
            onPress={handleConfirm}
            disabled={!selected}
            activeOpacity={0.88}
          >
            <Text style={styles.primaryBtnText}>
              {selected === 'shift' ? 'Shift the Plan' :
               selected === 'skip'  ? 'Skip This Meal' :
               selected === 'keep'  ? 'Keep As-Is' : 'Confirm'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.cancelBtn} onPress={onDismiss} activeOpacity={0.7}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

var styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23,34,80,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: CREAM,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 36,
  },
  handle: {
    width: 40, height: 4,
    borderRadius: 2,
    backgroundColor: BORDER,
    alignSelf: 'center',
    marginBottom: 20,
  },
  headline: {
    fontSize: 22,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.4,
    marginBottom: 8,
  },
  sub: {
    fontSize: 14,
    color: GRAY,
    lineHeight: 21,
    marginBottom: 16,
  },
  wasteWarn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 12,
    marginBottom: 16,
  },
  wasteWarnText: { flex: 1, fontSize: 13, color: '#92400E', lineHeight: 18 },
  options:  { gap: 10, marginBottom: 20 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  optionHighlight: { borderColor: '#A7F3D0' },
  optionSelected:  { borderColor: GREEN, backgroundColor: '#F0FBF4' },
  optionIcon: {
    width: 38, height: 38, borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  optionIconHighlight: { backgroundColor: MINT },
  optionIconSelected:  { backgroundColor: GREEN },
  optionText: { flex: 1 },
  optionLabel: { fontSize: 14, fontWeight: '700', color: NAVY, marginBottom: 3 },
  optionLabelSelected: { color: GREEN },
  optionSub:   { fontSize: 12, color: GRAY, lineHeight: 17 },
  primaryBtn: {
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnDim:  { opacity: 0.45 },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  cancelBtn:  { alignItems: 'center', paddingVertical: 10 },
  cancelBtnText: { fontSize: 14, color: GRAY, fontWeight: '500' },
});

export default MealShiftModal;
