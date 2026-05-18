import React, { useEffect, useState, Component } from 'react';
import {
  StyleSheet, View, Platform, Text, Image, TouchableOpacity, ScrollView,
} from 'react-native';

// ── Global Error Boundary — catches render crashes and shows the real error ──
class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, windowError: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidMount() {
    // Catch non-React errors on web (module-level throws, unhandled promises)
    if (typeof window !== 'undefined') {
      this._onError = (event) => {
        this.setState({ windowError: event.message + '\n' + (event.filename ?? '') + ':' + event.lineno });
      };
      this._onUnhandled = (event) => {
        this.setState({ windowError: 'Unhandled promise: ' + (event.reason?.message ?? String(event.reason)) });
      };
      window.addEventListener('error', this._onError);
      window.addEventListener('unhandledrejection', this._onUnhandled);
    }
  }
  componentWillUnmount() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', this._onError);
      window.removeEventListener('unhandledrejection', this._onUnhandled);
    }
  }
  render() {
    const err = this.state.error || this.state.windowError;
    if (err) {
      const msg = typeof err === 'string' ? err : (err?.message ?? String(err));
      const stack = typeof err === 'string' ? '' : (err?.stack ?? '');
      return (
        <View style={{ flex: 1, backgroundColor: '#fff', padding: 24, paddingTop: 60 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#B91C1C', marginBottom: 12 }}>
            App Crash — Real Error:
          </Text>
          <ScrollView>
            <Text selectable style={{ fontSize: 13, color: '#1A1A1A', fontFamily: 'monospace' }}>
              {msg}
            </Text>
            <Text style={{ marginTop: 16, fontSize: 11, color: '#64748B' }}>
              {stack}
            </Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer } from '@react-navigation/native';
import { navigationRef, resetToScreen } from './lib/navigationRef';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { useFonts } from 'expo-font';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './lib/supabase';
import { tracker } from './src/lib/eventTracker';
import { HealthMonitor } from './lib/healthMonitor';
import { filterEnabledItems } from './src/features/registry';
import { renderChefStashScreen } from './src/features/chefStash';
import { createStudioStack, studioTab } from './src/features/studio';
import { renderOmniStoreComparisonScreen } from './src/features/omniStoreComparison';

// ── TAB SCREENS ──────────────────────────────────────────────────────────────
import HomeScreen from './screens/HomeScreen';
import DiscoverScreen from './screens/DiscoverScreen';
import CartScreen from './screens/CartScreen';
import ProfileScreen from './screens/ProfileScreen';

// ── STACK SCREENS ────────────────────────────────────────────────────────────
import SignInScreen from './screens/SignInScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import StackDetailScreen from './screens/StackDetailScreen';
import WinsScreen from './screens/WinsScreen';
import KitchenScreen from './screens/KitchenScreen';
import ReceiptUploadScreen from './screens/ReceiptUploadScreen';
import TripResultsScreen from './screens/TripResultsScreen';
import ShoppingPlanScreen from './screens/ShoppingPlanScreen';
import EditProfileScreen from './screens/EditProfileScreen';
import PreferredStoresScreen from './screens/PreferredStoresScreen';
import BudgetPreferencesScreen from './screens/BudgetPreferencesScreen';
import FamilySharingScreen from './screens/FamilySharingScreen';
import InviteFriendsScreen from './screens/InviteFriendsScreen';
import PromoCodesScreen from './screens/PromoCodesScreen';
import HelpScreen from './screens/HelpScreen';
import PantryScreen from './screens/PantryScreen';
import ListScreen from './screens/ListScreen';
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
import { BudgetProvider } from './lib/BudgetContext';
import TrialGateScreen from './screens/TrialGateScreen';
import PrivacyPolicyScreen from './screens/PrivacyPolicyScreen';
import AdminCircularUploadScreen from './screens/AdminCircularUploadScreen';
import AdminDealReviewScreen from './screens/AdminDealReviewScreen';
import StackReviewTrainingScreen from './screens/StackReviewTrainingScreen';
import WeeklyPlanScreen from './screens/WeeklyPlanScreen';
import WeeklyPlanPersonalizationScreen from './screens/WeeklyPlanPersonalizationScreen';
import NutritionProfileScreen from './screens/NutritionProfileScreen';
import RecipeDetailScreen from './screens/RecipeDetailScreen';
import MyListScreen from './screens/MyListScreen';
import CouponClippingScreen from './screens/CouponClippingScreen';
import CheckoutBreakdownScreen from './screens/CheckoutBreakdownScreen';
import ReceiptVerifiedScreen from './screens/ReceiptVerifiedScreen';
import SnippdProScreen from './screens/SnippdProScreen';
import TermsOfUseScreen from './screens/TermsOfUseScreen';
import SnippdDeepBriefScreen from './screens/SnippdDeepBriefScreen';
import BarcodeScannerScreen from './screens/BarcodeScannerScreen';
import QuickDealsScreen from './screens/QuickDealsScreen';
import MealDetailScreen from './screens/MealDetailScreen';
import ShoppingListScreen from './screens/ShoppingListScreen';
import OutcomeScreen from './screens/OutcomeScreen';
import SavingsActionScreen from './screens/SavingsActionScreen';
import NextWeekBuilderScreen from './screens/NextWeekBuilderScreen';
import SoftPersonalizationScreen from './screens/SoftPersonalizationScreen';
import UnlockBetaScreen from './screens/UnlockBetaScreen';
import DeepPersonalizationScreen from './screens/DeepPersonalizationScreen';
import PersonaRevealScreen from './screens/PersonaRevealScreen';
import PersonalityResultScreen from './screens/PersonalityResultScreen';

// ── NEXT-BEST-ACTION FLOW ────────────────────────────────────────────────────
import PlanGenerationLoadingScreen from './screens/PlanGenerationLoadingScreen';
import SmartStartScreen from './screens/SmartStartScreen';
import TodayDecisionScreen from './screens/TodayDecisionScreen';
import CookAtHomeTriage from './screens/CookAtHomeTriage';
import RecipeCartManifest from './screens/RecipeCartManifest';
import UberEatsHandoffScreen from './screens/UberEatsHandoffScreen';
import WeeklyPlanStarterScreen from './screens/WeeklyPlanStarterScreen';
import AddNeedsScreen from './screens/AddNeedsScreen';
import UsualStaplesScreen from './screens/UsualStaplesScreen';
import SmartStarterCartScreen from './screens/SmartStarterCartScreen';
import PlanReviewScreen from './screens/PlanReviewScreen';
import StackPersonalizationScreen from './screens/StackPersonalizationScreen';
import CartBuilderScreen from './screens/CartBuilderScreen';
import ReceiptPromptScreen from './screens/ReceiptPromptScreen';
import { getNextBestAction } from './src/services/nextBestActionService';
// ── WEEKLY DINNER PLAN FLOW ──────────────────────────────────────────────────
import WeeklyDinnerPlanScreen from './screens/WeeklyDinnerPlanScreen';
import ExpandedDayPlanScreen from './screens/ExpandedDayPlanScreen';
import StoreItemBreakdownScreen from './screens/StoreItemBreakdownScreen';
// ── COMPETITOR-INFORMED FEATURE SET ─────────────────────────────────────────
import PantryScanScreen from './screens/PantryScanScreen';
import PantryReviewScreen from './screens/PantryReviewScreen';
import ContextualCookingScreen from './screens/ContextualCookingScreen';
import StoreExportScreen from './screens/StoreExportScreen';
import RecipeVaultScreen from './screens/RecipeVaultScreen';
import SavedRecipesScreen from './screens/SavedRecipesScreen';
import TodayRecommendationScreen from './screens/TodayRecommendationScreen';
import DemoAdminScreen from './screens/DemoAdminScreen';
// ── PAYWALL FLOW ─────────────────────────────────────────────────────────────
import PersonalizationSummaryScreen from './screens/PersonalizationSummaryScreen';
import FirstShopPaywallScreen from './screens/FirstShopPaywallScreen';
import PaymentSuccessRedirectScreen from './screens/PaymentSuccessRedirectScreen';
import PremiumBetaPaywallScreen from './screens/PremiumBetaPaywallScreen';
// ── TODAY DECISION FLOW ──────────────────────────────────────────────────────
import TodaySetupGateScreen from './screens/TodaySetupGateScreen';
import TodayOptionsRankedScreen from './screens/TodayOptionsRankedScreen';
import ChefStashRecipeScreen from './screens/ChefStashRecipeScreen';
import PantryInventoryScreen from './screens/PantryInventoryScreen';
import PantryCookOptionsScreen from './screens/PantryCookOptionsScreen';
import StorePickupHandoffScreen from './screens/StorePickupHandoffScreen';
import StoreCartHandoffScreen from './screens/StoreCartHandoffScreen';
import EatOutSmartScreen from './screens/EatOutSmartScreen';
import UberEatsPickupHandoffScreen from './screens/UberEatsPickupHandoffScreen';
import UberEatsDeliveryScreen from './screens/UberEatsDeliveryScreen';
import QuickGroceryRunScreen from './screens/QuickGroceryRunScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// ── PER-TAB STACK NAVIGATORS ─────────────────────────────────────────────────
const HomeStackNav    = createNativeStackNavigator();
const PlanStackNav    = createNativeStackNavigator();
const PantryStackNav  = createNativeStackNavigator();
const StoresStackNav  = createNativeStackNavigator();
const ProfileStackNav = createNativeStackNavigator();
// Legacy stacks kept for cross-stack navigation — not mounted as tabs
const DiscoverStackNav = createNativeStackNavigator();
const CartStackNav     = createNativeStackNavigator();
const StudioStack      = createStudioStack(createNativeStackNavigator);

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
      {renderChefStashScreen(HomeStackNav)}
      <HomeStackNav.Screen name="Kitchen"            component={KitchenScreen} />
      <HomeStackNav.Screen name="Pantry"             component={PantryScreen} />
      <HomeStackNav.Screen name="List"               component={ListScreen} />
      <HomeStackNav.Screen name="ShoppingPlan"       component={ShoppingPlanScreen} />
      <HomeStackNav.Screen name="TripResults"        component={TripResultsScreen} />
      <HomeStackNav.Screen name="ReceiptUpload"      component={ReceiptUploadScreen} />
      <HomeStackNav.Screen name="VerifyReceipt"      component={ReceiptVerifiedScreen} />
      <HomeStackNav.Screen name="Wins"               component={WinsScreen} />
      <HomeStackNav.Screen name="FamilySharing"       component={FamilySharingScreen} />
      <HomeStackNav.Screen name="BudgetPreferences"  component={BudgetPreferencesScreen} />
      <HomeStackNav.Screen name="BudgetDashboard"    component={BudgetDashboardScreen} />
      <HomeStackNav.Screen name="CategoryInsight"    component={CategoryInsightScreen} />
      <HomeStackNav.Screen name="BarcodeScanner"     component={BarcodeScannerScreen} />
      <HomeStackNav.Screen name="PrivacyPolicy"      component={PrivacyPolicyScreen} />
      <HomeStackNav.Screen name="QuickDeals"         component={QuickDealsScreen} />
      <HomeStackNav.Screen name="MealDetail"         component={MealDetailScreen} />
      <HomeStackNav.Screen name="ShoppingList"       component={ShoppingListScreen} />
      <HomeStackNav.Screen name="Outcome"            component={OutcomeScreen} />
      <HomeStackNav.Screen name="SavingsAction"      component={SavingsActionScreen} />
      <HomeStackNav.Screen name="NextWeekBuilder"    component={NextWeekBuilderScreen} />
    </HomeStackNav.Navigator>
  );
}

// ── DISCOVER STACK ───────────────────────────────────────────────────────────
function DiscoverStack() {
  return (
    <DiscoverStackNav.Navigator screenOptions={{ headerShown: false }}>
      <DiscoverStackNav.Screen name="Discover"    component={DiscoverScreen} />
      <DiscoverStackNav.Screen name="StackDetail" component={StackDetailScreen} />
      <DiscoverStackNav.Screen name="ShoppingList" component={ShoppingListScreen} />
      <DiscoverStackNav.Screen name="Cart"        component={CartScreen} options={{ presentation: 'modal' }} />
      {renderChefStashScreen(DiscoverStackNav)}
      {renderOmniStoreComparisonScreen(DiscoverStackNav)}
    </DiscoverStackNav.Navigator>
  );
}

// ── PLAN STACK ───────────────────────────────────────────────────────────────
function PlanStack() {
  return (
    <PlanStackNav.Navigator screenOptions={{ headerShown: false }}>
      <PlanStackNav.Screen name="WeeklyPlanPersonalization" component={WeeklyPlanPersonalizationScreen} />
      <PlanStackNav.Screen name="WeeklyPlan"                component={WeeklyPlanScreen} />
      <PlanStackNav.Screen name="MealDetail"                component={MealDetailScreen} />
      <PlanStackNav.Screen name="ShoppingList"              component={ShoppingListScreen} />
      <PlanStackNav.Screen name="NutritionProfile"          component={NutritionProfileScreen} />
      <PlanStackNav.Screen name="RecipeDetail"              component={RecipeDetailScreen} />
      <PlanStackNav.Screen name="QuickDeals"                component={QuickDealsScreen} />
      <PlanStackNav.Screen name="SavingsAction"             component={SavingsActionScreen} />
      <PlanStackNav.Screen name="NextWeekBuilder"           component={NextWeekBuilderScreen} />
    </PlanStackNav.Navigator>
  );
}

// ── PANTRY STACK ─────────────────────────────────────────────────────────────
function PantryStack() {
  return (
    <PantryStackNav.Navigator screenOptions={{ headerShown: false }}>
      <PantryStackNav.Screen name="PantryMain"      component={PantryScreen} />
      <PantryStackNav.Screen name="PantryInventory" component={PantryInventoryScreen} />
      <PantryStackNav.Screen name="PantryScan"      component={PantryScanScreen} />
      <PantryStackNav.Screen name="PantryReview"    component={PantryReviewScreen} />
      <PantryStackNav.Screen name="PantryCookOptions" component={PantryCookOptionsScreen} />
      <PantryStackNav.Screen name="ReceiptUpload"   component={ReceiptUploadScreen} />
      <PantryStackNav.Screen name="BarcodeScanner"  component={BarcodeScannerScreen} />
    </PantryStackNav.Navigator>
  );
}

// ── STORES STACK ─────────────────────────────────────────────────────────────
function StoresStack() {
  return (
    <StoresStackNav.Navigator screenOptions={{ headerShown: false }}>
      <StoresStackNav.Screen name="StoresMain"       component={PreferredStoresScreen} />
      <StoresStackNav.Screen name="StoreExport"      component={StoreExportScreen} />
      <StoresStackNav.Screen name="StorePickupHandoff" component={StorePickupHandoffScreen} />
      <StoresStackNav.Screen name="StoreCartHandoff"   component={StoreCartHandoffScreen} />
      <StoresStackNav.Screen name="StoreItemBreakdown" component={StoreItemBreakdownScreen} />
    </StoresStackNav.Navigator>
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
      <CartStackNav.Screen name="MyList"            component={MyListScreen} />
      <CartStackNav.Screen name="CouponClipping"    component={CouponClippingScreen} />
      <CartStackNav.Screen name="CheckoutBreakdown" component={CheckoutBreakdownScreen} />
      <CartStackNav.Screen name="VerifyReceipt"     component={ReceiptVerifiedScreen} />
      <CartStackNav.Screen name="CartOptions"       component={CartOptionsScreen} />
      <CartStackNav.Screen name="CartOptionDetail"  component={CartOptionDetailScreen} />
      <CartStackNav.Screen name="WealthMomentum"    component={WealthMomentumScreen} />
      <CartStackNav.Screen name="Outcome"           component={OutcomeScreen} />
      <CartStackNav.Screen name="SavingsAction"     component={SavingsActionScreen} />
      <CartStackNav.Screen name="NextWeekBuilder"   component={NextWeekBuilderScreen} />
    </CartStackNav.Navigator>
  );
}

// ── STUDIO STACK ─────────────────────────────────────────────────────────────
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
      <ProfileStackNav.Screen name="VerifyReceipt"     component={ReceiptVerifiedScreen} />
      <ProfileStackNav.Screen name="MFASetup"          component={MFASetupScreen} />
      <ProfileStackNav.Screen name="WealthMomentum"   component={WealthMomentumScreen} />
      <ProfileStackNav.Screen name="AdminGraph"           component={AdminGraphScreen} />
      <ProfileStackNav.Screen name="PrivacyPolicy"        component={PrivacyPolicyScreen} />
      <ProfileStackNav.Screen name="TermsOfUse"           component={TermsOfUseScreen} />
      <ProfileStackNav.Screen name="SnippdPro"            component={SnippdProScreen} options={{ presentation: 'modal' }} />
      <ProfileStackNav.Screen name="AdminCircularUpload"  component={AdminCircularUploadScreen} />
      <ProfileStackNav.Screen name="AdminDealReview"      component={AdminDealReviewScreen} />
      <ProfileStackNav.Screen name="StackReviewTraining"  component={StackReviewTrainingScreen} />
      <ProfileStackNav.Screen name="NutritionProfile"     component={NutritionProfileScreen} />
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
  const tabs = filterEnabledItems([
    { name: 'HomeTab',    component: HomeStack,    label: 'Today',  iconName: 'sun' },
    { name: 'DiscoverTab', component: DiscoverStack, label: 'Discover', iconName: 'search' },
    { name: 'PlanTab',    component: PlanStack,    label: 'Plan',   iconName: 'calendar' },
    { name: 'PantryTab',  component: PantryStack,  label: 'Pantry', iconName: 'package' },
    { name: 'StoresTab',  component: StoresStack,  label: 'Stores', iconName: 'map-pin' },
    { name: 'ProfileTab', component: ProfileStack, label: 'You',    iconName: 'user' },
  ]);

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
      {tabs.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            tabBarIcon: ({ focused }) => (
              <TabIcon focused={focused} label={tab.label} iconName={tab.iconName} />
            ),
          }}
        />
      ))}
    </Tab.Navigator>
    </View>
  );
}

