import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  StatusBar, Platform, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';
import { fetchWealthVariants } from '../lib/wealthEngineClient';

const COLORS = { 
  green: '#0C9E54', navy: '#04361D', grey: '#64748B', 
  border: '#E2E8F0', white: '#FFF', bg: '#F8FAFC', 
  blue: '#0071CE', gold: '#B58900', strike: '#94A3B8',
  lightBlue: '#E0F2FE', lightNavy: '#F1F5F9'
};

export default function StackDetailScreen({ route, navigation }) {
  const stack = route?.params?.stack || null;
  const [checkedItems, setCheckedItems] = useState({});
  const [locking, setLocking] = useState(false);
  const [engineLoading, setEngineLoading] = useState(false);
  const [engineVariants, setEngineVariants] = useState([]);
  const [engineError, setEngineError] = useState('');

  const toggleCheck = (id) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOptimizeStack = async () => {
    if (!stack) return;
    setEngineError('');
    setEngineLoading(true);

    try {
      const candidateItems = (stack.items || stack.breakdown_list || []).map((item) => ({
        id: item.id || String(item.name || item.product_name || Date.now()),
        category: item.category || 'other',
        brand: item.brand,
        retailer_key: stack.retailer?.toLowerCase().replace(/\s+/g, '_'),
        price_cents: Math.round((Number(item.pay_price || item.price || 0) || 0) * 100),
        savings_cents: Math.round((Number(item.savings || item.discount || 0) || 0) * 100),
        quantity: item.quantity || 1,
        on_stack: true,
      }));

      const result = await fetchWealthVariants({
        candidates: [{
          id: stack.id || `stack-${Date.now()}`,
          title: stack.stack_name || 'Stack',
          total_spent_cents: Math.round(mathAudit.oop * 100),
          total_saved_cents: Math.round(mathAudit.savings * 100),
          budget_cents: Math.round((stack.oop_total || stack.pay_price || 0) * 100),
          items: candidateItems,
        }],
        retailerKey: stack.retailer || 'unknown',
        modelVersion: 'wealth-v1',
      });

      setEngineVariants(result.variants || []);
    } catch (error) {
      setEngineError(String(error));
    } finally {
      setEngineLoading(false);
    }
  };

  const handleLockHaul = async () => {
    if (!stack) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (userId) {
        tracker.trackCheckoutStarted({
          user_id: userId,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'StackDetailScreen',
          cart_value_cents: Math.round(mathAudit.oop * 100),
          item_count: (stack.items || stack.breakdown_list || []).length,
          retailer_key: stack.retailer,
        });
      }

      setLocking(true);
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw authError || new Error('Not authenticated');

      const itemsJson = stack.items || stack.breakdown_list || [];
      const { data, error } = await supabase.rpc('lock_haul_transaction', {
        p_user_id: user.id,
        p_retailer: stack.retailer,
        p_total_pay: mathAudit.oop,
        p_total_saved: mathAudit.savings,
        p_items_json: itemsJson,
        p_credit_cost: 3,
      });

      if (error) {
        if (error.message?.toLowerCase()?.includes('insufficient credits')) {
          Alert.alert(
            'Low Credits',
            'You need 3 credits to lock a 7-Day Foundation. Upgrade to Founder for unlimited access!',
            [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Upgrade $99', onPress: () => navigation.navigate('Onboarding', { screen: 'Paywall' }) }
            ]
          );
          return;
        }
        throw error;
      }

      if (!data || data.length === 0) throw new Error('Lock haul transaction failed');

      if (userId) {
        tracker.trackCheckoutCompleted({
          user_id: userId,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'StackDetailScreen',
          cart_value_cents: Math.round(mathAudit.oop * 100),
          item_count: (stack.items || stack.breakdown_list || []).length,
          retailer_key: stack.retailer,
        });
      }

      Alert.alert('Haul Locked!', 'Your trip is saved to your profile. Happy shopping!');
      navigation.navigate('Profile');
    } catch (e) {
      console.error(e);
      Alert.alert('Error', 'Could not save haul. Please try again.');
    } finally {
      setLocking(false);
    }
  };

  // ── 1. THE DATA SANITIZER (WIRING PROTECTION) ──
  const getCleanTitle = (item) => {
    let name = item.name || item.item || 'Unknown Item';
    const brand = item.brand || '';
    const size = item.size || '';

    // PROTECT: Remove '$' or 'off' if the AI agent leaked them into the name
    let cleanName = name.replace(/\$\d+(\.\d{2})?|(\d+)?\s?off/gi, '').trim();
    // PROTECT: Remove redundant quantity prefixes
    cleanName = cleanName.replace(/^\d+x\s+/i, '');

    let title = cleanName;
    if (brand && !cleanName.toLowerCase().includes(brand.toLowerCase())) {
      title = `${brand} ${cleanName}`;
    }
    if (size && !title.toLowerCase().includes(size.toLowerCase())) {
      title = `${title} (${size})`;
    }
    return title;
  };

  // ── 2. MATH AUDIT (REGISTER TRUTH) ──
  const mathAudit = useMemo(() => {
    const items = stack?.items || [];
    return items.reduce((acc, item) => {
      const pay = parseFloat(item.pay_price ?? item.price ?? 0) || 0;
      const save = parseFloat(item.savings ?? item.discount ?? 0) || 0;
      const dealType = String(item.deal_type || item.type || '').toUpperCase();

      if (dealType.includes('COUPON') || dealType.includes('MFR')) {
        acc.coupons += save;
      } else {
        acc.sales += save;
      }

      acc.oop += pay;
      acc.savings += save;
      acc.retail += pay + save;
      return acc;
    }, { oop: 0, savings: 0, retail: 0, sales: 0, coupons: 0 });
  }, [stack]);

  // ── 3. ITINERARY LOGIC (ANCHOR ALIGNMENT) ──
  const itinerary = useMemo(() => {
    const rawItems = stack?.items || stack?.breakdown_list || [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    
    // Filter out logic/math items, keep only shoppable items
    const shoppable = rawItems.filter(i => Number(i.pay_price || i.price || 0) >= 0);

    // Identify proteins strictly by category or isAnchor flag
    const proteins = shoppable.filter(i => 
        i.isAnchor === true || (i.category || '').toLowerCase() === 'protein'
    );
    const others = shoppable.filter(i => !proteins.includes(i));

    return days.map((day, i) => {
      const dayPlan = [];
      if (proteins[i]) dayPlan.push({ ...proteins[i], isAnchor: true });
      const perDayOthers = Math.ceil(others.length / 7);
      dayPlan.push(...others.slice(i * perDayOthers, (i + 1) * perDayOthers));
      return { dayName: day, dayItems: dayPlan.filter(Boolean) };
    });
  }, [stack]);

  if (!stack) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={[styles.heroHeader, { backgroundColor: COLORS.navy }]}>
        <SafeAreaView edges={['top']}>
          <View style={styles.navRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
              <Feather name="arrow-left" size={24} color="#FFF" />
            </TouchableOpacity>
            <View style={styles.headerInfo}>
              <Text style={styles.headerLabel}>TRANSPARENT PRICING</Text>
              <Text style={styles.headerTitle}>{stack.retailer?.toUpperCase()} HAUL</Text>
            </View>
            <MaterialCommunityIcons name="shield-check" size={24} color={COLORS.green} />
          </View>
        </SafeAreaView>
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        
        {/* FINANCIAL SUMMARY */}
        <View style={styles.summaryCard}>
          <View style={styles.stat}>
            <Text style={styles.statVal}>${mathAudit.retail.toFixed(2)}</Text>
            <Text style={styles.statLab}>RETAIL</Text>
          </View>
          <View style={[styles.stat, styles.statBorder]}>
            <Text style={[styles.statVal, { color: COLORS.green }]}>-${(mathAudit.sales + mathAudit.coupons).toFixed(2)}</Text>
            <Text style={styles.statLab}>SNIPPD</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statVal}>${mathAudit.oop.toFixed(2)}</Text>
            <Text style={styles.statLab}>PAY</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Tap items to mark as found</Text>

        {itinerary.map((dayPlan, idx) => (
          <View key={idx} style={styles.daySection}>
            <Text style={styles.dayText}>{dayPlan.dayName.toUpperCase()}</Text>
            <View style={styles.itemsCard}>
              {dayPlan.dayItems.map((food, fIdx) => {
                const itemId = `${idx}-${fIdx}`;
                const isChecked = checkedItems[itemId];
                
                const currentPrice = Number(food.pay_price || food.price || 0);
                const itemSavings = Number(food.savings || food.discount || 0);
                const retailPrice = currentPrice + itemSavings;
                const hasSavings = itemSavings > 0;

                const dt = (food.deal_type || '').toUpperCase();
                const isBogo = dt.includes('BOGO');
                const isCoupon = dt.includes('COUPON') || dt.includes('MFR');

                return (
                  <TouchableOpacity 
                    key={fIdx} 
                    style={[styles.itemRow, fIdx === dayPlan.dayItems.length - 1 && { borderBottomWidth: 0 }, isChecked && {opacity: 0.3}]}
                    onPress={() => toggleCheck(itemId)}
                  >
                    <View style={styles.qtyColumn}>
                      <Text style={styles.qtyValue}>{food.quantity || 1}x</Text>
                    </View>

                    <View style={{ flex: 1 }}>
                        <Text style={[styles.itemName, food.isAnchor && { fontWeight: '900' }, isChecked && {textDecorationLine: 'line-through'}]}>
                            {getCleanTitle(food)}
                        </Text>
                        <View style={styles.badgeRow}>
                            {isBogo && <View style={[styles.miniBadge, {backgroundColor: COLORS.lightNavy}]}><Text style={[styles.miniBadgeTxt, {color: COLORS.navy}]}>BOGO</Text></View>}
                            {isCoupon && <View style={[styles.miniBadge, {backgroundColor: COLORS.lightBlue}]}><Text style={[styles.miniBadgeTxt, {color: COLORS.blue}]}>COUPON</Text></View>}
                            {/* WIRING: Strictly using the category field from your protocol */}
                            <Text style={styles.itemSub}>{food.category || 'Essential'}</Text>
                        </View>
                    </View>

                    <View style={styles.priceCol}>
                        {hasSavings && (
                          <Text style={styles.retailPrice}>${retailPrice.toFixed(2)}</Text>
                        )}
                        <Text style={[styles.snippdPrice, hasSavings && {color: COLORS.green}]}>
                          ${currentPrice.toFixed(2)}
                        </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        ))}

        {engineVariants.length > 0 && (
          <View style={styles.enginePanel}>
            <Text style={styles.sectionTitle}>Wealth engine optimization</Text>
            {engineVariants.map((variant, idx) => (
              <View key={idx} style={styles.variantCard}>
                <Text style={styles.variantTitle}>{variant.variant_type || `Candidate ${idx + 1}`}</Text>
                <Text style={styles.variantMeta}>Score: {variant.score ?? 0}</Text>
                <Text style={styles.variantMeta}>Preference fit: {variant.preference_fit ?? 0}</Text>
                <Text style={styles.variantMeta}>Budget fit: {variant.budget_fit ?? 0}</Text>
              </View>
            ))}
          </View>
        )}

        {engineError ? (
          <View style={styles.enginePanel}>
            <Text style={styles.engineError}>{engineError}</Text>
          </View>
        ) : null}

        <View style={{height: 100}} />
      </ScrollView>

      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>TOTAL AT REGISTER</Text>
          <Text style={styles.totalPrice}>${mathAudit.oop.toFixed(2)}</Text>
        </View>
        <View style={styles.actionColumn}>
          <TouchableOpacity
            style={[styles.secondaryBtn, engineLoading && { opacity: 0.6 }]}
            onPress={handleOptimizeStack}
            disabled={engineLoading}
          >
            <Text style={styles.secondaryBtnTxt}>Optimize Stack</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.mainBtn, locking && { opacity: 0.6 }]}
            onPress={handleLockHaul}
            disabled={locking}
          >
            <Text style={styles.mainBtnTxt}>Lock Haul (3 Credits)</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  heroHeader: { paddingBottom: 20, paddingHorizontal: 20 },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  backBtn: { width: 45, height: 45, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerInfo: { alignItems: 'center', flex: 1 },
  headerLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '900', letterSpacing: 2 },
  headerTitle: { color: COLORS.white, fontSize: 18, fontWeight: '800', marginTop: 2 },
  scrollBody: { padding: 20 },
  summaryCard: { flexDirection: 'row', backgroundColor: COLORS.white, borderRadius: 24, padding: 20, marginBottom: 15, elevation: 4 },
  stat: { flex: 1, alignItems: 'center' },
  statBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: COLORS.border },
  statVal: { fontSize: 22, fontWeight: '900', color: COLORS.navy },
  statLab: { fontSize: 11, fontWeight: '800', color: COLORS.grey, marginTop: 4 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: COLORS.grey, marginBottom: 20, textAlign: 'center', textTransform: 'uppercase' },
  daySection: { marginBottom: 30 },
  dayText: { fontSize: 18, fontWeight: '900', color: COLORS.navy, letterSpacing: 0.5, marginBottom: 12 },
  itemsCard: { backgroundColor: COLORS.white, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
  itemRow: { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  qtyColumn: { width: 45, marginRight: 12, alignItems: 'center' },
  qtyValue: { fontSize: 20, fontWeight: '900', color: COLORS.green },
  itemName: { fontSize: 17, fontWeight: '700', color: COLORS.navy, flexShrink: 1, lineHeight: 22 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  miniBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 8 },
  miniBadgeTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  itemSub: { fontSize: 13, color: COLORS.grey, fontWeight: '600', textTransform: 'capitalize' },
  priceCol: { alignItems: 'flex-end', marginLeft: 10, minWidth: 80 },
  retailPrice: { fontSize: 14, color: COLORS.strike, textDecorationLine: 'line-through', marginBottom: 2 },
  snippdPrice: { fontSize: 19, fontWeight: '900', color: COLORS.navy },
  footer: { position: 'absolute', bottom: 0, width: '100%', backgroundColor: COLORS.white, padding: 25, paddingBottom: 110, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: COLORS.border, elevation: 30 },
  actionColumn: { alignItems: 'flex-end' },
  secondaryBtn: { backgroundColor: COLORS.blue, paddingHorizontal: 20, paddingVertical: 14, borderRadius: 16, marginBottom: 10 },
  secondaryBtnTxt: { color: COLORS.white, fontWeight: '900', fontSize: 14 },
  enginePanel: { backgroundColor: COLORS.white, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: COLORS.border, marginBottom: 20 },
  variantCard: { borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingVertical: 14 },
  variantTitle: { fontSize: 15, fontWeight: '800', color: COLORS.navy, marginBottom: 6 },
  variantMeta: { fontSize: 12, color: COLORS.grey, marginBottom: 2 },
  engineError: { color: '#B91C1C', fontSize: 13, fontWeight: '700', textAlign: 'center' },
  totalLabel: { fontSize: 11, fontWeight: '900', color: COLORS.grey },
  totalPrice: { fontSize: 34, fontWeight: '900', color: COLORS.navy },
  mainBtn: { backgroundColor: COLORS.green, paddingHorizontal: 28, paddingVertical: 18, borderRadius: 18 },
  mainBtnTxt: { color: COLORS.white, fontWeight: '900', fontSize: 18 }
});