import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';

var METHODS = [
  { id: 'air_fryer',   label: 'Air Fryer',   icon: 'wind',         time: '18 min' },
  { id: 'oven',        label: 'Oven',         icon: 'thermometer',  time: '35 min' },
  { id: 'stovetop',    label: 'Stovetop',     icon: 'flame',        time: '20 min' },
  { id: 'grill',       label: 'Grill',        icon: 'sun',          time: '25 min' },
  { id: 'slow_cooker', label: 'Slow Cooker',  icon: 'clock',        time: '6 hr'   },
  { id: 'microwave',   label: 'Microwave',    icon: 'zap',          time: '8 min'  },
  { id: 'low_effort',  label: 'No-cook',      icon: 'minus-circle', time: '5 min'  },
];

function CookingMethodSelector(props) {
  var activeMethod  = props.activeMethod  || 'air_fryer';
  var onMethodChange = props.onMethodChange;
  var horizontal    = props.horizontal !== false;

  if (horizontal) {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
        style={styles.scroll}
      >
        {METHODS.map(function (m) {
          var isActive = activeMethod === m.id;
          return (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={function () { if (onMethodChange) onMethodChange(m.id); }}
              activeOpacity={0.75}
            >
              <Feather name={m.icon} size={14} color={isActive ? WHITE : GRAY} />
              <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{m.label}</Text>
              <Text style={[styles.chipTime, isActive && styles.chipTimeActive]}>{m.time}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <View style={styles.grid}>
      {METHODS.map(function (m) {
        var isActive = activeMethod === m.id;
        return (
          <TouchableOpacity
            key={m.id}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={function () { if (onMethodChange) onMethodChange(m.id); }}
            activeOpacity={0.75}
          >
            <Feather name={m.icon} size={14} color={isActive ? WHITE : GRAY} />
            <Text style={[styles.chipLabel, isActive && styles.chipLabelActive]}>{m.label}</Text>
            <Text style={[styles.chipTime, isActive && styles.chipTimeActive]}>{m.time}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export { METHODS };

var styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row:  { flexDirection: 'row', gap: 8, paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  chipActive:     { backgroundColor: GREEN, borderColor: GREEN },
  chipLabel:      { fontSize: 13, fontWeight: '600', color: GRAY },
  chipLabelActive:{ color: WHITE },
  chipTime:       { fontSize: 11, color: GRAY },
  chipTimeActive: { color: 'rgba(255,255,255,0.8)' },
});

export default CookingMethodSelector;
