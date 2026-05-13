import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

var GREEN = '#0C9E54';
var NAVY = '#172250';
var BORDER = '#E5E7EB';
var GRAY = '#6B7280';
var WHITE = '#FFFFFF';
var CREAM = '#FAF8F1';

var TABS = [
  { key: 'meals', label: 'Meals' },
  { key: 'store', label: 'Store' },
  { key: 'nutrition', label: 'Nutrition' },
];

function PlanTabBar(props) {
  var activeTab = props.activeTab;
  var onTabChange = props.onTabChange;

  return (
    <View style={styles.container}>
      {TABS.map(function (tab) {
        var isActive = activeTab === tab.key;
        return (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, isActive && styles.tabActive]}
            onPress={function () { onTabChange(tab.key); }}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
              {tab.label}
            </Text>
            {isActive && <View style={styles.activeIndicator} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

var styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    marginTop: 8,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    position: 'relative',
  },
  tabActive: {
    // Active state is shown via indicator and label color
  },
  tabLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: GRAY,
  },
  tabLabelActive: {
    color: GREEN,
    fontWeight: '700',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: 0,
    left: 16,
    right: 16,
    height: 3,
    backgroundColor: GREEN,
    borderRadius: 2,
  },
});

export default PlanTabBar;
