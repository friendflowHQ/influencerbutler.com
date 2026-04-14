import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    "https://khutiiojhafblabtixpp.supabase.co",
    "sb_publishable_CIxsGcwPAdC470Jw8QQGMw_Tvw41zM-",
  );
}
