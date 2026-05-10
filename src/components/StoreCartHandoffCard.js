import React from 'react';
import {
  Alert,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { tracker } from '../lib/eventTracker';

const GREEN = '#0C9E54';
const FOREST = '#0C7A3D';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';
const MINT = '#ECFDF5';
const PURPLE_BG = '#F3E8FF';
const PURPLE = '#7C3AED';

const RETAILER_HOME_LINKS = {
  publix: {
    label: 'Open Publix',
    url: 'https://www.publix.com/shop-online',
  },
  dollar_general: {
    label: 'Open Dollar General',
    url: 'https://www.dollargeneral.com/shop',
  },
  kroger: {
    label: 'Open Kroger',
    url: 'https://www.kroger.com',
  },
  walmart: {
    label: 'Open Walmart',
    url: 'https://www.walmart.com',
  },
};

const RETAILER_SEARCH_LINKS = {
  publix: 'https://www.publix.com/search?searchTerm={query}',
  dollar_general: 'https://www.dollargeneral.com/search?q={query}',
  kroger: 'https://www.kroger.com/search?query={query}',
  walmart: 'https://www.walmart.com/search?q={query}',
};

const RETAILER_COUPON_HUBS = {
  publix: 'https://www.publix.com/savings/digital-coupons',
  dollar_general: 'https://www.dollargeneral.com/deals/coupons?sort=0&sortOrder=2&type=0',
  kroger: 'https://www.kroger.com/savings/cl/coupons',
  walmart: 'https://www.walmart.com/coupons',
};

function normalizeRetailerKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function titleCase(value) {
  return String(value || 'Store')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
}

function fmt(cents) {
  return '$' + ((Number(cents) || 0) / 100).toFixed(2);
}

function expectedPriceCents(item) {
  const qty = Math.max(1, Number(item.quantity || item.qty || 1));
  const unit = Number(
    item.final_price_cents
    ?? item.estimated_oop_cents
    ?? item.sale_cents
    ?? item.sale_price_cents
    ?? item.price_cents
    ?? item.reg_cents
    ?? item.regular_price_cents
    ?? 0
  );
  return unit * qty;
}

function cleanUrl(value) {
  const url = String(value || '').trim();
  if (!/^https?:\/\//i.test(url) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return null;
  return url;
}

function firstUrl(...values) {
  for (const value of values) {
    const url = cleanUrl(value);
    if (url) return url;
  }
  return null;
}

function itemName(item) {
  return item.product_name || item.name || item.display_name || 'Cart item';
}

function retailerSearchUrl(retailerKey, name, item) {
  const explicit = firstUrl(item.retailer_search_url, item.store_search_url);
  if (explicit) {
    return explicit.includes('{query}')
      ? explicit.replace('{query}', encodeURIComponent(name))
      : explicit;
  }
  const template = RETAILER_SEARCH_LINKS[retailerKey];
  return template ? template.replace('{query}', encodeURIComponent(name)) : null;
}

function couponLinkForItem(item, retailerKey) {
  const activation = item.coupon_activation_link || item.coupon_activation_links?.[0] || {};
  return firstUrl(
    item.coupon_deep_link,
    item.exact_coupon_url,
    item.official_coupon_url,
    activation.link_url,
    activation.url,
    item.retailer_coupon_url
  );
}

function itemLinkForItem(item) {
  return firstUrl(
    item.item_deep_link,
    item.product_deep_link,
    item.item_url,
    item.product_url,
    item.retailer_item_url
  );
}

function hasCoupon(item) {
  return Boolean(
    item.coupon_deep_link
    || item.coupon_activation_link
    || item.coupon_activation_links?.length
    || item.exact_coupon_url
    || item.official_coupon_url
    || item.coupon_code
    || Number(item.coupon_value_cents || 0) > 0
    || String(item.deal_type || '').toLowerCase().includes('coupon')
  );
}

function safeTrack(eventName, payload) {
  try {
    tracker.trackEvent({
      event_name: eventName,
      user_id: payload.userId || 'anonymous',
      session_id: payload.sessionId || String(Date.now()),
      screen_name: 'CartScreen',
      object_type: payload.objectType,
      object_id: payload.objectId,
      metadata: payload.metadata || {},
    });
  } catch {
    // Tracking should never block handoff.
  }
}

async function openExternal(url, eventName, payload) {
  if (!url) {
    Alert.alert('Link unavailable', 'This item does not have a store link yet.');
    return;
  }
  try {
    safeTrack(eventName, payload);
    const supported = await Linking.canOpenURL(url);
    if (!supported) throw new Error('unsupported_url');
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', 'Try opening your store app and searching for this item manually.');
  }
}

function ItemHandoffRow({ item, retailerKey, userId, sessionId }) {
  const name = itemName(item);
  const itemUrl = itemLinkForItem(item);
  const couponUrl = couponLinkForItem(item, retailerKey);
  const searchUrl = retailerSearchUrl(retailerKey, name, item);
  const couponHub = RETAILER_COUPON_HUBS[retailerKey];
  const coupon = hasCoupon(item);

  const basePayload = {
    userId,
    sessionId,
    objectType: 'cart_item',
    objectId: String(item.id || item.product_name || name),
    metadata: {
      retailer_key: retailerKey,
      product_name: name,
      has_item_link: Boolean(itemUrl),
      has_coupon_link: Boolean(couponUrl),
    },
  };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.itemName} numberOfLines={2}>{name}</Text>
          <Text style={styles.itemPrice}>{fmt(expectedPriceCents(item))} expected</Text>
        </View>
        {coupon && (
          <View style={styles.couponBadge}>
            <Feather name="tag" size={11} color={PURPLE} />
            <Text style={styles.couponBadgeText}>Coupon</Text>
          </View>
        )}
      </View>

      <View style={styles.actionRow}>
        {itemUrl ? (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => openExternal(itemUrl, 'item_link_opened', basePayload)}
            activeOpacity={0.85}
          >
            <Feather name="external-link" size={13} color={FOREST} />
            <Text style={styles.actionText}>Open item</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => openExternal(searchUrl, 'fallback_search_opened', {
              ...basePayload,
              metadata: { ...basePayload.metadata, fallback: 'retailer_search' },
            })}
            activeOpacity={0.85}
          >
            <Feather name="search" size={13} color={FOREST} />
            <Text style={styles.actionText}>Search in store app</Text>
          </TouchableOpacity>
        )}

        {couponUrl ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.couponBtn]}
            onPress={() => openExternal(couponUrl, 'coupon_link_opened', basePayload)}
            activeOpacity={0.85}
          >
            <Feather name="tag" size={13} color={PURPLE} />
            <Text style={[styles.actionText, { color: PURPLE }]}>Clip coupon</Text>
          </TouchableOpacity>
        ) : coupon && couponHub ? (
          <TouchableOpacity
            style={[styles.actionBtn, styles.couponBtn]}
            onPress={() => openExternal(couponHub, 'coupon_link_opened', {
              ...basePayload,
              metadata: { ...basePayload.metadata, fallback: 'coupon_hub' },
            })}
            activeOpacity={0.85}
          >
            <Feather name="tag" size={13} color={PURPLE} />
            <Text style={[styles.actionText, { color: PURPLE }]}>Open coupon page</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

export default function StoreCartHandoffCard({ storeLabel, retailerKey, items = [], userId, sessionId }) {
  const key = normalizeRetailerKey(retailerKey || storeLabel);
  const store = RETAILER_HOME_LINKS[key] || {
    label: `Open ${titleCase(storeLabel || key)}`,
    url: null,
  };

  function openStore() {
    safeTrack('cart_handoff_started', {
      userId,
      sessionId,
      objectType: 'store',
      objectId: key,
      metadata: { retailer_key: key, item_count: items.length },
    });
    openExternal(store.url, 'store_checkout_opened', {
      userId,
      sessionId,
      objectType: 'store',
      objectId: key,
      metadata: { retailer_key: key },
    });
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Feather name="send" size={16} color={GREEN} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Send to Store</Text>
          <Text style={styles.copy}>
            Snippd built your plan. Your store still handles checkout. Tap each item to add it in your store app.
          </Text>
        </View>
      </View>

      <TouchableOpacity style={styles.storeBtn} onPress={openStore} activeOpacity={0.88}>
        <Text style={styles.storeBtnText}>{store.label}</Text>
        <Feather name="external-link" size={15} color={WHITE} />
      </TouchableOpacity>

      <View style={styles.items}>
        {items.map((item, index) => (
          <ItemHandoffRow
            key={item.id || `${itemName(item)}_${index}`}
            item={item}
            retailerKey={key}
            userId={userId}
            sessionId={sessionId}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: WHITE,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  header: { flexDirection: 'row', gap: 10 },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 13, fontWeight: '900', color: NAVY, marginBottom: 3 },
  copy: { fontSize: 12, lineHeight: 17, color: GRAY, fontWeight: '600' },
  storeBtn: {
    minHeight: 42,
    borderRadius: 12,
    backgroundColor: FOREST,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  storeBtnText: { color: WHITE, fontSize: 14, fontWeight: '900' },
  items: { gap: 10 },
  itemRow: {
    borderWidth: 1,
    borderColor: '#E8EEF5',
    borderRadius: 12,
    padding: 11,
    gap: 9,
    backgroundColor: '#FBFCFE',
  },
  itemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  itemName: { fontSize: 13, fontWeight: '800', color: NAVY, lineHeight: 18 },
  itemPrice: { fontSize: 12, fontWeight: '700', color: GRAY, marginTop: 2 },
  couponBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: PURPLE_BG,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  couponBadgeText: { fontSize: 10, fontWeight: '900', color: PURPLE },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    minHeight: 34,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    backgroundColor: MINT,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  couponBtn: {
    borderColor: '#E9D5FF',
    backgroundColor: PURPLE_BG,
  },
  actionText: { fontSize: 12, fontWeight: '900', color: FOREST },
});
