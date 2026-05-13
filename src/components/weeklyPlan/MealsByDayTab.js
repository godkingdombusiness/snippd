import React from 'react';
import { ScrollView, View, StyleSheet } from 'react-native';
import DaySummaryCard from './DaySummaryCard';
import { groupMealsByDay } from '../../utils/weeklyPlan/groupMealsByDay';

var CREAM = '#FAF8F1';

function MealsByDayTab(props) {
  var dayPlans = props.dayPlans || [];
  var meals = props.meals || [];
  var stores = props.stores || [];
  var navigation = props.navigation;

  var grouped = groupMealsByDay(dayPlans, meals);

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {dayPlans.map(function (dayPlan) {
        var entry = grouped.get(dayPlan.day_plan_id);
        var dayMeals = entry ? entry.meals : [];
        return (
          <DaySummaryCard
            key={dayPlan.day_plan_id}
            dayPlan={dayPlan}
            meals={dayMeals}
            stores={stores}
            onPress={function () {
              if (navigation) {
                navigation.navigate('ExpandedDayPlan', {
                  dayPlan: dayPlan,
                  meals: dayMeals,
                  stores: stores,
                });
              }
            }}
          />
        );
      })}
      <View style={styles.bottomPad} />
    </ScrollView>
  );
}

var styles = StyleSheet.create({
  scroll: {
    flex: 1,
    backgroundColor: CREAM,
  },
  content: {
    paddingTop: 12,
    paddingBottom: 24,
  },
  bottomPad: {
    height: 16,
  },
});

export default MealsByDayTab;
