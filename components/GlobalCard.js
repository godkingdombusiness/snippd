// components/GlobalCard.js
// Unified card surface for DailyPulse, WaitlistPosition, WealthStacks, and any
// elevated content block. Never hardcodes visual values — all from design tokens.

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { COLORS, RADIUS, SHADOW, SPACE } from '../src/design/tokens';

/**
 * GlobalCard
 *
 * Props:
 *   variant    — 'default' | 'navy' | 'mint' | 'flat'
 *                default → white card, standard shadow
 *                navy    → dark navy bg, use inverted text tokens
 *                mint    → mint bg, green shadow
 *                flat    → white card, no shadow (for nested use)
 *   padding    — override inner padding (default: SPACE.lg)
 *   radius     — override border radius (default: RADIUS.card)
 *   style      — additional style overrides
 *   children
 */
export default function GlobalCard({
  variant = 'default',
  padding = SPACE.lg,
  radius  = RADIUS.card,
  style,
  children,
}) {
  const bg = {
    default: COLORS.card,
    navy:    COLORS.navy,
    mint:    COLORS.mint,
    flat:    COLORS.card,
  }[variant] ?? COLORS.card;

  const shadow = {
    default: SHADOW.card,
    navy:    SHADOW.elevated,
    mint:    SHADOW.mint,
    flat:    {},
  }[variant] ?? SHADOW.card;

  return (
    <View
      style={[
        styles.base,
        { backgroundColor: bg, borderRadius: radius, padding },
        shadow,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    width: '100%',
  },
});
