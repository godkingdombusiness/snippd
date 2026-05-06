const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

export const FEATURE_IDS = {
  CHEF_STASH: 'chefStash',
  OMNI_STORE_COMPARISON: 'omniStoreComparison',
  STUDIO: 'studio',
};

export const FEATURE_REGISTRY = {
  [FEATURE_IDS.STUDIO]: {
    id: FEATURE_IDS.STUDIO,
    label: 'Studio',
    defaultEnabled: true,
    envKey: 'EXPO_PUBLIC_FEATURE_STUDIO',
    fallbackRoute: 'HomeTab',
  },
  [FEATURE_IDS.CHEF_STASH]: {
    id: FEATURE_IDS.CHEF_STASH,
    label: 'Chef Stash',
    defaultEnabled: true,
    envKey: 'EXPO_PUBLIC_FEATURE_CHEF_STASH',
    fallbackRoute: 'PlanTab',
  },
  [FEATURE_IDS.OMNI_STORE_COMPARISON]: {
    id: FEATURE_IDS.OMNI_STORE_COMPARISON,
    label: 'Omni Store Comparison',
    defaultEnabled: false,
    envKey: 'EXPO_PUBLIC_FEATURE_OMNI_STORE_COMPARISON',
    fallbackRoute: 'DiscoverTab',
  },
};

export const ROUTE_FEATURES = {
  ChefStash: FEATURE_IDS.CHEF_STASH,
  Studio: FEATURE_IDS.STUDIO,
  StudioTab: FEATURE_IDS.STUDIO,
  OmniStoreComparison: FEATURE_IDS.OMNI_STORE_COMPARISON,
};

function readFlagValue(envKey) {
  const raw = process.env?.[envKey];
  if (raw == null || raw === '') return null;

  const normalized = String(raw).trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return null;
}

export function isFeatureEnabled(featureId) {
  const feature = FEATURE_REGISTRY[featureId];
  if (!feature) return false;

  const envValue = readFlagValue(feature.envKey);
  return envValue ?? feature.defaultEnabled;
}

export function isRouteEnabled(routeName) {
  const featureId = ROUTE_FEATURES[routeName];
  return featureId ? isFeatureEnabled(featureId) : true;
}

export function filterEnabledItems(items) {
  return items.filter(item => {
    const featureId = item.featureId || ROUTE_FEATURES[item.screen] || ROUTE_FEATURES[item.name];
    return featureId ? isFeatureEnabled(featureId) : true;
  });
}

export function featureFallbackRoute(featureId) {
  return FEATURE_REGISTRY[featureId]?.fallbackRoute || 'HomeTab';
}

export function featureSnapshot() {
  return Object.values(FEATURE_REGISTRY).map(feature => ({
    id: feature.id,
    label: feature.label,
    enabled: isFeatureEnabled(feature.id),
    envKey: feature.envKey,
  }));
}
