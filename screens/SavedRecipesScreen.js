import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

var SEEDED_SAVED = [
  {
    id: 'sr001', name: 'Chicken Rice Bowls', meal_type: 'Dinner',
    saved_at: '2026-05-10', notes: 'Family favorite. Double the rice.',
    is_user_accessible: true,
  },
  {
    id: 'sr002', name: 'Sheet Pan Salmon', meal_type: 'Dinner',
    saved_at: '2026-05-08', notes: 'Under 30 min. Works well with air fryer too.',
    is_user_accessible: true,
  },
  {
    id: 'sr003', name: 'Overnight Oats', meal_type: 'Breakfast',
    saved_at: '2026-05-06', notes: '',
    is_user_accessible: true,
  },
  {
    id: 'sr004', name: 'Black Bean Tacos', meal_type: 'Lunch',
    saved_at: '2026-05-04', notes: 'Use corn tortillas. Add lime.',
    is_user_accessible: true,
  },
  {
    id: 'sr005', name: 'Pasta Primavera', meal_type: 'Dinner',
    saved_at: '2026-05-01', notes: '',
    is_user_accessible: true,
  },
];

function formatDate(dateStr) {
  var parts = dateStr.split('-');
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[parseInt(parts[1], 10) - 1] + ' ' + parseInt(parts[2], 10);
}

function RecipeRow(item, onCook, onRemove) {
  return (
    <View style={rowStyles.card}>
      <View style={rowStyles.info}>
        <View style={rowStyles.topRow}>
          <Text style={rowStyles.name}>{item.name}</Text>
          <Text style={rowStyles.date}>{formatDate(item.saved_at)}</Text>
        </View>
        <Text style={rowStyles.type}>{item.meal_type}</Text>
        {item.notes ? <Text style={rowStyles.notes}>{item.notes}</Text> : null}
        <View style={rowStyles.ctaRow}>
          <TouchableOpacity
            style={rowStyles.cookBtn}
            onPress={function () { onCook(item); }}
            activeOpacity={0.8}
          >
            <Feather name="book-open" size={13} color={GREEN} />
            <Text style={rowStyles.cookBtnText}>How to cook</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TouchableOpacity
        style={rowStyles.removeBtn}
        onPress={function () { onRemove(item.id); }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        activeOpacity={0.7}
      >
        <Feather name="bookmark" size={16} color={GREEN} />
      </TouchableOpacity>
    </View>
  );
}

function SavedRecipesScreen(props) {
  var navigation = props.navigation;
  var [saved, setSaved] = useState(SEEDED_SAVED);

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleCook(recipe) {
    navigation.navigate('ContextualCooking', {
      meal: { meal_id: recipe.id, meal_name: recipe.name, ingredients: [] },
    });
  }

  function handleRemove(id) {
    setSaved(function (prev) { return prev.filter(function (r) { return r.id !== id; }); });
    tracker.track('recipe_saved', { action: 'unsave', recipe_id: id });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Saved Recipes</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Ownership banner */}
      <View style={styles.ownerBanner}>
        <Feather name="shield" size={14} color={GREEN} />
        <Text style={styles.ownerText}>
          Your saved recipes stay yours — even if your plan changes.
        </Text>
      </View>

      <FlatList
        data={saved}
        keyExtractor={function (r) { return r.id; }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={function ({ item }) { return RecipeRow(item, handleCook, handleRemove); }}
        ItemSeparatorComponent={function () { return <View style={{ height: 10 }} />; }}
        ListEmptyComponent={function () {
          return (
            <View style={styles.empty}>
              <Feather name="bookmark" size={32} color={BORDER} />
              <Text style={styles.emptyTitle}>No saved recipes yet</Text>
              <Text style={styles.emptySub}>
                Tap the bookmark icon on any meal to save it here. Your history stays accessible.
              </Text>
            </View>
          );
        }}
        ListFooterComponent={function () { return <View style={{ height: 40 }} />; }}
      />
    </SafeAreaView>
  );
}

var rowStyles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
    gap: 12,
  },
  info:   { flex: 1, gap: 4 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  name:   { fontSize: 15, fontWeight: '700', color: NAVY, flex: 1 },
  date:   { fontSize: 11, color: GRAY, marginLeft: 8 },
  type:   { fontSize: 12, color: GRAY },
  notes:  { fontSize: 12, color: NAVY, fontStyle: 'italic', lineHeight: 17 },
  ctaRow: { marginTop: 4 },
  cookBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start' },
  cookBtnText: { fontSize: 12, color: GREEN, fontWeight: '700' },
  removeBtn: { paddingTop: 2 },
});

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
    borderRadius: 10, backgroundColor: WHITE, borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  ownerBanner: {
    flexDirection: 'row', gap: 8, alignItems: 'flex-start',
    backgroundColor: MINT, marginHorizontal: 16, borderRadius: 12,
    padding: 12, marginBottom: 14,
  },
  ownerText: { flex: 1, fontSize: 13, color: NAVY, fontWeight: '500', lineHeight: 18 },
  list: { paddingHorizontal: 16 },
  empty: { alignItems: 'center', paddingTop: 60, paddingHorizontal: 24, gap: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  emptySub:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20 },
});

export default SavedRecipesScreen;
