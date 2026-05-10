/**
 * CartScreen — Personal cart + optional shared household cart.
 *
 * Primary: items from AsyncStorage key 'snippd_cart'
 *   (written by WeeklyPlanScreen "Lock in" and DiscoverScreen "Add to cart").
 *
 * Secondary: household_cart_items from Supabase (if household exists).
 *
 * "Verify Receipt" → ReceiptUpload screen.
 */

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, RefreshControl, ScrollView,
  StatusBar, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { tracker } from '../src/lib/eventTracker';
import {
  authorizedTotalsForRoute,
  displayQuantity,
  fetchAuthorizedCheckoutMath,
} from '../src/services/authoritativeCheckoutMath';
import {
  runCouponClip,
  fmtSavings,
} from '../src/services/CouponClippingService';
import { readActiveCart } from '../src/services/cartStorage';
import { fetchWeeklyBudgetCents } from '../lib/weeklyBudget';
import { fetchTop3StoreEngine, engineTotalsForDisplay } from '../src/services/top3StoreEngine';
import CartNutritionSummary from '../src/components/CartNutritionSummary';
import StoreCartHandoffCard from '../src/components/StoreCartHandoffCard';
import { recordMemoryEvent } from '../src/lib/memoryEvents';

// ── Constants ──────────────────────────────────────────────────────
const CART_KEY    = 'snippd_cart';

const GREEN       = '#0C9E54';
const FOREST      = '#0C7A3D';
const NAVY        = '#0D1B4B';
const WHITE       = '#FFFFFF';
const GRAY        = '#8A8F9E';
const OFF_WHITE   = '#F8F9FA';
const PALE_GREEN  = '#F0FDF4';
const LIGHT_GREEN = '#E8F8F0';
const BORDER      = '#E2E8F0';
const RED         = '#EF4444';
const AMBER       = '#F59E0B';
const PURPLE      = '#A855F7';

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

// ── Deal-type badge colours ────────────────────────────────────────
const DEAL_BADGE = {
  BOGO:                { bg: '#DCFCE7', text: '#15803D', label: 'BOGO' },
  SALE:                { bg: '#DBEAFE', text: '#1D4ED8', label: 'SALE' },
  DIGITAL_COUPON:      { bg: '#EDE9FE', text: '#6D28D9', label: 'DIGITAL' },
  LOYALTY_PRICE:       { bg: '#FEF3C7', text: '#92400E', label: 'LOYALTY' },
  MANUFACTURER_COUPON: { bg: '#FCE7F3', text: '#9D174D', label: 'MFR' },
  MULTI:               { bg: '#FEE2E2', text: '#B91C1C', label: 'MULTI' },
};

const EXTRA_BADGES = [
  { keys: ['ibotta', 'rebate'], label: 'IBOTTA', bg: '#ECFDF5', text: '#047857' },
  { keys: ['fetch'], label: 'FETCH', bg: '#FFF7ED', text: '#C2410C' },
  { keys: ['manufacturer', 'mfr'], label: 'MFR COUPON', bg: '#FCE7F3', text: '#9D174D' },
  { keys: ['digital', 'coupon'], label: 'COUPON', bg: '#EDE9FE', text: '#6D28D9' },
];

const STORE_AREAS = [
  { key: 'produce', label: 'Produce', icon: 'sun', words: ['apple', 'banana', 'lettuce', 'tomato', 'onion', 'pepper', 'broccoli', 'asparagus', 'potato', 'lemon', 'lime', 'fruit', 'vegetable', 'produce', 'salad'] },
  { key: 'meat', label: 'Meat & Seafood', icon: 'box', words: ['chicken', 'beef', 'pork', 'salmon', 'fish', 'turkey', 'sausage', 'bacon', 'meat', 'seafood', 'shrimp'] },
  { key: 'dairy', label: 'Dairy & Eggs', icon: 'droplet', words: ['milk', 'cheese', 'yogurt', 'butter', 'egg', 'cream', 'dairy'] },
  { key: 'bakery', label: 'Bakery', icon: 'shopping-bag', words: ['bread', 'roll', 'bun', 'bagel', 'tortilla', 'bakery', 'hoagie'] },
  { key: 'pantry', label: 'Pantry', icon: 'package', words: ['rice', 'beans', 'pasta', 'sauce', 'cereal', 'oil', 'seasoning', 'broth', 'tomatoes', 'noodles', 'pantry', 'can', 'canned'] },
  { key: 'frozen', label: 'Frozen', icon: 'cloud-snow', words: ['frozen', 'ice cream', 'pizza'] },
  { key: 'household', label: 'Household', icon: 'home', words: ['paper', 'detergent', 'soap', 'cleaner', 'trash', 'diaper', 'household'] },
  { key: 'other', label: 'Other', icon: 'grid', words: [] },
];

