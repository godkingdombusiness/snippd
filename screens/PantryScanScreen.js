import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { returnSeededPantryScan } from '../src/services/pantryVisionService';
import { tracker } from '../src/lib/eventTracker';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var CREAM  = '#FAF8F1';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var MINT   = '#E8F5E9';

function PantryScanScreen(props) {
  var navigation = props.navigation;
  var [scanning, setScanning]   = useState(false);
  var [scanDone, setScanDone]   = useState(false);

  function handleBack() {
    if (navigation && navigation.canGoBack()) navigation.goBack();
  }

  function handleScan() {
    tracker.track('pantry_scan_started', { method: 'camera' });
    setScanning(true);
    setTimeout(function () {
      var items = returnSeededPantryScan();
      tracker.track('pantry_scan_completed', { item_count: items.length, method: 'seeded' });
      setScanning(false);
      setScanDone(true);
      navigation.navigate('PantryReview', { items: items });
    }, 1400);
  }

  function handleManual() {
    tracker.track('pantry_scan_started', { method: 'demo_results' });
    var items = returnSeededPantryScan();
    tracker.track('pantry_scan_completed', { item_count: items.length, method: 'seeded' });
    navigation.navigate('PantryReview', { items: items });
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor={CREAM} />

      <View style={styles.navBar}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>Pantry Scan</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.body}>
        {/* Hero copy */}
        <Text style={styles.headline}>Scan what you have.</Text>
        <Text style={styles.sub}>
          Take a quick photo of your pantry, fridge, or counter. Snippd will help spot what may
          already be available before you buy more.
        </Text>

        {/* Stash message */}
        <View style={styles.stashRow}>
          <View style={styles.stashBubble}>
            <Text style={styles.stashInitial}>S</Text>
          </View>
          <Text style={styles.stashText}>
            Before we spend more, let's see what your kitchen can already do.
          </Text>
        </View>

        {/* Viewfinder mock */}
        <View style={styles.viewfinder}>
          <View style={styles.cornerTL} />
          <View style={styles.cornerTR} />
          <View style={styles.cornerBL} />
          <View style={styles.cornerBR} />

          {scanning ? (
            <View style={styles.scanningRow}>
              <ActivityIndicator size="large" color={GREEN} />
              <Text style={styles.scanningText}>Reading your pantry...</Text>
            </View>
          ) : (
            <View style={styles.cameraHint}>
              <Feather name="camera" size={36} color={GRAY} />
              <Text style={styles.cameraHintText}>Camera feed</Text>
            </View>
          )}
        </View>

        {/* Disclaimer */}
        <View style={styles.trustRow}>
          <Feather name="info" size={13} color={GRAY} />
          <Text style={styles.trustText}>
            Pantry scan results are estimates. Please review and confirm items before using them in your plan.
          </Text>
        </View>

        {/* CTAs */}
        <TouchableOpacity
          style={[styles.primaryBtn, scanning && styles.primaryBtnDim]}
          onPress={handleScan}
          disabled={scanning}
          activeOpacity={0.85}
        >
          {scanning ? (
            <ActivityIndicator size="small" color={WHITE} />
          ) : (
            <>
              <Feather name="camera" size={17} color={WHITE} />
              <Text style={styles.primaryBtnText}>Scan Pantry</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.secondaryBtn} onPress={handleManual} activeOpacity={0.7}>
          <Text style={styles.secondaryBtnText}>Use demo results instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

var CORNER_SIZE = 22;
var CORNER_WIDTH = 3;

var styles = StyleSheet.create({
  safeArea:    { flex: 1, backgroundColor: CREAM },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  backBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: WHITE,
    borderWidth: 1, borderColor: BORDER,
  },
  navTitle: { fontSize: 17, fontWeight: '700', color: NAVY },
  body: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 8,
  },
  headline: {
    fontSize: 28,
    fontWeight: '800',
    color: NAVY,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  sub: {
    fontSize: 14,
    color: GRAY,
    lineHeight: 21,
    marginBottom: 16,
  },
  stashRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: MINT,
    borderRadius: 12,
    padding: 12,
    marginBottom: 20,
  },
  stashBubble: {
    width: 28, height: 28,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  },
  stashInitial: { fontSize: 13, fontWeight: '900', color: WHITE },
  stashText:    { flex: 1, fontSize: 13, color: NAVY, fontWeight: '500', lineHeight: 18 },
  viewfinder: {
    height: 260,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute', top: 14, left: 14,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderColor: GREEN, borderTopLeftRadius: 4,
  },
  cornerTR: {
    position: 'absolute', top: 14, right: 14,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderTopWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderColor: GREEN, borderTopRightRadius: 4,
  },
  cornerBL: {
    position: 'absolute', bottom: 14, left: 14,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH, borderLeftWidth: CORNER_WIDTH,
    borderColor: GREEN, borderBottomLeftRadius: 4,
  },
  cornerBR: {
    position: 'absolute', bottom: 14, right: 14,
    width: CORNER_SIZE, height: CORNER_SIZE,
    borderBottomWidth: CORNER_WIDTH, borderRightWidth: CORNER_WIDTH,
    borderColor: GREEN, borderBottomRightRadius: 4,
  },
  cameraHint: { alignItems: 'center', gap: 8 },
  cameraHintText: { fontSize: 14, color: GRAY },
  scanningRow: { alignItems: 'center', gap: 12 },
  scanningText: { fontSize: 14, color: NAVY, fontWeight: '600' },
  trustRow: {
    flexDirection: 'row',
    gap: 7,
    alignItems: 'flex-start',
    marginBottom: 28,
  },
  trustText: { flex: 1, fontSize: 12, color: GRAY, lineHeight: 17 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    backgroundColor: GREEN,
    borderRadius: 14,
    paddingVertical: 15,
    marginBottom: 12,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnDim:  { opacity: 0.5 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: WHITE },
  secondaryBtn:   { alignItems: 'center', paddingVertical: 12 },
  secondaryBtnText: { fontSize: 14, color: GRAY, fontWeight: '500' },
});

export default PantryScanScreen;
