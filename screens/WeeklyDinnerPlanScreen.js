import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

import WeeklyPlanHeroCard from '../src/components/weeklyPlan/WeeklyPlanHeroCard';
import PlanTabBar from '../src/components/weeklyPlan/PlanTabBar';
import MealsByDayTab from '../src/components/weeklyPlan/MealsByDayTab';
import StorePlanTab from '../src/components/weeklyPlan/StorePlanTab';
import NutritionComplianceTab from '../src/components/weeklyPlan/NutritionComplianceTab';
import MealTypeFilterBar from '../src/components/weeklyPlan/MealTypeFilterBar';
import MealShiftModal from '../src/components/weeklyPlan/MealShiftModal';

import {
  SEEDED_WEEKLY_PLAN,
  SEEDED_DAY_PLANS,
  SEEDED_MEALS,
  SEEDED_STORES,
  SEEDED_NUTRITION,
  SEEDED_USER_PROFILE,
} from '../src/utils/weeklyPlan/seededPlanData';

var CREAM = '#FAF8F1';
var NAVY = '#172250';
var GREEN = '#0C9E54';
var GRAY = '#6B7280';
var WHITE = '#FFFFFF';
var BORDER = '#E5E7EB';

function WeeklyDinnerPlanScreen(props) {
  var navigation = props.navigation;
  var route = props.route;

  var [activeTab, setActiveTab]         = useState('meals');
  var [weeklyPlan, setWeeklyPlan]       = useState(null);
  var [dayPlans, setDayPlans]           = useState([]);
  var [meals, setMeals]                 = useState([]);
  var [stores, setStores]               = useState([]);
  var [nutrition, setNutrition]         = useState([]);
  var [userProfile, setUserProfile]     = useState(SEEDED_USER_PROFILE);
  var [activeMealType, setMealType]     = useState('all');
  var [shiftModalVisible, setShiftModal] = useState(false);

  useEffect(function () {
    // Load seeded data synchronously — no Supabase call yet
    setWeeklyPlan(SEEDED_WEEKLY_PLAN);
    setDayPlans(SEEDED_DAY_PLANS);
    setMeals(SEEDED_MEALS);
    setStores(SEEDED_STORES);
    setNutrition(SEEDED_NUTRITION);
  }, []);

  function handleBack() {
    if (navigation && navigation.canGoBack()) {
      navigation.goBack();
    }
  }

  function handleRefresh() {
    // No-op for seeded data; real implementation would re-fetch
  }

  function handleShift()  { setShiftModal(false); }
  function handleSkip()   { setShiftModal(false); }
  function handleKeep()   { setShiftModal(false); }

  if (!weeklyPlan) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading plan...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      {/* Top nav bar */}
      <View style={styles.navBar}>
        <TouchableOpacity style={styles.navButton} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Weekly Dinner Plan</Text>
        <TouchableOpacity style={styles.navButton} onPress={handleRefresh} activeOpacity={0.7}>
          <Feather name="refresh-cw" size={20} color={NAVY} />
        </TouchableOpacity>
      </View>

      {/* Hero card — not part of tab scroll */}
      <WeeklyPlanHeroCard
        plan={weeklyPlan}
        stores={stores}
      />

      {/* Tab bar */}
      <PlanTabBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />

      {/* Meal type filter — visible only on meals tab */}
      {activeTab === 'meals' && (
        <MealTypeFilterBar
          activeMealType={activeMealType}
          onFilterChange={setMealType}
        />
      )}

      {/* Change tonight CTA */}
      {activeTab === 'meals' && (
        <TouchableOpacity
          style={styles.shiftCta}
          onPress={function () { setShiftModal(true); }}
          activeOpacity={0.8}
        >
          <Feather name="shuffle" size={14} color={GREEN} />
          <Text style={styles.shiftCtaText}>Change tonight's plan</Text>
        </TouchableOpacity>
      )}

      {/* Tab content — each tab manages its own scroll */}
      <View style={styles.tabContent}>
        {activeTab === 'meals' && (
          <MealsByDayTab
            dayPlans={dayPlans}
            meals={meals}
            stores={stores}
            navigation={navigation}
          />
        )}
        {activeTab === 'store' && (
          <StorePlanTab
            stores={stores}
            meals={meals}
            dayPlans={dayPlans}
            weeklyPlan={weeklyPlan}
            navigation={navigation}
          />
        )}
        {activeTab === 'nutrition' && (
          <NutritionComplianceTab
            meals={meals}
            nutrition={nutrition}
            userProfile={userProfile}
            stores={stores}
            navigation={navigation}
          />
        )}
      </View>

      <MealShiftModal
        visible={shiftModalVisible}
        mealName="Tonight's dinner"
        onShift={handleShift}
        onSkip={handleSkip}
        onKeep={handleKeep}
        onDismiss={function () { setShiftModal(false); }}
        wasteItems={[]}
      />
    </SafeAreaView>
  );
}

var styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: CREAM,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 16,
    color: GRAY,
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: CREAM,
  },
  navButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
  },
  navTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: NAVY,
  },
  tabContent: {
    flex: 1,
  },
  shiftCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 6,
  },
  shiftCtaText: { fontSize: 13, fontWeight: '600', color: GREEN },
});

export default WeeklyDinnerPlanScreen;
