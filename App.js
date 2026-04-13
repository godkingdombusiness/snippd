import React, { useEffect, useState, useCallback } from 'react';
import {
  StyleSheet, View, Platform, Text, Image, TouchableOpacity,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef, resetToScreen } from './lib/navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Feather } from '@expo/vector-icons'; 
import { supabase } from './lib/supabase';

// ── TAB SCREENS ──────────────────────────────────────────────────────────────
import HomeScreen from './screens/HomeScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import CartScreen from './screens/CartScreen';
import StudioScreen from './screens/StudioScreen';
import ProfileScreen from './screens/ProfileScreen';

// ── STACK SCREENS ────────────────────────────────────────────────────────────
import AuthScreen from './screens/AuthScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import StackDetailScreen from './screens/StackDetailScreen';
import WinsScreen from './screens/WinsScreen';
import KitchenScreen from './screens/KitchenScreen';
import ReceiptUploadScreen from './screens/ReceiptUploadScreen';
import TripResultsScreen from './screens/TripResultsScreen';
import ShoppingPlanScreen from './screens/ShoppingPlanScreen';
import ChefStashScreen from './screens/ChefStashScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import PreferredStoresScreen from './screens/PreferredStoresScreen';
import BudgetPreferencesScreen from './screens/BudgetPreferencesScreen';
import FamilySharingScreen from './screens/FamilySharingScreen';
import InviteFriendsScreen from './screens/InviteFriendsScreen';
import PromoCodesScreen from './screens/PromoCodesScreen';
import HelpScreen from './screens/HelpScreen';
import PantryScreen from './screens/PantryScreen';
import ListScreen from './screens/ListScreen';
import CatalogScreen from './screens/CatalogScreen';
import CartOptionsScreen from './screens/CartOptionsScreen';
import CartOptionDetailScreen from './screens/CartOptionDetailScreen';
import WealthMomentumScreen from './screens/WealthMomentumScreen';
import AppTestAgent from './screens/AppTestAgent';
import AdminPulseScreen from './screens/AdminPulseScreen';
import AdminGraphScreen from './screens/AdminGraphScreen';
import MFAVerifyScreen from './screens/MFAVerifyScreen';
import MFASetupScreen from './screens/MFASetupScreen';
import BudgetDashboardScreen from './screens/BudgetDashboardScreen';
import CategoryInsightScreen from './screens/CategoryInsightScreen';
import { useSessionGuard } from './lib/sessionGuard';
import { TrialProvider, useTrialStatus } from './lib/trialContext';
import TrialGateScreen from './screens/TrialGateScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── PER-TAB STACK NAVIGATORS ─────────────────────────────────────────────────
const HomeStackNav     = createNativeStackNavigator();
const DiscoverStackNav = createNativeStackNavigator();
const CartStackNav     = createNativeStackNavigator();
const StudioStackNav   = createNativeStackNavigator();
const ProfileStackNav  = createNativeStackNavigator();

const GREEN = '#0C9E54';
const DARK_NAVY = '#04361D'; 
const MINT_POP = '#C5FFBC';  
const WHITE = '#FFFFFF';
const GRAY = '#94A3B8';

SplashScreen.preventAutoHideAsync().catch(() => {});

const TabIcon = ({ focused, label, iconName }) => (
  <View style={styles.tabItemInner}>
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Feather 
        name={iconName} 
        size={20} 
        color={focused ? MINT_POP : GRAY} 
      />
    </View>
    <Text style={[
      styles.tabLabel,
      { color: focused ? WHITE : GRAY }
    ]}>
      {label}
    </Text>
    {/* Dot is now absolute positioned to avoid pushing text up */}
    {focused && <View style={styles.activeDot} />}
  </View>
);

