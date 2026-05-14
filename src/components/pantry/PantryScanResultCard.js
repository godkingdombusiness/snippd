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
var CORAL  = '#fb5b5b';

var CONFIDENCE_CONFIG = {
  'Likely':       { color: GREEN, bgColor: MINT,      icon: 'check-circle', label: 'Likely'       },
  'Maybe':        { color: AMBER, bgColor: '#FFFBEB',  icon: 'alert-circle', label: 'Maybe'        },
  'Needs review': { color: CORAL, bgColor: '#FFF1F0',  icon: 'help-circle',  label: 'Needs review' },
};

function PantryScanResultCard(props) {
  var item      = props.item;
  var onConfirm = props.onConfirm;
  var onRemove  = props.onRemove;
  var confirmed = props.confirmed;

  var cfg = CONFIDENCE_CONFIG[item.confidence] || CONFIDENCE_CONFIG['Maybe'];

  return (
    <View style={[styles.card, confirmed && styles.cardConfirmed]}>
      {/* Confidence icon */}
      <View style={[styles.iconWrap, { backgroundColor: cfg.bgColor }]}>
        <Feather name={cfg.icon} size={18} color={cfg.color} />
      </View>

      {/* Item info */}
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <View style={[styles.pill, { backgroundColor: cfg.bgColor }]}>
          <Text style={[styles.pillText, { color: cfg.color }]}>{cfg.label}</Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, confirmed && styles.actionBtnConfirmed]}
          onPress={onConfirm}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          activeOpacity={0.7}
        >
          <Feather name="check" size={15} color={confirmed ? WHITE : GREEN} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionBtn}
          onPress={onRemove}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
          activeOpacity={0.7}
        >
          <Feather name="x" size={15} color={CORAL} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

var styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 12,
  },
  cardConfirmed: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FBF4',
  },
  iconWrap: {
    width: 38, height: 38,
    borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  info: { flex: 1 },
  name: { fontSize: 14, fontWeight: '600', color: NAVY, marginBottom: 4 },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  pillText: { fontSize: 10, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 6 },
  actionBtn: {
    width: 32, height: 32,
    borderRadius: 8,
    backgroundColor: '#F9FAFB',
    borderWidth: 1, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  actionBtnConfirmed: { backgroundColor: GREEN, borderColor: GREEN },
});

export default PantryScanResultCard;
