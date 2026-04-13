/**
 * SecurityMonitor.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Client-side and server-side security event emitter for the Snippd app.
 *
 * Usage:
 *   import { SecurityMonitor } from '../lib/security/SecurityMonitor';
 *   await SecurityMonitor.event({ event_type: 'BRUTE_FORCE_IN_PROGRESS', ... });
 *
 * The ingest endpoint is protected by SECURITY_INGEST_SECRET.
 * Never call this directly from untrusted user code.
 */

import { supabase } from '../supabase';

const INGEST_URL = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/security-ingest`;
const INGEST_SECRET = process.env.EXPO_PUBLIC_SECURITY_INGEST_PUBLIC_TOKEN; // read-only public token for client

// ── Event taxonomy constants ──────────────────────────────────────────────────
export const EVENT_TYPES = {
  // Authentication
  LOGIN_FAILED:               'LOGIN_FAILED',
  LOGIN_SUCCESS_AFTER_FAILS:  'LOGIN_SUCCESS_AFTER_FAILS',   // HIGH
  BRUTE_FORCE_IN_PROGRESS:    'BRUTE_FORCE_IN_PROGRESS',     // MEDIUM → HIGH
  BRUTE_FORCE_SUCCESS:        'BRUTE_FORCE_SUCCESS',          // HIGH
  NEW_DEVICE_LOGIN:           'NEW_DEVICE_LOGIN',             // MEDIUM
  GEO_ANOMALY:                'GEO_ANOMALY',                  // MEDIUM
  MFA_DISABLE_ATTEMPT:        'MFA_DISABLE_ATTEMPT',          // MEDIUM
  MFA_DISABLE_ADMIN:          'MFA_DISABLE_ADMIN',            // CRITICAL
  PASSWORD_RESET_REPEATED:    'PASSWORD_RESET_REPEATED',      // MEDIUM
  SESSION_HIJACK_INDICATOR:   'SESSION_HIJACK_INDICATOR',     // HIGH

  // Access control
  IDOR_ATTEMPT:               'IDOR_ATTEMPT',                 // MEDIUM
  IDOR_CONFIRMED:             'IDOR_CONFIRMED',               // HIGH
  UNAUTHORIZED_ADMIN_ACCESS:  'UNAUTHORIZED_ADMIN_ACCESS',    // HIGH
  PRIVILEGE_ESCALATION_ATTEMPT: 'PRIVILEGE_ESCALATION_ATTEMPT', // HIGH
  PRIVILEGE_ESCALATION_CONFIRMED: 'PRIVILEGE_ESCALATION_CONFIRMED', // CRITICAL
  ROLE_CHANGE:                'ROLE_CHANGE',                  // MEDIUM
  BROKEN_ACCESS_CONTROL:      'BROKEN_ACCESS_CONTROL',        // HIGH
  MASS_ASSIGNMENT_ATTEMPT:    'MASS_ASSIGNMENT_ATTEMPT',      // HIGH

  // Injection
  SQL_INJECTION_ATTEMPT:      'SQL_INJECTION_ATTEMPT',        // HIGH
  INJECTION_PAYLOAD_SIGNATURE:'INJECTION_PAYLOAD_SIGNATURE',  // MEDIUM
  XSS_PAYLOAD_DETECTED:       'XSS_PAYLOAD_DETECTED',        // MEDIUM
  SSRF_ATTEMPT:               'SSRF_ATTEMPT',                 // HIGH
  COMMAND_INJECTION_ATTEMPT:  'COMMAND_INJECTION_ATTEMPT',    // HIGH
  PATH_TRAVERSAL_ATTEMPT:     'PATH_TRAVERSAL_ATTEMPT',       // HIGH

  // Exfiltration
  SENSITIVE_EXPORT_EXCESSIVE: 'SENSITIVE_EXPORT_EXCESSIVE',   // HIGH
  SECRET_EXFILTRATION_ATTEMPT:'SECRET_EXFILTRATION_ATTEMPT',  // CRITICAL
  SECRET_IN_REQUEST_BODY:     'SECRET_IN_REQUEST_BODY',       // HIGH
  SUSPICIOUS_ENV_FILE_ACCESS: 'SUSPICIOUS_ENV_FILE_ACCESS',   // HIGH
  SERVICE_ROLE_KEY_EXPOSED:   'SERVICE_ROLE_KEY_EXPOSED',     // CRITICAL

  // Abuse
  RATE_LIMIT_EVASION:         'RATE_LIMIT_EVASION',           // MEDIUM
  API_ABUSE:                  'API_ABUSE',                    // MEDIUM
  API_KEY_MASS_FAILURE:       'API_KEY_MASS_FAILURE',         // HIGH
  COUPON_ABUSE_PATTERN:       'COUPON_ABUSE_PATTERN',         // HIGH
  REFERRAL_FRAUD_ATTEMPT:     'REFERRAL_FRAUD_ATTEMPT',       // HIGH
  WEBHOOK_ABUSE:              'WEBHOOK_ABUSE',                // HIGH
  SUSPICIOUS_FILE_UPLOAD:     'SUSPICIOUS_FILE_UPLOAD',       // MEDIUM
  LARGE_REQUEST_BODY:         'LARGE_REQUEST_BODY',           // MEDIUM
  HIGH_RISK_USER_AGENT:       'HIGH_RISK_USER_AGENT',         // MEDIUM
  SCRAPING_INDICATOR:         'SCRAPING_INDICATOR',           // MEDIUM
  BOT_ACTIVITY_INDICATOR:     'BOT_ACTIVITY_INDICATOR',       // MEDIUM

  // Developer tool / AI workflow threats
  REPO_TRUST_BYPASS_ATTEMPT:  'REPO_TRUST_BYPASS_ATTEMPT',   // HIGH
  REPO_TRUST_BYPASS_CONFIRMED:'REPO_TRUST_BYPASS_CONFIRMED', // CRITICAL
  UNTRUSTED_REPO_CONFIG_OUTBOUND: 'UNTRUSTED_REPO_CONFIG_OUTBOUND', // HIGH
  COMMAND_EXECUTION_UNTRUSTED:'COMMAND_EXECUTION_UNTRUSTED',  // CRITICAL
  SHELL_EXECUTION_UNTRUSTED:  'SHELL_EXECUTION_UNTRUSTED',   // CRITICAL
  SUSPICIOUS_PLUGIN_EXECUTION:'SUSPICIOUS_PLUGIN_EXECUTION',  // HIGH
  MODEL_ENDPOINT_OVERRIDE:    'MODEL_ENDPOINT_OVERRIDE',      // HIGH
  BASE_URL_OVERRIDE_ATTEMPT:  'BASE_URL_OVERRIDE_ATTEMPT',    // HIGH
  UNAPPROVED_DOMAIN_CALL:     'UNAPPROVED_DOMAIN_CALL',       // HIGH
  OUTBOUND_ATTACKER_ENDPOINT: 'OUTBOUND_ATTACKER_ENDPOINT',   // CRITICAL
  PROMPT_INJECTION_ATTEMPT:   'PROMPT_INJECTION_ATTEMPT',     // MEDIUM
  SUSPICIOUS_INIT_SCRIPT:     'SUSPICIOUS_INIT_SCRIPT',       // HIGH
  SUSPICIOUS_PACKAGE_RELEASE: 'SUSPICIOUS_PACKAGE_RELEASE',  // HIGH

  // Admin / monitoring
  ADMIN_ACCOUNT_TAKEOVER:     'ADMIN_ACCOUNT_TAKEOVER',       // CRITICAL
  MONITORING_TAMPERING:       'MONITORING_TAMPERING',         // CRITICAL
  SENSITIVE_RECORD_DELETE:    'SENSITIVE_RECORD_DELETE',       // MEDIUM
  UNUSUAL_API_SPIKE:          'UNUSUAL_API_SPIKE',            // MEDIUM
  SUSPICIOUS_SETTINGS_CHANGE: 'SUSPICIOUS_SETTINGS_CHANGE',   // MEDIUM
  SUSPICIOUS_ADMIN_ROUTE:     'SUSPICIOUS_ADMIN_ROUTE',       // MEDIUM

  // System
  ESCALATED_VOLUME_PATTERN:   'ESCALATED_VOLUME_PATTERN',     // HIGH (auto)
};

// ── Category constants ────────────────────────────────────────────────────────
export const CATEGORIES = {
  AUTH:            'AUTH',
  ACCESS_CONTROL:  'ACCESS_CONTROL',
  INJECTION:       'INJECTION',
  EXFILTRATION:    'EXFILTRATION',
  DEVELOPER_TOOL:  'DEVELOPER_TOOL',
  REPO_TRUST:      'REPO_TRUST',
  ABUSE:           'ABUSE',
  MONITORING:      'MONITORING',
  SYSTEM:          'SYSTEM',
};

// ── Failed login tracker (in-memory, per session) ─────────────────────────────
const _loginFailures = new Map(); // ip+route → { count, firstAt }

// ── Main event emitter ────────────────────────────────────────────────────────
class _SecurityMonitor {
  /**
   * Emit a security event to the ingest pipeline.
   * All parameters optional except event_type, category, source_system, summary.
   */
  async event(payload) {
    try {
      // Get current session for user context
      let userId = payload.user_id;
      let sessionId = payload.session_id;

      if (!userId) {
        const { data: { session } } = await supabase.auth.getSession().catch(() => ({ data: {} }));
        userId    = session?.user?.id;
        sessionId = session?.access_token?.slice(-12); // last 12 chars as session hint
      }

      const body = {
        ...payload,
        user_id:    userId    ?? null,
        session_id: sessionId ?? null,
        metadata:   payload.metadata ?? {},
      };

      // Fire and forget — don't block the UI
      fetch(INGEST_URL, {
        method:  'POST',
        headers: {
          'Content-Type':     'application/json',
          'x-security-token': INGEST_SECRET ?? '',
        },
        body: JSON.stringify(body),
      }).catch(e => console.warn('[SecurityMonitor] Event send failed:', e));
    } catch (e) {
      // Never let security monitoring crash the app
      console.warn('[SecurityMonitor] Failed to emit event:', e);
    }
  }

  // ── Convenience wrappers ────────────────────────────────────────────────────

  /** Track login failure and detect brute force pattern */
  async trackLoginFailure({ ip, email, route = '/auth/login', metadata = {} }) {
    const key = `${ip}:${route}`;
    const now  = Date.now();
    const rec  = _loginFailures.get(key) ?? { count: 0, firstAt: now };
    rec.count++;
    _loginFailures.set(key, rec);

    const windowMs = 5 * 60 * 1000; // 5 min
    const age      = now - rec.firstAt;

    if (rec.count === 1) {
      await this.event({
        event_type:   EVENT_TYPES.LOGIN_FAILED,
        category:     CATEGORIES.AUTH,
        source_system: 'app',
        ip_address:   ip,
        route,
        summary:      `Failed login attempt for ${email ?? 'unknown'}`,
        metadata:     { email, ...metadata },
      });
    } else if (rec.count >= 5 && age < windowMs) {
      await this.event({
        event_type:   EVENT_TYPES.BRUTE_FORCE_IN_PROGRESS,
        category:     CATEGORIES.AUTH,
        source_system: 'app',
        ip_address:   ip,
        route,
        summary:      `Brute force pattern: ${rec.count} failures in ${Math.round(age / 1000)}s for ${email ?? 'multiple accounts'}`,
        metadata:     { email, failure_count: rec.count, window_seconds: Math.round(age / 1000), ...metadata },
      });
    }

    // Reset window
    if (age > windowMs) _loginFailures.set(key, { count: 1, firstAt: now });
  }

  /** Call after successful login to check if following a brute force */
  async trackLoginSuccess({ ip, userId, route = '/auth/login', metadata = {} }) {
    const key = `${ip}:${route}`;
    const rec  = _loginFailures.get(key);
    _loginFailures.delete(key);

    if (rec && rec.count >= 3) {
      await this.event({
        event_type:   EVENT_TYPES.BRUTE_FORCE_SUCCESS,
        category:     CATEGORIES.AUTH,
        source_system: 'app',
        ip_address:   ip,
        route,
        user_id:      userId,
        summary:      `Successful login after ${rec.count} failed attempts — possible brute force success`,
        metadata:     { prior_failures: rec.count, ...metadata },
      });
    }
  }

  /** Detect access to a resource not owned by the requesting user */
  async trackIDOR({ userId, resourceType, resourceId, ownerUserId, route, ip, metadata = {} }) {
    if (userId === ownerUserId) return; // not IDOR

    await this.event({
      event_type:    EVENT_TYPES.IDOR_ATTEMPT,
      category:      CATEGORIES.ACCESS_CONTROL,
      source_system: 'api',
      user_id:       userId,
      ip_address:    ip,
      route,
      resource_type: resourceType,
      resource_id:   resourceId,
      summary:       `User ${userId} attempted to access ${resourceType}:${resourceId} owned by ${ownerUserId}`,
      metadata:      { owner_user_id: ownerUserId, ...metadata },
    });
  }

  /** Track injection payload signatures in request bodies */
  trackInjectionPayload({ payload, route, userId, ip }) {
    const injectionPatterns = [
      /(\bunion\b.*\bselect\b|\bselect\b.*\bfrom\b|\bdrop\b.*\btable\b)/i,
      /(<script[\s>]|javascript:|onerror=|onload=)/i,
      /(\.\.\/|%2e%2e%2f|%252e%252e%252f)/i, // path traversal
      /(exec\s*\(|system\s*\(|popen\s*\(|subprocess\.)/i, // command injection
      /(\$\{jndi:|ldap:\/\/|rmi:\/\/)/i, // Log4Shell-style
    ];

    const str = JSON.stringify(payload ?? '');
    for (const pat of injectionPatterns) {
      if (pat.test(str)) {
        this.event({
          event_type:    EVENT_TYPES.INJECTION_PAYLOAD_SIGNATURE,
          category:      CATEGORIES.INJECTION,
          source_system: 'api',
          user_id:       userId,
          ip_address:    ip,
          route,
          summary:       `Injection pattern detected in request to ${route}`,
          metadata:      { pattern: pat.source.slice(0, 100), payload_excerpt: str.slice(0, 200) },
        });
        break;
      }
    }
  }

  /** Detect secret-bearing strings in outbound/request data */
  trackSecretInData({ data, context, userId, ip }) {
    const secretPatterns = [
      /eyJ[A-Za-z0-9_-]{20,}/,              // JWT
      /sk_live_[A-Za-z0-9]{20,}/,           // Stripe live key
      /AKIA[0-9A-Z]{16}/,                   // AWS access key
      /service_role[A-Za-z0-9_-]{20,}/,     // Supabase service role hint
      /AIza[0-9A-Za-z_-]{35}/,              // Google API key
      /ghp_[A-Za-z0-9]{36}/,               // GitHub personal token
      /-----BEGIN (RSA |EC )?PRIVATE KEY/,   // Private key
    ];

    const str = typeof data === 'string' ? data : JSON.stringify(data);
    for (const pat of secretPatterns) {
      if (pat.test(str)) {
        this.event({
          event_type:    EVENT_TYPES.SECRET_IN_REQUEST_BODY,
          category:      CATEGORIES.EXFILTRATION,
          source_system: 'api',
          user_id:       userId,
          ip_address:    ip,
          summary:       `Possible secret/credential detected in ${context}`,
          metadata:      { context, pattern_hint: pat.source.slice(0, 50) },
        });
        break;
      }
    }
  }

  /** Call when an outbound request is made to validate against approved domains */
  async trackOutboundDomain({ domain, calledFrom, userId, metadata = {} }) {
    try {
      const { data: approved } = await supabase
        .from('approved_domains')
        .select('domain')
        .eq('domain', domain)
        .eq('active', true)
        .maybeSingle();

      if (!approved) {
        await this.event({
          event_type:    EVENT_TYPES.UNAPPROVED_DOMAIN_CALL,
          category:      CATEGORIES.DEVELOPER_TOOL,
          source_system: calledFrom,
          user_id:       userId,
          summary:       `Outbound call to unapproved domain: ${domain}`,
          metadata:      { domain, called_from: calledFrom, ...metadata },
        });
      }
    } catch (e) {
      console.warn('[SecurityMonitor] Domain check failed:', e);
    }
  }

  /** Track coupon/credit/referral abuse patterns */
  trackFinancialAbuse({ userId, abuseType, amount, metadata = {} }) {
    this.event({
      event_type:    EVENT_TYPES.COUPON_ABUSE_PATTERN,
      category:      CATEGORIES.ABUSE,
      source_system: 'app',
      user_id:       userId,
      summary:       `Financial abuse pattern detected: ${abuseType} — amount: ${amount}`,
      metadata:      { abuse_type: abuseType, amount, ...metadata },
    });
  }
}

export const SecurityMonitor = new _SecurityMonitor();
