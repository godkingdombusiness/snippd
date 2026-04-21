import { useState } from "react";
import * as Sentry from "@sentry/react";

/**
 * @Auditor verification tool: the "Break the world" button proves the
 * Sentry ↔ Slack bridge is live. When you click it, the error travels:
 *   React ErrorBoundary -> Sentry Issues -> Slack webhook -> #engineering.
 *
 * This page is deliberately reachable without authentication so the
 * founder can verify the pipeline from any device before wiring auth flows.
 */
export default function DebugScreen() {
  const [message, setMessage] = useState(null);

  return (
    <div className="snippd-screen" style={{ padding: "2rem", maxWidth: 640 }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Snippd Debug Console</h1>
      <p style={{ color: "#666", marginTop: 0 }}>
        Verify the Sentry pipeline. Errors here should appear in Sentry
        Issues within seconds, and fan out to the <code>#engineering</code>
        Slack channel via the webhook.
      </p>

      <section
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          padding: "1rem",
          border: "1px solid #eee",
          borderRadius: 12,
          marginTop: "1rem",
        }}
      >
        <button
          type="button"
          style={{
            padding: "0.75rem 1rem",
            background: "#d0342c",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => {
            throw new Error(
              "Snippd first error (Debug page) — if you see this in Slack, the bridge works."
            );
          }}
        >
          Break the world
        </button>

        <button
          type="button"
          style={{
            padding: "0.75rem 1rem",
            background: "#1e88e5",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={() => {
            Sentry.captureMessage(
              "Snippd debug ping (info-level)",
              "info"
            );
            setMessage("Info message sent to Sentry.");
          }}
        >
          Send info ping
        </button>

        <button
          type="button"
          style={{
            padding: "0.75rem 1rem",
            background: "#43a047",
            color: "white",
            border: "none",
            borderRadius: 8,
            fontWeight: 600,
            cursor: "pointer",
          }}
          onClick={async () => {
            await Sentry.startSpan(
              { name: "debug.manual-span", op: "ui.action" },
              async (span) => {
                span?.setAttribute("snippd.feature", "debug-console");
                await new Promise((r) => setTimeout(r, 150));
              }
            );
            setMessage("Manual tracing span captured.");
          }}
        >
          Start a trace span
        </button>

        {message ? (
          <p style={{ color: "#1b5e20", margin: 0 }}>{message}</p>
        ) : null}
      </section>

      <p style={{ color: "#888", fontSize: 12, marginTop: "1.5rem" }}>
        Environment: <code>{import.meta.env.MODE}</code> · Release:{" "}
        <code>{import.meta.env.VITE_APP_VERSION || "dev"}</code>
      </p>
    </div>
  );
}
