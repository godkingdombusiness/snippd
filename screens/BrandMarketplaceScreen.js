import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Image, Dimensions, FlatList, StatusBar, Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');

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
  gold:         '#FFB800',
};

const CAMPAIGNS = [
  {
    id: 'c1',
    brand: 'Chobani',
    title: 'Morning Yogurt Hack',
    reward: '$15.00',
    type: 'Video Reel',
    logo: 'https://logo.clearbit.com/chobani.com',
    spots: 5,
  },
  {
    id: 'c2',
    brand: 'Tide',
    title: 'Clean Home Haul',
    reward: '$25.00',
    type: 'Photo Gallery',
    logo: 'https://logo.clearbit.com/tide.com',
    spots: 12,
  },
  {
    id: 'c3',
    brand: 'Kraft',
    title: 'Mac & Cheese Stacks',
    reward: '$10.00',
    type: 'Quick Tip',
    logo: 'https://logo.clearbit.com/kraftheinzcompany.com',
    spots: 2,
  }
];

export default function BrandMarketplaceScreen({ navigation }) {

  const handleManagePayouts = () => {
    Alert.alert(
      'Snippd Payouts',
      'Payout management is coming soon. Earnings will be deposited to your linked account monthly.',
      [{ text: 'Got it' }]
    );
  };

  const handleClaimSpot = (campaign) => {
    Alert.alert(
      `Claim: ${campaign.title}`,
      `You're applying to partner with ${campaign.brand} for ${campaign.reward}. A brand rep will review your profile and reach out within 48 hours.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Apply Now', onPress: () => Alert.alert('Applied!', `Your application for "${campaign.title}" has been submitted.`) },
      ]
    );
  };

  const handleCampaignPress = (campaign) => {
    Alert.alert(
      campaign.title,
      `${campaign.brand} · ${campaign.type}\nReward: ${campaign.reward}\n${campaign.spots} spots remaining`,
      [
        { text: 'Close', style: 'cancel' },
        { text: 'Claim Spot', onPress: () => handleClaimSpot(campaign) },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <SafeAreaView edges={['top']} style={styles.header}>
        <View style={styles.navRow}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Feather name="chevron-left" size={28} color={BRAND.navy} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Brand Marketplace</Text>
          <View style={styles.badge}>
            <MaterialCommunityIcons name="star" size={12} color={BRAND.gold} />
            <Text style={styles.badgeTxt}>PRO</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        
        {/* EARNINGS OVERVIEW */}
        <View style={styles.earningsCard}>
          <View>
            <Text style={styles.labelCaps}>TOTAL EARNINGS</Text>
            <Text style={styles.earningsAmt}>$142.50</Text>
          </View>
          <TouchableOpacity style={styles.payoutBtn} onPress={handleManagePayouts}>
            <Text style={styles.payoutBtnTxt}>Manage Payouts</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Available Deals</Text>
          <Text style={styles.sectionSub}>Showcase these brands in your next stack</Text>
        </View>

        {CAMPAIGNS.map((item) => (
          <TouchableOpacity key={item.id} style={styles.campaignCard} onPress={() => handleCampaignPress(item)}>
            <View style={styles.campTop}>
              <Image source={{ uri: item.logo }} style={styles.brandLogo} />
              <View style={styles.campInfo}>
                <Text style={styles.brandName}>{item.brand}</Text>
                <Text style={styles.campTitle}>{item.title}</Text>
              </View>
              <View style={styles.rewardBadge}>
                <Text style={styles.rewardTxt}>{item.reward}</Text>
              </View>
            </View>

            <View style={styles.campDivider} />

            <View style={styles.campBottom}>
              <View style={styles.metaItem}>
                <Feather name="video" size={14} color={BRAND.greyText} />
                <Text style={styles.metaTxt}>{item.type}</Text>
              </View>
              <View style={styles.metaItem}>
                <Feather name="users" size={14} color={BRAND.greyText} />
                <Text style={styles.metaTxt}>{item.spots} spots left</Text>
              </View>
              <TouchableOpacity style={styles.claimBtn} onPress={() => handleClaimSpot(item)}>
                <Text style={styles.claimBtnTxt}>Claim Spot</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}

        {/* TIPS SECTION */}
        <View style={styles.tipsCard}>
          <Text style={styles.tipsTitle}>Pro Tip</Text>
          <Text style={styles.tipsDesc}>
            Brands love seeing the Snippd "Savings Overlay" in your videos. Higher engagement leads to bigger invites!
          </Text>
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BRAND.bgLight },
  header: { backgroundColor: BRAND.white, paddingHorizontal: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: BRAND.border },
  navRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: BRAND.navy },
  badge: { flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, gap: 4 },
  badgeTxt: { color: BRAND.white, fontSize: 10, fontWeight: 'bold' },
  
  scroll: { paddingHorizontal: 20, paddingTop: 20 },
  
  earningsCard: { 
    backgroundColor: BRAND.darkSection, 
    padding: 24, 
    borderRadius: 24, 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    marginBottom: 30
  },
  labelCaps: { fontSize: 10, fontWeight: 'bold', color: BRAND.primaryGreen, letterSpacing: 1 },
  earningsAmt: { fontSize: 32, fontWeight: 'bold', color: BRAND.white, marginTop: 4 },
  payoutBtn: { backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  payoutBtnTxt: { color: BRAND.white, fontSize: 12, fontWeight: 'bold' },

  sectionHeader: { marginBottom: 20 },
  sectionTitle: { fontSize: 24, fontWeight: 'bold', color: BRAND.navy },
  sectionSub: { fontSize: 14, color: BRAND.greyText, marginTop: 4, fontWeight: 'normal' },

  campaignCard: { backgroundColor: BRAND.white, borderRadius: 22, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: BRAND.border },
  campTop: { flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 44, height: 44, borderRadius: 12, backgroundColor: BRAND.bgLight },
  campInfo: { flex: 1, marginLeft: 16 },
  brandName: { fontSize: 12, color: BRAND.primaryGreen, fontWeight: 'bold', textTransform: 'uppercase' },
  campTitle: { fontSize: 17, fontWeight: 'bold', color: BRAND.navy, marginTop: 2 },
  rewardBadge: { backgroundColor: '#E8F8F0', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14 },
  rewardTxt: { color: BRAND.primaryGreen, fontWeight: 'bold', fontSize: 15 },
  
  campDivider: { height: 1, backgroundColor: BRAND.border, marginVertical: 16 },
  
  campBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaTxt: { fontSize: 12, color: BRAND.greyText, fontWeight: 'normal' },
  claimBtn: { backgroundColor: BRAND.navy, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12 },
  claimBtnTxt: { color: BRAND.white, fontSize: 12, fontWeight: 'bold' },

  tipsCard: { backgroundColor: '#FFFBEB', padding: 20, borderRadius: 20, borderLeftWidth: 4, borderLeftColor: BRAND.gold, marginTop: 10 },
  tipsTitle: { fontSize: 15, fontWeight: 'bold', color: BRAND.navy },
  tipsDesc: { fontSize: 13, color: '#92400E', marginTop: 4, lineHeight: 18, fontWeight: 'normal' },
});