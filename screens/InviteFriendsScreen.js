import { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const BORDER = '#F0F1F3';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const SHADOW_SM = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
};

const YOUR_PERKS = [
  { val: '50', label: 'Stash Credits — released once their first receipt is verified as real and physical', instant: false },
];

const FRIEND_PERKS = [
  { val: '25', label: 'Stash Credits — instantly on sign-up with your code', instant: true },
];

const HOW_STEPS = [
  { num: '1', title: 'Share your code', desc: 'Send your unique referral code to friends and family' },
  { num: '2', title: 'Friend signs up', desc: 'They download Snippd and create an account using your code' },
  { num: '3', title: 'Friend gets 25 credits', desc: 'Their 25 Stash Credits are added to their account immediately' },
  { num: '4', title: 'You earn 50 credits', desc: 'Your 50 credits are released once their first receipt is verified as real and unique' },
];

export default function InviteFriendsScreen({ navigation }) {
  const [email, setEmail]       = useState('');
  const [sending, setSending]   = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [codeLoading, setCodeLoading]   = useState(true);
  const [pendingBonus, setPendingBonus] = useState(0); // count of pending referrer credit releases

  const loadReferralData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('referral_code, username, full_name')
        .eq('user_id', user.id)
        .single();

      if (profile?.referral_code) {
        setReferralCode(profile.referral_code);
      } else {
        // Generate and save a referral code if none exists
        const base = (profile?.username || profile?.full_name || user.email?.split('@')[0] || 'USER')
          .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
        const code = `SNIPPD-${base}`;
        setReferralCode(code);
        await supabase.from('profiles').update({ referral_code: code }).eq('user_id', user.id);
      }

      // Count pending referrer credit releases
      const { count } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', user.id)
        .eq('referrer_credits_status', 'pending');
      setPendingBonus(count || 0);
    } catch (_) {
    } finally {
      setCodeLoading(false);
    }
  }, []);

  useEffect(() => { loadReferralData(); }, [loadReferralData]);

  const shareCode = async () => {
    if (!referralCode) return;
    try {
      await Share.share({
        message: `Join me on Snippd — the smarter way to save on groceries!\n\nUse my code ${referralCode} to get 25 free Stash Credits when you sign up.\n\nDownload at getsnippd.com`,
        title: 'Save on groceries with Snippd',
      });
    } catch (_) {}
  };

  const sendEmailInvite = async () => {
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Valid email required', 'Please enter a valid email address.');
      return;
    }
    setSending(true);
    try {
      // In production this would call a send-email Edge Function
      await new Promise(r => setTimeout(r, 800));
      setEmail('');
      Alert.alert(
        'Invite Sent',
        `An invitation has been sent to ${email.trim()}.\n\nYou will earn 50 Stash Credits once they sign up and submit their first verified receipt.`,
      );
    } catch (_) {
      Alert.alert('Error', 'Could not send invite. Please try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invite Friends</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={styles.pad}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>REFER AND EARN</Text>
            <Text style={styles.heroTitle}>Give 25 credits.{'\n'}Get 50.</Text>
            <Text style={styles.heroSub}>
              Friends get 25 Stash Credits the moment they sign up. You earn 50 credits once their first receipt is verified as real.
            </Text>
            {pendingBonus > 0 && (
              <View style={styles.pendingPill}>
                <Feather name="clock" size={12} color="#D97706" />
                <Text style={styles.pendingPillTxt}>
                  {pendingBonus} pending reward{pendingBonus !== 1 ? 's' : ''} — awaiting receipt verification
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Referral code */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Your Referral Code</Text>
          <View style={styles.codeCard}>
            {codeLoading ? (
              <ActivityIndicator color={GREEN} size="small" />
            ) : (
              <Text style={styles.code}>{referralCode || '—'}</Text>
            )}
            <TouchableOpacity
              style={[styles.shareBtn, (!referralCode || codeLoading) && styles.sendBtnDisabled]}
              onPress={shareCode}
              disabled={!referralCode || codeLoading}
            >
              <Text style={styles.shareBtnTxt}>Share Code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Email invite */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Invite by Email</Text>
          <View style={styles.emailCard}>
            <TextInput
              style={styles.emailInput}
              placeholder="friend@example.com"
              placeholderTextColor="#C4C9D6"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!email.trim() || sending) && styles.sendBtnDisabled]}
              onPress={sendEmailInvite}
              disabled={!email.trim() || sending}
            >
              {sending
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.sendBtnTxt}>Send Invite</Text>
              }
            </TouchableOpacity>
          </View>
        </View>

        {/* What you earn */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>What You Earn</Text>
          <View style={styles.card}>
            {YOUR_PERKS.map((perk, i) => (
              <View
                key={i}
                style={[styles.perkRow, i === YOUR_PERKS.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.perkVal}>
                  <Text style={styles.perkValTxt}>{perk.val}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.perkLabel}>{perk.label}</Text>
                  <View style={[styles.instantBadge, !perk.instant && styles.pendingBadge]}>
                    <Text style={[styles.instantBadgeTxt, !perk.instant && styles.pendingBadgeTxt]}>
                      {perk.instant ? 'INSTANT' : 'PENDING VERIFICATION'}
                    </Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* What your friend earns */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>What Your Friend Gets</Text>
          <View style={styles.card}>
            {FRIEND_PERKS.map((perk, i) => (
              <View
                key={i}
                style={[styles.perkRow, i === FRIEND_PERKS.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.perkVal}>
                  <Text style={styles.perkValTxt}>{perk.val}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.perkLabel}>{perk.label}</Text>
                  <View style={styles.instantBadge}>
                    <Text style={styles.instantBadgeTxt}>INSTANT</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Fraud Guard info card */}
        <View style={styles.pad}>
          <View style={styles.fraudCard}>
            <View style={styles.fraudHeader}>
              <Feather name="shield" size={15} color="#D97706" />
              <Text style={styles.fraudTitle}>Fraud Protection Active</Text>
            </View>
            <Text style={styles.fraudDesc}>
              Your 50 Stash Credits are held pending until Snippd's AI confirms your friend's first receipt is:
            </Text>
            {[
              'A real, physical grocery receipt (not digital or screenshots of screenshots)',
              'Unique — not previously submitted by any other user',
              'From a device and location different from your own account',
            ].map((item, i) => (
              <View key={i} style={styles.fraudItem}>
                <View style={styles.fraudDot} />
                <Text style={styles.fraudItemTxt}>{item}</Text>
              </View>
            ))}
            <Text style={styles.fraudNote}>
              This protects everyone's bonuses from abuse. Legitimate referrals are always approved.
            </Text>
          </View>
        </View>

        {/* How it works */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.card}>
            {HOW_STEPS.map((step, i) => (
              <View
                key={i}
                style={[styles.stepRow, i === HOW_STEPS.length - 1 && { borderBottomWidth: 0 }]}
              >
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumTxt}>{step.num}</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text style={styles.stepTitle}>{step.title}</Text>
                  <Text style={styles.stepDesc}>{step.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },

  hero: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 8,
  },
  heroTitle: {
    fontSize: 32, fontWeight: 'bold', color: WHITE,
    lineHeight: 38, letterSpacing: -0.8, marginBottom: 10,
  },
  heroSub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 20 },

  sectionTitle: {
    fontSize: 17, fontWeight: 'bold', color: NAVY,
    letterSpacing: -0.3, marginBottom: 10,
  },

  codeCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 20,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  code: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: 2 },
  shareBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingHorizontal: 18, paddingVertical: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  shareBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  emailCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 10, ...SHADOW,
  },
  emailInput: {
    backgroundColor: OFF_WHITE, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 14, color: NAVY,
  },
  sendBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  sendBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  sendBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  perkRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 14,
  },
  perkVal: {
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    paddingHorizontal: 10, paddingVertical: 6,
    minWidth: 52, alignItems: 'center',
  },
  perkValTxt: { fontSize: 14, fontWeight: 'bold', color: GREEN },
  perkLabel: { flex: 1, fontSize: 13, color: NAVY, lineHeight: 19, fontWeight: 'normal' },

  stepRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 12,
  },
  stepNum: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  stepNumTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },
  stepInfo: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: GRAY, lineHeight: 18 },

  pendingPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: '#FEF3C7', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 5, marginTop: 12, alignSelf: 'flex-start',
  },
  pendingPillTxt: { fontSize: 11, color: '#92400E', fontWeight: 'normal' },

  instantBadge: {
    alignSelf: 'flex-start', backgroundColor: LIGHT_GREEN,
    borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4,
  },
  instantBadgeTxt: { fontSize: 9, fontWeight: 'bold', color: GREEN, letterSpacing: 0.8 },
  pendingBadge: { backgroundColor: '#FEF3C7' },
  pendingBadgeTxt: { color: '#D97706' },

  fraudCard: {
    backgroundColor: '#FFFBEB', borderRadius: 16,
    borderWidth: 1, borderColor: '#FDE68A',
    padding: 16, ...SHADOW_SM,
  },
  fraudHeader: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 8 },
  fraudTitle: { fontSize: 13, fontWeight: 'bold', color: '#92400E' },
  fraudDesc: { fontSize: 12, color: '#78350F', lineHeight: 18, marginBottom: 10 },
  fraudItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 6 },
  fraudDot: {
    width: 5, height: 5, borderRadius: 3,
    backgroundColor: '#D97706', marginTop: 6, flexShrink: 0,
  },
  fraudItemTxt: { flex: 1, fontSize: 12, color: '#78350F', lineHeight: 18 },
  fraudNote: { fontSize: 11, color: '#92400E', fontStyle: 'italic', marginTop: 8, lineHeight: 17 },
});