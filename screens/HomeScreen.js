import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, StatusBar, RefreshControl, Alert, Platform,
  LayoutAnimation, UIManager,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather, MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

const BRAND = {
  primaryGreen: '#0C9E54',
  darkSection:  '#04361D',
  white:        '#FFFFFF',
  bgLight:      '#F8FAFC',
  greyText:     '#64748B',
  border:       '#E2E8F0',
  mintPop:      '#C5FFBC',
  lightGreen:   '#E8F8F0',
};

const CHART_COLORS = {
  green: '#10B981',
  amber: '#F59E0B',
  base:  '#E2E8F0',
};

const CARD_SHADOW = {
  shadowColor: "#0D1B4B",
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

export default function HomeScreen({ navigation }) {
  const [refreshing, setRefreshing] = useState(false);
  const [budget, setBudget] = useState({ spent: 0, goal: 150.00 });
  const [savingsTotal, setSavingsTotal] = useState(0);
  const [initials, setInitials] = useState('??');
  const [credits, setCredits] = useState(0);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('profiles')
        .select('full_name, weekly_budget, weekly_spent, savings_total, preferences')
        .eq('user_id', user.id)
        .single();

      if (data) {
        setBudget({
          spent: (data.weekly_spent || 0) / 100,
          goal: (data.weekly_budget || 15000) / 100,
        });
        setSavingsTotal((data.savings_total || 0) / 100);
        setCredits(data.preferences?.credit_balance || 0);
        
        if (data.full_name) {
          const parts = data.full_name.trim().split(' ');
          setInitials((parts[0]?.[0] || '') + (parts[1]?.[0] || ''));
        }
      }
    } catch (e) { console.error(e); }
    setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => { fetchProfile(); }, [fetchProfile]));

  const handlePress = (routeName, params = {}) => {
    if (navigation) navigation.navigate(routeName, params);
  };

  const handleResetWeek = () => {
    Alert.alert(
      "Start New Week?",
      "Ready to clear your spending and start a fresh strategy?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Start Fresh",
          onPress: async () => {
            const { data: { user } } = await supabase.auth.getUser();
            await supabase.from('profiles').update({ weekly_spent: 0 }).eq('user_id', user.id);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setBudget(prev => ({ ...prev, spent: 0 }));
          }
        }
      ]
    );
  };

  const readyToSpend = budget.goal - budget.spent;

  // ── DYNAMIC WORKFLOW LOGIC ──
  // Determines what the user sees based on their progress
  const getWorkflowState = () => {
    if (budget.spent === 0) {
      return {
        title: "Plan Your Week",
        sub: "Start here to build your grocery strategy.",
        icon: "play-circle",
        color: BRAND.primaryGreen,
        action: () => handlePress('DiscoverTab')
      };
    } else if (readyToSpend > 0) {
      return {
        title: "Continue Strategy",
        sub: `You have $${readyToSpend.toFixed(2)} remaining.`,
        icon: "arrow-right-circle",
        color: BRAND.darkSection,
        action: () => handlePress('List')
      };
    } else {
      return {
        title: "Week Complete!",
        sub: "Tap to reset and start next week's shop.",
        icon: "refresh-cw",
        color: "#B45309", // Amber color for reset
        action: handleResetWeek
      };
    }
  };

  const workflow = getWorkflowState();

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />

      {/* HEADER */}
      <SafeAreaView style={styles.headerShell} edges={['top']}>
        <View style={styles.headerInner}>
          <TouchableOpacity style={styles.headerAvatar} onPress={() => handlePress('ProfileTab')}>
            <Text style={styles.avatarTxt}>{initials}</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Command Center</Text>
          <TouchableOpacity onPress={() => handlePress('Wins')}>
            <MaterialCommunityIcons name="bell-outline" size={24} color={BRAND.darkSection} />
          </TouchableOpacity>
        </View>
        <View style={styles.headerSearchRow}>
          <TouchableOpacity style={styles.headerSearch} onPress={() => handlePress('DiscoverTab')}>
            <Ionicons name="search" size={18} color={BRAND.greyText} />
            <Text style={styles.searchPlaceholder}>Search strategies...</Text>
          </TouchableOpacity>
          <View style={styles.headerCreditPill}>
            <Text style={styles.creditPillTxt}>{credits} Credits</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchProfile();}} tintColor={BRAND.primaryGreen} />}
      >

        {/* 1. DYNAMIC GUIDED BUTTON (The "Where to Start" Fix) */}
        <TouchableOpacity 
          style={[styles.guideCard, { borderColor: workflow.color }]} 
          onPress={workflow.action}
          activeOpacity={0.9}
        >
          <LinearGradient 
            colors={[workflow.color, workflow.color + 'DD']} 
            style={styles.guideGradient}
            start={{x: 0, y: 0}} end={{x: 1, y: 0}}
          >
            <View style={styles.guideTextCol}>
              <Text style={styles.guideTitle}>{workflow.title}</Text>
              <Text style={styles.guideSub}>{workflow.sub}</Text>
            </View>
            <Feather name={workflow.icon} size={28} color={BRAND.white} />
          </LinearGradient>
        </TouchableOpacity>

        {/* 2. HERO CARD */}
        <TouchableOpacity activeOpacity={0.9} onPress={() => handlePress('BudgetDashboard')}>
          <LinearGradient colors={[BRAND.primaryGreen, '#0A8749']} style={styles.heroCard}>
            <View style={styles.heroHeader}>
              <View>
                <Text style={styles.heroLabel}>READY TO SPEND</Text>
                <View style={styles.heroMainRow}>
                  <Text style={styles.currency}>$</Text>
                  <Text style={styles.amountMain}>{Math.floor(readyToSpend)}</Text>
                  <Text style={styles.amountCents}>.{(readyToSpend % 1).toFixed(2).split('.')[1]}</Text>
                </View>
              </View>
              <View style={styles.heroSavedBadge}>
                <Text style={styles.heroSavedTxt}>Saved ${savingsTotal.toFixed(2)}</Text>
              </View>
            </View>
            <Text style={styles.heroSubText}>Weekly Strategy Balance</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* DATA VIZ GRID */}
        <View style={styles.vizGridRow}>
          <TouchableOpacity style={styles.vizCard} onPress={() => handlePress('CategoryInsight')}>
            <Text style={styles.vizTitle}>Spending</Text>
            <View style={styles.chartPlaceholder}><Text style={styles.chartTxt}>Chart Area</Text></View>
            <Text style={styles.vizLabelSub}>Spent ${budget.spent.toFixed(0)}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.vizCard} onPress={() => handlePress('Wins')}>
            <Text style={styles.vizTitle}>Efficiency</Text>
            <View style={styles.chartPlaceholder}><Text style={styles.chartTxt}>Donut Area</Text></View>
            <Text style={styles.vizLabelSub}>Target: 80%+</Text>
          </TouchableOpacity>
        </View>

        {/* QUICK ACTIONS */}
        <View style={styles.newActionHub}>
            <HubAction icon="list" label="My List" onPress={() => handlePress('List')} />
            <HubAction icon="zap" label="Deals" onPress={() => handlePress('DiscoverTab')} />
            <HubAction icon="award" label="Wins" onPress={() => handlePress('Wins')} />
            <HubAction icon="video" label="Studio" onPress={() => handlePress('StudioTab')} />
        </View>

        {/* BANNERS */}
        <Banner icon="video-outline" title="Join the Studio" sub="Create content & earn credits." onPress={() => handlePress('StudioTab')} />
        <Banner icon="barcode-scan" title="Snap My Receipt" sub="Earn 5 credits instantly." onPress={() => handlePress('ReceiptUpload')} />

        <View style={{ height: 120 }} />
      </ScrollView>
    </View>
  );
}

