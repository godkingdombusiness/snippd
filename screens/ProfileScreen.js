import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Dimensions,
  ActivityIndicator, RefreshControl, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase, SUPABASE_URL } from '../lib/supabase';
import { resetToScreen } from '../lib/navigationRef';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const BORDER = '#F0F1F3';
const RED = '#EF4444';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const MENU_SECTIONS = [
  {
    title: 'My Account',
    items: [
      { label: 'Edit Profile',        screen: 'EditProfile' },
      { label: 'Preferred Stores',    screen: 'PreferredStores' },
      { label: 'Budget Preferences',  screen: 'BudgetPreferences' },
      { label: 'Nutrition profile',   screen: 'NutritionProfile' },
    ],
  },
  {
    title: 'Security',
    items: [
      { label: 'Two-Factor Authentication', screen: 'MFASetup' },
    ],
  },
  {
    title: 'Savings',
    items: [
      { label: 'Wealth Momentum', screen: 'WealthMomentum' },
    ],
  },
  {
    title: 'Community',
    items: [
      { label: 'Invite Friends',  screen: 'InviteFriends' },
      { label: 'Creator Studio',  screen: 'Studio' },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'Help and Support', screen: 'Help' },
      { label: 'Privacy Policy',   screen: 'PrivacyPolicy' },
    ],
  },
];

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile]   = useState(null);
  const [authEmail, setAuthEmail] = useState('');
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wealthData, setWealthData] = useState(null);

  const performGlobalReset = () => resetToScreen('Auth');

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Capture auth email as reliable fallback
      setAuthEmail(user.email ?? '');
      const { data: profileRes } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      if (profileRes) setProfile(profileRes);

      // Fetch wealth momentum summary
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/get-wealth-momentum`, {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          });
          if (resp.ok) {
            const wm = await resp.json();
            setWealthData(wm);
          }
        } catch { /* wealth data is non-critical */ }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfile();
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut({ scope: 'global' });
    } catch (e) {
      console.warn('signOut error', e);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This permanently deletes your account and all your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete Forever',
          style: 'destructive',
          onPress: async () => {
            try {
              const { error } = await supabase
                .rpc('delete_my_account');
              if (error) throw error;
              await supabase.auth.signOut({
                scope: 'local'
              });
            } catch (e) {
              Alert.alert(
                'Error',
                e?.message ?? 'Could not delete account. Try again.'
              );
            }
          }
        }
      ]
    );
  };

  if (loading) return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={GREEN} />
    </View>
  );

  const displayName = profile?.full_name || 'Snippd User';
  const initials = displayName.split(' ').map(w => w[0]).join('').toUpperCase();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <StatusBar barStyle="dark-content" />
      <ScrollView 
        showsVerticalScrollIndicator={false} 
        contentContainerStyle={styles.scroll} 
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />}
      >
        
        <View style={styles.header}>
            <View style={styles.avatar}>
              <Text style={styles.avatarTxt}>{initials}</Text>
            </View>
            <View style={{marginTop: 15, alignItems: 'center'}}>
                <Text style={styles.headerName}>{displayName}</Text>
                <Text style={styles.headerEmail}>{profile?.email || authEmail}</Text>
            </View>
        </View>

        {wealthData && (
          <View style={styles.wealthCard}>
            <Text style={styles.wealthTitle}>Wealth Momentum</Text>
            <View style={styles.wealthRow}>
              <View style={styles.wealthStat}>
                <Text style={styles.wealthValue}>
                  ${((wealthData.lifetime_wealth_created ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.wealthLabel}>Lifetime Saved</Text>
              </View>
              <View style={styles.wealthDivider} />
              <View style={styles.wealthStat}>
                <Text style={[styles.wealthValue, { color: GREEN }]}>
                  ${((wealthData.current_velocity ?? 0) / 100).toFixed(2)}/wk
                </Text>
                <Text style={styles.wealthLabel}>Velocity</Text>
              </View>
              <View style={styles.wealthDivider} />
              <View style={styles.wealthStat}>
                <Text style={styles.wealthValue}>
                  ${((wealthData.inflation_shield_total ?? 0) / 100).toFixed(2)}
                </Text>
                <Text style={styles.wealthLabel}>Inflation Shield</Text>
              </View>
            </View>
          </View>
        )}

        {MENU_SECTIONS.map(section => (
          <View key={section.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{section.title}</Text>
            <View style={styles.menuCard}>
              {section.items.map((item, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.menuRow, index === section.items.length - 1 && { borderBottomWidth: 0 }]} 
                  onPress={() => {
                    if (item.action === 'alert') {
                      Alert.alert(item.label, 'Feature coming soon.');
                    } else if (item.screen) {
                      navigation.navigate(item.screen);
                    }
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.menuLabel}>{item.label}</Text>
                    {item.screen === 'NutritionProfile' && (
                      <Text style={styles.menuSub}>
                        {profile?.nutrition_profile_set
                          ? 'Calorie targets set'
                          : 'Set up household calories'}
                      </Text>
                    )}
                  </View>
                  <Text style={styles.menuArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.menuSection}>
          <TouchableOpacity 
            style={styles.signOutBtn} 
            onPress={handleSignOut}
            disabled={signingOut}
          >
            <Text style={styles.signOutBtnTxt}>
              {signingOut ? 'Signing Out...' : 'Sign Out'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.menuSection, { marginBottom: 40 }]}>
          <TouchableOpacity
            style={[styles.deleteBtn, deleting && { opacity: 0.5 }]}
            onPress={handleDeleteAccount}
            disabled={deleting}
          >
            <Text style={styles.deleteBtnTxt}>
              {deleting ? 'Deleting...' : 'Delete Account'}
            </Text>
          </TouchableOpacity>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', paddingVertical: 30, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  avatar: { width: 80, height: 80, borderRadius: 40, backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center', ...SHADOW },
  avatarTxt: { fontSize: 30, fontWeight: 'bold', color: WHITE },
  headerName: { fontSize: 22, fontWeight: 'bold', color: NAVY },
  headerEmail: { fontSize: 14, color: GRAY, marginTop: 4 },
  menuSection: { marginTop: 25, paddingHorizontal: 20 },
  menuSectionTitle: { fontSize: 12, fontWeight: 'bold', color: GRAY, marginBottom: 10, textTransform: 'uppercase' },
  menuCard: { backgroundColor: WHITE, borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: BORDER },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 18, borderBottomWidth: 1, borderBottomColor: '#F9FAFB' },
  menuLabel: { fontSize: 15, color: NAVY },
  menuSub:   { fontSize: 12, color: GRAY, marginTop: 2 },
  menuArrow: { fontSize: 20, color: '#D1D5DB' },
  signOutBtn: { backgroundColor: WHITE, borderRadius: 18, paddingVertical: 16, alignItems: 'center', borderWidth: 1.5, borderColor: BORDER },
  signOutBtnTxt: { fontSize: 16, fontWeight: 'bold', color: NAVY },
  deleteBtn: { backgroundColor: '#FEF2F2', borderRadius: 18, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteBtnTxt: { fontSize: 15, fontWeight: 'bold', color: RED },
  wealthCard: { backgroundColor: WHITE, borderRadius: 20, marginHorizontal: 20, marginTop: 20, padding: 16, borderWidth: 1, borderColor: BORDER, ...SHADOW },
  wealthTitle: { fontSize: 11, fontWeight: 'bold', color: GRAY, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  wealthRow: { flexDirection: 'row', alignItems: 'center' },
  wealthStat: { flex: 1, alignItems: 'center' },
  wealthValue: { fontSize: 15, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  wealthLabel: { fontSize: 10, color: GRAY },
  wealthDivider: { width: 1, height: 28, backgroundColor: BORDER },
});