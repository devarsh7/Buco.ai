import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Browser Supabase client. Sessions are cached in localStorage and
 * auto-refreshed, so users stay signed in across visits.
 */
export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storageKey: "buco-auth",
        },
      }
    );
  }
  return client;
}
