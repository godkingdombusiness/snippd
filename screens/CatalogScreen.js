import React, { useState, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator, RefreshControl,
  Dimensions, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { supabase } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
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

// app_home_feed stores pay_price / save_price as dollar values, not cents
const fmt = (val) => '$' + (Number(val) || 0).toFixed(2);

// Category accent colors + PNG icons
const CAT_ACCENTS = {
  protein:    { bg: '#FEF2F2', accent: '#EF4444', label: 'Protein',    img: require('../assets/cat-protein.png') },
  produce:    { bg: '#F0FDF4', accent: GREEN,      label: 'Produce',    img: require('../assets/cat-veggies.png') },
  dairy:      { bg: '#EFF6FF', accent: '#3B82F6',  label: 'Dairy',      img: require('../assets/cat-dairy.png') },
  pantry:     { bg: '#FFF7ED', accent: AMBER,      label: 'Pantry',     img: require('../assets/cat-pantry.png') },
  snacks:     { bg: '#FDF4FF', accent: '#A855F7',  label: 'Snacks',     img: require('../assets/cat-snacks.png') },
  household:  { bg: '#F0F9FF', accent: '#0EA5E9',  label: 'Household',  img: require('../assets/cat-household.png') },
  breakfast:  { bg: '#FFFBEB', accent: '#D97706',  label: 'Breakfast',  img: require('../assets/cat-fruits.png') },
  frozen:     { bg: '#EFF6FF', accent: '#6366F1',  label: 'Frozen',     img: require('../assets/cat-dairy.png') },
  beverages:  { bg: '#ECFDF5', accent: '#10B981',  label: 'Beverages',  img: require('../assets/cat-fruits.png') },
  bogo:       { bg: '#FFF1F2', accent: '#F43F5E',  label: 'BOGO',       img: require('../assets/cat-bogo.png') },
  other:      { bg: OFF_WHITE, accent: GRAY,       label: 'Other',      img: require('../assets/cat-pantry.png') },
};

const getCatStyle = (name) => {
  if (!name) return CAT_ACCENTS.other;
  const n = name.toLowerCase();
  if (n.includes('protein') || n.includes('meat') || n.includes('carnivore')) return CAT_ACCENTS.protein;
  if (n.includes('produce') || n.includes('veg') || n.includes('fruit') || n.includes('plant')) return CAT_ACCENTS.produce;
  if (n.includes('dairy') || n.includes('milk') || n.includes('egg')) return CAT_ACCENTS.dairy;
  if (n.includes('pantry') || n.includes('pasta') || n.includes('sauce')) return CAT_ACCENTS.pantry;
  if (n.includes('snack') || n.includes('chip') || n.includes('cracker')) return CAT_ACCENTS.snacks;
  if (n.includes('household') || n.includes('clean') || n.includes('laundry')) return CAT_ACCENTS.household;
  if (n.includes('breakfast') || n.includes('cereal') || n.includes('oat')) return CAT_ACCENTS.breakfast;
  if (n.includes('frozen')) return CAT_ACCENTS.frozen;
  if (n.includes('bever') || n.includes('drink') || n.includes('juice')) return CAT_ACCENTS.beverages;
  if (n.includes('bogo')) return CAT_ACCENTS.bogo;
  return CAT_ACCENTS.other;
};

// Official retailer brand colors
const STORE_BRAND = {
  target:         { bg: '#CC0000', text: '#FFFFFF' },
  dollar_general: { bg: '#FFCD00', text: '#1A1A1A' },
  dollar_tree:    { bg: '#6D2D8B', text: '#FFFFFF' },
  publix:         { bg: '#1B7A3E', text: '#FFFFFF' },
  cvs:            { bg: '#CC0000', text: '#FFFFFF' },
  walgreens:      { bg: '#E31837', text: '#FFFFFF' },
  aldi:           { bg: '#00448E', text: '#FFFFFF' },
  kroger:         { bg: '#003082', text: '#FFFFFF' },
  walmart:        { bg: '#0071CE', text: '#FFFFFF' },
  sprouts:        { bg: '#5A8E3A', text: '#FFFFFF' },
  whole_foods:    { bg: '#00674B', text: '#FFFFFF' },
  heb:            { bg: '#E31837', text: '#FFFFFF' },
  trader_joes:    { bg: '#B22222', text: '#FFFFFF' },
};
const getStoreBrand = (raw) => {
  if (!raw) return { bg: GREEN, text: '#FFFFFF' };
  const key = (raw || '').toLowerCase().replace(/[\s']+/g, '_');
  if (STORE_BRAND[key]) return STORE_BRAND[key];
  const match = Object.keys(STORE_BRAND).find(k => key.includes(k));
  return match ? STORE_BRAND[match] : { bg: GREEN, text: '#FFFFFF' };
};
const parseBdList = (raw) => Array.isArray(raw) ? raw
  : (typeof raw === 'string' ? (() => { try { return JSON.parse(raw); } catch { return []; } })() : []);

const STORE_CHIPS = [
  { key: 'all', label: 'All Stores' },
  { key: 'publix', label: 'Publix' },
  { key: 'dollar_general', label: 'Dollar General' },
  { key: 'aldi', label: 'Aldi' },
  { key: 'target', label: 'Target' },
  { key: 'walgreens', label: 'Walgreens' },
];

const SORT_OPTIONS = [
  { key: 'count', label: 'Most Stacks' },
  { key: 'savings', label: 'Best Savings' },
  { key: 'name', label: 'A to Z' },
];

const CARD_WIDTH = (width - 52) / 2;

export default function CatalogScreen({ navigation }) {
  const [categories, setCategories] = useState([]);
  const [topStacks, setTopStacks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [activeStore, setActiveStore] = useState('all');
  const [activeSort, setActiveSort] = useState('count');
  const [totalStacks, setTotalStacks] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);

  const loadData = useCallback(async () => {
    try {
      // Fetch all stacks from app_home_feed
      // Note: uses meal_type as category — app_home_feed has no 'category' column
      const { data, error } = await supabase
        .from('app_home_feed')
        .select('id, title, meal_type, retailer, save_price, pay_price, breakdown_list, dietary_tags, card_type')
        .eq('status', 'active')
        .eq('verification_status', 'verified_live');

      if (error) throw error;

      // Normalize — pay_price / save_price are dollar amounts in app_home_feed
      const stacks = (data || []).map(s => ({
        ...s,
        stack_name:    s.title || 'Untitled Stack',
        store:         s.retailer,
        category:      s.meal_type || s.card_type || 'Other',
        total_savings: Number(s.save_price) || 0,
        oop_total:     Number(s.pay_price)  || 0,
        retail_total:  (Number(s.pay_price) || 0) + (Number(s.save_price) || 0),
      }));
      setTotalStacks(stacks.length);
      setTotalSavings(stacks.reduce((s, st) => s + (st.total_savings || 0), 0));

      // Filter by store
      const filtered = activeStore === 'all'
        ? stacks
        : stacks.filter(s => (s.store || '').toLowerCase().includes(activeStore));

      // Build category groups using meal_type
      const grouped = {};
      filtered.forEach(stack => {
        const cat = stack.category || 'Other';
        const catKey = cat.toLowerCase().replace(/[^a-z]/g, '_');
        if (!grouped[cat]) {
          grouped[cat] = {
            name: cat,
            count: 0,
            totalSavings: 0,
            avgSavings: 0,
            stacks: [],
          };
        }
        grouped[cat].count += 1;
        grouped[cat].totalSavings += stack.total_savings || 0;
        grouped[cat].stacks.push(stack);
      });

      // Calculate averages
      Object.values(grouped).forEach(cat => {
        cat.avgSavings = cat.count > 0 ? Math.round(cat.totalSavings / cat.count) : 0;
      });

      // Sort
      let sorted = Object.values(grouped);
      if (activeSort === 'count') sorted.sort((a, b) => b.count - a.count);
      if (activeSort === 'savings') sorted.sort((a, b) => b.avgSavings - a.avgSavings);
      if (activeSort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name));

      setCategories(sorted);

      // Top stacks — highest yield
      const top = [...stacks]
        .filter(s => s.retail_total > 0)
        .sort((a, b) => {
          const yA = (a.total_savings / a.retail_total) * 100;
          const yB = (b.total_savings / b.retail_total) * 100;
          return yB - yA;
        })
        .slice(0, 5);
      setTopStacks(top);

    } catch (e) {
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeStore, activeSort]);

  // Refresh every time this screen comes into focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const onRefresh = () => { setRefreshing(true); loadData(); };

  const handleSearchSubmit = async () => {
    if (!search.trim()) return;
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      tracker.trackSearchPerformed({
        user_id: userId,
        session_id: session.access_token || String(Date.now()),
        screen_name: 'CatalogScreen',
        search_query: search.trim(),
        search_category: activeStore,
      });
    }
  };

  const openCategory = (category) => {
    // Open the best-yielding stack in this category
    if (category.stacks?.length > 0) {
      const best = [...category.stacks].sort(
        (a, b) => (b.total_savings / (b.retail_total || 1)) - (a.total_savings / (a.retail_total || 1))
      )[0];
      openStack(best);
    }
  };

  const openStack = (stack) => {
    const stackObj = {
      id:             stack.id,
      stack_name:     stack.stack_name,
      store:          (stack.store || stack.retailer || '').toLowerCase().replace(/[\s']+/g, '_'),
      retailer:       stack.retailer || stack.store || '',
      retail_total:   stack.retail_total * 100,   // StackDetailScreen expects cents
      oop_total:      stack.oop_total * 100,
      total_savings:  stack.total_savings * 100,
      breakdown_list: parseBdList(stack.breakdown_list),
      item_ids:       [],
    };
    navigation.navigate('StackDetail', { stack: stackObj });
  };

  const filtered = categories.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  const yieldPct = (s) => {
    if (!s.retail_total || s.retail_total === 0) return 0;
    return Math.round((s.total_savings / s.retail_total) * 100);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Loading catalog...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Catalog</Text>
          <Text style={styles.topSub}>
            {totalStacks} stacks · {categories.length} categories
          </Text>
        </View>
        <View style={styles.topSavingsBadge}>
          <Text style={styles.topSavingsLabel}>Total Savings</Text>
          <Text style={styles.topSavingsVal}>{fmt(totalSavings)}</Text>
        </View>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.name}
        numColumns={2}
        columnWrapperStyle={styles.row}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
        ListHeaderComponent={() => (
          <View>
            {/* ── SEARCH ──────────────────────────────────────────────── */}
            <View style={styles.searchWrap}>
              <View style={styles.searchBar}>
                <Text style={styles.searchIcon}>⌕</Text>
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search categories..."
                  placeholderTextColor="#C4C9D6"
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                  onSubmitEditing={handleSearchSubmit}
                />
                {search.length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <Text style={styles.searchClear}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* ── STORE FILTER CHIPS ──────────────────────────────────── */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.storeChips}
              style={styles.storeChipsWrap}
            >
              {STORE_CHIPS.map(chip => (
                <TouchableOpacity
                  key={chip.key}
                  style={[styles.storeChip, activeStore === chip.key && styles.storeChipOn]}
                  onPress={() => setActiveStore(chip.key)}
                >
                  <Text style={[
                    styles.storeChipTxt,
                    activeStore === chip.key && styles.storeChipTxtOn,
                  ]}>
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            {/* ── SORT CHIPS ──────────────────────────────────────────── */}
            <View style={styles.sortRow}>
              <Text style={styles.sortLabel}>Sort by</Text>
              <View style={styles.sortChips}>
                {SORT_OPTIONS.map(opt => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.sortChip, activeSort === opt.key && styles.sortChipOn]}
                    onPress={() => setActiveSort(opt.key)}
                  >
                    <Text style={[
                      styles.sortChipTxt,
                      activeSort === opt.key && styles.sortChipTxtOn,
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* ── TOP STACKS ──────────────────────────────────────────── */}
            {topStacks.length > 0 && !search && (
              <View style={styles.topStacksWrap}>
                <View style={styles.sectionHead}>
                  <Text style={styles.sectionTitle}>Top Savings Right Now</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('HomeTab')}>
                    <Text style={styles.sectionLink}>See all</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.topStacksList}
                >
                  {topStacks.map(stack => {
                    const y         = yieldPct(stack);
                    const retailer  = stack.retailer || stack.store || '';
                    const brand     = getStoreBrand(retailer);
                    return (
                      <TouchableOpacity
                        key={stack.id}
                        style={styles.topStackCard}
                        onPress={() => openStack(stack)}
                        activeOpacity={0.88}
                      >
                        {/* Branded image wrapper */}
                        <View style={styles.topStackImageContainer}>
                          <Image
                            source={{ uri: stack.img || `https://source.unsplash.com/featured/?${encodeURIComponent((stack.meal_type || stack.card_type || 'grocery').toLowerCase())},grocery` }}
                            style={styles.topStackImg}
                            resizeMode="cover"
                          />
                          <LinearGradient
                            colors={['transparent', 'rgba(13, 27, 75, 0.88)']}
                            style={styles.topStackGradient}
                          />
                          {y > 0 && (
                            <View style={styles.topStackYieldBadge}>
                              <Text style={styles.topStackYieldTxt}>{y}% yield</Text>
                            </View>
                          )}
                        </View>

                        <View style={styles.topStackBody}>
                          {/* Store brand color chip */}
                          <View style={[styles.storeBrandChip, { backgroundColor: brand.bg }]}>
                            <Text style={[styles.storeBrandChipTxt, { color: brand.text }]}>
                              {retailer.toUpperCase()}
                            </Text>
                          </View>
                          <Text style={styles.topStackName} numberOfLines={2}>
                            {stack.stack_name}
                          </Text>
                          <View style={styles.topStackPriceRow}>
                            <Text style={styles.topStackPrice}>
                              {fmt(stack.oop_total)}
                            </Text>
                            <Text style={styles.topStackSave}>
                              Save {fmt(stack.total_savings)}
                            </Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            {/* Category grid label */}
            <View style={styles.catGridHead}>
              <Text style={styles.sectionTitle}>
                {search ? `${filtered.length} result${filtered.length !== 1 ? 's' : ''}` : 'All Categories'}
              </Text>
            </View>
          </View>
        )}
        renderItem={({ item, index }) => {
          const catStyle = getCatStyle(item.name);
          const isLeft = index % 2 === 0;
          return (
            <TouchableOpacity
              style={[styles.catCard, { marginRight: isLeft ? 6 : 0 }]}
              onPress={() => openCategory(item)}
              activeOpacity={0.88}
            >
              {/* PNG image band */}
              <View style={[styles.catBand, { backgroundColor: catStyle.bg }]}>
                {catStyle.img ? (
                  <Image source={catStyle.img} style={styles.catBandImg} resizeMode="contain" />
                ) : (
                  <View style={[styles.catBandCircle, { backgroundColor: catStyle.accent + '22' }]}>
                    <View style={[styles.catBandDot, { backgroundColor: catStyle.accent }]} />
                  </View>
                )}
                <View style={styles.catStackCount}>
                  <Text style={[styles.catStackCountNum, { color: catStyle.accent }]}>
                    {item.count}
                  </Text>
                  <Text style={[styles.catStackCountLabel, { color: catStyle.accent }]}>
                    {item.count === 1 ? 'stack' : 'stacks'}
                  </Text>
                </View>
              </View>

              {/* Card body */}
              <View style={styles.catBody}>
                <Text style={styles.catName} numberOfLines={2}>{item.name}</Text>
                <View style={styles.catSavingsRow}>
                  <Text style={styles.catSavingsLabel}>Avg save</Text>
                  <Text style={[styles.catSavingsVal, { color: catStyle.accent }]}>
                    {fmt(item.avgSavings)}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={() => (
          <View style={styles.emptyState}>
            {loading ? (
              <ActivityIndicator color={GREEN} size="large" />
            ) : (
              <>
                <Text style={styles.emptyTitle}>No categories found</Text>
                <Text style={styles.emptySubtitle}>Try a different search or store filter</Text>
                <TouchableOpacity
                  style={styles.emptyClearBtn}
                  onPress={() => { setSearch(''); setActiveStore('all'); }}
                >
                  <Text style={styles.emptyClearBtnTxt}>Clear Filters</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
        ListFooterComponent={() => <View style={{ height: 100 }} />}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  topTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  topSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  topSavingsBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 8,
    alignItems: 'center',
  },
  topSavingsLabel: { fontSize: 9, fontWeight: 'bold', color: GREEN, letterSpacing: 0.5, marginBottom: 2 },
  topSavingsVal: { fontSize: 15, fontWeight: 'bold', color: GREEN },

  // LIST
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  row: { justifyContent: 'space-between', marginBottom: 12 },

  // SEARCH
  searchWrap: { paddingTop: 14, paddingBottom: 4 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1.5, borderColor: BORDER,
    gap: 10, ...SHADOW_SM,
  },
  searchIcon: { fontSize: 18, color: GRAY },
  searchInput: { flex: 1, fontSize: 14, color: NAVY, fontWeight: 'normal' },
  searchClear: { fontSize: 14, color: GRAY },

  // STORE CHIPS
  storeChipsWrap: { marginTop: 10 },
  storeChips: { gap: 7 },
  storeChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER, ...SHADOW_SM,
  },
  storeChipOn: { backgroundColor: NAVY, borderColor: NAVY },
  storeChipTxt: { fontSize: 12, fontWeight: 'normal', color: NAVY },
  storeChipTxtOn: { color: WHITE },

  // SORT
  sortRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 12, gap: 10,
  },
  sortLabel: { fontSize: 12, fontWeight: 'normal', color: GRAY },
  sortChips: { flexDirection: 'row', gap: 6 },
  sortChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1.5, borderColor: BORDER,
  },
  sortChipOn: { backgroundColor: GREEN, borderColor: GREEN },
  sortChipTxt: { fontSize: 11, fontWeight: 'normal', color: NAVY },
  sortChipTxtOn: { color: WHITE, fontWeight: 'bold' },

  // TOP STACKS
  topStacksWrap: { marginTop: 20 },
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3 },
  sectionLink: { fontSize: 13, fontWeight: 'bold', color: GREEN },
  topStacksList: { gap: 10, paddingBottom: 4 },
  topStackCard: {
    width: width * 0.56,
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  topStackImageContainer: {
    width: '100%', height: 100, position: 'relative',
  },
  topStackImg: { width: '100%', height: '100%' },
  topStackGradient: {
    position: 'absolute', left: 0, right: 0, bottom: 0, height: '100%',
  },
  topStackYieldBadge: {
    position: 'absolute', top: 8, right: 8,
    backgroundColor: GREEN,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
  },
  topStackYieldTxt: { fontSize: 10, fontWeight: 'bold', color: WHITE },
  topStackBody: { padding: 12 },
  storeBrandChip: {
    alignSelf: 'flex-start', borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 3, marginBottom: 5,
  },
  storeBrandChipTxt: { fontSize: 8, fontWeight: 'bold', letterSpacing: 1.0 },
  topStackStore: { fontSize: 9, fontWeight: 'bold', color: GRAY, marginBottom: 3, letterSpacing: 0.5 },
  topStackName: { fontSize: 13, fontWeight: 'bold', color: NAVY, lineHeight: 18, marginBottom: 8, minHeight: 36 },
  topStackPriceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topStackPrice: { fontSize: 16, fontWeight: 'bold', color: NAVY },
  topStackSave: { fontSize: 11, fontWeight: 'bold', color: GREEN },

  // CATEGORY GRID
  catGridHead: { marginTop: 20, marginBottom: 10 },
  catCard: {
    width: CARD_WIDTH,
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  catBand: {
    height: 72, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
  },
  catBandImg: { width: 52, height: 52 },
  catBandCircle: {
    width: 38, height: 38, borderRadius: 19,
    alignItems: 'center', justifyContent: 'center',
  },
  catBandDot: { width: 14, height: 14, borderRadius: 7 },
  catStackCount: { alignItems: 'flex-end' },
  catStackCountNum: { fontSize: 22, fontWeight: 'bold', lineHeight: 26 },
  catStackCountLabel: { fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3 },
  catBody: { padding: 14 },
  catName: { fontSize: 14, fontWeight: 'bold', color: NAVY, lineHeight: 19, marginBottom: 8, minHeight: 38 },
  catSavingsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  catSavingsLabel: { fontSize: 10, color: GRAY, fontWeight: 'normal' },
  catSavingsVal: { fontSize: 14, fontWeight: 'bold' },

  // EMPTY STATE
  emptyState: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  emptySubtitle: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19, marginBottom: 20 },
  emptyClearBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 10,
  },
  emptyClearBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },
});