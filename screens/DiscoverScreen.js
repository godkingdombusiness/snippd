import React, { useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons'; // Added for icons
import { supabase } from '../lib/supabase';

const COLORS = {
  green: '#0C9E54',
  navy: '#04361D',
  blue: '#0071CE',
  grey: '#64748B',
  bg: '#F8FAFC',
  white: '#FFF',
  border: '#E2E8F0'
};

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

  // --- LOGIC: ANALYZE BUNDLE VALUE ---
  const sevenDayStrategies = useMemo(() => {
    const stores = [...new Set(rawStacks.map(s => s.retailer))].filter(Boolean);
    const members = profile?.household_members || 1;

    return stores.map(storeName => {
      const storeStacks = rawStacks.filter(s => s.retailer === storeName);
      const allItems = storeStacks.flatMap(s => s.breakdown_list);
      
      const breakfastItems = allItems.filter(i => 
        (i.name || i.item || '').toLowerCase().match(/egg|oat|milk|cereal|yogurt|fruit|pancake|bacon|sausage/)
      );

      const mealVolume = allItems.length;
      const coverageDays = Math.floor(mealVolume / (members * 3));

      // Reject weak stacks
      if (coverageDays < 5) return null; 

      // Identify "Hero" categories for the Visual Teaser
      const hasProtein = allItems.some(i => (i.category || '').toLowerCase().includes('protein'));
      const hasProduce = allItems.some(i => (i.category || '').toLowerCase().includes('produce'));

      return {
        id: `7day_${storeName}`,
        retailer: storeName,
        title: `Complete 7-Day ${storeName} Haul`,
        pay_price: storeStacks.reduce((sum, s) => sum + s.pay_price, 0),
        save_price: storeStacks.reduce((sum, s) => sum + s.save_price, 0),
        items: allItems,
        days: coverageDays,
        hasBreakfast: breakfastItems.length >= members * 2,
        hasProtein,
        hasProduce
      };
    }).filter(Boolean).sort((a, b) => b.days - a.days);
  }, [rawStacks, profile]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={COLORS.green} /></View>;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.headerTop}>
            <Text style={styles.headerLabel}>SAVINGS STRATEGY</Text>
            <Feather name="info" size={16} color={COLORS.grey} />
        </View>
        <Text style={styles.budgetAmount}>
            ${(profile?.weekly_budget / 100 || 150).toFixed(0)} Weekly Budget Target
        </Text>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>7-Day Foundations</Text>
        <Text style={styles.subtitle}>Verified bundles that cover 21 meals + breakfast.</Text>

        {sevenDayStrategies.map(bundle => (
          <TouchableOpacity 
            key={bundle.id} 
            style={styles.card}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('StackDetail', { stack: bundle })}
          >
            {/* CARD HEADER: STORE & COVERAGE */}
            <View style={styles.cardHeader}>
               <View style={[styles.badge, { backgroundColor: bundle.retailer === 'Publix' ? COLORS.blue : COLORS.navy }]}>
                    <Text style={styles.badgeTxt}>{bundle.retailer.toUpperCase()}</Text>
               </View>
               <View style={styles.coverageRow}>
                    <MaterialCommunityIcons name="calendar-check" size={14} color={COLORS.green} />
                    <Text style={styles.coverageTxt}>{bundle.days} DAYS OF FOOD</Text>
               </View>
            </View>

            <Text style={styles.cardTitle}>{bundle.title}</Text>
            
            {/* VISUAL TEASER: MAKES THE HAUL TANGIBLE */}
            <View style={styles.teaserRow}>
                <Text style={styles.teaserLabel}>Includes: </Text>
                {bundle.hasProtein && <View style={styles.tag}><Text style={styles.tagText}>🍗 Protein</Text></View>}
                {bundle.hasProduce && <View style={styles.tag}><Text style={styles.tagText}>🥦 Produce</Text></View>}
                {bundle.hasBreakfast && <View style={styles.tag}><Text style={styles.tagText}>🍳 Breakfast</Text></View>}
                <Text style={styles.plusMore}>+{bundle.items.length - 3} more</Text>
            </View>

            {/* THE "WIN" SECTION: EMPHASIZE SAVINGS OVER COST */}
            <View style={styles.cardFooter}>
              <View style={styles.savingsBox}>
                <Text style={styles.footerLabel}>YOU SAVE</Text>
                <Text style={[styles.footerPrice, { color: COLORS.green }]}>${bundle.save_price.toFixed(0)}</Text>
              </View>
              
              <View style={styles.priceBox}>
                <Text style={styles.footerLabel}>AT TILL</Text>
                <Text style={styles.footerPrice}>${bundle.pay_price.toFixed(0)}</Text>
              </View>

              <View style={styles.selectBtn}>
                <Text style={styles.selectBtnTxt}>View Meals</Text>
                <Feather name="chevron-right" size={16} color={COLORS.white} />
              </View>
            </View>
          </TouchableOpacity>
        ))}
        <View style={{height: 100}} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { padding: 25, backgroundColor: COLORS.white, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLabel: { fontSize: 10, fontWeight: '900', color: COLORS.grey, letterSpacing: 1.5 },
  budgetAmount: { fontSize: 18, fontWeight: '800', color: COLORS.green, marginTop: 4 },
  scroll: { padding: 20 },
  title: { fontSize: 28, fontWeight: '900', color: COLORS.navy },
  subtitle: { fontSize: 15, color: COLORS.grey, marginBottom: 25, lineHeight: 22 },
  
  card: { backgroundColor: COLORS.white, borderRadius: 28, padding: 20, marginBottom: 20, elevation: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 },
  badge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  badgeTxt: { color: COLORS.white, fontWeight: '900', fontSize: 10, letterSpacing: 0.5 },
  coverageRow: { flexDirection: 'row', alignItems: 'center' },
  coverageTxt: { color: COLORS.green, fontWeight: '900', fontSize: 11, marginLeft: 5 },
  
  cardTitle: { fontSize: 22, fontWeight: '900', color: COLORS.navy, marginBottom: 12 },
  
  teaserRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap' },
  teaserLabel: { fontSize: 12, fontWeight: '700', color: COLORS.grey },
  tag: { backgroundColor: COLORS.bg, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, marginRight: 6 },
  tagText: { fontSize: 11, fontWeight: '700', color: COLORS.navy },
  plusMore: { fontSize: 11, color: COLORS.grey, fontWeight: '600' },

  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#F1F5F9', paddingTop: 20 },
  footerLabel: { fontSize: 9, fontWeight: '900', color: COLORS.grey, marginBottom: 2 },
  footerPrice: { fontSize: 24, fontWeight: '900', color: COLORS.navy },
  savingsBox: { flex: 1 },
  priceBox: { flex: 1, alignItems: 'center', borderLeftWidth: 1, borderLeftColor: COLORS.border, borderRightWidth: 1, borderRightColor: COLORS.border },
  
  selectBtn: { backgroundColor: COLORS.green, paddingHorizontal: 15, paddingVertical: 12, borderRadius: 14, flexDirection: 'row', alignItems: 'center', marginLeft: 15 },
  selectBtnTxt: { color: COLORS.white, fontWeight: '900', fontSize: 13, marginRight: 4 }
});