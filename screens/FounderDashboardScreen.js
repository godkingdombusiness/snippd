// screens/FounderDashboardScreen.js
// Locked behind isBetaLive === true + status in ('beta', 'lifetime').
// Shows: countdown to full launch, exclusive perks, TestFlight CTA, Slack invite.
// If beta is not live, redirects to WaitlistScreen.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Linking,
  StyleSheet,
  Animated,
} from 'react-native';
import { supabase } from '../lib/supabase';
import GlobalCard      from '../components/GlobalCard';
import ConciergeButton from '../components/ConciergeButton';
import AgentActivityLog from '../components/AgentActivityLog';
import VictoryCard      from '../components/VictoryCard';
import { COLORS, TYPE, SPACE, RADIUS, SHADOW } from '../src/design/tokens';

// Hardcoded target — replace with real launch date
const LAUNCH_DATE = new Date('2026-07-01T00:00:00Z');

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/REPLACE_TOKEN';
const SLACK_URL      = 'https://join.slack.com/t/snippd/REPLACE_TOKEN';

function useCountdown(target) {
  const [diff, setDiff] = useState(Math.max(0, target - Date.now()));
  useEffect(() => {
    const t = setInterval(() => setDiff(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(t);
  }, [target]);
  const s = Math.floor(diff / 1000);
  return {
    days:    Math.floor(s / 86400),
    hours:   Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
  };
}

export default function FounderDashboardScreen({ navigation }) {
  const [persona, setPersona]       = useState(null);
  const [isBetaLive, setIsBetaLive] = useState(false);
  const [loading, setLoading]       = useState(true);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const countdown = useCountdown(LAUNCH_DATE.getTime());

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigation.replace('Auth'); return; }

      const [{ data: personaData }, { data: betaFlag }] = await Promise.all([
        supabase.from('user_persona').select('*').eq('user_id', user.id).single(),
        supabase.from('snippd_integrations').select('value').eq('key', 'is_beta_live').single(),
      ]);

      const live = betaFlag?.value === 'true';
      setIsBetaLive(live);
      setPersona(personaData);
      setLoading(false);

      if (!live) {
        navigation.replace('Waitlist');
        return;
      }

      Animated.timing(fadeAnim, {
        toValue: 1, duration: 500, useNativeDriver: true,
      }).start();
    })();
  }, [fadeAnim, navigation]);

  if (loading) return <View style={styles.screen} />;

  const isLifetime = persona?.status === 'lifetime';
  const tierLabel  = isLifetime ? 'Lifetime Founder' : 'Beta Pro';
  const tierColor  = isLifetime ? COLORS.amber : COLORS.green;

  return (
    <View style={styles.screen}>
      {/* Navy hero */}
      <View style={styles.hero}>
        <View style={[styles.tierBadge, { backgroundColor: tierColor + '22', borderColor: tierColor }]}>
          <Text style={[TYPE.label, { color: tierColor }]}>
            {tierLabel.toUpperCase()}
          </Text>
        </View>
        <Text style={styles.heroTitle}>Founder Dashboard</Text>
        <Text style={[TYPE.bodyInv, { textAlign: 'center', opacity: 0.7 }]}>
          You're in. Here's what's unlocked.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={{ opacity: fadeAnim, gap: SPACE.lg }}>

          {/* Countdown */}
          <GlobalCard variant="navy">
            <Text style={[TYPE.label, { color: COLORS.mint, marginBottom: SPACE.md }]}>
              FULL LAUNCH IN
            </Text>
            <View style={styles.countdownRow}>
              {[
                { val: countdown.days,    unit: 'Days'    },
                { val: countdown.hours,   unit: 'Hours'   },
                { val: countdown.minutes, unit: 'Min'     },
                { val: countdown.seconds, unit: 'Sec'     },
              ].map(({ val, unit }) => (
                <View key={unit} style={styles.countdownCell}>
                  <Text style={styles.countdownNum}>{String(val).padStart(2, '0')}</Text>
                  <Text style={[TYPE.caption, { color: '#8FBFB0' }]}>{unit}</Text>
                </View>
              ))}
            </View>
          </GlobalCard>

          {/* Perks */}
          <VictoryCard
            icon="🎯"
            label="Wealth Stacks Active"
            value="Full Access"
            subLabel="Clip sessions, receipt verification & more"
            accent="green"
          />
          {isLifetime && (
            <VictoryCard
              icon="♾️"
              label="Membership"
              value="Lifetime"
              subLabel="Never pay again — locked in at $99"
              accent="amber"
            />
          )}

          {/* TestFlight */}
          <GlobalCard variant="default">
            <Text style={[TYPE.h3, { marginBottom: SPACE.sm }]}>TestFlight (iOS)</Text>
            <Text style={[TYPE.bodyMd, { marginBottom: SPACE.lg }]}>
              Get early builds and test new features before anyone else.
            </Text>
            <ConciergeButton
              label="Join TestFlight →"
              variant="secondary"
              onPress={() => Linking.openURL(TESTFLIGHT_URL)}
            />
          </GlobalCard>

          {/* Slack */}
          <GlobalCard variant="default">
            <Text style={[TYPE.h3, { marginBottom: SPACE.sm }]}>Founder Slack</Text>
            <Text style={[TYPE.bodyMd, { marginBottom: SPACE.lg }]}>
              Direct line to the team. Suggest features, report bugs, shape the product.
            </Text>
            <ConciergeButton
              label="Join Slack Community"
              variant="ghost"
              onPress={() => Linking.openURL(SLACK_URL)}
            />
          </GlobalCard>

          {/* Agent status */}
          <AgentActivityLog
            variant="canvas"
            status="active"
            location={persona?.location ?? 'your area'}
            vibe={persona?.style_vibe ?? 'your style'}
            size={persona?.clothing_size ?? 'your size'}
            style={{ marginBottom: SPACE.xxl }}
          />

        </Animated.View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex:            1,
    backgroundColor: COLORS.canvas,
  },
  hero: {
    backgroundColor:   COLORS.navy,
    paddingTop:        56,
    paddingBottom:     SPACE.xxl,
    alignItems:        'center',
    paddingHorizontal: SPACE.xxl,
    gap:               SPACE.sm,
  },
  tierBadge: {
    borderWidth:   1,
    borderRadius:  RADIUS.pill,
    paddingVertical:   SPACE.xs,
    paddingHorizontal: SPACE.md,
    marginBottom:  SPACE.xs,
  },
  heroTitle: {
    fontSize:      28,
    fontWeight:    '800',
    color:         COLORS.white,
    letterSpacing: -0.5,
  },
  content: {
    padding: SPACE.lg,
  },
  countdownRow: {
    flexDirection: 'row',
    gap:           SPACE.md,
  },
  countdownCell: {
    flex:           1,
    alignItems:     'center',
    backgroundColor: COLORS.navyDeep,
    borderRadius:   RADIUS.sm,
    paddingVertical: SPACE.md,
  },
  countdownNum: {
    fontSize:      26,
    fontWeight:    '800',
    color:         COLORS.mint,
    letterSpacing: -1,
  },
});
