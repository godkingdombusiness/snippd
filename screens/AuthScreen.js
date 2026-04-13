import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
  StatusBar, Animated, Dimensions, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';
import { MFA } from '../lib/mfa';
import { Feather } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

// ── Brand palette ─────────────────────────────────────────────────────────────
const MINT        = '#C5FFBC';
const NAVY        = '#172250';
const GREEN       = '#0C9E54';
const CORAL       = '#FB5B5B';
const WHITE       = '#FFFFFF';
const BORDER      = '#DDE8E3';
const PLACEHOLDER = '#9BADB5';
const RED         = '#F87171';

export default function AuthScreen({ navigation }) {
  const [isLogin, setIsLogin]           = useState(true);
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading]           = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedField, setFocusedField] = useState(null);

  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const validate = () => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }
    if (password.length < 8) {
      Alert.alert('Weak Password', 'Password must be at least 8 characters.');
      return false;
    }
    if (!isLogin && password !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return false;
    }
    return true;
  };

  const createProfileIfNeeded = async (user) => {
    try {
      const { data: existing } = await supabase
        .from('profiles')
        .select('user_id, household_members')
        .eq('user_id', user.id)
        .single();

      if (!existing) {
        await supabase.from('profiles').insert([{
          user_id: user.id,
          email: user.email,
          full_name: user.email?.split('@')[0],
          weekly_budget: 15000,
        }]);
        return false; // New user -> needs onboarding
      }
      // If household_members is null, they haven't finished the new onboarding
      return existing.household_members !== null;
    } catch { return false; }
  };

  const handleForgotPassword = () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      Alert.alert(
        'Enter Your Email',
        'Type your email address in the field above, then tap Forgot?',
      );
      return;
    }
    Alert.alert(
      'Reset Password',
      `Send a reset link to ${trimmed}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send Link',
          onPress: async () => {
            try {
              const { error } = await supabase.auth.resetPasswordForEmail(trimmed);
              if (error) throw error;
              Alert.alert(
                'Check Your Inbox',
                `A password reset link was sent to ${trimmed}. Check your spam folder if you don't see it.`,
              );
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ],
    );
  };

  const handleAuth = async () => {
    if (!validate()) return;
    setLoading(true);

    try {
      if (isLogin) {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(), password,
        });
        if (error) throw error;

        if (data?.session?.access_token) {
          tracker.setAccessToken(data.session.access_token);
        }

        const isFullyOnboarded = await createProfileIfNeeded(data.user);
        
        // MFA CHECK
        const challengeRequired = await MFA.isChallengeRequired();
        if (challengeRequired) {
          const factors = await MFA.getFactors();
          navigation.navigate('MFAVerify', { factorId: factors[0]?.id, isFullyOnboarded });
          return;
        }

        if (isFullyOnboarded) {
          navigation.navigate('MainApp');
        } else {
          navigation.navigate('Onboarding');
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim().toLowerCase(), password,
        });
        if (error) throw error;
        
        if (data.user) {
          await createProfileIfNeeded(data.user);
          navigation.navigate('Onboarding');
        }
      }
    } catch (err) {
      Alert.alert('Auth Failed', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      
      {/* Decorative Brand Blobs */}
      <View style={styles.blobTR} />
      <View style={styles.blobBL} />

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView 
          contentContainerStyle={styles.scroll} 
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
            
            <SafeAreaView edges={['top']}>
              <View style={styles.hero}>
                <View style={styles.logoWrap}>
                  <Image 
                    source={require('../assets/Snippd Green Logo.png')} 
                    style={styles.logo} 
                    resizeMode="contain" 
                  />
                </View>
                <Text style={styles.brand}>Snippd<Text style={{color: GREEN}}>™</Text></Text>
                <Text style={styles.tagline}>Real Savings. Real Simple.</Text>
              </View>
            </SafeAreaView>

            <View style={styles.card}>
              {/* SLICK TOGGLE */}
              <View style={styles.toggleContainer}>
                <TouchableOpacity 
                  style={[styles.toggleBtn, isLogin && styles.toggleBtnActive]} 
                  onPress={() => setIsLogin(true)}
                >
                  <Text style={[styles.toggleTxt, isLogin && styles.toggleTxtActive]}>Sign In</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.toggleBtn, !isLogin && styles.toggleBtnActive]} 
                  onPress={() => setIsLogin(false)}
                >
                  <Text style={[styles.toggleTxt, !isLogin && styles.toggleTxtActive]}>Register</Text>
                </TouchableOpacity>
              </View>

              {/* EMAIL INPUT */}
              <View style={styles.field}>
                <Text style={styles.label}>Email Address</Text>
                <TextInput
                  style={[styles.input, focusedField === 'email' && styles.inputFocused]}
                  placeholder="you@example.com"
                  placeholderTextColor={PLACEHOLDER}
                  value={email}
                  onChangeText={setEmail}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
              </View>

              {/* PASSWORD INPUT */}
              <View style={styles.field}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>Password</Text>
                  {isLogin && (
                    <TouchableOpacity onPress={handleForgotPassword}>
                      <Text style={styles.forgotTxt}>Forgot?</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <View style={styles.pwWrap}>
                  <TextInput
                    style={[styles.input, focusedField === 'pw' && styles.inputFocused]}
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocusedField('pw')}
                    onBlur={() => setFocusedField(null)}
                  />
                  <TouchableOpacity style={styles.showBtn} onPress={() => setShowPassword(!showPassword)}>
                    <Feather name={showPassword ? "eye-off" : "eye"} size={18} color={PLACEHOLDER} />
                  </TouchableOpacity>
                </View>
              </View>

              {!isLogin && (
                <View style={styles.field}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <TextInput
                    style={[styles.input, focusedField === 'cpw' && styles.inputFocused]}
                    placeholder="••••••••"
                    secureTextEntry={!showPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    onFocus={() => setFocusedField('cpw')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              )}

              {/* PREMIUM CTA */}
              <TouchableOpacity 
                style={[styles.cta, loading && { opacity: 0.7 }]} 
                onPress={handleAuth}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color={WHITE} />
                ) : (
                  <Text style={styles.ctaTxt}>{isLogin ? 'Enter Command Center' : 'Create My Account'}</Text>
                )}
              </TouchableOpacity>
              
              <Text style={styles.legalTxt}>
                No credit card required. Secure 256-bit encryption.
              </Text>
            </View>

            {/* STATUS PROTOCOL */}
            <View style={styles.statusBar}>
               {['Verified Deals', 'No Junk', 'Chef AI'].map(t => (
                 <View key={t} style={styles.statusItem}>
                   <View style={styles.dot} />
                   <Text style={styles.statusLabel}>{t.toUpperCase()}</Text>
                 </View>
               ))}
            </View>

          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: MINT },
  blobTR: { position: 'absolute', top: -100, right: -100, width: 300, height: 300, borderRadius: 150, backgroundColor: 'rgba(12,158,84,0.1)' },
  blobBL: { position: 'absolute', bottom: -50, left: -50, width: 250, height: 250, borderRadius: 125, backgroundColor: 'rgba(23,34,80,0.05)' },
  scroll: { paddingHorizontal: 25, paddingBottom: 50 },
  hero: { alignItems: 'center', paddingTop: 60, paddingBottom: 30 },
  logoWrap: { width: 80, height: 80, borderRadius: 24, backgroundColor: WHITE, alignItems: 'center', justifyContent: 'center', elevation: 10, shadowOpacity: 0.1, shadowRadius: 15 },
  logo: { width: 50, height: 50 },
  brand: { fontSize: 34, fontWeight: 'bold', color: NAVY, marginTop: 15, letterSpacing: -1 },
  tagline: { fontSize: 16, color: NAVY, opacity: 0.6, fontWeight: 'normal' },
  card: { backgroundColor: WHITE, borderRadius: 32, padding: 25, shadowColor: NAVY, shadowOpacity: 0.15, shadowRadius: 30, elevation: 10 },
  toggleContainer: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 20, padding: 5, marginBottom: 25 },
  toggleBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 16 },
  toggleBtnActive: { backgroundColor: NAVY },
  toggleTxt: { fontWeight: 'bold', color: PLACEHOLDER },
  toggleTxtActive: { color: WHITE },
  field: { marginBottom: 20 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, fontWeight: 'bold', color: NAVY, marginBottom: 8, letterSpacing: 0.5 },
  forgotTxt: { fontSize: 12, color: GREEN, fontWeight: 'bold' },
  input: { backgroundColor: '#F8FAFC', borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 18, fontSize: 16, color: NAVY, fontWeight: 'bold' },
  inputFocused: { borderColor: GREEN, backgroundColor: WHITE },
  pwWrap: { position: 'relative' },
  showBtn: { position: 'absolute', right: 15, top: 20 },
  cta: { backgroundColor: GREEN, paddingVertical: 20, borderRadius: 20, alignItems: 'center', borderBottomWidth: 4, borderBottomColor: '#097d42', marginTop: 10 },
  ctaTxt: { color: WHITE, fontSize: 18, fontWeight: 'bold' },
  legalTxt: { fontSize: 11, color: PLACEHOLDER, textAlign: 'center', marginTop: 15, fontWeight: 'normal' },
  statusBar: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 30 },
  statusItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginRight: 6 },
  statusLabel: { fontSize: 10, fontWeight: 'bold', color: NAVY, letterSpacing: 1 }
});