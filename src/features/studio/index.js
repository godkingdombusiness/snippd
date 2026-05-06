import React from 'react';

import StudioScreen from '../../../screens/StudioScreen';
import ReceiptUploadScreen from '../../../screens/ReceiptUploadScreen';
import { FEATURE_IDS } from '../registry';

export function createStudioStack(createNativeStackNavigator) {
  const StudioStackNav = createNativeStackNavigator();

  return function StudioStack() {
    return (
      <StudioStackNav.Navigator screenOptions={{ headerShown: false }}>
        <StudioStackNav.Screen name="Studio" component={StudioScreen} />
        <StudioStackNav.Screen name="ReceiptUpload" component={ReceiptUploadScreen} />
      </StudioStackNav.Navigator>
    );
  };
}

export function studioTab(component) {
  return {
    name: 'StudioTab',
    component,
    label: 'Studio',
    iconName: 'video',
    featureId: FEATURE_IDS.STUDIO,
  };
}
