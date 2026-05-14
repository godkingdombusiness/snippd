import React, { useState } from 'react';
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
import MealShiftModal from '../src/components/weeklyPlan/MealShiftModal';
import ShiftPlanConfirmationCard from '../src/components/weeklyPlan/ShiftPlanConfirmationCard';

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
      { label: 'Pantry Scan',             icon: 'camera',       route: 'PantryScan',            color: NAVY  },
      { label: 'Pantry Review',           icon: 'list',         route: 'PantryReview',          color: NAVY  },
    ],
  },
  {
    section: 'Shift Logic Demo',
    items: [
      { label: 'Shift Modal Demo',        icon: 'shuffle',      route: '__ShiftDemo',           color: GREEN },
      { label: 'Weekly Plan (Shift)',     icon: 'calendar',     route: 'WeeklyDinnerPlan',      color: GREEN },
    ],
  },
  {
    section: 'Cooking & Recipes',
    items: [
      { label: 'How to Cook It',          icon: 'book-open',    route: 'ContextualCooking',     color: NAVY  },
      { label: 'Recipe Vault',            icon: 'bookmark',     route: 'RecipeVault',           color: NAVY  },
      { label: 'Saved Recipes',           icon: 'heart',        route: 'SavedRecipes',          color: NAVY  },
    ],
  },
  {
    section: 'Shopping & Stores',
    items: [
      { label: 'Your Store Lists',        icon: 'shopping-bag', route: 'StoreExport',           color: NAVY  },
      { label: 'Shopping List',           icon: 'shopping-cart',route: 'ShoppingList',          color: NAVY  },
    ],
  },
  {
    section: 'Uber Eats Sandbox',
    items: [
      { label: 'Uber Eats Pickup',        icon: 'map-pin',      route: 'UberEatsHandoff',       color: AMBER },
      { label: 'Uber Eats Delivery',      icon: 'truck',        route: '__UberDelivery',        color: AMBER },
      { label: 'Sandbox Status',          icon: 'wifi',         route: '__UberStatus',          color: AMBER },
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

var UBER_STATUS = [
  { label: 'Pickup integration',   status: 'Sandbox testing',  color: AMBER },
  { label: 'Delivery integration', status: 'Sandbox testing',  color: AMBER },
  { label: 'Cart handoff',         status: 'Not connected',    color: CORAL },
  { label: 'Menu data',            status: 'Seeded demo data', color: GRAY  },
];

function DemoAdminScreen(props) {
  var navigation = props.navigation;
  var [shiftModal,   setShiftModal]   = useState(false);
  var [shiftDone,    setShiftDone]    = useState(false);
  var [shiftChoice,  setShiftChoice]  = useState(null);
  var [uberStatus,   setUberStatus]   = useState(false);

  function handleNav(route, item) {
    if (route === '__ShiftDemo')   { setShiftDone(false); setShiftModal(true);  return; }
    if (route === '__UberDelivery') {
      navigation.navigate('UberEatsHandoff', { optionType: 'uber_eats_delivery', score: 41 });
      return;
    }
    if (route === '__UberStatus')  { setUberStatus(true); return; }

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

  function handleShiftConfirm(choice) {
    setShiftModal(false);
    setShiftChoice(choice);
    setShiftDone(true);
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

        {/* Shift plan confirmation — shown after demo modal */}
        {shiftDone && (
          <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
            <ShiftPlanConfirmationCard
              shiftType={shiftChoice || 'shift'}
              mealName="Tonight's dinner"
              budgetImpact={0}
              wasteItems={[]}
              onViewPlan={function () { navigation.navigate('WeeklyDinnerPlan'); }}
              onDismiss={function () { setShiftDone(false); }}
            />
          </View>
        )}

        {/* Uber Eats sandbox status */}
        {uberStatus && (
          <View style={styles.uberPanel}>
            <View style={styles.uberPanelHeader}>
              <Text style={styles.uberPanelTitle}>Uber Eats Sandbox Status</Text>
              <TouchableOpacity onPress={function () { setUberStatus(false); }} activeOpacity={0.7}>
                <Feather name="x" size={18} color={GRAY} />
              </TouchableOpacity>
            </View>
            {UBER_STATUS.map(function (s) {
              return (
                <View key={s.label} style={styles.uberRow}>
                  <Text style={styles.uberRowLabel}>{s.label}</Text>
                  <View style={[styles.uberBadge, { backgroundColor: s.color + '20' }]}>
                    <Text style={[styles.uberBadgeText, { color: s.color }]}>{s.status}</Text>
                  </View>
                </View>
              );
            })}
            <Text style={styles.uberDisclaimer}>
              Uber Eats integration is in sandbox mode. No real orders are placed.
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      <MealShiftModal
        visible={shiftModal}
        mealName="Tonight's dinner (demo)"
        onShift={function ()  { handleShiftConfirm('shift'); }}
        onSkip={function ()   { handleShiftConfirm('skip');  }}
        onKeep={function ()   { handleShiftConfirm('keep');  }}
        onDismiss={function () { setShiftModal(false); }}
        wasteItems={[{ name: 'chicken' }, { name: 'salad greens' }]}
      />
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
  uberPanel: {
    marginHorizontal: 16, marginTop: 8,
    backgroundColor: WHITE, borderRadius: 16, borderWidth: 1,
    borderColor: '#FDE68A', padding: 16, gap: 10,
  },
  uberPanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  uberPanelTitle:  { fontSize: 14, fontWeight: '700', color: NAVY },
  uberRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  uberRowLabel:    { fontSize: 13, color: GRAY },
  uberBadge:       { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  uberBadgeText:   { fontSize: 11, fontWeight: '700' },
  uberDisclaimer:  { fontSize: 11, color: GRAY, lineHeight: 16, marginTop: 4 },
});

export default DemoAdminScreen;
