import { Link } from "react-router-dom";
import { useEffect } from "react";

// Public, unauthenticated terms-of-service page. Apple App Store Review
// guideline 5.1.1 + 5.6 requires this to be reachable. Copy is minimal
// but legally-styled — update with counsel before any big growth push.

const LAST_UPDATED = "April 22, 2026";
const CONTACT_EMAIL = "legal@getsnippd.com";

const SECTIONS = [
  {
    heading: "Acceptance",
    body: "By creating an account or using Snippd, you agree to these Terms and our Privacy Policy. If you don't agree, don't use the service.",
  },
  {
    heading: "The service",
    body: "Snippd helps you plan grocery trips, assemble a shopping list, and claim cashback rebates at participating retailers. Savings shown are estimates based on publicly available offers and your inputs; actual savings depend on retailer policies, stock, and your own purchases.",
  },
  {
    heading: "Eligibility",
    body: "You must be at least 13 years old to create a Snippd account, and old enough in your jurisdiction to enter a binding contract for any paid plan.",
  },
  {
    heading: "Your account",
    body: "You're responsible for activity under your account and for keeping your credentials safe. Tell us immediately at " + CONTACT_EMAIL + " if you suspect unauthorized access.",
  },
  {
    heading: "Snippd Pro subscription",
    body: "Snippd Pro is a $4.99/month auto-renewing subscription billed through Stripe and starting after an optional 7-day free trial. You can cancel at any time via Settings → Manage subscription; cancellation takes effect at the end of the current billing period and no refunds are issued for partial periods. If you purchase Pro on iOS via Apple's in-app purchase system, Apple's billing and cancellation terms apply instead.",
  },
  {
    heading: "Acceptable use",
    body: "Don't misuse Snippd. That means: no scraping, no attempting to defeat rate limits, no uploading other people's receipts, no reselling savings offers, and no uploading content that's illegal, infringing, or offensive.",
  },
  {
    heading: "Content you submit",
    body: "You keep ownership of receipts, preferences, and feedback you submit. You grant Snippd a worldwide, non-exclusive, royalty-free license to process that content solely to operate the service (e.g. matching a receipt to a rebate, personalizing suggestions).",
  },
  {
    heading: "Third-party offers and retailers",
    body: "Rebate, coupon, and cashback offers shown in Snippd are provided by partners like Ibotta and Fetch and by the retailers themselves. Snippd is not responsible for honoring those offers, changes in their terms, or disputes between you and a retailer or rebate partner.",
  },
  {
    heading: "Our intellectual property",
    body: "The Snippd name, logo, and software are owned by Godkingdom Business LLC. You may not copy, redistribute, or reverse-engineer the service except as permitted by law.",
  },
  {
    heading: "Disclaimers",
    body: "Snippd is provided \"as is\" and \"as available.\" We don't guarantee uninterrupted availability, accuracy of offers, or any specific savings outcome. Receipts are verified on a best-effort basis; we reserve the right to reject a receipt that cannot be matched.",
  },
  {
    heading: "Limitation of liability",
    body: "To the fullest extent permitted by law, Snippd's total liability arising out of or related to the service is limited to the greater of (a) $50 or (b) the amount you paid Snippd in the 12 months before the claim. We are not liable for indirect or consequential damages, including lost savings or lost time.",
  },
  {
    heading: "Termination",
    body: "You can delete your account at any time via Settings → Delete my account. We may suspend or terminate accounts that violate these Terms. On termination, your shopping data, behavioral graph, and Stripe subscription are removed as described in the Privacy Policy.",
  },
  {
    heading: "Changes to these terms",
    body: "We'll post updates to this page with a new \"last updated\" date. Material changes will be announced in the app; continuing to use Snippd after the effective date means you accept the updated terms.",
  },
  {
    heading: "Governing law",
    body: "These Terms are governed by the laws of the State of Florida, excluding conflict-of-law rules. Disputes will be resolved in the state or federal courts located in Orange County, Florida.",
  },
  {
    heading: "Contact",
    body: "Reach us at " + CONTACT_EMAIL + " with any questions about these Terms.",
  },
];

export default function TermsOfServiceScreen() {
  useEffect(() => {
    document.title = "Terms of Service · Snippd";
    return () => {
      document.title = "Snippd";
    };
  }, []);

  return (
    <div className="snippd-screen" style={{ maxWidth: 760, margin: "0 auto", padding: "2rem 1.25rem 4rem", lineHeight: 1.55 }}>
      <nav style={{ marginBottom: "1.5rem", opacity: 0.8 }}>
        <Link to="/login">← Back to Snippd</Link>
      </nav>
      <h1 style={{ marginBottom: "0.25rem" }}>Terms of Service</h1>
      <p style={{ opacity: 0.7, marginTop: 0 }}>Last updated: {LAST_UPDATED}</p>

      {SECTIONS.map((section) => (
        <section key={section.heading} style={{ marginTop: "1.75rem" }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: "0.35rem" }}>{section.heading}</h2>
          <p style={{ margin: 0 }}>{section.body}</p>
        </section>
      ))}

      <p style={{ marginTop: "2.5rem", opacity: 0.7 }}>
        See also our <Link to="/privacy">Privacy Policy</Link>.
      </p>
    </div>
  );
}
