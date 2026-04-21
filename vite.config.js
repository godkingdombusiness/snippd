import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { sentryVitePlugin } from "@sentry/vite-plugin";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const uploadSourceMaps =
    mode === "production" &&
    !!process.env.SENTRY_AUTH_TOKEN &&
    !!process.env.SENTRY_ORG &&
    !!process.env.SENTRY_PROJECT;

  return {
    // 'hidden' keeps source maps out of the final bundle while still
    // uploading them to Sentry, so production stack traces are readable
    // without leaking the source tree to users.
    build: {
      sourcemap: uploadSourceMaps ? "hidden" : false,
    },
    plugins: [
      react(),
      uploadSourceMaps
        ? sentryVitePlugin({
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: {
              name:
                process.env.VITE_APP_VERSION ||
                process.env.VITE_GIT_SHA ||
                undefined,
            },
          })
        : null,
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };
});
