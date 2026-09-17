/**
 * Environment access.
 *
 * Reading environment variables never throws at module load, so a missing configuration
 * produces a handled error state in the interface rather than a failed build or a blank page.
 */

const DEFAULT_MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  mapStyleUrl: process.env.NEXT_PUBLIC_MAP_STYLE_URL ?? DEFAULT_MAP_STYLE_URL,
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  analyticsEnabled: process.env.NEXT_PUBLIC_VERCEL_ANALYTICS === "true",
} as const;

/** Whether the app has enough configuration to talk to the database. */
export function isSupabaseConfigured(): boolean {
  return publicEnv.supabaseUrl.length > 0 && publicEnv.supabaseAnonKey.length > 0;
}

export function siteUrl(path = "/"): string {
  const base = publicEnv.siteUrl.replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
