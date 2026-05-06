import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../lib/supabase';

const GLOBAL_CART_KEY = 'snippd_cart';
const USER_CART_PREFIX = 'snippd_cart_';

export function cartKeyForUser(userId) {
  return userId ? `${USER_CART_PREFIX}${userId}` : GLOBAL_CART_KEY;
}

export async function getActiveCartKey() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    return cartKeyForUser(user?.id);
  } catch {
    return GLOBAL_CART_KEY;
  }
}

export async function readCart(key) {
  try {
    const raw = await AsyncStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function readActiveCart() {
  const key = await getActiveCartKey();
  let items = await readCart(key);

  if (key !== GLOBAL_CART_KEY && items.length === 0) {
    const legacyItems = await readCart(GLOBAL_CART_KEY);
    if (legacyItems.length > 0) {
      items = legacyItems;
      await AsyncStorage.setItem(key, JSON.stringify(legacyItems));
      await AsyncStorage.removeItem(GLOBAL_CART_KEY);
    }
  }

  return { key, items };
}

function centsFromCentsOrDollars(centsValue, dollarValue, fallback = 0) {
  if (centsValue != null) return Math.round(Number(centsValue) || 0);
  if (dollarValue != null) return Math.round((Number(dollarValue) || 0) * 100);
  return fallback;
}

export function normalizeCartItem(item) {
  const source = item.source || 'manual';
  const rawId = item.id || `${source}_${item.product_name || item.name || Date.now()}`;
  const productName = item.product_name || item.item_name || item.name || 'Item';
  const saleCents = centsFromCentsOrDollars(
    item.sale_cents,
    item.sale_price ?? item.pay_price ?? item.final_price,
  );
  const regCents = centsFromCentsOrDollars(
    item.reg_cents,
    item.regular_price ?? item.reg_price ?? item.base_price,
    saleCents,
  );

  return {
    ...item,
    id: String(rawId),
    product_name: productName,
    sale_cents: saleCents,
    reg_cents: regCents,
    deal_type: item.deal_type || (item.is_bogo ? 'BOGO' : null),
    retailer: item.retailer || item.retailer_key || null,
    retailer_key: item.retailer_key || null,
    quantity: item.quantity || (item.deal_type === 'BOGO' || item.is_bogo ? 2 : 1),
    source,
  };
}

export async function addItemsToActiveCart(items, options = {}) {
  const { replace = false } = options;
  const { key, items: existing } = await readActiveCart();
  const normalizedItems = (Array.isArray(items) ? items : [items]).map(normalizeCartItem);
  const existingIds = new Set(existing.map(item => item.id));
  const newItems = replace
    ? normalizedItems
    : [...existing, ...normalizedItems.filter(item => !existingIds.has(item.id))];

  await AsyncStorage.setItem(key, JSON.stringify(newItems));
  return {
    key,
    addedCount: replace
      ? normalizedItems.length
      : normalizedItems.filter(item => !existingIds.has(item.id)).length,
    items: newItems,
  };
}