// ── SHARED COMPONENTS ──
const HubAction = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.hubActionItem} onPress={onPress} activeOpacity={0.8}>
    <View style={styles.hubActionSquare}><Feather name={icon} size={24} color={BRAND.primaryGreen} /></View>
    <Text style={styles.hubActionLabel}>{label}</Text>
  </TouchableOpacity>
);

const Banner = ({ icon, title, sub, onPress }) => (
  <TouchableOpacity style={styles.unifiedBanner} onPress={onPress}>
    <View style={styles.bannerIconContainer}><MaterialCommunityIcons name={icon} size={22} color={BRAND.primaryGreen} /></View>
    <View style={{ flex: 1 }}>
      <Text style={styles.bannerTitle}>{title}</Text>
      <Text style={[styles.bannerSub, {color: BRAND.primaryGreen}]}>{sub}</Text>
    </View>
    <Feather name="chevron-right" size={20} color={BRAND.primaryGreen} />
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgLight },
  headerShell: { backgroundColor: BRAND.white, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: BRAND.border },
  headerInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 10 },
  headerAvatar: { width: 34, height: 34, borderRadius: 10, backgroundColor: BRAND.darkSection, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: BRAND.white, fontWeight: 'bold', fontSize: 12 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: BRAND.darkSection },
  headerSearchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 15, paddingHorizontal: 20, gap: 12 },
  headerSearch: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', height: 40, borderRadius: 12, paddingHorizontal: 12 },
  searchPlaceholder: { color: BRAND.greyText, marginLeft: 8, fontSize: 13 },
  headerCreditPill: { backgroundColor: BRAND.mintPop, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  creditPillTxt: { color: BRAND.primaryGreen, fontSize: 11, fontWeight: 'bold' },
  scrollBody: { paddingHorizontal: 20 },

  // GUIDE CARD STYLES
  guideCard: { marginTop: 20, borderRadius: 20, overflow: 'hidden', borderWidth: 2, ...CARD_SHADOW },
  guideGradient: { padding: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guideTextCol: { flex: 1 },
  guideTitle: { color: BRAND.white, fontSize: 20, fontWeight: 'bold', marginBottom: 2 },
  guideSub: { color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: 'normal' },

  heroCard: { borderRadius: 24, padding: 24, marginTop: 15, ...CARD_SHADOW },
  heroHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  heroLabel: { fontSize: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 'bold', letterSpacing: 1 },
  heroMainRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 4 },
  currency: { fontSize: 22, color: BRAND.white, marginTop: 4, fontWeight: 'bold' },
  amountMain: { fontSize: 52, color: BRAND.white, letterSpacing: -2, fontWeight: 'bold' },
  amountCents: { fontSize: 22, color: BRAND.white, marginTop: 4, fontWeight: 'bold' },
  heroSavedBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  heroSavedTxt: { color: BRAND.white, fontSize: 11, fontWeight: 'bold' },
  heroSubText: { fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 15 },
  
  vizGridRow: { flexDirection: 'row', marginTop: 15, gap: 12 },
  vizCard: { flex: 1, backgroundColor: BRAND.white, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: BRAND.border, ...CARD_SHADOW },
  vizTitle: { fontSize: 11, fontWeight: 'bold', color: BRAND.darkSection, marginBottom: 10 },
  chartPlaceholder: { height: 60, backgroundColor: BRAND.bgLight, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  chartTxt: { fontSize: 10, color: BRAND.greyText },
  vizLabelSub: { fontSize: 9, color: BRAND.greyText, marginTop: 8 },

  newActionHub: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 25, marginBottom: 10 },
  hubActionItem: { alignItems: 'center' },
  hubActionSquare: { width: 62, height: 62, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 8, borderWidth: 1, borderColor: BRAND.border, backgroundColor: 'white', ...CARD_SHADOW },
  hubActionLabel: { fontSize: 12, color: BRAND.darkSection, fontWeight: 'bold' },
  unifiedBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white, padding: 16, borderRadius: 20, borderWidth: 1.5, borderColor: BRAND.primaryGreen, marginTop: 12 },
  bannerIconContainer: { width: 40, height: 40, borderRadius: 10, backgroundColor: BRAND.mintPop, alignItems: 'center', justifyContent: 'center', marginRight: 15 },
  bannerTitle: { fontSize: 15, color: BRAND.darkSection, fontWeight: 'bold' },
  bannerSub: { fontSize: 12 },
});