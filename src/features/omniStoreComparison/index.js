import { FEATURE_IDS, isFeatureEnabled } from '../registry';
import OmniStoreComparisonScreen from '../../../screens/OmniStoreComparisonScreen';

export function renderOmniStoreComparisonScreen(StackNavigator) {
  if (!isFeatureEnabled(FEATURE_IDS.OMNI_STORE_COMPARISON)) return null;
  return <StackNavigator.Screen name="OmniStoreComparison" component={OmniStoreComparisonScreen} />;
}

export const omniStoreComparisonFeature = {
  id: FEATURE_IDS.OMNI_STORE_COMPARISON,
  routeName: 'OmniStoreComparison',
  resultContract: {
    comparison_id: 'uuid',
    status: 'APPROVED | LOW_YIELD_WEEK | DATA_STALE',
    winner: 'retailer_node',
    stores: [
      {
        retailer: 'Publix',
        oop: 42.11,
        savings_percentage: 61.2,
      },
    ],
  },
};
