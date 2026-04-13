import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
  Dimensions, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const BRAND = {
  primaryGreen: '#0C9E54',
  mintPop:      '#C5FFBC',
  darkSection:  '#04361D',
  pale:         '#F0FDF4',
  white:        '#FFFFFF',
  bgLight:      '#F8FAFC',
  greyText:     '#64748B',
  border:       '#E2E8F0',
  navy:         '#0D1B4B',
};

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

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const STORE_COLORS = {
  publix: { bg: '#F0FDF4', accent: GREEN, label: 'Publix' },
  dollar_general: { bg: '#FFFBEB', accent: AMBER, label: 'Dollar General' },
  aldi: { bg: '#EFF6FF', accent: '#3B82F6', label: 'Aldi' },
  target: { bg: '#FEF2F2', accent: RED, label: 'Target' },
  walgreens: { bg: '#FEF2F2', accent: RED, label: 'Walgreens' },
  sprouts: { bg: '#F0FDF4', accent: GREEN, label: 'Sprouts' },
  any: { bg: OFF_WHITE, accent: GRAY, label: 'Any Store' },
};

const getStoreStyle = (store) => {
  const key = store?.toLowerCase().replace(' ', '_') || 'any';
  return STORE_COLORS[key] || STORE_COLORS.any;
};

// Seed items so screen is never empty on first load
const SEED_ITEMS = [
  { id: '1', name: 'Organic Milk', store: 'publix', price_cents: 349, checked: false, from_stack: true, category: 'dairy' },
  { id: '2', name: 'Tide Power Pods', store: 'dollar_general', price_cents: 1695, checked: false, from_stack: true, category: 'household' },
  { id: '3', name: 'Gatorade Zero', store: 'publix', price_cents: 150, checked: true, from_stack: true, category: 'beverages' },
  { id: '4', name: 'Chicken Breast', store: 'publix', price_cents: 1450, checked: false, from_stack: true, category: 'protein' },
  { id: '5', name: 'Paper Towels', store: 'dollar_general', price_cents: 599, checked: false, from_stack: false, category: 'household' },
];

