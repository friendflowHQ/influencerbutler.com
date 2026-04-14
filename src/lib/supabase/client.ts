import { createBrowserClient } from "@supabase/ssr";

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();

// Fallback for cases where env vars contain hidden characters or aren't inlined properly.
const FALLBACK_URL = "https://khutiiojhafblabtixpp.supabase.co";
const FALLBACK_KEY = "sb_publishable_CIxsGcwPAdC470Jw8QQGMw_Tvw41zM-";

function resolveUrl(): string {
  if (SUPABASE_URL && SUPABASE_URL.startsWith("https://")) return SUPABASE_URL;
  return FALLBACK_URL;
}

function resolveKey(): string {
  if (SUPABASE_ANON_KEY && SUPABASE_ANON_KEY.length > 10) return SUPABASE_ANON_KEY;
  return FALLBACK_KEY;
}

export function createClient() {
  return createBrowserClient(resolveUrl(), resolveKey());
}
