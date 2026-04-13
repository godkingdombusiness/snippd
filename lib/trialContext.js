import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { supabase } from './supabase';

const REMINDER_KEY = 'snippd_trial_reminder_date';
const TRIAL_DAYS   = 7;

const TrialContext = createContext({
  trialStatus:  null,   // null | 'active' | 'paused' | 'premium'
  dayNum:       0,      // 1-7
  daysLeft:     0,      // days remaining
  isTrialUser:  false,
  isPaused:     false,
  refreshTrial: () => {},
});

export function useTrialStatus() {
  return useContext(TrialContext);
}

export function TrialProvider({ children }) {
  const [trialStatus, setTrialStatus]  = useState(null);
  const [dayNum,      setDayNum]       = useState(0);
  const [daysLeft,    setDaysLeft]     = useState(0);

  const checkTrial = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setTrialStatus(null); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('preferences')
        .eq('id', user.id)
        .single();

      const prefs = profile?.preferences || {};
      const { subscription_status, trial_started_at, trial_expires_at } = prefs;

      // Already on paid plan — nothing to do
      if (subscription_status === 'active' || subscription_status === 'premium') {
        setTrialStatus('premium');
        setDayNum(0);
        setDaysLeft(0);
        return;
      }

      // Not in a trial at all
      if (!trial_started_at || subscription_status !== 'trial') {
        setTrialStatus(null);
        return;
      }

      const now      = new Date();
      const started  = new Date(trial_started_at);
      const expires  = trial_expires_at
        ? new Date(trial_expires_at)
        : new Date(started.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

      const elapsedMs  = now - started;
      const currentDay = Math.min(Math.ceil(elapsedMs / (24 * 60 * 60 * 1000)), TRIAL_DAYS);
      const remaining  = Math.max(0, Math.ceil((expires - now) / (24 * 60 * 60 * 1000)));

      setDayNum(currentDay);
      setDaysLeft(remaining);

      if (now >= expires) {
        setTrialStatus('paused');
      } else {
        setTrialStatus('active');
        maybeShowDailyReminder(currentDay, remaining);
      }
    } catch {
      // network/db error — don't block the app
    }
  }, []);

  // Show once per calendar day while trial is active
  async function maybeShowDailyReminder(day, remaining) {
    try {
      const today      = new Date().toDateString();
      const lastShown  = await AsyncStorage.getItem(REMINDER_KEY);
      if (lastShown === today) return;          // already shown today

      await AsyncStorage.setItem(REMINDER_KEY, today);

      const daysWord = remaining === 1 ? 'day' : 'days';
      const title    = day === TRIAL_DAYS
        ? '⚠️ Last Day of Your Free Trial'
        : `Day ${day} of ${TRIAL_DAYS} — Free Trial`;

      const message = remaining === 0
        ? 'Your access will be paused at the end of today. Upgrade now to keep saving.'
        : `You have ${remaining} ${daysWord} left. Upgrade to Snippd Pro to keep your access after your trial ends.`;

      Alert.alert(title, message, [
        { text: 'Remind Me Tomorrow', style: 'cancel' },
        { text: 'Learn About Pro', onPress: () => {} }, // hook into payment flow later
      ]);
    } catch {
      // ignore storage errors
    }
  }

  // Run on mount and whenever auth changes
  useEffect(() => {
    checkTrial();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      checkTrial();
    });

    return () => subscription.unsubscribe();
  }, [checkTrial]);

  return (
    <TrialContext.Provider
      value={{
        trialStatus,
        dayNum,
        daysLeft,
        isTrialUser: trialStatus === 'active' || trialStatus === 'paused',
        isPaused:    trialStatus === 'paused',
        refreshTrial: checkTrial,
      }}
    >
      {children}
    </TrialContext.Provider>
  );
}
