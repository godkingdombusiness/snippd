import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

// Shared navigation ref — attached to NavigationContainer in App.js.
// Import this anywhere you need to navigate outside of React components
// (auth state listeners, edge cases in deeply nested screens, etc.)
export const navigationRef = createNavigationContainerRef();

// Convenience: reset to a named root-level screen from anywhere.
export function resetToScreen(name) {
  if (navigationRef.isReady()) {
    navigationRef.dispatch(
      CommonActions.reset({ index: 0, routes: [{ name }] })
    );
  }
}
