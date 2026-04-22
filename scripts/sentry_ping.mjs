import * as Sentry from "@sentry/node";

const DSN =
  process.env.SENTRY_DSN_OVERRIDE ||
  "https://e9f81fd15fb17437842ebf168b502112@o4511256923537408.ingest.us.sentry.io/4511257099042816";

console.log("[ping] Using DSN project:", DSN.split("/").pop());

Sentry.init({
  dsn: DSN,
  debug: true,
  environment: "dev-ping",
  release: `cli-ping-${Date.now()}`,
  sendDefaultPii: false,
  tracesSampleRate: 1.0,
});

console.log("[ping] Sending 1 info message + 1 exception to Sentry…");

const msgId = Sentry.captureMessage(
  "Snippd CLI Sentry ping — if you see this in Sentry Issues, the DSN works.",
  "info"
);
console.log("[ping] message eventId:", msgId);

try {
  throw new Error(
    "Snippd CLI forced error — if you see this in Sentry Issues + Slack, the full bridge works."
  );
} catch (err) {
  const errId = Sentry.captureException(err);
  console.log("[ping] exception eventId:", errId);
}

await Sentry.flush(5000);
console.log("[ping] flushed. Check Sentry Issues now.");
process.exit(0);
