import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { isSupabaseConfigured, publicEnv } from "@/lib/env";

/**
 * Read-only server client using the publishable key. All access is constrained by Row Level
 * Security, which permits reading the published crime data and nothing else.
 *
 * Returns null when the project is not configured, so callers render an error state instead of
 * crashing. Every data function in src/lib/data handles that case.
 */
export function getServerClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured()) return null;

  return createClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
