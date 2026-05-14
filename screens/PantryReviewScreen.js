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
import PantryItemCard from '../src/components/pantry/PantryItemCard';
import { returnSeededPantryScan } from '../src/services/pantryVisionService';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

function PantryReviewScreen(props) {
  var navigation = props.navigation;
  var params = props.route ? props.route.params : {};
  var initialItems = params.items || returnSeededPantryScan();

  var [items, setItems]   = useState(initialItems);
  var [kept, setKept]     = useState({});

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleKeep(id) {
    setKept(function (prev) {
      var next = Object.assign({}, prev);
      next[id] = !prev[id];
      return next;
    });
  }

  function handleRemove(id) {
    setItems(function (prev) { return prev.filter(function (i) { return i.id !== id; }); });
    setKept(function (prev) {
      var next = Object.assign({}, prev);
      delete next[id];
      return next;
    });
  }

  function handleEdit(updatedItem) {
    setItems(function (prev) {
      return prev.map(function (i) { return i.id === updatedItem.id ? updatedItem : i; });
    });
  }

  var keptCount    = Object.values(kept).filter(Boolean).length;
  var detectedCount = items.length;

  function handleUseItems() {
    var keptItems = items.filter(function (i) { return kept[i.id]; });
    if (keptItems.length === 0) {
      keptItems = items;
    }
    navigation.navigate('WeeklyDinnerPlan');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Pantry Review</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Header summary */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{detectedCount}</Text>
          <Text style={styles.summaryLabel}>Detected</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={[styles.summaryNum, { color: GREEN }]}>{keptCount}</Text>
          <Text style={styles.summaryLabel}>Confirmed</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNum}>{detectedCount - keptCount}</Text>
          <Text style={styles.summaryLabel}>Unreviewed</Text>
        </View>
      </View>

      <Text style={styles.hint}>
        Confirm what looks right. Edit names that are off. Remove anything wrong.
      </Text>

      <FlatList
        data={items}
        keyExtractor={function (item) { return item.id; }}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={function ({ item }) {
          return (
            <PantryItemCard
              item={item}
              kept={!!kept[item.id]}
              onKeep={function () { handleKeep(item.id); }}
              onRemove={function () { handleRemove(item.id); }}
              onEdit={handleEdit}
            />
          );
        }}
        ItemSeparatorComponent={function () { return <View style={{ height: 8 }} />; }}
        ListFooterComponent={function () { return <View style={{ height: 100 }} />; }}
      />

      {/* Sticky CTA */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={handleUseItems}
          activeOpacity={0.85}
        >
          <Feather name="check-circle" size={17} color={WHITE} />
          <Text style={styles.primaryBtnText}>
            {keptCount > 0
              ? 'Use ' + keptCount + ' item' + (keptCount === 1 ? '' : 's') + ' in my plan'
              : 'Use these items in my plan'}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.skipBtn} onPress={handleBack} activeOpacity={0.7}>
          <Text style={styles.skipBtnText}>Skip pantry step</Text>
        </TouchableOpacity>
      </View>
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
    paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    paddingVertical: 12,
    alignItems: 'center',
  },
  summaryNum:   { fontSize: 22, fontWeight: '800', color: NAVY, marginBottom: 2 },
  summaryLabel: { fontSize: 11, color: GRAY, fontWeight: '500' },
  hint: {
    fontSize: 13,
    color: GRAY,
    lineHeight: 18,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  list: { paddingHorizontal: 16 },
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: CREAM,
    borderTopWidth: 1,
    borderTopColor: BORDER,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 8,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  skipBtn:        { alignItems: 'center', paddingVertical: 8 },
  skipBtnText:    { fontSize: 14, color: GRAY, fontWeight: '500' },
});

export default PantryReviewScreen;
