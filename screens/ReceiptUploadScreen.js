import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, TextInput, Dimensions,
  KeyboardAvoidingView, Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { tracker } from '../lib/eventTracker';
// NEW IMPORTS FOR PRODUCTION & SHARING
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#8A8F9E';
const OFF_WHITE = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const PALE_GREEN = '#F0FDF4';
const BORDER = '#F0F1F3';
const AMBER = '#F59E0B';
const DARK_SECTION = '#04361D'; // For the Share Win-Card

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

const fmt = (cents) => '$' + ((cents || 0) / 100).toFixed(2);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

const STORES = [
  'Publix', 'Dollar General', 'Aldi',
  'Target', 'Walgreens', 'Sprouts', 'CVS',
];

const SMART_PROMPTS = [
  {
    key: 'over_budget',
    title: 'Budget Alert',
    question: 'You spent a bit more than planned this week. Want to adjust your budget for next week?',
    yes: 'Update my budget',
    no: 'Keep current budget',
  },
  {
    key: 'unplanned_snacks',
    title: 'Stash Insight',
    question: 'We noticed some items not on your stack. Want us to include those deals in your weekly plan?',
    yes: 'Yes, add those deals',
    no: 'No thanks',
  },
  {
    key: 'new_store',
    title: 'New Store Detected',
    question: 'It looks like you shopped at a new store this week. Want us to add deals from there to your plan?',
    yes: 'Yes, add that store',
    no: 'Not right now',
  },
  {
    key: 'under_budget',
    title: 'Great Shopping',
    question: 'You came in under budget this week. Want to put the difference toward your savings goal?',
    yes: 'Yes, save it',
    no: 'Not right now',
  },
];

const STEP_LABELS = ['Upload', 'Review', 'Insight', 'Verified'];

// Category keywords for auto-categorisation of receipt line items
const CATEGORY_KEYWORDS = {
  protein:   ['chicken', 'beef', 'steak', 'pork', 'salmon', 'tuna', 'turkey', 'shrimp', 'fish', 'lamb', 'bacon', 'sausage', 'ground'],
  produce:   ['apple', 'banana', 'orange', 'lettuce', 'spinach', 'broccoli', 'carrot', 'tomato', 'potato', 'onion', 'pepper', 'avocado', 'lemon', 'lime', 'grape', 'berry', 'salad'],
  dairy:     ['milk', 'cheese', 'yogurt', 'butter', 'cream', 'eggs', 'egg', 'mozzarella', 'cheddar', 'parmesan'],
  pantry:    ['pasta', 'rice', 'bread', 'flour', 'oil', 'sauce', 'soup', 'beans', 'lentil', 'oat', 'cereal', 'sugar', 'salt', 'vinegar', 'mayo', 'ketchup', 'mustard', 'dressing'],
  snacks:    ['chips', 'doritos', 'crackers', 'cookies', 'candy', 'chocolate', 'popcorn', 'nuts', 'granola', 'bar', 'pretzels'],
  beverages: ['water', 'juice', 'soda', 'coffee', 'tea', 'gatorade', 'red bull', 'energy', 'drink', 'lemonade', 'kombucha', 'beer', 'wine'],
  household: ['paper', 'towel', 'tissue', 'toilet', 'detergent', 'soap', 'shampoo', 'toothpaste', 'dish', 'cleaner', 'sponge', 'bag', 'wrap', 'foil', 'pods', 'tide', 'dawn'],
  frozen:    ['frozen', 'pizza', 'ice cream', 'waffles', 'burritos'],
};

function categoriseItem(name) {
  const lower = name.toLowerCase();
  for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some(k => lower.includes(k))) return cat;
  }
  return 'other';
}

