import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity,
  Animated, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';

const BRAND = {
  green: '#0C9E54',
  navy:  '#172250',
  mint:  '#C5FFBC',
  coral: '#FB5B5B',
};

// Returns the most recent Sunday at midnight (local time)
function getMostRecentSunday() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeeklyIntelligenceModal({ profile, onComplete }) {
  const [visible, setVisible]       = useState(false);
  const [executing, setExecuting]   = useState(false);
  const [prevSpend, setPrevSpend]   = useState(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!profile) return;
    checkLastRefresh();
  }, [profile]);

  const checkLastRefresh = () => {
    const lastUpdate  = profile.last_budget_update ? new Date(profile.last_budget_update) : null;
    const lastSunday  = getMostRecentSunday();
    if (!lastUpdate || lastUpdate < lastSunday) {
      setVisible(true);
      loadPrevSpend();
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 400, useNativeDriver: true,
      }).start();
    }
  };

  const loadPrevSpend = async () => {
    try {
      // Pull last week's spend from receipt_items
      const lastSunday   = getMostRecentSunday();
      const prevSunday   = new Date(lastSunday);
      prevSunday.setDate(prevSunday.getDate() - 7);

      const { data } = await supabase
        .from('receipt_items')
        .select('amount_cents')
        .eq('user_id', profile.user_id)
        .gte('purchased_at', prevSunday.toISOString())
        .lt('purchased_at', lastSunday.toISOString());

      if (data && data.length > 0) {
        const total = data.reduce((s, r) => s + (r.amount_cents || 0), 0);
        setPrevSpend((total / 100).toFixed(2));
      }
    } catch (_) { /* no-op — optional context */ }
  };

  const handleExecute = async () => {
    setExecuting(true);
    try {
      // 1. Mark this week as handled in profile
      await supabase
        .from('profiles')
        .update({ last_budget_update: new Date().toISOString() })
        .eq('user_id', profile.user_id);

      // 2. Trigger server-side weekly refresh (fire-and-forget is fine — UI updates instantly)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch(
          `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/weekly-refresh`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ user_id: profile.user_id, budget: profile.weekly_budget }),
          },
        ).catch(() => {}); // non-blocking
      }

      Animated.timing(fadeAnim, {
        toValue: 0, duration: 300, useNativeDriver: true,
      }).start(() => {
        setVisible(false);
        onComplete?.();
      });
    } catch (err) {
      console.error('[WeeklyModal] execute error:', err);
      Alert.alert('Error', 'Could not save strategy. Please try again.');
    } finally {
      setExecuting(false);
    }
  };

  const handleSkip = () => {
    Animated.timing(fadeAnim, {
      toValue: 0, duration: 250, useNativeDriver: true,
    }).start(() => setVisible(false));
  };

  const budget = profile?.weekly_budget
    ? Number(profile.weekly_budget).toFixed(2)
    : '150.00';

  return (
    <Modal visible={visible} transparent animationType="none" statusBarTranslucent>
      <Animated.View style={[s.overlay, { opacity: fadeAnim }]}>
        <View style={s.glassCard}>
          <View style={s.topAccent} />

          <Text style={s.brandTag}>WEEKLY COMMAND CENTER</Text>
          <Text style={s.title}>Your new strategy{'\n'}is ready.</Text>
          <Text style={s.sub}>
            Snippd has analyzed the market. Tap below to deploy this week's savings plan.
          </Text>

          <View style={s.budgetPreview}>
            <Text style={s.label}>THIS WEEK'S BUDGET</Text>
            <Text style={s.amount}>${budget}</Text>
            {prevSpend && (
              <Text style={s.prevSpend}>Last week you spent ${prevSpend}</Text>
            )}
          </View>

          <TouchableOpacity
            style={[s.btn, executing && s.btnDisabled]}
            onPress={handleExecute}
            disabled={executing}
            activeOpacity={0.85}
          >
            {executing
              ? <ActivityIndicator color="#FFF" />
              : <Text style={s.btnTxt}>Deploy Weekly Strategy</Text>
            }
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkip} hitSlop={{ top: 12, bottom: 12 }}>
            <Text style={s.skip}>I'll adjust this later</Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(23, 34, 80, 0.92)',
    justifyContent: 'center',
    padding: 24,
  },
  glassCard: {
    backgroundColor: '#FFF',
    borderRadius: 28,
    padding: 32,
    alignItems: 'center',
    overflow: 'hidden',
  },
  topAccent: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 5,
    backgroundColor: BRAND.green,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  brandTag: {
    fontSize: 10,
    fontWeight: '900',
    color: BRAND.green,
    letterSpacing: 2,
    marginBottom: 16,
    marginTop: 8,
  },
  title: {
    fontSize: 28,
    fontWeight: '900',
    color: BRAND.navy,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 34,
  },
  sub: {
    fontSize: 15,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  budgetPreview: {
    width: '100%',
    backgroundColor: '#F8F9FB',
    padding: 24,
    borderRadius: 20,
    alignItems: 'center',
    marginBottom: 28,
  },
  label: {
    fontSize: 10,
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  amount: {
    fontSize: 44,
    fontWeight: '900',
    color: BRAND.navy,
    letterSpacing: -2,
  },
  prevSpend: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 6,
    fontWeight: '600',
  },
  btn: {
    backgroundColor: BRAND.green,
    width: '100%',
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    minHeight: 56,
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.7 },
  btnTxt: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  skip: {
    marginTop: 20,
    color: BRAND.navy,
    fontWeight: '700',
    opacity: 0.4,
    fontSize: 14,
  },
});
