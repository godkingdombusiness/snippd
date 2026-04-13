import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Dimensions, Animated, StatusBar, ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');

const BRAND = {
  primaryGreen: '#0C9E54',
  darkSection:  '#04361D',
  white:        '#FFFFFF',
  bgLight:      '#F8FAFC',
  greyText:     '#64748B',
  border:       '#E2E8F0',
  blue:         '#0071CE',
  gold:         '#B58900'
};

export default function OnboardingScreen({ navigation }) {
  const [step, setStep] = useState(0);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const walletScale = useRef(new Animated.Value(0)).current;

  // DIETITIAN-APPROVED DATA SCHEMA
  const [formData, setFormData] = useState({
    household_members: [], // e.g. ['adult', 'child']
    health_constraints: [],
    cooking_style: 'Efficiency',
    dislikes: [],
    budget_target: 150,
    credits: 0
  });

  const triggerTransition = (nextStep) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => {
      setStep(nextStep);
      Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }).start();
    });
  };

  const initializeWallet = () => {
    setStep(4); // Move to "Calculating"
    setTimeout(() => {
      Animated.spring(walletScale, { toValue: 1, friction: 5, useNativeDriver: true }).start();
      setFormData(prev => ({ ...prev, credits: 20 }));
      setTimeout(() => triggerTransition(5), 2500); // Move to Paywall
    }, 1500);
  };

  const handleFinish = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.from('profiles').update({
        onboarding_complete: true,
        credits_balance: 20,
        household_members: formData.household_members,
        preferences: {
          health_constraints: formData.health_constraints,
          cooking_style: formData.cooking_style,
          dislikes: formData.dislikes,
        },
      }).eq('user_id', user.id);

      if (error) throw error;
      navigation.navigate('MainApp');
    } catch (e) {
      console.error('Onboarding Save Error:', e);
      navigation.navigate('MainApp');
    }
  };

  const renderStep = () => {
    switch (step) {
      case 0: return (
        <View style={styles.stepWrapper}>
          <Text style={styles.stepTitle}>Who are we planning for this week?</Text>
          <Text style={styles.stepSub}>Biological needs vary. Tell us who's at the table.</Text>
          <View style={styles.grid}>
            {[
              { id: 'infant', label: 'Infant', icon: 'baby-bottle' },
              { id: 'child', label: 'Child/Teen', icon: 'human-child' },
              { id: 'adult', label: 'Adult', icon: 'human-male-female' },
              { id: 'senior', label: 'Senior', icon: 'human-cane' }
            ].map(type => (
              <TouchableOpacity 
                key={type.id} 
                style={[styles.bigPill, formData.household_members.includes(type.id) && styles.pillActive]}
                onPress={() => {
                  const current = formData.household_members;
                  setFormData({...formData, household_members: current.includes(type.id) ? current.filter(i => i !== type.id) : [...current, type.id]});
                }}
              >
                <MaterialCommunityIcons name={type.icon} size={28} color={formData.household_members.includes(type.id) ? BRAND.primaryGreen : BRAND.darkSection} />
                <Text style={[styles.pillTxt, formData.household_members.includes(type.id) && styles.pillTxtActive]}>{type.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
      case 1: return (
        <View style={styles.stepWrapper}>
          <Text style={styles.stepTitle}>Any dietary guardrails?</Text>
          <Text style={styles.stepSub}>We'll automatically filter out deals that don't fit.</Text>
          <View style={styles.grid}>
            {['Gluten-Free', 'Low Sodium', 'Diabetic-Friendly', 'Dairy-Free', 'Keto', 'Plant-Based'].map(goal => (
              <TouchableOpacity 
                key={goal} 
                style={[styles.smallPill, formData.health_constraints.includes(goal) && styles.pillActive]}
                onPress={() => {
                  const current = formData.health_constraints;
                  setFormData({...formData, health_constraints: current.includes(goal) ? current.filter(g => g !== goal) : [...current, goal]});
                }}
              >
                <Text style={[styles.pillTxt, formData.health_constraints.includes(goal) && styles.pillTxtActive]}>{goal}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
      case 2: return (
        <View style={styles.stepWrapper}>
          <Text style={styles.stepTitle}>What’s your Tuesday night vibe?</Text>
          <Text style={styles.stepSub}>We adjust protein anchors based on your energy.</Text>
          {[
            { id: 'Chef', label: 'Chef Mode', sub: 'I enjoy the 45-min process.' },
            { id: 'Efficiency', label: 'Efficiency', sub: 'Keep it simple (20-30 mins).' },
            { id: 'Survival', label: 'Survival Mode', sub: '10-min prep or heat-and-eat.' }
          ].map(opt => (
             <TouchableOpacity 
                key={opt.id} 
                style={[styles.listOption, formData.cooking_style === opt.id && styles.listOptionActive]}
                onPress={() => setFormData({...formData, cooking_style: opt.id})}
             >
                <View>
                  <Text style={[styles.listOptionTxt, formData.cooking_style === opt.id && styles.listOptionTxtActive]}>{opt.label}</Text>
                  <Text style={styles.listOptionSub}>{opt.sub}</Text>
                </View>
                {formData.cooking_style === opt.id && <Feather name="check-circle" size={24} color={BRAND.primaryGreen} />}
             </TouchableOpacity>
          ))}
        </View>
      );
      case 3: return (
        <View style={styles.stepWrapper}>
          <Text style={styles.stepTitle}>The "Never Again" List</Text>
          <Text style={styles.stepSub}>What should never make it into your cart?</Text>
          <View style={styles.grid}>
            {['Mushrooms', 'Cilantro', 'Olives', 'Shellfish', 'Pork', 'Spicy Foods'].map(item => (
              <TouchableOpacity 
                key={item} 
                style={[styles.smallPill, formData.dislikes.includes(item) && { borderColor: '#EF4444', backgroundColor: '#FEF2F2' }]}
                onPress={() => {
                  const current = formData.dislikes;
                  setFormData({...formData, dislikes: current.includes(item) ? current.filter(g => g !== item) : [...current, item]});
                }}
              >
                <Text style={[styles.pillTxt, formData.dislikes.includes(item) && { color: '#EF4444' }]}>{item}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      );
      case 4: return (
        <View style={[styles.stepWrapper, { alignItems: 'center' }]}>
          <Text style={[styles.stepTitle, { textAlign: 'center' }]}>Initializing Your Concierge...</Text>
          <Text style={[styles.stepSub, { textAlign: 'center' }]}>Applying age filters and Survival-Mode preferences to 4,000+ local deals.</Text>
          <Animated.View style={[styles.walletCard, { transform: [{ scale: walletScale }] }]}>
            <MaterialCommunityIcons name="wallet-giftcard" size={80} color={BRAND.primaryGreen} />
            <Text style={styles.walletPrice}>+20 CREDITS</Text>
            <Text style={styles.walletSub}>Welcome Gift Added</Text>
          </Animated.View>
        </View>
      );
      case 5: return (
        <ScrollView style={styles.stepWrapper} showsVerticalScrollIndicator={false}>
          <Text style={styles.stepTitle}>Choose Your Path</Text>
          <Text style={styles.stepSub}>Your profile is ready. How would you like to plan?</Text>
          
          <TouchableOpacity style={styles.tierCard}>
            <View style={styles.tierHeader}>
              <Text style={styles.tierName}>PLUS MEMBER</Text>
              <Text style={styles.tierPrice}>$4.99/mo</Text>
            </View>
            <Text style={styles.tierDesc}>• 15 Monthly Credits{'\n'}• Deep Personalization{'\n'}• Unlimited Store Sync</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.tierCard, { borderColor: BRAND.gold, backgroundColor: '#FFFDF0' }]}>
            <View style={styles.tierHeader}>
              <Text style={[styles.tierName, { color: BRAND.gold }]}>FOUNDER (LIFETIME)</Text>
              <Text style={styles.tierPrice}>$99</Text>
            </View>
            <Text style={styles.tierDesc}>• UNLIMITED EVERYTHING{'\n'}• No Monthly Fees Forever{'\n'}• First 2,000 Members Only</Text>
            <View style={styles.scarcityBar}>
               <View style={[styles.scarcityFill, { width: '85%' }]} />
            </View>
            <Text style={styles.scarcityTxt}>1,842 / 2,000 Spots Claimed</Text>
          </TouchableOpacity>

          <TouchableOpacity style={{ alignSelf: 'center', marginTop: 20 }} onPress={handleFinish}>
             <Text style={{ color: BRAND.greyText, fontWeight: 'bold' }}>Continue with my 20 Free Credits</Text>
          </TouchableOpacity>
        </ScrollView>
      );
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <SafeAreaView style={{ flex: 1 }}>
        {step < 4 && (
          <View style={styles.progressHeader}>
            <View style={styles.progressBarBg}>
              <Animated.View style={[styles.progressBarFill, { width: `${((step + 1) / 5) * 100}%` }]} />
            </View>
          </View>
        )}

        <Animated.View style={[styles.main, { opacity: fadeAnim }]}>
          {renderStep()}
        </Animated.View>

        {step < 4 && (
          <View style={styles.footer}>
            <TouchableOpacity 
              style={styles.nextBtn} 
              onPress={() => step < 3 ? triggerTransition(step + 1) : initializeWallet()}
            >
              <Text style={styles.nextBtnTxt}>{step === 3 ? 'Finalize My Profile' : 'Continue'}</Text>
              <Feather name="arrow-right" size={20} color={BRAND.white} />
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.white },
  progressHeader: { paddingHorizontal: 30, paddingTop: 20 },
  progressBarBg: { height: 6, backgroundColor: BRAND.border, borderRadius: 3, marginBottom: 15 },
  progressBarFill: { height: '100%', backgroundColor: BRAND.primaryGreen, borderRadius: 3 },
  main: { flex: 1, paddingHorizontal: 30, justifyContent: 'center' },
  stepWrapper: { width: '100%' },
  stepTitle: { fontSize: 32, fontWeight: '900', color: BRAND.darkSection, letterSpacing: -1, lineHeight: 36 },
  stepSub: { fontSize: 16, color: BRAND.greyText, marginTop: 10, marginBottom: 30, lineHeight: 22 },
  
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  bigPill: { width: (width - 72) / 2, padding: 20, borderRadius: 24, borderWidth: 2, borderColor: BRAND.border, alignItems: 'center', gap: 10 },
  smallPill: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 30, borderWidth: 2, borderColor: BRAND.border },
  pillActive: { borderColor: BRAND.primaryGreen, backgroundColor: '#F0FDF4' },
  pillTxt: { fontSize: 14, fontWeight: '800', color: BRAND.darkSection },
  pillTxtActive: { color: BRAND.primaryGreen },

  listOption: { padding: 20, borderRadius: 24, borderWidth: 2, borderColor: BRAND.border, marginBottom: 15, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listOptionActive: { borderColor: BRAND.primaryGreen, backgroundColor: '#F0FDF4' },
  listOptionTxt: { fontSize: 18, fontWeight: '900', color: BRAND.darkSection },
  listOptionSub: { fontSize: 13, color: BRAND.greyText, marginTop: 2 },

  walletCard: { marginTop: 40, padding: 40, borderRadius: 30, backgroundColor: '#F0FDF4', alignItems: 'center', borderWidth: 1, borderColor: BRAND.primaryGreen },
  walletPrice: { fontSize: 32, fontWeight: '900', color: BRAND.primaryGreen, marginTop: 10 },
  walletSub: { fontSize: 14, color: BRAND.greyText, fontWeight: '600' },

  tierCard: { padding: 24, borderRadius: 28, borderWidth: 2, borderColor: BRAND.border, marginBottom: 16 },
  tierHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  tierName: { fontSize: 14, fontWeight: '900', color: BRAND.greyText, letterSpacing: 1 },
  tierPrice: { fontSize: 24, fontWeight: '900', color: BRAND.darkSection },
  tierDesc: { fontSize: 14, color: BRAND.greyText, lineHeight: 22, fontWeight: '600' },
  scarcityBar: { height: 8, backgroundColor: BRAND.border, borderRadius: 4, marginTop: 15, overflow: 'hidden' },
  scarcityFill: { height: '100%', backgroundColor: BRAND.gold },
  scarcityTxt: { fontSize: 11, fontWeight: '800', color: BRAND.gold, marginTop: 6, textAlign: 'center' },

  footer: { padding: 30 },
  nextBtn: { backgroundColor: BRAND.darkSection, paddingVertical: 20, borderRadius: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  nextBtnTxt: { color: BRAND.white, fontSize: 18, fontWeight: '900' }
});