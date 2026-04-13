import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

export const SUPABASE_URL     = process.env.EXPO_PUBLIC_SUPABASE_URL;
export const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const supabaseUrl    = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

// SecureStore adapter — encrypts session tokens on-device.
// Falls back to in-memory only on web (SecureStore is native-only).
const secureStorage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storage: typeof document === 'undefined' ? secureStorage : undefined,
  },
});