import { Link } from "react-router-dom";

// Apple guideline 5.1.1(i) + 5.6 require Privacy + Terms links to be
// discoverable from every screen of the app. Rendered on the authenticated
// shell footer and on public pages (login, /pro) so both pre- and post-
// signup users always have a one-click path to our policies.
export default function LegalFooter() {
  return (
    <footer
      style={{
        marginTop: "3rem",
        padding: "1.25rem 0 0",
        borderTop: "1px solid rgba(120,120,120,0.25)",
        fontSize: "0.82rem",
        opacity: 0.75,
        display: "flex",
        flexWrap: "wrap",
        gap: "0.75rem 1rem",
      }}
    >
      <span>© {new Date().getFullYear()} Snippd · Godkingdom Business LLC</span>
      <Link to="/privacy">Privacy</Link>
      <Link to="/terms">Terms</Link>
      <a href="mailto:hello@getsnippd.com">Support</a>
    </footer>
  );
}
