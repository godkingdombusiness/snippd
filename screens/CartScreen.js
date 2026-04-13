import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, StatusBar,
  SectionList,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';

const GREEN   = '#0C9E54';
const NAVY    = '#0D1B4B';
const WHITE   = '#FFFFFF';
const GRAY    = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const PALE_GREEN = '#F0FDF4';
const LIGHT_GREEN = '#E8F8F0';
const BORDER  = '#F0F1F3';
const RED     = '#EF4444';
const AMBER   = '#F59E0B';
const BLUE    = '#3B82F6';
const PURPLE  = '#A855F7';

const fmt = (cents) => cents ? '$' + (cents / 100).toFixed(2) : null;

// Category accent colors
const CAT_COLORS = {
  Produce:   { bg: PALE_GREEN,  dot: GREEN },
  Protein:   { bg: '#FEF2F2',  dot: RED },
  Dairy:     { bg: '#EFF6FF',  dot: BLUE },
  Pantry:    { bg: '#FFF7ED',  dot: AMBER },
  Snacks:    { bg: '#FDF4FF',  dot: PURPLE },
  Household: { bg: '#F0F9FF',  dot: '#0EA5E9' },
  Frozen:    { bg: '#EFF6FF',  dot: '#6366F1' },
  Beverages: { bg: '#ECFDF5',  dot: '#10B981' },
  Other:     { bg: OFF_WHITE,  dot: GRAY },
};

// Persona display labels (matches EditProfileScreen keys)
const PERSONA_LABEL = {
  savvy_stacker:    'The Savvy Stacker',
  pantry_hero:      'The Pantry Hero',
  meal_master:      'The Meal Master',
  budget_champion:  'The Budget Champion',
  smart_shopper:    'The Smart Shopper',
  family_feeder:    'The Family Feeder',
  deal_finder:      'The Deal Finder',
  wellness_warrior: 'The Wellness Warrior',
};

// Source labels
const SOURCE_LABEL = {
  meal_plan:   { text: 'Meal Plan',   color: GREEN, bg: LIGHT_GREEN },
  snippd_deal: { text: 'Snippd Deal', color: AMBER, bg: '#FEF3C7' },
  user_added:  { text: 'Manual',      color: GRAY,  bg: OFF_WHITE },
};

