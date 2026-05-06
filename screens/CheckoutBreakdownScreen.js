/**
 * CheckoutBreakdownScreen — display-only checkout authority.
 *
 * All pricing numbers come from Cloud Run checkout math. If authority is
 * unavailable, the screen withholds totals instead of estimating locally.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../lib/supabase';
import { AgenticLedger, DecisionType } from '../src/services/agenticLedger';
import {
  authorizedTotalsForRoute,
  fetchAuthorizedCheckoutMath,
} from '../src/services/authoritativeCheckoutMath';
import { readActiveCart } from '../src/services/cartStorage';

const FOREST = '#0C7A3D';
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER = '#E2E8F0';
const PURPLE = '#7C3AED';

const fmt = (cents) => (typeof cents === 'number' ? '$' + (cents / 100).toFixed(2) : '--');

export default function CheckoutBreakdownScreen({ navigation, route }) {
  const [loading, setLoading] = useState(true);
  const [cartItems, setCartItems] = useState(route?.params?.cartItems ?? []);
  const [checkoutAuthority, setCheckoutAuthority] = useState(route?.params?.checkoutAuthority ?? null);

  const load = useCallback(async () => {
    try {
      const fromRoute = route?.params?.cartItems;
      if (fromRoute?.length) {
        setCartItems(fromRoute);
        if (!route?.params?.totals) {
          setCheckoutAuthority(await fetchAuthorizedCheckoutMath({ items: fromRoute }));
        }
      } else {
        const { items: normalized } = await readActiveCart();
        setCartItems(normalized);
        setCheckoutAuthority(normalized.length ? await fetchAuthorizedCheckoutMath({ items: normalized }) : null);
      }
    } catch {
      setCheckoutAuthority(null);
    } finally {
      setLoading(false);
    }
  }, [route?.params?.cartItems, route?.params?.totals]);

  useEffect(() => { load(); }, [load]);

  const authority = route?.params?.totals ?? authorizedTotalsForRoute(checkoutAuthority);

  const onCheckedOut = useCallback(async () => {
    const plannedNames = cartItems.map((i) => String(i.product_name || i.name || '').toLowerCase().trim()).filter(Boolean);
    await AsyncStorage.setItem('snippd_planned_cart_snapshot', JSON.stringify({
      names: plannedNames,
      saved_at: new Date().toISOString(),
    }));

    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user?.id) {
      await AgenticLedger.log({
        user_id: session.user.id,
        decision_type: DecisionType.CONCIERGE_CHECKOUT_VIEW,
        actor: 'CheckoutBreakdownScreen',
        result: authority ? 'approved' : 'blocked',
        metadata: {
          register_cents: authority?.you_pay_cents,
          final_cents: authority?.true_final_cents,
          math_source: authority?.math_source,
          signature_present: Boolean(authority?.signature),
          mirror_neo4j: true,
        },
      });
    }

    navigation.navigate('VerifyReceipt', {
      cartItems,
      checkoutAuthority,
      totals: authority,
    });
  }, [cartItems, navigation, authority, checkoutAuthority]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transparent checkout</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.formulaCard}>
          <Text style={styles.formulaTitle}>CLOUD RUN AUTHORITY</Text>
          <Text style={styles.formulaLine}>
            Retail total <Text style={styles.formulaEm}>{fmt(authority?.regular_total_cents)}</Text>
          </Text>
          <Text style={styles.formulaMuted}>- Authorized stack savings</Text>
          <Text style={styles.formulaSub}>{fmt(authority?.at_register_savings_cents)}</Text>
          <View style={styles.formulaDivider} />
          <Text style={styles.formulaResultLabel}>Authorized register total</Text>
          <Text style={styles.formulaResult}>{fmt(authority?.you_pay_cents)}</Text>
          <Text style={styles.formulaFoot}>
            {authority
              ? `Signed by ${authority.math_source}.`
              : 'Totals are hidden until Cloud Run returns signed checkout math.'}
          </Text>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Verification detail</Text>
          <View style={styles.row}>
            <Text style={styles.rowLab}>Status</Text>
            <Text style={styles.rowVal}>{authority?.status || 'UNAVAILABLE'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.rowLab}>Savings floor</Text>
            <Text style={styles.rowVal}>{typeof authority?.savings_pct === 'number' ? `${authority.savings_pct}%` : '--'}</Text>
          </View>
          <View style={styles.row}>
            <Text style={[styles.rowLab, { color: PURPLE }]}>Signature</Text>
            <Text style={[styles.rowVal, { color: PURPLE }]}>{authority?.signature ? 'Present' : 'Missing'}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.cta} onPress={onCheckedOut} activeOpacity={0.88}>
          <Text style={styles.ctaTxt}>I've checked out</Text>
          <Feather name="check-circle" size={18} color={WHITE} style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 14 },
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
  headerTitle: { fontSize: 16, fontWeight: '700', color: NAVY },
  formulaCard: { backgroundColor: FOREST, borderRadius: 16, padding: 20 },
  formulaTitle: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.55)', letterSpacing: 1, marginBottom: 12 },
  formulaLine: { fontSize: 15, color: WHITE, marginBottom: 10 },
  formulaEm: { fontWeight: '900', fontSize: 18 },
  formulaMuted: { fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 6 },
  formulaSub: { fontSize: 14, fontWeight: '700', color: '#A7F3D0' },
  formulaDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginVertical: 14 },
  formulaResultLabel: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  formulaResult: { fontSize: 30, fontWeight: '900', color: WHITE },
  formulaFoot: { marginTop: 14, fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 18 },
  detailCard: { backgroundColor: WHITE, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORDER },
  detailTitle: { fontSize: 13, fontWeight: '800', color: NAVY, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowLab: { fontSize: 13, color: GRAY },
  rowVal: { fontSize: 13, fontWeight: '800', color: NAVY, maxWidth: '58%', textAlign: 'right' },
  cta: { marginTop: 4, backgroundColor: GREEN, borderRadius: 16, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  ctaTxt: { color: WHITE, fontSize: 15, fontWeight: '900' },
});
