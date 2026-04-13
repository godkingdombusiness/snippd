import React from 'react';
import { StyleSheet, View, Text, TouchableOpacity, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, SHADOWS, LAYOUT, TYPOGRAPHY } from '../lib/theme';

/**
 * THE SNIPPD CARD
 * Uses Layout.cardRadius (35) and SHADOWS.highRise
 */
export const Card = ({ children, style, glass = false }) => (
  <View style={[
    styles.card, 
    glass && styles.glassCard,
    SHADOWS.highRise, 
    style
  ]}>
    {children}
  </View>
);

/**
 * THE SNIPPD PILL BUTTON
 * Uses LAYOUT.pillRadius (27) for that high-end industry look
 */
export const Btn = ({ label, onPress, secondary, style, icon }) => (
  <TouchableOpacity 
    onPress={onPress}
    style={[
      styles.pill, 
      secondary ? styles.btnSecondary : styles.btnPrimary,
      !secondary && SHADOWS.greenGlow,
      style
    ]}
  >
    {icon && <Ionicons name={icon} size={18} color={secondary ? COLORS.navy : COLORS.white} style={{marginRight: 8}} />}
    <Text style={[styles.btnText, secondary && { color: COLORS.navy }]}>{label}</Text>
  </TouchableOpacity>
);

/**
 * DAILY OPTION CARD (Triple Grid)
 * Used for Dinner & Daily Stack choices
 */
export const OptionCard = ({ title, price, save, isSelected, onPress, tag }) => (
  <TouchableOpacity 
    onPress={onPress}
    style={[
      styles.optCard, 
      isSelected ? styles.optCardSelected : SHADOWS.floating
    ]}
  >
    <View style={styles.optHeader}>
      <Text style={[styles.optTag, isSelected && {color: COLORS.white}]}>{tag}</Text>
      {isSelected && <Ionicons name="checkmark-circle" size={16} color={COLORS.white} />}
    </View>
    <Text style={[styles.optTitle, isSelected && {color: COLORS.white}]}>{title}</Text>
    <Text style={[styles.optPrice, isSelected && {color: COLORS.white, opacity: 0.8}]}>{price}</Text>
    <Text style={[styles.optSave, isSelected && {color: COLORS.white}]}>Save {save}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    borderRadius: LAYOUT.cardRadius,
    padding: LAYOUT.padding,
    borderWidth: 1,
    borderColor: 'rgba(13, 27, 75, 0.05)',
  },
  glassCard: {
    backgroundColor: COLORS.glass,
    backdropFilter: 'blur(10px)', // Web support
    borderColor: COLORS.glassBorder,
  },
  pill: {
    height: 54,
    borderRadius: LAYOUT.pillRadius,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 25,
  },
  btnPrimary: { backgroundColor: COLORS.green },
  btnSecondary: { backgroundColor: COLORS.glassNavy },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '800', letterSpacing: -0.2 },
  
  optCard: { 
    width: '31%', // Fits 3 in a row with spacing
    backgroundColor: COLORS.white, 
    borderRadius: 22, 
    padding: 12, 
    borderWidth: 1, 
    borderColor: COLORS.glassNavy 
  },
  optCardSelected: { backgroundColor: COLORS.green, borderColor: COLORS.green },
  optHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  optTag: { fontSize: 8, fontWeight: '900', color: COLORS.green, textTransform: 'uppercase' },
  optTitle: { fontSize: 12, fontWeight: '800', color: COLORS.navy, height: 32, marginTop: 4 },
  optPrice: { fontSize: 11, color: COLORS.textGray, marginTop: 5 },
  optSave: { fontSize: 10, fontWeight: '900', color: COLORS.green },
});