export default function CartScreen({ navigation }) {
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sections, setSections]     = useState([]);
  const [household, setHousehold]   = useState(null);
  const [myRole, setMyRole]         = useState('VIEWER');
  const [summary, setSummary]       = useState({ total: 0, saved: 0, items: 0, purchased: 0 });
  const [activeFilter, setActiveFilter] = useState('active');
  const [membersMap, setMembersMap]     = useState({}); // user_id → { username, persona }

  const loadCart = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Find household membership
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership?.household_id) {
        setSections([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      setMyRole(membership.role);

      const { data: hh } = await supabase
        .from('households')
        .select('id, name, owner_id')
        .eq('id', membership.household_id)
        .single();
      setHousehold(hh);

      // Fetch member profiles for attribution display
      const { data: members } = await supabase
        .from('household_members')
        .select('user_id, profiles(username, chef_persona)')
        .eq('household_id', membership.household_id);
      const map = {};
      (members || []).forEach(m => {
        map[m.user_id] = {
          username: m.profiles?.username || '',
          persona:  PERSONA_LABEL[m.profiles?.chef_persona] || '',
        };
      });
      setMembersMap(map);

      // Fetch cart items
      let query = supabase
        .from('household_cart_items')
        .select('*')
        .eq('household_id', membership.household_id)
        .order('added_at', { ascending: false });

      if (activeFilter === 'active') {
        query = query.in('status', ['active', 'purchased']);
      }

      const { data: items } = await query;
      const allItems = items || [];

      const active    = allItems.filter(i => i.status === 'active');
      const purchased = allItems.filter(i => i.status === 'purchased');
      setSummary({
        total:     active.reduce((s, i) => s + (i.unit_price_cents || 0) * (i.quantity || 1), 0),
        saved:     active.reduce((s, i) => s + (i.save_cents || 0) * (i.quantity || 1), 0),
        items:     active.length,
        purchased: purchased.length,
      });

      // Group by category
      const grouped = {};
      allItems.forEach(item => {
        const cat = item.category || 'Other';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(item);
      });

      const sorted = Object.entries(grouped)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([cat, data]) => ({
          title: cat,
          data: data.sort((a, b) => {
            if (a.status === b.status) return 0;
            return a.status === 'active' ? -1 : 1;
          }),
        }));

      setSections(sorted);
    } catch (_) {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeFilter]);

  useEffect(() => { loadCart(); }, [loadCart]);

  const onRefresh = () => { setRefreshing(true); loadCart(); };

  const cycleStatus = async (item) => {
    if (myRole === 'VIEWER') return;
    const next = { active: 'purchased', purchased: 'active', removed: 'active' }[item.status] || 'active';
    setSections(prev => prev.map(s => ({
      ...s,
      data: s.data.map(i => i.id === item.id ? { ...i, status: next } : i),
    })));
    await supabase
      .from('household_cart_items')
      .update({ status: next, updated_at: new Date().toISOString() })
      .eq('id', item.id);

    if (next === 'purchased') {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        tracker.trackCheckoutCompleted({
          user_id: userId,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'CartScreen',
          cart_value_cents: (item.unit_price_cents || 0) * (item.quantity || 1),
          item_count: item.quantity || 1,
          retailer_key: item.retailer_key || item.retailer || undefined,
        });
      }
    }
  };

  const removeItem = async (item) => {
    if (myRole === 'VIEWER') {
      Alert.alert('Read Only', 'Only Shoppers and the Stack Manager can modify the cart.');
      return;
    }
    await supabase
      .from('household_cart_items')
      .update({ status: 'removed', updated_at: new Date().toISOString() })
      .eq('id', item.id);

    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    if (userId) {
      tracker.trackItemRemovedFromCart({
        user_id: userId,
        session_id: session.access_token || String(Date.now()),
        screen_name: 'CartScreen',
        product_name: item.product_name,
        item_id: item.id,
        quantity: item.quantity || 1,
        price_cents: item.unit_price_cents || 0,
        retailer: item.retailer || item.retailer_key,
      });
    }

    loadCart();
  };

  // ── No household ────────────────────────────────────────────────────────────
  if (!loading && !household) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Feather name="shopping-cart" size={32} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>No Household Yet</Text>
          <Text style={s.emptySub}>
            Create or join a household to use the shared cart. Requires the Snippd Family Plan ($30/mo).
          </Text>
          <TouchableOpacity style={s.emptyBtn} onPress={() => navigation.getParent()?.navigate('ProfileTab')}>
            <Text style={s.emptyBtnTxt}>Set Up Household</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  // ── Section header ──────────────────────────────────────────────────────────
  const renderSectionHeader = ({ section }) => {
    const cc = CAT_COLORS[section.title] || CAT_COLORS.Other;
    const activeCount = section.data.filter(i => i.status === 'active').length;
    return (
      <View style={[s.catHeader, { backgroundColor: cc.bg }]}>
        <View style={[s.catDot, { backgroundColor: cc.dot }]} />
        <Text style={[s.catTitle, { color: cc.dot }]}>{section.title}</Text>
        <Text style={s.catCount}>{activeCount} active</Text>
      </View>
    );
  };

  // ── Item row ────────────────────────────────────────────────────────────────
  const renderItem = ({ item, index, section }) => {
    const sc = SOURCE_LABEL[item.source] || SOURCE_LABEL.user_added;
    const isPurchased = item.status === 'purchased';
    const isLast = index === section.data.length - 1;

    return (
      <TouchableOpacity
        style={[s.itemRow, isLast && { borderBottomWidth: 0 }]}
        onPress={() => cycleStatus(item)}
        activeOpacity={myRole === 'VIEWER' ? 1 : 0.8}
      >
        <View style={[s.checkbox, isPurchased && s.checkboxDone]}>
          {isPurchased && <Feather name="check" size={12} color={WHITE} />}
        </View>

        <View style={s.itemInfo}>
          <View style={s.itemTopRow}>
            <Text
              style={[s.itemName, isPurchased && s.strike]}
              numberOfLines={1}
            >
              {item.product_name}{item.quantity > 1 ? `  ×${item.quantity}` : ''}
            </Text>
            {item.unit_price_cents ? (
              <Text style={[s.itemPrice, isPurchased && s.strike]}>
                {fmt(item.unit_price_cents * (item.quantity || 1))}
              </Text>
            ) : null}
          </View>

          <View style={s.itemMeta}>
            <View style={[s.srcBadge, { backgroundColor: sc.bg }]}>
              <Text style={[s.srcBadgeTxt, { color: sc.color }]}>{sc.text}</Text>
            </View>
            {item.added_by_user_id || item.added_by_username ? (() => {
              const m = membersMap[item.added_by_user_id];
              const uname = m?.username || item.added_by_username || '';
              const persona = m?.persona || '';
              return (
                <Text style={s.attribution}>
                  {uname ? `@${uname}` : ''}{persona ? `  ${persona}` : ''}
                </Text>
              );
            })() : null}
            {item.retailer ? <Text style={s.retailer}>{item.retailer}</Text> : null}
            {item.save_cents > 0 ? (
              <View style={s.saveBadge}>
                <Text style={s.saveBadgeTxt}>Save {fmt(item.save_cents)}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {myRole !== 'VIEWER' && item.status !== 'removed' && (
          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => removeItem(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={14} color={GRAY} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>{household?.name || 'Shared Cart'}</Text>
          <Text style={s.headerSub}>{myRole.replace('_', ' ')} · {summary.items} active item{summary.items !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity style={s.addBtn} onPress={() => navigation.navigate('DiscoverTab')}>
          <Feather name="plus" size={18} color={WHITE} />
        </TouchableOpacity>
      </View>

      {/* In-store summary + progress */}
      <View style={s.summaryBar}>
        <View style={s.summaryItem}>
          <Text style={s.summaryVal}>{fmt(summary.total) || '$0.00'}</Text>
          <Text style={s.summaryLabel}>IN CART</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={[s.summaryVal, { color: '#4ADE80' }]}>{fmt(summary.saved) || '$0.00'}</Text>
          <Text style={s.summaryLabel}>SAVING</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryItem}>
          <Text style={s.summaryVal}>{summary.purchased}</Text>
          <Text style={s.summaryLabel}>CHECKED</Text>
        </View>
      </View>

      {/* In-store progress bar */}
      {summary.items + summary.purchased > 0 && (() => {
        const total   = summary.items + summary.purchased;
        const pct     = total > 0 ? summary.purchased / total : 0;
        const done    = pct === 1;
        return (
          <View style={s.progressWrap}>
            <View style={s.progressTrackDark}>
              <View style={[s.progressFillGreen, { width: `${Math.round(pct * 100)}%` }]} />
            </View>
            <Text style={s.progressTxt}>
              {done
                ? '✓ All items checked!'
                : `${summary.purchased} of ${total} checked`}
            </Text>
          </View>
        );
      })()}

      {/* Smart Carts banner */}
      <TouchableOpacity
        style={s.smartCartsBanner}
        onPress={() => navigation.navigate('CartOptions', { retailer_key: 'publix' })}
        activeOpacity={0.85}
      >
        <View style={s.smartCartsLeft}>
          <View style={s.smartCartsIconWrap}>
            <Feather name="cpu" size={14} color={GREEN} />
          </View>
          <View>
            <Text style={s.smartCartsTitle}>Smart Carts</Text>
            <Text style={s.smartCartsSub}>3 personalised carts built for you</Text>
          </View>
        </View>
        <Feather name="chevron-right" size={16} color={GREEN} />
      </TouchableOpacity>

      {/* Filter + role */}
      <View style={s.filterRow}>
        {[{ key: 'active', label: 'Active' }, { key: 'all', label: 'All Items' }].map(f => (
          <TouchableOpacity
            key={f.key}
            style={[s.filterChip, activeFilter === f.key && s.filterChipOn]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[s.filterChipTxt, activeFilter === f.key && s.filterChipTxtOn]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
        <View style={{ flex: 1 }} />
        <View style={s.roleBadge}>
          <Text style={s.roleBadgeTxt}>{myRole.replace('_', ' ')}</Text>
        </View>
      </View>

      {sections.length === 0 ? (
        <View style={s.emptyCart}>
          <Feather name="inbox" size={28} color={GRAY} />
          <Text style={s.emptyCartTxt}>Cart is empty</Text>
          <Text style={s.emptyCartSub}>Add deals from Discover or ingredients from Chef Stash.</Text>
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          renderSectionHeader={renderSectionHeader}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      {/* Source legend */}
      {sections.length > 0 && (
        <View style={s.legend}>
          {Object.values(SOURCE_LABEL).map((val, i) => (
            <View key={i} style={s.legendItem}>
              <View style={[s.legendDot, { backgroundColor: val.color }]} />
              <Text style={s.legendTxt}>{val.text}</Text>
            </View>
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  headerSub:   { fontSize: 12, color: GRAY, marginTop: 1 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 6, elevation: 4,
  },

  summaryBar: {
    flexDirection: 'row', backgroundColor: NAVY,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryVal:     { fontSize: 18, fontWeight: 'bold', color: WHITE, marginBottom: 2 },
  summaryLabel:   { fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 'bold', letterSpacing: 0.8 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // In-store progress bar
  progressWrap: {
    backgroundColor: NAVY, paddingHorizontal: 16, paddingBottom: 10, gap: 5,
  },
  progressTrackDark: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 3, overflow: 'hidden',
  },
  progressFillGreen: {
    height: '100%', backgroundColor: '#4ADE80', borderRadius: 3,
  },
  progressTxt: {
    fontSize: 10, color: 'rgba(255,255,255,0.6)',
    fontWeight: 'bold', letterSpacing: 0.3,
  },

  smartCartsBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: LIGHT_GREEN, borderBottomWidth: 1, borderBottomColor: '#C6F6D5',
  },
  smartCartsLeft:   { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  smartCartsIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center' },
  smartCartsTitle:  { fontSize: 13, fontWeight: '800', color: NAVY },
  smartCartsSub:    { fontSize: 11, color: GRAY, fontWeight: '500', marginTop: 1 },

  filterRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER, gap: 8,
  },
  filterChip:    { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE },
  filterChipOn:  { backgroundColor: NAVY, borderColor: NAVY },
  filterChipTxt: { fontSize: 12, fontWeight: 'bold', color: NAVY },
  filterChipTxtOn: { color: WHITE },
  roleBadge:    { backgroundColor: LIGHT_GREEN, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  roleBadgeTxt: { fontSize: 10, fontWeight: 'bold', color: GREEN },

  list: { paddingHorizontal: 0, paddingTop: 8 },

  catHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 7, gap: 8,
    marginTop: 8, marginHorizontal: 16, borderRadius: 10,
  },
  catDot:   { width: 8, height: 8, borderRadius: 4 },
  catTitle: { flex: 1, fontSize: 12, fontWeight: 'bold', letterSpacing: 0.5 },
  catCount: { fontSize: 10, color: GRAY },

  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 12, marginHorizontal: 16,
  },
  checkbox:     { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: BORDER, alignItems: 'center', justifyContent: 'center', backgroundColor: WHITE },
  checkboxDone: { backgroundColor: GREEN, borderColor: GREEN },
  itemInfo:     { flex: 1 },
  itemTopRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  itemName:     { flex: 1, fontSize: 14, fontWeight: 'bold', color: NAVY, marginRight: 8 },
  itemPrice:    { fontSize: 14, fontWeight: 'bold', color: NAVY },
  strike:       { textDecorationLine: 'line-through', color: GRAY },
  itemMeta:     { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  srcBadge:     { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  srcBadgeTxt:  { fontSize: 9, fontWeight: 'bold', letterSpacing: 0.3 },
  attribution:  { fontSize: 10, color: GRAY, fontWeight: 'normal' },
  retailer:     { fontSize: 10, color: GRAY },
  saveBadge:    { backgroundColor: LIGHT_GREEN, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  saveBadgeTxt: { fontSize: 9, fontWeight: 'bold', color: GREEN },
  removeBtn:    { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },

  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: LIGHT_GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: 'bold', color: NAVY, marginBottom: 8 },
  emptySub:   { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyBtn:   { backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 28, paddingVertical: 14, shadowColor: GREEN, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  emptyBtnTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
  emptyCart:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyCartTxt: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  emptyCartSub: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19 },

  legend: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'center', gap: 16,
    paddingVertical: 10, paddingBottom: 16,
    backgroundColor: WHITE, borderTopWidth: 1, borderTopColor: BORDER,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot:  { width: 6, height: 6, borderRadius: 3 },
  legendTxt:  { fontSize: 10, color: GRAY },
});
