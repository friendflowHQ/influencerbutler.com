import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = "https://khutiiojhafblabtixpp.supabase.co";
  const key = "sb_publishable_CIxsGcwPAdC470Jw8QQGMw_Tvw41zM-";
  console.log("[supabase-client] url:", url, "key:", key.substring(0, 20) + "...");
  return createBrowserClient(url, key);
}
