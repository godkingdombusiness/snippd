/**
 * CouponClippingService.ts
 *
 * Background service that:
 *   1. Reads the user's cart from AsyncStorage
 *   2. Normalizes product names to match verified coupon evidence
 *   3. Calls verified-only RPCs backed by v_live_verified_digital_coupons
 *   4. Stores matched coupons in AsyncStorage for CartScreen rendering
 *
 * Usage (from CartScreen, HomeScreen, or a background effect):
 *   const result = await runCouponClip(userId);
 *   result.coupons       — ClippableCoupon[]
 *   result.savingsCents  — total potential savings
 *   result.matchedCount  — number of matched coupons
 *
 * Cache key: `snippd_digital_coupons_${userId}` (5-min TTL)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

// Use module-level singleton — service is stateless but avoids repeated client creation
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const CART_KEY_PREFIX   = 'snippd_cart_';
const COUPON_CACHE_KEY  = 'snippd_digital_coupons_';
const CACHE_TTL_MS      = 5 * 60 * 1000; // 5 minutes

// ── Types ────────────────────────────────────────────────────────

export interface CartItem {
  id:           string;
  product_name?: string;
  name?:         string;
  brand?:        string;
  retailer_key?: string;
  retailer?:     string;
  normalized_key?: string;
}

export interface ClippableCoupon {
  coupon_id:      string;
  retailer_key:   string;
  product_name:   string;
  brand:          string | null;
  normalized_key: string;
  discount_cents: number;
  discount_pct:   number | null;
  coupon_type:    string;
  is_loyalty_req: boolean;
  is_app_only:    boolean;
  expires_at:     string | null;
  expiration_date?: string | null;
  savings_label:  string;
  exact_coupon_url?: string;
  source_page_url?: string;
  coupon_title?: string;
  verified_at?: string;
  evidence_hash?: string;
  screenshot_url?: string | null;
  clipped_status?: 'clipped' | 'not_clipped' | 'unknown';
}

export interface CouponClipResult {
  coupons:      ClippableCoupon[];
  savingsCents: number;
  matchedCount: number;
  fromCache:    boolean;
  generatedAt:  string;
}

interface CouponCache {
  result:      CouponClipResult;
  expiresAt:   number;
}

// ── Normalize ────────────────────────────────────────────────────
// Converts a product name to a lowercase slug matching normalized_key
// in v_live_verified_digital_coupons (e.g. "Tide PODS 16ct" -> "tide-pods")

function normalizeName(raw: string): string {
  return raw
    .toLowerCase()
    // Remove parenthetical sizes/counts
    .replace(/\(.*?\)/g, '')
    // Remove common size/count suffixes
    .replace(/\b\d+(ct|oz|fl oz|lb|lbs|g|kg|pk|pack|count)\b/gi, '')
    .trim()
    // Replace non-alphanumeric with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse multiple hyphens
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCartItems(items: CartItem[]): string[] {
  const keys = new Set<string>();
  for (const item of items) {
    const name = item.product_name || item.name || '';
    if (item.normalized_key) {
      keys.add(item.normalized_key);
    } else if (name) {
      keys.add(normalizeName(name));
    }
    // Also try brand alone as a fallback key
    if (item.brand) {
      keys.add(normalizeName(item.brand));
    }
  }
  return Array.from(keys).filter(Boolean);
}

// ── Cache helpers ────────────────────────────────────────────────

async function readCache(userId: string): Promise<CouponClipResult | null> {
  try {
    const raw = await AsyncStorage.getItem(COUPON_CACHE_KEY + userId);
    if (!raw) return null;
    const cache: CouponCache = JSON.parse(raw);
    if (Date.now() > cache.expiresAt) return null;
    return cache.result;
  } catch {
    return null;
  }
}

async function writeCache(userId: string, result: CouponClipResult): Promise<void> {
  try {
    const cache: CouponCache = {
      result,
      expiresAt: Date.now() + CACHE_TTL_MS,
    };
    await AsyncStorage.setItem(COUPON_CACHE_KEY + userId, JSON.stringify(cache));
  } catch { /* non-critical */ }
}

