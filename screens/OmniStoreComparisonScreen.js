import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';

import { supabase } from '../lib/supabase';

const COLORS = {
  green: '#0C9E54',
  navy: '#04361D',
  grey: '#64748B',
  bg: '#F8FAFC',
  white: '#FFFFFF',
  border: '#E2E8F0',
  amber: '#F59E0B',
};

function dollars(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '--';
  return `$${value.toFixed(2)}`;
}

export default function OmniStoreComparisonScreen({ navigation }) {
  const [loading, setLoading] = useState(false);
  const [comparison, setComparison] = useState(null);
  const [error, setError] = useState('');

  const loadComparison = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Sign in to compare stores.');
        return;
      }

      const response = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/get-omni-store-comparison`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (response.status === 404) {
        setComparison(null);
        return;
      }

      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || 'Comparison unavailable.');
      setComparison(payload);
    } catch (err) {
      setError(err?.message || 'Comparison unavailable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(loadComparison);

  const stores = comparison?.stores ?? [];

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={COLORS.navy} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerLabel}>SAME ITEMS</Text>
          <Text style={styles.headerTitle}>Store Comparison</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadComparison} tintColor={COLORS.green} />
        }
      >
        {loading && !comparison ? (
          <View style={styles.centerCard}>
            <ActivityIndicator color={COLORS.green} />
          </View>
        ) : error ? (
          <View style={styles.centerCard}>
            <Feather name="alert-circle" size={28} color={COLORS.amber} />
            <Text style={styles.emptyTitle}>{error}</Text>
          </View>
        ) : stores.length === 0 ? (
          <View style={styles.centerCard}>
            <Feather name="git-compare" size={30} color={COLORS.green} />
            <Text style={styles.emptyTitle}>No comparison ready yet</Text>
            <Text style={styles.emptySub}>
              Build a list first, then Snippd will compare the same items across eligible stores.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Catalog')}>
              <Text style={styles.primaryBtnTxt}>Browse Deals</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.statusCard}>
              <Text style={styles.statusLabel}>STATUS</Text>
              <Text style={styles.statusValue}>{comparison.status || 'PENDING'}</Text>
            </View>

            {stores.map(store => {
              const isWinner = store.retailer === comparison.winner || store.retailer_node === comparison.winner;
              return (
                <View key={store.retailer_node || store.retailer} style={[styles.storeCard, isWinner && styles.winnerCard]}>
                  <View style={styles.storeTop}>
                    <Text style={styles.storeName}>{store.retailer || store.retailer_node}</Text>
                    {isWinner && <Text style={styles.winnerPill}>BEST</Text>}
                  </View>
                  <View style={styles.metricRow}>
                    <View>
                      <Text style={styles.metricLabel}>Out of pocket</Text>
                      <Text style={styles.metricValue}>{dollars(store.oop)}</Text>
                    </View>
                    <View>
                      <Text style={styles.metricLabel}>Savings</Text>
                      <Text style={styles.metricValue}>{store.savings_percentage ?? '--'}%</Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  headerLabel: { fontSize: 10, color: COLORS.grey, fontWeight: '900', letterSpacing: 1.2 },
  headerTitle: { fontSize: 22, color: COLORS.navy, fontWeight: '900', marginTop: 2 },
  scroll: { padding: 18, paddingBottom: 120 },
  centerCard: {
    backgroundColor: COLORS.white,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  emptyTitle: { marginTop: 12, fontSize: 17, fontWeight: '900', color: COLORS.navy, textAlign: 'center' },
  emptySub: { marginTop: 8, fontSize: 13, color: COLORS.grey, textAlign: 'center', lineHeight: 19 },
  primaryBtn: { marginTop: 18, backgroundColor: COLORS.green, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  primaryBtnTxt: { color: COLORS.white, fontSize: 13, fontWeight: '900' },
  statusCard: {
    backgroundColor: COLORS.navy,
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  statusLabel: { color: 'rgba(255,255,255,0.65)', fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  statusValue: { color: COLORS.white, fontSize: 20, fontWeight: '900', marginTop: 4 },
  storeCard: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    padding: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  winnerCard: { borderColor: COLORS.green, backgroundColor: '#F0FDF4' },
  storeTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  storeName: { fontSize: 18, color: COLORS.navy, fontWeight: '900' },
  winnerPill: {
    backgroundColor: COLORS.green,
    color: COLORS.white,
    fontSize: 10,
    fontWeight: '900',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    overflow: 'hidden',
  },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between' },
  metricLabel: { color: COLORS.grey, fontSize: 11, fontWeight: '800', marginBottom: 4 },
  metricValue: { color: COLORS.navy, fontSize: 22, fontWeight: '900' },
});
