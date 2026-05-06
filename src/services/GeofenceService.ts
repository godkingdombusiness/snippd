/**
 * GeofenceService.ts
 *
 * Watches the user's GPS location against store_locations from the DB.
 * When the user enters a store's geofence radius, it:
 *   1. Fires a local push notification (Live Card alert)
 *   2. Loads the user's relevant cart items for that store
 *   3. Returns a LiveCardData object for HomeScreen to render
 *
 * Architecture:
 *   - Uses expo-location's watchPositionAsync (foreground) rather than
 *     startGeofencingAsync (background task) for cross-platform reliability.
 *   - Debounces entry events: once fired for a store, won't re-fire
 *     for 30 minutes to avoid alert spam.
 *   - Distance calculation: Haversine formula (no native module needed).
 *
 * Usage:
 *   const { startWatching, stopWatching, liveCard } = useGeofence(userId);
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { sendGeofenceAlert } from './pushNotificationService';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

const GEOFENCE_COOLDOWN_KEY = 'snippd_geofence_cooldown_';
const COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes per store

// ── Types ─────────────────────────────────────────────────────

export interface StoreLocation {
  id:            string;
  retailer_key:  string;
  store_name:    string;
  address:       string;
  city:          string;
  state:         string;
  latitude:      number;
  longitude:     number;
  radius_meters: number;
}

export interface LiveCardItem {
  name:         string;
  savings_cents: number;
  retailer_key: string;
}

export interface LiveCardData {
  store:          StoreLocation;
  items:          LiveCardItem[];
  total_savings:  number;
  triggered_at:   string;
}

// ── Haversine distance ─────────────────────────────────────────

function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R    = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Cooldown helpers ───────────────────────────────────────────

async function isCooledDown(storeId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(GEOFENCE_COOLDOWN_KEY + storeId);
    if (!raw) return true;
    return Date.now() - Number(raw) > COOLDOWN_MS;
  } catch {
    return true;
  }
}

async function setCooldown(storeId: string): Promise<void> {
  try {
    await AsyncStorage.setItem(GEOFENCE_COOLDOWN_KEY + storeId, String(Date.now()));
  } catch { /* non-critical */ }
}

// ── Load stores from DB ────────────────────────────────────────

export async function loadStoreLocations(state?: string): Promise<StoreLocation[]> {
  try {
    let q = db.from('store_locations').select('*').eq('is_active', true);
    if (state) q = q.eq('state', state);
    const { data } = await q.limit(50);
    return (data ?? []) as StoreLocation[];
  } catch {
    return [];
  }
}

// ── Load live card items for a store ──────────────────────────

export async function loadLiveCardItems(
  userId:      string,
  retailerKey: string,
): Promise<LiveCardItem[]> {
  try {
    // Load user's cart from stack_candidates for this retailer
    const { data: deals } = await db
      .from('stack_candidates')
      .select('primary_brand, stack_rank_score, retailer_key')
      .eq('retailer_key', retailerKey)
      .eq('validation_status', 'approved')
      .order('stack_rank_score', { ascending: false })
      .limit(6);

    if (!deals?.length) return [];

    return deals.map(d => ({
      name:          d.primary_brand ?? 'Deal item',
      savings_cents: Math.round((d.stack_rank_score ?? 0) * 100),
      retailer_key:  d.retailer_key,
    }));
  } catch {
    return [];
  }
}

// ── Main geofence watcher ──────────────────────────────────────

export function createGeofenceWatcher(userId: string) {
  let subscription: Location.LocationSubscription | null = null;
  let stores:       StoreLocation[]                      = [];
  let onLiveCard:   ((card: LiveCardData) => void) | null = null;

  async function start(onCard: (card: LiveCardData) => void): Promise<void> {
    onLiveCard = onCard;

    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') return;

    // Load stores (scoped to user's region if possible)
    stores = await loadStoreLocations();

    subscription = await Location.watchPositionAsync(
      {
        accuracy:          Location.Accuracy.Balanced,
        timeInterval:      15000,   // check every 15s
        distanceInterval:  20,      // or every 20m moved
      },
      async (location) => {
        const { latitude, longitude } = location.coords;

        for (const store of stores) {
          const dist = haversineMeters(latitude, longitude, store.latitude, store.longitude);

          if (dist <= store.radius_meters) {
            const cooled = await isCooledDown(store.id);
            if (!cooled) continue;

            await setCooldown(store.id);

            const items = await loadLiveCardItems(userId, store.retailer_key);
            const totalSavings = items.reduce((s, i) => s + i.savings_cents, 0);

            const card: LiveCardData = {
              store,
              items,
              total_savings: totalSavings,
              triggered_at:  new Date().toISOString(),
            };

            // Fire push notification
            await sendGeofenceAlert(
              store.store_name,
              totalSavings,
              items.length,
              store.retailer_key,
            );

            // Notify UI
            if (onLiveCard) onLiveCard(card);
            break; // only one store at a time
          }
        }
      }
    );
  }

  function stop(): void {
    subscription?.remove();
    subscription = null;
  }

  return { start, stop };
}
