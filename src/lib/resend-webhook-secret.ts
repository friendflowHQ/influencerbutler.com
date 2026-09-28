/**
 * Resolve the Resend/Svix webhook signing secret, shared by the webhook
 * handler (which needs the value to verify signatures) and the admin Emails
 * summary (which only needs to know whether one is configured, to warn when
 * open/click tracking is silently dark).
 *
 * Prefer the RESEND_WEBHOOK_SECRET env var; fall back to the app_config
 * 'resend_webhook_secret' row so the secret can be set from Supabase (via SQL)
 * when the hosting dashboard is not reachable. Cached briefly since webhook
 * events arrive in bursts.
 */
import { createAdminClient } from "@/lib/supabase/admin";

let secretCache: { value: string; at: number } | null = null;
const SECRET_TTL_MS = 5 * 60 * 1000;

export async function resolveResendWebhookSecret(): Promise<string> {
  const env = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
  if (env) return env;
  if (secretCache && Date.now() - secretCache.at < SECRET_TTL_MS) return secretCache.value;
  let value = "";
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("app_config")
      .select("value")
      .eq("key", "resend_webhook_secret")
      .maybeSingle();
    const v = data?.value as unknown;
    if (typeof v === "string") value = v.trim();
    else if (v && typeof v === "object" && typeof (v as { secret?: unknown }).secret === "string") {
      value = (v as { secret: string }).secret.trim();
    }
  } catch {
    value = "";
  }
  secretCache = { value, at: Date.now() };
  return value;
}

/** True when a signing secret is configured (env or app_config). The webhook
 * fails closed without one, so a false here means opens/clicks cannot record. */
export async function isResendWebhookConfigured(): Promise<boolean> {
  return Boolean(await resolveResendWebhookSecret());
}
