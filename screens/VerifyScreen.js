import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const GREEN = '#0C9E54';
const OFF_WHITE = '#F8F9FA';

const BRAND = {
  primaryGreen: '#0C9E54',
  mintPop:      '#C5FFBC',
  darkSection:  '#04361D',
  pale:         '#F0FDF4',
  white:        '#FFFFFF',
  bgLight:      '#F8FAFC',
  greyText:     '#64748B',
  border:       '#E2E8F0',
  navy:         '#0D1B4B',
};

export default function VerifyScreen({ navigation }) {
  useEffect(() => {
    navigation.replace('ReceiptUpload');
  }, []);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={GREEN} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
});