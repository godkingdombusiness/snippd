/**
 * biometricGate.ts
 * Biometric authentication gate for sensitive user actions.
 * Fail-open: returns true if no hardware or no enrolled credentials.
 */

import * as LocalAuthentication from 'expo-local-authentication';

export type BiometricContext = 'execute' | 'profile_edit' | 'budget_pivot';

const PROMPT_MESSAGES: Record<BiometricContext, string> = {
  execute: 'Confirm your identity to lock in this shopping strategy.',
  profile_edit: 'Confirm your identity to update your profile.',
  budget_pivot: 'Confirm your identity to recalibrate your budget.',
};

/**
 * Prompts the user for biometric authentication.
 * Returns true (allow) if:
 *   - Device has no biometric hardware
 *   - No biometrics enrolled
 *   - Authentication succeeds
 * Returns false (deny) only if authentication explicitly fails or is cancelled.
 */
export async function biometricGate(context: BiometricContext): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return true; // fail-open: no hardware

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return true; // fail-open: no credentials enrolled

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: PROMPT_MESSAGES[context],
      fallbackLabel: 'Use Passcode',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    return result.success;
  } catch {
    // fail-open on unexpected errors (e.g., platform API unavailable)
    return true;
  }
}
