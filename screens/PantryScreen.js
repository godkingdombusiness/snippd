import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
  Dimensions, KeyboardAvoidingView, Platform,
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
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const RED = '#EF4444';
const AMBER = '#F59E0B';

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

const APP_OPENS_REQUIRED = 7;

const SHELF_LIFE = {
  produce: 5, dairy: 10, meat: 3, pantry: 21,
  frozen: 90, snacks: 30, household: 365, beverages: 14,
};

const CATEGORIES = [
  { key: 'produce', label: 'Produce' },
  { key: 'meat', label: 'Protein' },
  { key: 'dairy', label: 'Dairy' },
  { key: 'pantry', label: 'Pantry' },
  { key: 'frozen', label: 'Frozen' },
  { key: 'snacks', label: 'Snacks' },
  { key: 'beverages', label: 'Beverages' },
  { key: 'household', label: 'Household' },
];

const CAT_COLORS = {
  produce: { bg: '#F0FDF4', dot: GREEN },
  meat: { bg: '#FEF2F2', dot: '#EF4444' },
  dairy: { bg: '#EFF6FF', dot: '#3B82F6' },
  pantry: { bg: '#FFF7ED', dot: '#F59E0B' },
  frozen: { bg: '#F0F9FF', dot: '#0EA5E9' },
  snacks: { bg: '#FDF4FF', dot: '#A855F7' },
  beverages: { bg: '#ECFDF5', dot: '#10B981' },
  household: { bg: '#F8FAFF', dot: '#6366F1' },
};

const getExpiryStatus = (days) => {
  if (days < 0) return { color: GRAY, label: 'EXPIRED', bg: '#F3F4F6' };
  if (days === 0) return { color: RED, label: 'LAST CHANCE', bg: '#FEF2F2' };
  if (days === 1) return { color: RED, label: 'USE TODAY', bg: '#FEF2F2' };
  if (days <= 3) return { color: '#D97706', label: `${days}D LEFT`, bg: '#FEF3C7' };
  if (days <= 7) return { color: AMBER, label: `${days}D LEFT`, bg: '#FFFBEB' };
  return { color: GREEN, label: 'GOOD', bg: LIGHT_GREEN };
};

