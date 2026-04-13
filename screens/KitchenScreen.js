import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const BORDER = '#F0F1F3';
const AMBER = '#F59E0B';
const RED = '#EF4444';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const SHADOW_SM = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const SEED_ITEMS = [
  { id: '1', product_name: 'Chicken Breast', category: 'protein', quantity: 2, unit: 'lbs', expiry_days: 2 },
  { id: '2', product_name: 'Baby Spinach', category: 'produce', quantity: 1, unit: 'bag', expiry_days: 4 },
  { id: '3', product_name: 'Greek Yogurt', category: 'dairy', quantity: 3, unit: 'cups', expiry_days: 7 },
  { id: '4', product_name: 'Brown Rice', category: 'pantry', quantity: 1, unit: 'bag', expiry_days: 365 },
  { id: '5', product_name: 'Broccoli', category: 'produce', quantity: 1, unit: 'head', expiry_days: 5 },
  { id: '6', product_name: 'Eggs', category: 'dairy', quantity: 12, unit: 'count', expiry_days: 21 },
];

const CAT_COLORS = {
  protein: RED,
  produce: GREEN,
  dairy: '#3B82F6',
  pantry: AMBER,
  frozen: '#6366F1',
  snacks: '#A855F7',
  household: '#0EA5E9',
};

const getExpiryColor = (days) => {
  if (days <= 2) return RED;
  if (days <= 5) return AMBER;
  return GREEN;
};

const getExpiryLabel = (days) => {
  if (days <= 0) return 'Expired';
  if (days === 1) return 'Expires tomorrow';
  if (days <= 7) return `Expires in ${days} days`;
  return `${days} days left`;
};

