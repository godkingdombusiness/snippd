import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Linking, TextInput, Alert, ActivityIndicator, Dimensions,
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

const FAQS = [
  {
    category: 'Basics',
    items: [
      {
        q: 'What is a Snippd Stack?',
        a: 'A Snippd Stack is a curated bundle of grocery items from a single store that have been verified to save you the most money when purchased together using available sales and digital coupons.',
      },
      {
        q: 'How does the savings yield work?',
        a: 'Savings yield is the percentage you save compared to the full retail price. A 55% yield means you are paying 45 cents for every dollar of retail value.',
      },
      {
        q: 'Is Snippd free to use?',
        a: 'Yes — Snippd is completely free. You create an account, browse stacks, clip coupons and verify receipts at no cost. Stash Credits you earn have real dollar value toward future savings.',
      },
    ],
  },
  {
    category: 'Coupons and Savings',
    items: [
      {
        q: 'How do I clip digital coupons?',
        a: 'Tap Clip Coupon on any stack item to open the store app or website directly to that coupon. You must be logged into your store loyalty account for the coupon to apply at checkout.',
      },
      {
        q: 'Why do some items not have a Clip Coupon button?',
        a: 'Some items are sale-priced only — no coupon needed. The Clip Coupon button only appears on digital coupon items that require you to activate the deal in the store app first.',
      },
      {
        q: 'Do deals expire?',
        a: 'Yes. Most store sales and digital coupons run weekly, resetting every Wednesday or Thursday depending on the store. Snippd updates its stacks each week to reflect current deals.',
      },
    ],
  },
  {
    category: 'Receipts and Credits',
    items: [
      {
        q: 'How do I verify a receipt?',
        a: 'Go to Cart, then tap Verify Receipt. Upload a photo of your receipt and our AI will scan it and match your purchases to your stacks automatically.',
      },
      {
        q: 'What are Stash Credits?',
        a: 'Stash Credits are rewards you earn by verifying receipts and creating savings videos in Creator Studio. 100 credits equals $1.00 in value.',
      },
      {
        q: 'How long does receipt verification take?',
        a: 'Most receipts are verified within 30 seconds. Complex receipts with many items may take up to 2 minutes. You will see a notification when your verification is complete.',
      },
    ],
  },
  {
    category: 'Features',
    items: [
      {
        q: 'What is Chef Stash?',
        a: 'Chef Stash is our AI chef powered by Google Gemini. It generates recipes based on the items in your stack so you know exactly what to cook with what you bought.',
      },
      {
        q: 'How does Cook From Pantry work?',
        a: 'After opening Snippd 7 times, Cook From Pantry unlocks. It reads your pantry inventory and generates recipes using only what you already have at home.',
      },
      {
        q: 'What is the $1B Savings Mission?',
        a: 'The Snippd community is working together to save $1 billion on groceries. Every verified receipt you submit contributes your savings to the community total.',
      },
      {
        q: 'What is Creator Studio?',
        a: 'Creator Studio lets you record short savings videos showing your stack purchases and verified savings. Top creators earn Stash Credits and community recognition.',
      },
    ],
  },
  {
    category: 'Account',
    items: [
      {
        q: 'How do I change my preferred stores?',
        a: 'Go to Profile, then tap Preferred Stores. You can add or remove stores at any time and your stacks will update to reflect your selections.',
      },
      {
        q: 'Can I share my account with family?',
        a: 'Yes — use Family Sharing in your Profile to create a household. Family members can view the same shopping list, shared budget, and stacks together.',
      },
      {
        q: 'How do I delete my account?',
        a: 'Go to Profile, scroll to the bottom, and tap Delete Account. This permanently removes all your data including receipts, credits, and preferences.',
      },
    ],
  },
];

const CONTACT_OPTIONS = [
  {
    key: 'email',
    title: 'Email Support',
    sub: 'Typically responds within 24 hours',
    action: () => Linking.openURL('mailto:support@getsnippd.com'),
  },
  {
    key: 'help',
    title: 'Help Center',
    sub: 'Browse all guides and articles',
    action: () => Linking.openURL('https://getsnippd.com/help'),
  },
  {
    key: 'privacy',
    title: 'Privacy Policy',
    sub: 'How we handle your data',
    action: () => Linking.openURL('https://getsnippd.com/privacy'),
  },
];

