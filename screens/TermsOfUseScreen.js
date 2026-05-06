/**
 * TermsOfUseScreen — Snippd Terms of Use
 *
 * Guideline compliance:
 *   5.6 Developer Code of Conduct — Terms of Use reachable from inside the app
 *
 * Linked from AuthScreen footer, ProfileScreen Support section, and
 * SnippdProScreen subscription disclosure.
 */

import React from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Linking, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN      = '#0C9E54';
const NAVY       = '#0D1B4B';
const WHITE      = '#FFFFFF';
const GRAY       = '#8A8F9E';
const OFF_WHITE  = '#F8F9FA';
const LIGHT_GREEN = '#E8F8F0';
const BORDER     = '#F0F1F3';

const LAST_UPDATED   = 'April 22, 2026';
const TERMS_VERSION  = '1.0';
const SUPPORT_EMAIL  = 'support@getsnippd.com';

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Body({ children }) {
  return <Text style={s.body}>{children}</Text>;
}

function Bullet({ children }) {
  return (
    <View style={s.bulletRow}>
      <Text style={s.bulletDot}>•</Text>
      <Text style={s.bulletTxt}>{children}</Text>
    </View>
  );
}

export default function TermsOfUseScreen({ navigation }) {
  const openEmail = () =>
    Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Terms%20of%20Use%20Question`);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Terms of Use</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Meta */}
        <View style={s.metaBox}>
          <Text style={s.metaLine}>Version {TERMS_VERSION} · Last updated {LAST_UPDATED}</Text>
          <Text style={s.metaLine}>Effective immediately for new users</Text>
        </View>

        <Body>
          By creating an account or using Snippd, you agree to these Terms of Use
          ("Terms"). Please read them carefully. If you do not agree, do not use the app.
        </Body>

        {/* ── 1 · Service ──────────────────────────────────────────────────── */}
        <Section title="1. About Snippd">
          <Body>
            Snippd is a personal grocery intelligence platform that helps users plan
            weekly meals, identify stackable coupon savings, track purchases, and earn
            loyalty credits. Snippd is operated by Snippd, Inc. ("we", "us", "our").
          </Body>
          <Body>
            Deal data, prices, and coupon stacks displayed in the app are sourced from
            publicly available retailer circulars and partner data feeds. Prices and
            availability may change; always verify at the register. Snippd does not
            guarantee the accuracy of any displayed price or saving.
          </Body>
        </Section>

        {/* ── 2 · Eligibility ──────────────────────────────────────────────── */}
        <Section title="2. Eligibility">
          <Body>
            You must be at least 13 years old to use Snippd. By using the app you
            represent that you are of legal age in your jurisdiction and have the
            authority to enter into these Terms.
          </Body>
        </Section>

        {/* ── 3 · Account ──────────────────────────────────────────────────── */}
        <Section title="3. Your Account">
          <Body>
            You are responsible for maintaining the confidentiality of your credentials
            and for all activity that occurs under your account. Notify us immediately
            at {SUPPORT_EMAIL} if you suspect unauthorised access.
          </Body>
          <Body>
            You may not share your account with others or create accounts on behalf of
            third parties without our written consent.
          </Body>
        </Section>

        {/* ── 4 · Snippd Pro Subscription ──────────────────────────────────── */}
        <Section title="4. Snippd Pro Subscription">
          <Body>
            Snippd Pro is an optional premium tier available as an auto-renewable
            in-app subscription through Apple.
          </Body>
          <Bullet>Price: $4.99 per month (subject to change; final price shown at purchase)</Bullet>
          <Bullet>Billing: charged to your Apple ID account at confirmation of purchase</Bullet>
          <Bullet>
            Renewal: automatically renews each month unless cancelled at least 24 hours
            before the end of the current period
          </Bullet>
          <Bullet>
            Cancellation: cancel any time via Settings → Apple ID → Subscriptions on
            your iPhone — no refunds for partial periods
          </Bullet>
          <Bullet>
            Free trial: any unused portion of a free trial is forfeited when you
            subscribe
          </Bullet>
          <Body>
            Subscription management and billing are handled entirely by Apple. Snippd
            does not process payment information directly.
          </Body>
        </Section>

        {/* ── 5 · Stash Credits ────────────────────────────────────────────── */}
        <Section title="5. Stash Credits">
          <Body>
            Stash Credits are in-app loyalty points awarded for verified purchases
            and certain in-app actions. Credits have no monetary value, are
            non-transferable, do not expire while your account is active, and cannot
            be exchanged for cash. We reserve the right to modify the credit programme
            at any time with reasonable notice.
          </Body>
        </Section>

        {/* ── 6 · Acceptable Use ───────────────────────────────────────────── */}
        <Section title="6. Acceptable Use">
          <Body>You agree not to:</Body>
          <Bullet>Scrape, crawl, or systematically extract data from Snippd</Bullet>
          <Bullet>Reverse-engineer, decompile, or disassemble any part of the app</Bullet>
          <Bullet>Use automated scripts or bots to interact with the service</Bullet>
          <Bullet>Circumvent any security or access-control mechanisms</Bullet>
          <Bullet>Submit false receipt data or manipulate credit awards</Bullet>
          <Bullet>Use Snippd for any unlawful purpose or in violation of any third-party rights</Bullet>
        </Section>

        {/* ── 7 · Intellectual Property ────────────────────────────────────── */}
        <Section title="7. Intellectual Property">
          <Body>
            All content, trademarks, logos, and software in Snippd are owned by or
            licensed to Snippd, Inc. You may not reproduce, distribute, or create
            derivative works without our prior written consent.
          </Body>
          <Body>
            By uploading receipt images or other content, you grant us a limited,
            non-exclusive, royalty-free licence to use that content solely for
            operating and improving the service.
          </Body>
        </Section>

        {/* ── 8 · Disclaimers ──────────────────────────────────────────────── */}
        <Section title="8. Disclaimers">
          <Body>
            THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTY OF ANY KIND. WE DO NOT
            WARRANT THAT PRICES, DEALS, OR SAVINGS SHOWN IN THE APP ARE ACCURATE,
            COMPLETE, OR CURRENT. DEAL DATA IS INFORMATIONAL ONLY — ALWAYS VERIFY
            AT THE RETAILER.
          </Body>
          <Body>
            Nutrition estimates shown in the app are heuristic approximations and are
            not medical advice. Consult a qualified healthcare professional for
            dietary guidance.
          </Body>
        </Section>

        {/* ── 9 · Limitation of Liability ──────────────────────────────────── */}
        <Section title="9. Limitation of Liability">
          <Body>
            TO THE FULLEST EXTENT PERMITTED BY LAW, SNIPPD, INC. WILL NOT BE LIABLE
            FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES
            ARISING FROM YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY
            OF SUCH DAMAGES.
          </Body>
          <Body>
            OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING FROM THESE TERMS OR
            YOUR USE OF SNIPPD WILL NOT EXCEED THE AMOUNT YOU PAID US IN THE
            12 MONTHS PRECEDING THE CLAIM.
          </Body>
        </Section>

        {/* ── 10 · Termination ─────────────────────────────────────────────── */}
        <Section title="10. Termination">
          <Body>
            You may delete your account at any time from Profile → Delete Account.
            We may suspend or terminate your account if you breach these Terms.
            Upon termination, your right to use Snippd ceases and your data will be
            deleted in accordance with our Privacy Policy.
          </Body>
        </Section>

        {/* ── 11 · Governing Law ───────────────────────────────────────────── */}
        <Section title="11. Governing Law">
          <Body>
            These Terms are governed by the laws of the State of Florida, United States,
            without regard to conflict-of-law principles. Any disputes will be resolved
            in the courts of Miami-Dade County, Florida, unless otherwise required by law.
          </Body>
        </Section>

        {/* ── 12 · Changes ─────────────────────────────────────────────────── */}
        <Section title="12. Changes to These Terms">
          <Body>
            We may update these Terms periodically. Material changes will be notified
            via the app or by email. Continued use of Snippd after changes are posted
            constitutes acceptance of the revised Terms.
          </Body>
        </Section>

        {/* ── 13 · Contact ─────────────────────────────────────────────────── */}
        <Section title="13. Contact">
          <Body>
            Questions about these Terms? We're happy to help.
          </Body>
          <TouchableOpacity style={s.contactBtn} onPress={openEmail} activeOpacity={0.8}>
            <Feather name="mail" size={16} color={GREEN} />
            <Text style={s.contactBtnTxt}>{SUPPORT_EMAIL}</Text>
          </TouchableOpacity>
        </Section>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 16, fontWeight: '700', color: NAVY },

  scroll: { padding: 20 },

  metaBox: {
    backgroundColor: LIGHT_GREEN, borderRadius: 10,
    padding: 12, marginBottom: 20,
  },
  metaLine: { fontSize: 12, color: GREEN, fontWeight: '600' },

  section: { marginTop: 24 },
  sectionTitle: {
    fontSize: 14, fontWeight: '800', color: NAVY,
    marginBottom: 10, letterSpacing: 0.2,
  },
  body: {
    fontSize: 14, color: NAVY, lineHeight: 22,
    opacity: 0.8, marginBottom: 10,
  },
  bulletRow: { flexDirection: 'row', gap: 8, marginBottom: 6, paddingLeft: 4 },
  bulletDot: { fontSize: 14, color: GREEN, marginTop: 2 },
  bulletTxt: { fontSize: 14, color: NAVY, lineHeight: 22, flex: 1, opacity: 0.8 },

  contactBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: WHITE, borderRadius: 12,
    borderWidth: 1, borderColor: BORDER,
    padding: 14, marginTop: 8,
  },
  contactBtnTxt: { fontSize: 14, fontWeight: '700', color: GREEN },
});
