import { useEffect, useRef, useCallback } from 'react';
import { AppState, PanResponder } from 'react-native';
import { supabase } from './supabase';
import { AuditLogger } from './auditLogger';

// ── 30-minute inactivity kill switch ─────────────────────────────────────────
// Tracks the last time the user touched the screen. When the app returns to
// foreground after a background period, if > 30 min have elapsed since the
// last touch, the session is forcefully signed out (JWT invalidated).
//
// Usage in App.js:
//   const handlers = useSessionGuard();
//   <View style={{ flex: 1 }} {...handlers}>...</View>

const INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes

export function useSessionGuard() {
  const lastActivityRef = useRef(Date.now());
  const appStateRef = useRef(AppState.currentState);

  // Called whenever the app returns to foreground
  const checkAndKill = useCallback(async () => {
    const elapsed = Date.now() - lastActivityRef.current;
    if (elapsed >= INACTIVITY_LIMIT_MS) {
      await AuditLogger.log(AuditLogger.events.SESSION_TIMEOUT, {
        elapsed_ms: elapsed,
        table: 'app_event',
      });
      await supabase.auth.signOut({ scope: 'global' });
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      const prev = appStateRef.current;
      appStateRef.current = nextState;

      // App returned from background/inactive → check elapsed time
      if (prev.match(/inactive|background/) && nextState === 'active') {
        checkAndKill();
      }
    });
    return () => sub.remove();
  }, [checkAndKill]);

  // PanResponder observes every touch without capturing it — resets the timer.
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => {
        lastActivityRef.current = Date.now();
        return false; // pass-through — never consume the touch
      },
    })
  ).current;

  return panResponder.panHandlers;
}
