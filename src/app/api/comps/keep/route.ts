/**
 * GET /api/comps/keep?c=<comp subscription id>&t=<hmac>&src=<surface>
 *
 * The one-click "Keep my plan" button in the end-of-comp emails, the website
 * dashboard banner and the desktop app. No sign-in needed: the HMAC proves the
 * link came from us and names exactly one comp.
 *
 * Opens a Lemon Squeezy checkout for the plan the comp was on, with the
 * customer's email filled in. Nothing is charged here. The plan's built-in
 * free trial starts at checkout and the subscription_created webhook moves the
 * trial end to the comp end date (applyCompDelayedFirstCharge), so the first
 * charge lands the day the free access ends. No discount is applied.
 */
import { NextResponse } from "next/server";
import { adminService } from "@/lib/admin-service";
import { lsApi, resolveVariantId } from "@/lib/lemonsqueezy";
import { siteUrl, verifyKeepPlanToken, formatCompDate } from "@/lib/comp-expiry-customer";
import { compGrantsForUser, isCompSubscriptionId, variantHasFreeTrial } from "@/lib/comp-conversion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(title: string, message: string, status = 200): Response {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#fff;color:#1f2937;margin:0}main{max-width:520px;margin:64px auto;padding:0 16px}h1{font-size:22px}a{color:#c2410c}</style></head>
<body><main id="main-content"><h1>${esc(title)}</h1><p>${esc(message)}</p><p><a href="${siteUrl()}/dashboard/subscription">Go to my account</a></p></main></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const compId = (url.searchParams.get("c") ?? "").trim();
  const token = (url.searchParams.get("t") ?? "").trim();
  const src = (url.searchParams.get("src") ?? "link").replace(/[^a-z0-9_-]/gi, "").slice(0, 24);
  if (!compId || !verifyKeepPlanToken(compId, token)) {
    return page("This link has expired", "Please sign in to your account to choose a plan.", 400);
  }

  const svc = adminService();
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!svc || !storeId) return page("Something went wrong", "Please try again in a few minutes.", 500);

  const grantRes = await svc.from("comp_grants").select("*").eq("ls_subscription_id", compId).maybeSingle();
  const grant = (grantRes.data ?? null) as Record<string, unknown> | null;
  const userId = typeof grant?.user_id === "string" ? grant.user_id : null;
  if (!grant || !userId) return page("We could not find that plan", "Please reply to Liz's email and we will sort it out.", 404);

  // Already on a paid plan (converted, or paid some other way): nothing to do.
  const grants = await compGrantsForUser(svc, userId);
  const grantIds = new Set(grants.map((g) => g.lsSubscriptionId));
  const liveRes = await svc
    .from("subscriptions")
    .select("ls_subscription_id,status")
    .eq("user_id", userId)
    .in("status", ["active", "on_trial", "past_due"])
    .limit(20);
  const livePaid = (liveRes.data ?? []).some(
    (s) => !isCompSubscriptionId(typeof s.ls_subscription_id === "string" ? s.ls_subscription_id : null, grantIds),
  );
  if (livePaid || grant.converted_at) {
    return page("You are all set", "Your plan is already active. Thank you!");
  }
  // An admin-revoked comp (cancelled well before its end date) has no free days
  // left to protect, so its link no longer opens a delayed-charge checkout.
  if (typeof grant.cancelled_at === "string" && typeof grant.expires_at === "string" &&
      new Date(grant.cancelled_at).getTime() < new Date(grant.expires_at).getTime() - 2 * 24 * 60 * 60 * 1000) {
    return page("This link has expired", "Please sign in to your account to choose a plan.", 410);
  }

  const profile = (await svc.from("profiles").select("email").eq("id", userId).maybeSingle()).data;
  const email = typeof profile?.email === "string" ? profile.email : typeof grant.user_email === "string" ? grant.user_email : null;
  if (!email) return page("We could not find that plan", "Please reply to Liz's email and we will sort it out.", 404);

  // The plan they were on: the comp subscription's variant, else Pro Solo monthly.
  const sub = (await svc.from("subscriptions").select("ls_variant_id").eq("ls_subscription_id", compId).maybeSingle()).data;
  let variantId = sub?.ls_variant_id != null ? String(sub.ls_variant_id) : null;
  if (!variantId) {
    const fallback = resolveVariantId("monthly", undefined);
    variantId = fallback.ok ? fallback.variantId : null;
  }
  if (!variantId) return page("Something went wrong", "Please try again in a few minutes.", 500);

  // The delayed first charge rides on the plan's free trial. If this variant has
  // none, LS would charge at checkout, which breaks our promise, so stop here.
  const expiresAt = typeof grant.expires_at === "string" ? grant.expires_at : null;
  // Within the last ~36h a same-day charge is effectively "on the end date".
  const msLeft = expiresAt != null ? new Date(expiresAt).getTime() - Date.now() : 0;
  const compStillRunning = msLeft > 36 * 60 * 60 * 1000;
  if (compStillRunning && (await variantHasFreeTrial(variantId)) === false) {
    console.error("comps/keep: variant has no free trial, cannot delay first charge", { variantId, compId });
    return page(
      "Almost there",
      `Your free access runs until ${formatCompDate(expiresAt)}. We will email you a link to keep your plan the day before it ends, so you are never charged early.`,
    );
  }

  const res = await lsApi("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: {
            email,
            custom: { supabase_user_id: userId, comp_keep: compId, comp_keep_src: src },
          },
          product_options: { redirect_url: `${siteUrl()}/welcome?from=comp` },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });
  const body = (await res.json().catch(() => null)) as { data?: { attributes?: { url?: string } } } | null;
  const checkoutUrl = body?.data?.attributes?.url;
  if (!res.ok || !checkoutUrl) {
    console.error("comps/keep: checkout creation failed", { status: res.status, compId });
    return page("Something went wrong", "Please try again in a few minutes.", 502);
  }
  return NextResponse.redirect(checkoutUrl, 302);
}
