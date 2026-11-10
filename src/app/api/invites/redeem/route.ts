/**
 * /api/invites/redeem: the desktop app's side of a claimed invite.
 *
 *   GET ?code=<code>, no Authorization (the influencerbutler://claim deep link
 *       on a fresh install). The code is the same capability the claim page
 *       uses, so it returns what that page shows: the comp license key, plus the
 *       draft Foyer page and Launch Butler answers. Only for a claimed invite.
 *   GET [?code=<code>]  Authorization: Bearer <license key>  (signed-in app, or
 *       the paste-key path with no code). Returns the page for the invite whose
 *       email matches the key owner's account email. Never returns a key: the
 *       app keeps the license it already has.
 *   Both mark the invite "activated".
 *   POST {event:"published", url?}  Bearer auth. Marks the invite "published".
 */
import { NextResponse } from "next/server";
import { resolveLicenseOnly } from "@/lib/license-auth";
import { rateLimit } from "@/lib/rate-limit";
import { advanceInvite, inviteDb, isValidInviteCode } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLAIMED = ["claimed", "activated", "published", "converted"];

type RedeemRow = {
  id: string;
  code: string;
  email: string;
  ig_handle: string;
  status: "drafted" | "sent" | "viewed" | "claimed" | "activated" | "published" | "converted" | "declined";
  license_key: string | null;
  page_doc: unknown;
  launch_answers: unknown;
};

const COLUMNS = "id, code, email, ig_handle, status, license_key, page_doc, launch_answers";

function notFound() {
  return NextResponse.json({ error: "No claimed invite for this account" }, { status: 404 });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("code");
  const code = raw && isValidInviteCode(raw) ? raw : null;
  if (raw && !code) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const hasBearer = /^bearer\s+\S/i.test(request.headers.get("authorization") || "");
  let row: RedeemRow | null = null;
  let includeKey = false;

  if (hasBearer) {
    const auth = await resolveLicenseOnly(request);
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const email = (auth.auth.email ?? "").trim().toLowerCase();
    if (email) {
      let q = db.from("foyer_invites").select(COLUMNS).eq("email", email);
      if (code) q = q.eq("code", code);
      row = ((await q.maybeSingle()).data as RedeemRow | null) ?? null;
    }
    // Signed in under a different email than the invite went to: the code
    // still proves the invite, so hand over the page (but never a key).
    if (!row && code) {
      row = ((await db.from("foyer_invites").select(COLUMNS).eq("code", code).maybeSingle()).data as RedeemRow | null) ?? null;
    }
  } else {
    if (!code) return NextResponse.json({ error: "License or invite code required" }, { status: 401 });
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limited = await rateLimit(`invite-redeem:ip:${ip}`, 30, 3600);
    if (!limited.allowed) return NextResponse.json({ error: "Too many tries" }, { status: 429 });
    row = ((await db.from("foyer_invites").select(COLUMNS).eq("code", code).maybeSingle()).data as RedeemRow | null) ?? null;
    includeKey = true;
  }

  if (!row || !CLAIMED.includes(row.status)) return notFound();
  await advanceInvite(db, row, "activated");
  return NextResponse.json({
    ok: true,
    igHandle: row.ig_handle,
    licenseKey: includeKey ? row.license_key : null,
    pageDoc: row.page_doc,
    launchAnswers: row.launch_answers,
  });
}

export async function POST(request: Request) {
  let event = "";
  let url = "";
  try {
    const body = (await request.json()) as { event?: unknown; url?: unknown };
    event = typeof body.event === "string" ? body.event : "";
    url = typeof body.url === "string" ? body.url.slice(0, 300) : "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (event !== "published") return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const email = (auth.auth.email ?? "").trim().toLowerCase();
  const db = inviteDb();
  if (!db || !email) return notFound();
  const row = (await db.from("foyer_invites").select("id, status").eq("email", email).maybeSingle()).data as
    | { id: string; status: RedeemRow["status"] }
    | null;
  if (!row || !CLAIMED.includes(row.status)) return notFound();
  // The URL is logged, not stored: notes belong to Liz and are never overwritten.
  if (url) console.log("invites/redeem: published", { invite: row.id, url });
  await advanceInvite(db, row, "published");
  return NextResponse.json({ ok: true });
}
