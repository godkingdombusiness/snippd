import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert,
  TextInput, Platform, // Added for JSON input
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';
import { ConnectionAgent } from '../lib/auditAgent';

const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const RED    = '#FF3B30';
const AMBER  = '#F59E0B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8E8E93';
const BG     = '#F2F2F7';
const BORDER = '#E5E5EA';

// Hardcoded admin emails — add yours here
const ADMIN_EMAILS = [
  'dina@getsnippd.com',
  'admin@getsnippd.com',
  // 'youremail@gmail.com',
];

export default function AdminPulseScreen({ navigation }) {
  const [loading, setLoading]   = useState(false);
  const [report, setReport]     = useState(null);
  const [authorized, setAuthorized] = useState(false);

  // NEW: State for Gemini Data Injection
  const [geminiJson, setGeminiJson] = useState('');
  const [pushing, setPushing] = useState(false);

  // Auth guard — verify the current user is an admin before showing anything
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        setAuthorized(true);
        runDiagnostic();
      } else {
        Alert.alert('Access Denied', 'You do not have permission to view this screen.');
        navigation.goBack();
      }
    })();
  }, []);

  const runDiagnostic = async () => {
    setLoading(true);
    const data = await ConnectionAgent.runFullAudit();
    setReport(data);
    setLoading(false);
  };

  // NEW: Function to distribute Gemini JSON into Supabase tables
  const handlePushGeminiData = async () => {
    if (!geminiJson) return Alert.alert("Error", "Paste the JSON from Gemini first.");
    
    setPushing(true);
    try {
      const data = JSON.parse(geminiJson);
      
      for (const stack of data) {
        // 1. Insert into curated_stacks
        const { data: newStack, error: stackErr } = await supabase
          .from('curated_stacks')
          .insert([{
            stack_name: stack.item_title || stack.title,
            store: stack.store_name || stack.retailer,
            oop_total: stack.final_price_cents || stack.pay_price,
            retail_total: (stack.final_price_cents || 0) + (stack.savings_cents || 0),
            target_diet: stack.tags || stack.dietary_tags || ['All'],
            is_active: true
          }])
          .select()
          .single();

        if (stackErr) throw stackErr;

        // 2. Insert the breakdown into stack_items (mapping the list)
        if (stack.breakdown_list && Array.isArray(stack.breakdown_list)) {
          const itemsToInsert = stack.breakdown_list.map(item => ({
            stack_id: newStack.id,
            name: item.name || item.item,
            sale_price: item.price || 0,
            regular_price: item.regular || item.price || 0
          }));

          const { error: itemsErr } = await supabase
            .from('stack_items')
            .insert(itemsToInsert);
          
          if (itemsErr) throw itemsErr;
        }
      }

      Alert.alert("Success", "Stacks and Items pushed to production successfully.");
      setGeminiJson('');
    } catch (e) {
      console.error(e);
      Alert.alert("Push Failed", "Invalid JSON format or Database Error. Check console.");
    } finally {
      setPushing(false);
    }
  };

  const ts = report?.timestamp
    ? new Date(report.timestamp).toLocaleTimeString()
    : null;

  if (!authorized) return null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>

      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="chevron-left" size={24} color={NAVY} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.title}>System Pulse</Text>
          {ts && <Text style={styles.timestamp}>Last run {ts}</Text>}
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, loading && { opacity: 0.4 }]}
          onPress={runDiagnostic}
          disabled={loading}
        >
          <Feather name="refresh-cw" size={18} color={GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>

        {/* NEW: GEMINI DATA INPUT CONSOLE */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>GEMINI AGENT DATA INJECTION</Text>
          <TextInput
            style={styles.jsonInput}
            placeholder="Paste Gemini JSON Array here..."
            placeholderTextColor={GRAY}
            multiline
            value={geminiJson}
            onChangeText={setGeminiJson}
          />
          <TouchableOpacity 
            style={[styles.pushBtn, pushing && { opacity: 0.7 }]} 
            onPress={handlePushGeminiData}
            disabled={pushing}
          >
            {pushing ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <>
                <Feather name="zap" size={16} color={WHITE} />
                <Text style={styles.pushBtnTxt}>PUSH STACKS TO LIVE APP</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={GREEN} size="large" />
            <Text style={styles.loadingTxt}>Running diagnostics...</Text>
          </View>
        ) : report ? (
          <>
            {/* ── STATUS HERO ──────────────────────────────────────────── */}
            <View style={[styles.hero, { backgroundColor: report.success ? GREEN : RED }]}>
              <MaterialCommunityIcons
                name={report.success ? 'check-decagram' : 'alert-decagram'}
                size={44}
                color={WHITE}
              />
              <Text style={styles.heroText}>
                {report.success ? 'All Systems Operational' : 'Action Required'}
              </Text>
              <Text style={styles.heroSub}>
                {report.results.latency}ms  ·  {report.results.errors.length} issue{report.results.errors.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {/* ── BACKEND HEALTH ───────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>BACKEND HEALTH</Text>
              <MetricRow
                label="Auth Session"
                icon={report.results.auth ? 'check-circle' : 'x-circle'}
                color={report.results.auth ? GREEN : RED}
                value={report.results.userEmail || 'No session'}
              />
              <MetricRow
                label="Database"
                icon={report.results.database ? 'check-circle' : 'x-circle'}
                color={report.results.database ? GREEN : RED}
              />
              <MetricRow
                label="Gemini AI"
                icon={report.results.gemini ? 'check-circle' : 'x-circle'}
                color={report.results.gemini ? GREEN : RED}
                value={report.results.geminiModel}
              />
              <MetricRow
                label="OCR Service"
                icon={
                  report.results.ocr === 'online' ? 'check-circle'
                  : report.results.ocr === 'cors_blocked' ? 'alert-circle'
                  : 'x-circle'
                }
                color={
                  report.results.ocr === 'online' ? GREEN
                  : report.results.ocr === 'cors_blocked' ? AMBER
                  : RED
                }
                value={report.results.ocr === 'cors_blocked' ? 'Web CORS (OK on device)' : report.results.ocr}
                last
              />
            </View>

            {/* ── TABLE STATUS ─────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>DATABASE TABLES</Text>
              {Object.entries(report.results.tableStatus).map(([table, ok], i, arr) => (
                <MetricRow
                  key={table}
                  label={table}
                  icon={ok ? 'check-circle' : 'x-circle'}
                  color={ok ? GREEN : RED}
                  last={i === arr.length - 1}
                />
              ))}
            </View>

            {/* ── ERROR LOG ────────────────────────────────────────────── */}
            {report.results.errors.length > 0 && (
              <View style={[styles.card, styles.errorCard]}>
                <Text style={[styles.cardTitle, { color: RED }]}>ERRORS  ({report.results.errors.length})</Text>
                {report.results.errors.map((err, i) => (
                  <View key={i} style={styles.errorRow}>
                    <Feather name="alert-circle" size={14} color={RED} style={{ marginTop: 2, flexShrink: 0 }} />
                    <Text style={styles.errorTxt}>{err}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* ── WIRING NOTE ──────────────────────────────────────────── */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>APP WIRING</Text>
              <Text style={styles.infoTxt}>
                All navigation routes audited against RootStack in App.js.{'\n\n'}
                Discovery → fetches curated_stacks from Supabase.{'\n'}
                Studio → requires creator_content table + storage bucket.{'\n'}
                Receipt → Cloud Run OCR (native only, CORS blocked on web).
              </Text>
            </View>

            {/* ── DATA INTEGRITY DISCLAIMER ─────────────────────────────── */}
            <View style={styles.disclaimerCard}>
              <Feather name="info" size={14} color={GRAY} style={{ marginTop: 1 }} />
              <Text style={styles.disclaimerTxt}>
                Data Integrity Notice: Ensure all Gemini-generated links point to official retailer domains. Snippd does not store or circumvent retailer authentication.
              </Text>
            </View>

            <View style={{ height: 16 }} />
          </>
        ) : null}

        {/* ── MEMORY GRAPH VIEWER ──────────────────────────────── */}
        <TouchableOpacity
          style={styles.graphViewerBtn}
          onPress={() => navigation.navigate('AdminGraph')}
          activeOpacity={0.82}
        >
          <View style={styles.graphViewerLeft}>
            <Feather name="share-2" size={20} color={GREEN} />
            <View style={{ marginLeft: 12 }}>
              <Text style={styles.graphViewerTitle}>Memory Graph</Text>
              <Text style={styles.graphViewerSub}>Node counts · top co-occurrences · cohort pairs</Text>
            </View>
          </View>
          <Feather name="chevron-right" size={18} color={GRAY} />
        </TouchableOpacity>

        <View style={{ height: 48 }} />

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-component ─────────────────────────────────────────────────────────────

const MetricRow = ({ label, icon, color, value, last }) => (
  <View style={[styles.row, last && { borderBottomWidth: 0 }]}>
    <Text style={styles.rowLabel}>{label}</Text>
    <View style={styles.rowRight}>
      {value && <Text style={[styles.rowValue, { color }]} numberOfLines={1}>{value}</Text>}
      <Feather name={icon} size={16} color={color} />
    </View>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  title: { fontSize: 17, fontWeight: 'bold', color: NAVY },
  timestamp: { fontSize: 10, color: GRAY, marginTop: 1 },
  refreshBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },

  body: { padding: 16, gap: 12 },

  loadingWrap: { paddingTop: 80, alignItems: 'center', gap: 16 },
  loadingTxt: { fontSize: 14, color: GRAY, fontWeight: 'normal' },

  hero: {
    borderRadius: 20, padding: 28,
    alignItems: 'center', gap: 10,
  },
  heroText: { color: WHITE, fontSize: 20, fontWeight: 'bold' },
  heroSub:  { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 'normal' },

  card: {
    backgroundColor: WHITE, borderRadius: 16,
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4,
  },
  errorCard: { borderWidth: 1, borderColor: '#FFE5E5', backgroundColor: '#FFF8F8' },
  cardTitle: {
    fontSize: 10, fontWeight: 'bold', color: GRAY,
    letterSpacing: 1.5, marginBottom: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: BG,
  },
  rowLabel: { fontSize: 14, fontWeight: 'normal', color: NAVY, flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { fontSize: 12, fontWeight: 'normal', maxWidth: 160 },

  errorRow: { flexDirection: 'row', gap: 8, paddingBottom: 10 },
  errorTxt: { fontSize: 13, color: RED, fontWeight: 'normal', flex: 1, lineHeight: 18 },

  infoTxt: { fontSize: 13, color: GRAY, lineHeight: 20, paddingBottom: 12 },

  // NEW STYLES FOR ADMIN CONSOLE
  jsonInput: {
    backgroundColor: BG,
    borderRadius: 12,
    padding: 12,
    height: 150,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: NAVY,
    textAlignVertical: 'top',
    marginBottom: 12
  },
  pushBtn: {
    backgroundColor: NAVY,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12
  },
  pushBtnTxt: {
    color: WHITE,
    fontSize: 13,
    fontWeight: 'bold'
  },

  // ── Data integrity disclaimer ──────────────────────────────────────────────
  disclaimerCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 16,
    borderLeftWidth: 3,
    borderLeftColor: GRAY,
  },
  disclaimerTxt: {
    flex: 1,
    fontSize: 12,
    color: GRAY,
    lineHeight: 18,
    fontWeight: 'normal',
  },
  graphViewerBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginHorizontal: 16, marginTop: 16,
    backgroundColor: WHITE, borderRadius: 16,
    paddingHorizontal: 16, paddingVertical: 18,
    borderWidth: 1, borderColor: BORDER,
  },
  graphViewerLeft:  { flexDirection: 'row', alignItems: 'center' },
  graphViewerTitle: { fontSize: 15, fontWeight: '700', color: NAVY },
  graphViewerSub:   { fontSize: 12, color: GRAY, marginTop: 2 },
});