// ── Main export ──────────────────────────────────────────────────

/**
 * Runs the full coupon clip loop for a user.
 * Returns immediately from cache if within TTL; otherwise hits DB.
 *
 * @param userId      auth.users.id
 * @param forceRefresh bypass cache even if still valid
 */
export async function runCouponClip(
  userId:       string,
  forceRefresh: boolean = false
): Promise<CouponClipResult> {
  // 1. Cache check
  if (!forceRefresh) {
    const cached = await readCache(userId);
    if (cached) return { ...cached, fromCache: true };
  }

  // 2. Load cart from AsyncStorage
  let cartItems: CartItem[] = [];
  try {
    const raw = await AsyncStorage.getItem(CART_KEY_PREFIX + userId);
    if (raw) {
      const parsed = JSON.parse(raw);
      cartItems = Array.isArray(parsed) ? parsed : [];
    }
  } catch { /* empty cart is fine */ }

  const empty: CouponClipResult = {
    coupons:      [],
    savingsCents: 0,
    matchedCount: 0,
    fromCache:    false,
    generatedAt:  new Date().toISOString(),
  };

  if (cartItems.length === 0) {
    await writeCache(userId, empty);
    return empty;
  }

  // 3. Normalize keys
  const normalizedKeys = normalizeCartItems(cartItems);
  if (normalizedKeys.length === 0) {
    await writeCache(userId, empty);
    return empty;
  }

  // 4. Fetch verified clippable coupons + savings total in parallel.
  // Hard gate: these RPCs read v_live_verified_digital_coupons only.
  const [couponsRes, savingsRes] = await Promise.all([
    db.rpc('get_verified_clippable_coupons', {
      p_user_id:        userId,
      p_normalized_keys: normalizedKeys,
    }),
    db.rpc('calculate_verified_digital_savings', {
      p_user_id:        userId,
      p_normalized_keys: normalizedKeys,
    }),
  ]);

  if (couponsRes.error) {
    throw new Error(`Verified coupon lookup failed: ${couponsRes.error.message}`);
  }
  if (savingsRes.error) {
    throw new Error(`Verified savings lookup failed: ${savingsRes.error.message}`);
  }

  const coupons: ClippableCoupon[] = ((couponsRes.data ?? []) as ClippableCoupon[])
    .filter(coupon =>
      Boolean(coupon.exact_coupon_url) &&
      Boolean(coupon.source_page_url) &&
      coupon.exact_coupon_url !== coupon.source_page_url
    );

  const savingsRow = Array.isArray(savingsRes.data) ? savingsRes.data[0] : savingsRes.data;
  const savingsCents = coupons.reduce((sum, coupon) => sum + Number(coupon.discount_cents || 0), 0)
    || Number(savingsRow?.savings_cents ?? 0);
  const matchedCount = coupons.length || Number(savingsRow?.matched_count ?? 0);

  const result: CouponClipResult = {
    coupons,
    savingsCents,
    matchedCount,
    fromCache:   false,
    generatedAt: new Date().toISOString(),
  };

  // 5. Persist to cache
  await writeCache(userId, result);

  return result;
}

/**
 * Clears the coupon clip cache for a user (e.g. after cart changes).
 */
export async function clearCouponCache(userId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(COUPON_CACHE_KEY + userId);
  } catch { /* non-critical */ }
}

/**
 * Formats savings cents to a short display string.
 * e.g. 850 → "$8.50"
 */
export function fmtSavings(cents: number): string {
  return '$' + (cents / 100).toFixed(2);
}

// ── CLI entry point (for manual testing) ────────────────────────
if (require.main === module) {
  const userId = process.argv[2];
  if (!userId) {
    console.error('Usage: npx ts-node src/services/CouponClippingService.ts <user_id>');
    process.exit(1);
  }
  runCouponClip(userId, true).then(result => {
    console.log('Coupon Clip Result:');
    console.log(`  Savings: ${fmtSavings(result.savingsCents)}`);
    console.log(`  Matched: ${result.matchedCount} coupon(s)`);
    console.log(JSON.stringify(result.coupons, null, 2));
  }).catch(console.error);
}
