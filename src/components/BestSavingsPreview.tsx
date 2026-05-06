// FOLD 6 — Optional UI connection for the Normalized Offer Engine.
//
// SAFE: Read-only. Uses getBestSavingsOffers() which falls back to [].
// Never blocks HomeScreen — renders nothing when table is empty or missing.
// Never replaces existing deal cards.

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { getBestSavingsOffers } from '../services/normalizedOffersService';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Offer {
  id: string;
  product_name: string;
  retailer: string;
  brand: string | null;
  price_cents: number | null;
  regular_price_cents: number | null;
  savings_cents: number | null;
  deal_type: string;
  final_unit_price_cents: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDollars(cents: number | null): string {
  if (cents == null) return '—';
  return `$${(cents / 100).toFixed(2)}`;
}

// ── Sub-components (plain functions, not React components) ────────────────────

function renderOfferCard({ item }: { item: Offer }) {
  const savingsLabel = item.savings_cents != null
    ? `Save ${formatDollars(item.savings_cents)}`
    : null;

  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <Text style={styles.productName} numberOfLines={2}>
          {item.product_name}
        </Text>
        {item.brand ? (
          <Text style={styles.brand}>{item.brand}</Text>
        ) : null}
        <Text style={styles.retailer}>{item.retailer}</Text>
      </View>
      <View style={styles.cardRight}>
        <Text style={styles.price}>{formatDollars(item.final_unit_price_cents ?? item.price_cents)}</Text>
        {item.regular_price_cents != null ? (
          <Text style={styles.regular}>{formatDollars(item.regular_price_cents)}</Text>
        ) : null}
        {savingsLabel ? (
          <View style={styles.savingsBadge}>
            <Text style={styles.savingsTxt}>{savingsLabel}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export default function BestSavingsPreview() {
  const [offers, setOffers] = useState<Offer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getBestSavingsOffers(3).then(data => {
      if (!cancelled) {
        setOffers(data as Offer[]);
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  // Render nothing until loaded; render nothing if no data
  if (loading) {
    return (
      <View style={styles.loadingRow}>
        <ActivityIndicator size="small" color="#2E7D32" />
      </View>
    );
  }

  if (!offers.length) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.heading}>Best Savings Right Now</Text>
      <FlatList
        data={offers}
        keyExtractor={item => item.id}
        renderItem={renderOfferCard}
        scrollEnabled={false}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
  },
  heading: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A237E',
    marginBottom: 10,
  },
  loadingRow: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  cardLeft: {
    flex: 1,
    paddingRight: 8,
  },
  cardRight: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    minWidth: 80,
  },
  productName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A237E',
    marginBottom: 2,
  },
  brand: {
    fontSize: 11,
    color: '#5C6BC0',
    marginBottom: 2,
  },
  retailer: {
    fontSize: 11,
    color: '#757575',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    color: '#2E7D32',
  },
  regular: {
    fontSize: 11,
    color: '#9E9E9E',
    textDecorationLine: 'line-through',
    marginTop: 2,
  },
  savingsBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  savingsTxt: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E7D32',
  },
});
