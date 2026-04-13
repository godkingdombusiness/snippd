import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, RefreshControl,
  Dimensions, Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const { width } = Dimensions.get('window');
const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const RED = '#EF4444';
const AMBER = '#F59E0B';

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

const ROLES = [
  { key: 'STACK MANAGER', label: 'Stack Manager', desc: 'Controls the plan, edits stacks, manages budget' },
  { key: 'SHOPPER', label: 'Shopper', desc: 'Checks off list items, verifies receipts' },
  { key: 'VIEWER', label: 'Viewer', desc: 'Can view list and stacks, read only' },
];

const FEATURES = [
  { title: 'Shared Shopping List', desc: 'Check off items in real time — everyone sees updates instantly' },
  { title: 'Shared Budget Meter', desc: 'One budget tracked together across all household members' },
  { title: 'Individual Diet Preferences', desc: 'Each member keeps their own dietary preferences for personalized stacks' },
  { title: 'Flexible Roles', desc: 'Stack Manager controls the plan, Shopper checks items, Viewer watches the savings' },
];

const generateCode = () =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const getInitials = (name) =>
  (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

export default function FamilySharingScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Household state
  const [household, setHousehold] = useState(null);
  const [members, setMembers] = useState([]);

  // UI state
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [householdName, setHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const fetchHousehold = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      // Get user profile (includes household_id, plan info)
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      setUserProfile(profile);

      // Check Family Plan gate via household_members table
      const { data: membership } = await supabase
        .from('household_members')
        .select('household_id, role')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!membership?.household_id) {
        setHousehold(null);
        setMembers([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      // Fetch household
      const { data: hh } = await supabase
        .from('households')
        .select('*')
        .eq('id', membership.household_id)
        .single();

      if (hh) {
        setHousehold(hh);

        // Fetch all members via household_members (with username for attribution)
        const { data: memberRows } = await supabase
          .from('household_members')
          .select('user_id, role, username, joined_at')
          .eq('household_id', membership.household_id);

        setMembers(memberRows || []);
      }
    } catch (e) {

    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchHousehold(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchHousehold(); };

  // ── Family Plan gate check ────────────────────────────────────────────────
  const checkFamilyPlan = () => {
    // Gate: profiles.plan_type must be 'family' ($30/mo)
    // For now we check a plan_type field; if absent we show upgrade prompt
    const plan = userProfile?.plan_type || userProfile?.preferences?.plan_type;
    if (plan !== 'family') {
      Alert.alert(
        'Family Plan Required',
        'Snippd Household is part of the $30/mo Family Plan. Upgrade to create or join a household and unlock shared carts, budgets, and real-time list sync.',
        [
          { text: 'Not Now', style: 'cancel' },
          {
            text: 'Upgrade to Family Plan',
            onPress: () => Alert.alert('Coming Soon', 'In-app upgrade will be available at launch. Visit getsnippd.com to sign up.'),
          },
        ]
      );
      return false;
    }
    return true;
  };

  const createHousehold = async () => {
    if (!checkFamilyPlan()) return;
    if (!householdName.trim()) {
      Alert.alert('Name required', 'Please give your household a name.');
      return;
    }
    setSaving(true);
    try {
      const code = generateCode();

      // Create household row
      const { data: newHH, error: hhError } = await supabase
        .from('households')
        .insert([{
          name:        householdName.trim(),
          invite_code: code,
          owner_id:    userId,
          plan_type:   'family',
        }])
        .select()
        .single();

      if (hhError) throw hhError;

      // Insert creator as Stack Manager into household_members
      const { error: memberError } = await supabase
        .from('household_members')
        .insert([{
          household_id: newHH.id,
          user_id:      userId,
          role:         'STACK MANAGER',
          username:     userProfile?.username || null,
        }]);

      if (memberError) throw memberError;

      setHousehold(newHH);
      setMembers([{ user_id: userId, role: 'STACK MANAGER', username: userProfile?.username }]);
      setMode(null);
      setHouseholdName('');
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not create household. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const joinHousehold = async () => {
    if (!checkFamilyPlan()) return;
    if (joinCode.length < 6) {
      Alert.alert('Enter your code', 'Please enter the 6-character code from your household manager.');
      return;
    }
    setSaving(true);
    try {
      // Find household by invite code
      const { data: foundHH, error } = await supabase
        .from('households')
        .select('*')
        .eq('invite_code', joinCode.toUpperCase())
        .single();

      if (error || !foundHH) {
        Alert.alert('Code not found', 'This code is not valid. Please check with your household manager.');
        setSaving(false);
        return;
      }

      // Insert as Shopper into household_members (trigger enforces caps)
      const { error: memberError } = await supabase
        .from('household_members')
        .insert([{
          household_id: foundHH.id,
          user_id:      userId,
          role:         'SHOPPER',
          username:     userProfile?.username || null,
        }]);

      if (memberError) {
        // Trigger may have raised a capacity/role error
        Alert.alert('Could Not Join', memberError.message || 'Please check with your household manager.');
        setSaving(false);
        return;
      }

      setHousehold(foundHH);
      setMode(null);
      setJoinCode('');
      fetchHousehold();
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not join household. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const changeRole = (memberId) => {
    Alert.alert('Change Role', 'Select a new role for this member', [
      ...ROLES.map(role => ({
        text: role.label,
        onPress: async () => {
          setMembers(prev => prev.map(m =>
            m.user_id === memberId ? { ...m, role: role.key } : m
          ));
          await supabase
            .from('household_members')
            .update({ role: role.key })
            .eq('user_id', memberId)
            .eq('household_id', household.id);
        },
      })),
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const removeMember = (memberId, memberName) => {
    Alert.alert(`Remove ${memberName}?`, 'This member will lose access to the shared household.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setMembers(prev => prev.filter(m => m.user_id !== memberId));
          await supabase
            .from('household_members')
            .delete()
            .eq('user_id', memberId)
            .eq('household_id', household.id);
        },
      },
    ]);
  };

  const leaveHousehold = () => {
    Alert.alert('Leave Household', 'You will lose access to the shared list and budget.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          await supabase
            .from('household_members')
            .delete()
            .eq('user_id', userId)
            .eq('household_id', household.id);
          setHousehold(null);
          setMembers([]);
        },
      },
    ]);
  };

  const shareCode = async () => {
    if (!household) return;
    try {
      await Share.share({
        message: `Join my Snippd household "${household.name}"! Use code: ${household.invite_code} — Download Snippd at getsnippd.com`,
        title: 'Join my Snippd Household',
      });
    } catch (e) {}
  };

  const isOwner = household?.owner_id === userId;
  const myRole = members.find(m => m.user_id === userId)?.role || 'SHOPPER';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  // ── NO HOUSEHOLD ──────────────────────────────────────────────────────────
  if (!household && !mode) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backBtnTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Family Sharing</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
        >
          {/* Hero */}
          <View style={styles.pad}>
            <View style={styles.hero}>
              <Text style={styles.heroEyebrow}>HOUSEHOLD SHARING</Text>
              <Text style={styles.heroTitle}>Shop smarter{'\n'}together.</Text>
              <Text style={styles.heroSub}>
                Share your shopping list, budget, and stacks with your household. Everyone stays on the same page.
              </Text>
            </View>
          </View>

          {/* Features */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>What you get</Text>
            <View style={styles.card}>
              {FEATURES.map((f, i) => (
                <View
                  key={f.title}
                  style={[
                    styles.featureRow,
                    i === FEATURES.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.featureDot} />
                  <View style={styles.featureInfo}>
                    <Text style={styles.featureTitle}>{f.title}</Text>
                    <Text style={styles.featureDesc}>{f.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* CTAs */}
          <View style={styles.pad}>
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => setMode('create')}
            >
              <Text style={styles.createBtnTxt}>Create a Household</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.joinBtn}
              onPress={() => setMode('join')}
            >
              <Text style={styles.joinBtnTxt}>Join with a Code</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── CREATE MODE ───────────────────────────────────────────────────────────
  if (mode === 'create') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setMode(null)}>
            <Text style={styles.backBtnTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Household</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pad}>
            <Text style={styles.formTitle}>Name your household</Text>
            <Text style={styles.formSub}>
              You will be the Stack Manager and can invite other members with a code.
            </Text>

            <TextInput
              style={styles.formInput}
              placeholder="e.g. Davis Family, Our House"
              placeholderTextColor="#C4C9D6"
              value={householdName}
              onChangeText={setHouseholdName}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.createBtn, (!householdName.trim() || saving) && styles.btnDisabled]}
              onPress={createHousehold}
              disabled={!householdName.trim() || saving}
            >
              {saving
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.createBtnTxt}>Create Household</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode(null)}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>

          {/* Role explainer */}
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Member Roles</Text>
            <View style={styles.card}>
              {ROLES.map((role, i) => (
                <View
                  key={role.key}
                  style={[
                    styles.roleRow,
                    i === ROLES.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.roleLeft}>
                    <View style={styles.roleBadge}>
                      <Text style={styles.roleBadgeTxt}>{role.label}</Text>
                    </View>
                    <Text style={styles.roleDesc}>{role.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── JOIN MODE ─────────────────────────────────────────────────────────────
  if (mode === 'join') {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setMode(null)}>
            <Text style={styles.backBtnTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Join Household</Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.pad}>
            <Text style={styles.formTitle}>Enter your code</Text>
            <Text style={styles.formSub}>
              Ask your household Stack Manager for their 6-character invite code.
            </Text>

            <TextInput
              style={[styles.formInput, styles.codeInput]}
              placeholder="ABC123"
              placeholderTextColor="#C4C9D6"
              value={joinCode}
              onChangeText={t => setJoinCode(t.toUpperCase())}
              autoCapitalize="characters"
              maxLength={6}
              autoFocus
            />

            <TouchableOpacity
              style={[styles.createBtn, (joinCode.length < 6 || saving) && styles.btnDisabled]}
              onPress={joinHousehold}
              disabled={joinCode.length < 6 || saving}
            >
              {saving
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.createBtnTxt}>Join Household</Text>
              }
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode(null)}>
              <Text style={styles.cancelBtnTxt}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── HOUSEHOLD DASHBOARD ───────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Family Sharing</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── HOUSEHOLD CARD ──────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.householdCard}>
            <View style={styles.householdTop}>
              <View style={styles.householdLeft}>
                <Text style={styles.householdEyebrow}>YOUR HOUSEHOLD</Text>
                <Text style={styles.householdName}>{household.name}</Text>
                <Text style={styles.householdMeta}>
                  {members.length} member{members.length !== 1 ? 's' : ''} · Your role: {myRole.replace('_', ' ')}
                </Text>
              </View>
              <View style={styles.householdCodeWrap}>
                <Text style={styles.householdCodeLabel}>INVITE CODE</Text>
                <Text style={styles.householdCode}>{household.invite_code}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.shareCodeBtn} onPress={shareCode}>
              <Text style={styles.shareCodeTxt}>Share Invite Code</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MEMBERS ─────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Members</Text>
          <View style={styles.card}>
            {members.map((member, i) => {
              const isYou = member.user_id === userId;
              const displayName = member.username ? `@${member.username}` : 'Member';
              const initials = getInitials(member.username || 'M');
              return (
                <View
                  key={member.user_id}
                  style={[
                    styles.memberRow,
                    i === members.length - 1 && { borderBottomWidth: 0 },
                  ]}
                >
                  <View style={styles.memberAvatar}>
                    <Text style={styles.memberAvatarTxt}>{initials}</Text>
                  </View>
                  <View style={styles.memberInfo}>
                    <View style={styles.memberNameRow}>
                      <Text style={styles.memberName}>{displayName}</Text>
                      {isYou && (
                        <View style={styles.youBadge}>
                          <Text style={styles.youBadgeTxt}>you</Text>
                        </View>
                      )}
                    </View>
                    <TouchableOpacity
                      onPress={() => isOwner && !isYou && changeRole(member.user_id)}
                      activeOpacity={isOwner && !isYou ? 0.7 : 1}
                    >
                      <View style={styles.memberRoleBadge}>
                        <Text style={styles.memberRoleTxt}>
                          {(member.role || 'SHOPPER').replace('_', ' ')}
                        </Text>
                        {isOwner && !isYou && (
                          <Text style={styles.memberRoleEdit}>  Change</Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  </View>
                  {isOwner && !isYou && (
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => removeMember(member.user_id, displayName)}
                    >
                      <Text style={styles.removeBtnTxt}>Remove</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        </View>

        {/* ── SHARED FEATURES ─────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Shared Features</Text>
          <View style={styles.card}>
            {[
              { label: 'Shared Shopping List', desc: 'View and check off items together', screen: 'List' },
              { label: 'Shared Budget', desc: 'One weekly budget for the whole household', screen: 'BudgetPreferences' },
              { label: 'Combined Stacks', desc: 'Stacks built for everyone in your house', screen: null },
            ].map((item, i, arr) => (
              <TouchableOpacity
                key={item.label}
                style={[
                  styles.sharedRow,
                  i === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
                onPress={() => item.screen && navigation.navigate(item.screen)}
                activeOpacity={item.screen ? 0.8 : 1}
              >
                <View style={styles.sharedInfo}>
                  <Text style={styles.sharedLabel}>{item.label}</Text>
                  <Text style={styles.sharedDesc}>{item.desc}</Text>
                </View>
                {item.screen && <Text style={styles.sharedArrow}>›</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── STATS ───────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>{members.length}</Text>
              <Text style={styles.statLabel}>Members</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={[styles.statVal, { color: GREEN }]}>$0</Text>
              <Text style={styles.statLabel}>Saved Together</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statVal}>0</Text>
              <Text style={styles.statLabel}>Trips Verified</Text>
            </View>
          </View>
        </View>

        {/* ── LEAVE HOUSEHOLD ─────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity style={styles.leaveBtn} onPress={leaveHousehold}>
            <Text style={styles.leaveBtnTxt}>
              {isOwner ? 'Dissolve Household' : 'Leave Household'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // HEADER
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  backBtnTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },

  // HERO
  hero: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 8,
  },
  heroTitle: {
    fontSize: 28, fontWeight: 'bold', color: WHITE,
    lineHeight: 34, letterSpacing: -0.8, marginBottom: 10,
  },
  heroSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 19,
  },

  // SECTION
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },

  // FEATURES
  featureRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  featureDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN, marginTop: 5 },
  featureInfo: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  featureDesc: { fontSize: 12, color: GRAY, lineHeight: 18 },

  // ACTION BUTTONS
  createBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    marginBottom: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  createBtnTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
  joinBtn: {
    backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    borderWidth: 1.5, borderColor: GREEN,
    marginBottom: 10,
  },
  joinBtnTxt: { color: GREEN, fontSize: 15, fontWeight: 'bold' },
  cancelBtn: {
    backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  cancelBtnTxt: { fontSize: 14, fontWeight: 'normal', color: GRAY },
  btnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },

  // FORM
  formTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  formSub: { fontSize: 14, color: GRAY, lineHeight: 21, marginBottom: 20 },
  formInput: {
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 16, paddingVertical: 14,
    fontSize: 15, color: NAVY, marginBottom: 16,
  },
  codeInput: {
    fontSize: 30, fontWeight: 'bold',
    letterSpacing: 8, textAlign: 'center',
  },

  // ROLE EXPLAINER
  roleRow: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  roleLeft: { gap: 4 },
  roleBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    alignSelf: 'flex-start', marginBottom: 4,
  },
  roleBadgeTxt: { fontSize: 11, fontWeight: 'bold', color: GREEN },
  roleDesc: { fontSize: 13, color: GRAY, lineHeight: 18 },

  // HOUSEHOLD CARD
  householdCard: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  householdTop: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', marginBottom: 16,
  },
  householdLeft: { flex: 1 },
  householdEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  householdName: { fontSize: 24, fontWeight: 'bold', color: WHITE, marginBottom: 4 },
  householdMeta: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  householdCodeWrap: { alignItems: 'flex-end' },
  householdCodeLabel: {
    fontSize: 8, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.6)',
    letterSpacing: 1.2, marginBottom: 4,
  },
  householdCode: {
    fontSize: 24, fontWeight: 'bold', color: WHITE,
    letterSpacing: 4,
  },
  shareCodeBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12, paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  shareCodeTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // MEMBERS
  memberRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 12,
  },
  memberAvatar: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  memberAvatarTxt: { fontSize: 16, fontWeight: 'bold', color: WHITE },
  memberInfo: { flex: 1 },
  memberNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  memberName: { fontSize: 15, fontWeight: 'bold', color: NAVY },
  youBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 6,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  youBadgeTxt: { fontSize: 10, fontWeight: 'bold', color: GREEN },
  memberRoleBadge: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: OFF_WHITE, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  memberRoleTxt: { fontSize: 10, fontWeight: 'bold', color: NAVY },
  memberRoleEdit: { fontSize: 10, fontWeight: 'bold', color: GREEN },
  removeBtn: {
    backgroundColor: '#FEF2F2', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: '#FECACA',
  },
  removeBtnTxt: { fontSize: 12, fontWeight: 'bold', color: RED },

  // SHARED FEATURES
  sharedRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 15,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  sharedInfo: { flex: 1 },
  sharedLabel: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  sharedDesc: { fontSize: 12, color: GRAY },
  sharedArrow: { fontSize: 22, color: '#D1D5DB' },

  // STATS ROW
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: {
    flex: 1, backgroundColor: WHITE,
    borderRadius: 16, padding: 14,
    alignItems: 'center',
    borderWidth: 1, borderColor: BORDER, ...SHADOW_SM,
  },
  statVal: { fontSize: 22, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  statLabel: { fontSize: 10, color: GRAY, fontWeight: 'normal', textAlign: 'center' },

  // LEAVE
  leaveBtn: {
    backgroundColor: '#FEF2F2', borderRadius: 14,
    paddingVertical: 15, alignItems: 'center',
    borderWidth: 1, borderColor: '#FECACA',
  },
  leaveBtnTxt: { fontSize: 14, fontWeight: 'bold', color: RED },
});