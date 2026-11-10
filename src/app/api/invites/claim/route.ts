/**
 * POST /api/invites/claim  { code }
 *
 * The one-click "Claim my page" button on a private invite preview (/p/<code>).
 * The code is the capability: it only ever reached the creator's own inbox.
 * Claiming issues a 14-day Power User in-house comp (kind 'invite', no Lemon
 * Squeezy, no card) to the invite's email, stops the invite drip, and returns
 * the key plus the links that open the desktop app (which then pulls the draft
 * page through /api/invites/redeem). Idempotent: a second click returns the same
 * key. An existing customer keeps their plan and simply gets the page.
 */
import { NextResponse } from "next/server";
import { issueInHouseComp } from "@/lib/comp-issue";
import { rateLimit } from "@/lib/rate-limit";
import {
  INVITE_COMP_DAYS,
  INVITE_COMP_PLAN,
  INVITE_LIST_COLUMNS,
  advanceInvite,
  cancelInviteEnrollment,
  inviteDb,
  isExpired,
  isValidInviteCode,
  openInAppUrlFor,
  siteBase,
  type InviteRow,
} from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function ipOf(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
}

/** What a successful claim unlocks: the app links plus the FULL report (every fix). */
function links(code: string, invite: InviteRow) {
  const site = siteBase();
  return {
    openUrl: openInAppUrlFor(code),
    downloads: { windows: `${site}/dl/win`, macAppleSilicon: `${site}/dl/mac`, macIntel: `${site}/dl/mac-intel` },
    fixes: invite.score && Array.isArray(invite.score.fixes) ? invite.score.fixes : [],
  };
}

export async function POST(request: Request) {
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isValidInviteCode(code)) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });

  const ipLimit = await rateLimit(`invite-claim:ip:${ipOf(request)}`, 20, 3600);
  const codeLimit = await rateLimit(`invite-claim:code:${code}`, 10, 3600);
  if (!ipLimit.allowed || !codeLimit.allowed) {
    return NextResponse.json({ error: "Too many tries. Please wait a little and try again." }, { status: 429 });
  }

  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Please try again in a few minutes." }, { status: 503 });
  const { data } = await db.from("foyer_invites").select(INVITE_LIST_COLUMNS).eq("code", code).maybeSingle();
  const invite = data as unknown as InviteRow | null;
  if (!invite) return NextResponse.json({ error: "We could not find that invite." }, { status: 404 });
  if (invite.status === "declined" || invite.status === "removed") {
    return NextResponse.json({ error: "This invite was closed. Reply to Liz's email if you would like it back." }, { status: 410 });
  }
  if (isExpired(invite)) {
    return NextResponse.json(
      { error: "This preview has expired. Reply to Liz's email and she will happily reopen it." },
      { status: 410 },
    );
  }

  // Already claimed: hand back the same key (or the existing-customer path).
  if (invite.claimed_at) {
    return NextResponse.json({
      ok: true,
      key: invite.license_key,
      existingCustomer: invite.existing_customer,
      email: invite.email,
      ...links(code, invite),
    });
  }

  const issued = await issueInHouseComp({
    email: invite.email,
    name: invite.first_name || null,
    months: null,
    days: INVITE_COMP_DAYS,
    plan: INVITE_COMP_PLAN,
    kind: "invite",
  });

  if (!issued.ok && issued.status === 409) {
    // They already have a live plan: keep it, and let the app pull the page
    // with their own key (redeem matches the key's owner email to the invite).
    await advanceInvite(db, invite, "claimed", { existing_customer: true });
    await cancelInviteEnrollment(db, invite.email);
    return NextResponse.json({ ok: true, key: null, existingCustomer: true, email: invite.email, ...links(code, invite) });
  }
  if (!issued.ok) {
    console.error("invites/claim: comp issue failed", { code, status: issued.status, error: issued.error });
    return NextResponse.json({ error: "Something went wrong on our side. Please try again in a minute." }, { status: 500 });
  }

  await advanceInvite(db, invite, "claimed", { license_key: issued.key, claim_user_id: issued.userId });
  await cancelInviteEnrollment(db, invite.email);
  return NextResponse.json({
    ok: true,
    key: issued.key,
    existingCustomer: false,
    email: invite.email,
    expiresAt: issued.expiresAt,
    ...links(code, invite),
  });
}
