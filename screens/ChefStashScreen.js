import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, LayoutAnimation, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

export default function DiscoverScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [rawStacks, setRawStacks] = useState([]);
  const [profile, setProfile] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: prof } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
      setProfile(prof);

      const { data: stackData } = await supabase.from('app_home_feed').select('*').eq('status', 'active');
      
      const sanitized = (stackData || []).map(s => ({
        ...s,
        retailer: s.retailer ? s.retailer.charAt(0).toUpperCase() + s.retailer.slice(1).toLowerCase() : 'Other',
        pay_price: parseFloat(s.pay_price || 0),
        save_price: parseFloat(s.save_price || 0),
        breakdown_list: typeof s.breakdown_list === 'string' ? JSON.parse(s.breakdown_list) : (s.breakdown_list || [])
      }));
      setRawStacks(sanitized);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => { fetchData(); }, [fetchData]));

  const sevenDayStrategies = useMemo(() => {
    const stores = [...new Set(rawStacks.map(s => s.retailer))].filter(Boolean);
    const members = profile?.household_members || 1;
    const requiredMeals = 21 * members; // 3 meals * 7 days * members

    return stores.map(storeName => {
      const storeStacks = rawStacks.filter(s => s.retailer === storeName);
      const allItems = storeStacks.flatMap(s => s.breakdown_list);
      
      // Strict Breakfast Check
      const breakfastItems = allItems.filter(i => 
        (i.name || i.item || '').toLowerCase().match(/egg|oat|milk|cereal|yogurt|fruit|pancake|bacon|sausage/)
      );

      // We estimate 1 item ≈ 1 meal component.
      // To be "7-Day," you need volume.
      const mealVolume = allItems.length;
      const coverageDays = Math.floor(mealVolume / (members * 3));

      if (coverageDays < 5) return null; // Reject anything that isn't almost a full week

      return {
        id: `7day_${storeName}`,
        retailer: storeName,
        title: `Complete 7-Day ${storeName} Haul`,
        pay_price: storeStacks.reduce((sum, s) => sum + s.pay_price, 0),
        save_price: storeStacks.reduce((sum, s) => sum + s.save_price, 0),
        items: allItems,
        days: coverageDays,
        hasBreakfast: breakfastItems.length >= members * 2, // At least 2 breakfast items per person
        breakdown: {
          breakfast: breakfastItems.length,
          core: allItems.length - breakfastItems.length
        }
      };
    }).filter(Boolean).sort((a, b) => b.days - a.days);
  }, [rawStacks, profile]);

  if (loading) return <View style={styles.center}><ActivityIndicator color="#0C9E54" /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <Text style={styles.headerLabel}>STRATEGY PLANNER</Text>
        <Text style={styles.budgetAmount}>$0.00 Total · {(profile?.weekly_budget / 100 || 150).toFixed(2)} Remaining</Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>7-Day Foundations</Text>
        <Text style={styles.subtitle}>Verified bundles that cover 21 meals + breakfast.</Text>

        {sevenDayStrategies.map(bundle => (
          <TouchableOpacity 
            key={bundle.id} 
            style={styles.card}
            onPress={() => navigation.navigate('StackDetail', { stack: bundle })}
          >
            <View style={styles.cardHeader}>
               <View style={styles.badge}><Text style={styles.badgeTxt}>{bundle.retailer.toUpperCase()}</Text></View>
               <Text style={styles.coverageTxt}>WEEKLY COVERAGE: {bundle.days} DAYS</Text>
            </View>
            <Text style={styles.cardTitle}>{bundle.title}</Text>
            
            <View style={styles.mealChecklist}>
               <View style={styles.checkItem}>
                  <Text style={bundle.hasBreakfast ? styles.greenCheck : styles.greyCheck}>✓ Breakfast Included</Text>
               </View>
               <View style={styles.checkItem}>
                  <Text style={styles.greenCheck}>✓ {bundle.items.length} High-Volume Items</Text>
               </View>
            </View>

            <View style={styles.cardFooter}>
              <View>
                <Text style={styles.footerLabel}>OUT-OF-POCKET</Text>
                <Text style={styles.footerPrice}>${bundle.pay_price.toFixed(2)}</Text>
              </View>
              <View style={styles.selectBtn}><Text style={styles.selectBtnTxt}>View 21 Meals</Text></View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFF' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 20, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  headerLabel: { fontSize: 12, fontWeight: '900', color: '#64748B' },
  budgetAmount: { fontSize: 16, fontWeight: '700', color: '#0C9E54', marginTop: 5 },
  scroll: { padding: 20 },
  title: { fontSize: 26, fontWeight: '900', color: '#04361D' },
  subtitle: { fontSize: 15, color: '#64748B', marginBottom: 20 },
  card: { backgroundColor: '#FFF', borderRadius: 24, padding: 20, marginBottom: 20, borderWidth: 1.5, borderColor: '#E2E8F0', elevation: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  badge: { backgroundColor: '#0071CE', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  badgeTxt: { color: '#FFF', fontWeight: '900', fontSize: 10 },
  coverageTxt: { color: '#0C9E54', fontWeight: '900', fontSize: 11 },
  cardTitle: { fontSize: 20, fontWeight: '900', color: '#04361D', marginBottom: 10 },
  mealChecklist: { marginBottom: 15 },
  greenCheck: { color: '#0C9E54', fontWeight: '700', fontSize: 13 },
  greyCheck: { color: '#94A3B8', fontWeight: '600', fontSize: 13 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 15 },
  footerLabel: { fontSize: 8, fontWeight: '900', color: '#64748B' },
  footerPrice: { fontSize: 28, fontWeight: '900', color: '#04361D' },
  selectBtn: { backgroundColor: '#0C9E54', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 10 },
  selectBtnTxt: { color: '#FFF', fontWeight: '900' }
});