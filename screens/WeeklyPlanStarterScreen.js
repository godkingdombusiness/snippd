/**
 * WeeklyPlanStarterScreen — First step in the weekly planning flow.
 *
 * Shows the user's budget, stores, and goals, then asks how they want to start.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

const SEEDED_PROFILE = {
  budget:  185,
  stores:  ['Publix', 'Aldi', 'Dollar General'],
  goals:   ['Save Money', 'High Protein', 'Quick Meals'],
};

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function Pill({ label }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{label}</Text>
    </View>
  );
}

function ChoiceCard({ icon, label, sublabel, onPress }) {
  return (
    <TouchableOpacity style={styles.choiceCard} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.choiceIcon}>
        <Feather name={icon} size={18} color={GREEN} />
      </View>
      <View style={styles.choiceText}>
        <Text style={styles.choiceLabel}>{label}</Text>
        {sublabel ? <Text style={styles.choiceSub}>{sublabel}</Text> : null}
      </View>
      <Feather name="chevron-right" size={16} color={BORDER} />
    </TouchableOpacity>
  );
}

export default function WeeklyPlanStarterScreen({ navigation, route }) {
  const [profile, setProfile] = useState(SEEDED_PROFILE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from('profiles')
            .select('weekly_budget, preferred_stores, goals')
            .eq('user_id', user.id)
            .single();
          if (data) {
            setProfile({
              budget: data.weekly_budget ? Math.round(data.weekly_budget / 100) : 185,
              stores: data.preferred_stores?.length ? data.preferred_stores : SEEDED_PROFILE.stores,
              goals: data.goals?.length ? data.goals : SEEDED_PROFILE.goals,
            });
          }
        }
      } catch { /* use seeded */ }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingWrap}>
        <ActivityIndicator color={GREEN} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back */}
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>

        {/* Header */}
        <Text style={styles.headline}>Let's build your plan for the week.</Text>
        <Text style={styles.sub}>
          We'll start with your budget, stores, goals, and what you already know you need.
        </Text>

        {/* Profile snapshot */}
        <View style={styles.snapshotCard}>
          <View style={styles.snapshotRow}>
            <Feather name="dollar-sign" size={16} color={GREEN} />
            <Text style={styles.snapshotLabel}>Budget</Text>
            <Text style={styles.snapshotValue}>${profile.budget} / week</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.snapshotRow}>
            <Feather name="map-pin" size={16} color={GREEN} />
            <Text style={styles.snapshotLabel}>Stores</Text>
            <Text style={styles.snapshotValue}>{profile.stores.join(', ')}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.snapshotGoalsRow}>
            <Feather name="target" size={16} color={GREEN} />
            <Text style={styles.snapshotLabel}>Goals</Text>
            <View style={styles.pillRow}>
              {profile.goals.map(g => <Pill key={g} label={g} />)}
            </View>
          </View>
        </View>

        {/* Question */}
        <Text style={styles.question}>What do you already know you need?</Text>

        {/* Choices */}
        <View style={styles.choices}>
          <ChoiceCard
            icon="edit-3"
            label="Type items"
            sublabel="Add anything you know you need"
            onPress={() => navigation.navigate('AddNeeds')}
          />
          <ChoiceCard
            icon="clock"
            label="Pick from past favorites"
            sublabel="Items you've bought before"
            onPress={() => navigation.navigate('UsualStaples')}
          />
          <ChoiceCard
            icon="list"
            label="Use my usual staples"
            sublabel="Eggs, milk, chicken and the rest"
            onPress={() => navigation.navigate('UsualStaples')}
          />
          <ChoiceCard
            icon="zap"
            label="Build a smart starter cart"
            sublabel="Snippd picks based on your profile"
            onPress={() => navigation.navigate('SmartStarterCart')}
          />
        </View>

        <StashBubble message="Start messy. I'll organize it." />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 40 },

  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 28,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 34,
    marginBottom: 8,
  },
  sub: { fontSize: 15, color: GRAY, lineHeight: 22, fontWeight: '300', marginBottom: 24 },

  snapshotCard: {
    backgroundColor: WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 18,
    marginBottom: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  snapshotRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  snapshotGoalsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  snapshotLabel: { fontSize: 12, fontWeight: '600', color: GRAY, width: 50 },
  snapshotValue: { flex: 1, fontSize: 14, color: NAVY, fontWeight: '500' },
  pillRow: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  pill: {
    backgroundColor: MINT,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pillText: { fontSize: 11, color: GREEN, fontWeight: '600' },
  divider: { height: 1, backgroundColor: BORDER, marginVertical: 12 },

  question: {
    fontSize: 13,
    fontWeight: '700',
    color: NAVY,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 14,
  },

  choices: { gap: 10, marginBottom: 28 },
  choiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  choiceIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceText: { flex: 1 },
  choiceLabel: { fontSize: 15, fontWeight: '600', color: NAVY, marginBottom: 2 },
  choiceSub: { fontSize: 12, color: GRAY },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },
  stashIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21 },
});
