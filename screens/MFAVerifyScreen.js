import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert,
  KeyboardAvoidingView, Platform, ScrollView, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MFA } from '../lib/mfa';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER = '#F0F1F3';
const RED    = '#EF4444';

// ── MFA Challenge Screen ──────────────────────────────────────────────────────
// Shown after signInWithPassword when the user has a TOTP factor enrolled.
// Props (route.params): { factorId, onboardingDone }
// Navigation: on success → 'MainApp' or 'Onboarding'

export default function MFAVerifyScreen({ navigation, route }) {
  const { factorId: routeFactorId, onboardingDone } = route.params ?? {};

  const [code, setCode]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [factorId, setFactorId] = useState(routeFactorId || null);

  // If factorId wasn't passed, fetch the first enrolled factor
  useEffect(() => {
    if (!factorId) {
      MFA.getFactors()
        .then(factors => {
          if (factors.length > 0) setFactorId(factors[0].id);
        })
        .catch(() => {});
    }
  }, [factorId]);

  const handleVerify = async () => {
    const trimmed = code.replace(/\s/g, '');
    if (trimmed.length !== 6 || !/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    if (!factorId) {
      setError('Could not find your MFA factor. Please sign in again.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await MFA.challengeAndVerify(factorId, trimmed);
      if (onboardingDone) {
        navigation.replace('MainApp');
      } else {
        navigation.replace('Onboarding');
      }
    } catch (e) {
      setError(
        e.message?.includes('Invalid TOTP')
          ? 'Incorrect code. Check your authenticator and try again.'
          : 'Verification failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={s.header}>
            <View style={s.iconRing}>
              <Feather name="shield" size={28} color={GREEN} />
            </View>
            <Text style={s.title}>Two-Factor Verification</Text>
            <Text style={s.subtitle}>
              Open your authenticator app and enter the 6-digit code for Snippd.
            </Text>
          </View>

          {/* Code input */}
          <View style={s.card}>
            <Text style={s.label}>Authentication Code</Text>
            <TextInput
              style={[s.codeInput, error && s.inputErr]}
              placeholder="000 000"
              placeholderTextColor="#C4C9D6"
              value={code}
              onChangeText={(v) => {
                setCode(v.replace(/[^0-9]/g, '').slice(0, 6));
                setError('');
              }}
              keyboardType="number-pad"
              maxLength={6}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleVerify}
            />
            {error ? <Text style={s.errTxt}>{error}</Text> : null}

            <TouchableOpacity
              style={[s.cta, loading && s.ctaDisabled]}
              onPress={handleVerify}
              disabled={loading || code.replace(/\s/g, '').length < 6}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color={WHITE} />
              ) : (
                <Text style={s.ctaTxt}>Verify</Text>
              )}
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={s.backRow}
            onPress={async () => {
              const { supabase } = await import('../lib/supabase');
              await supabase.auth.signOut({ scope: 'global' });
              navigation.replace('Auth');
            }}
          >
            <Feather name="arrow-left" size={14} color={GRAY} />
            <Text style={s.backTxt}>Back to sign in</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  scroll:     { flexGrow: 1, paddingHorizontal: 24, paddingTop: 60, paddingBottom: 40 },
  header:     { alignItems: 'center', marginBottom: 32 },
  iconRing: {
    width: 68, height: 68, borderRadius: 34,
    backgroundColor: '#E8F9EF', alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title:    { fontSize: 22, fontWeight: 'bold', color: NAVY, marginBottom: 8, textAlign: 'center' },
  subtitle: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 20, paddingHorizontal: 10 },
  card: {
    backgroundColor: WHITE, borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08, shadowRadius: 16, elevation: 4,
  },
  label:     { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 10 },
  codeInput: {
    backgroundColor: OFF_WHITE, borderRadius: 14, borderWidth: 1.5,
    borderColor: BORDER, paddingHorizontal: 20, paddingVertical: 18,
    fontSize: 28, color: NAVY, letterSpacing: 10, textAlign: 'center',
    fontWeight: 'bold',
  },
  inputErr:  { borderColor: RED, backgroundColor: '#FEF2F2' },
  errTxt:    { fontSize: 12, color: RED, marginTop: 8, fontWeight: 'normal' },
  cta: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginTop: 20,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35, shadowRadius: 8, elevation: 5,
  },
  ctaDisabled: { backgroundColor: '#4CAF50', shadowOpacity: 0.1 },
  ctaTxt:      { color: WHITE, fontSize: 16, fontWeight: 'bold' },
  backRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, marginTop: 24,
  },
  backTxt: { fontSize: 13, color: GRAY },
});