export default function ListScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [newItemStore, setNewItemStore] = useState('publix');
  const [newItemQty, setNewItemQty] = useState(1);
  const [showInput, setShowInput] = useState(false);
  const [addingItem, setAddingItem] = useState(false);
  const [userId, setUserId] = useState(null);
  const [activeStoreFilter, setActiveStoreFilter] = useState('all');

  const fetchList = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data } = await supabase
        .from('shopping_list_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (data?.length > 0) {
        setItems(data);
      } else {
        setItems(SEED_ITEMS);
      }
    } catch (e) {
      
      setItems(SEED_ITEMS);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchList(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchList(); };

  const toggleItem = async (id) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const updated = { ...item, checked: !item.checked };
    setItems(prev => prev.map(i => i.id === id ? updated : i));

    if (userId) {
      await supabase
        .from('shopping_list_items')
        .update({ checked: updated.checked })
        .eq('id', id);
    }
  };

  const removeItem = (id) => {
    Alert.alert('Remove Item', 'Remove this item from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setItems(prev => prev.filter(i => i.id !== id));
          if (userId) {
            await supabase
              .from('shopping_list_items')
              .delete()
              .eq('id', id);
          }
        },
      },
    ]);
  };

  const addItem = async () => {
    if (!newItem.trim()) return;
    setAddingItem(true);
    const newEntry = {
      id: Date.now().toString(),
      name: newItem.trim(),
      store: newItemStore,
      quantity: newItemQty,
      price_cents: 0,
      checked: false,
      from_stack: false,
      category: 'other',
    };

    try {
      if (userId) {
        const { data, error } = await supabase
          .from('shopping_list_items')
          .insert([{ ...newEntry, user_id: userId }])
          .select()
          .single();
        if (!error && data) {
          setItems(prev => [data, ...prev]);
        } else {
          setItems(prev => [newEntry, ...prev]);
        }
      } else {
        setItems(prev => [newEntry, ...prev]);
      }
    } catch (e) {
      setItems(prev => [newEntry, ...prev]);
    }

    setNewItem('');
    setNewItemQty(1);
    setShowInput(false);
    setAddingItem(false);
  };

  const clearChecked = () => {
    Alert.alert('Clear Checked Items', 'Remove all checked items from your list?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: async () => {
          const checkedIds = items.filter(i => i.checked).map(i => i.id);
          setItems(prev => prev.filter(i => !i.checked));
          if (userId && checkedIds.length > 0) {
            await supabase
              .from('shopping_list_items')
              .delete()
              .in('id', checkedIds);
          }
        },
      },
    ]);
  };

  // ── DERIVED DATA ─────────────────────────────────────────────────────────
  const filteredItems = activeStoreFilter === 'all'
    ? items
    : items.filter(i => i.store === activeStoreFilter);

  const unchecked = filteredItems.filter(i => !i.checked);
  const checked = filteredItems.filter(i => i.checked);

  const totalUnchecked = unchecked.reduce((s, i) => s + (i.price_cents || 0), 0);
  const totalSaved = items
    .filter(i => i.from_stack)
    .reduce((s, i) => s + (i.price_cents || 0) * 0.3, 0);

  // Group unchecked by store
  const storeGroups = Object.entries(
    unchecked.reduce((acc, item) => {
      const key = item.store || 'any';
      if (!acc[key]) acc[key] = [];
      acc[key].push(item);
      return acc;
    }, {})
  );

  // Store filter chips
  const storesInList = ['all', ...new Set(items.map(i => i.store).filter(Boolean))];

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Loading your list...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="light-content" />

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>My List</Text>
          <Text style={styles.topSub}>
            {items.length} items · {checked.length} checked off
          </Text>
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowInput(!showInput)}
        >
          <Text style={styles.addBtnTxt}>{showInput ? '✕ Cancel' : '+ Add Item'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── SAVINGS STRIP ───────────────────────────────────────────────── */}
      {totalSaved > 0 && (
        <View style={styles.savingsStrip}>
          <View style={styles.savingsStripDot} />
          <Text style={styles.savingsStripTxt}>
            Snippd is saving you {fmt(totalSaved)} on this list
          </Text>
        </View>
      )}

      {/* ── ADD ITEM FORM ───────────────────────────────────────────────── */}
      {showInput && (
        <View style={styles.addForm}>
          <TextInput
            style={styles.addInput}
            placeholder="Item name e.g. Chicken Breast"
            placeholderTextColor="#C4C9D6"
            value={newItem}
            onChangeText={setNewItem}
            onSubmitEditing={addItem}
            autoFocus
            returnKeyType="done"
          />
          {/* Store picker */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.storePickerChips}
          >
            {Object.entries(STORE_COLORS).filter(([k]) => k !== 'any').map(([key, val]) => (
              <TouchableOpacity
                key={key}
                style={[
                  styles.storePickerChip,
                  newItemStore === key && styles.storePickerChipOn,
                  newItemStore === key && { borderColor: val.accent, backgroundColor: val.bg },
                ]}
                onPress={() => setNewItemStore(key)}
              >
                <Text style={[
                  styles.storePickerChipTxt,
                  newItemStore === key && { color: val.accent, fontWeight: 'bold' },
                ]}>
                  {val.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {/* Quantity stepper */}
          <View style={styles.qtyRow}>
            <Text style={styles.qtyLabel}>Qty</Text>
            <View style={styles.qtyStepper}>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setNewItemQty(q => Math.max(1, q - 1))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.qtyBtnTxt}>−</Text>
              </TouchableOpacity>
              <Text style={styles.qtyVal}>{newItemQty}</Text>
              <TouchableOpacity
                style={styles.qtyBtn}
                onPress={() => setNewItemQty(q => Math.min(99, q + 1))}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.qtyBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.addFormBtn, (!newItem.trim() || addingItem) && styles.addFormBtnDisabled]}
            onPress={addItem}
            disabled={!newItem.trim() || addingItem}
          >
            {addingItem
              ? <ActivityIndicator color={WHITE} size="small" />
              : <Text style={styles.addFormBtnTxt}>
                  Add {newItemQty > 1 ? `${newItemQty}× ` : ''}{newItem.trim() || 'Item'}
                </Text>
            }
          </TouchableOpacity>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── PROGRESS CARD ───────────────────────────────────────────────── */}
        {items.length > 0 && (
          <View style={styles.pad}>
            <View style={styles.progressCard}>
              <View style={styles.progressCardTop}>
                <View>
                  <Text style={styles.progressTitle}>
                    {checked.length === items.length
                      ? 'All done!'
                      : `${unchecked.length} items to go`}
                  </Text>
                  <Text style={styles.progressSub}>
                    {checked.length} of {items.length} checked off
                  </Text>
                </View>
                <View style={styles.progressPct}>
                  <Text style={styles.progressPctVal}>
                    {Math.round((checked.length / Math.max(items.length, 1)) * 100)}%
                  </Text>
                </View>
              </View>
              <View style={styles.progressTrack}>
                <View style={[
                  styles.progressFill,
                  {
                    width: `${(checked.length / Math.max(items.length, 1)) * 100}%`,
                    backgroundColor: checked.length === items.length ? GREEN : NAVY,
                  },
                ]} />
              </View>
            </View>
          </View>
        )}

        {/* ── STORE FILTER CHIPS ──────────────────────────────────────────── */}
        {storesInList.length > 2 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterChips}
            style={styles.filterChipsWrap}
          >
            {storesInList.map(storeKey => {
              const storeStyle = storeKey === 'all' ? null : getStoreStyle(storeKey);
              const isOn = activeStoreFilter === storeKey;
              return (
                <TouchableOpacity
                  key={storeKey}
                  style={[
                    styles.filterChip,
                    isOn && styles.filterChipOn,
                    isOn && storeStyle && { backgroundColor: storeStyle.bg, borderColor: storeStyle.accent },
                  ]}
                  onPress={() => setActiveStoreFilter(storeKey)}
                >
                  <Text style={[
                    styles.filterChipTxt,
                    isOn && { color: storeStyle ? storeStyle.accent : NAVY, fontWeight: 'bold' },
                  ]}>
                    {storeKey === 'all' ? 'All Stores' : getStoreStyle(storeKey).label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        {/* ── TO GET — grouped by store ────────────────────────────────────── */}
        {unchecked.length > 0 && (
          <View style={styles.pad}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>To Get</Text>
              <Text style={styles.sectionCount}>{unchecked.length} items</Text>
            </View>

            {storeGroups.map(([storeKey, storeItems]) => {
              const storeStyle = getStoreStyle(storeKey);
              const storeTotal = storeItems.reduce((s, i) => s + (i.price_cents || 0), 0);
              return (
                <View key={storeKey} style={styles.storeGroup}>
                  {/* Store header */}
                  <View style={[styles.storeGroupHeader, { backgroundColor: storeStyle.bg }]}>
                    <View style={[styles.storeGroupDot, { backgroundColor: storeStyle.accent }]} />
                    <Text style={[styles.storeGroupName, { color: storeStyle.accent }]}>
                      {storeStyle.label}
                    </Text>
                    {storeTotal > 0 && (
                      <Text style={[styles.storeGroupTotal, { color: storeStyle.accent }]}>
                        {fmt(storeTotal)}
                      </Text>
                    )}
                  </View>

                  {/* Items */}
                  <View style={styles.storeGroupItems}>
                    {storeItems.map((item, index) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[
                          styles.itemRow,
                          index === storeItems.length - 1 && { borderBottomWidth: 0 },
                        ]}
                        onPress={() => toggleItem(item.id)}
                        activeOpacity={0.7}
                      >
                        {/* Big tap target checkbox */}
                        <View style={styles.checkWrap}>
                          <View style={styles.checkEmpty}>
                            <View style={styles.checkDot} />
                          </View>
                        </View>

                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          {item.category && (
                            <Text style={styles.itemCat}>{item.category}</Text>
                          )}
                        </View>

                        <View style={styles.itemRight}>
                          {item.price_cents > 0 && (
                            <Text style={styles.itemPrice}>{fmt(item.price_cents)}</Text>
                          )}
                          {item.from_stack && (
                            <View style={styles.stackBadge}>
                              <Text style={styles.stackBadgeTxt}>STACK</Text>
                            </View>
                          )}
                        </View>

                        <TouchableOpacity
                          style={styles.removeBtn}
                          onPress={() => removeItem(item.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Text style={styles.removeBtnTxt}>×</Text>
                        </TouchableOpacity>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* ── GOT IT ────────────────────────────────────────────────────────── */}
        {checked.length > 0 && (
          <View style={styles.pad}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Got It</Text>
              <TouchableOpacity onPress={clearChecked}>
                <Text style={styles.clearBtn}>Clear all</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.card}>
              {checked.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.itemRow,
                    styles.itemRowDone,
                    index === checked.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={() => toggleItem(item.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.checkWrap}>
                    <View style={styles.checkFull}>
                      <Text style={styles.checkFullTxt}>✓</Text>
                    </View>
                  </View>
                  <View style={styles.itemInfo}>
                    <Text style={styles.itemNameDone}>{item.name}</Text>
                    <Text style={styles.itemCat}>{getStoreStyle(item.store).label}</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeItem(item.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.removeBtnTxt}>×</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── EMPTY STATE ────────────────────────────────────────────────────── */}
        {items.length === 0 && (
          <View style={styles.emptyState}>
            <View style={styles.emptyCircle}>
              <Text style={styles.emptyCircleTxt}>0</Text>
            </View>
            <Text style={styles.emptyTitle}>Your list is empty</Text>
            <Text style={styles.emptySub}>
              Add items manually or browse stacks to fill your list automatically
            </Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => navigation.getParent()?.navigate('Home')}
            >
              <Text style={styles.emptyBtnTxt}>Browse Stacks</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── QUICK ADD FROM STACKS CTA ────────────────────────────────────── */}
        {items.length > 0 && unchecked.length > 0 && (
          <View style={styles.pad}>
            <TouchableOpacity
              style={styles.stacksCTA}
              onPress={() => navigation.getParent()?.navigate('Home')}
              activeOpacity={0.88}
            >
              <View>
                <Text style={styles.stacksCTATitle}>Add items from a Stack</Text>
                <Text style={styles.stacksCTASub}>Browse curated bundles to fill your list faster</Text>
              </View>
              <Text style={styles.stacksCTAArrow}>›</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── STICKY CHECKOUT BAR ──────────────────────────────────────────── */}
      {unchecked.length > 0 && (
        <View style={styles.checkoutBar}>
          <View>
            <Text style={styles.checkoutLabel}>
              {unchecked.length} item{unchecked.length !== 1 ? 's' : ''} remaining
            </Text>
            {totalUnchecked > 0 && (
              <Text style={styles.checkoutTotal}>{fmt(totalUnchecked)} estimated</Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.checkoutBtn}
            onPress={() => navigation.navigate('SnippdTab')}
          >
            <Text style={styles.checkoutBtnTxt}>Go to Cart</Text>
          </TouchableOpacity>
        </View>
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  topTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  topSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  addBtn: {
    backgroundColor: GREEN, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  addBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // SAVINGS STRIP
  savingsStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LIGHT_GREEN,
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: '#A7F3D0',
    gap: 8,
  },
  savingsStripDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  savingsStripTxt: { fontSize: 13, fontWeight: 'bold', color: GREEN },

  // ADD FORM
  addForm: {
    backgroundColor: WHITE, padding: 16,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    gap: 10,
  },
  addInput: {
    backgroundColor: OFF_WHITE, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: NAVY,
  },
  storePickerChips: { gap: 7 },
  storePickerChip: {
    backgroundColor: OFF_WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER,
  },
  storePickerChipOn: {},
  storePickerChipTxt: { fontSize: 12, fontWeight: 'normal', color: GRAY },
  // QUANTITY STEPPER
  qtyRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 2,
  },
  qtyLabel: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  qtyStepper: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: OFF_WHITE, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER,
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 36, height: 36, alignItems: 'center', justifyContent: 'center',
  },
  qtyBtnTxt: { fontSize: 18, color: NAVY, fontWeight: 'bold', lineHeight: 22 },
  qtyVal: {
    minWidth: 32, textAlign: 'center',
    fontSize: 15, fontWeight: 'bold', color: NAVY,
  },

  addFormBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 13, alignItems: 'center',
  },
  addFormBtnDisabled: { backgroundColor: '#C4C9D6' },
  addFormBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // PROGRESS CARD
  progressCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  progressCardTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 14,
  },
  progressTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  progressSub: { fontSize: 12, color: GRAY },
  progressPct: {
    backgroundColor: LIGHT_GREEN, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  progressPctVal: { fontSize: 16, fontWeight: 'bold', color: GREEN },
  progressTrack: { height: 6, backgroundColor: OFF_WHITE, borderRadius: 3 },
  progressFill: { height: 6, borderRadius: 3 },

  // FILTER CHIPS
  filterChipsWrap: { marginTop: 14 },
  filterChips: { paddingHorizontal: 16, gap: 7 },
  filterChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 7,
    borderWidth: 1.5, borderColor: BORDER, ...SHADOW_SM,
  },
  filterChipOn: { borderWidth: 1.5 },
  filterChipTxt: { fontSize: 12, fontWeight: 'normal', color: NAVY },

  // SECTION HEADS
  sectionHead: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3 },
  sectionCount: { fontSize: 13, fontWeight: 'normal', color: GRAY },
  clearBtn: { fontSize: 13, fontWeight: 'bold', color: RED },

  // STORE GROUP
  storeGroup: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', marginBottom: 12,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  storeGroupHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    gap: 8,
  },
  storeGroupDot: { width: 8, height: 8, borderRadius: 4 },
  storeGroupName: { flex: 1, fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 },
  storeGroupTotal: { fontSize: 13, fontWeight: 'bold' },
  storeGroupItems: {},

  // ITEM ROW
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  itemRowDone: { backgroundColor: '#FAFAFA' },

  // CHECKBOX
  checkWrap: { width: 32, alignItems: 'center', justifyContent: 'center' },
  checkEmpty: {
    width: 28, height: 28, borderRadius: 14,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  checkDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: BORDER },
  checkFull: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  checkFullTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  itemInfo: { flex: 1 },
  itemName: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  itemNameDone: { fontSize: 14, fontWeight: 'normal', color: GRAY, textDecorationLine: 'line-through' },
  itemCat: { fontSize: 11, color: GRAY, marginTop: 2 },
  itemRight: { alignItems: 'flex-end', gap: 4 },
  itemPrice: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  stackBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 5,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  stackBadgeTxt: { fontSize: 9, fontWeight: 'bold', color: GREEN },
  removeBtn: { padding: 4 },
  removeBtnTxt: { fontSize: 22, color: '#D1D5DB', lineHeight: 26 },

  // CARD (for checked items)
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    ...SHADOW_SM,
  },

  // EMPTY STATE
  emptyState: {
    alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32,
  },
  emptyCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emptyCircleTxt: { fontSize: 28, fontWeight: 'bold', color: GREEN },
  emptyTitle: { fontSize: 18, fontWeight: 'bold', color: NAVY, marginBottom: 8 },
  emptySub: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 24, paddingVertical: 12,
  },
  emptyBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // STACKS CTA
  stacksCTA: {
    backgroundColor: NAVY, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...SHADOW,
  },
  stacksCTATitle: { fontSize: 15, fontWeight: 'bold', color: WHITE, marginBottom: 3 },
  stacksCTASub: { fontSize: 12, color: 'rgba(255,255,255,0.65)' },
  stacksCTAArrow: { fontSize: 28, color: 'rgba(255,255,255,0.4)' },

  // CHECKOUT BAR
  checkoutBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: WHITE,
    borderTopWidth: 1, borderTopColor: BORDER,
    paddingHorizontal: 20, paddingVertical: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    ...SHADOW,
  },
  checkoutLabel: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  checkoutTotal: { fontSize: 12, color: GRAY, marginTop: 2 },
  checkoutBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 20, paddingVertical: 12,
  },
  checkoutBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },
});