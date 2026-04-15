import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, Dimensions,
  ActivityIndicator, RefreshControl,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
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

const TRIPS_REQUIRED = 3;

const CREATE_TYPES = [
  {
    key: 'proof_of_shop',
    title: 'Proof of Shop',
    desc: 'Show your receipt and savings at the register',
    label: 'POS',
  },
  {
    key: 'proof_of_cook',
    title: 'Proof of Cook',
    desc: 'Show the meal you made from your Snippd stack',
    label: 'POC',
  },
];

const STEPS = [
  { num: 1, title: 'Choose your story type', desc: 'Proof of Shop or Proof of Cook' },
  { num: 2, title: 'Record a 30-second video', desc: 'Show your savings or your meal' },
  { num: 3, title: 'Review your savings overlay', desc: 'We auto-generate your win graphic' },
  { num: 4, title: 'Add a caption', desc: 'Tell your savings story in your own words' },
  { num: 5, title: 'Accept content license', desc: 'Required before publishing' },
  { num: 6, title: 'Share or submit to Snippd', desc: 'TikTok, Instagram, Facebook, or all three' },
];

const LEADERBOARD_SEED = [
  { rank: 1, name: 'Maria R.', saved: 284.50, videos: 12, credits: 1200 },
  { rank: 2, name: 'James T.', saved: 241.20, videos: 9, credits: 900 },
  { rank: 3, name: 'Aisha M.', saved: 198.75, videos: 7, credits: 700 },
  { rank: 4, name: 'Carlos P.', saved: 156.40, videos: 5, credits: 500 },
];

const SHARE_PLATFORMS = ['TikTok', 'Instagram', 'Facebook'];

