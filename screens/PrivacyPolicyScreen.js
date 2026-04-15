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

const LAST_UPDATED   = 'April 14, 2026';
const POLICY_VERSION = '1.0';
const PRIVACY_EMAIL  = 'privacy@getsnippd.com';

export default function PrivacyPolicyScreen({ navigation }) {
  const openEmail = () =>
    Linking.openURL(`mailto:${PRIVACY_EMAIL}?subject=Privacy%20Request`);

  return (
    <SafeAreaView style={s.container} edges={['top', 'bottom']}>
      <StatusBar barStyle="dark-content" />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={20} color={NAVY} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Privacy Policy</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Meta ──────────────────────────────────────────────────────── */}
        <View style={s.metaCard}>
          <Text style={s.metaDate}>Last updated: {LAST_UPDATED}</Text>
          <View style={s.metaPill}>
            <Text style={s.metaPillTxt}>Version {POLICY_VERSION}</Text>
          </View>
        </View>

        {/* ── Contact pill ──────────────────────────────────────────────── */}
        <TouchableOpacity style={s.contactPill} onPress={openEmail} activeOpacity={0.8}>
          <Feather name="mail" size={14} color={GREEN} />
          <Text style={s.contactPillTxt}>Privacy questions? {PRIVACY_EMAIL}</Text>
          <Feather name="external-link" size={12} color={GRAY} />
        </TouchableOpacity>

        {/* ── Sections ──────────────────────────────────────────────────── */}

        <Section title="1. Introduction">
          <Body>
            Snippd ("we," "our," or "us") operates the Snippd mobile application (the "App"). This Privacy Policy explains how we collect, use, disclose, and protect your personal information when you use our App.
          </Body>
          <Body>
            By creating a Snippd account, you agree to the collection and use of your information as described in this policy. If you do not agree, please do not use the App.
          </Body>
        </Section>

        <Section title="2. Information We Collect">
          <SubTitle>2.1 Information You Provide</SubTitle>
          <BulletList items={[
            'Account information — email address, full name, and hashed password (we never see your plain-text password)',
            'Profile preferences — household members, dietary constraints, cooking style, and food dislikes',
            'Budget information — your weekly grocery budget target',
            'Store preferences — which retailers you prefer',
            'Receipt photos — uploaded for savings verification; processed by AI and not permanently stored as images',
            'Support messages — sent to us through the in-app contact form or email',
          ]} />

          <SubTitle>2.2 Information Collected Automatically</SubTitle>
          <BulletList items={[
            'Behavioral events — items viewed, coupons clipped, stacks saved, purchases completed, and search terms',
            'Device information — device type and OS version (no serial numbers or advertising IDs)',
            'Session identifiers — used to group activity within a session; not stored permanently',
            'Crash reports — anonymous logs to help us fix bugs; no personal information included',
          ]} />

          <SubTitle>2.3 Receipt Data</SubTitle>
          <Body>
            When you upload a receipt, the image is sent to Google Gemini for text extraction only. We extract item names, quantities, and prices to calculate your savings and Stash Credits. The original image is not permanently stored on our servers.
          </Body>
        </Section>

        <Section title="3. How We Use Your Information">
          <TableBlock rows={[
            ['Personalised cart recommendations', 'Behavioral events, preferences, purchase history'],
            ['Calculating savings and Wealth Momentum', 'Receipt data, deal prices, USDA benchmarks'],
            ['Awarding Stash Credits', 'Receipt verification, event milestones'],
            ['Household sharing features', 'Household membership, shared cart items'],
            ['In-app alerts and budget insights', 'Behavioral patterns, budget thresholds'],
            ['Improving our AI models', 'De-identified, aggregated behavioral signals only'],
            ['Security and fraud prevention', 'Session data (short retention)'],
            ['Legal compliance', 'Account data as required by law'],
          ]} />
          <Callout>
            We do NOT sell your personal data to third parties. We do NOT use your data for advertising outside of Snippd.
          </Callout>
        </Section>

        <Section title="4. How We Share Your Information">
          <SubTitle>4.1 Service Providers</SubTitle>
          <BulletList items={[
            'Supabase — cloud database and authentication (United States). Your account, events, and preferences are stored here.',
            'Google Gemini — AI receipt scanning. Receipt images are sent only for text extraction.',
            'Expo — app runtime. Crash reports may be processed by Expo\'s diagnostics service.',
          ]} />

          <SubTitle>4.2 Household Members</SubTitle>
          <Body>
            If you join a Household, your username, chef persona, and cart contributions are visible to other members of that household.
          </Body>

          <SubTitle>4.3 Aggregated De-identified Data</SubTitle>
          <Body>
            When you delete your account, your behavioral events (item category, retailer, event type, and week) are aggregated without any personal identifier. This helps improve recommendations for all users.
          </Body>

          <SubTitle>4.4 Legal Requirements</SubTitle>
          <Body>
            We may disclose your information if required by law, court order, or to protect the rights and safety of Snippd or its users.
          </Body>
        </Section>

        <Section title="5. Data Retention">
          <TableBlock rows={[
            ['Account information', 'Until you delete your account'],
            ['Behavioral events', 'Until you delete your account'],
            ['Receipt line items', 'Until you delete your account'],
            ['User preference scores', 'Until you delete your account'],
            ['Wealth momentum snapshots', 'Until you delete your account'],
            ['Aggregated behavioral signals', 'Indefinitely (no personal identifier)'],
            ['Support messages', '2 years from receipt'],
            ['Crash reports', '90 days'],
          ]} />
          <Body>
            When you delete your account, all personal data is deleted within 24 hours. Deletion is permanent and cannot be undone.
          </Body>
        </Section>

        <Section title="6. Your Rights and Choices">
          <SubTitle>6.1 Access and Correction</SubTitle>
          <Body>
            You can view and update your profile at any time under Profile → Edit Profile.
          </Body>

          <SubTitle>6.2 Account Deletion</SubTitle>
          <Body>
            Delete your account and all personal data at any time from Profile → Delete Account. This is immediate and permanent.
          </Body>

          <SubTitle>6.3 California Residents (CCPA)</SubTitle>
          <Body>
            California residents have the right to know what data we collect, request deletion, and opt out of the sale of personal information (note: we do not sell personal information). To exercise these rights, email{' '}
            <Text style={s.link} onPress={openEmail}>{PRIVACY_EMAIL}</Text>.
          </Body>

          <SubTitle>6.4 EU / UK Residents (GDPR)</SubTitle>
          <Body>
            EU and UK residents have the right to access, rectify, erase, restrict, and port their personal data, and to lodge a complaint with their local supervisory authority. Contact us at{' '}
            <Text style={s.link} onPress={openEmail}>{PRIVACY_EMAIL}</Text>.
          </Body>
        </Section>

        <Section title="7. Security">
          <BulletList items={[
            'All data is encrypted in transit using TLS 1.2+',
            'Passwords are hashed using bcrypt (via Supabase Auth)',
            'Row Level Security (RLS) ensures you can only access your own data',
            'Two-factor authentication (TOTP) is available and encouraged',
            'Service role keys are stored as encrypted secrets, not in app code',
          ]} />
          <Body>
            No system is 100% secure. If you discover a security vulnerability, please report it responsibly to security@getsnippd.com.
          </Body>
        </Section>

        <Section title="8. Children's Privacy">
          <Body>
            Snippd is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child under 13 has provided us information, please contact{' '}
            <Text style={s.link} onPress={openEmail}>{PRIVACY_EMAIL}</Text>{' '}
            and we will delete it promptly.
          </Body>
        </Section>

        <Section title="9. Changes to This Policy">
          <Body>
            We may update this Privacy Policy periodically. When we do, we will update the "Last updated" date, increment the version number, and notify you through the App or by email for material changes. Continued use of the App after changes constitutes acceptance of the updated policy.
          </Body>
        </Section>

        <Section title="10. Contact Us">
          <Body>
            For privacy questions, requests, or complaints:
          </Body>
          <TouchableOpacity style={s.emailBlock} onPress={openEmail} activeOpacity={0.8}>
            <Feather name="mail" size={18} color={GREEN} />
            <View style={{ marginLeft: 12 }}>
              <Text style={s.emailBlockTitle}>{PRIVACY_EMAIL}</Text>
              <Text style={s.emailBlockSub}>Subject: "Privacy Request — your name"</Text>
              <Text style={s.emailBlockSub}>We respond within 30 days.</Text>
            </View>
          </TouchableOpacity>
        </Section>

        {/* ── Footer ──────────────────────────────────────────────────────── */}
        <View style={s.footer}>
          <Text style={s.footerTxt}>
            Snippd — Autonomous Shopping Intelligence
          </Text>
          <Text style={s.footerTxt}>
            Privacy Policy v{POLICY_VERSION} · {LAST_UPDATED}
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Section({ title, children }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function SubTitle({ children }) {
  return <Text style={s.subTitle}>{children}</Text>;
}

function Body({ children }) {
  return <Text style={s.body}>{children}</Text>;
}

function BulletList({ items }) {
  return (
    <View style={s.bulletList}>
      {items.map((item, i) => (
        <View key={i} style={s.bulletRow}>
          <View style={s.bullet} />
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function TableBlock({ rows }) {
  return (
    <View style={s.table}>
      <View style={s.tableHeaderRow}>
        <Text style={[s.tableCell, s.tableHeader, { flex: 1.4 }]}>Purpose</Text>
        <Text style={[s.tableCell, s.tableHeader, { flex: 1.6 }]}>Data Used</Text>
      </View>
      {rows.map(([left, right], i) => (
        <View key={i} style={[s.tableRow, i % 2 === 0 && s.tableRowAlt]}>
          <Text style={[s.tableCell, { flex: 1.4 }]}>{left}</Text>
          <Text style={[s.tableCell, { flex: 1.6, color: GRAY }]}>{right}</Text>
        </View>
      ))}
    </View>
  );
}

function Callout({ children }) {
  return (
    <View style={s.callout}>
      <Feather name="shield" size={14} color={GREEN} style={{ marginTop: 1 }} />
      <Text style={s.calloutText}>{children}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container:   { flex: 1, backgroundColor: OFF_WHITE },
  scroll:      { paddingHorizontal: 20, paddingBottom: 20 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn:     { width: 40, height: 40, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: NAVY },

  metaCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: WHITE, borderRadius: 16, padding: 14,
    marginTop: 20, borderWidth: 1, borderColor: BORDER,
  },
  metaDate:    { fontSize: 13, color: GRAY, fontWeight: '500' },
  metaPill:    { backgroundColor: LIGHT_GREEN, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  metaPillTxt: { fontSize: 11, fontWeight: 'bold', color: GREEN },

  contactPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: LIGHT_GREEN, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    marginTop: 12,
  },
  contactPillTxt: { flex: 1, fontSize: 13, color: GREEN, fontWeight: '600' },

  section:       { marginTop: 28 },
  sectionTitle:  { fontSize: 16, fontWeight: 'bold', color: NAVY, marginBottom: 12 },
  subTitle:      { fontSize: 14, fontWeight: 'bold', color: NAVY, marginTop: 14, marginBottom: 6 },
  body:          { fontSize: 14, color: '#3D4A5C', lineHeight: 22 },
  link:          { color: GREEN, textDecorationLine: 'underline' },

  bulletList:  { marginTop: 4 },
  bulletRow:   { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8 },
  bullet:      { width: 5, height: 5, borderRadius: 3, backgroundColor: GREEN, marginTop: 8, marginRight: 10 },
  bulletText:  { flex: 1, fontSize: 14, color: '#3D4A5C', lineHeight: 21 },

  table:        { backgroundColor: WHITE, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: BORDER, marginTop: 8 },
  tableHeaderRow: { flexDirection: 'row', backgroundColor: LIGHT_GREEN },
  tableRow:     { flexDirection: 'row' },
  tableRowAlt:  { backgroundColor: OFF_WHITE },
  tableCell:    { fontSize: 12, color: NAVY, padding: 10, lineHeight: 18 },
  tableHeader:  { fontWeight: 'bold', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.3 },

  callout: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: LIGHT_GREEN, borderRadius: 10, padding: 12, marginTop: 12,
  },
  calloutText: { flex: 1, fontSize: 13, color: GREEN, fontWeight: '600', lineHeight: 20 },

  emailBlock: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: WHITE, borderRadius: 16, padding: 16,
    marginTop: 12, borderWidth: 1.5, borderColor: GREEN,
  },
  emailBlockTitle: { fontSize: 15, fontWeight: 'bold', color: GREEN },
  emailBlockSub:   { fontSize: 12, color: GRAY, marginTop: 2 },

  footer:     { alignItems: 'center', marginTop: 32, paddingTop: 20, borderTopWidth: 1, borderTopColor: BORDER },
  footerTxt:  { fontSize: 11, color: GRAY, marginBottom: 4, textAlign: 'center' },
});
