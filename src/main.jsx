// Sentry MUST initialize before anything else — do not move this import.
import "./instrument";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { reactErrorHandler } from "@sentry/react";
import "./index.css";
import App from "./App.js";

createRoot(document.getElementById("root"), {
  // React 19 error channels — wire all three so Sentry captures uncaught,
  // caught (via error boundaries), and recoverable render errors.
  onUncaughtError: reactErrorHandler((error, errorInfo) => {
    console.error("Uncaught error", error, errorInfo.componentStack);
  }),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>
);
