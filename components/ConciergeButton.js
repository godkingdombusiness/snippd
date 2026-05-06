// components/ConciergeButton.js
// Primary CTA button used across onboarding, upgrade flow, and Concierge actions.
// Handles haptic feedback, loading state, and disabled styling consistently.

import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Platform,
} from 'react-native';
import { COLORS, TYPE, RADIUS, SPACE, DURATION } from '../src/design/tokens';

// Haptic feedback — graceful no-op on web / simulators without Expo Haptics
let Haptics;
try {
  Haptics = require('expo-haptics');
} catch (_) {
  Haptics = null;
}

/**
 * ConciergeButton
 *
 * Props:
 *   label      — button text
 *   onPress    — callback
 *   variant    — 'primary' | 'secondary' | 'ghost' | 'danger'
 *                primary   → green bg, white text (default CTA)
 *                secondary → navy bg, mint text
 *                ghost     → transparent, navy border + text
 *                danger    → coral bg, white text
 *   loading    — show spinner instead of label
 *   disabled   — dims and blocks press
 *   fullWidth  — stretch to 100% (default true)
 *   style      — additional container overrides
 *   textStyle  — additional label overrides
 */
export default function ConciergeButton({
  label,
  onPress,
  variant   = 'primary',
  loading   = false,
  disabled  = false,
  fullWidth = true,
  style,
  textStyle,
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue:         0.97,
      duration:        DURATION.fast,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue:         1,
      duration:        DURATION.fast,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    if (disabled || loading) return;
    if (Haptics?.impactAsync) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle?.Medium).catch(() => {});
    }
    onPress?.();
  };

  const variantStyles = VARIANTS[variant] ?? VARIANTS.primary;

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }], width: fullWidth ? '100%' : undefined }}>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || loading}
        style={[
          styles.base,
          variantStyles.container,
          disabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator color={variantStyles.spinnerColor} />
        ) : (
          <Text style={[styles.label, variantStyles.text, textStyle]}>
            {label}
          </Text>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const VARIANTS = {
  primary: {
    container:    { backgroundColor: COLORS.green },
    text:         { color: COLORS.white },
    spinnerColor: COLORS.white,
  },
  secondary: {
    container:    { backgroundColor: COLORS.navy },
    text:         { color: COLORS.mint },
    spinnerColor: COLORS.mint,
  },
  ghost: {
    container:    { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: COLORS.navy },
    text:         { color: COLORS.navy },
    spinnerColor: COLORS.navy,
  },
  danger: {
    container:    { backgroundColor: COLORS.coral },
    text:         { color: COLORS.white },
    spinnerColor: COLORS.white,
  },
};

const styles = StyleSheet.create({
  base: {
    borderRadius:   RADIUS.md,
    paddingVertical: SPACE.lg,
    paddingHorizontal: SPACE.xxl,
    alignItems:     'center',
    justifyContent: 'center',
    minHeight:      52,
  },
  label: {
    fontSize:   16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  disabled: {
    opacity: 0.45,
  },
});