export default function StudioScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tripsVerified, setTripsVerified] = useState(0);
  const [videosSubmitted, setVideosSubmitted] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [userId, setUserId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  // Flow state
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState(null);
  const [licenseAccepted, setLicenseAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchProfile = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, stash_credits, posts_count, preferences')
        .eq('user_id', user.id)
        .single();

      if (profile) {
        setUserProfile(profile);
        setVideosSubmitted(profile.posts_count || 0);
        setCreditsEarned(profile.stash_credits || 0);
      }

      // Count verified trips
      const { count } = await supabase
        .from('trip_results')
        .select('id', { count: 'exact' })
        .eq('user_id', user.id);

      setTripsVerified(count || 0);
    } catch (e) {
      
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { fetchProfile(); }, []);

  const onRefresh = () => { setRefreshing(true); fetchProfile(); };

  const isUnlocked = tripsVerified >= TRIPS_REQUIRED;
  const displayName = userProfile?.full_name?.split(' ')[0] || 'You';

  const handleCreate = () => {
    if (!isUnlocked) {
      Alert.alert(
        'Studio Locked',
        `Verify ${TRIPS_REQUIRED - tripsVerified} more receipt${TRIPS_REQUIRED - tripsVerified !== 1 ? 's' : ''} to unlock Snippd Studio.`,
        [
          { text: 'Verify Receipt', onPress: () => navigation.navigate('ReceiptUpload') },
          { text: 'Later', style: 'cancel' },
        ]
      );
      return;
    }
    setStep(1);
    setSelectedType(null);
    setLicenseAccepted(false);
  };

  const handleSubmit = async () => {
    if (!licenseAccepted) {
      Alert.alert('License Required', 'Please accept the content license before submitting.');
      return;
    }
    setSubmitting(true);
    try {
      if (userId) {
        // Save submission to Supabase
        await supabase.from('creator_content').insert([{
          user_id: userId,
          content_type: selectedType,
          status: 'pending_review',
          created_at: new Date().toISOString(),
        }]);

        // Award 100 Stash Credits
        const { data: profile } = await supabase
          .from('profiles')
          .select('stash_credits, posts_count')
          .eq('user_id', userId)
          .single();

        await supabase.from('profiles').update({
          stash_credits: (profile?.stash_credits || 0) + 100,
          posts_count: (profile?.posts_count || 0) + 1,
        }).eq('user_id', userId);

        setVideosSubmitted(v => v + 1);
        setCreditsEarned(c => c + 100);
      }

      Alert.alert(
        'Submitted for Review',
        'Your video has been submitted. You will earn 100 Stash Credits once approved by our team.',
        [{
          text: 'Done',
          onPress: () => {
            setStep(0);
            setSelectedType(null);
            setLicenseAccepted(false);
          },
        }]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not submit your video. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleShare = (platform) => {
    Alert.alert(
      `Share to ${platform}`,
      `Your savings story will open in ${platform} with the tags #Snippd #SnippdSavings #SaveSmart`,
      [
        { text: 'Share', style: 'default' },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GREEN} />
        <Text style={styles.loadTxt}>Loading Studio...</Text>
      </View>
    );
  }

  // ── CREATE FLOW ───────────────────────────────────────────────────────────
  if (step > 0) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>

        {/* Flow header */}
        <View style={styles.flowHeader}>
          <TouchableOpacity
            style={styles.flowBackBtn}
            onPress={() => step === 1 ? setStep(0) : setStep(s => s - 1)}
          >
            <Text style={styles.flowBackTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.flowTitle}>Create Video</Text>
          <View style={styles.flowStepBadge}>
            <Text style={styles.flowStepTxt}>{step} of 6</Text>
          </View>
        </View>

        {/* Progress bar */}
        <View style={styles.flowProgressTrack}>
          <View style={[styles.flowProgressFill, { width: `${(step / 6) * 100}%` }]} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.flowScroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── STEP 1 — TYPE ─────────────────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Choose your{'\n'}story type</Text>
              <Text style={styles.flowSectionSub}>What are you sharing today?</Text>

              <View style={styles.typeGrid}>
                {CREATE_TYPES.map(type => (
                  <TouchableOpacity
                    key={type.key}
                    style={[styles.typeCard, selectedType === type.key && styles.typeCardOn]}
                    onPress={() => setSelectedType(type.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      styles.typeIconCircle,
                      selectedType === type.key && styles.typeIconCircleOn,
                    ]}>
                      <Text style={[
                        styles.typeIconTxt,
                        selectedType === type.key && styles.typeIconTxtOn,
                      ]}>
                        {type.label}
                      </Text>
                    </View>
                    <Text style={[
                      styles.typeTitle,
                      selectedType === type.key && styles.typeTitleOn,
                    ]}>
                      {type.title}
                    </Text>
                    <Text style={styles.typeDesc}>{type.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <TouchableOpacity
                style={[styles.flowBtn, !selectedType && styles.flowBtnDisabled]}
                onPress={() => selectedType && setStep(2)}
                disabled={!selectedType}
              >
                <Text style={styles.flowBtnTxt}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 2 — RECORD ───────────────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Record your{'\n'}30-second video</Text>
              <Text style={styles.flowSectionSub}>
                {selectedType === 'proof_of_shop'
                  ? 'Show your receipt and the savings at the register. Be authentic — your story matters.'
                  : 'Show the meal you made from your Snippd stack. Share the ingredients, the process, or the final plate.'}
              </Text>

              {/* Camera placeholder */}
              <View style={styles.cameraBox}>
                <View style={styles.cameraIconWrap}>
                  <Text style={styles.cameraIconTxt}>REC</Text>
                </View>
                <Text style={styles.cameraLabel}>Camera access required</Text>
                <Text style={styles.cameraSub}>
                  Available when running on your phone via Expo Go
                </Text>
              </View>

              {/* Tips */}
              <View style={styles.tipsCard}>
                <Text style={styles.tipsTitle}>Tips for a great video</Text>
                {[
                  'Hold your phone steady and use good lighting',
                  'Show the actual savings amount clearly',
                  'Keep it under 30 seconds for best results',
                  'Be yourself — authentic content performs best',
                ].map((tip, i) => (
                  <View key={i} style={styles.tipRow}>
                    <View style={styles.tipDot} />
                    <Text style={styles.tipTxt}>{tip}</Text>
                  </View>
                ))}
              </View>

              <TouchableOpacity style={styles.flowBtn} onPress={() => setStep(3)}>
                <Text style={styles.flowBtnTxt}>Video Recorded — Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3 — OVERLAY ──────────────────────────────────────────── */}
          {step === 3 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Your savings{'\n'}overlay</Text>
              <Text style={styles.flowSectionSub}>
                This graphic is auto-generated and overlaid on your video.
              </Text>

              <View style={styles.overlayCard}>
                <Text style={styles.overlayEyebrow}>SNIPPD VERIFIED SAVINGS</Text>
                <Text style={styles.overlayAmt}>I saved $0.00 at Publix</Text>
                <Text style={styles.overlaySub}>Using Snippd — Smarter grocery savings</Text>
                <View style={styles.overlayDivider} />
                <View style={styles.overlayTags}>
                  {['#Snippd', '#SnippdSavings', '#SaveSmart'].map(tag => (
                    <View key={tag} style={styles.overlayTag}>
                      <Text style={styles.overlayTagTxt}>{tag}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={styles.flowBtn} onPress={() => setStep(4)}>
                <Text style={styles.flowBtnTxt}>Looks Good — Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 4 — CAPTION ──────────────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Add your caption</Text>
              <Text style={styles.flowSectionSub}>
                Tell your savings story in your own words.
              </Text>

              <View style={styles.captionBox}>
                <Text style={styles.captionPlaceholder}>
                  I just saved money at Publix using Snippd! No extreme couponing required. Check out this app...
                </Text>
              </View>

              <View style={styles.captionTagsRow}>
                <View style={styles.captionTagsDot} />
                <Text style={styles.captionTagsLabel}>Auto-added tags</Text>
                <Text style={styles.captionTagsTxt}>#Snippd #SnippdSavings #SaveSmart</Text>
              </View>

              <TouchableOpacity style={styles.flowBtn} onPress={() => setStep(5)}>
                <Text style={styles.flowBtnTxt}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 5 — LICENSE ──────────────────────────────────────────── */}
          {step === 5 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Content license</Text>
              <Text style={styles.flowSectionSub}>
                Required before your video can be published or submitted.
              </Text>

              <View style={styles.licenseCard}>
                <Text style={styles.licenseTxt}>
                  By submitting this video, you grant Snippd a non-exclusive license to use, display, and promote your content across our platform and marketing materials. You retain ownership of your content. Snippd will never sell your video to third parties.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.licenseToggle, licenseAccepted && styles.licenseToggleOn]}
                onPress={() => setLicenseAccepted(!licenseAccepted)}
              >
                <View style={[styles.licenseCheck, licenseAccepted && styles.licenseCheckOn]}>
                  {licenseAccepted && (
                    <Text style={styles.licenseCheckTxt}>✓</Text>
                  )}
                </View>
                <Text style={styles.licenseToggleTxt}>
                  I accept the content license agreement
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.flowBtn, !licenseAccepted && styles.flowBtnDisabled]}
                onPress={() => licenseAccepted && setStep(6)}
                disabled={!licenseAccepted}
              >
                <Text style={styles.flowBtnTxt}>Continue</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 6 — SHARE ────────────────────────────────────────────── */}
          {step === 6 && (
            <View style={styles.flowSection}>
              <Text style={styles.flowSectionTitle}>Share your story</Text>
              <Text style={styles.flowSectionSub}>
                Share directly to social media or submit to Snippd for review and earn 100 Stash Credits.
              </Text>

              {/* Social share buttons */}
              <View style={styles.shareGrid}>
                {SHARE_PLATFORMS.map(platform => (
                  <TouchableOpacity
                    key={platform}
                    style={styles.shareBtn}
                    onPress={() => handleShare(platform)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.shareBtnIcon}>
                      <Text style={styles.shareBtnIconTxt}>
                        {platform.charAt(0)}
                      </Text>
                    </View>
                    <Text style={styles.shareBtnTxt}>{platform}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Divider */}
              <View style={styles.shareDivider}>
                <View style={styles.shareDividerLine} />
                <Text style={styles.shareDividerTxt}>or earn credits</Text>
                <View style={styles.shareDividerLine} />
              </View>

              {/* Submit to Snippd */}
              <View style={styles.submitCard}>
                <View style={styles.submitTop}>
                  <Text style={styles.submitTitle}>Submit to Snippd</Text>
                  <View style={styles.submitCreditsBadge}>
                    <Text style={styles.submitCreditsTxt}>+100 Credits</Text>
                  </View>
                </View>
                <Text style={styles.submitSub}>
                  Earn 100 Stash Credits ($1.00 value) when your video is approved by our team. Average review time is 48 hours.
                </Text>
                <TouchableOpacity
                  style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
                  onPress={handleSubmit}
                  disabled={submitting}
                >
                  {submitting
                    ? <ActivityIndicator color={WHITE} size="small" />
                    : <Text style={styles.submitBtnTxt}>Submit for Review — Earn 100 Credits</Text>
                  }
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 60 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── MAIN STUDIO SCREEN ────────────────────────────────────────────────────
  const leaderboard = [
    ...LEADERBOARD_SEED,
    {
      rank: 5,
      name: displayName,
      saved: 0,
      videos: videosSubmitted,
      credits: creditsEarned,
      isYou: true,
    },
  ];

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* ── TOP BAR ─────────────────────────────────────────────────────── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.topTitle}>Snippd Studio</Text>
          <Text style={styles.topSub}>Share your savings story and earn credits</Text>
        </View>
        {isUnlocked && (
          <View style={styles.topCreditsBadge}>
            <Text style={styles.topCreditsVal}>{creditsEarned}</Text>
            <Text style={styles.topCreditsLabel}>credits</Text>
          </View>
        )}
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={GREEN} />
        }
      >

        {/* ── LOCKED STATE ────────────────────────────────────────────────── */}
        {!isUnlocked ? (
          <View style={styles.pad}>
            <View style={styles.lockedCard}>
              <View style={styles.lockedIconWrap}>
                <Text style={styles.lockedIconTxt}>LOCK</Text>
              </View>
              <Text style={styles.lockedTitle}>Unlock Creator Studio</Text>
              <Text style={styles.lockedSub}>
                Verify {TRIPS_REQUIRED} receipts to start sharing your savings story and earning Stash Credits.
              </Text>

              <View style={styles.lockedProgressWrap}>
                <View style={styles.lockedProgressHead}>
                  <Text style={styles.lockedProgressLabel}>Receipts verified</Text>
                  <Text style={styles.lockedProgressVal}>
                    {tripsVerified} of {TRIPS_REQUIRED}
                  </Text>
                </View>
                <View style={styles.lockedTrack}>
                  <View style={[
                    styles.lockedFill,
                    { width: `${(tripsVerified / TRIPS_REQUIRED) * 100}%` },
                  ]} />
                </View>
              </View>

              <TouchableOpacity
                style={styles.lockedBtn}
                onPress={() => navigation.navigate('ReceiptUpload')}
              >
                <Text style={styles.lockedBtnTxt}>Verify a Receipt to Unlock</Text>
              </TouchableOpacity>
              <Text style={styles.lockedPreview}>
                Preview what you will unlock below
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.pad}>
            <View style={styles.unlockedBanner}>
              <View style={styles.unlockedBannerLeft}>
                <Text style={styles.unlockedEyebrow}>STUDIO UNLOCKED</Text>
                <Text style={styles.unlockedTitle}>Ready to create</Text>
                <Text style={styles.unlockedSub}>
                  {videosSubmitted} video{videosSubmitted !== 1 ? 's' : ''} submitted · {creditsEarned} credits earned
                </Text>
              </View>
              <View style={styles.unlockedBadge}>
                <Text style={styles.unlockedBadgeTxt}>ACTIVE</Text>
              </View>
            </View>
          </View>
        )}

        {/* ── CREATE BUTTON ───────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={[styles.createBtn, !isUnlocked && styles.createBtnLocked]}
            onPress={handleCreate}
            activeOpacity={0.88}
          >
            <Text style={styles.createBtnPlus}>+</Text>
            <Text style={styles.createBtnTxt}>Create New Video</Text>
          </TouchableOpacity>
        </View>

        {/* ── WEEKLY PLAN CARD ─────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <TouchableOpacity
            style={styles.planCard}
            activeOpacity={0.88}
            onPress={() => navigation.navigate('PlanTab')}
          >
            <View style={styles.planCardLeft}>
              <Text style={styles.planCardEyebrow}>THIS WEEK</Text>
              <Text style={styles.planCardTitle}>5 dinners built from deals</Text>
              <Text style={styles.planCardSub}>See what's on sale and plan your week</Text>
            </View>
            <View style={styles.planCardIcon}>
              <Feather name="calendar" size={24} color="#0C7A3D" />
            </View>
          </TouchableOpacity>
        </View>

        {/* ── EARNINGS INFO ───────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.earningsCard}>
            <Text style={styles.earningsEyebrow}>WHAT YOU EARN</Text>
            <View style={styles.earningsRow}>
              {[
                { val: '100', label: 'Credits per\napproved video' },
                { val: '$1.00', label: 'Value per\n100 credits' },
                { val: '48h', label: 'Average\nreview time' },
              ].map((item, i) => (
                <React.Fragment key={i}>
                  <View style={styles.earningsStat}>
                    <Text style={styles.earningsVal}>{item.val}</Text>
                    <Text style={styles.earningsLabel}>{item.label}</Text>
                  </View>
                  {i < 2 && <View style={styles.earningsDivider} />}
                </React.Fragment>
              ))}
            </View>
          </View>
        </View>

        {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>How It Works</Text>
          <View style={styles.card}>
            {STEPS.map((s, i) => (
              <View
                key={s.num}
                style={[
                  styles.stepRow,
                  i === STEPS.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumTxt}>{s.num}</Text>
                </View>
                <View style={styles.stepInfo}>
                  <Text style={styles.stepTitle}>{s.title}</Text>
                  <Text style={styles.stepDesc}>{s.desc}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* ── LEADERBOARD ─────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Top Savers This Week</Text>
          <View style={styles.card}>
            {leaderboard.map((entry, i) => (
              <View
                key={entry.rank}
                style={[
                  styles.leaderRow,
                  entry.isYou && styles.leaderRowYou,
                  i === leaderboard.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={[
                  styles.leaderRankWrap,
                  entry.rank <= 3 && styles.leaderRankWrapTop,
                ]}>
                  <Text style={[
                    styles.leaderRankTxt,
                    entry.rank <= 3 && styles.leaderRankTxtTop,
                  ]}>
                    {entry.rank}
                  </Text>
                </View>
                <View style={styles.leaderInfo}>
                  <Text style={[
                    styles.leaderName,
                    entry.isYou && styles.leaderNameYou,
                  ]}>
                    {entry.name}
                    {entry.isYou && (
                      <Text style={styles.leaderYouTag}> (you)</Text>
                    )}
                  </Text>
                  <Text style={styles.leaderMeta}>
                    {entry.videos} video{entry.videos !== 1 ? 's' : ''} · {entry.credits} credits
                  </Text>
                </View>
                <Text style={styles.leaderSaved}>
                  ${entry.saved.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── CONTENT GUIDELINES ──────────────────────────────────────────── */}
        <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Content Guidelines</Text>
          <View style={styles.guidelinesCard}>
            {[
              'Videos must show real, verified savings from Snippd stacks',
              'No profanity, misleading claims, or competitor mentions',
              'Must include your actual receipt or meal from a Snippd stack',
              'Content becomes eligible for Snippd marketing with your permission',
              'One submission per verified trip',
            ].map((item, i, arr) => (
              <View
                key={i}
                style={[
                  styles.guidelineRow,
                  i === arr.length - 1 && { borderBottomWidth: 0 },
                ]}
              >
                <View style={styles.guidelineDot} />
                <Text style={styles.guidelineTxt}>{item}</Text>
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
  scroll: { paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: OFF_WHITE, gap: 12 },
  loadTxt: { fontSize: 14, color: GRAY },
  pad: { paddingHorizontal: 16, marginTop: 16 },

  // TOP BAR
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  topTitle: { fontSize: 22, fontWeight: 'bold', color: NAVY, letterSpacing: -0.5 },
  topSub: { fontSize: 12, color: GRAY, marginTop: 2 },
  topCreditsBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center',
  },
  topCreditsVal: { fontSize: 18, fontWeight: 'bold', color: GREEN },
  topCreditsLabel: { fontSize: 9, color: GREEN, fontWeight: 'bold', letterSpacing: 0.5 },

  // LOCKED CARD
  lockedCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  lockedIconWrap: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16, borderWidth: 1, borderColor: BORDER,
  },
  lockedIconTxt: { fontSize: 11, fontWeight: 'bold', color: GRAY, letterSpacing: 1 },
  lockedTitle: { fontSize: 20, fontWeight: 'bold', color: NAVY, marginBottom: 8 },
  lockedSub: { fontSize: 14, color: GRAY, textAlign: 'center', lineHeight: 21, marginBottom: 20 },
  lockedProgressWrap: { width: '100%', marginBottom: 16 },
  lockedProgressHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  lockedProgressLabel: { fontSize: 12, color: GRAY },
  lockedProgressVal: { fontSize: 12, fontWeight: 'bold', color: NAVY },
  lockedTrack: { height: 6, backgroundColor: '#F3F4F6', borderRadius: 3 },
  lockedFill: { height: 6, backgroundColor: GREEN, borderRadius: 3 },
  lockedBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 14, width: '100%', alignItems: 'center',
    marginBottom: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  lockedBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },
  lockedPreview: { fontSize: 12, color: GRAY },

  // UNLOCKED BANNER
  unlockedBanner: {
    backgroundColor: GREEN, borderRadius: 18, padding: 18,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', ...SHADOW,
  },
  unlockedBannerLeft: {},
  unlockedEyebrow: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 4 },
  unlockedTitle: { fontSize: 18, fontWeight: 'bold', color: WHITE, marginBottom: 3 },
  unlockedSub: { fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  unlockedBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  unlockedBadgeTxt: { fontSize: 11, fontWeight: 'bold', color: WHITE },

  // CREATE BUTTON
  createBtn: {
    backgroundColor: GREEN, borderRadius: 16, paddingVertical: 18,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  createBtnLocked: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  createBtnPlus: { fontSize: 22, color: WHITE, fontWeight: 'normal', lineHeight: 26 },
  createBtnTxt: { fontSize: 16, fontWeight: 'bold', color: WHITE },

  // PLAN CARD
  planCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#F0FAF5', borderRadius: 14,
    borderWidth: 1, borderColor: '#BBF7D0',
    padding: 16,
  },
  planCardLeft: { flex: 1 },
  planCardEyebrow: { fontSize: 9, fontWeight: '700', color: '#0C7A3D', letterSpacing: 1.2, marginBottom: 4 },
  planCardTitle: { fontSize: 15, fontWeight: '700', color: '#0D1B4B', marginBottom: 2 },
  planCardSub: { fontSize: 12, color: '#64748B' },
  planCardIcon: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center',
    marginLeft: 12,
  },

  // EARNINGS
  earningsCard: {
    backgroundColor: NAVY, borderRadius: 18, padding: 18, ...SHADOW,
  },
  earningsEyebrow: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 14 },
  earningsRow: { flexDirection: 'row', alignItems: 'center' },
  earningsStat: { flex: 1, alignItems: 'center' },
  earningsVal: { fontSize: 20, fontWeight: 'bold', color: WHITE, marginBottom: 5 },
  earningsLabel: { fontSize: 10, color: 'rgba(255,255,255,0.6)', textAlign: 'center', lineHeight: 14 },
  earningsDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' },

  // SECTION
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },

  // HOW IT WORKS
  stepRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 12,
  },
  stepNum: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: GREEN, alignItems: 'center', justifyContent: 'center',
  },
  stepNumTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },
  stepInfo: { flex: 1 },
  stepTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  stepDesc: { fontSize: 12, color: GRAY },

  // LEADERBOARD
  leaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 10,
  },
  leaderRowYou: { backgroundColor: PALE_GREEN },
  leaderRankWrap: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
  },
  leaderRankWrapTop: { backgroundColor: GREEN },
  leaderRankTxt: { fontSize: 12, fontWeight: 'bold', color: GRAY },
  leaderRankTxtTop: { color: WHITE },
  leaderInfo: { flex: 1 },
  leaderName: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  leaderNameYou: { color: GREEN },
  leaderYouTag: { fontSize: 12, fontWeight: 'normal', color: GRAY },
  leaderMeta: { fontSize: 11, color: GRAY, marginTop: 2 },
  leaderSaved: { fontSize: 13, fontWeight: 'bold', color: GREEN },

  // GUIDELINES
  guidelinesCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW_SM,
  },
  guidelineRow: {
    flexDirection: 'row', alignItems: 'flex-start',
    paddingHorizontal: 16, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB', gap: 10,
  },
  guidelineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 5 },
  guidelineTxt: { flex: 1, fontSize: 13, color: GRAY, lineHeight: 19 },

  // ── FLOW STYLES ───────────────────────────────────────────────────────────
  flowHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  flowBackBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: BORDER,
  },
  flowBackTxt: { fontSize: 24, color: NAVY, fontWeight: 'normal', lineHeight: 30 },
  flowTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  flowStepBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  flowStepTxt: { fontSize: 12, fontWeight: 'bold', color: GREEN },
  flowProgressTrack: { height: 4, backgroundColor: OFF_WHITE },
  flowProgressFill: { height: 4, backgroundColor: GREEN },
  flowScroll: { padding: 20, paddingBottom: 60 },
  flowSection: { gap: 16 },
  flowSectionTitle: {
    fontSize: 28, fontWeight: 'bold', color: NAVY,
    letterSpacing: -0.8, lineHeight: 34,
  },
  flowSectionSub: { fontSize: 14, color: GRAY, lineHeight: 21 },

  // TYPE CARDS
  typeGrid: { flexDirection: 'row', gap: 12 },
  typeCard: {
    flex: 1, backgroundColor: WHITE, borderRadius: 18,
    padding: 18, alignItems: 'center',
    borderWidth: 2, borderColor: BORDER, ...SHADOW_SM,
  },
  typeCardOn: { borderColor: GREEN, backgroundColor: PALE_GREEN },
  typeIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
    borderWidth: 1, borderColor: BORDER,
  },
  typeIconCircleOn: { backgroundColor: GREEN, borderColor: GREEN },
  typeIconTxt: { fontSize: 11, fontWeight: 'bold', color: GRAY, letterSpacing: 0.5 },
  typeIconTxtOn: { color: WHITE },
  typeTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY, textAlign: 'center', marginBottom: 4 },
  typeTitleOn: { color: GREEN },
  typeDesc: { fontSize: 11, color: GRAY, textAlign: 'center', lineHeight: 16 },

  // CAMERA
  cameraBox: {
    backgroundColor: '#111827', borderRadius: 18, height: 200,
    alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  cameraIconWrap: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  cameraIconTxt: { fontSize: 12, fontWeight: 'bold', color: WHITE, letterSpacing: 1 },
  cameraLabel: { fontSize: 14, color: WHITE, fontWeight: 'bold' },
  cameraSub: { fontSize: 11, color: 'rgba(255,255,255,0.5)', textAlign: 'center', paddingHorizontal: 20 },

  // TIPS
  tipsCard: {
    backgroundColor: WHITE, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: BORDER, gap: 8, ...SHADOW_SM,
  },
  tipsTitle: { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 5 },
  tipTxt: { flex: 1, fontSize: 12, color: GRAY, lineHeight: 19 },

  // OVERLAY
  overlayCard: {
    backgroundColor: GREEN, borderRadius: 18, padding: 24, alignItems: 'center',
  },
  overlayEyebrow: { fontSize: 9, fontWeight: 'bold', color: 'rgba(255,255,255,0.7)', letterSpacing: 1.5, marginBottom: 10 },
  overlayAmt: { fontSize: 22, fontWeight: 'bold', color: WHITE, marginBottom: 6, textAlign: 'center' },
  overlaySub: { fontSize: 13, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 14 },
  overlayDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', width: '100%', marginBottom: 14 },
  overlayTags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  overlayTag: {
    backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  overlayTagTxt: { fontSize: 11, color: WHITE, fontWeight: 'bold' },

  // CAPTION
  captionBox: {
    backgroundColor: WHITE, borderRadius: 14, padding: 16,
    minHeight: 100, borderWidth: 1.5, borderColor: BORDER,
  },
  captionPlaceholder: { fontSize: 14, color: GRAY, lineHeight: 21 },
  captionTagsRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    padding: 12, gap: 8,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  captionTagsDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN },
  captionTagsLabel: { fontSize: 10, fontWeight: 'bold', color: GREEN, letterSpacing: 0.5 },
  captionTagsTxt: { fontSize: 12, color: GREEN, fontWeight: 'normal', flex: 1 },

  // LICENSE
  licenseCard: {
    backgroundColor: OFF_WHITE, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: BORDER,
  },
  licenseTxt: { fontSize: 13, color: GRAY, lineHeight: 21 },
  licenseToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: WHITE, borderRadius: 14, padding: 16,
    borderWidth: 2, borderColor: BORDER, ...SHADOW_SM,
  },
  licenseToggleOn: { borderColor: GREEN, backgroundColor: PALE_GREEN },
  licenseCheck: {
    width: 26, height: 26, borderRadius: 13,
    borderWidth: 2, borderColor: BORDER,
    alignItems: 'center', justifyContent: 'center',
  },
  licenseCheckOn: { backgroundColor: GREEN, borderColor: GREEN },
  licenseCheckTxt: { color: WHITE, fontSize: 13, fontWeight: 'bold' },
  licenseToggleTxt: { fontSize: 13, fontWeight: 'normal', color: NAVY, flex: 1 },

  // SHARE
  shareGrid: { flexDirection: 'row', gap: 10 },
  shareBtn: {
    flex: 1, backgroundColor: WHITE, borderRadius: 16,
    paddingVertical: 16, alignItems: 'center', gap: 8,
    borderWidth: 1.5, borderColor: BORDER, ...SHADOW_SM,
  },
  shareBtnIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: NAVY,
    alignItems: 'center', justifyContent: 'center',
  },
  shareBtnIconTxt: { fontSize: 16, fontWeight: 'bold', color: WHITE },
  shareBtnTxt: { fontSize: 12, fontWeight: 'bold', color: NAVY },
  shareDivider: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  shareDividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  shareDividerTxt: { fontSize: 12, color: GRAY },

  // SUBMIT
  submitCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1.5, borderColor: GREEN, ...SHADOW,
  },
  submitTop: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 8,
  },
  submitTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY },
  submitCreditsBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  submitCreditsTxt: { fontSize: 11, fontWeight: 'bold', color: GREEN },
  submitSub: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 14 },
  submitBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  submitBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  submitBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // FLOW BUTTON
  flowBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  flowBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  flowBtnTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
});