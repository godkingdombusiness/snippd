import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';
const OFF_WHITE = '#F8FAFC';

export default function AdminAnalyticsDashboardScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.title}>Admin Analytics</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Launch-Safe Admin View</Text>
          <Text style={styles.cardBody}>
            The previous analytics implementation was not bundle-safe. This view is intentionally display-only until the admin
            dashboard is rebuilt from backend aggregate endpoints.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.metricLabel}>Pricing policy</Text>
          <Text style={styles.metricValue}>Frontend math disabled</Text>
          <Text style={styles.cardBody}>
            Checkout totals, savings, and funding authority must come from Cloud Run or Supabase.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: OFF_WHITE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 16, fontWeight: '900', color: NAVY },
  scroll: { padding: 16, gap: 14 },
  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: BORDER,
  },
  cardTitle: { color: NAVY, fontSize: 17, fontWeight: '900', marginBottom: 8 },
  cardBody: { color: GRAY, fontSize: 13, lineHeight: 20 },
  metricLabel: { color: GRAY, fontSize: 11, fontWeight: '900', letterSpacing: 1, marginBottom: 6 },
  metricValue: { color: GREEN, fontSize: 20, fontWeight: '900', marginBottom: 8 },
});
