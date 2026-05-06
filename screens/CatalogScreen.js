import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';

const GREEN = '#0C9E54';
const NAVY = '#0D1B4B';
const WHITE = '#FFFFFF';
const GRAY = '#64748B';
const BORDER = '#E2E8F0';
const OFF_WHITE = '#F8FAFC';

export default function CatalogScreen({ navigation }) {
  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={18} color={NAVY} />
        </TouchableOpacity>
        <Text style={styles.title}>Deal Catalog</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Catalog paused for launch</Text>
          <Text style={styles.cardBody}>
            Browse and comparison should come from backend-approved weekly lifecycle plans. Use Explore or Weekly Plan for the launch flow.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.primaryBtnTxt}>Back to Explore</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: OFF_WHITE },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: WHITE, borderBottomWidth: 1, borderBottomColor: BORDER },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: OFF_WHITE, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '900', color: NAVY },
  scroll: { padding: 16 },
  card: { backgroundColor: WHITE, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: BORDER },
  cardTitle: { color: NAVY, fontSize: 18, fontWeight: '900', marginBottom: 8 },
  cardBody: { color: GRAY, fontSize: 13, lineHeight: 20 },
  primaryBtn: { marginTop: 18, backgroundColor: GREEN, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  primaryBtnTxt: { color: WHITE, fontSize: 13, fontWeight: '900' },
});
