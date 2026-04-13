// supabase/functions/secure-reward-claim/index.ts
// Validates eligibility server-side, writes to credit_ledger, prevents duplicates
// Auth: Supabase JWT required
// Rate limit: 5 claims per hour per user, 10 per hour per IP

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import {
  getAdminClient, requireAuth, checkRateLimit, requireFeatureEnabled,
  withIdempotency, validateTimestamp, logSecurityEvent, checkBlocked,
  recordRequestMetric, safeErrorResponse, handleCors, CORS_HEADERS,
  badRequestError, forbiddenError
} from '../_shared/middleware.ts'

// ─────────────────────────────────────────────────────────────
// REWARD RULES (server-side, never trust client)
// ─────────────────────────────────────────────────────────────
const REWARD_RULES: Record<string, {
  amount: number
  source: string
  requiresVerification?: boolean
  cooldownHours?: number
  requiresLevel?: number
}> = {
  WEEKLY_TRIP:           { amount: 10,  source: 'weekly_trip',        requiresVerification: true,  cooldownHours: 168 },  // 7 days
  STREAK_7_DAY:          { amount: 25,  source: 'streak_bonus',       requiresVerification: false, cooldownHours: 168 },
  STREAK_30_DAY:         { amount: 100, source: 'streak_bonus',       requiresVerification: false, cooldownHours: 720 },
  LEVEL_2_BONUS:         { amount: 50,  source: 'level_bonus',        requiresVerification: false, requiresLevel: 2 },
  LEVEL_3_BONUS:         { amount: 75,  source: 'level_bonus',        requiresVerification: false, requiresLevel: 3 },
  LEVEL_4_BONUS:         { amount: 150, source: 'level_bonus',        requiresVerification: false, requiresLevel: 4 },
  LEVEL_5_BONUS:         { amount: 300, source: 'level_bonus',        requiresVerification: false, requiresLevel: 5 },
}

