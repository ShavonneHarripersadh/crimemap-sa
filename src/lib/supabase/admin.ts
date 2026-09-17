import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/database.types";
import { publicEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses Row Level Security, so it is used only by the protected admin
 * route to read ingestion status and validation warnings.
 *
 * The "server-only" import above makes the build fail if this module is ever pulled into a
 * client component, which is what keeps the secret key out of the browser bundle.
 */
export function getAdminClient(): SupabaseClient<Database> | null {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (publicEnv.supabaseUrl.length === 0 || serviceRoleKey.length === 0) return null;

  return createClient<Database>(publicEnv.supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True when an admin token is configured. The admin route 404s when it is not. */
export function isAdminConfigured(): boolean {
  return (process.env.ADMIN_ACCESS_TOKEN ?? "").length > 0;
}

/**
 * Constant-time-ish comparison of the supplied admin token against the configured one.
 */
export function isValidAdminToken(candidate: string | null | undefined): boolean {
  const expected = process.env.ADMIN_ACCESS_TOKEN ?? "";
  if (expected.length === 0) return false;
  if (!candidate || candidate.length !== expected.length) return false;

  let mismatch = 0;
  for (let i = 0; i < expected.length; i += 1) {
    mismatch |= expected.charCodeAt(i) ^ candidate.charCodeAt(i);
  }
  return mismatch === 0;
}
