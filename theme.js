import { Platform } from 'react-native';

/**
 * SNIPPD BRAND DESIGN SYSTEM - REFINED FINTECH VERSION
 * Authority (Rocket Mortgage) x Cleanliness (Klarna)
 */

export const COLORS = {
  // Brand Core
  green: '#0C9E54',           
  navy: '#172250',            
  white: '#FFFFFF',           
  bg: '#F8F9FA',              
  textGray: '#6C757D',        
  border: '#E9ECEF',          
  accentGreen: '#DCFCE7',     
  accentRed: '#FB5B5B',       
  mutedNavy: '#F1F3F5',       

  // Backwards Compatibility for existing screens
  glass: '#FFFFFF', 
  glassBorder: '#E9ECEF',
  glassNavy: 'rgba(23, 34, 80, 0.05)',
};

export const SHADOWS = {
  highRise: {
    ...Platform.select({
      ios: { shadowColor: '#172250', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.06, shadowRadius: 24 },
      android: { elevation: 8 },
      web: { boxShadow: '0px 12px 24px rgba(23, 34, 80, 0.06)' },
    }),
  },
  floating: {
    ...Platform.select({
      ios: { shadowColor: '#172250', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 8 },
      android: { elevation: 4 },
      web: { boxShadow: '0px 4px 8px rgba(23, 34, 80, 0.08)' },
    }),
  },
  greenGlow: {
    ...Platform.select({
      ios: { shadowColor: '#0C9E54', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 15 },
      android: { elevation: 6 },
      web: { boxShadow: '0px 8px 15px rgba(12, 158, 84, 0.1)' },
    }),
  },
};

export const TYPOGRAPHY = {
  heroTitle: {
    fontSize: 44,
    fontWeight: '900',
    letterSpacing: -1.5,
    lineHeight: 52,
    color: '#172250',
  },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: '#172250',
  },
  pillLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#172250',
  }
};

export const LAYOUT = {
  cardRadius: 20,
  pillRadius: 50,
  padding: 20,
};