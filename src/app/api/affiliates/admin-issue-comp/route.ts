/**
 * POST /api/affiliates/admin-issue-comp
 *
 * Admin-side "credit an affiliate for a prospect": issue a free Pro comp to a
 * prospect ON BEHALF OF a chosen affiliate. This is the staff version of the
 * affiliate self-serve comp (src/app/api/affiliates/comps/route.ts): same
 * in-house minting, but an admin picks the affiliate and is not bound by that
 * affiliate's monthly quota.
 *
 * Why it exists: a customer often forgets to click an affiliate's link before
 * trying the app (they email us asking us to "give <affiliate> credit"). Issuing
 * a comp tied to that affiliate both buys the prospect evaluation time and, via
 * the affiliate's branded convertLink in the comp email, routes their eventual
 * upgrade through the affiliate so the commission lands.
 *
 * The comp is stamped with issued_by_affiliate_id so it shows on the Comps page
 * and the affiliate's owed report attributes correctly.
 */
import { NextResponse } from "next/server";
import { requirePermission, createAdminClient } from "@/lib/admin";
import { logAdminAction } from "@/lib/admin-audit";
import { issueInHouseComp } from "@/lib/comp-issue";
import { AFFILIATE_COMP_PLAN, AFFILIATE_COMP_SEATS } from "@/lib/affiliate-comps";
import { resolveAdminAffiliate } from "@/lib/affiliate-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Admin discretion is wider than the affiliate self-serve cap (60 days / 2
// months), but still bounded so a typo cannot mint a decade of free Pro.
const MAX_DAYS = 365;
const MAX_MONTHS = 24;

type Body = {
  affiliate?: unknown; // affiliate branded code OR user id
  recipientEmail?: unknown;
  recipientName?: unknown;
  unit?: unknown; // "day" | "month"
  amount?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function POST(request: Request) {
  const actor = await requirePermission("affiliates.comps.manage", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const affiliateInput = str(body.affiliate);
  if (!affiliateInput) {
    return NextResponse.json({ error: "Choose an affiliate (code or user id)." }, { status: 400 });
  }
  const recipientEmail = str(body.recipientEmail);
  if (!recipientEmail || !EMAIL_RE.test(recipientEmail)) {
    return NextResponse.json({ error: "Enter a valid recipient email." }, { status: 400 });
  }
  const recipientName = str(body.recipientName);

  const unit = body.unit === "day" || body.unit === "month" ? body.unit : null;
  if (!unit) {
    return NextResponse.json({ error: "Choose a duration in days or months." }, { status: 400 });
  }
  const amount =
    typeof body.amount === "number" ? body.amount : Number.parseInt(String(body.amount), 10);
  if (!Number.isInteger(amount) || amount < 1) {
    return NextResponse.json({ error: "Enter a whole number of days or months." }, { status: 400 });
  }
  if (unit === "day" && amount > MAX_DAYS) {
    return NextResponse.json({ error: `Comps can be at most ${MAX_DAYS} days.` }, { status: 400 });
  }
  if (unit === "month" && amount > MAX_MONTHS) {
    return NextResponse.json({ error: `Comps can be at most ${MAX_MONTHS} months.` }, { status: 400 });
  }
  const days = unit === "day" ? amount : null;
  const months = unit === "month" ? amount : null;

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const aff = await resolveAdminAffiliate(admin, affiliateInput);
  if (!aff) {
    return NextResponse.json(
      { error: "No affiliate found for that code or user id." },
      { status: 404 },
    );
  }

  // Branded checkout link so the prospect's eventual upgrade credits the
  // affiliate. Without a code we cannot build one; the comp still issues, but
  // warn the caller so they can fix the affiliate's code first.
  const siteUrl = (
    process.env.SITE_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    "https://www.influencerbutler.com"
  ).replace(/\/$/, "");
  const convertLink = aff.code
    ? `${siteUrl}/pricing?code=${encodeURIComponent(aff.code)}`
    : null;

  const result = await issueInHouseComp({
    email: recipientEmail,
    name: recipientName,
    months,
    days,
    plan: AFFILIATE_COMP_PLAN, // Pro Solo monthly
    seats: AFFILIATE_COMP_SEATS, // single seat
    forever: false,
    allowExisting: false,
    convertLink,
    issuerName: aff.displayName,
    issuedByAffiliateId: aff.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await logAdminAction({
    actor,
    action: "affiliate.comp.issue_on_behalf",
    targetType: "user",
    targetId: aff.userId,
    details: {
      recipientEmail: result.email,
      recipientUserId: result.userId,
      affiliateCode: aff.code,
      days,
      months,
      convertLink,
      expiresAt: result.expiresAt,
    },
  });

  return NextResponse.json({
    ok: true,
    key: result.key,
    recipientEmail: result.email,
    recipientUserId: result.userId,
    affiliateCode: aff.code,
    affiliateName: aff.displayName,
    convertLink,
    expiresAt: result.expiresAt,
    emailSent: Boolean(process.env.RESEND_API_KEY),
    warning: aff.code ? null : "This affiliate has no branded code, so the comp email has no upgrade link. Generate their code, then attribute their upgrade manually.",
  });
}
