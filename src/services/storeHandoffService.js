/**
 * storeHandoffService.js
 *
 * Prepare store handoff — recommend the best store for pickup, format the
 * shopping list, and build handoff URLs. No direct cart API integration
 * exists yet; stores open in-browser or via their native app scheme.
 *
 * No Supabase calls in this file — all logic is pure/local.
 * No API secrets — safe to ship in the React Native bundle.
 *
 * Snippd decides. Providers fulfill.
 */

// ---------------------------------------------------------------------------
// Seeded store catalogue
// ---------------------------------------------------------------------------
var STORES = {
  aldi: {
    store_id:    'aldi',
    store_name:  'Aldi',
    pickup_url:  'https://www.aldi.us',
    app_scheme:  'aldi://',
  },
  publix: {
    store_id:    'publix',
    store_name:  'Publix',
    pickup_url:  'https://www.publix.com/shop-online',
    app_scheme:  null,
  },
  walmart: {
    store_id:    'walmart',
    store_name:  'Walmart',
    pickup_url:  'https://www.walmart.com/grocery/pickup',
    app_scheme:  'walmart://',
  },
};

// Seeded per-item price bands (cents) used to estimate order totals.
// Aldi is cheapest, Walmart middle, Publix highest.
var PRICE_BAND_CENTS = {
  aldi:    250,   // ~$2.50 per item on average
  walmart: 320,   // ~$3.20 per item on average
  publix:  420,   // ~$4.20 per item on average
};

// Default ordering preference when no user preferences supplied
var DEFAULT_STORE_ORDER = ['aldi', 'walmart', 'publix'];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rank available stores for pickup and estimate order totals.
 *
 * @param {object[]} shoppingList          — items to buy; each object needs at minimum { item_name }
 * @param {string[]} userStorePreferences  — ordered list of store_id the user prefers; may be empty
 * @returns {Array<{
 *   store_id: string,
 *   store_name: string,
 *   pickup_url: string,
 *   app_scheme: string|null,
 *   estimated_total_cents: number,
 *   rank: number,
 * }>}
 */
function getBestStoreForPickup(shoppingList, userStorePreferences) {
  const itemCount = Array.isArray(shoppingList) ? shoppingList.length : 0;

  // Build the ranked order: preferred stores first, then remaining defaults
  const preferredIds = Array.isArray(userStorePreferences) ? userStorePreferences : [];
  const remaining    = DEFAULT_STORE_ORDER.filter(id => !preferredIds.includes(id));
  const orderedIds   = [...preferredIds.filter(id => STORES[id]), ...remaining];

  return orderedIds
    .filter(id => STORES[id])
    .map((id, index) => {
      const store               = STORES[id];
      const priceBand           = PRICE_BAND_CENTS[id] ?? 300;
      const estimated_total_cents = itemCount * priceBand;

      return {
        ...store,
        estimated_total_cents,
        rank: index + 1,
      };
    });
}

/**
 * Return the pickup URL for a given store.
 *
 * @param {string} storeId — e.g. 'aldi', 'publix', 'walmart'
 * @returns {string|null}
 */
function getStorePickupUrl(storeId) {
  return STORES[storeId]?.pickup_url ?? null;
}

/**
 * Format a shopping list array as plain text suitable for clipboard copy.
 *
 * @param {object[]} items — each item must have item_name; quantity is optional
 * @returns {string}
 */
function formatShoppingListText(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return 'Shopping List\n\n(empty)';
  }

  const lines = items.map(item => {
    const name = item.item_name || item.name || 'Unknown item';
    const qty  = item.quantity ? ` (${item.quantity})` : '';
    return `- ${name}${qty}`;
  });

  return `Shopping List\n\n${lines.join('\n')}`;
}

/**
 * Return the integration status for a store.
 * All stores currently return no direct cart API — the user opens the store
 * website or app manually.
 *
 * @param {string} storeId
 * @returns {{ has_direct_integration: boolean, message: string }}
 */
function getStoreHandoffStatus(storeId) {
  const store = STORES[storeId];
  if (!store) {
    return {
      has_direct_integration: false,
      message: 'Store not recognised. Copy your list and shop manually.',
    };
  }

  return {
    has_direct_integration: false,
    message: `Open ${store.store_name} app to complete pickup`,
  };
}

export {
  getBestStoreForPickup,
  getStorePickupUrl,
  formatShoppingListText,
  getStoreHandoffStatus,
  STORES,
};
