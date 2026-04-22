import { Link } from "react-router-dom";
import { useEffect } from "react";

// Public, unauthenticated privacy policy. Apple App Store Review
// Guideline 5.1.1(i) + 5.6 and App Store Connect both require a
// reachable policy; this page is also linked from App Store Connect's
// privacy-URL field. Copy is intentionally plain-English and matches
// what the app actually does today — update both the app and this page
// together if collection practices change.

const LAST_UPDATED = "April 22, 2026";
const CONTACT_EMAIL = "privacy@getsnippd.com";

const SECTIONS = [
  {
    heading: "The short version",
    paragraphs: [
      "We collect the minimum we need to plan your grocery trip, save you money, and keep the app from breaking. We don't sell data, we don't run ads, and we don't build behavioral profiles for third parties.",
      "You can delete your account and all associated data from inside the app at any time — see Settings → Delete my account.",
    ],
  },
  {
    heading: "Who we are",
    paragraphs: [
      "Snippd is operated by Godkingdom Business LLC (\"Snippd,\" \"we,\" \"us\"). Email us any time at " + CONTACT_EMAIL + ".",
    ],
  },
  {
    heading: "What we collect and why",
    table: [
      ["Account email + auth identifier", "Sign you in and remember your preferences. Stored in Supabase Auth."],
      ["Shopping plan, list, and trip history", "Power the Plan / List / Verify flows and the Chef Meal Studio. Stored in our Supabase Postgres database."],
      ["Behavioral events (screens visited, bundle locked, item unavailable, trip completed, preference recorded)", "Personalize future suggestions. Stored in our Neo4j Aura graph database and tied to your account ID."],
      ["Receipt images you upload for verification", "Detect purchases and award rebates. Uploaded to Supabase Storage and deleted after verification completes."],
      ["Stripe customer + subscription metadata (Pro subscribers only)", "Process your $4.99/mo subscription. Full card details are held by Stripe, not us."],
      ["Error reports, session replays, and performance traces", "Diagnose crashes and fix bugs. Handled by Sentry; session replays redact keystrokes and PII by default."],
    ],
  },
  {
    heading: "Who we share data with",
    paragraphs: [
      "Snippd uses a small number of vetted third parties, each strictly for the purpose below. We do not sell personal information and do not share data with advertisers.",
    ],
    table: [
      ["Supabase (Postgres, Auth, Storage, Edge Functions)", "Primary backend. Hosts your account and shopping data."],
      ["Neo4j Aura", "Graph database for personalization signals. Holds event data keyed by your Supabase user ID."],
      ["Stripe", "Payment processing for Snippd Pro. Subject to Stripe's privacy policy."],
      ["Sentry", "Error monitoring + session replay. Replays redact form inputs by default."],
      ["Slack (internal only)", "Internal operational alerts. No user data is posted to Slack."],
    ],
  },
  {
    heading: "Your choices and rights",
    paragraphs: [
      "Access: you can view your account email, saved preferences, and receipt history inside the app.",
      "Deletion: Settings → Delete my account triggers a cascade that removes your auth record, shopping data, behavioral graph, and Stripe subscription (if any). This is irreversible.",
      "Export: email " + CONTACT_EMAIL + " and we will provide a machine-readable export of your Snippd data within 30 days.",
      "Subscription cancel: Settings → Manage subscription opens the Stripe-hosted customer portal. You can cancel there; the account itself remains until you also use Delete my account.",
    ],
  },
  {
    heading: "Children",
    paragraphs: [
      "Snippd is not directed to children under 13 and we don't knowingly collect data from them. If you believe a child has created an account, email us and we will delete it.",
    ],
  },
  {
    heading: "Security",
    paragraphs: [
      "Data in transit is encrypted via TLS. Data at rest is encrypted by our providers (Supabase, Neo4j Aura, Stripe, Sentry). Row-level security in Postgres restricts each user's rows to their own session. We rotate credentials on a routine schedule and after any suspected exposure.",
    ],
  },
  {
    heading: "International users",
    paragraphs: [
      "Our servers are located in the United States. By using Snippd you consent to processing in the United States. If you're in the EEA or UK, you can exercise your GDPR/UK-GDPR rights by emailing " + CONTACT_EMAIL + ".",
    ],
  },
  {
    heading: "Changes",
    paragraphs: [
      "We'll update this page (and the \"last updated\" date) when our practices change. Material changes will be announced in the app before they take effect.",
    ],
  },
];

export default function PrivacyPolicyScreen() {
  useEffect(() => {
    document.title = "Privacy Policy · Snippd";
    return () => {
      document.title = "Snippd";
    };
  }, []);

  return (
    <div className="snippd-screen" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.25rem 4rem", lineHeight: 1.55 }}>
      <nav style={{ marginBottom: "1.5rem", opacity: 0.8 }}>
        <Link to="/login">← Back to Snippd</Link>
      </nav>
      <h1 style={{ marginBottom: "0.25rem" }}>Privacy Policy</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Last updated: {LAST_UPDATED}</p>

      {SECTIONS.map((section) => (
        <section key={section.heading} style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.15rem", marginBottom: "0.5rem" }}>{section.heading}</h2>
          {section.paragraphs?.map((p, i) => (
            <p key={i} style={{ margin: "0.5rem 0" }}>{p}</p>
          ))}
          {section.table && (
            <div style={{ overflowX: "auto", marginTop: "0.75rem" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <tbody>
                  {section.table.map(([k, v], i) => (
                    <tr key={i} style={{ borderBottom: "1px solid rgba(120,120,120,0.2)" }}>
                      <td style={{ padding: "0.5rem 0.75rem 0.5rem 0", verticalAlign: "top", fontWeight: 600, width: "40%" }}>{k}</td>
                      <td style={{ padding: "0.5rem 0", verticalAlign: "top" }}>{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}

      <p style={{ marginTop: "2.5rem", opacity: 0.7 }}>
        Questions? <a href={"mailto:" + CONTACT_EMAIL}>{CONTACT_EMAIL}</a>. See also our{" "}
        <Link to="/terms">Terms of Service</Link>.
      </p>
    </div>
  );
}
