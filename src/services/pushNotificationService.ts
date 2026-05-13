/**
 * pushNotificationService.ts
 *
 * Manages Expo push notification tokens and local notifications.
 *
 * Usage:
 *   await registerPushToken(userId)  — call once on app load after sign-in
 *   await scheduleLocalNotification(title, body, data) — geofence / in-app alerts
 *
 * The push token is stored in profiles.expo_push_token so the
 * anticipatory-plan Edge Function can send Monday morning notifications
 * server-side via the Expo Push API.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL  ?? '';
const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Notification display config ───────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Types ─────────────────────────────────────────────────────

export interface LocalNotificationData {
  screen?:  string;
  planId?:  string;
  retailer?: string;
  [key: string]: unknown;
}

// ── Token registration ─────────────────────────────────────────

/**
 * Requests notification permission and stores the Expo push token
 * in profiles.expo_push_token. Safe to call on every app start —
 * no-ops if the token is unchanged.
 */
export async function registerPushToken(userId: string): Promise<string | null> {
  try {
    // Android requires a notification channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('snippd-default', {
        name:       'Snippd Alerts',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0C9E54',
      });
      await Notifications.setNotificationChannelAsync('snippd-geofence', {
        name:       'Store Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500],
        lightColor: '#0C9E54',
      });
    }

    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });
    const token = tokenData.data;

    // Store in Supabase — upsert so repeated calls don't duplicate
    await db
      .from('profiles')
      .update({
        expo_push_token:       token,
        push_notifications_on: true,
        push_token_updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId);

    return token;
  } catch {
    return null;
  }
}

// ── Local notifications ────────────────────────────────────────

/**
 * Fires an immediate local notification (no push server needed).
 * Used by the Geofence Service when the user enters a store.
 */
export async function scheduleLocalNotification(
  title: string,
  body:  string,
  data:  LocalNotificationData = {},
  channelId: string = 'snippd-default',
): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data, sound: true },
      trigger: null, // fire immediately
    });
  } catch { /* non-critical */ }
}

/**
 * Fires a HIGH priority geofence alert — used when user enters a store.
 */
export async function sendGeofenceAlert(
  storeName:    string,
  savingsCents: number,
  itemCount:    number,
  retailerKey:  string,
): Promise<void> {
  const savings = '$' + (savingsCents / 100).toFixed(2);
  await scheduleLocalNotification(
    `You're at ${storeName}`,
    `${itemCount} items on your list. Total savings today: ${savings}. Tap to see your live card.`,
    { screen: 'GeofenceLiveCard', retailer: retailerKey },
    'snippd-geofence',
  );
}

// ── Notification listener helper ──────────────────────────────

/**
 * Returns a cleanup function. Call in a useEffect on App root.
 * Routes tapped notifications to the correct screen.
 */
export function addNotificationResponseListener(
  navigate: (screen: string, params?: Record<string, unknown>) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as LocalNotificationData;
    if (data?.screen) {
      navigate(data.screen, data as Record<string, unknown>);
    }
  });
  return () => sub.remove();
}