// ── HOME STACK ───────────────────────────────────────────────────────────────
function HomeStack() {
  return (
    <HomeStackNav.Navigator screenOptions={{ headerShown: false }}>
      <HomeStackNav.Screen name="Home"               component={HomeScreen} />
      <HomeStackNav.Screen name="ChefStash"          component={ChefStashScreen} />
      <HomeStackNav.Screen name="Kitchen"            component={KitchenScreen} />
      <HomeStackNav.Screen name="Pantry"             component={PantryScreen} />
      <HomeStackNav.Screen name="List"               component={ListScreen} />
      <HomeStackNav.Screen name="ShoppingPlan"       component={ShoppingPlanScreen} />
      <HomeStackNav.Screen name="TripResults"        component={TripResultsScreen} />
      <HomeStackNav.Screen name="ReceiptUpload"      component={ReceiptUploadScreen} />
      <HomeStackNav.Screen name="Wins"               component={WinsScreen} />
      <HomeStackNav.Screen name="FamilySharing"       component={FamilySharingScreen} />
      <HomeStackNav.Screen name="BudgetPreferences"  component={BudgetPreferencesScreen} />
      <HomeStackNav.Screen name="BudgetDashboard"    component={BudgetDashboardScreen} />
      <HomeStackNav.Screen name="CategoryInsight"    component={CategoryInsightScreen} />
    </HomeStackNav.Navigator>
  );
}

// ── DISCOVER STACK ───────────────────────────────────────────────────────────
function DiscoverStack() {
  return (
    <DiscoverStackNav.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStackNav.Screen name="Discover"    component={DiscoverScreen} />
      <DiscoverStackNav.Screen name="StackDetail" component={StackDetailScreen} />
      <DiscoverStackNav.Screen name="Catalog"     component={CatalogScreen} />
      <DiscoverStackNav.Screen name="Cart"        component={CartScreen} options={{ presentation: 'modal' }} />
      <DiscoverStackNav.Screen name="ChefStash"   component={ChefStashScreen} />
    </DiscoverStackNav.Navigator>
  );
}

// ── CART STACK ───────────────────────────────────────────────────────────────
function CartStack() {
  return (
    <CartStackNav.Navigator screenOptions={{ headerShown: false }}>
      <CartStackNav.Screen name="CartMain"          component={CartScreen} />
      <CartStackNav.Screen name="ReceiptUpload"     component={ReceiptUploadScreen} />
      <CartStackNav.Screen name="ShoppingPlan"      component={ShoppingPlanScreen} />
      <CartStackNav.Screen name="TripResults"       component={TripResultsScreen} />
      <CartStackNav.Screen name="List"              component={ListScreen} />
      <CartStackNav.Screen name="CartOptions"       component={CartOptionsScreen} />
      <CartStackNav.Screen name="CartOptionDetail"  component={CartOptionDetailScreen} />
      <CartStackNav.Screen name="WealthMomentum"   component={WealthMomentumScreen} />
    </CartStackNav.Navigator>
  );
}

// ── STUDIO STACK ─────────────────────────────────────────────────────────────
function StudioStack() {
  return (
    <StudioStackNav.Navigator screenOptions={{ headerShown: false }}>
      <StudioStackNav.Screen name="Studio"       component={StudioScreen} />
      <StudioStackNav.Screen name="ReceiptUpload" component={ReceiptUploadScreen} />
    </StudioStackNav.Navigator>
  );
}

// ── PROFILE STACK ────────────────────────────────────────────────────────────
function ProfileStack() {
  return (
    <ProfileStackNav.Navigator screenOptions={{ headerShown: false }}>
      <ProfileStackNav.Screen name="Profile"           component={ProfileScreen} />
      <ProfileStackNav.Screen name="EditProfile"       component={EditProfileScreen} />
      <ProfileStackNav.Screen name="PreferredStores"   component={PreferredStoresScreen} />
      <ProfileStackNav.Screen name="BudgetPreferences"  component={BudgetPreferencesScreen} />
      <ProfileStackNav.Screen name="BudgetDashboard"   component={BudgetDashboardScreen} />
      <ProfileStackNav.Screen name="CategoryInsight"   component={CategoryInsightScreen} />
      <ProfileStackNav.Screen name="FamilySharing"     component={FamilySharingScreen} />
      <ProfileStackNav.Screen name="InviteFriends"     component={InviteFriendsScreen} />
      <ProfileStackNav.Screen name="PromoCodes"        component={PromoCodesScreen} />
      <ProfileStackNav.Screen name="Help"              component={HelpScreen} />
      <ProfileStackNav.Screen name="AdminPulse"        component={AdminPulseScreen} />
      <ProfileStackNav.Screen name="TestAgent"         component={AppTestAgent} />
      <ProfileStackNav.Screen name="TripResults"       component={TripResultsScreen} />
      <ProfileStackNav.Screen name="ReceiptUpload"     component={ReceiptUploadScreen} />
      <ProfileStackNav.Screen name="MFASetup"          component={MFASetupScreen} />
      <ProfileStackNav.Screen name="WealthMomentum"   component={WealthMomentumScreen} />
      <ProfileStackNav.Screen name="AdminGraph"       component={AdminGraphScreen} />
    </ProfileStackNav.Navigator>
  );
}

