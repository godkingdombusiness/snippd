import { createClient, SupabaseClient } from "@supabase/supabase-js";
import * as Sentry from "@sentry/react";

const URL = import.meta.env.VITE_SUPABASE_URL;
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Defense: `createClient("", "")` throws synchronously during module load,
// which crashes the entire React tree and prevents even /debug from rendering.
// If env is missing, export a stub client that logs + reports to Sentry on use.
// This keeps the app bootable in misconfigured environments so the founder can
// always reach the Debug Console to diagnose.

function buildStubClient(reason: string): SupabaseClient {
  console.error(`[supabase] disabled: ${reason}`);
  Sentry.captureMessage(
    `[supabase] client disabled at boot: ${reason}`,
    "warning"
  );

  const notConfigured = (method: string) => {
    const err = new Error(
      `Supabase client not configured (${reason}). Called .${method}().`
    );
    Sentry.captureException(err, { tags: { subsystem: "supabase", method } });
    return Promise.resolve({ data: null, error: err });
  };

  const proxy = new Proxy(
    {},
    {
      get(_t, prop: string) {
        if (prop === "then") return undefined; // not a thenable
        if (prop === "auth") {
          return {
            getSession: () => notConfigured("auth.getSession"),
            getUser: () => notConfigured("auth.getUser"),
            onAuthStateChange: () => ({
              data: { subscription: { unsubscribe: () => {} } },
            }),
            signOut: () => notConfigured("auth.signOut"),
            signInWithOtp: () => notConfigured("auth.signInWithOtp"),
            signInWithPassword: () => notConfigured("auth.signInWithPassword"),
          };
        }
        if (prop === "from" || prop === "rpc") {
          return () => proxy;
        }
        // Chainable query builder stubs — every method returns the same proxy
        // so `.select(...).eq(...).limit(...).execute()` can be awaited without
        // throwing. The final `.then` path resolves with a clear error.
        return typeof prop === "string"
          ? (..._args: unknown[]) => {
              if (["execute", "single", "maybeSingle"].includes(prop)) {
                return notConfigured(`query.${prop}`);
              }
              return proxy;
            }
          : undefined;
      },
    }
  );

  return proxy as unknown as SupabaseClient;
}

export const supabase: SupabaseClient =
  URL && ANON
    ? createClient(URL, ANON)
    : buildStubClient(
        !URL && !ANON
          ? "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are both missing"
          : !URL
            ? "VITE_SUPABASE_URL is missing"
            : "VITE_SUPABASE_ANON_KEY is missing"
      );

export const supabaseIsConfigured = Boolean(URL && ANON);
