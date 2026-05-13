import React from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var BORDER = '#E5E7EB';
var WHITE = '#FFFFFF';
var NAVY = '#172250';
var MINT = '#E8F5E9';

function StoreFilterBar(props) {
  var stores = props.stores || [];
  var activeStoreId = props.activeStoreId;
  var onFilterChange = props.onFilterChange;

  var allChip = {
    store_id: 'all',
    store_name: 'All Stores',
  };

  var chips = [allChip].concat(stores);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.scroll}
      contentContainerStyle={styles.content}
    >
      {chips.map(function (chip) {
        var isActive = activeStoreId === chip.store_id;
        return (
          <TouchableOpacity
            key={chip.store_id}
            style={[styles.chip, isActive && styles.chipActive]}
            onPress={function () { onFilterChange(chip.store_id); }}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, isActive && styles.chipTextActive]}>
              {chip.store_name}
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
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  chip: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: WHITE,
  },
  chipActive: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: GRAY,
  },
  chipTextActive: {
    color: WHITE,
    fontWeight: '600',
  },
});

export default StoreFilterBar;