function DealBadge({ dealType }) {
  if (!dealType) return null;
  const cfg = DEAL_BADGE[dealType];
  if (!cfg) return null;
  return (
    <View style={[s.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[s.badgeTxt, { color: cfg.text }]}>{cfg.label}</Text>
    </View>
  );
}

function ExtraBadges({ item }) {
  const haystack = [
    item.deal_type,
    item.coupon_type,
    item.rebate_type,
    item.source,
    item.offer_source,
    item.notes,
    ...(Array.isArray(item.tags) ? item.tags : []),
  ].filter(Boolean).join(' ').toLowerCase();

  return EXTRA_BADGES
    .filter(badge => badge.keys.some(key => haystack.includes(key)))
    .map(badge => (
      <View key={badge.label} style={[s.badge, { backgroundColor: badge.bg }]}>
        <Text style={[s.badgeTxt, { color: badge.text }]}>{badge.label}</Text>
      </View>
    ));
}

function inferStoreArea(item) {
  const explicit = String(item.store_area || item.category || item.department || '').toLowerCase();
  const name = String(item.product_name || item.name || '').toLowerCase();
  const haystack = `${explicit} ${name}`;
  return STORE_AREAS.find(area => area.key !== 'other' && area.words.some(word => haystack.includes(word))) || STORE_AREAS[STORE_AREAS.length - 1];
}

function storeLabelForItem(item) {
  return item.retailer || item.retailer_key || item.store || item.store_name || 'Store';
}

function storeKeyForItem(item) {
  return String(storeLabelForItem(item)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'store';
}

// ── Cart math helpers ──────────────────────────────────────────────
function disabledLocalBogoDisplay(item) {
  // BOGO: customer pays for one, gets two.
  // sale_cents should already be the per-unit price; we display qty=2.
  const unitCents = item.sale_cents || item.reg_cents || 0;
  return {
    quantity:     2,
    payCents:  unitCents,                         // pay for 1
    fullCents: (item.reg_cents || unitCents) * 2, // would cost 2× regular
    savingsCents:  item.reg_cents || unitCents,       // save 1 unit
    saveRate:    50,                               // always 50%
  };
}

function disabledLocalItemDisplay(item) {
  if (item.deal_type === 'BOGO') return disabledLocalBogoDisplay(item);
  const qty         = Math.max(1, item.quantity || 1);
  const saleCents   = item.sale_cents || item.reg_cents || 0;
  const regCents    = item.reg_cents  || item.sale_cents || 0;
  return {
    quantity:      qty,
    payCents:   saleCents * qty,
    fullCents: regCents  * qty,
    savingsCents:  Math.max(0, regCents - saleCents) * qty,
    saveRate:    regCents > 0
      ? Math.round(((regCents - saleCents) / regCents) * 100)
      : 0,
  };
}

function itemPayCents(item) {
  return disabledLocalItemDisplay(item).payCents;
}

function groupCartByStoreArea(items, checked) {
  const groups = new Map(STORE_AREAS.map(area => [
    area.key,
    { ...area, items: [], totalCents: 0, checkedCount: 0 },
  ]));

  items.forEach(item => {
    const area = inferStoreArea(item);
    const group = groups.get(area.key);
    group.items.push(item);
    group.totalCents += itemPayCents(item);
    if (checked[item.id]) group.checkedCount += 1;
  });

  return STORE_AREAS.map(area => groups.get(area.key)).filter(group => group.items.length > 0);
}

function groupCartByStore(items, checked) {
  const stores = new Map();

  items.forEach(item => {
    const key = storeKeyForItem(item);
    if (!stores.has(key)) {
      stores.set(key, {
        key,
        label: storeLabelForItem(item),
        items: [],
        totalCents: 0,
        checkedCount: 0,
      });
    }

    const store = stores.get(key);
    store.items.push(item);
    store.totalCents += itemPayCents(item);
    if (checked[item.id]) store.checkedCount += 1;
  });

  return Array.from(stores.values()).map(store => ({
    ...store,
    areas: groupCartByStoreArea(store.items, checked),
  }));
}

// ── Personal cart item row ─────────────────────────────────────────
function PersonalItemRow({ item, checked, onToggle, onRemove }) {
  const isBogo = item.deal_type === 'BOGO';
  const qty = displayQuantity(item);
  const payCents = itemPayCents(item);

  return (
    <TouchableOpacity style={[s.itemRow, checked && s.itemRowDone]} onPress={() => onToggle(item)} activeOpacity={0.78}>
      <View style={[s.checkCircle, checked && s.checkCircleDone]}>
        {checked && <Feather name="check" size={13} color={WHITE} />}
      </View>
      <View style={s.itemMain}>
        <View style={s.itemTopRow}>
          <Text style={[s.itemName, checked && s.itemNameDone]} numberOfLines={2}>
            {item.product_name || item.name}
            {qty > 1 ? `  x${qty}` : ''}
          </Text>
          <TouchableOpacity
            style={s.removeBtn}
            onPress={() => onRemove(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="x" size={13} color={GRAY} />
          </TouchableOpacity>
        </View>

        <View style={s.itemMeta}>
          {item.retailer || item.retailer_key ? (
            <Text style={s.retailerTxt}>{item.retailer || item.retailer_key}</Text>
          ) : null}
          <DealBadge dealType={item.deal_type} />
          <ExtraBadges item={item} />
          {item.day ? (
            <Text style={s.dayTxt}>{item.day}</Text>
          ) : null}
        </View>

        {item.meal_name ? (
          <View style={s.mealConnectRow}>
            <View style={s.mealConnectDot} />
            <Text style={s.mealConnectTxt} numberOfLines={1}>For: {item.meal_name}</Text>
          </View>
        ) : null}

        {isBogo && (
          <Text style={s.bogoNote}>Buy 2 — second is free</Text>
        )}
      </View>

      <View style={s.itemPricing}>
        <Text style={s.salePrice}>{fmt(payCents)}</Text>
        <View style={s.saveBadge}>
          <Text style={s.saveTxt}>{checked ? 'in cart' : 'planned'}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function StoreAreaSection({
  group,
  collapseKey,
  collapsed,
  checked,
  onToggleCollapsed,
  onToggleItem,
  onToggleSection,
  onRemove,
}) {
  const done = group.checkedCount === group.items.length;
  return (
    <View style={s.areaCard}>
      <TouchableOpacity style={s.areaHeader} onPress={() => onToggleCollapsed(collapseKey || group.key)} activeOpacity={0.8}>
        <View style={s.areaTitleRow}>
          <View style={[s.areaIcon, done && s.areaIconDone]}>
            <Feather name={done ? 'check' : group.icon} size={15} color={done ? WHITE : GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.areaTitle}>{group.label}</Text>
            <Text style={s.areaSub}>
              {group.checkedCount}/{group.items.length} checked • {fmt(group.totalCents)}
            </Text>
          </View>
        </View>
        <View style={s.areaRight}>
          <TouchableOpacity
            style={[s.sectionDoneBtn, done && s.sectionDoneBtnActive]}
            onPress={() => onToggleSection(group, collapseKey || group.key)}
            activeOpacity={0.8}
          >
            <Text style={[s.sectionDoneTxt, done && s.sectionDoneTxtActive]}>
              {done ? 'Done' : 'Check section'}
            </Text>
          </TouchableOpacity>
          <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={18} color={GRAY} />
        </View>
      </TouchableOpacity>

      {!collapsed && (
        <View>
          {group.items.map((item, i) => (
            <View key={item.id || i}>
              <PersonalItemRow
                item={item}
                checked={Boolean(checked[item.id])}
                onToggle={onToggleItem}
                onRemove={onRemove}
              />
              {i < group.items.length - 1 && <View style={s.itemSep} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function StoreSection({
  store,
  collapsed,
  collapsedAreas,
  checked,
  userId,
  onToggleStore,
  onToggleArea,
  onToggleItem,
  onToggleSection,
  onRemove,
}) {
  const done = store.checkedCount === store.items.length;
  return (
    <View style={s.storeCard}>
      <TouchableOpacity style={s.storeHeader} onPress={() => onToggleStore(store.key)} activeOpacity={0.84}>
        <View style={s.storeTitleRow}>
          <View style={[s.storeIcon, done && s.storeIconDone]}>
            <Feather name={done ? 'check' : 'map-pin'} size={16} color={done ? WHITE : FOREST} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.storeTitle}>{store.label}</Text>
            <Text style={s.storeSub}>
              {store.checkedCount}/{store.items.length} checked • {store.areas.length} area{store.areas.length !== 1 ? 's' : ''} • {fmt(store.totalCents)}
            </Text>
          </View>
        </View>
        <Feather name={collapsed ? 'chevron-down' : 'chevron-up'} size={19} color={GRAY} />
      </TouchableOpacity>

      {!collapsed && (
        <View style={s.storeAreas}>
          {store.areas.map(area => {
            const areaCollapseKey = `${store.key}:${area.key}`;
            return (
              <StoreAreaSection
                key={areaCollapseKey}
                group={area}
                collapseKey={areaCollapseKey}
                collapsed={Boolean(collapsedAreas[areaCollapseKey])}
                checked={checked}
                onToggleCollapsed={onToggleArea}
                onToggleItem={onToggleItem}
                onToggleSection={onToggleSection}
                onRemove={onRemove}
              />
            );
          })}
          <StoreCartHandoffCard
            storeLabel={store.label}
            retailerKey={store.key}
            items={store.items}
            userId={userId}
            sessionId={`cart_handoff_${store.key}`}
          />
          <StoreFulfillment storeLabel={store.label} />
        </View>
      )}
    </View>
  );
}

function StoreFulfillment({ storeLabel }) {
  const [mode, setMode] = React.useState('pickup');
  const options = [
    { key: 'pickup',   label: 'Pickup',   icon: 'map-pin' },
    { key: 'delivery', label: 'Delivery', icon: 'truck' },
    { key: 'instore',  label: 'In-Store', icon: 'shopping-bag' },
  ];
  return (
    <View style={s.fulfillCard}>
      <Text style={s.fulfillLabel}>FULFILLMENT  ·  {storeLabel.toUpperCase()}</Text>
      <View style={s.fulfillRow}>
        {options.map(opt => (
          <TouchableOpacity
            key={opt.key}
            style={[s.fulfillBtn, mode === opt.key && s.fulfillBtnActive]}
            onPress={() => setMode(opt.key)}
            activeOpacity={0.8}
          >
            <Feather name={opt.icon} size={13} color={mode === opt.key ? GREEN : GRAY} />
            <Text style={[s.fulfillBtnTxt, mode === opt.key && s.fulfillBtnTxtActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

// ── Cart totals ────────────────────────────────────────────────────
function disabledCartAuthorityFallback(items) {
  let authorityRegular  = 0;
  let authorityPay        = 0;
  let atRegisterSav = 0;

  for (const item of items) {
    const t = disabledLocalItemDisplay(item);
    authorityRegular  += t.fullCents;
    authorityPay        += t.payCents;
    atRegisterSav += t.savingsCents;
  }

  const trueFinal    = authorityPay; // no rebates modelled yet
  const authoritySavings = Math.max(0, authorityRegular - trueFinal);
  const saveRate   = authorityRegular > 0
    ? ((authoritySavings / authorityRegular) * 100).toFixed(1)
    : '0.0';

  return {
    authorityRegular,
    authorityRegisterSavings: atRegisterSav,
    authorityPay,
    trueFinal,
    authoritySavings,
    saveRate,
  };
}

// ── Checkout Shield ────────────────────────────────────────────────
// Shows matched digital coupons ready to clip, and total potential
// savings from CouponClippingService. Replaces the old checklist.
function CheckoutShield({ coupons, savingsCents, loading }) {
  if (loading) {
    return (
      <View style={s.shieldCard}>
        <View style={s.shieldHeader}>
          <Feather name="shield" size={16} color={PURPLE} />
          <Text style={s.shieldTitle}>CHECKOUT SHIELD</Text>
        </View>
        <ActivityIndicator size="small" color={PURPLE} style={{ marginTop: 8 }} />
      </View>
    );
  }

  if (!coupons || coupons.length === 0) return null;

  return (
    <View style={s.shieldCard}>
      <View style={s.shieldHeader}>
        <Feather name="shield" size={16} color={PURPLE} />
        <Text style={s.shieldTitle}>CHECKOUT SHIELD</Text>
        <View style={s.shieldSavingsBadge}>
          <Text style={s.shieldSavingsTxt}>Save {fmtSavings(savingsCents)}</Text>
        </View>
      </View>
      <Text style={s.shieldSub}>
        {coupons.length} verified digital coupon{coupons.length !== 1 ? 's' : ''} ready - exact retailer sources confirmed
      </Text>
      {coupons.map((coupon, i) => (
        <View key={coupon.coupon_id || i} style={s.shieldRow}>
          <View style={s.shieldDot} />
          <View style={{ flex: 1 }}>
            <Text style={s.shieldItemName} numberOfLines={1}>{coupon.product_name}</Text>
            <View style={s.shieldMeta}>
              <Text style={s.shieldRetailer}>{coupon.retailer_key}</Text>
              {coupon.verified_at && (
                <View style={s.shieldTag}>
                  <Text style={s.shieldTagTxt}>Checked {new Date(coupon.verified_at).toLocaleDateString()}</Text>
                </View>
              )}
              {coupon.expiration_date && (
                <View style={s.shieldTag}>
                  <Text style={s.shieldTagTxt}>Exp {coupon.expiration_date}</Text>
                </View>
              )}
              {coupon.is_loyalty_req && (
                <View style={s.shieldTag}>
                  <Text style={s.shieldTagTxt}>Loyalty</Text>
                </View>
              )}
              {coupon.is_app_only && (
                <View style={[s.shieldTag, { backgroundColor: '#EDE9FE' }]}>
                  <Text style={[s.shieldTagTxt, { color: PURPLE }]}>App only</Text>
                </View>
              )}
            </View>
          </View>
          <Text style={s.shieldAmount}>{coupon.savings_label}</Text>
        </View>
      ))}
    </View>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────
export default function CartScreen({ navigation }) {
  const [personalItems, setPersonalItems] = useState([]);
  const [loading,       setLoading]       = useState(true);
  const [refreshing,    setRefreshing]    = useState(false);
  const [checkoutAuthority, setCheckoutAuthority] = useState(null);
  const [enginePayload, setEnginePayload] = useState(null);

  // Checkout Shield state
  const [shieldCoupons,    setShieldCoupons]    = useState([]);
  const [shieldSavings,    setShieldSavings]    = useState(0);
  const [shieldLoading,    setShieldLoading]    = useState(false);
  const [checkedItems,     setCheckedItems]     = useState({});
  const [collapsedAreas,   setCollapsedAreas]   = useState({});
  const [collapsedStores,  setCollapsedStores]  = useState({});

  // Nutrition summary state
  const [userAllergies,      setUserAllergies]      = useState([]);
  const [weeklyBudgetCents,  setWeeklyBudgetCents]  = useState(15000); // $150 default

  // Per-user cart key so carts don't bleed across accounts on shared devices
  const cartKeyRef = useRef(CART_KEY);
  const userIdRef  = useRef(null);

  // ── Load cart from AsyncStorage ──────────────────────────────────
  const loadCart = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.id) {
        cartKeyRef.current = `snippd_cart_${user.id}`;
        userIdRef.current  = user.id;
        // Load allergies for CartNutritionSummary warnings (non-blocking)
        supabase
          .from('user_preferences')
          .select('allergies')
          .eq('user_id', user.id)
          .maybeSingle()
          .then(({ data }) => { if (data?.allergies) setUserAllergies(data.allergies); })
          .catch(() => {});
      }
      // Load budget so we can show progress vs target (non-blocking)
      fetchWeeklyBudgetCents().then(setWeeklyBudgetCents).catch(() => {});
      const { key, items } = await readActiveCart();
      cartKeyRef.current = key;
      const normalized = items;
      setPersonalItems(normalized);
      setCollapsedStores(prev => {
        if (Object.keys(prev).length > 0) return prev;
        const storeKeys = [...new Set(normalized.map(storeKeyForItem))];
        return Object.fromEntries(storeKeys.map(storeKey => [storeKey, true]));
      });
      try {
        const rawChecked = await AsyncStorage.getItem(`${key}_checked`);
        const parsedChecked = rawChecked ? JSON.parse(rawChecked) : {};
        const itemIds = new Set(normalized.map(item => item.id));
        setCheckedItems(Object.fromEntries(
          Object.entries(parsedChecked).filter(([id]) => itemIds.has(id))
        ));
      } catch {
        setCheckedItems({});
      }
      setCheckoutAuthority(normalized.length ? await fetchAuthorizedCheckoutMath({ items: normalized }) : null);
      setEnginePayload(normalized.length ? await fetchTop3StoreEngine({ items: normalized }) : null);

      // Trigger Checkout Shield scan after cart loads
      if (normalized.length > 0 && userIdRef.current) {
        setShieldLoading(true);
        runCouponClip(userIdRef.current).then(result => {
          setShieldCoupons(result.coupons);
          setShieldSavings(result.savingsCents);
        }).catch(() => {}).finally(() => setShieldLoading(false));
      } else {
        setShieldCoupons([]);
        setShieldSavings(0);
      }
    } catch {
      setPersonalItems([]);
      setCheckoutAuthority(null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadCart(); }, [loadCart]);

  const onRefresh = () => { setRefreshing(true); loadCart(); };

  const saveCheckedItems = useCallback(async (next) => {
    setCheckedItems(next);
    await AsyncStorage.setItem(`${cartKeyRef.current}_checked`, JSON.stringify(next));
  }, []);

  const toggleItemChecked = useCallback(async (item) => {
    const next = { ...checkedItems, [item.id]: !checkedItems[item.id] };
    if (!next[item.id]) delete next[item.id];
    await saveCheckedItems(next);
  }, [checkedItems, saveCheckedItems]);

  const toggleAreaCollapsed = useCallback((areaKey) => {
    setCollapsedAreas(prev => ({ ...prev, [areaKey]: !prev[areaKey] }));
  }, []);

  const toggleStoreCollapsed = useCallback((storeKey) => {
    setCollapsedStores(prev => ({ ...prev, [storeKey]: !prev[storeKey] }));
  }, []);

  const toggleSectionChecked = useCallback(async (group, collapseKey) => {
    const sectionDone = group.items.every(item => checkedItems[item.id]);
    const next = { ...checkedItems };
    group.items.forEach(item => {
      if (sectionDone) delete next[item.id];
      else next[item.id] = true;
    });
    await saveCheckedItems(next);
    if (!sectionDone) {
      setCollapsedAreas(prev => ({ ...prev, [collapseKey || group.key]: true }));
    }
  }, [checkedItems, saveCheckedItems]);

  // ── Remove single item ───────────────────────────────────────────
  const removeItem = useCallback(async (item) => {
    const updated = personalItems.filter(i => i.id !== item.id);
    const nextChecked = { ...checkedItems };
    delete nextChecked[item.id];
    setPersonalItems(updated);
    setCheckedItems(nextChecked);
    await AsyncStorage.setItem(cartKeyRef.current, JSON.stringify(updated));
    await AsyncStorage.setItem(`${cartKeyRef.current}_checked`, JSON.stringify(nextChecked));

    recordMemoryEvent({
      event_type: 'product_removed_from_cart',
      entity_type: 'product',
      entity_id: String(item.barcode || item.id || item.product_name || item.name),
      product_id: String(item.barcode || item.id || ''),
      barcode: item.barcode,
      store_id: item.retailer_key || item.retailer || item.store,
      cost: (item.sale_cents || item.final_price_cents || 0) / 100,
      savings: Math.max(0, (item.reg_cents || 0) - (item.sale_cents || 0)) / 100,
      metadata: {
        source: 'CartScreen',
        product_name: item.product_name || item.name,
        quantity: item.quantity || 1,
      },
    });

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        tracker.trackItemRemovedFromCart({
          user_id: session.user.id,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'CartScreen',
          product_name: item.product_name || item.name,
          item_id: item.id,
          quantity: item.quantity || 1,
          price_cents: item.sale_cents || 0,
          retailer: item.retailer || item.retailer_key,
        });
      }
    } catch { /* tracking failure is non-critical */ }
  }, [checkedItems, personalItems]);

  // ── Clear entire cart ────────────────────────────────────────────
  const clearCart = () => {
    Alert.alert(
      'Clear Cart',
      'Remove all items from your cart?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            setPersonalItems([]);
            setCheckedItems({});
            await AsyncStorage.removeItem(cartKeyRef.current);
            await AsyncStorage.removeItem(`${cartKeyRef.current}_checked`);
          },
        },
      ]
    );
  };

  const authorizedTotals = authorizedTotalsForRoute(checkoutAuthority);
  const mathUnavailable = personalItems.length > 0 && !authorizedTotals;
  const storeGroups = useMemo(() => groupCartByStore(personalItems, checkedItems), [personalItems, checkedItems]);
  const checkedCount = Object.keys(checkedItems).filter(id => personalItems.some(item => item.id === id)).length;
  const fallbackTotals = useMemo(() => disabledCartAuthorityFallback(personalItems), [personalItems]);
  const engineTotals = engineTotalsForDisplay(enginePayload);
  const registerCents = authorizedTotals?.you_pay_cents
    ?? (engineTotals.final_estimated_total_cents || fallbackTotals.authorityPay);
  const savingsCents = authorizedTotals?.total_savings_cents
    ?? (engineTotals.stack_savings_cents || fallbackTotals.authoritySavings);
  const activeStores = storeGroups.filter(store => store.items.some(item => checkedItems[item.id])).length || storeGroups.length;

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  // ── Empty state ──────────────────────────────────────────────────
  if (personalItems.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <StatusBar barStyle="dark-content" />
        <View style={s.header}>
          <Text style={s.headerTitle}>Your Cart</Text>
          <View style={s.headerRight} />
        </View>
        <View style={s.emptyWrap}>
          <View style={s.emptyIcon}>
            <Feather name="shopping-cart" size={32} color={GREEN} />
          </View>
          <Text style={s.emptyTitle}>Cart is empty</Text>
          <Text style={s.emptySub}>
            Lock in your weekly plan or add deals from Explore to fill your cart.
          </Text>
          <TouchableOpacity
            style={s.emptyBtn}
            onPress={() => navigation.getParent()?.navigate('PlanTab')}
          >
            <Text style={s.emptyBtnTxt}>View Weekly Plan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: WHITE, borderWidth: 1.5, borderColor: GREEN, marginTop: 10 }]}
            onPress={() => navigation.getParent()?.navigate('DiscoverTab')}
          >
            <Text style={[s.emptyBtnTxt, { color: GREEN }]}>Browse Deals</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.emptyBtn, { backgroundColor: WHITE, borderWidth: 1.5, borderColor: GREEN, marginTop: 10 }]}
            onPress={() => navigation.navigate('BarcodeScanner')}
          >
            <Text style={[s.emptyBtnTxt, { color: GREEN }]}>Scan to Add</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Loaded state ─────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Your Cart</Text>
          <Text style={s.headerSub}>
            {checkedCount}/{personalItems.length} checked • {storeGroups.length} store{storeGroups.length !== 1 ? 's' : ''}
          </Text>
        </View>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.clearBtn} onPress={clearCart}>
            <Text style={s.clearBtnTxt}>Clear</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.addBtn}
            onPress={() => navigation.navigate('BarcodeScanner')}
          >
            <Feather name="camera" size={18} color={WHITE} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >

        <View style={s.registerHero}>
          <View style={s.registerHeroTop}>
            <View>
              <Text style={s.registerHeroLabel}>
                {authorizedTotals ? 'Authorized at register' : 'Estimated at register'}
              </Text>
              <Text style={s.registerHeroAmount}>{fmt(registerCents)}</Text>
            </View>
            <View style={s.savingsHeroBlock}>
              <Text style={s.registerHeroLabel}>You save</Text>
              <Text style={s.savingsHeroAmount}>{fmt(savingsCents)}</Text>
            </View>
          </View>
          {weeklyBudgetCents > 0 && registerCents > 0 && (() => {
            const pct = Math.min(100, Math.round((registerCents / weeklyBudgetCents) * 100));
            const over = registerCents > weeklyBudgetCents;
            return (
              <View style={s.registerBudgetRow}>
                <View style={s.registerBudgetTrack}>
                  <View style={[s.registerBudgetFill, { width: `${pct}%`, backgroundColor: over ? '#FCA5A5' : 'rgba(255,255,255,0.7)' }]} />
                </View>
                <Text style={[s.registerBudgetLbl, over && { color: '#FCA5A5' }]}>
                  {fmt(registerCents)} / {fmt(weeklyBudgetCents)} budget
                  {over ? ` · ${fmt(registerCents - weeklyBudgetCents)} over` : ` · ${fmt(weeklyBudgetCents - registerCents)} under`}
                </Text>
              </View>
            );
          })()}
          <Text style={s.registerHeroMeta}>
            {personalItems.length} item{personalItems.length !== 1 ? 's' : ''} • {storeGroups.length} store{storeGroups.length !== 1 ? 's' : ''}
          </Text>
          <Text style={s.registerHeroSub}>
            {authorizedTotals
              ? 'Savings include coupons and signed checkout math'
              : 'Savings include coupons and deals. Final totals verify in Transparent Checkout.'}
          </Text>
        </View>

        <TouchableOpacity
          style={s.flowCard}
          onPress={() => navigation.navigate('BarcodeScanner')}
          activeOpacity={0.88}
        >
          <View style={s.flowIcon}>
            <Feather name="camera" size={17} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flowTitle}>Scan to Add</Text>
            <Text style={s.flowSub}>Check nutrition, allergens, and fit before it hits your cart</Text>
          </View>
          <Feather name="chevron-right" size={18} color={GRAY} />
        </TouchableOpacity>

        {storeGroups.map(store => (
          <StoreSection
            key={store.key}
            store={store}
            collapsed={Boolean(collapsedStores[store.key])}
            collapsedAreas={collapsedAreas}
            checked={checkedItems}
            userId={userIdRef.current}
            onToggleStore={toggleStoreCollapsed}
            onToggleArea={toggleAreaCollapsed}
            onToggleItem={toggleItemChecked}
            onToggleSection={toggleSectionChecked}
            onRemove={removeItem}
          />
        ))}

        {/* Nutrition summary — non-blocking, renders only when cache has data */}
        <CartNutritionSummary items={personalItems} userAllergies={userAllergies} />

        {/* Checkout Shield — digital coupons ready to clip */}
        <CheckoutShield
          coupons={shieldCoupons}
          savingsCents={shieldSavings}
          loading={shieldLoading}
        />

        {mathUnavailable && (
          <View style={s.warningCard}>
            <Text style={s.warningTitle}>Checkout math unavailable</Text>
            <Text style={s.checklistTxt}>
              Totals stay hidden until Transparent Checkout returns signed Cloud Run math.
            </Text>
          </View>
        )}

        {/* Step 1: Prep coupons before heading to store */}
        <TouchableOpacity
          style={s.flowCard}
          onPress={() =>
            navigation.navigate('CouponClipping', {
              cartItems: personalItems,
              checkoutAuthority,
              totals: authorizedTotals,
              coupons: shieldCoupons,
              enginePayload,
            })
          }
          activeOpacity={0.88}
        >
          <View style={s.flowIcon}>
            <Feather name="scissors" size={17} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.flowTitle}>Pre-shop coupons</Text>
            <Text style={s.flowSub}>
              {shieldCoupons.length > 0 ? `${shieldCoupons.length} offer${shieldCoupons.length !== 1 ? 's' : ''} ready before you shop` : 'Prep savings before you shop'}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={GRAY} />
        </TouchableOpacity>

        {/* Step 2: Transparent checkout → verified */}
        <TouchableOpacity
          style={s.verifyBtn}
          onPress={() => {
            recordMemoryEvent({
              event_type: 'cart_completed',
              entity_type: 'cart',
              entity_id: cartKeyRef.current,
              cost: registerCents / 100,
              savings: savingsCents / 100,
              metadata: {
                source: 'CartScreen',
                item_count: personalItems.length,
                checked_count: checkedCount,
                store_count: storeGroups.length,
              },
            });
            navigation.navigate('CheckoutBreakdown', {
              cartItems: personalItems,
              checkoutAuthority,
              totals: authorizedTotals || engineTotals,
            });
          }}
          activeOpacity={0.88}
        >
          <Feather name="layers" size={17} color={WHITE} style={{ marginRight: 8 }} />
          <Text style={s.verifyBtnTxt}>Review transparent checkout</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={s.uploadLink}
          onPress={() =>
            navigation.navigate('ReceiptUpload', {
              cartItems: personalItems,
              checkoutAuthority,
              totals: authorizedTotals || engineTotals,
            })
          }
          activeOpacity={0.88}
        >
          <Feather name="camera" size={15} color={GREEN} style={{ marginRight: 6 }} />
          <Text style={s.uploadLinkTxt}>Upload receipt photo instead</Text>
        </TouchableOpacity>

        <Text style={s.syncFootnote}>
          {checkedCount}/{personalItems.length} checked • {activeStores} active store{activeStores !== 1 ? 's' : ''} • totals sync in real time
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────
const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#FBFCFB' },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll:     { padding: 16, gap: 12 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    backgroundColor: '#FBFCFB',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: NAVY },
  headerSub:   { fontSize: 11, color: GRAY, marginTop: 1 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clearBtn:    { paddingHorizontal: 10, paddingVertical: 5 },
  clearBtnTxt: { fontSize: 12, fontWeight: '600', color: RED },
  addBtn: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },

  // Cart flow hero
  registerHero: {
    backgroundColor: FOREST,
    borderRadius: 16,
    padding: 18,
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 4,
  },
  registerHeroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    marginBottom: 14,
  },
  registerHeroLabel: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 7,
  },
  registerHeroAmount: {
    color: WHITE,
    fontSize: 30,
    fontWeight: '900',
  },
  savingsHeroBlock: {
    alignItems: 'flex-end',
  },
  savingsHeroAmount: {
    color: '#86EFAC',
    fontSize: 28,
    fontWeight: '900',
  },
  registerHeroMeta: {
    color: WHITE,
    fontSize: 13,
    fontWeight: '900',
    marginBottom: 6,
  },
  registerHeroSub: {
    color: 'rgba(255,255,255,0.78)',
    fontSize: 12,
    lineHeight: 18,
  },
  registerBudgetRow: { marginTop: 10, marginBottom: 2 },
  registerBudgetTrack: {
    height: 4, borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 6, overflow: 'hidden',
  },
  registerBudgetFill: { height: '100%', borderRadius: 2 },
  registerBudgetLbl: {
    fontSize: 12, fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
  },

  // Summary bar
  summaryBar: {
    flexDirection: 'row', backgroundColor: NAVY,
    paddingVertical: 12, paddingHorizontal: 20,
  },
  summaryItem:    { flex: 1, alignItems: 'center' },
  summaryVal:     { fontSize: 17, fontWeight: '800', color: WHITE, marginBottom: 2 },
  summaryLabel:   { fontSize: 8, color: 'rgba(255,255,255,0.5)', fontWeight: '700', letterSpacing: 0.8 },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 },

  // Item rows
  tripProgressCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  tripProgressTitle: {
    fontSize: 10,
    fontWeight: '900',
    color: GRAY,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  tripProgressSub: {
    fontSize: 13,
    color: NAVY,
    lineHeight: 19,
  },
  storeCard: {
    backgroundColor: '#F5FFF8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#CFF5DA',
    overflow: 'hidden',
  },
  storeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 15,
    gap: 10,
  },
  storeTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  storeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: WHITE,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  storeIconDone: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  storeTitle: { fontSize: 16, fontWeight: '900', color: FOREST },
  storeSub: { fontSize: 11, color: '#166534', marginTop: 2, fontWeight: '700' },
  storeAreas: {
    paddingHorizontal: 10,
    paddingBottom: 10,
    gap: 10,
  },
  areaCard: {
    backgroundColor: WHITE,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    overflow: 'hidden',
  },
  areaHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    gap: 10,
    backgroundColor: WHITE,
  },
  areaTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  areaIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  areaIconDone: {
    backgroundColor: GREEN,
  },
  areaTitle: { fontSize: 15, fontWeight: '900', color: NAVY },
  areaSub: { fontSize: 11, color: GRAY, marginTop: 2 },
  areaRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionDoneBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 9,
    paddingVertical: 6,
    backgroundColor: OFF_WHITE,
  },
  sectionDoneBtnActive: {
    borderColor: GREEN,
    backgroundColor: PALE_GREEN,
  },
  sectionDoneTxt: { fontSize: 10, fontWeight: '800', color: GRAY },
  sectionDoneTxtActive: { color: GREEN },
  sectionCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14, gap: 12,
  },
  itemRowDone: { backgroundColor: '#F8FAFC' },
  checkCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkCircleDone: {
    backgroundColor: GREEN,
    borderColor: GREEN,
  },
  itemSep: { height: 1, backgroundColor: BORDER, marginHorizontal: 16 },
  itemMain:   { flex: 1 },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: 5 },
  itemName: {
    flex: 1, fontSize: 14, fontWeight: '700', color: NAVY, lineHeight: 19,
  },
  itemNameDone: { color: GRAY, textDecorationLine: 'line-through' },
  removeBtn: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: OFF_WHITE, flexShrink: 0,
  },
  itemMeta:  { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  retailerTxt: { fontSize: 11, color: GRAY },
  dayTxt:      { fontSize: 10, color: GRAY, fontWeight: '600', textTransform: 'uppercase' },
  badge: { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  badgeTxt: { fontSize: 9, fontWeight: '800', letterSpacing: 0.3 },
  bogoNote: { fontSize: 11, color: GREEN, fontWeight: '500', marginTop: 4 },

  // Meal connection
  mealConnectRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  mealConnectDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN, flexShrink: 0 },
  mealConnectTxt: { fontSize: 11, color: GREEN, fontWeight: '600', flex: 1 },

  // Store fulfillment
  fulfillCard: {
    marginTop: 10, backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: BORDER,
  },
  fulfillLabel: { fontSize: 9, fontWeight: '800', color: GRAY, letterSpacing: 1.3, marginBottom: 8 },
  fulfillRow: { flexDirection: 'row', gap: 8 },
  fulfillBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 8, borderRadius: 9,
    borderWidth: 1, borderColor: BORDER, backgroundColor: WHITE,
  },
  fulfillBtnActive: { borderColor: GREEN, backgroundColor: PALE_GREEN },
  fulfillBtnTxt: { fontSize: 11, fontWeight: '700', color: GRAY },
  fulfillBtnTxtActive: { color: GREEN },

  // Pricing column
  itemPricing: { alignItems: 'flex-end', gap: 2, minWidth: 72 },
  strikePrice: { fontSize: 11, color: GRAY, textDecorationLine: 'line-through' },
  salePrice:   { fontSize: 15, fontWeight: '800', color: NAVY },
  saveBadge:   { backgroundColor: PALE_GREEN, borderRadius: 6, paddingHorizontal: 5, paddingVertical: 2 },
  saveTxt:     { fontSize: 9, fontWeight: '700', color: GREEN },

  // Checkout Shield
  shieldCard: {
    backgroundColor: '#F5F3FF', borderRadius: 16,
    borderWidth: 1.5, borderColor: '#C4B5FD',
    padding: 16, gap: 10,
  },
  shieldHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
  },
  shieldTitle: {
    flex: 1, fontSize: 9, fontWeight: '800', color: PURPLE,
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  shieldSavingsBadge: {
    backgroundColor: PURPLE, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  shieldSavingsTxt: { fontSize: 11, fontWeight: '800', color: WHITE },
  shieldSub: { fontSize: 12, color: '#6D28D9', lineHeight: 17 },
  shieldRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1, borderTopColor: '#DDD6FE',
  },
  shieldDot: {
    width: 7, height: 7, borderRadius: 4,
    backgroundColor: PURPLE, flexShrink: 0,
  },
  shieldItemName: { fontSize: 13, fontWeight: '700', color: NAVY, marginBottom: 2 },
  shieldMeta:     { flexDirection: 'row', alignItems: 'center', gap: 6 },
  shieldRetailer: { fontSize: 10, color: GRAY, textTransform: 'uppercase', fontWeight: '600' },
  shieldTag: {
    backgroundColor: '#FEF3C7', borderRadius: 4,
    paddingHorizontal: 4, paddingVertical: 1,
  },
  shieldTagTxt:   { fontSize: 9, fontWeight: '700', color: '#92400E' },
  shieldAmount:   { fontSize: 13, fontWeight: '800', color: PURPLE, minWidth: 52, textAlign: 'right' },

  // Coupon checklist (kept for mathUnavailable card reuse)
  checklistCard: {
    backgroundColor: '#FFFBEB', borderRadius: 16,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: 16, gap: 10,
  },
  checklistTitle: {
    fontSize: 9, fontWeight: '800', color: '#92400E',
    letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2,
  },
  checklistRow:   { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checklistTxt:   { flex: 1, fontSize: 13, color: NAVY, lineHeight: 18 },
  warningCard: {
    backgroundColor: '#FFFBEB',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
    padding: 14,
  },
  warningTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#92400E',
    marginBottom: 5,
  },

  // Receipt totals
  receiptCard: {
    backgroundColor: WHITE, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 16,
  },
  receiptTitle: {
    fontSize: 9, fontWeight: '800', color: GRAY,
    letterSpacing: 1.5, marginBottom: 12,
  },
  receiptRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  receiptRowBig:   { marginTop: 4 },
  receiptRowTotal: { marginTop: 2 },
  receiptLabel:    { fontSize: 13, color: NAVY },
  receiptVal:      { fontSize: 13, fontWeight: '600', color: NAVY },
  strikeVal:       { textDecorationLine: 'line-through', color: GRAY },
  receiptLabelBig: { fontSize: 14, fontWeight: '700', color: NAVY },
  receiptValBig:   { fontSize: 16, fontWeight: '800', color: NAVY },
  receiptDivider:  { height: 1, backgroundColor: BORDER, marginVertical: 10 },
  receiptTotalLabel: { fontSize: 15, fontWeight: '800', color: FOREST },
  receiptTotalVal:   { fontSize: 20, fontWeight: '900', color: FOREST },
  withoutSnippd:     { fontSize: 11, color: GRAY, marginTop: 8, textAlign: 'center' },
  withoutSnippdStrike: { textDecorationLine: 'line-through' },

  // Coupon prep button
  flowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 16,
  },
  flowIcon: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: PALE_GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: NAVY,
  },
  flowSub: {
    fontSize: 12,
    color: GRAY,
    marginTop: 3,
  },
  couponPrepBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: PALE_GREEN, borderRadius: 16, borderWidth: 1.5, borderColor: GREEN,
    paddingVertical: 14, paddingHorizontal: 24,
    marginBottom: 8,
  },
  couponPrepBtnTxt: { fontSize: 14, fontWeight: '700', color: GREEN },

  // Verify button
  verifyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: FOREST, borderRadius: 16,
    paddingVertical: 18, paddingHorizontal: 24,
    shadowColor: FOREST,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 8, elevation: 4,
  },
  verifyBtnTxt: { fontSize: 16, fontWeight: '800', color: WHITE },

  uploadLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  uploadLinkTxt: { fontSize: 14, fontWeight: '600', color: GREEN },
  syncFootnote: {
    color: GRAY,
    fontSize: 11,
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 2,
  },

  // Empty state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIcon: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: LIGHT_GREEN, alignItems: 'center', justifyContent: 'center', marginBottom: 16,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: NAVY, marginBottom: 8 },
  emptySub: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  emptyBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingHorizontal: 28, paddingVertical: 14,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  emptyBtnTxt: { color: WHITE, fontSize: 15, fontWeight: '700' },
});
