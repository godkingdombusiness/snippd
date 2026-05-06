/**
 * iap.js — Apple In-App Purchase (StoreKit) service
 *
 * Wraps expo-in-app-purchases with a simple async API.
 * All exported functions are no-ops on Android / web.
 *
 * Product ID must match exactly what is configured in App Store Connect:
 *   com.snippd.app.pro.monthly  —  Snippd Pro, $4.99/month, auto-renewable
 *
 * Setup checklist (one-time, before first TestFlight submission):
 *   1. Run: npx expo install expo-in-app-purchases
 *   2. In App Store Connect → My Apps → Snippd → Subscriptions:
 *      Create subscription group "Snippd Pro", add product com.snippd.app.pro.monthly
 *      at $4.99/month. Fill in localised display name + description.
 *   3. Add the In-App Purchase capability in Xcode (or app.json plugins).
 */

import { Platform } from 'react-native';

export const PRO_PRODUCT_ID = 'com.snippd.app.pro.monthly';

let _iap = null;
let _connected = false;

async function mod() {
  if (!_iap) {
    _iap = await import('expo-in-app-purchases');
  }
  return _iap;
}

/**
 * Open the StoreKit connection. Call once when SnippdProScreen mounts.
 * Returns true on success, false if not on iOS or connection failed.
 */
export async function iapConnect() {
  if (Platform.OS !== 'ios') return false;
  try {
    const m = await mod();
    if (!_connected) {
      await m.connectAsync();
      _connected = true;
    }
    return true;
  } catch (e) {
    console.warn('[IAP] connectAsync failed:', e?.message ?? e);
    return false;
  }
}

/**
 * Fetch the product record from StoreKit.
 * Returns the product object (with localizedPrice, title, etc.)
 * or null if unavailable.
 */
export async function iapGetProduct() {
  if (Platform.OS !== 'ios' || !_connected) return null;
  try {
    const m = await mod();
    const { responseCode, results } = await m.getProductsAsync([PRO_PRODUCT_ID]);
    if (responseCode === m.IAPResponseCode.OK && results?.length > 0) {
      return results[0];
    }
    return null;
  } catch (e) {
    console.warn('[IAP] getProductsAsync failed:', e?.message ?? e);
    return null;
  }
}

/**
 * Initiate a purchase. Resolves when the system purchase sheet is dismissed.
 * The caller must listen to InAppPurchases.setPurchaseListener to confirm.
 */
export async function iapPurchase() {
  if (Platform.OS !== 'ios') throw new Error('IAP only available on iOS');
  const m = await mod();
  await m.purchaseItemAsync(PRO_PRODUCT_ID);
}

/**
 * Set up the purchase completion listener.
 * callback(purchase | null, error | null) is called when a transaction
 * completes, restores, or fails.
 */
export async function iapSetPurchaseListener(callback) {
  if (Platform.OS !== 'ios') return;
  const m = await mod();
  m.setPurchaseListener(async ({ responseCode, results, errorCode }) => {
    if (responseCode === m.IAPResponseCode.OK && results?.length > 0) {
      for (const purchase of results) {
        await m.finishTransactionAsync(purchase, true);
        callback(purchase, null);
      }
    } else if (responseCode === m.IAPResponseCode.USER_CANCELED) {
      callback(null, null); // user cancelled — not an error
    } else {
      callback(null, new Error(`IAP failed (code ${responseCode}, errorCode ${errorCode})`));
    }
  });
}

/**
 * Restore prior purchases. Returns an array of matching purchases.
 */
export async function iapRestorePurchases() {
  if (Platform.OS !== 'ios' || !_connected) return [];
  try {
    const m = await mod();
    const { responseCode, results } = await m.getPurchaseHistoryAsync();
    if (responseCode === m.IAPResponseCode.OK) {
      return (results ?? []).filter(p => p.productId === PRO_PRODUCT_ID);
    }
    return [];
  } catch (e) {
    console.warn('[IAP] restore failed:', e?.message ?? e);
    return [];
  }
}

/**
 * Close the StoreKit connection. Call when SnippdProScreen unmounts.
 */
export async function iapDisconnect() {
  if (!_connected || Platform.OS !== 'ios') return;
  try {
    const m = await mod();
    await m.disconnectAsync();
    _connected = false;
  } catch { /* non-critical */ }
}
