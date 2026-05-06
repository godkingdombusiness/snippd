import React from 'react';

import ChefStashScreen from '../../../screens/ChefStashScreen';
import { FEATURE_IDS, isFeatureEnabled } from '../registry';

export function renderChefStashScreen(StackNavigator) {
  if (!isFeatureEnabled(FEATURE_IDS.CHEF_STASH)) return null;
  return <StackNavigator.Screen name="ChefStash" component={ChefStashScreen} />;
}

export const chefStashFeature = {
  id: FEATURE_IDS.CHEF_STASH,
  routeName: 'ChefStash',
};
