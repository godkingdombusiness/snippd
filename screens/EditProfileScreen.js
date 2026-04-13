import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';

const SHADOW = {
  shadowColor: '#0D1B4B',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.08,
  shadowRadius: 16,
  elevation: 4,
};

const DIET_OPTIONS = [
  { key: 'none', label: 'No Restrictions' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten_free', label: 'Gluten Free' },
  { key: 'keto', label: 'Keto' },
  { key: 'halal', label: 'Halal' },
  { key: 'kosher', label: 'Kosher' },
  { key: 'dairy_free', label: 'Dairy Free' },
];

const CHEF_PERSONAS = [
  { key: 'savvy_stacker',    label: 'The Savvy Stacker',    emoji: '🏆' },
  { key: 'pantry_hero',      label: 'The Pantry Hero',      emoji: '🦸' },
  { key: 'meal_master',      label: 'The Meal Master',      emoji: '👨‍🍳' },
  { key: 'budget_champion',  label: 'The Budget Champion',  emoji: '💪' },
  { key: 'smart_shopper',    label: 'The Smart Shopper',    emoji: '🛒' },
  { key: 'family_feeder',    label: 'The Family Feeder',    emoji: '❤️' },
  { key: 'deal_finder',      label: 'The Deal Finder',      emoji: '🔍' },
  { key: 'wellness_warrior', label: 'The Wellness Warrior', emoji: '🌿' },
];

export default function EditProfileScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState(null);

  // Form fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [zip, setZip] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [diet, setDiet] = useState('none');
  const [chefPersona, setChefPersona] = useState('');

  // Track original values to detect changes
  const [original, setOriginal] = useState({});
  const [hasChanges, setHasChanges] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email || '');

      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (data) {
        const nameParts = (data.full_name || '').split(' ');
        const first = nameParts[0] || '';
        const last = nameParts.slice(1).join(' ') || '';

        setFirstName(first);
        setLastName(last);
        setUsername(data.username || '');
        setPhone(data.phone || '');
        setZip(data.zip_code || '');
        setCity(data.city || '');
        setState(data.state || '');
        setDiet(data.preferences?.diet || 'none');
        setChefPersona(data.chef_persona || '');

        setOriginal({
          first, last,
          username: data.username || '',
          phone: data.phone || '',
          zip: data.zip_code || '',
          city: data.city || '',
          state: data.state || '',
          diet: data.preferences?.diet || 'none',
          chefPersona: data.chef_persona || '',
        });
      }
    } catch (e) {
      
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, []);

  // Detect changes
  useEffect(() => {
    const changed =
      firstName !== original.first ||
      lastName !== original.last ||
      username !== original.username ||
      phone !== original.phone ||
      zip !== original.zip ||
      city !== original.city ||
      state !== original.state ||
      diet !== original.diet ||
      chefPersona !== original.chefPersona;
    setHasChanges(changed);
  }, [firstName, lastName, username, phone, zip, city, state, diet, chefPersona, original]);

  const save = async () => {
    if (!firstName.trim()) {
      Alert.alert('First name required', 'Please enter your first name.');
      return;
    }
    setSaving(true);
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim();

      // Validate username: lowercase letters, numbers, underscores only
      const cleanUsername = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
      if (username.trim() && cleanUsername !== username.trim().toLowerCase()) {
        Alert.alert('Invalid Username', 'Username can only contain letters, numbers, and underscores.');
        setSaving(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          full_name:   fullName,
          username:    cleanUsername || null,
          phone:       phone.trim() || null,
          zip_code:    zip.trim() || null,
          city:        city.trim() || null,
          state:       state.trim() || null,
          chef_persona: chefPersona || null,
          preferences: { diet },
          updated_at:  new Date().toISOString(),
        })
        .eq('user_id', userId);

      if (error) {
        if (error.code === '23505') {
          Alert.alert('Username Taken', 'That username is already in use. Please choose another.');
          setSaving(false);
          return;
        }
        throw error;
      }

      setOriginal({
        first: firstName, last: lastName,
        username: cleanUsername,
        phone, zip, city, state, diet,
        chefPersona,
      });
      setHasChanges(false);

      Alert.alert('Profile Updated', 'Your changes have been saved.', [
        { text: 'Done', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not save your profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const confirmDiscard = () => {
    if (!hasChanges) { navigation.goBack(); return; }
    Alert.alert('Discard Changes?', 'You have unsaved changes that will be lost.', [
      { text: 'Keep Editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={confirmDiscard}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!hasChanges || saving) && styles.saveBtnDisabled]}
          onPress={save}
          disabled={!hasChanges || saving}
        >
          {saving
            ? <ActivityIndicator color={WHITE} size="small" />
            : <Text style={styles.saveBtnTxt}>Save</Text>
          }
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── AVATAR ──────────────────────────────────────────────────── */}
          <View style={styles.avatarSection}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <Text style={styles.avatarTxt}>{initials}</Text>
              </View>
              <TouchableOpacity
                style={styles.avatarEdit}
                onPress={() => Alert.alert(
                  'Change Photo',
                  'Photo upload will be available in the next update. Your initials are used as your avatar for now.',
                )}
              >
                <Text style={styles.avatarEditTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.avatarName}>
              {firstName || 'Your'} {lastName || 'Name'}
            </Text>
            <Text style={styles.avatarEmail}>{email}</Text>
            {hasChanges && (
              <View style={styles.changesIndicator}>
                <Text style={styles.changesIndicatorTxt}>Unsaved changes</Text>
              </View>
            )}
          </View>

          {/* ── PERSONAL INFO ───────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Personal Information</Text>
            <View style={styles.formCard}>
              <View style={styles.formRowSplit}>
                <View style={[styles.formFieldHalf, { marginRight: 8 }]}>
                  <Text style={styles.formLabel}>First Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    placeholderTextColor="#C4C9D6"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.formLabel}>Last Name</Text>
                  <TextInput
                    style={styles.formInput}
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    placeholderTextColor="#C4C9D6"
                    autoCapitalize="words"
                  />
                </View>
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Username</Text>
                <View style={styles.usernameRow}>
                  <Text style={styles.usernameAt}>@</Text>
                  <TextInput
                    style={[styles.formInput, styles.usernameInput]}
                    value={username}
                    onChangeText={v => setUsername(v.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="your_handle"
                    placeholderTextColor="#C4C9D6"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={30}
                  />
                </View>
                <Text style={styles.fieldHint}>Used for attribution in shared carts. Lowercase only.</Text>
              </View>
            </View>
          </View>

          {/* ── CONTACT ─────────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Contact</Text>
            <View style={styles.formCard}>
              <View style={styles.formField}>
                <Text style={styles.formLabel}>Email</Text>
                <Text style={styles.formValueLocked}>{email}</Text>
                <Text style={styles.formLockedNote}>
                  Email cannot be changed here. Contact support to update.
                </Text>
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formField}>
                <Text style={styles.formLabel}>Phone</Text>
                <TextInput
                  style={styles.formInput}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="e.g. 407-555-0100"
                  placeholderTextColor="#C4C9D6"
                  keyboardType="phone-pad"
                />
              </View>
            </View>
          </View>

          {/* ── LOCATION ────────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Location</Text>
            <View style={styles.formCard}>
              <View style={styles.formRowSplit}>
                <View style={[styles.formFieldHalf, { marginRight: 8 }]}>
                  <Text style={styles.formLabel}>City</Text>
                  <TextInput
                    style={styles.formInput}
                    value={city}
                    onChangeText={setCity}
                    placeholder="Clermont"
                    placeholderTextColor="#C4C9D6"
                    autoCapitalize="words"
                  />
                </View>
                <View style={styles.formFieldHalf}>
                  <Text style={styles.formLabel}>State</Text>
                  <TextInput
                    style={styles.formInput}
                    value={state}
                    onChangeText={setState}
                    placeholder="FL"
                    placeholderTextColor="#C4C9D6"
                    autoCapitalize="characters"
                    maxLength={2}
                  />
                </View>
              </View>

              <View style={styles.formDivider} />

              <View style={styles.formField}>
                <Text style={styles.formLabel}>ZIP Code</Text>
                <TextInput
                  style={styles.formInput}
                  value={zip}
                  onChangeText={setZip}
                  placeholder="34711"
                  placeholderTextColor="#C4C9D6"
                  keyboardType="numeric"
                  maxLength={5}
                />
              </View>
            </View>
          </View>

          {/* ── DIETARY PREFERENCES ─────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Dietary Preferences</Text>
            <Text style={styles.groupSub}>
              Used to personalize your stacks and Chef Stash recipes
            </Text>
            <View style={styles.dietGrid}>
              {DIET_OPTIONS.map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.dietChip,
                    diet === opt.key && styles.dietChipOn,
                  ]}
                  onPress={() => setDiet(opt.key)}
                  activeOpacity={0.8}
                >
                  <Text style={[
                    styles.dietChipTxt,
                    diet === opt.key && styles.dietChipTxtOn,
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── CHEF PERSONA ─────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Chef Persona</Text>
            <Text style={styles.groupSub}>
              How would you describe your shopping style? Pick the one that fits best.
            </Text>
            <View style={styles.personaGrid}>
              {CHEF_PERSONAS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  style={[
                    styles.personaChip,
                    chefPersona === p.key && styles.personaChipOn,
                  ]}
                  onPress={() => setChefPersona(p.key)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.personaEmoji}>{p.emoji}</Text>
                  <Text style={[
                    styles.personaChipTxt,
                    chefPersona === p.key && styles.personaChipTxtOn,
                  ]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* ── DANGER ZONE ─────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <Text style={styles.groupLabel}>Account</Text>
            <View style={styles.dangerCard}>
              <View style={styles.dangerRow}>
                <View>
                  <Text style={styles.dangerTitle}>Change Password</Text>
                  <Text style={styles.dangerSub}>Send a password reset link to your email</Text>
                </View>
                <TouchableOpacity
                  style={styles.dangerBtn}
                  onPress={async () => {
                    try {
                      const { error } = await supabase.auth.resetPasswordForEmail(email);
                      if (error) throw error;
                      Alert.alert('Email Sent', 'Check your inbox for a password reset link.');
                    } catch (e) {
                      Alert.alert('Error', e.message);
                    }
                  }}
                >
                  <Text style={styles.dangerBtnTxt}>Reset</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ── SAVE BUTTON ─────────────────────────────────────────────── */}
          <View style={styles.pad}>
            <TouchableOpacity
              style={[styles.saveBtnLarge, (!hasChanges || saving) && styles.saveBtnLargeDisabled]}
              onPress={save}
              disabled={!hasChanges || saving}
            >
              {saving
                ? <ActivityIndicator color={WHITE} size="small" />
                : <Text style={styles.saveBtnLargeTxt}>
                    {hasChanges ? 'Save Changes' : 'No Changes'}
                  </Text>
              }
            </TouchableOpacity>
          </View>

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
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
  saveBtn: {
    backgroundColor: GREEN, borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 8,
    minWidth: 60, alignItems: 'center',
  },
  saveBtnDisabled: { backgroundColor: '#C4C9D6' },
  saveBtnTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },

  // AVATAR
  avatarSection: {
    alignItems: 'center', paddingVertical: 24,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  avatarWrap: { position: 'relative', marginBottom: 12 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW,
  },
  avatarTxt: { fontSize: 30, fontWeight: 'bold', color: WHITE },
  avatarEdit: {
    position: 'absolute', bottom: 0, right: 0,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: NAVY,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2.5, borderColor: WHITE,
  },
  avatarEditTxt: { fontSize: 16, color: WHITE, fontWeight: 'bold', lineHeight: 20 },
  avatarName: { fontSize: 18, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  avatarEmail: { fontSize: 13, color: GRAY, marginBottom: 8 },
  changesIndicator: {
    backgroundColor: '#FEF3C7', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
    borderWidth: 1, borderColor: '#FDE68A',
  },
  changesIndicatorTxt: { fontSize: 11, fontWeight: 'bold', color: '#D97706' },

  // GROUP
  groupLabel: {
    fontSize: 11, fontWeight: 'bold', color: GRAY,
    letterSpacing: 1.2, marginBottom: 6,
    textTransform: 'uppercase',
  },
  groupSub: { fontSize: 12, color: GRAY, marginBottom: 10, lineHeight: 18 },

  // FORM CARD
  formCard: {
    backgroundColor: WHITE, borderRadius: 18,
    padding: 16, borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  formRowSplit: { flexDirection: 'row' },
  formFieldHalf: { flex: 1 },
  formField: {},
  formDivider: { height: 1, backgroundColor: BORDER, marginVertical: 14 },
  formLabel: { fontSize: 11, fontWeight: 'bold', color: GRAY, marginBottom: 6, letterSpacing: 0.3 },
  formInput: {
    backgroundColor: OFF_WHITE, borderRadius: 10,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: NAVY,
  },
  formInputMulti: { minHeight: 80 },
  charCount: { fontSize: 11, color: GRAY, textAlign: 'right', marginTop: 4 },
  formValueLocked: { fontSize: 14, fontWeight: 'normal', color: NAVY, marginBottom: 4 },
  formLockedNote: { fontSize: 11, color: GRAY, lineHeight: 17 },

  // USERNAME
  usernameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  usernameAt: { fontSize: 16, fontWeight: 'bold', color: NAVY },
  usernameInput: { flex: 1 },
  fieldHint: { fontSize: 11, color: GRAY, marginTop: 5, lineHeight: 16 },

  // DIET
  dietGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dietChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: BORDER,
  },
  dietChipOn: { backgroundColor: PALE_GREEN, borderColor: GREEN },
  dietChipTxt: { fontSize: 13, fontWeight: 'normal', color: NAVY },
  dietChipTxtOn: { color: GREEN, fontWeight: 'bold' },

  // CHEF PERSONA
  personaGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  personaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1.5, borderColor: BORDER,
  },
  personaChipOn: { backgroundColor: PALE_GREEN, borderColor: GREEN },
  personaEmoji: { fontSize: 14 },
  personaChipTxt: { fontSize: 13, fontWeight: 'normal', color: NAVY },
  personaChipTxtOn: { color: GREEN, fontWeight: 'bold' },

  // DANGER
  dangerCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  dangerRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
  },
  dangerTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  dangerSub: { fontSize: 12, color: GRAY },
  dangerBtn: {
    backgroundColor: OFF_WHITE, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: BORDER,
  },
  dangerBtnTxt: { fontSize: 13, fontWeight: 'bold', color: NAVY },

  // SAVE LARGE
  saveBtnLarge: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  saveBtnLargeDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  saveBtnLargeTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
});