export default function KitchenScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState([]);
  const [freshItems, setFreshItems] = useState([]);
  const [expiringItems, setExpiringItems] = useState([]);
  const [pantryItems, setPantryItems] = useState([]);
  const [activeTab, setActiveTab] = useState('all');

  const fetchItems = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setItems(SEED_ITEMS);
        categorize(SEED_ITEMS);
        return;
      }

      const { data } = await supabase
        .from('food_waste_log')
        .select('*')
        .eq('user_id', user.id)
        .order('expiry_days', { ascending: true });

      const allItems = data?.length > 0 ? data : SEED_ITEMS;
      setItems(allItems);
      categorize(allItems);
    } catch (e) {
      
      setItems(SEED_ITEMS);
      categorize(SEED_ITEMS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const categorize = (allItems) => {
    setExpiringItems(allItems.filter(i => i.expiry_days <= 5));
    setFreshItems(allItems.filter(i =>
      ['produce', 'protein', 'dairy'].includes(i.category) && i.expiry_days > 5
    ));
    setPantryItems(allItems.filter(i =>
      ['pantry', 'frozen', 'snacks', 'household'].includes(i.category)
    ));
  };

  useEffect(() => { fetchItems(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchItems(); };

  const markUsed = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    try {
      await supabase.from('food_waste_log').delete().eq('id', id);
    } catch (e) {}
  };

  const displayItems = activeTab === 'all' ? items
    : activeTab === 'expiring' ? expiringItems
    : activeTab === 'fresh' ? freshItems
    : pantryItems;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Kitchen</Text>
        <TouchableOpacity
          style={styles.chefBtn}
          onPress={() => navigation.navigate('ChefStash', {
            stack: null, ingredients: items, fromPantry: true,
          })}
        >
          <Text style={styles.chefBtnTxt}>Chef Stash</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >
        {/* Stats row */}
        <View style={styles.pad}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{items.length}</Text>
              <Text style={styles.statLabel}>Total Items</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: RED }]}>{expiringItems.length}</Text>
              <Text style={styles.statLabel}>Expiring Soon</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: GREEN }]}>{freshItems.length}</Text>
              <Text style={styles.statLabel}>Fresh</Text>
            </View>
          </View>
        </View>

        {/* Expiring alert */}
        {expiringItems.length > 0 && (
          <View style={styles.pad}>
            <View style={styles.alertCard}>
              <View style={styles.alertDot} />
              <View style={styles.alertInfo}>
                <Text style={styles.alertTitle}>
                  {expiringItems.length} item{expiringItems.length !== 1 ? 's' : ''} expiring soon
                </Text>
                <Text style={styles.alertSub}>
                  Use these first to avoid waste
                </Text>
              </View>
              <TouchableOpacity
                style={styles.alertBtn}
                onPress={() => navigation.navigate('ChefStash', {
                  stack: null, ingredients: expiringItems, fromPantry: true,
                })}
              >
                <Text style={styles.alertBtnTxt}>Get Recipe</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Filter tabs */}
        <View style={styles.pad}>
          <View style={styles.tabRow}>
            {[
              { key: 'all', label: `All (${items.length})` },
              { key: 'expiring', label: `Expiring (${expiringItems.length})` },
              { key: 'fresh', label: `Fresh (${freshItems.length})` },
              { key: 'pantry', label: `Pantry (${pantryItems.length})` },
            ].map(tab => (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, activeTab === tab.key && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
              >
                <Text style={[styles.tabTxt, activeTab === tab.key && styles.tabTxtActive]}>
                  {tab.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Items list */}
        <View style={styles.pad}>
          <View style={styles.card}>
            {displayItems.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No items here</Text>
                <Text style={styles.emptySub}>Add items from your pantry or shopping trips</Text>
              </View>
            ) : (
              displayItems.map((item, i) => {
                const catColor = CAT_COLORS[item.category] || GRAY;
                const expiryColor = getExpiryColor(item.expiry_days);
                return (
                  <View
                    key={item.id}
                    style={[
                      styles.itemRow,
                      i === displayItems.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    <View style={[styles.itemCatDot, { backgroundColor: catColor }]} />
                    <View style={styles.itemInfo}>
                      <Text style={styles.itemName}>{item.product_name}</Text>
                      <Text style={styles.itemMeta}>
                        {item.quantity} {item.unit} · {item.category}
                      </Text>
                      <Text style={[styles.itemExpiry, { color: expiryColor }]}>
                        {getExpiryLabel(item.expiry_days)}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.usedBtn}
                      onPress={() => markUsed(item.id)}
                    >
                      <Text style={styles.usedBtnTxt}>Used</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        </View>

        {/* Chef Stash CTA */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.chefCard}
            onPress={() => navigation.navigate('ChefStash', {
              stack: null, ingredients: items, fromPantry: true,
            })}
            activeOpacity={0.88}
          >
            <View>
              <Text style={styles.chefCardTitle}>Cook from your kitchen</Text>
              <Text style={styles.chefCardSub}>
                Chef Stash will build a recipe from what you have
              </Text>
            </View>
            <Text style={styles.chefCardArrow}>›</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  pad: { paddingHorizontal: 16, marginTop: 14 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  chefBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  chefBtnTxt: { color: WHITE, fontSize: 12, fontWeight: 'bold' },

  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER, ...SHADOW_SM,
  },
  statVal: { fontSize: 22, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  statLabel: { fontSize: 10, color: GRAY, fontWeight: 'normal', textAlign: 'center' },

  alertCard: {
    backgroundColor: '#FEF2F2', borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 1, borderColor: '#FECACA',
  },
  alertDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  alertInfo: { flex: 1 },
  alertTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  alertSub: { fontSize: 12, color: GRAY },
  alertBtn: {
    backgroundColor: RED, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
  },
  alertBtnTxt: { color: WHITE, fontSize: 12, fontWeight: 'bold' },

  tabRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER,
  },
  tabActive: { backgroundColor: NAVY, borderColor: NAVY },
  tabTxt: { fontSize: 11, fontWeight: 'normal', color: NAVY },
  tabTxtActive: { color: WHITE, fontWeight: 'bold' },

  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 10,
  },
  itemCatDot: { width: 10, height: 10, borderRadius: 5 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  itemMeta: { fontSize: 11, color: GRAY, marginBottom: 2 },
  itemExpiry: { fontSize: 11, fontWeight: 'bold' },
  usedBtn: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  usedBtnTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },

  emptyState: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  emptySub: { fontSize: 13, color: GRAY, textAlign: 'center' },

  chefCard: {
    backgroundColor: NAVY, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...SHADOW,
  },
  chefCardTitle: { fontSize: 15, fontWeight: 'bold', color: WHITE, marginBottom: 3 },
  chefCardSub: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  chefCardArrow: { fontSize: 28, color: 'rgba(255,255,255,0.4)' },
});