export default function PantryScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState('pantry');
  const [newItemQty, setNewItemQty] = useState('');
  const [addingItem, setAddingItem] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [appOpenCount, setAppOpenCount] = useState(0);
  const [wastesSaved, setWastesSaved] = useState(0);
  const [userId, setUserId] = useState(null);
  const [activeFilter, setActiveFilter] = useState('all');

  const fetchPantry = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Fetch profile for app_open_count and waste stats
      const { data: profile } = await supabase
        .from('profiles')
        .select('app_open_count, preferences')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        setAppOpenCount(profile.app_open_count || 0);
        setWastesSaved(profile.preferences?.wastes_saved || 0);
      }

      // Fetch pantry items
      const { data: pantryData } = await supabase
        .from('food_waste_log')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('days_until_expiry', { ascending: true });

      if (pantryData?.length > 0) {
        setItems(pantryData);
      } else {
        // Seed with demo data so screen is not empty on first load
        setItems([
          { id: '1', product_name: 'Chicken Breast', category: 'meat', quantity: '2 lbs', days_until_expiry: 1 },
          { id: '2', product_name: 'Spinach', category: 'produce', quantity: '5 oz bag', days_until_expiry: 2 },
          { id: '3', product_name: 'Whole Milk', category: 'dairy', quantity: '1 gallon', days_until_expiry: 5 },
          { id: '4', product_name: 'Pasta', category: 'pantry', quantity: '1 box', days_until_expiry: 180 },
          { id: '5', product_name: 'Greek Yogurt', category: 'dairy', quantity: '32oz', days_until_expiry: 8 },
          { id: '6', product_name: 'Orange Juice', category: 'beverages', quantity: '52oz', days_until_expiry: 3 },
          { id: '7', product_name: 'Ground Beef', category: 'meat', quantity: '1 lb', days_until_expiry: 0 },
        ]);
      }
    } catch (e) {
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchPantry(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchPantry(); };

  const addItem = async () => {
    if (!newItemName.trim()) return;
    setAddingItem(true);
    const shelfDays = SHELF_LIFE[newItemCategory] || 7;
    const newItem = {
      product_name: newItemName.trim(),
      category: newItemCategory,
      quantity: newItemQty || '1 unit',
      days_until_expiry: shelfDays,
      status: 'active',
    };

    try {
      if (userId) {
        const { data, error } = await supabase
          .from('food_waste_log')
          .insert([{ ...newItem, user_id: userId }])
          .select()
          .single();
        if (!error && data) {
          setItems(prev => [data, ...prev]);
        } else {
          // Optimistic local add
          setItems(prev => [{ ...newItem, id: Date.now().toString() }, ...prev]);
        }
      } else {
        setItems(prev => [{ ...newItem, id: Date.now().toString() }, ...prev]);
      }
    } catch (e) {
      setItems(prev => [{ ...newItem, id: Date.now().toString() }, ...prev]);
    }

    setNewItemName('');
    setNewItemQty('');
    setNewItemCategory('pantry');
    setShowAddForm(false);
    setAddingItem(false);
  };

  const removeItem = (id) => {
    Alert.alert('Remove Item', 'Remove this item from your pantry?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems(prev => prev.filter(i => i.id !== id));
          if (userId) {
            await supabase
              .from('food_waste_log')
              .update({ status: 'removed' })
              .eq('id', id);
          }
        },
      },
    ]);
  };

  const markUsed = async (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
    const newCount = wastesSaved + 1;
    setWastesSaved(newCount);

    if (userId) {
      await supabase
        .from('food_waste_log')
        .update({ status: 'used' })
        .eq('id', id);

      // Update waste count in preferences
      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('user_id', userId)
        .single();
      const existing = profile?.preferences || {};
      await supabase
        .from('profiles')
        .update({ preferences: { ...existing, wastes_saved: newCount } })
        .eq('user_id', userId);
    }

    Alert.alert('Meal saved from waste!', 'Every item used counts toward zero food waste.');
  };

  const toggleCategory = (key) => {
    setExpandedCategories(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Filter logic
  const filteredItems = activeFilter === 'all'
    ? items
    : activeFilter === 'urgent'
    ? items.filter(i => i.days_until_expiry <= 3 && i.days_until_expiry >= 0)
    : items.filter(i => i.category === activeFilter);

  const urgentItems = items.filter(i => i.days_until_expiry <= 2 && i.days_until_expiry >= 0);
  const cookFromPantryUnlocked = appOpenCount >= APP_OPENS_REQUIRED;

  const itemsByCategory = CATEGORIES.map(cat => ({
    ...cat,
    items: filteredItems.filter(i => i.category === cat.key),
  })).filter(cat => cat.items.length > 0);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Loading your pantry...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >

        {/* ── TOP BAR ─────────────────────────────────────────────────── */}
        <View style={styles.topBar}>
          <View>
            <Text style={styles.topTitle}>My Pantry</Text>
            <Text style={styles.topSub}>{items.length} items · {wastesSaved} meals saved</Text>
          </View>
          <View style={styles.topBtns}>
            <TouchableOpacity
              style={styles.scanBtn}
              onPress={() => Alert.alert('Scanner', 'Point your camera at any food item to add it instantly.')}
            >
              <Text style={styles.scanBtnTxt}>Scan</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => setShowAddForm(!showAddForm)}
            >
              <Text style={styles.addBtnTxt}>{showAddForm ? '✕' : '+ Add'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
          }
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STATS ROW ───────────────────────────────────────────────── */}
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{items.length}</Text>
              <Text style={styles.statLabel}>Items Tracked</Text>
            </View>
            <View style={[styles.statCard, urgentItems.length > 0 && styles.statCardUrgent]}>
              <Text style={[styles.statVal, urgentItems.length > 0 && { color: RED }]}>
                {urgentItems.length}
              </Text>
              <Text style={styles.statLabel}>Expiring Soon</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: GREEN }]}>{wastesSaved}</Text>
              <Text style={styles.statLabel}>Meals Saved</Text>
            </View>
          </View>

          {/* ── ADD ITEM FORM ───────────────────────────────────────────── */}
          {showAddForm && (
            <View style={styles.pad}>
              <View style={styles.addForm}>
                <Text style={styles.addFormTitle}>Add Pantry Item</Text>
                <TextInput
                  style={styles.addInput}
                  placeholder="Item name  e.g. Chicken Breast"
                  placeholderTextColor="#C4C9D6"
                  value={newItemName}
                  onChangeText={setNewItemName}
                  autoFocus
                />
                <TextInput
                  style={styles.addInput}
                  placeholder="Quantity  e.g. 2 lbs"
                  placeholderTextColor="#C4C9D6"
                  value={newItemQty}
                  onChangeText={setNewItemQty}
                />
                <Text style={styles.addCatLabel}>Category</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.addCatChips}
                >
                  {CATEGORIES.map(cat => (
                    <TouchableOpacity
                      key={cat.key}
                      style={[
                        styles.addCatChip,
                        newItemCategory === cat.key && styles.addCatChipOn,
                      ]}
                      onPress={() => setNewItemCategory(cat.key)}
                    >
                      <Text style={[
                        styles.addCatChipTxt,
                        newItemCategory === cat.key && styles.addCatChipTxtOn,
                      ]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                <View style={styles.addFormBtns}>
                  <TouchableOpacity
                    style={styles.addFormCancel}
                    onPress={() => { setShowAddForm(false); setNewItemName(''); setNewItemQty(''); }}
                  >
                    <Text style={styles.addFormCancelTxt}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.addFormSubmit, (!newItemName.trim() || addingItem) && { opacity: 0.5 }]}
                    onPress={addItem}
                    disabled={!newItemName.trim() || addingItem}
                  >
                    {addingItem
                      ? <ActivityIndicator color={WHITE} size="small" />
                      : <Text style={styles.addFormSubmitTxt}>Add Item</Text>
                    }
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* ── USE IT OR LOSE IT ───────────────────────────────────────── */}
          {urgentItems.length > 0 && (
            <View style={styles.pad}>
              <View style={styles.urgentCard}>
                <View style={styles.urgentHeader}>
                  <View style={styles.urgentHeaderLeft}>
                    <View style={styles.urgentDot} />
                    <Text style={styles.urgentTitle}>USE IT OR LOSE IT</Text>
                  </View>
                  <Text style={styles.urgentCount}>
                    {urgentItems.length} item{urgentItems.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                {urgentItems.map((item, i) => {
                  const status = getExpiryStatus(item.days_until_expiry);
                  return (
                    <View
                      key={item.id}
                      style={[
                        styles.urgentRow,
                        i === urgentItems.length - 1 && { borderBottomWidth: 0, marginBottom: 0, paddingBottom: 0 },
                      ]}
                    >
                      <View style={[styles.urgentBadge, { backgroundColor: status.bg }]}>
                        <Text style={[styles.urgentBadgeTxt, { color: status.color }]}>
                          {status.label}
                        </Text>
                      </View>
                      <View style={styles.urgentInfo}>
                        <Text style={styles.urgentName}>{item.product_name}</Text>
                        <Text style={styles.urgentQty}>{item.quantity}</Text>
                      </View>
                      <View style={styles.urgentActions}>
                        <TouchableOpacity
                          style={styles.urgentRecipeBtn}
                          onPress={() => navigation.navigate('ChefStash', {
                            stack: null,
                            ingredients: [item],
                          })}
                        >
                          <Text style={styles.urgentRecipeTxt}>Recipe</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.urgentUsedBtn}
                          onPress={() => markUsed(item.id)}
                        >
                          <Text style={styles.urgentUsedTxt}>Used It</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── COOK FROM PANTRY ────────────────────────────────────────── */}
          <View style={styles.pad}>
            <View style={[
              styles.cookCard,
              cookFromPantryUnlocked && styles.cookCardUnlocked,
            ]}>
              <View style={styles.cookTop}>
                <View>
                  <Text style={styles.cookTitle}>Cook From My Pantry</Text>
                  <Text style={styles.cookSub}>
                    {cookFromPantryUnlocked
                      ? 'Chef Stash will cook with what you already have.'
                      : `Open Snippd ${APP_OPENS_REQUIRED} times to unlock.`}
                  </Text>
                </View>
                {cookFromPantryUnlocked && (
                  <View style={styles.cookUnlockedBadge}>
                    <Text style={styles.cookUnlockedTxt}>UNLOCKED</Text>
                  </View>
                )}
              </View>

              {cookFromPantryUnlocked ? (
                <TouchableOpacity
                  style={styles.cookBtn}
                  onPress={() => navigation.navigate('ChefStash', {
                    fromPantry: true,
                    ingredients: items,
                  })}
                >
                  <Text style={styles.cookBtnTxt}>Cook Something Tonight</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.cookProgress}>
                  <View style={styles.cookProgressHead}>
                    <Text style={styles.cookProgressLabel}>App opens</Text>
                    <Text style={styles.cookProgressVal}>
                      {appOpenCount} of {APP_OPENS_REQUIRED}
                    </Text>
                  </View>
                  <View style={styles.cookTrack}>
                    <View style={[
                      styles.cookFill,
                      { width: `${(appOpenCount / APP_OPENS_REQUIRED) * 100}%` },
                    ]} />
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* ── FILTER CHIPS ────────────────────────────────────────────── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChips}
            style={styles.filterChipsWrap}
          >
            {[
              { key: 'all', label: 'All Items' },
              { key: 'urgent', label: 'Expiring Soon' },
              ...CATEGORIES,
            ].map(chip => (
              <TouchableOpacity
                key={chip.key}
                style={[styles.filterChip, activeFilter === chip.key && styles.filterChipOn]}
                onPress={() => setActiveFilter(chip.key)}
              >
                <Text style={[
                  styles.filterChipTxt,
                  activeFilter === chip.key && styles.filterChipTxtOn,
                ]}>
                  {chip.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* ── PANTRY ITEMS BY CATEGORY ────────────────────────────────── */}
          {itemsByCategory.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>
                {activeFilter === 'urgent' ? 'Nothing expiring soon' : 'No items yet'}
              </Text>
              <Text style={styles.emptySub}>
                {activeFilter === 'urgent'
                  ? 'All your items are in good shape'
                  : 'Tap Add to track your first pantry item'}
              </Text>
              {activeFilter === 'all' && (
                <TouchableOpacity
                  style={styles.emptyAddBtn}
                  onPress={() => setShowAddForm(true)}
                >
                  <Text style={styles.emptyAddBtnTxt}>Add First Item</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            itemsByCategory.map(cat => {
              const catColor = CAT_COLORS[cat.key] || CAT_COLORS.pantry;
              const isExpanded = expandedCategories[cat.key] !== false;
              return (
                <View key={cat.key} style={styles.catSection}>
                  <TouchableOpacity
                    style={styles.catHeader}
                    onPress={() => toggleCategory(cat.key)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.catHeaderLeft}>
                      <View style={[styles.catDot, { backgroundColor: catColor.dot }]} />
                      <Text style={styles.catHeaderTitle}>{cat.label}</Text>
                    </View>
                    <View style={styles.catHeaderRight}>
                      <View style={[styles.catCountBadge, { backgroundColor: catColor.bg }]}>
                        <Text style={[styles.catCountTxt, { color: catColor.dot }]}>
                          {cat.items.length}
                        </Text>
                      </View>
                      <Text style={styles.catChevron}>{isExpanded ? '↑' : '↓'}</Text>
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.catItems}>
                      {cat.items.map((item, index) => {
                        const status = getExpiryStatus(item.days_until_expiry);
                        return (
                          <View
                            key={item.id}
                            style={[
                              styles.pantryRow,
                              index === cat.items.length - 1 && { borderBottomWidth: 0 },
                            ]}
                          >
                            <View style={[styles.pantryDot, { backgroundColor: status.color }]} />
                            <View style={styles.pantryInfo}>
                              <Text style={styles.pantryName}>{item.product_name}</Text>
                              <Text style={styles.pantryQty}>{item.quantity}</Text>
                            </View>
                            <View style={styles.pantryRight}>
                              <View style={[styles.expiryBadge, { backgroundColor: status.bg }]}>
                                <Text style={[styles.expiryBadgeTxt, { color: status.color }]}>
                                  {status.label}
                                </Text>
                              </View>
                              <TouchableOpacity
                                style={styles.pantryRemoveBtn}
                                onPress={() => removeItem(item.id)}
                              >
                                <Text style={styles.pantryRemoveTxt}>×</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* ── STORAGE TIPS ────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Storage Tips</Text>
            <View style={styles.tipsCard}>
              {[
                'Store fresh herbs in a glass of water in the fridge — extends life up to 2 weeks',
                'Keep onions and potatoes separate — they cause each other to spoil faster',
                'Freeze bread before the expiry date — it toasts perfectly from frozen',
                'Store berries unwashed with a paper towel to absorb moisture',
              ].map((tip, i, arr) => (
                <View
                  key={i}
                  style={[
                    styles.tipRow,
                    i === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.tipDot} />
                  <Text style={styles.tipTxt}>{tip}</Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },
  pad: { paddingHorizontal: 16, marginTop: 14 },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  topTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  topSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  topBtns: { flexDirection: 'row', gap: 8 },
  scanBtn: {
    backgroundColor: OFF_WHITE, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: BORDER,
  },
  scanBtnTxt: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  addBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  addBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // STATS ROW
  statsRow: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 16, marginTop: 14,
  },
  statCard: {
    flex: 1, backgroundColor: WHITE,
    borderRadius: 16, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER,
    ...SHADOW_SM,
  },
  statCardUrgent: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  statVal: { fontSize: 22, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  statLabel: { fontSize: 10, color: GRAY, fontWeight: 'normal', textAlign: 'center' },

  // ADD FORM
  addForm: {
    backgroundColor: WHITE, borderRadius: 18,
    padding: 16, borderWidth: 1.5, borderColor: GREEN,
    ...SHADOW,
  },
  addFormTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 12 },
  addInput: {
    backgroundColor: OFF_WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: NAVY, marginBottom: 10,
  },
  addCatLabel: { fontSize: 11, fontWeight: 'bold', color: GRAY, marginBottom: 8 },
  addCatChips: { gap: 6, paddingBottom: 12 },
  addCatChip: {
    backgroundColor: OFF_WHITE, borderRadius: 14,
    paddingHorizontal: 12, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER,
  },
  addCatChipOn: { backgroundColor: GREEN, borderColor: GREEN },
  addCatChipTxt: { fontSize: 12, fontWeight: 'normal', color: NAVY },
  addCatChipTxtOn: { color: WHITE },
  addFormBtns: { flexDirection: 'row', gap: 10 },
  addFormCancel: {
    flex: 1, backgroundColor: OFF_WHITE,
    borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER,
  },
  addFormCancelTxt: { fontSize: 14, fontWeight: 'normal', color: GRAY },
  addFormSubmit: {
    flex: 1, backgroundColor: GREEN,
    borderRadius: 12, paddingVertical: 12, alignItems: 'center',
  },
  addFormSubmitTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // URGENT CARD
  urgentCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 16,
    borderWidth: 1.5, borderColor: '#FECACA', ...SHADOW,
  },
  urgentHeader: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 12,
  },
  urgentHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  urgentDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED },
  urgentTitle: { fontSize: 11, fontWeight: 'bold', color: RED, letterSpacing: 1 },
  urgentCount: { fontSize: 12, fontWeight: 'bold', color: GRAY },
  urgentRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginBottom: 12, paddingBottom: 12,
    borderBottomWidth: 1, borderBottomColor: '#FEF2F2',
  },
  urgentBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  urgentBadgeTxt: { fontSize: 9, fontWeight: 'bold', letterSpacing: 0.5 },
  urgentInfo: { flex: 1 },
  urgentName: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  urgentQty: { fontSize: 11, color: GRAY, marginTop: 1 },
  urgentActions: { flexDirection: 'row', gap: 6 },
  urgentRecipeBtn: {
    backgroundColor: PALE_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: GREEN,
  },
  urgentRecipeTxt: { fontSize: 10, fontWeight: 'bold', color: GREEN },
  urgentUsedBtn: {
    backgroundColor: GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  urgentUsedTxt: { fontSize: 10, fontWeight: 'bold', color: WHITE },

  // COOK CARD
  cookCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  cookCardUnlocked: { borderColor: GREEN, borderWidth: 1.5 },
  cookTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  cookTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  cookSub: { fontSize: 13, color: GRAY, lineHeight: 18, maxWidth: width * 0.6 },
  cookUnlockedBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  cookUnlockedTxt: { fontSize: 9, fontWeight: 'bold', color: GREEN, letterSpacing: 1 },
  cookBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
  },
  cookBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },
  cookProgress: {},
  cookProgressHead: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6,
  },
  cookProgressLabel: { fontSize: 12, color: GRAY },
  cookProgressVal: { fontSize: 12, fontWeight: 'bold', color: NAVY },
  cookTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 },
  cookFill: { height: 6, backgroundColor: GREEN, borderRadius: 3 },

  // FILTER CHIPS
  filterChipsWrap: { marginTop: 14 },
  filterChips: { paddingHorizontal: 16, gap: 7 },
  filterChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER, ...SHADOW_SM,
  },
  filterChipOn: { backgroundColor: NAVY, borderColor: NAVY },
  filterChipTxt: { fontSize: 12, fontWeight: 'normal', color: NAVY },
  filterChipTxtOn: { color: WHITE },

  // SECTION TITLE
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // EMPTY STATE
  emptyState: {
    alignItems: 'center', paddingVertical: 48,
    paddingHorizontal: 32,
  },
  emptyTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  emptySub: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  emptyAddBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyAddBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // CATEGORY SECTIONS
  catSection: {
    backgroundColor: WHITE,
    marginHorizontal: 16, marginTop: 10,
    borderRadius: 18, overflow: 'hidden',
    borderWidth: 1, borderColor: BORDER, ...SHADOW_SM,
  },
  catHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
  },
  catHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catHeaderTitle: { fontSize: 15, fontWeight: 'bold', color: NAVY },
  catHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catCountBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  catCountTxt: { fontSize: 11, fontWeight: 'bold' },
  catChevron: { fontSize: 14, color: GRAY },
  catItems: { borderTopWidth: 1, borderTopColor: BORDER },

  // PANTRY ITEMS
  pantryRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  pantryDot: { width: 8, height: 8, borderRadius: 4 },
  pantryInfo: { flex: 1 },
  pantryName: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  pantryQty: { fontSize: 11, color: GRAY, marginTop: 1 },
  pantryRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  expiryBadge: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  expiryBadgeTxt: { fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3 },
  pantryRemoveBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  pantryRemoveTxt: { fontSize: 16, color: GRAY, lineHeight: 20 },

  // TIPS
  tipsCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    ...SHADOW_SM,
  },
  tipRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 5 },
  tipTxt: { flex: 1, fontSize: 13, color: GRAY, lineHeight: 20 },
});