import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

var MEAL_TYPES = [
  { id: 'all',       label: 'All',        icon: 'grid'    },
  { id: 'breakfast', label: 'Breakfast',  icon: 'sun'     },
  { id: 'lunch',     label: 'Lunch',      icon: 'coffee'  },
  { id: 'dinner',    label: 'Dinner',     icon: 'moon'    },
  { id: 'snack',     label: 'Snacks',     icon: 'star'    },
];

function MealTypeFilterBar(props) {
  var activeMealType = props.activeMealType || 'all';
  var onFilterChange = props.onFilterChange;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      style={styles.scroll}
    >
      {MEAL_TYPES.map(function (type) {
        var isActive = activeMealType === type.id;
        return (
          <TouchableOpacity
            key={type.id}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={function () { if (onFilterChange) onFilterChange(type.id); }}
            activeOpacity={0.75}
          >
            <Feather
              name={type.icon}
              size={13}
              color={isActive ? WHITE : GRAY}
            />
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {type.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  scroll: { flexGrow: 0 },
  row: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  chipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: GRAY,
  },
  chipTextActive: {
    color: WHITE,
  },
});

export default MealTypeFilterBar;
