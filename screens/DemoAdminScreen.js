import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  StatusBar,
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
var CORAL  = '#fb5b5b';

var DEMO_FLOWS = [
  {
    section: 'Core Planning',
    items: [
      { label: 'Weekly Dinner Plan',      icon: 'calendar',    route: 'WeeklyDinnerPlan',      color: GREEN },
      { label: 'Plan Review',             icon: 'check-square',route: 'PlanReview',             color: GREEN },
      { label: 'Today\'s Decision',        icon: 'target',      route: 'TodayDecision',          color: GREEN },
      { label: 'Tonight\'s Best Move',     icon: 'star',        route: 'TodayRecommendation',    color: GREEN },
    ],
  },
  {
    section: 'Pantry Intelligence',
    items: [
      { label: 'Pantry Scan',             icon: 'camera',      route: 'PantryScan',             color: NAVY  },
      { label: 'Pantry Review',           icon: 'list',        route: 'PantryReview',           color: NAVY  },
    ],
  },
  {
    section: 'Cooking & Recipes',
    items: [
      { label: 'How to Cook It',          icon: 'book-open',   route: 'ContextualCooking',      color: NAVY  },
      { label: 'Recipe Vault',            icon: 'bookmark',    route: 'RecipeVault',            color: NAVY  },
    ],
  },
  {
    section: 'Shopping & Stores',
    items: [
      { label: 'Your Store Lists',        icon: 'shopping-bag',route: 'StoreExport',            color: NAVY  },
      { label: 'Shopping List',           icon: 'shopping-cart',route: 'ShoppingList',          color: NAVY  },
    ],
  },
  {
    section: 'Uber Eats (Sandbox)',
    items: [
      { label: 'Uber Eats Handoff',       icon: 'external-link',route: 'UberEatsHandoff',       color: AMBER },
    ],
  },
  {
    section: 'Onboarding & Auth',
    items: [
      { label: 'Sign In',                 icon: 'log-in',      route: 'SignIn',                 color: GRAY  },
      { label: 'Onboarding',             icon: 'user-plus',   route: 'Onboarding',             color: GRAY  },
      { label: 'Smart Start',            icon: 'play',        route: 'SmartStart',             color: GRAY  },
      { label: 'Deep Brief',             icon: 'settings',    route: 'SnippdDeepBrief',        color: GRAY  },
    ],
  },
  {
    section: 'Profile & Budget',
    items: [
      { label: 'Home',                    icon: 'home',        route: 'Home',                   color: GRAY  },
      { label: 'Profile',                 icon: 'user',        route: 'Profile',                color: GRAY  },
      { label: 'Budget Dashboard',        icon: 'bar-chart-2', route: 'BudgetDashboard',        color: GRAY  },
      { label: 'Wins',                    icon: 'award',       route: 'Wins',                   color: GRAY  },
    ],
  },
];

function DemoAdminScreen(props) {
  var navigation = props.navigation;

  function handleNav(route, item) {
    var params = {};
    if (route === 'UberEatsHandoff') {
      params = { optionType: 'uber_eats_pickup', score: 62 };
    }
    if (route === 'PantryReview') {
      var { returnSeededPantryScan } = require('../src/services/pantryVisionService');
      params = { items: returnSeededPantryScan() };
    }
    try {
      navigation.navigate(route, params);
    } catch (e) {
      // Route may not be registered; no-op
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <Text style={styles.navTitle}>Demo Navigator</Text>
        <View style={styles.buildBadge}>
          <Text style={styles.buildBadgeText}>Internal</Text>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        <Text style={styles.intro}>Tap any flow to jump straight to it. Seeded data is used throughout.</Text>

        {DEMO_FLOWS.map(function (section) {
          return (
            <View key={section.section} style={styles.section}>
              <Text style={styles.sectionLabel}>{section.section}</Text>
              <View style={styles.grid}>
                {section.items.map(function (item) {
                  return (
                    <TouchableOpacity
                      key={item.route}
                      style={styles.gridItem}
                      onPress={function () { handleNav(item.route, item); }}
                      activeOpacity={0.75}
                    >
                      <View style={[styles.gridIcon, { backgroundColor: item.color + '18' }]}>
                        <Feather name={item.icon} size={20} color={item.color} />
                      </View>
                      <Text style={styles.gridLabel} numberOfLines={2}>{item.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: WHITE,
  },
  navTitle: { fontSize: 18, fontWeight: '800', color: NAVY },
  buildBadge: {
    backgroundColor: CORAL + '22',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  buildBadgeText: { fontSize: 10, fontWeight: '700', color: CORAL, textTransform: 'uppercase' },
  scroll: { padding: 16 },
  intro: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 20 },
  section: { marginBottom: 24 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: GRAY,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridItem: {
    width: '47%',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    alignItems: 'center',
    gap: 8,
  },
  gridIcon: {
    width: 48, height: 48,
    borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
  },
  gridLabel: { fontSize: 13, fontWeight: '600', color: NAVY, textAlign: 'center', lineHeight: 18 },
});

export default DemoAdminScreen;