// ── CUSTOM TAB BAR ───────────────────────────────────────────────────────────
// pointerEvents="box-none" on the outer shell lets scroll events pass through
// transparent areas, fixing the elevation-based touch-blocking bug on Android.
function CustomTabBar({ state, descriptors, navigation }) {
  return (
    <View style={styles.tabBarShell} pointerEvents="box-none">
      <View style={styles.tabBar}>
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate({ name: route.name, merge: true });
            }
          };

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabTouchable}
              onPress={onPress}
              activeOpacity={0.8}
            >
              {options.tabBarIcon?.({ focused, color: focused ? MINT_POP : GRAY, size: 20 })}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ── TRIAL BANNER ─────────────────────────────────────────────────────────────
function TrialBanner() {
  const { trialStatus, dayNum, daysLeft } = useTrialStatus();
  if (trialStatus !== 'active') return null;

  const isLastDay = daysLeft <= 1;
  return (
    <View style={[styles.trialBanner, isLastDay && styles.trialBannerUrgent]}>
      <Text style={styles.trialBannerTxt}>
        {isLastDay
          ? `⚠️ Last day of your free trial — upgrade to keep access`
          : `🕐 Day ${dayNum} of 7 — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your free trial`}
      </Text>
      <Text style={styles.trialBannerCta}>Upgrade ›</Text>
    </View>
  );
}

// ── TAB NAVIGATOR ────────────────────────────────────────────────────────────
function MainTabs() {
  return (
    <View style={{ flex: 1 }}>
      <TrialBanner />
      <Tab.Navigator
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
    >
      <Tab.Screen
        name="HomeTab"
        component={HomeStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Home" iconName="home" />
          ),
        }}
      />
      <Tab.Screen
        name="DiscoverTab"
        component={DiscoverStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Explore" iconName="compass" />
          ),
        }}
      />

      <Tab.Screen
        name="SnippdTab"
        component={CartStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <View style={styles.fabWrap}>
              <View style={[styles.fabBorder, focused && { borderColor: MINT_POP }]}>
                <View style={[styles.fab, focused && { backgroundColor: WHITE }]}>
                  <Image
                    source={require('./assets/Snippd-White-Cart .png')}
                    style={[styles.fabLogo, { tintColor: focused ? GREEN : WHITE }]}
                    resizeMode="contain"
                  />
                </View>
              </View>
            </View>
          ),
        }}
      />

      <Tab.Screen
        name="StudioTab"
        component={StudioStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Studio" iconName="video" />
          ),
        }}
      />
      <Tab.Screen
        name="ProfileTab"
        component={ProfileStack}
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} label="Profile" iconName="user" />
          ),
        }}
      />
    </Tab.Navigator>
    </View>
  );
}

