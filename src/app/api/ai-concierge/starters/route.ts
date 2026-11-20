/**
 * GET /api/ai-concierge/starters?locale=es&platform=darwin
 * Starter questions tailored to the signed-in user (new, trial, Pro, older free
 * account). Dual-mode auth like the chat route. Any lookup failure falls back to
 * the new-account set, so the chat never loses its chips.
 *
 * Dependencies: @/lib/license-auth, @/lib/ai-concierge/{agent,starters}.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { getAdmin } from "@/lib/scheduling-server";
import { getSubscription, normalizeChatLocale } from "@/lib/ai-concierge/agent";
import { pickStarters, type StarterTier } from "@/lib/ai-concierge/starters";
import type { Principal } from "@/lib/mcp/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const url = new URL(request.url);
  const locale = normalizeChatLocale(url.searchParams.get("locale"));
  const platform = url.searchParams.get("platform")?.slice(0, 20) || undefined;

  const principal: Principal = {
    userId: authed.auth.userId,
    email: authed.auth.email,
    source: authed.auth.kind === "license" ? "license" : "session",
  };

  let tier: StarterTier = "free";
  try {
    const sub = (await getSubscription(principal)) as { tier?: string };
    if (sub.tier === "pro" || sub.tier === "trial") tier = sub.tier;
  } catch {
    // default to free
  }

  let ageDays: number | null = null;
  try {
    const admin = getAdmin();
    const created = admin ? (await admin.auth.admin.getUserById(authed.auth.userId)).data.user?.created_at : null;
    if (created) ageDays = Math.max(0, (Date.now() - Date.parse(created)) / 86_400_000);
  } catch {
    // unknown age reads as a new account
  }

  return NextResponse.json({ starters: pickStarters({ tier, ageDays, locale, platform }) });
}
