/**
 * ReceiptPromptScreen — Prompts the user to upload a receipt
 * or skip after completing a shopping trip. Drives next-week learning.
 */

import React from 'react';
import {
  View, Text, TouchableOpacity, ScrollView, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN  = '#0C9E54';
const NAVY   = '#172250';
const CREAM  = '#FAF8F1';
const WHITE  = '#FFFFFF';
const GRAY   = '#6B7280';
const BORDER = '#E5E7EB';
const MINT   = '#E8F5E9';

function StashBubble({ message }) {
  return (
    <View style={styles.stash}>
      <View style={styles.stashIcon}><Text style={styles.stashIconText}>✦</Text></View>
      <Text style={styles.stashText}>{message}</Text>
    </View>
  );
}

function LearnCard({ icon, text }) {
  return (
    <View style={styles.learnCard}>
      <Feather name={icon} size={16} color={GREEN} />
      <Text style={styles.learnText}>{text}</Text>
    </View>
  );
}

export default function ReceiptPromptScreen({ navigation, route }) {
  const fromFlow = route?.params?.fromFlow ?? false;

  function goToDashboard() {
    navigation.reset({ index: 0, routes: [{ name: 'MainApp' }] });
  }

  function goToReceiptUpload() {
    // Navigate to existing ReceiptUploadScreen inside the MainApp tab stack.
    // We reset to MainApp first, then the tab navigator handles the rest.
    navigation.reset({
      index: 0,
      routes: [{ name: 'MainApp', params: { screen: 'CartTab', params: { screen: 'ReceiptUpload' } } }],
    });
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Back (only show when coming from cart flow, not as NBA landing) */}
        {fromFlow && (
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Feather name="arrow-left" size={20} color={NAVY} />
          </TouchableOpacity>
        )}

        {/* Icon */}
        <View style={styles.iconWrap}>
          <View style={styles.iconCircle}>
            <Feather name="file-text" size={32} color={GREEN} />
          </View>
        </View>

        {/* Header */}
        <Text style={styles.headline}>Want next week's plan to get smarter?</Text>
        <Text style={styles.sub}>
          Check in with your receipt so Snippd can compare your plan to what actually happened.
        </Text>

        {/* What we learn */}
        <Text style={styles.sectionLabel}>What Snippd learns from your receipt</Text>
        <View style={styles.learnCards}>
          <LearnCard icon="trending-up" text="Which items were priced higher or lower than planned" />
          <LearnCard icon="check-square" text="Which items from your plan you actually bought" />
          <LearnCard icon="rotate-ccw" text="What to suggest differently next week" />
          <LearnCard icon="dollar-sign" text="How close you stayed to your weekly budget" />
        </View>

        <StashBubble
          message="The receipt helps me learn what worked, what changed, and what to catch next time."
        />

        {/* Action buttons */}
        <View style={styles.actions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={goToReceiptUpload}>
            <Feather name="upload" size={18} color={WHITE} />
            <Text style={styles.primaryBtnText}>Upload Receipt</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryBtn} onPress={goToReceiptUpload}>
            <Feather name="edit-3" size={16} color={NAVY} />
            <Text style={styles.secondaryBtnText}>Enter Total Manually</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.skipBtn} onPress={goToDashboard}>
            <Text style={styles.skipText}>Skip for Now</Text>
          </TouchableOpacity>
        </View>

        {/* Reassurance note */}
        <View style={styles.note}>
          <Feather name="info" size={14} color={GRAY} />
          <Text style={styles.noteText}>
            Snippd never shares your receipt data. It's used only to improve your weekly plan.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: CREAM },
  scroll: { padding: 24, paddingBottom: 40 },
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },

  iconWrap: { alignItems: 'center', marginTop: 12, marginBottom: 24 },
  iconCircle: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: MINT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#C8E6C9',
  },

  headline: {
    fontFamily: 'Sublima-ExtraBold',
    fontSize: 26,
    color: NAVY,
    letterSpacing: -0.5,
    lineHeight: 32,
    marginBottom: 10,
    textAlign: 'center',
  },
  sub: {
    fontSize: 15,
    color: GRAY,
    lineHeight: 22,
    fontWeight: '300',
    textAlign: 'center',
    marginBottom: 28,
  },

  sectionLabel: {
    fontSize: 11, fontWeight: '700', color: GRAY,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 12,
  },
  learnCards: { gap: 10, marginBottom: 24 },
  learnCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: WHITE,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    padding: 14,
  },
  learnText: { flex: 1, fontSize: 14, color: NAVY, fontWeight: '400', lineHeight: 20 },

  stash: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: MINT,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    marginBottom: 28,
  },
  stashIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  stashIconText: { color: WHITE, fontSize: 14, fontWeight: '700' },
  stashText: { flex: 1, fontSize: 14, color: NAVY, lineHeight: 21 },

  actions: { gap: 12, marginBottom: 20 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 16,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { fontSize: 15, fontWeight: '700', color: WHITE },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: BORDER,
    paddingVertical: 14,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: NAVY },
  skipBtn: { alignItems: 'center', paddingVertical: 8 },
  skipText: { fontSize: 14, color: GRAY, fontWeight: '500' },

  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 4,
  },
  noteText: { flex: 1, fontSize: 12, color: GRAY, lineHeight: 18 },
});
