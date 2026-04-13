import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, ScrollView,
  Platform, StatusBar, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { MFA } from '../lib/mfa';

// Install if not present: npx expo install react-native-qrcode-svg react-native-svg
let QRCode = null;
try { QRCode = require('react-native-qrcode-svg').default; } catch (_) {}

const GREEN   = '#0C9E54';
const NAVY    = '#0D1B4B';
const WHITE   = '#FFFFFF';
const GRAY    = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER  = '#F0F1F3';
const RED     = '#EF4444';
const MINT    = '#E8F9EF';
const AMBER   = '#F59E0B';

// ── MFA Setup Screen ──────────────────────────────────────────────────────────
// Step 1: Show QR code (scan with authenticator) + Copy Secret fallback
// Step 2: User enters 6-digit code to confirm enrollment

export default function MFASetupScreen({ navigation }) {
  const [step, setStep]             = useState(1);
  const [enrollData, setEnrollData] = useState(null);
  const [code, setCode]             = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const [secretVisible, setSecretVisible] = useState(false);
  const [copied, setCopied]         = useState(false);

  useEffect(() => { startEnrollment(); }, []);

  const startEnrollment = async () => {
    setLoading(true);
    try {
      const data = await MFA.enroll();
      setEnrollData(data);
    } catch (e) {
      Alert.alert(
        'Setup Failed',
        'Could not start MFA enrollment. Please try again.',
        [{ text: 'Go Back', onPress: () => navigation.goBack() }]
      );
    } finally {
      setLoading(false);
    }
  };

  const handleCopySecret = async () => {
    if (!enrollData?.secret) return;
    try {
      // Share as cross-platform clipboard fallback
      await Share.share({ message: enrollData.secret });
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (_) {}
  };

  const handleVerify = async () => {
    const trimmed = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(trimmed)) {
      setError('Enter the 6-digit code from your authenticator app');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await MFA.confirmEnrollment(enrollData.factorId, trimmed);
      Alert.alert(
        'MFA Enabled',
        'Two-factor authentication is now active on your account.',
        [{ text: 'Done', onPress: () => navigation.goBack() }]
      );
    } catch (e) {
      setError(
        e.message?.includes('Invalid TOTP')
          ? 'Incorrect code. Open your authenticator app and try again.'
          : 'Verification failed. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading && !enrollData) {
    return (
      <SafeAreaView style={s.container} edges={['top', 'bottom']}>
        <View style={s.loader}>
          <ActivityIndicator size="large" color={GREEN} />
          <Text style={s.loaderTxt}>Setting up 2FA…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Nav */}
      <View style={s.nav}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.navTitle}>Set Up 2-Factor Auth</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Step indicator */}
        <View style={s.steps}>
          {['Scan QR code', 'Verify code'].map((label, i) => (
            <View key={i} style={s.stepWrap}>
              <View style={[s.stepDot, step > i && s.stepDotDone, step === i + 1 && s.stepDotActive]}>
                {step > i + 1
                  ? <Feather name="check" size={12} color={WHITE} />
                  : <Text style={s.stepNum}>{i + 1}</Text>
                }
              </View>
              <Text style={[s.stepLabel, step === i + 1 && s.stepLabelActive]}>{label}</Text>
              {i < 1 && <View style={s.stepLine} />}
            </View>
          ))}
        </View>

        {/* ── STEP 1: QR + Secret ─────────────────────────────────────────── */}
        {step === 1 && enrollData && (
          <>
            <View style={s.infoCard}>
              <Feather name="shield" size={16} color={GREEN} />
              <Text style={s.infoTxt}>
                Open Google Authenticator, Authy, or any TOTP app and scan the QR code below.
                Can't scan? Copy the secret key and enter it manually.
              </Text>
            </View>

            {/* QR Code */}
            <View style={s.qrCard}>
              <Text style={s.qrLabel}>SCAN WITH YOUR AUTHENTICATOR APP</Text>
              {QRCode && enrollData.qrCodeUri ? (
                <View style={s.qrWrap}>
                  <QRCode
                    value={enrollData.qrCodeUri}
                    size={200}
                    color={NAVY}
                    backgroundColor={WHITE}
                  />
                </View>
              ) : (
                <View style={s.qrFallback}>
                  <Feather name="alert-circle" size={28} color={AMBER} />
                  <Text style={s.qrFallbackTxt}>
                    QR display requires react-native-qrcode-svg.{'\n'}
                    Run: npx expo install react-native-qrcode-svg react-native-svg
                  </Text>
                </View>
              )}

              {/* Account info under QR */}
              <View style={s.qrMeta}>
                <Text style={s.qrMetaLabel}>ACCOUNT</Text>
                <Text style={s.qrMetaVal}>Snippd</Text>
              </View>
            </View>

            {/* Secret key card */}
            <View style={s.card}>
              <Text style={s.fieldLabel}>Manual entry — secret key</Text>
              <View style={s.secretRow}>
                <Text style={[s.mono, !secretVisible && s.redacted]} selectable={secretVisible}>
                  {secretVisible
                    ? enrollData.secret
                    : '•••• •••• •••• ••••'}
                </Text>
                <TouchableOpacity
                  style={s.iconBtn}
                  onPress={() => setSecretVisible(v => !v)}
                >
                  <Feather name={secretVisible ? 'eye-off' : 'eye'} size={16} color={GRAY} />
                </TouchableOpacity>
              </View>
              <Text style={s.hint}>Type: TOTP · Digits: 6 · Interval: 30s</Text>

              {/* Copy Secret button */}
              <TouchableOpacity
                style={[s.copyBtn, copied && s.copyBtnDone]}
                onPress={handleCopySecret}
                activeOpacity={0.85}
              >
                <Feather name={copied ? 'check' : 'copy'} size={14} color={copied ? WHITE : GREEN} />
                <Text style={[s.copyBtnTxt, copied && s.copyBtnTxtDone]}>
                  {copied ? 'Copied!' : 'Copy Secret Key'}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={s.cta}
              onPress={() => setStep(2)}
            >
              <Text style={s.ctaTxt}>I've added the account →</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ── STEP 2: Verify ──────────────────────────────────────────────── */}
        {step === 2 && (
          <>
            <View style={s.infoCard}>
              <Feather name="check-circle" size={16} color={GREEN} />
              <Text style={s.infoTxt}>
                Enter the 6-digit code shown in your authenticator app to confirm setup.
              </Text>
            </View>

            <View style={s.card}>
              <Text style={s.fieldLabel}>6-digit verification code</Text>
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
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleVerify}
              />
              {error ? <Text style={s.errTxt}>{error}</Text> : null}
            </View>

            <TouchableOpacity
              style={[s.cta, (loading || code.length < 6) && s.ctaDisabled]}
              onPress={handleVerify}
              disabled={loading || code.length < 6}
            >
              {loading
                ? <ActivityIndicator color={WHITE} />
                : <Text style={s.ctaTxt}>Enable 2-Factor Auth</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={s.backRow} onPress={() => setStep(1)}>
              <Feather name="arrow-left" size={14} color={GRAY} />
              <Text style={s.backTxt}>Back to QR code</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: OFF_WHITE },
  loader:     { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loaderTxt:  { fontSize: 14, color: GRAY },
  nav: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: WHITE,
  },
  backBtn:   { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  navTitle:  { fontSize: 16, fontWeight: 'bold', color: NAVY },
  scroll:    { paddingHorizontal: 20, paddingTop: 24 },

  steps: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', marginBottom: 28,
  },
  stepWrap:        { flexDirection: 'row', alignItems: 'center' },
  stepDot: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  stepDotActive:   { backgroundColor: GREEN },
  stepDotDone:     { backgroundColor: '#0A7A40' },
  stepNum:         { fontSize: 12, color: WHITE, fontWeight: 'bold' },
  stepLabel:       { fontSize: 11, color: GRAY, marginLeft: 6 },
  stepLabelActive: { color: GREEN, fontWeight: 'bold' },
  stepLine:        { width: 32, height: 2, backgroundColor: BORDER, marginHorizontal: 8 },

  infoCard: {
    flexDirection: 'row', gap: 10, backgroundColor: MINT,
    borderRadius: 12, padding: 14, marginBottom: 16,
    borderWidth: 1, borderColor: '#C8F0D5', alignItems: 'flex-start',
  },
  infoTxt: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 19 },

  // QR Code card
  qrCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 20,
    alignItems: 'center', marginBottom: 16,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 12, elevation: 3,
  },
  qrLabel: {
    fontSize: 9, fontWeight: 'bold', color: GRAY,
    letterSpacing: 1.2, marginBottom: 16,
  },
  qrWrap: {
    padding: 16, backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  qrFallback: {
    alignItems: 'center', gap: 10, padding: 20,
    backgroundColor: '#FFFBEB', borderRadius: 12,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  qrFallbackTxt: {
    fontSize: 12, color: '#92400E', textAlign: 'center', lineHeight: 18,
  },
  qrMeta: { alignItems: 'center', marginTop: 16 },
  qrMetaLabel: { fontSize: 9, fontWeight: 'bold', color: GRAY, letterSpacing: 1 },
  qrMetaVal:   { fontSize: 15, fontWeight: 'bold', color: NAVY, marginTop: 2 },

  // Secret card
  card: {
    backgroundColor: WHITE, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: BORDER, marginBottom: 16,
    shadowColor: NAVY, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  fieldLabel: {
    fontSize: 11, fontWeight: 'bold', color: GRAY,
    marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  secretRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  mono: {
    flex: 1, fontSize: 15, color: NAVY, letterSpacing: 1.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  redacted:   { letterSpacing: 2, color: GRAY },
  iconBtn:    { paddingLeft: 10 },
  hint:       { fontSize: 11, color: GRAY, marginBottom: 14, lineHeight: 17 },

  copyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 11, borderRadius: 10,
    borderWidth: 1.5, borderColor: GREEN, backgroundColor: WHITE,
  },
  copyBtnDone:    { backgroundColor: GREEN, borderColor: GREEN },
  copyBtnTxt:     { fontSize: 13, fontWeight: 'bold', color: GREEN },
  copyBtnTxtDone: { color: WHITE },

  cta: {
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 17,
    alignItems: 'center', marginBottom: 12,
    shadowColor: GREEN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 5,
  },
  ctaDisabled: { backgroundColor: '#4CAF50', shadowOpacity: 0.1 },
  ctaTxt:      { color: WHITE, fontSize: 16, fontWeight: 'bold' },

  codeInput: {
    backgroundColor: OFF_WHITE, borderRadius: 14, borderWidth: 1.5,
    borderColor: BORDER, paddingHorizontal: 20, paddingVertical: 18,
    fontSize: 28, color: NAVY, letterSpacing: 10, textAlign: 'center',
    fontWeight: 'bold',
  },
  inputErr: { borderColor: RED, backgroundColor: '#FEF2F2' },
  errTxt:   { fontSize: 12, color: RED, marginTop: 8 },
  backRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12 },
  backTxt:  { fontSize: 13, color: GRAY },
});