// ── USER STATUS GATE ─────────────────────────────────────────────────────────
// Evaluates user state via the Next-Best-Action router and returns the
// appropriate root-stack route name. Users are never dropped into a generic
// dashboard — they are always guided to their next meaningful action.
async function resolveUserStatus(userId) {
  try {
    // 1. Check onboarding + personalization summary status from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_complete, onboarding_completed, subscription_status, billing_plan')
      .eq('user_id', userId)
      .maybeSingle();

    const onboardingDone = !!(profile?.onboarding_complete || profile?.onboarding_completed);
    const subStatus      = profile?.subscription_status || 'none';
    const hasAccess      = ['active', 'trialing'].includes(subStatus);

    // New user who just finished onboarding → PersonalizationSummary before paywall
    if (!onboardingDone) {
      return 'Onboarding';
    }

    // Onboarding done but no subscription yet → show personalization summary
    // (they will tap "Begin My First Shop" which then triggers the paywall gate)
    if (!hasAccess && profile) {
      // Only redirect to PersonalizationSummary for genuinely new users;
      // returning unpaid users go straight to MainApp and see the paywall
      // when they attempt a premium action
      const { data: plan } = await supabase
        .from('profiles')
        .select('first_shop_started')
        .eq('user_id', userId)
        .maybeSingle();

      if (!plan?.first_shop_started) {
        return 'PersonalizationSummary';
      }
    }

    // 2. Check if the Snippd Deep Brief is still needed (one-time prompt)
    const { data: persona } = await supabase
      .from('user_persona')
      .select('status, briefing_completed')
      .eq('user_id', userId)
      .maybeSingle();

    const personaStatus     = persona?.status;
    const briefingCompleted = persona?.briefing_completed ?? false;

    if (personaStatus === 'launched' && !briefingCompleted) {
      return 'ConciergeOnboarding';
    }

    // 3. Run the Next-Best-Action router
    const { route } = await getNextBestAction(userId);
    return route;
  } catch (_) {
    return 'MainApp';
  }
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
    // Absolute safety net: if the whole startup hasn't finished in 6 seconds,
    // force-show the sign-in screen so the user never sees a blank page.
    const safetyTimer = setTimeout(() => {
      setInitialRoute('Auth');
      setLoading(false);
    }, 6000);

    // ── Self-Healing Startup Sequence ────────────────────────────────────────
    async function startup() {
      // Give the health checks a maximum of 4 seconds — if they hang (e.g. on
      // web where some native APIs are stubs), we proceed without them rather
      // than leaving the app blank forever.
      const healthPromise = Promise.race([
        HealthMonitor.runStartupChecks(),
        new Promise(resolve =>
          setTimeout(() => resolve({ forcedSignOut: false, sessionId: null }), 4000)
        ),
      ]);

      let session = null;
      try {
        const { data } = await supabase.auth.getSession();
        session = data?.session ?? null;
      } catch {
        // getSession failed — proceed to Auth
      }

      // Await health result (already resolved or timed out)
      const health = await healthPromise;

      // If health monitor cleared a broken session, go straight to Auth
      if (health.forcedSignOut) {
        setInitialRoute('Auth');
        setLoading(false);
        return;
      }

      if (session?.user) {
        tracker.setAccessToken(session.access_token);
        tracker.setDefaultUserId(session.user.id);
        tracker.setDefaultSessionId(session.access_token);
        tracker.trackAppOpened({ user_id: session.user.id, session_id: session.access_token });

        // Phase 4: log persona health check (no redirect — resolveUserStatus owns routing)
        await HealthMonitor.runAuthChecks(
          session.user.id,
          health.sessionId
        );

        const route = await resolveUserStatus(session.user.id);
        setInitialRoute(route);
      } else {
        // No session — always show sign-in screen first
        setInitialRoute('Auth');
      }
      setLoading(false);
    }

    startup()
      .catch(() => {
        setInitialRoute('Auth');
        setLoading(false);
      })
      .finally(() => clearTimeout(safetyTimer));

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          tracker.setAccessToken(session.access_token);
          tracker.setDefaultUserId(session.user.id);
          tracker.setDefaultSessionId(session.access_token);
          resolveUserStatus(session.user.id).then(route => {
            setInitialRoute(route);
            resetToScreen(route, route === 'Onboarding' ? { startStep: 1 } : undefined);
          });
        }
        if (event === 'SIGNED_OUT') {
          tracker.setAccessToken('');
          setInitialRoute('Auth');
          // Actually navigate — initialRouteName alone doesn't move the stack
          resetToScreen('Auth');
        }
      }
    );

    // Deep-link listener — catches the OAuth redirect when the app is already open.
    // WebBrowser.openAuthSessionAsync handles this on iOS automatically, but the
    // Android fallback (system browser) fires a Linking event instead.
    const handleDeepLink = ({ url }) => {
      if (url && url.includes('auth/callback')) {
        supabase.auth.exchangeCodeForSession(url).catch(() => {});
      }
    };
    const linkingSub = Linking.addEventListener('url', handleDeepLink);
    // Handle cold-start case (app was not open when the link fired)
    Linking.getInitialURL().then(url => {
      if (url && url.includes('auth/callback')) {
        supabase.auth.exchangeCodeForSession(url).catch(() => {});
      }
    }).catch(() => {});

    return () => {
      subscription.unsubscribe();
      linkingSub.remove();
    };
  }, []);

  useEffect(() => {
    if (!loading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError, loading]);

  if (loading) {
    // On web: show a visible loading state so we know React IS mounting
    if (Platform.OS === 'web') {
      return (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F0FBF0' }}>
          <Text style={{ color: '#1A237E', fontSize: 16 }}>Loading Snippd…</Text>
        </View>
      );
    }
    return null;
  }

  // Resolve starting route — paused trial overrides everything
  const resolvedRoute = isPaused && initialRoute === 'MainApp'
    ? 'TrialGate'
    : initialRoute;

  return (
    <View style={{ flex: 1 }} {...sessionHandlers}>
      <Stack.Navigator
        id="root"
        initialRouteName={resolvedRoute}
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Auth"                       component={SignInScreen} />
        <Stack.Screen name="Onboarding"                 component={OnboardingScreen} />
        {/* ── Paywall flow ──────────────────────────────────────────────── */}
        <Stack.Screen name="PersonalizationSummary"     component={PersonalizationSummaryScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="FirstShopPaywall"           component={FirstShopPaywallScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="PaymentSuccessRedirect"     component={PaymentSuccessRedirectScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="PremiumBetaPaywall"         component={PremiumBetaPaywallScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="PersonalityResult"     component={PersonalityResultScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="SoftPersonalization"   component={SoftPersonalizationScreen} />
        <Stack.Screen name="UnlockBeta"            component={UnlockBetaScreen} />
        <Stack.Screen name="DeepPersonalization"   component={DeepPersonalizationScreen} />
        <Stack.Screen name="PersonaReveal"         component={PersonaRevealScreen} />
        <Stack.Screen name="ConciergeOnboarding"   component={SnippdDeepBriefScreen} />
        <Stack.Screen name="MainApp"              component={MainTabs} />
        {/* ── Next-Best-Action flow screens ─────────────────────────────── */}
        <Stack.Screen name="PlanGenerationLoading" component={PlanGenerationLoadingScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="SmartStart"            component={SmartStartScreen} options={{ gestureEnabled: false }} />
        <Stack.Screen name="TodayDecision"         component={TodayDecisionScreen} />
        <Stack.Screen name="CookAtHomeTriage"      component={CookAtHomeTriage} />
        <Stack.Screen name="RecipeCartManifest"    component={RecipeCartManifest} />
        <Stack.Screen name="UberEatsHandoff"       component={UberEatsHandoffScreen} />
        <Stack.Screen name="WeeklyPlanStarter"     component={WeeklyPlanStarterScreen} />
        <Stack.Screen name="AddNeeds"              component={AddNeedsScreen} />
        <Stack.Screen name="UsualStaples"          component={UsualStaplesScreen} />
        <Stack.Screen name="SmartStarterCart"      component={SmartStarterCartScreen} />
        <Stack.Screen name="PlanReview"            component={PlanReviewScreen} />
        <Stack.Screen name="StackPersonalization"  component={StackPersonalizationScreen} />
        <Stack.Screen name="CartBuilder"           component={CartBuilderScreen} />
        <Stack.Screen name="ReceiptPrompt"         component={ReceiptPromptScreen} />
        {/* ── Weekly Dinner Plan flow screens ───────────────────────────── */}
        <Stack.Screen name="WeeklyDinnerPlan"      component={WeeklyDinnerPlanScreen} />
        <Stack.Screen name="ExpandedDayPlan"       component={ExpandedDayPlanScreen} />
        <Stack.Screen name="StoreItemBreakdown"    component={StoreItemBreakdownScreen} />
        {/* ── Competitor-informed feature set ───────────────────────────── */}
        <Stack.Screen name="PantryScan"            component={PantryScanScreen} />
        <Stack.Screen name="PantryReview"          component={PantryReviewScreen} />
        <Stack.Screen name="ContextualCooking"     component={ContextualCookingScreen} />
        <Stack.Screen name="StoreExport"           component={StoreExportScreen} />
        <Stack.Screen name="RecipeVault"           component={RecipeVaultScreen} />
        <Stack.Screen name="SavedRecipes"          component={SavedRecipesScreen} />
        <Stack.Screen name="TodayRecommendation"   component={TodayRecommendationScreen} />
        <Stack.Screen name="DemoAdmin"             component={DemoAdminScreen} />
        {/* ── Today Decision Flow ───────────────────────────────────────── */}
        <Stack.Screen name="TodaySetupGate"        component={TodaySetupGateScreen} />
        <Stack.Screen name="TodayOptionsRanked"    component={TodayOptionsRankedScreen} />
        <Stack.Screen name="ChefStashRecipe"       component={ChefStashRecipeScreen} />
        <Stack.Screen name="PantryInventory"       component={PantryInventoryScreen} />
        <Stack.Screen name="PantryCookOptions"     component={PantryCookOptionsScreen} />
        <Stack.Screen name="StorePickupHandoff"    component={StorePickupHandoffScreen} />
        <Stack.Screen name="StoreCartHandoff"      component={StoreCartHandoffScreen} />
        <Stack.Screen name="EatOutSmart"           component={EatOutSmartScreen} />
        <Stack.Screen name="UberEatsPickupHandoff" component={UberEatsPickupHandoffScreen} />
        <Stack.Screen name="UberEatsDelivery"      component={UberEatsDeliveryScreen} />
        <Stack.Screen name="QuickGroceryRun"       component={QuickGroceryRunScreen} />
        <Stack.Screen name="TrialGate"       component={TrialGateScreen} />
        <Stack.Screen name="TestAgent"       component={AppTestAgent} />
        <Stack.Screen name="MFAVerify"       component={MFAVerifyScreen} />
        <Stack.Screen name="MFASetup"        component={MFASetupScreen} />
        <Stack.Screen name="PrivacyPolicy"   component={PrivacyPolicyScreen} />
        <Stack.Screen name="NutritionProfile" component={NutritionProfileScreen} />
        <Stack.Screen name="SnippdPro"       component={SnippdProScreen} options={{ presentation: 'modal' }} />
        <Stack.Screen name="TermsOfUse"      component={TermsOfUseScreen} />
      </Stack.Navigator>
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <NavigationContainer ref={navigationRef}>
            <BudgetProvider>
              <TrialProvider>
                <RootNavigator />
              </TrialProvider>
            </BudgetProvider>
          </NavigationContainer>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </AppErrorBoundary>
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
    height: Platform.OS === 'ios' ? 98 : 88,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
  },
  // The visible pill — no position:absolute, lives inside the shell
  tabBar: {
    width: '92%',
    height: 64,
    borderRadius: 26,
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
    width: 34, height: 26,
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
    marginBottom: 30, // Pushes the center button up
    zIndex: 100 
  },
  fabBorder: {
    width: 62,
    height: 62,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  fab: {
    width: 52, height: 52,
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
