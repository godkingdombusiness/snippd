import React from 'react';
import { ScrollView, Text, TouchableOpacity, StyleSheet } from 'react-native';

var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';

var FILTER_OPTIONS = [
  'All Goals',
  'High Protein',
  'Budget Meals',
  'Lower Sugar',
  'Lower Sodium',
  'Kid-Friendly',
  'Quick Meals',
  'Under 600 Cal',
  '800-1,000 Cal',
  '1,000+ Cal',
];

function NutritionFilterBar(props) {
  var activeFilter = props.activeFilter;
  var onFilterChange = props.onFilterChange;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {FILTER_OPTIONS.map(function (filter) {
        var isActive = activeFilter === filter;
        return (
          <TouchableOpacity
            key={filter}
            style={[styles.pill, isActive && styles.pillActive]}
            onPress={function () { onFilterChange(filter); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.pillText, isActive && styles.pillTextActive]}>
              {filter}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
    backgroundColor: WHITE,
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  pill: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: WHITE,
  },
  pillActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY,
  },
  pillTextActive: {
    color: WHITE,
    fontWeight: '600',
  },
});

export default NutritionFilterBar;
