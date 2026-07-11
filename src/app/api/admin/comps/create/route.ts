/**
 * POST /api/admin/comps/create
 *
 * Issues a comp (a free, N-month Pro grant) that is bound to the RECIPIENT's own
 * account, not the admin's. Gated on licenses.view (same as the comps list).
 *
 * Why this route exists: a license key is an account credential, so a comp must
 * result in a subscription + license key under the recipient's user_id. Doing
 * the free checkout yourself and forwarding the key binds everything to YOUR
 * account - the recipient then authenticates as you (sees your email, and their
 * synced data lands in your dashboard). Instead we mint a single-use 100%-off
 * discount and return a checkout link pre-filled with the recipient's email. We
 * deliberately set NO custom.supabase_user_id, so when the recipient completes
 * the $0 checkout the webhook binds the subscription/key to their order email
 * (userId = directUserId ?? ensureUserForEmail(orderEmail)). It is structurally
 * impossible for this checkout to bind to the admin, and no account is created
 * for recipients who never complete it.
 *
 * The discount code is named <NAME>FREE<months>M so the existing comp tracking
 * (parseCompMonths / comps-data) picks up the duration and the expiry cron can
 * cancel it at the end of the free window.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import {
  lsApi,
  resolveVariantId,
  hasLiveSubscriptionForEmail,
} from "@/lib/lemonsqueezy";
import { createUniqueDiscount } from "@/lib/lemonsqueezy-discounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Monthly plans only: "repeating for N months" maps cleanly to N monthly cycles.
// (An annual plan's free-year comp is the manual LS path noted on the page.)
const ALLOWED_PLANS = new Set(["monthly", "team-monthly", "agency-monthly"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_MONTHS = 36;

type Body = {
  email?: unknown;
  name?: unknown;
  months?: unknown;
  plan?: unknown;
};

type LsCheckoutResponse = { data?: { attributes?: { url?: string } } };

/** Uppercase A-Z0-9 only, capped, for the <NAME> segment of the code. */
function codeNameSegment(name: string | null, email: string): string {
  const source = (name && name.trim()) || email.split("@")[0] || "USER";
  const cleaned = source.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  return cleaned || "USER";
}

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  const plan = typeof body.plan === "string" ? body.plan : "monthly";
  const months =
    typeof body.months === "number"
      ? body.months
      : Number.parseInt(String(body.months), 10);

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  if (!Number.isInteger(months) || months < 1 || months > MAX_MONTHS) {
    return NextResponse.json(
      { error: `Free months must be a whole number between 1 and ${MAX_MONTHS}.` },
      { status: 400 },
    );
  }
  if (!ALLOWED_PLANS.has(plan)) {
    return NextResponse.json({ error: "Unsupported plan." }, { status: 400 });
  }

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  if (!storeId) {
    console.error("comps/create: missing LEMONSQUEEZY_STORE_ID");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const variantResolution = resolveVariantId(plan, undefined);
  if (!variantResolution.ok) {
    console.error("comps/create: variant resolve failed", { plan, variantResolution });
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }
  const { variantId } = variantResolution;

  // Don't spin up a second parallel subscription for someone who already has a
  // live one - that double-mints keys and litters billing. Fails open on LS API
  // errors, so a transient blip never blocks a legitimate comp.
  if (await hasLiveSubscriptionForEmail(email)) {
    return NextResponse.json(
      { error: "That email already has a live subscription. Cancel it first, or use another email." },
      { status: 409 },
    );
  }

  const namePrefix = `${codeNameSegment(name, email)}FREE${months}M`;
  const discount = await createUniqueDiscount({
    storeId,
    percentOff: 100,
    durationMonths: months,
    variantIds: [variantId],
    namePrefix,
    name: `Comp: ${email} (${months} month${months === 1 ? "" : "s"})`,
  });
  if (!discount) {
    return NextResponse.json({ error: "Could not create the comp discount in Lemon Squeezy." }, { status: 502 });
  }

  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");

  // No custom.supabase_user_id: the webhook then binds to the recipient's order
  // email, which is what makes this comp land on THEIR account.
  const lsResponse = await lsApi("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: { email, discount_code: discount.code },
          product_options: { redirect_url: `${siteUrl}/welcome` },
        },
        relationships: {
          store: { data: { type: "stores", id: storeId } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });

  const rawBody = await lsResponse.text();
  if (!lsResponse.ok) {
    console.error("comps/create: checkout creation failed", {
      status: lsResponse.status,
      bodyPreview: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: "Could not create the comp checkout." }, { status: 502 });
  }

  let payload: LsCheckoutResponse;
  try {
    payload = JSON.parse(rawBody) as LsCheckoutResponse;
  } catch {
    console.error("comps/create: checkout response not JSON", { bodyPreview: rawBody.slice(0, 500) });
    return NextResponse.json({ error: "Invalid checkout response" }, { status: 502 });
  }

  const checkoutUrl = payload.data?.attributes?.url;
  if (!checkoutUrl) {
    console.error("comps/create: checkout URL missing", { bodyPreview: rawBody.slice(0, 500) });
    return NextResponse.json({ error: "Invalid checkout response" }, { status: 502 });
  }

  console.log("comps/create: issued comp", {
    by: actor.email,
    email,
    months,
    plan,
    code: discount.code,
  });

  return NextResponse.json({ ok: true, checkoutUrl, code: discount.code, email, months });
}
