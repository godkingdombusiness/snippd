import React from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, StatusBar, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const GREEN = '#0C9E54';
const NAVY  = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY  = '#8A8F9E';

const PERKS = [
  { icon: '📍', title: 'Optimal Routing',    sub: 'Best store order based on your list' },
  { icon: '🧾', title: 'Stack Savings',       sub: 'Pre-built bundles that beat any single deal' },
  { icon: '🤖', title: 'Chef Stash AI',       sub: 'Recipes built from your on-sale items' },
  { icon: '📊', title: 'Budget Dashboard',    sub: 'Weekly spend tracking & insights' },
  { icon: '🏠', title: 'Household Sharing',   sub: 'Sync lists with your whole family' },
];

export default function TrialGateScreen({ navigation }) {
  const handleSignOut = () => {
    supabase.auth.signOut({ scope: 'global' });
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={NAVY} />
      <SafeAreaView style={styles.safe} edges={['top']}>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
        >
          {/* Badge */}
          <View style={styles.badge}>
            <Text style={styles.badgeTxt}>TRIAL ENDED</Text>
          </View>

          {/* Headline */}
          <Text style={styles.headline}>Your free trial{'\n'}has ended.</Text>
          <Text style={styles.sub}>
            You've seen what Snippd can do. Upgrade to Pro to keep saving every week.
          </Text>

          {/* Perks */}
          <View style={styles.perksCard}>
            <Text style={styles.perksTitle}>Everything in Snippd Pro</Text>
            {PERKS.map((p) => (
              <View key={p.title} style={styles.perkRow}>
                <Text style={styles.perkIcon}>{p.icon}</Text>
                <View style={styles.perkText}>
                  <Text style={styles.perkName}>{p.title}</Text>
                  <Text style={styles.perkSub}>{p.sub}</Text>
                </View>
                <Text style={styles.check}>✓</Text>
              </View>
            ))}
          </View>

          {/* CTA */}
          <TouchableOpacity style={styles.upgradeBtn} activeOpacity={0.88}>
            <Text style={styles.upgradeBtnTxt}>Upgrade to Snippd Pro</Text>
            <Text style={styles.upgradeBtnSub}>Keep your savings streak going</Text>
          </TouchableOpacity>

          {/* Sign out */}
          <TouchableOpacity style={styles.signOutBtn} onPress={handleSignOut}>
            <Text style={styles.signOutTxt}>Sign Out</Text>
          </TouchableOpacity>

          <Text style={styles.fine}>
            Questions? Reach us at support@snippd.com
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root:  { flex: 1, backgroundColor: NAVY },
  safe:  { flex: 1 },
  scroll: {
    flexGrow: 1, alignItems: 'center',
    paddingHorizontal: 24, paddingTop: 48, paddingBottom: 40,
  },

  badge: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5,
    marginBottom: 24,
  },
  badgeTxt: {
    color: '#C5FFBC', fontSize: 10,
    fontWeight: 'bold', letterSpacing: 2,
  },

  headline: {
    fontSize: 36, fontWeight: 'bold', color: WHITE,
    textAlign: 'center', lineHeight: 42, marginBottom: 14,
  },
  sub: {
    fontSize: 15, color: 'rgba(255,255,255,0.65)',
    textAlign: 'center', lineHeight: 22, marginBottom: 36,
  },

  perksCard: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 20, width: '100%',
    padding: 20, marginBottom: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  perksTitle: {
    fontSize: 12, fontWeight: 'bold',
    color: '#C5FFBC', letterSpacing: 1.2,
    marginBottom: 16, textAlign: 'center',
  },
  perkRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: 12, marginBottom: 14,
  },
  perkIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  perkText: { flex: 1 },
  perkName: { fontSize: 14, fontWeight: 'bold', color: WHITE },
  perkSub:  { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 1 },
  check:    { fontSize: 14, color: GREEN, fontWeight: 'bold' },

  upgradeBtn: {
    backgroundColor: GREEN, borderRadius: 18,
    width: '100%', paddingVertical: 18,
    alignItems: 'center', marginBottom: 14,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4, shadowRadius: 14, elevation: 6,
  },
  upgradeBtnTxt: {
    color: WHITE, fontSize: 17, fontWeight: 'bold',
  },
  upgradeBtnSub: {
    color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 3,
  },

  signOutBtn: {
    paddingVertical: 12, paddingHorizontal: 24,
    borderRadius: 12, marginBottom: 28,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  signOutTxt: {
    color: 'rgba(255,255,255,0.45)', fontSize: 14,
    fontWeight: 'normal', textAlign: 'center',
  },

  fine: {
    fontSize: 11, color: 'rgba(255,255,255,0.25)', textAlign: 'center',
  },
});