export default function ReceiptUploadScreen({ navigation }) {
  const [step, setStep] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedItems, setParsedItems] = useState([]);
  const [totalAmount, setTotalAmount] = useState(0);
  const [storeName, setStoreName] = useState('');
  const [smartPrompt, setSmartPrompt] = useState(null);
  const [manualTotal, setManualTotal] = useState('');
  const [manualStore, setManualStore] = useState('');
  const [creditsEarned, setCreditsEarned] = useState(0);
  // NEW: State to hold receipt image URI for sharing
  const [receiptImageUri, setReceiptImageUri] = useState(null);

  const stackItems = parsedItems.filter(i => i.onStack);
  const unplannedItems = parsedItems.filter(i => !i.onStack);
  // Real savings: sum of save_cents for matched stack items (set during OCR processing)
  const totalSaved = stackItems.reduce((s, i) => s + (i.save_cents || 0), 0);

  // Pick image from camera or library and run real Gemini OCR
  const handleCameraUpload = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Denied', 'Snippd needs camera access to scan receipts.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      base64: true,       // Required for Gemini Vision API
      allowsEditing: false,
    });
    if (!result.canceled && result.assets?.[0]) {
      setReceiptImageUri(result.assets[0].uri);
      await processReceiptWithGemini(result.assets[0].base64, result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const handleGalleryUpload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission Denied', 'Snippd needs photo library access.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.8,
      base64: true,
      mediaTypes: ['images'],
    });
    if (!result.canceled && result.assets?.[0]) {
      setReceiptImageUri(result.assets[0].uri);
      await processReceiptWithGemini(result.assets[0].base64, result.assets[0].mimeType || 'image/jpeg');
    }
  };

  const processReceiptWithGemini = async (base64Data, mimeType) => {
    setUploading(true);
    try {
      // Get user session for authenticated call to gemini-proxy
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      setUploading(false);
      setParsing(true);

      // Call Supabase gemini-proxy Edge Function with base64 image
      const response = await fetch(`${SUPABASE_URL}/functions/v1/gemini-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageBase64: base64Data, mimeType }),
      });

      if (!response.ok) throw new Error(`Gemini proxy error: ${response.status}`);

      const data = await response.json();
      if (!data?.items?.length) throw new Error('No items found on receipt');

      // Fetch user's shopping list to match against
      const { data: { user } } = await supabase.auth.getUser();
      const { data: listItems } = await supabase
        .from('shopping_list_items')
        .select('name, price_cents, store, from_stack')
        .eq('user_id', user.id);

      // Fetch active deals from app_home_feed to compute real savings
      const { data: feedDeals } = await supabase
        .from('app_home_feed')
        .select('title, pay_price, save_price, retailer')
        .eq('status', 'active')
        .eq('verification_status', 'verified_live');

      // Convert Gemini items (price in dollars) → internal format (cents)
      // Match each item against shopping list & feed deals
      const enrichedItems = data.items.map(item => {
        const priceCents = Math.round((parseFloat(item.price) || 0) * 100);
        const nameLower  = (item.name || '').toLowerCase();

        // Match against user's shopping list
        const listMatch = (listItems || []).find(l =>
          l.name.toLowerCase().split(' ').some(word =>
            word.length > 3 && nameLower.includes(word)
          )
        );

        // Match against live deals for save_cents
        const dealMatch = (feedDeals || []).find(d =>
          d.title.toLowerCase().split(' ').some(word =>
            word.length > 3 && nameLower.includes(word)
          )
        );

        const onStack   = !!(listMatch?.from_stack || dealMatch);
        const save_cents = dealMatch
          ? Math.round(parseFloat(dealMatch.save_price || 0) * 100)
          : listMatch?.from_stack ? Math.round(priceCents * 0.15) : 0;  // 15% estimate if on list but no deal data

        return {
          name:      item.name,
          price:     priceCents,
          quantity:  item.quantity || 1,
          category:  categoriseItem(item.name),
          onStack,
          save_cents,
          stackName: dealMatch ? (dealMatch.retailer || 'Snippd Deal') : listMatch?.from_stack ? 'Your Stack' : null,
        };
      });

      // Infer store name from store chip selection (manualStore) if set, else use generic
      const inferredStore = manualStore || 'Grocery Store';
      const calculatedTotal = enrichedItems.reduce((s, i) => s + i.price * (i.quantity || 1), 0);

      setParsedItems(enrichedItems);
      setTotalAmount(calculatedTotal);
      setStoreName(inferredStore);
      setStep(2);

    } catch (e) {
      console.error('[Receipt OCR]', e.message);
      Alert.alert(
        'Could Not Read Receipt',
        'Make sure the receipt is well-lit and the text is clear, then try again. You can also enter the total manually.',
        [{ text: 'OK' }]
      );
    } finally {
      setUploading(false);
      setParsing(false);
    }
  };

  // NEW: VIRAL SHARE LOGIC
  const handleShareWin = async () => {
    const shareMessage = `I just saved ${fmt(totalSaved)} at ${storeName} using Snippd! 🚀 #SnippdPro #SaveSmart`;
    if (!(await Sharing.isAvailableAsync())) {
      Alert.alert("Share Unavailable", "Sharing is not available on this device.");
      return;
    }
    await Sharing.shareAsync(receiptImageUri || '', { dialogTitle: 'Share your Win!', message: shareMessage });
  };


  const handleManualEntry = () => {
    if (!manualStore || !manualTotal) {
      Alert.alert('Missing info', 'Please select a store and enter the total amount.');
      return;
    }
    setStoreName(manualStore);
    setTotalAmount(Math.round(parseFloat(manualTotal.replace('$', '').replace(',', '')) * 100));
    setParsedItems([]);
    setStep(2);
  };

  const confirmReceipt = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const now = new Date().toISOString();

      // 1. Insert receipt_summary row
      const { data: summary, error: summaryErr } = await supabase
        .from('receipt_summaries')
        .insert({
          user_id:      user.id,
          store_name:   storeName,
          total_cents:  totalAmount,
          created_at:   now,
        })
        .select('id')
        .single();

      if (summaryErr) console.warn('[Receipt] summary insert:', summaryErr.message);

      const receiptId = summary?.id ?? null;

      // 2. Insert individual receipt_items
      if (parsedItems.length > 0) {
        const itemRows = parsedItems.map(item => ({
          user_id:      user.id,
          receipt_id:   receiptId,
          name:         item.name,
          amount_cents: item.price,
          quantity:     item.quantity || 1,
          category:     item.category || 'other',
          store_name:   storeName,
          purchased_at: now,
        }));
        const { error: itemsErr } = await supabase.from('receipt_items').insert(itemRows);
        if (itemsErr) console.warn('[Receipt] items insert:', itemsErr.message);
      }

      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.id) {
        tracker.trackReceiptUploaded({
          user_id: session.user.id,
          session_id: session.access_token || String(Date.now()),
          screen_name: 'ReceiptUploadScreen',
          store_name: storeName,
          total_amount_cents: totalAmount,
          item_count: parsedItems.length,
        });

        tracker.trackPurchaseCompleted({
          user_id:         session.user.id,
          session_id:      session.access_token || String(Date.now()),
          screen_name:     'ReceiptUploadScreen',
          retailer_key:    storeName.toLowerCase().replace(/\s+/g, '_'),
          cart_value_cents: totalAmount,
          savings_cents:   totalSaved,
          item_count:      parsedItems.length,
        });
      }

      // 3. Insert trip_result row
      const { error: tripErr } = await supabase.from('trip_results').insert({
        user_id:              user.id,
        store_name:           storeName,
        total_spent_cents:    totalAmount,
        total_savings_cents:  totalSaved,
        items_on_stack:       stackItems.length,
        items_unplanned:      unplannedItems.length,
        verified_at:          now,
      });
      if (tripErr) console.warn('[Receipt] trip insert:', tripErr.message);

      // 4. Award Stash Credits via RPC (uses issue_credits SECURITY DEFINER)
      //    Base 25 + 5 per stack item, capped at 75
      const rawCredits = 25 + Math.min(stackItems.length, 10) * 5;
      const credits = Math.min(rawCredits, 75);
      setCreditsEarned(credits);

      const idempotencyKey = `receipt_${receiptId || Date.now()}_${user.id}`;
      const { error: creditErr } = await supabase.rpc('issue_credits', {
        p_user_id:      user.id,
        p_amount:       credits,
        p_type:         'earn',
        p_source:       'receipt_verification',
        p_reference_id: receiptId,
        p_idempotency:  idempotencyKey,
        p_issued_by:    'system',
      });

      // Fallback: direct update if RPC not yet deployed
      if (creditErr) {
        const { data: profileData } = await supabase
          .from('profiles')
          .select('stash_credits, total_savings_cents')
          .eq('user_id', user.id)
          .single();

        await supabase.from('profiles').update({
          stash_credits:        (profileData?.stash_credits || 0) + credits,
          total_savings_cents:  (profileData?.total_savings_cents || 0) + totalSaved,
        }).eq('user_id', user.id);
      } else {
        // Update total_savings_cents separately (issue_credits only handles stash_credits)
        await supabase.rpc('increment_savings', {
          p_user_id: user.id,
          p_amount:  totalSaved,
        }).catch(() => {
          // Fallback: direct update
          supabase
            .from('profiles')
            .select('total_savings_cents')
            .eq('user_id', user.id)
            .single()
            .then(({ data }) => {
              supabase.from('profiles').update({
                total_savings_cents: (data?.total_savings_cents || 0) + totalSaved,
              }).eq('user_id', user.id);
            });
        });
      }

      // 5. Pick smart prompt based on actual trip data
      if (unplannedItems.length >= 2) {
        setSmartPrompt(SMART_PROMPTS[1]);   // Stash Insight — add those deals
      } else if (totalAmount > 15000) {
        setSmartPrompt(SMART_PROMPTS[0]);   // Over budget alert
      } else if (totalAmount < 5000) {
        setSmartPrompt(SMART_PROMPTS[3]);   // Under budget — bank savings
      } else {
        setSmartPrompt(SMART_PROMPTS[2]);   // New store detected
      }

      setStep(3);
    } catch (e) {
      console.error('[confirmReceipt]', e.message);
      Alert.alert('Error', 'There was a problem saving your receipt. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSmartPrompt = () => {
    setStep(4);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Verify Receipt</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ── STEP INDICATOR ──────────────────────────────────────────────── */}
      <View style={styles.stepIndicator}>
        {STEP_LABELS.map((label, idx) => {
          const s = idx + 1;
          const isComplete = step > s;
          const isActive = step === s;
          return (
            <React.Fragment key={label}>
              <View style={styles.stepItem}>
                <View style={[
                  styles.stepDot,
                  isActive && styles.stepDotActive,
                  isComplete && styles.stepDotDone,
                ]}>
                  <Text style={[
                    styles.stepDotTxt,
                    (isActive || isComplete) && styles.stepDotTxtOn,
                  ]}>
                    {isComplete ? '✓' : String(s)}
                  </Text>
                </View>
                <Text style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                ]}>
                  {label}
                </Text>
              </View>
              {idx < STEP_LABELS.length - 1 && (
                <View style={[styles.stepLine, step > s && styles.stepLineDone]} />
              )}
            </React.Fragment>
          );
        })}
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

          {/* ── STEP 1 — UPLOAD ───────────────────────────────────────────── */}
          {step === 1 && (
            <View style={styles.pad}>

              <Text style={styles.sectionTitle}>Upload Your Receipt</Text>
              <Text style={styles.sectionSub}>
                Take a photo or upload from your camera roll. Our AI scans and verifies your savings automatically.
              </Text>

              {/* Upload box */}
              <TouchableOpacity
                style={styles.uploadBox}
                onPress={handleCameraUpload}
                activeOpacity={0.85}
                disabled={uploading || parsing}
              >
                {uploading || parsing ? (
                  <View style={styles.uploadLoading}>
                    <ActivityIndicator size="large" color={GREEN} />
                    <Text style={styles.uploadLoadingTitle}>
                      {uploading ? 'Reading receipt...' : 'Gemini AI scanning...'}
                    </Text>
                    <Text style={styles.uploadLoadingSub}>
                      {uploading
                        ? 'Preparing image for AI'
                        : 'Matching items to your stacks'}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.uploadContent}>
                    <View style={styles.uploadIconCircle}>
                      <Feather name="camera" size={28} color={GREEN} />
                    </View>
                    <Text style={styles.uploadTitle}>Tap to Take Photo</Text>
                    <Text style={styles.uploadSub}>Point camera at your receipt</Text>
                  </View>
                )}
              </TouchableOpacity>

              {/* Gallery fallback */}
              <TouchableOpacity
                style={styles.galleryBtn}
                onPress={handleGalleryUpload}
                disabled={uploading || parsing}
              >
                <Feather name="image" size={15} color={NAVY} />
                <Text style={styles.galleryBtnTxt}>Choose from Photo Library</Text>
              </TouchableOpacity>

              {/* Divider */}
              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerTxt}>or enter manually</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Store picker */}
              <Text style={styles.inputLabel}>Select Store</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.storeChips}
              >
                {STORES.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[styles.storeChip, manualStore === s && styles.storeChipOn]}
                    onPress={() => setManualStore(s)}
                  >
                    <Text style={[
                      styles.storeChipTxt,
                      manualStore === s && styles.storeChipTxtOn,
                    ]}>
                      {s}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              {/* Total input */}
              <Text style={styles.inputLabel}>Total Amount</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. 47.82"
                placeholderTextColor="#C4C9D6"
                value={manualTotal}
                onChangeText={setManualTotal}
                keyboardType="decimal-pad"
              />

              {manualStore && manualTotal ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleManualEntry}>
                  <Text style={styles.primaryBtnTxt}>Continue with Manual Entry</Text>
                </TouchableOpacity>
              ) : null}

              {/* How it works */}
              <View style={styles.howCard}>
                <Text style={styles.howTitle}>How receipt verification works</Text>
                {[
                  'Our AI scans your receipt and matches items to your stacks',
                  'Unplanned purchases are flagged to improve future recommendations',
                  'Verified receipts contribute to the Snippd $1B Community Savings Mission',
                  'Price differences are logged to detect store price changes over time',
                  'You earn 25 Stash Credits per verified receipt plus 5 per stack item',
                ].map((item, i) => (
                  <View key={i} style={styles.howRow}>
                    <View style={styles.howDot} />
                    <Text style={styles.howTxt}>{item}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* ── STEP 2 — REVIEW ───────────────────────────────────────────── */}
          {step === 2 && (
            <View style={styles.pad}>
              <Text style={styles.sectionTitle}>Review Your Items</Text>
              <Text style={styles.sectionSub}>
                {parsedItems.length > 0
                  ? `We found ${parsedItems.length} items from ${storeName}. Review and confirm to complete verification.`
                  : `Manual entry for ${storeName}. Confirm to complete verification.`}
              </Text>

              {/* Summary boxes */}
              <View style={styles.summaryRow}>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryVal}>{fmt(totalAmount)}</Text>
                  <Text style={styles.summaryLabel}>Total Spent</Text>
                </View>
                <View style={[styles.summaryBox, styles.summaryBoxMid]}>
                  <Text style={[styles.summaryVal, { color: GREEN }]}>
                    {fmt(totalSaved)}
                  </Text>
                  <Text style={styles.summaryLabel}>Snippd Saved</Text>
                </View>
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryVal}>{stackItems.length}</Text>
                  <Text style={styles.summaryLabel}>Stack Items</Text>
                </View>
              </View>

              {/* Stack items */}
              {stackItems.length > 0 && (
                <>
                  <View style={styles.groupHead}>
                    <View style={styles.groupDot} />
                    <Text style={styles.groupLabel}>STACK ITEMS</Text>
                    <View style={styles.groupCountBadge}>
                      <Text style={styles.groupCountTxt}>{stackItems.length}</Text>
                    </View>
                  </View>
                  <View style={styles.itemsCard}>
                    {stackItems.map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.itemRow,
                          i === stackItems.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={styles.itemCheckCircle}>
                          <Text style={styles.itemCheckTxt}>✓</Text>
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          {item.stackName && (
                            <View style={styles.stackPill}>
                              <Text style={styles.stackPillTxt}>{item.stackName}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Unplanned items */}
              {unplannedItems.length > 0 && (
                <>
                  <View style={[styles.groupHead, { marginTop: 16 }]}>
                    <View style={[styles.groupDot, { backgroundColor: AMBER }]} />
                    <Text style={[styles.groupLabel, { color: '#D97706' }]}>
                      UNPLANNED PURCHASES
                    </Text>
                    <View style={[styles.groupCountBadge, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.groupCountTxt, { color: '#D97706' }]}>
                        {unplannedItems.length}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.unplannedNote}>
                    These items were not on your stack. We will use this to improve your future recommendations.
                  </Text>
                  <View style={styles.itemsCard}>
                    {unplannedItems.map((item, i) => (
                      <View
                        key={i}
                        style={[
                          styles.itemRow,
                          i === unplannedItems.length - 1 && { borderBottomWidth: 0 },
                        ]}
                      >
                        <View style={[styles.itemCheckCircle, styles.itemCheckCircleWarn]}>
                          <Text style={[styles.itemCheckTxt, { color: '#D97706' }]}>!</Text>
                        </View>
                        <View style={styles.itemInfo}>
                          <Text style={styles.itemName}>{item.name}</Text>
                          <Text style={styles.unplannedLabel}>Not on your stack</Text>
                        </View>
                        <Text style={styles.itemPrice}>{fmt(item.price)}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* Credits preview */}
              <View style={styles.creditsPreview}>
                <View style={styles.creditsPreviewLeft}>
                  <Text style={styles.creditsPreviewTitle}>Stash Credits to earn</Text>
                  <Text style={styles.creditsPreviewSub}>
                    25 base + {Math.min(stackItems.length, 10) * 5} for stack items
                  </Text>
                </View>
                <Text style={styles.creditsPreviewVal}>
                  +{Math.min(25 + stackItems.length * 5, 75)}
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.primaryBtn, saving && styles.primaryBtnDisabled]}
                onPress={confirmReceipt}
                disabled={saving}
              >
                {saving
                  ? <ActivityIndicator color={WHITE} size="small" />
                  : <Text style={styles.primaryBtnTxt}>Confirm and Verify Receipt</Text>
                }
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setStep(1)}
              >
                <Text style={styles.secondaryBtnTxt}>Re-upload Receipt</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── STEP 3 — SMART INSIGHT ────────────────────────────────────── */}
          {step === 3 && smartPrompt && (
            <View style={styles.pad}>
              <View style={styles.insightCard}>
                <View style={styles.insightIconWrap}>
                  <Text style={styles.insightIconTxt}>SI</Text>
                </View>
                <Text style={styles.insightEyebrow}>STASH INSIGHT</Text>
                <Text style={styles.insightTitle}>{smartPrompt.title}</Text>
                <Text style={styles.insightQuestion}>{smartPrompt.question}</Text>
                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => handleSmartPrompt('yes')}
                >
                  <Text style={styles.primaryBtnTxt}>{smartPrompt.yes}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => handleSmartPrompt('no')}
                >
                  <Text style={styles.secondaryBtnTxt}>{smartPrompt.no}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── STEP 4 — VERIFIED ─────────────────────────────────────────── */}
          {step === 4 && (
            <View style={styles.pad}>

              {/* Success card */}
              <View style={styles.verifiedCard}>
                <View style={styles.verifiedIconWrap}>
                  <View style={styles.verifiedIconCircle}>
                    <Text style={styles.verifiedIconTxt}>✓</Text>
                  </View>
                </View>

                <Text style={styles.verifiedTitle}>Receipt Verified</Text>
                <Text style={styles.verifiedSub}>
                  Your savings have been logged and are contributing to the Snippd Community Savings Mission.
                </Text>

                {/* NEW: WIN-CARD PREVIEW FOR VIRAL REACH */}
                <View style={styles.winCardPreview}>
                  <LinearGradient colors={[DARK_SECTION, '#065F2E']} style={styles.winCardInner}>
                    <Text style={styles.winCardLabel}>TOTAL SAVINGS</Text>
                    <Text style={styles.winCardAmt}>{fmt(totalSaved)}</Text>
                    <View style={styles.winCardBottom}>
                      <Text style={styles.winCardBrand}>SNIPPD</Text>
                      <Text style={styles.winCardTag}>#SaveSmart</Text>
                    </View>
                  </LinearGradient>
                </View>

                <TouchableOpacity style={styles.shareBtnViral} onPress={handleShareWin}>
                   <Feather name="share-2" size={18} color={WHITE} />
                   <Text style={styles.shareBtnViralTxt}>SHARE MY WIN TO UNLOCK PRO</Text>
                </TouchableOpacity>

                {/* Stats */}
                <View style={styles.verifiedStats}>
                  <View style={styles.verifiedStat}>
                    <Text style={styles.verifiedStatVal}>{fmt(totalSaved)}</Text>
                    <Text style={styles.verifiedStatLabel}>Saved this trip</Text>
                  </View>
                  <View style={styles.verifiedStatDivider} />
                  <View style={styles.verifiedStat}>
                    <Text style={[styles.verifiedStatVal, { color: GREEN }]}>
                      +{creditsEarned || Math.min(25 + stackItems.length * 5, 75)}
                    </Text>
                    <Text style={styles.verifiedStatLabel}>Stash Credits earned</Text>
                  </View>
                  <View style={styles.verifiedStatDivider} />
                  <View style={styles.verifiedStat}>
                    <Text style={styles.verifiedStatVal}>{stackItems.length}</Text>
                    <Text style={styles.verifiedStatLabel}>Stack items verified</Text>
                  </View>
                </View>

                {/* Mission contribution */}
                <View style={styles.missionContrib}>
                  <Text style={styles.missionContribEyebrow}>YOUR CONTRIBUTION</Text>
                  <Text style={styles.missionContribAmt}>
                    {fmt(totalSaved)} added to the $1B mission
                  </Text>
                  <View style={styles.missionContribBar}>
                    <View style={[styles.missionContribFill, { width: '1%' }]} />
                  </View>
                </View>

                <TouchableOpacity
                  style={styles.primaryBtn}
                  onPress={() => navigation.navigate('HomeTab')}
                >
                  <Text style={styles.primaryBtnTxt}>Back to Home</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.secondaryBtn}
                  onPress={() => navigation.navigate('StudioTab')}
                >
                  <Text style={styles.secondaryBtnTxt}>Share Your Savings Story</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}

          <View style={{ height: 100 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  scroll: { paddingBottom: 40 },
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

  // STEP INDICATOR
  stepIndicator: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 16,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  stepItem: { alignItems: 'center', gap: 4 },
  stepDot: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: BORDER,
  },
  stepDotActive: { backgroundColor: NAVY, borderColor: NAVY },
  stepDotDone: { backgroundColor: GREEN, borderColor: GREEN },
  stepDotTxt: { fontSize: 12, fontWeight: 'bold', color: GRAY },
  stepDotTxtOn: { color: WHITE },
  stepLabel: { fontSize: 9, fontWeight: 'bold', color: GRAY, letterSpacing: 0.3 },
  stepLabelActive: { color: NAVY, fontWeight: 'bold' },
  stepLine: { flex: 1, height: 2, backgroundColor: BORDER, marginHorizontal: 4, marginBottom: 14 },
  stepLineDone: { backgroundColor: GREEN },

  // SECTION
  sectionTitle: { fontSize: 20, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  sectionSub: { fontSize: 14, color: GRAY, lineHeight: 21, marginBottom: 20 },

  // UPLOAD BOX
  uploadBox: {
    backgroundColor: WHITE, borderRadius: 20, padding: 36,
    alignItems: 'center', borderWidth: 2, borderColor: BORDER,
    borderStyle: 'dashed', marginBottom: 12, ...SHADOW,
  },
  galleryBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, marginBottom: 20,
    backgroundColor: OFF_WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
  },
  galleryBtnTxt: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  uploadLoading: { alignItems: 'center', gap: 12 },
  uploadLoadingTitle: { fontSize: 15, fontWeight: 'bold', color: NAVY },
  uploadLoadingSub: { fontSize: 12, color: GRAY },
  uploadContent: { alignItems: 'center', gap: 10 },
  uploadIconCircle: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 4,
  },
  uploadIconTxt: { fontSize: 32, fontWeight: 'normal', color: GREEN, lineHeight: 38 },
  uploadTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY },
  uploadSub: { fontSize: 12, color: GRAY },

  // DIVIDER
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 16, gap: 10 },
  dividerLine: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerTxt: { fontSize: 12, color: GRAY },

  // INPUTS
  inputLabel: {
    fontSize: 12, fontWeight: 'bold', color: GRAY,
    marginBottom: 8, marginTop: 4,
  },
  input: {
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 15, color: NAVY, marginBottom: 14,
  },
  storeChips: { gap: 8, paddingBottom: 14 },
  storeChip: {
    backgroundColor: WHITE, borderRadius: 20,
    paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1.5, borderColor: BORDER, ...SHADOW_SM,
  },
  storeChipOn: { backgroundColor: GREEN, borderColor: GREEN },
  storeChipTxt: { fontSize: 13, fontWeight: 'normal', color: NAVY },
  storeChipTxtOn: { color: WHITE },

  // HOW IT WORKS
  howCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 16,
    borderWidth: 1, borderColor: BORDER, marginTop: 8, ...SHADOW_SM,
  },
  howTitle: { fontSize: 13, fontWeight: 'bold', color: NAVY, marginBottom: 12 },
  howRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  howDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 5 },
  howTxt: { flex: 1, fontSize: 12, color: GRAY, lineHeight: 19 },

  // SUMMARY ROW
  summaryRow: {
    flexDirection: 'row', backgroundColor: WHITE,
    borderRadius: 18, marginBottom: 20,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  summaryBox: { flex: 1, padding: 16, alignItems: 'center' },
  summaryBoxMid: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: BORDER },
  summaryVal: { fontSize: 17, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  summaryLabel: { fontSize: 10, color: GRAY, textAlign: 'center' },

  // GROUP HEADERS
  groupHead: {
    flexDirection: 'row', alignItems: 'center',
    gap: 8, marginBottom: 8,
  },
  groupDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN },
  groupLabel: {
    fontSize: 10, fontWeight: 'bold', color: NAVY,
    letterSpacing: 1.5, flex: 1,
  },
  groupCountBadge: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  groupCountTxt: { fontSize: 10, fontWeight: 'bold', color: GREEN },
  unplannedNote: { fontSize: 12, color: '#92400E', marginBottom: 8, lineHeight: 18 },

  // ITEMS CARD
  itemsCard: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    marginBottom: 12, ...SHADOW,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
    gap: 10,
  },
  itemCheckCircle: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: LIGHT_GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  itemCheckCircleWarn: { backgroundColor: '#FEF3C7' },
  itemCheckTxt: { fontSize: 13, fontWeight: 'bold', color: GREEN },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  stackPill: {
    backgroundColor: LIGHT_GREEN, borderRadius: 5,
    paddingHorizontal: 7, paddingVertical: 2,
    alignSelf: 'flex-start', marginTop: 3,
  },
  stackPillTxt: { fontSize: 9, fontWeight: 'bold', color: GREEN },
  unplannedLabel: { fontSize: 11, color: '#D97706', marginTop: 2 },
  itemPrice: { fontSize: 13, fontWeight: 'bold', color: NAVY },

  // CREDITS PREVIEW
  creditsPreview: {
    backgroundColor: LIGHT_GREEN, borderRadius: 14, padding: 14,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', marginBottom: 16,
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  creditsPreviewLeft: {},
  creditsPreviewTitle: { fontSize: 13, fontWeight: 'bold', color: NAVY },
  creditsPreviewSub: { fontSize: 11, color: GRAY, marginTop: 2 },
  creditsPreviewVal: { fontSize: 24, fontWeight: 'bold', color: GREEN },

  // INSIGHT CARD
  insightCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER, ...SHADOW,
    gap: 12,
  },
  insightIconWrap: { marginBottom: 4 },
  insightIconTxt: { fontSize: 22, fontWeight: 'bold', color: GREEN },
  insightEyebrow: { fontSize: 9, fontWeight: 'bold', color: GREEN, letterSpacing: 1.5 },
  insightTitle: { fontSize: 20, fontWeight: 'bold', color: NAVY },
  insightQuestion: {
    fontSize: 16, fontWeight: 'normal', color: NAVY,
    textAlign: 'center', lineHeight: 24,
  },

  // VERIFIED CARD
  verifiedCard: {
    backgroundColor: WHITE, borderRadius: 20, padding: 24,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER, ...SHADOW,
    gap: 12,
  },
  verifiedIconWrap: { marginBottom: 4 },
  verifiedIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    ...SHADOW,
  },
  verifiedIconTxt: { fontSize: 32, fontWeight: 'bold', color: WHITE },
  verifiedTitle: { fontSize: 24, fontWeight: 'bold', color: NAVY },
  verifiedSub: {
    fontSize: 14, color: GRAY, textAlign: 'center',
    lineHeight: 21,
  },
  verifiedStats: {
    flexDirection: 'row', backgroundColor: PALE_GREEN,
    borderRadius: 14, padding: 16, width: '100%',
    justifyContent: 'space-around',
    borderWidth: 1, borderColor: '#A7F3D0',
  },
  verifiedStat: { alignItems: 'center', flex: 1 },
  verifiedStatVal: { fontSize: 18, fontWeight: 'bold', color: NAVY, marginBottom: 3 },
  verifiedStatLabel: { fontSize: 9, color: GRAY, textAlign: 'center', lineHeight: 14 },
  verifiedStatDivider: { width: 1, backgroundColor: BORDER },

  // MISSION CONTRIBUTION
  missionContrib: {
    backgroundColor: NAVY, borderRadius: 14, padding: 16,
    width: '100%',
  },
  missionContribEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.5)',
    letterSpacing: 1.5, marginBottom: 4,
  },
  missionContribAmt: { fontSize: 14, fontWeight: 'bold', color: WHITE, marginBottom: 10 },
  missionContribBar: { height: 4, backgroundColor: 'rgba(255,255,255,0.15)', borderRadius: 2 },
  missionContribFill: { height: 4, backgroundColor: GREEN, borderRadius: 2 },

  // BUTTONS
  primaryBtn: {
    backgroundColor: GREEN, borderRadius: 14,
    paddingVertical: 16, alignItems: 'center',
    width: '100%', marginTop: 4,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  primaryBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  primaryBtnTxt: { color: WHITE, fontSize: 15, fontWeight: 'bold' },
  secondaryBtn: {
    backgroundColor: WHITE, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center',
    width: '100%', borderWidth: 1.5, borderColor: GREEN,
  },
  secondaryBtnTxt: { color: GREEN, fontSize: 14, fontWeight: 'bold' },

  // NEW VIRAL WIN-CARD STYLES
  winCardPreview: { width: '100%', marginVertical: 10 },
  winCardInner: { padding: 24, borderRadius: 24, alignItems: 'center', ...SHADOW },
  winCardLabel: { color: GREEN, fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
  winCardAmt: { color: WHITE, fontSize: 48, fontWeight: 'bold', marginVertical: 4 },
  winCardBottom: { flexDirection: 'row', width: '100%', justifyContent: 'space-between', marginTop: 10 },
  winCardBrand: { color: WHITE, fontWeight: 'bold', fontSize: 14 },
  winCardTag: { color: GREEN, fontWeight: 'bold', fontSize: 14 },
  shareBtnViral: { backgroundColor: GREEN, width: '100%', height: 60, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginVertical: 10, ...SHADOW },
  shareBtnViralTxt: { color: WHITE, fontWeight: 'bold', fontSize: 13, letterSpacing: 0.5 }
});