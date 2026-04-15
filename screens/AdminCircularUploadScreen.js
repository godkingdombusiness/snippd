/**
 * AdminCircularUploadScreen
 *
 * Allows admin users to:
 *   1. Pick a retailer from the 12 supported stores
 *   2. Select the week-of date (defaults to next Wednesday)
 *   3. Choose a source type (flyer, digital, combo)
 *   4. Pick a PDF using expo-document-picker
 *   5. Upload PDF to Supabase storage → 'deal-pdfs' bucket
 *   6. Insert to ingestion_jobs + call trigger-ingestion
 *   7. View last 15 ingestion jobs with live status, auto-refresh every 30s
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from '../lib/supabase';

// ── Colors ────────────────────────────────────────────────────
const GREEN  = '#0C9E54';
const NAVY   = '#0D1B4B';
const RED    = '#FF3B30';
const AMBER  = '#F59E0B';
const WHITE  = '#FFFFFF';
const GRAY   = '#8E8E93';
const BG     = '#F2F2F7';
const BORDER = '#E5E5EA';
const MINT   = '#E8F5E9';

const ADMIN_EMAILS = ['dina@getsnippd.com', 'admin@getsnippd.com'];

// ── Supported retailers ───────────────────────────────────────
const RETAILERS = [
  { key: 'publix',      label: 'Publix' },
  { key: 'kroger',      label: 'Kroger' },
  { key: 'safeway',     label: 'Safeway' },
  { key: 'albertsons',  label: 'Albertsons' },
  { key: 'heb',         label: "H-E-B" },
  { key: 'wegmans',     label: 'Wegmans' },
  { key: 'whole_foods', label: 'Whole Foods' },
  { key: 'target',      label: 'Target' },
  { key: 'walmart',     label: 'Walmart' },
  { key: 'costco',      label: 'Costco' },
  { key: 'aldi',        label: 'ALDI' },
  { key: 'trader_joes', label: "Trader Joe's" },
];

// ── Source types ──────────────────────────────────────────────
const SOURCE_TYPES = [
  { key: 'flyer',   label: 'Weekly Flyer',    icon: 'file-text' },
  { key: 'digital', label: 'Digital Coupons', icon: 'tag' },
  { key: 'combo',   label: 'Combo',           icon: 'layers' },
];

// ── Helpers ───────────────────────────────────────────────────

/** Returns the date string for the next Wednesday from today */
function nextWednesday() {
  const today = new Date();
  const day   = today.getDay(); // 0=Sun, 3=Wed
  const daysUntilWed = (3 - day + 7) % 7 || 7;
  const wed = new Date(today);
  wed.setDate(today.getDate() + daysUntilWed);
  return wed.toISOString().split('T')[0]; // YYYY-MM-DD
}

/** Previous / next week offsets from a base date string */
function shiftWeek(dateStr, delta) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return d.toISOString().split('T')[0];
}

/** Format YYYY-MM-DD → "Wed Apr 16" */
function formatDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Status badge color */
function statusColor(status) {
  switch (status) {
    case 'parsed':     return GREEN;
    case 'processing': return AMBER;
    case 'queued':     return NAVY;
    case 'failed':     return RED;
    default:           return GRAY;
  }
}

// ── Component ─────────────────────────────────────────────────