// ─────────────────────────────────────────────────────────────
// MAIN HANDLER
// ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const adminClient = getAdminClient()
  let correlationId = crypto.randomUUID()
  let ctx: Awaited<ReturnType<typeof requireAuth>> | null = null

  try {
    // 1. Auth
    ctx = await requireAuth(req, adminClient)
    correlationId = ctx.correlationId

    // 2. Blocked check
    await checkBlocked(adminClient, ctx.ip, ctx.userId)

    // 3. Rate limiting: 5/hour per user, 10/hour per IP
    await checkRateLimit(adminClient, { userId: ctx.userId, ip: ctx.ip, route: '/secure-reward-claim' }, {
      maxPerUser: 5, maxPerIp: 10, windowSecs: 3600
    })

    // 4. Kill switch
    await requireFeatureEnabled(adminClient, 'rewards_enabled')

    // 5. Parse + validate body
    const body = await req.json()
    const { reward_key, reference_id, idempotency_key, request_timestamp } = body

    if (!reward_key || !idempotency_key || !request_timestamp) {
      throw badRequestError('Missing required fields: reward_key, idempotency_key, request_timestamp')
    }

    validateTimestamp(request_timestamp)

    // 6. Validate reward_key is in our rules
    const rule = REWARD_RULES[reward_key as string]
    if (!rule) throw badRequestError(`Unknown reward_key: ${reward_key}`)

    // 7. Execute with idempotency
    const { result, cached } = await withIdempotency(
      adminClient, idempotency_key, '/secure-reward-claim', ctx.userId, body,
      async () => {
        // 7a. Check one-time claim constraint
        const { data: existingClaim } = await adminClient
          .from('reward_claims')
          .select('id, claimed_at')
          .eq('user_id', ctx!.userId)
          .eq('reward_key', reward_key)
          .maybeSingle()

        if (existingClaim) {
          throw forbiddenError(`Reward '${reward_key}' has already been claimed`)
        }

        // 7b. Cooldown check (if applicable)
        if (rule.cooldownHours) {
          const { data: recent } = await adminClient
            .from('credit_ledger')
            .select('created_at')
            .eq('user_id', ctx!.userId)
            .eq('source', rule.source)
            .gte('created_at', new Date(Date.now() - rule.cooldownHours * 3600_000).toISOString())
            .limit(1)
            .maybeSingle()

          if (recent) {
            throw forbiddenError(`Cooldown active: reward '${reward_key}' requires ${rule.cooldownHours}h between claims`)
          }
        }

        // 7c. Level check (if applicable)
        if (rule.requiresLevel) {
          const { data: profile } = await adminClient
            .from('profiles')
            .select('current_level')
            .eq('id', ctx!.userId)
            .single()

          if (!profile || profile.current_level < rule.requiresLevel) {
            throw forbiddenError(`Reward '${reward_key}' requires level ${rule.requiresLevel}`)
          }
        }

        // 7d. Trip verification (if applicable)
        if (rule.requiresVerification && reference_id) {
          const { data: trip } = await adminClient
            .from('trip_results')
            .select('id, user_id, verified, closed')
            .eq('id', reference_id)
            .eq('user_id', ctx!.userId)
            .maybeSingle()

          if (!trip) throw forbiddenError('Referenced trip not found or not owned by user')
          if (!trip.verified) throw forbiddenError('Trip is not yet verified')
        }

        // 7e. Issue credits via SECURITY DEFINER function
        const { data: ledgerRow, error: creditError } = await adminClient.rpc('issue_credits', {
          p_user_id:       ctx!.userId,
          p_amount:        rule.amount,
          p_type:          'earn',
          p_source:        rule.source,
          p_reference_id:  reference_id ?? null,
          p_idempotency:   `reward_${reward_key}_${ctx!.userId}_${idempotency_key}`,
          p_issued_by:     'system'
        })

        if (creditError) {
          if (creditError.message.includes('KILL_SWITCH')) throw serviceUnavailError('Rewards temporarily disabled')
          if (creditError.message.includes('FRAUD_BLOCK')) throw forbiddenError('Account restricted')
          throw serverError('Failed to issue credits')
        }

        // 7f. Record one-time claim
        await adminClient.from('reward_claims').insert({
          user_id: ctx!.userId,
          reward_key,
          amount: rule.amount
        })

        // 7g. Get updated balance from ledger view
        const { data: balance } = await adminClient
          .from('user_credit_balance')
          .select('balance')
          .eq('user_id', ctx!.userId)
          .single()

        await logSecurityEvent(adminClient, {
          event_type: 'REWARD_CLAIMED',
          category: 'REWARDS',
          severity: 'LOW',
          user_id: ctx!.userId,
          ip_address: ctx!.ip,
          route: '/secure-reward-claim',
          summary: `User claimed reward: ${reward_key} (+${rule.amount} credits)`,
          metadata: { reward_key, amount: rule.amount, reference_id }
        })

        return {
          success: true,
          reward_key,
          credits_earned: rule.amount,
          new_balance: balance?.balance ?? 0,
          ledger_id: ledgerRow?.id
        }
      }
    )

    recordRequestMetric(adminClient, ctx.ip, ctx.userId, '/secure-reward-claim', 200, ctx.deviceFp)

    return Response.json({ ...result, cached, correlation_id: correlationId }, {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
    })

  } catch (e) {
    const status = (e as any).status ?? 500
    recordRequestMetric(adminClient, ctx?.ip ?? '0.0.0.0', ctx?.userId ?? null, '/secure-reward-claim', status, ctx?.deviceFp)
    return safeErrorResponse(e, correlationId)
  }
})

function serviceUnavailError(msg: string) {
  const e = new Error(msg) as any; e.status = 503; e.code = 'SERVICE_UNAVAILABLE'; return e
}
function serverError(msg: string) {
  const e = new Error(msg) as any; e.status = 500; e.code = 'SERVER_ERROR'; return e
}
