import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

var NAVY  = '#172250';
var CORAL = '#fb5b5b';

export default function HomeHeader(props) {
  var onNotificationPress = props.onNotificationPress;
  var onProfilePress      = props.onProfilePress;
  var userName            = props.userName || '';

  return (
    <LinearGradient
      colors={['#04351F', '#076B3A', '#0C9E54']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0.6 }}
      style={styles.gradient}
    >
      <View style={styles.topBar}>
        <View style={styles.logoContainer}>
          <Feather name="scissors" size={24} color="#FFFFFF" />
          <Text style={styles.logoText}>snippd</Text>
        </View>

        <View style={styles.iconRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={onNotificationPress}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={22} color="#FFFFFF" />
            <View style={styles.notificationDot} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.iconButton}
            onPress={onProfilePress}
            activeOpacity={0.7}
          >
            <Feather name="user" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.greetingContainer}>
        <Text style={styles.greeting}>
          {userName ? 'Good morning, ' + userName + '.' : 'Good morning.'}
        </Text>
        <Text style={styles.subtext}>Smart choices. Real savings.</Text>
      </View>
    </LinearGradient>
  );
}

var styles = StyleSheet.create({
  gradient: {
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  logoContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoText: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 12,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: CORAL,
  },
  greetingContainer: {
    marginBottom: 24,
  },
  greeting: {
    fontSize: 28,
    fontWeight: '700',
    color: '#FFFFFF',
    lineHeight: 32,
    marginBottom: 6,
  },
  subtext: {
    fontSize: 16,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.88)',
    lineHeight: 22,
  },
});
