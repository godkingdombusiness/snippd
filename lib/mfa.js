import { supabase } from './supabase';
import { AuditLogger } from './auditLogger';

// ── MFA helpers (TOTP via Supabase Auth) ─────────────────────────────────────
//
// Supabase MFA flow:
//   Enroll:  enroll()  → user scans QR in Authenticator → confirmEnrollment()
//   Login:   After signInWithPassword, call isChallengeRequired().
//            If true → getFactors() to get factorId → challengeAndVerify()

export const MFA = {
  // Step 1 of enrollment: creates a new TOTP factor.
  // Returns { factorId, qrCodeUri, secret } — show qrCodeUri as a QR or
  // have the user enter the secret manually into their authenticator app.
  enroll: async () => {
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error) throw error;
    return {
      factorId:  data.id,
      qrCodeUri: data.totp.uri,      // otpauth:// URI — encode as QR
      secret:    data.totp.secret,   // Manual entry fallback
      qrCode:    data.totp.qr_code,  // SVG string (render in WebView if needed)
    };
  },

  // Step 2 of enrollment: verify the 6-digit code to confirm the factor is live.
  confirmEnrollment: async (factorId, code) => {
    const { data, error } = await supabase.auth.mfa.challengeAndVerify({
      factorId,
      code: code.replace(/\s/g, ''),
    });
    if (error) throw error;
    await AuditLogger.log(AuditLogger.events.MFA_ENROLLED, { factorId });
    return data;
  },

  // Post-login: verify a TOTP code to elevate from AAL1 → AAL2.
  challengeAndVerify: async (factorId, code) => {
    const { data: challengeData, error: challengeError } =
      await supabase.auth.mfa.challenge({ factorId });
    if (challengeError) throw challengeError;

    const { data, error } = await supabase.auth.mfa.verify({
      factorId,
      challengeId: challengeData.id,
      code: code.replace(/\s/g, ''),
    });
    if (error) throw error;
    return data;
  },

  // Returns true if the current session has a TOTP factor that has NOT yet
  // been used this session (AAL1 session that can be elevated to AAL2).
  isChallengeRequired: async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return false;
    return data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
  },

  // Returns all enrolled TOTP factors for the current user.
  getFactors: async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    return data.totp ?? [];
  },

  // Removes an enrolled factor (call from Settings / Profile).
  unenroll: async (factorId) => {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) throw error;
    await AuditLogger.log(AuditLogger.events.MFA_DISABLED, { factorId });
  },
};