function RootNavigator() {
  const [loading, setLoading] = useState(true);
  const [initialRoute, setInitialRoute] = useState('Auth');
  const sessionHandlers = useSessionGuard();
  const { isPaused } = useTrialStatus();

  const [fontsLoaded, fontError] = useFonts({
    'Sublima-ExtraBold': require('./assets/fonts/Sublima-ExtraBold.otf'),
    'Sublima-ExtraBoldItalic': require('./assets/fonts/Sublima-ExtraBoldItalic.otf'),
    'Sublima-ExtraLight': require('./assets/fonts/Sublima-ExtraLight.otf'),
    'Sublima-ExtraLightItalic': require('./assets/fonts/Sublima-ExtraLightItalic.otf'),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setInitialRoute('MainApp');
      } else {
        setInitialRoute('Auth');
      }
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === 'SIGNED_OUT') {
          setInitialRoute('Auth');
          // Actually navigate — initialRouteName alone doesn't move the stack
          resetToScreen('Auth');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const onLayoutRootView = useCallback(async () => {
    if ((fontsLoaded || fontError) && !loading) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError, loading]);

  if ((!fontsLoaded && !fontError) || loading) {
    return null;
  }

  // Resolve starting route — paused trial overrides everything
  const resolvedRoute = isPaused && initialRoute === 'MainApp'
    ? 'TrialGate'
    : initialRoute;

  return (
    <View style={{ flex: 1 }} onLayout={onLayoutRootView} {...sessionHandlers}>
      <Stack.Navigator
        id="root"
        initialRouteName={resolvedRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Auth"       component={AuthScreen} />
        <Stack.Screen name="Onboarding" component={OnboardingScreen} />
        <Stack.Screen name="MainApp"    component={MainTabs} />
        <Stack.Screen name="TrialGate"  component={TrialGateScreen} />
        <Stack.Screen name="TestAgent"  component={AppTestAgent} />
        <Stack.Screen name="MFAVerify"  component={MFAVerifyScreen} />
        <Stack.Screen name="MFASetup"   component={MFASetupScreen} />
      </Stack.Navigator>
    </View>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <TrialProvider>
            <RootNavigator />
          </TrialProvider>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  // Shell is full-width, positioned absolute, transparent — pointerEvents="box-none"
  // means it passes all touches through its transparent regions to the ScrollView below.
  tabBarShell: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: Platform.OS === 'ios' ? 110 : 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
  },
  // The visible pill — no position:absolute, lives inside the shell
  tabBar: {
    width: '92%',
    height: 70,
    borderRadius: 30,
    backgroundColor: DARK_NAVY,
    borderTopWidth: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3, shadowRadius: 15,
    elevation: 10,
    overflow: 'visible',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  tabTouchable: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabItemInner: { 
    flex: 1,
    alignItems: 'center', 
    justifyContent: 'center',
    height: '100%',
    position: 'relative',
  },
  tabIconWrap: { 
    width: 36, height: 28, 
    borderRadius: 8, 
    alignItems: 'center', 
    justifyContent: 'center',
    marginBottom: 2
  },
  tabIconWrapActive: { 
    backgroundColor: 'rgba(255, 255, 255, 0.1)', 
  },
  activeDot: {
    position: 'absolute',
    bottom: 6, // Anchored to bottom of bar
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: MINT_POP,
  },
  tabLabel: { 
    fontSize: 9, 
    letterSpacing: 0.3, 
    fontWeight: '400',
    marginTop: 0,
  },
  fabWrap: { 
    width: 65,
    alignItems: 'center', 
    justifyContent: 'center', 
    marginBottom: 35, // Pushes the center button up
    zIndex: 100 
  },
  fabBorder: {
    width: 68,
    height: 68,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  fab: {
    width: 56, height: 56, 
    borderRadius: 16,
    backgroundColor: GREEN,
    alignItems: 'center', justifyContent: 'center',
  },
  fabLogo: {
    width: 26, height: 26,
    transform: [{ rotate: '-45deg' }],
  },

  // TRIAL BANNER
  trialBanner: {
    backgroundColor: '#0C9E54',
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 8,
  },
  trialBannerUrgent: {
    backgroundColor: '#B45309',
  },
  trialBannerTxt: {
    flex: 1, color: '#FFFFFF',
    fontSize: 11,
  },
  trialBannerCta: {
    color: '#C5FFBC', fontSize: 12,
    fontWeight: 'bold', marginLeft: 10,
  },
});