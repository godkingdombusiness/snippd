/**
 * DataSyncingBanner — non-fatal encryption / sync messaging (mint canvas, navy text).
 */
import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';

const MINT = '#E8F5E9';
const NAVY = '#1A237E';
const GREEN = '#2E7D32';

export default function DataSyncingBanner({
  message = 'Data syncing — your encrypted plan will appear in a moment.',
  compact = false,
}) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]} accessibilityRole="alert">
      <ActivityIndicator size="small" color={GREEN} style={styles.spinner} />
      <Feather name="cloud" size={16} color={NAVY} style={styles.icon} />
      <Text style={styles.txt}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: MINT,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(26, 35, 126, 0.12)',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    gap: 8,
  },
  wrapCompact: {
    paddingVertical: 10,
    marginBottom: 8,
  },
  spinner: { marginRight: 2 },
  icon:   { marginRight: 2 },
  txt: {
    flex: 1,
    color: NAVY,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
  },
});
