import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Single reusable Supabase browser client.
 *
 * Reads configuration from environment variables only:
 *   - VITE_SUPABASE_URL          (e.g. http://192.168.2.28:8000)
 *   - VITE_SUPABASE_ANON_KEY     (public anonymous / publishable key)
 *
 * Never hardcode URLs or keys here. The service-role key MUST NOT
 * appear in the browser under any circumstances.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

if (isSupabaseConfigured && typeof window !== "undefined") {
  client = createClient(url as string, anonKey as string, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "ikc.auth.v1",
    },
  });
}

/**
 * Returns the singleton browser client.
 * Throws when env vars are missing — callers (auth/data hooks) should
 * surface this as a real error, never silently fall back to mock data.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new Error(
      "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in the deployment environment.",
    );
  }
  return client;
}

export const supabase = client;