export default function AdminCircularUploadScreen({ navigation }) {
  const [authorized,    setAuthorized]    = useState(false);
  const [retailer,      setRetailer]      = useState(null);
  const [weekOf,        setWeekOf]        = useState(nextWednesday());
  const [sourceType,    setSourceType]    = useState('flyer');
  const [selectedFile,  setSelectedFile]  = useState(null);
  const [uploading,     setUploading]     = useState(false);
  const [jobs,          setJobs]          = useState([]);
  const [loadingJobs,   setLoadingJobs]   = useState(false);
  const refreshTimer = useRef(null);

  // ── Admin guard ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && ADMIN_EMAILS.includes(user.email?.toLowerCase())) {
        setAuthorized(true);
        loadJobs();
      } else {
        Alert.alert('Access Denied', 'Admin only.');
        navigation.goBack();
      }
    })();
  }, []);

  // ── Auto-refresh every 30s ───────────────────────────────────
  useEffect(() => {
    if (!authorized) return;
    refreshTimer.current = setInterval(loadJobs, 30_000);
    return () => clearInterval(refreshTimer.current);
  }, [authorized]);

  const loadJobs = useCallback(async () => {
    setLoadingJobs(true);
    const { data } = await supabase
      .from('ingestion_jobs')
      .select('id, retailer_key, week_of, source_type, status, attempts, deal_count, created_at, parsed_at, error_message')
      .order('created_at', { ascending: false })
      .limit(15);
    setJobs(data ?? []);
    setLoadingJobs(false);
  }, []);

  // ── File picker ──────────────────────────────────────────────
  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/pdf',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setSelectedFile(result.assets[0]);
    } catch (err) {
      Alert.alert('Error', `Could not open file picker: ${err.message}`);
    }
  };

  // ── Upload + create job ───────────────────────────────────────
  const handleUpload = async () => {
    if (!retailer)      return Alert.alert('Missing', 'Please select a retailer.');
    if (!selectedFile)  return Alert.alert('Missing', 'Please select a PDF file.');

    setUploading(true);
    try {
      // Build storage path: flat format retailerKey-weekOf-type.pdf
      const storagePath = retailer.key + '-' + weekOf + '-' + sourceType.replace('pdf_', '').replace('_', '-') + '.pdf';

      // Fetch file as blob
      const fileUri = selectedFile.uri;
      const fileResp = await fetch(fileUri);
      const blob = await fileResp.blob();

      // Upload to 'deal-pdfs' bucket
      const { error: uploadErr } = await supabase.storage
        .from('deal-pdfs')
        .upload(storagePath, blob, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadErr) throw new Error(`Storage upload failed: ${uploadErr.message}`);

      // Get service key from env (client-side admin only)
      // Calls trigger-ingestion with service-role key via Supabase Functions
      const { data: { session } } = await supabase.auth.getSession();
      const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;

      const triggerResp = await fetch(`${supabaseUrl}/functions/v1/trigger-ingestion`, {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          retailer_key: retailer.key,
          week_of:      weekOf,
          storage_path: storagePath,
          source_type:  sourceType,
        }),
      });

      const triggerResult = await triggerResp.json();
      if (!triggerResp.ok) throw new Error(triggerResult.error ?? `trigger-ingestion ${triggerResp.status}`);

      Alert.alert('Uploaded', `Job created: ${triggerResult.job_id}\nStatus: queued`);
      setSelectedFile(null);
      loadJobs();
    } catch (err) {
      Alert.alert('Upload Failed', err.message);
    } finally {
      setUploading(false);
    }
  };

  if (!authorized) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color={GREEN} style={{ marginTop: 40 }} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Circular Upload</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={loadJobs}>
          <Feather name="refresh-cw" size={16} color={GREEN} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

        {/* ── Section: Store Picker ──────────────────────────── */}
        <Text style={styles.sectionLabel}>Select Retailer</Text>
        <View style={styles.pillGrid}>
          {RETAILERS.map(r => (
            <TouchableOpacity
              key={r.key}
              style={[styles.pill, retailer?.key === r.key && styles.pillActive]}
              onPress={() => setRetailer(r)}
              activeOpacity={0.75}
            >
              <Text style={[styles.pillText, retailer?.key === r.key && styles.pillTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Section: Week Picker ──────────────────────────── */}
        <Text style={styles.sectionLabel}>Week Of</Text>
        <View style={styles.weekRow}>
          <TouchableOpacity style={styles.weekArrow} onPress={() => setWeekOf(w => shiftWeek(w, -1))}>
            <Feather name="chevron-left" size={20} color={NAVY} />
          </TouchableOpacity>
          <View style={styles.weekDisplay}>
            <Text style={styles.weekText}>{formatDate(weekOf)}</Text>
            <Text style={styles.weekSub}>{weekOf}</Text>
          </View>
          <TouchableOpacity style={styles.weekArrow} onPress={() => setWeekOf(w => shiftWeek(w, 1))}>
            <Feather name="chevron-right" size={20} color={NAVY} />
          </TouchableOpacity>
        </View>

        {/* ── Section: Source Type ──────────────────────────── */}
        <Text style={styles.sectionLabel}>Source Type</Text>
        <View style={styles.sourceRow}>
          {SOURCE_TYPES.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.sourceBtn, sourceType === s.key && styles.sourceBtnActive]}
              onPress={() => setSourceType(s.key)}
              activeOpacity={0.78}
            >
              <Feather name={s.icon} size={14} color={sourceType === s.key ? WHITE : GRAY} />
              <Text style={[styles.sourceBtnText, sourceType === s.key && styles.sourceBtnTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Section: PDF Picker ───────────────────────────── */}
        <Text style={styles.sectionLabel}>PDF File</Text>
        <TouchableOpacity style={styles.filePicker} onPress={handlePickFile} activeOpacity={0.8}>
          <Feather name="upload" size={20} color={selectedFile ? GREEN : GRAY} />
          <Text style={[styles.filePickerText, selectedFile && { color: NAVY }]} numberOfLines={1}>
            {selectedFile ? selectedFile.name : 'Tap to select a PDF'}
          </Text>
          {selectedFile && <Feather name="check-circle" size={16} color={GREEN} />}
        </TouchableOpacity>

        {/* ── Upload Button ─────────────────────────────────── */}
        <TouchableOpacity
          style={[styles.uploadBtn, uploading && styles.uploadBtnDisabled]}
          onPress={handleUpload}
          disabled={uploading}
          activeOpacity={0.85}
        >
          {uploading
            ? <ActivityIndicator color={WHITE} size="small" />
            : <><Feather name="send" size={16} color={WHITE} style={{ marginRight: 8 }} />
               <Text style={styles.uploadBtnText}>Upload & Queue Job</Text></>
          }
        </TouchableOpacity>

        {/* ── Section: Job Status List ──────────────────────── */}
        <View style={styles.jobsHeader}>
          <Text style={styles.sectionLabel}>Recent Jobs</Text>
          {loadingJobs && <ActivityIndicator size="small" color={GREEN} />}
        </View>

        {jobs.length === 0 && !loadingJobs && (
          <Text style={styles.emptyText}>No ingestion jobs yet.</Text>
        )}

        {jobs.map(job => (
          <View key={job.id} style={styles.jobCard}>
            <View style={styles.jobCardTop}>
              <View style={styles.jobCardLeft}>
                <Text style={styles.jobRetailer}>
                  {RETAILERS.find(r => r.key === job.retailer_key)?.label ?? job.retailer_key}
                </Text>
                <Text style={styles.jobWeek}>{job.week_of} · {job.source_type ?? 'flyer'}</Text>
              </View>
              <View style={[styles.statusBadge, { backgroundColor: statusColor(job.status) + '20' }]}>
                <Text style={[styles.statusText, { color: statusColor(job.status) }]}>
                  {job.status}
                </Text>
              </View>
            </View>
            <View style={styles.jobCardBottom}>
              <Text style={styles.jobMeta}>
                {job.deal_count != null ? `${job.deal_count} deals` : 'processing…'}
                {job.attempts > 0 ? ` · attempt ${job.attempts}` : ''}
              </Text>
              <Text style={styles.jobDate}>
                {new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
            {job.error_message && (
              <Text style={styles.jobError} numberOfLines={2}>{job.error_message}</Text>
            )}
          </View>
        ))}

      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: BG, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  refreshBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },

  sectionLabel: {
    fontSize: 13, fontWeight: '600', color: GRAY, textTransform: 'uppercase',
    letterSpacing: 0.6, marginTop: 20, marginBottom: 10, marginHorizontal: 16,
  },

  // Store picker pills
  pillGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    paddingHorizontal: 12, gap: 8,
  },
  pill: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: WHITE, marginBottom: 4,
  },
  pillActive: { backgroundColor: GREEN, borderColor: GREEN },
  pillText: { fontSize: 13, fontWeight: '600', color: NAVY },
  pillTextActive: { color: WHITE },

  // Week picker
  weekRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 16, backgroundColor: WHITE,
    borderRadius: 14, borderWidth: 1, borderColor: BORDER,
    overflow: 'hidden',
  },
  weekArrow: {
    width: 48, height: 54, alignItems: 'center', justifyContent: 'center',
  },
  weekDisplay: { flex: 1, alignItems: 'center' },
  weekText: { fontSize: 15, fontWeight: '700', color: NAVY },
  weekSub:  { fontSize: 11, color: GRAY, marginTop: 2 },

  // Source type buttons
  sourceRow: {
    flexDirection: 'row', marginHorizontal: 16, gap: 10,
  },
  sourceBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, borderRadius: 12,
    borderWidth: 1.5, borderColor: BORDER, backgroundColor: WHITE, gap: 6,
  },
  sourceBtnActive: { backgroundColor: NAVY, borderColor: NAVY },
  sourceBtnText: { fontSize: 12, fontWeight: '600', color: GRAY },
  sourceBtnTextActive: { color: WHITE },

  // File picker
  filePicker: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 16, padding: 16,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1.5, borderColor: BORDER, borderStyle: 'dashed',
  },
  filePickerText: { flex: 1, fontSize: 14, color: GRAY },

  // Upload button
  uploadBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 16, marginTop: 20,
    backgroundColor: GREEN, borderRadius: 14, paddingVertical: 15,
  },
  uploadBtnDisabled: { opacity: 0.6 },
  uploadBtnText: { color: WHITE, fontSize: 15, fontWeight: '700' },

  // Jobs section
  jobsHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingRight: 16,
  },
  emptyText: { textAlign: 'center', color: GRAY, fontSize: 14, marginTop: 8 },

  jobCard: {
    marginHorizontal: 16, marginBottom: 10,
    backgroundColor: WHITE, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, padding: 14,
  },
  jobCardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  jobCardLeft: { flex: 1 },
  jobRetailer: { fontSize: 14, fontWeight: '700', color: NAVY },
  jobWeek: { fontSize: 12, color: GRAY, marginTop: 2 },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 12, fontWeight: '700', textTransform: 'capitalize' },
  jobCardBottom: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: BORDER,
  },
  jobMeta: { fontSize: 12, color: NAVY },
  jobDate: { fontSize: 12, color: GRAY },
  jobError: { fontSize: 11, color: RED, marginTop: 6 },
});
