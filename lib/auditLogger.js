import { supabase } from './supabase';

// ── App-level audit event logger ──────────────────────────────────────────────
// Logs user-initiated events from the JS layer to system_audit_logs.
// Postgres-level DML changes are captured separately by database triggers
// (see sql/02_audit_triggers.sql).
//
// Never throws — audit logging must never crash the app.

const EVENT_TYPES = {
  FRESH_START:     'fresh_start',
  BUDGET_UPDATE:   'budget_update',
  RECEIPT_UPLOAD:  'receipt_upload',
  PROFILE_UPDATE:  'profile_update',
  CART_CHECKOUT:   'cart_checkout',
  MFA_ENROLLED:    'mfa_enrolled',
  MFA_DISABLED:    'mfa_disabled',
  SESSION_TIMEOUT: 'session_timeout',
  LOGIN:           'login',
  LOGOUT:          'logout',
};

export const AuditLogger = {
  events: EVENT_TYPES,

  /**
   * @param {string} eventType  One of AuditLogger.events.*
   * @param {object} metadata   Arbitrary JSON — stored in new_data column
   */
  log: async (eventType, metadata = {}) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase.from('system_audit_logs').insert({
        user_id:    user.id,
        event_type: eventType,
        table_name: metadata.table || 'app_event',
        row_id:     metadata.rowId  || null,
        new_data:   { ...metadata, timestamp: new Date().toISOString() },
      });
    } catch (_) {
      // Silent — audit failures must never surface to users
    }
  },
};