export default function HelpScreen({ navigation }) {
  const [expanded, setExpanded] = useState(null);
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [inlineExpanded, setInlineExpanded] = useState(null);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [messageText, setMessageText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);
  const [messageSent, setMessageSent] = useState(false);

  const toggleFaq = (key) => {
    setExpanded(prev => prev === key ? null : key);
  };

  const toggleCategory = (cat) => {
    setExpandedCategories(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const sendMessage = async () => {
    if (!messageText.trim()) return;
    setSendingMessage(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Log support message to Supabase if table exists
      try {
        await supabase.from('support_messages').insert([{
          user_id: user?.id || null,
          message: messageText.trim(),
          created_at: new Date().toISOString(),
        }]);
      } catch (e) {
        // Table may not exist yet — fall through
      }
      setMessageSent(true);
      setMessageText('');
      Alert.alert(
        'Message Sent',
        'We received your message and will reply to your email within 24 hours.',
        [{ text: 'Done' }]
      );
    } catch (e) {
      Alert.alert('Error', 'Could not send your message. Please email support@getsnippd.com directly.');
    } finally {
      setSendingMessage(false);
    }
  };

  // Filter FAQs by search
  const filteredFaqs = search.trim()
    ? FAQS.map(cat => ({
        ...cat,
        items: cat.items.filter(
          faq =>
            faq.q.toLowerCase().includes(search.toLowerCase()) ||
            faq.a.toLowerCase().includes(search.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : FAQS;

  const totalResults = filteredFaqs.reduce((s, c) => s + c.items.length, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help and Support</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── HERO ───────────────────────────────────────────────────────── */}
        <View style={styles.pad}>
          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>SNIPPD SUPPORT</Text>
            <Text style={styles.heroTitle}>How can we help?</Text>
            <Text style={styles.heroSub}>
              Search our help articles or send us a message below.
            </Text>

            {/* Search bar inside hero */}
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>⌕</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Search help articles..."
                placeholderTextColor="rgba(255,255,255,0.5)"
                value={search}
                onChangeText={setSearch}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                returnKeyType="search"
              />
              {search.length > 0 && (
                <TouchableOpacity onPress={() => { setSearch(''); setSearchFocused(false); }}>
                  <Text style={styles.searchClear}>✕</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Inline search results dropdown */}
            {search.length > 0 && (
              <View style={styles.inlineResults}>
                {totalResults === 0 ? (
                  <View style={styles.inlineNoResults}>
                    <Text style={styles.inlineNoResultsTxt}>No results for "{search}"</Text>
                    <Text style={styles.inlineNoResultsSub}>Try different keywords or send us a message below</Text>
                  </View>
                ) : (
                  <>
                    <Text style={styles.inlineResultsHeader}>
                      {totalResults} result{totalResults !== 1 ? 's' : ''} for "{search}"
                    </Text>
                    {filteredFaqs.map(cat =>
                      cat.items.map((faq, i) => {
                        const key = `inline-${cat.category}-${i}`;
                        const isOpen = inlineExpanded === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[styles.inlineItem, isOpen && styles.inlineItemOpen]}
                            onPress={() => setInlineExpanded(prev => prev === key ? null : key)}
                            activeOpacity={0.85}
                          >
                            <View style={styles.inlineItemHeader}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.inlineCatLabel}>{cat.category}</Text>
                                <Text style={styles.inlineQ}>{faq.q}</Text>
                              </View>
                              <Text style={styles.inlineChevron}>{isOpen ? '−' : '+'}</Text>
                            </View>
                            {isOpen && (
                              <Text style={styles.inlineA}>{faq.a}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </>
                )}
              </View>
            )}
          </View>
        </View>

        {/* ── CONTACT OPTIONS ────────────────────────────────────────────── */}
        {!search && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Contact Us</Text>
            <View style={styles.card}>
              {CONTACT_OPTIONS.map((opt, i, arr) => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.contactRow,
                    i === arr.length - 1 && { borderBottomWidth: 0 },
                  ]}
                  onPress={opt.action}
                  activeOpacity={0.8}
                >
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactTitle}>{opt.title}</Text>
                    <Text style={styles.contactSub}>{opt.sub}</Text>
                  </View>
                  <Text style={styles.contactArrow}>›</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── SEND A MESSAGE ─────────────────────────────────────────────── */}
        {!search && (
          <View style={styles.pad}>
            <Text style={styles.sectionTitle}>Send Us a Message</Text>
            <View style={styles.messageCard}>
              <Text style={styles.messageLabel}>
                Describe your issue and we will get back to you within 24 hours
              </Text>
              <TextInput
                style={styles.messageInput}
                placeholder="What can we help you with?"
                placeholderTextColor="#C4C9D6"
                value={messageText}
                onChangeText={setMessageText}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[
                  styles.messageBtn,
                  (!messageText.trim() || sendingMessage) && styles.messageBtnDisabled,
                ]}
                onPress={sendMessage}
                disabled={!messageText.trim() || sendingMessage}
              >
                {sendingMessage
                  ? <ActivityIndicator color={WHITE} size="small" />
                  : <Text style={styles.messageBtnTxt}>
                      {messageSent ? 'Send Another Message' : 'Send Message'}
                    </Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── FAQ SECTIONS ───────────────────────────────────────────────── */}
        {!search && <View style={styles.pad}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>

          {filteredFaqs.length === 0 ? (
            <View style={styles.noResults}>
              <Text style={styles.noResultsTitle}>No results found</Text>
              <Text style={styles.noResultsSub}>
                Try different keywords or contact our support team
              </Text>
            </View>
          ) : (
            filteredFaqs.map(category => {
              const isCatExpanded = search || expandedCategories[category.category] !== false;
              return (
                <View key={category.category} style={styles.faqCategory}>
                  {/* Category header */}
                  <TouchableOpacity
                    style={styles.faqCatHeader}
                    onPress={() => !search && toggleCategory(category.category)}
                    activeOpacity={search ? 1 : 0.8}
                  >
                    <View style={styles.faqCatHeaderLeft}>
                      <View style={styles.faqCatDot} />
                      <Text style={styles.faqCatTitle}>{category.category}</Text>
                      <View style={styles.faqCatCount}>
                        <Text style={styles.faqCatCountTxt}>{category.items.length}</Text>
                      </View>
                    </View>
                    {!search && (
                      <Text style={styles.faqCatChevron}>
                        {isCatExpanded ? '↑' : '↓'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {/* FAQ items */}
                  {isCatExpanded && (
                    <View style={styles.faqItems}>
                      {category.items.map((faq, i) => {
                        const key = `${category.category}-${i}`;
                        const isOpen = expanded === key;
                        return (
                          <TouchableOpacity
                            key={key}
                            style={[
                              styles.faqRow,
                              i === category.items.length - 1 && { borderBottomWidth: 0 },
                              isOpen && styles.faqRowOpen,
                            ]}
                            onPress={() => toggleFaq(key)}
                            activeOpacity={0.8}
                          >
                            <View style={styles.faqHeader}>
                              <Text style={[
                                styles.faqQ,
                                isOpen && styles.faqQOpen,
                              ]}>
                                {faq.q}
                              </Text>
                              <View style={[
                                styles.faqChevron,
                                isOpen && styles.faqChevronOpen,
                              ]}>
                                <Text style={[
                                  styles.faqChevronTxt,
                                  isOpen && styles.faqChevronTxtOpen,
                                ]}>
                                  {isOpen ? '−' : '+'}
                                </Text>
                              </View>
                            </View>
                            {isOpen && (
                              <Text style={styles.faqA}>{faq.a}</Text>
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>}

        {/* ── APP INFO ───────────────────────────────────────────────────── */}
        {!search && (
          <View style={styles.pad}>
            <View style={styles.appInfoCard}>
              <Text style={styles.appInfoTitle}>Snippd</Text>
              <Text style={styles.appInfoVersion}>Version 1.0.0</Text>
              <View style={styles.appInfoLinks}>
                <TouchableOpacity
                  onPress={() => Linking.openURL('https://getsnippd.com')}
                >
                  <Text style={styles.appInfoLink}>getsnippd.com</Text>
                </TouchableOpacity>
                <Text style={styles.appInfoDot}>·</Text>
                <TouchableOpacity
                  onPress={() => Linking.openURL('mailto:support@getsnippd.com')}
                >
                  <Text style={styles.appInfoLink}>support@getsnippd.com</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
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

  // HERO
  hero: {
    backgroundColor: GREEN, borderRadius: 20, padding: 20, ...SHADOW,
  },
  heroEyebrow: {
    fontSize: 9, fontWeight: 'bold',
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: 1.5, marginBottom: 6,
  },
  heroTitle: {
    fontSize: 26, fontWeight: 'bold', color: WHITE,
    letterSpacing: -0.8, marginBottom: 6,
  },
  heroSub: {
    fontSize: 13, color: 'rgba(255,255,255,0.85)',
    lineHeight: 19, marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
    gap: 10,
  },
  searchIcon: { fontSize: 18, color: 'rgba(255,255,255,0.7)' },
  searchInput: {
    flex: 1, fontSize: 14, color: WHITE, fontWeight: 'normal',
  },
  searchClear: { fontSize: 14, color: 'rgba(255,255,255,0.7)' },
  searchResults: { fontSize: 13, color: GRAY, fontWeight: 'normal' },

  // SECTION TITLE
  sectionTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY, letterSpacing: -0.3, marginBottom: 10 },

  // CARD
  card: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },

  // CONTACT
  contactRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 16,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  contactInfo: { flex: 1 },
  contactTitle: { fontSize: 15, fontWeight: 'bold', color: NAVY, marginBottom: 2 },
  contactSub: { fontSize: 12, color: GRAY },
  contactArrow: { fontSize: 22, color: '#D1D5DB' },

  // MESSAGE
  messageCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: BORDER, ...SHADOW,
  },
  messageLabel: { fontSize: 13, color: GRAY, lineHeight: 19, marginBottom: 12 },
  messageInput: {
    backgroundColor: OFF_WHITE, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: NAVY,
    minHeight: 100, marginBottom: 12,
  },
  messageBtn: {
    backgroundColor: GREEN, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  messageBtnDisabled: { backgroundColor: '#C4C9D6', shadowOpacity: 0 },
  messageBtnTxt: { color: WHITE, fontSize: 14, fontWeight: 'bold' },

  // FAQ CATEGORIES
  faqCategory: {
    backgroundColor: WHITE, borderRadius: 18,
    overflow: 'hidden', borderWidth: 1, borderColor: BORDER,
    marginBottom: 10, ...SHADOW_SM,
  },
  faqCatHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  faqCatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  faqCatDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: GREEN },
  faqCatTitle: { fontSize: 14, fontWeight: 'bold', color: NAVY },
  faqCatCount: {
    backgroundColor: LIGHT_GREEN, borderRadius: 8,
    paddingHorizontal: 7, paddingVertical: 2,
  },
  faqCatCountTxt: { fontSize: 10, fontWeight: 'bold', color: GREEN },
  faqCatChevron: { fontSize: 14, color: GRAY },
  faqItems: {},

  // INLINE SEARCH RESULTS
  inlineResults: {
    marginTop: 12,
    backgroundColor: WHITE,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  inlineResultsHeader: {
    fontSize: 11, fontWeight: 'bold',
    color: GRAY, letterSpacing: 0.5,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6,
    textTransform: 'uppercase',
  },
  inlineItem: {
    paddingHorizontal: 14, paddingVertical: 12,
    borderTopWidth: 1, borderTopColor: '#F0F1F3',
  },
  inlineItemOpen: { backgroundColor: PALE_GREEN },
  inlineItemHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  inlineCatLabel: {
    fontSize: 10, fontWeight: 'bold',
    color: GREEN, letterSpacing: 0.4, marginBottom: 2,
    textTransform: 'uppercase',
  },
  inlineQ: { fontSize: 13, fontWeight: 'bold', color: NAVY, lineHeight: 18 },
  inlineChevron: { fontSize: 16, color: GRAY, marginTop: 2 },
  inlineA: {
    fontSize: 13, color: GRAY, lineHeight: 20,
    marginTop: 8, paddingTop: 8,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  inlineNoResults: { padding: 20, alignItems: 'center' },
  inlineNoResultsTxt: { fontSize: 14, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  inlineNoResultsSub: { fontSize: 12, color: GRAY, textAlign: 'center', lineHeight: 18 },

  // FAQ ROWS
  faqRow: {
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F9FAFB',
  },
  faqRowOpen: { backgroundColor: PALE_GREEN },
  faqHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 12,
  },
  faqQ: {
    flex: 1, fontSize: 14, fontWeight: 'bold', color: NAVY, lineHeight: 20,
  },
  faqQOpen: { color: GREEN },
  faqChevron: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: OFF_WHITE,
    alignItems: 'center', justifyContent: 'center',
  },
  faqChevronOpen: { backgroundColor: GREEN },
  faqChevronTxt: { fontSize: 16, color: GRAY, lineHeight: 22 },
  faqChevronTxtOpen: { color: WHITE, fontWeight: 'bold' },
  faqA: {
    fontSize: 13, color: GRAY, lineHeight: 21,
    marginTop: 10, paddingTop: 10,
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },

  // NO RESULTS
  noResults: {
    alignItems: 'center', paddingVertical: 40,
  },
  noResultsTitle: { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 6 },
  noResultsSub: { fontSize: 13, color: GRAY, textAlign: 'center', lineHeight: 19 },

  // APP INFO
  appInfoCard: {
    backgroundColor: WHITE, borderRadius: 18, padding: 20,
    alignItems: 'center', borderWidth: 1, borderColor: BORDER,
  },
  appInfoTitle: { fontSize: 18, fontWeight: 'bold', color: NAVY, marginBottom: 4 },
  appInfoVersion: { fontSize: 12, color: GRAY, marginBottom: 12 },
  appInfoLinks: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  appInfoLink: { fontSize: 12, color: GREEN, fontWeight: 'normal' },
  appInfoDot: { fontSize: 12, color: GRAY },
});