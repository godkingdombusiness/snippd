// lib/emailFunnel.ts
// Routes user data into HubSpot / Klaviyo with mission-based tags.
// In production: replace console.log with the actual CRM SDK call.

export interface FunnelUser {
  email:         string
  mission:       string | null
  budget_cents:  number | null
  power_level:   string | null
  leak_category: string | null
  style_vibe:    string | null
  status:        'waitlist' | 'beta' | 'lifetime'
}

const MISSION_TAGS: Record<string, string> = {
  rent_killer: 'Rent-Killer-Segment',
  save_goal:   'Goal-Saver-Segment',
  find_deals:  'Deal-Hunter-Segment',
}

const STATUS_TAGS: Record<string, string> = {
  waitlist: 'Waitlist-Free',
  beta:     'Beta-Pro-Paid',
  lifetime: 'Lifetime-Founder',
}

export async function sendToEmailFunnel(user: FunnelUser): Promise<void> {
  const tags = [
    MISSION_TAGS[user.mission ?? ''] ?? 'Unknown-Mission',
    STATUS_TAGS[user.status],
    user.leak_category ? `Leak-${user.leak_category}` : null,
    user.style_vibe    ? `Vibe-${user.style_vibe}` : null,
  ].filter(Boolean) as string[]

  const payload = {
    email:      user.email,
    properties: {
      snippd_mission:    user.mission,
      snippd_budget:     user.budget_cents,
      snippd_status:     user.status,
      snippd_tags:       tags.join(','),
      snippd_signup_at:  new Date().toISOString(),
    },
    tags,
  }

  // ── Production: HubSpot ──────────────────────────────────
  // await fetch('https://api.hubapi.com/crm/v3/objects/contacts', {
  //   method: 'POST',
  //   headers: { Authorization: `Bearer ${process.env.HUBSPOT_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ properties: payload.properties }),
  // })

  // ── Production: Klaviyo ──────────────────────────────────
  // await fetch('https://a.klaviyo.com/api/profiles/', {
  //   method: 'POST',
  //   headers: { Authorization: `Klaviyo-API-Key ${process.env.KLAVIYO_API_KEY}`, 'Content-Type': 'application/json' },
  //   body: JSON.stringify({ data: { type: 'profile', attributes: payload.properties } }),
  // })

  console.log('[EmailFunnel] Tagging user:', payload.email, '| Tags:', tags.join(', '))
}
