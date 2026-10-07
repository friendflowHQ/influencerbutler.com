/**
 * Cloudflare Turnstile server-side verification.
 *
 * FAILS CLOSED: when TURNSTILE_SECRET_KEY is unset in production the check
 * fails, so a missing env var can never silently turn the bot gate off. Outside
 * production (local dev, tests, preview without keys) an unset secret passes so
 * forms stay usable. Set TURNSTILE_ALLOW_UNCONFIGURED=1 only as a deliberate,
 * temporary owner override.
 */

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: "missing_secret" | "missing_token" | "rejected" | "error" };

export function turnstileConfigured(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | null | undefined,
  ip?: string,
): Promise<TurnstileResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY || "";
  if (!secret) {
    const isProd = process.env.NODE_ENV === "production";
    if (!isProd || process.env.TURNSTILE_ALLOW_UNCONFIGURED === "1") return { ok: true };
    console.error("turnstile: TURNSTILE_SECRET_KEY is not set in production; failing closed");
    return { ok: false, reason: "missing_secret" };
  }
  const t = (token ?? "").trim();
  if (!t || t.length > 4096) return { ok: false, reason: "missing_token" };
  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", t);
    if (ip && ip !== "unknown") form.set("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
    });
    const json = (await res.json().catch(() => null)) as { success?: boolean } | null;
    return json?.success ? { ok: true } : { ok: false, reason: "rejected" };
  } catch (err) {
    console.error("turnstile: verify threw", err);
    return { ok: false, reason: "error" };
  }
}
