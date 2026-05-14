import React from 'react';
import { TouchableOpacity, Text, StyleSheet, View } from 'react-native';
import { Feather } from '@expo/vector-icons';

var GREEN  = '#0C9E54';
var NAVY   = '#172250';
var WHITE  = '#FFFFFF';
var GRAY   = '#6B7280';
var BORDER = '#E5E7EB';
var AMBER  = '#F59E0B';

var VARIANT_CONFIG = {
  store: {
    icon:       'list',
    bgColor:    WHITE,
    textColor:  GREEN,
    borderColor: GREEN,
  },
  uber: {
    icon:       'external-link',
    bgColor:    AMBER,
    textColor:  WHITE,
    borderColor: AMBER,
  },
  copy: {
    icon:       'copy',
    bgColor:    WHITE,
    textColor:  NAVY,
    borderColor: BORDER,
  },
};

function StoreExportButton(props) {
  var label    = props.label    || 'Export list';
  var variant  = props.variant  || 'store'; // 'store' | 'uber' | 'copy'
  var onPress  = props.onPress;
  var disabled = props.disabled || false;
  var small    = props.small    || false;

  var cfg = VARIANT_CONFIG[variant] || VARIANT_CONFIG.store;

  return (
    <TouchableOpacity
      style={[
        styles.btn,
        small && styles.btnSmall,
        {
          backgroundColor: cfg.bgColor,
          borderColor:     cfg.borderColor,
        },
        disabled && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.82}
    >
      <Feather name={cfg.icon} size={small ? 13 : 15} color={cfg.textColor} />
      <Text style={[styles.label, { color: cfg.textColor }, small && styles.labelSmall]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

var styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  btnSmall: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 9,
  },
  btnDisabled: { opacity: 0.45 },
  label:      { fontSize: 14, fontWeight: '700' },
  labelSmall: { fontSize: 12 },
});

export default StoreExportButton;
