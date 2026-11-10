/**
 * /api/invites/redeem: the desktop app's side of a claimed invite.
 *
 *   GET  ?code=<code> (optional)  Authorization: Bearer <license key>
 *        Returns the draft Foyer page + Launch Butler answers for the invite
 *        that belongs to the key's owner. The key is the proof: the invite's
 *        email must match the key owner's account email, so a forwarded preview
 *        link can never hand someone else's page to a stranger's install.
 *        Without ?code (the paste-key path) the owner's claimed invite is used.
 *        Marks the invite "activated".
 *   POST {event:"published", url?}  same auth. Marks the invite "published".
 */
import { NextResponse } from "next/server";
import { resolveLicenseOnly } from "@/lib/license-auth";
import { advanceInvite, inviteDb, isValidInviteCode } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RedeemRow = {
  id: string;
  code: string;
  email: string;
  ig_handle: string;
  status: "drafted" | "sent" | "viewed" | "claimed" | "activated" | "published" | "converted" | "declined";
  page_doc: unknown;
  launch_answers: unknown;
};

async function findInvite(request: Request, code: string | null) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return { error: NextResponse.json({ error: auth.error }, { status: auth.status }) };
  const email = (auth.auth.email ?? "").trim().toLowerCase();
  if (!email) return { error: NextResponse.json({ error: "No account email for this key" }, { status: 404 }) };
  const db = inviteDb();
  if (!db) return { error: NextResponse.json({ error: "Server misconfigured" }, { status: 503 }) };
  let q = db
    .from("foyer_invites")
    .select("id, code, email, ig_handle, status, page_doc, launch_answers")
    .eq("email", email);
  if (code) q = q.eq("code", code);
  const { data } = await q.maybeSingle();
  const row = data as RedeemRow | null;
  if (!row || row.status === "declined" || !["claimed", "activated", "published", "converted"].includes(row.status)) {
    return { error: NextResponse.json({ error: "No claimed invite for this account" }, { status: 404 }) };
  }
  return { db, row };
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("code");
  const code = raw && isValidInviteCode(raw) ? raw : null;
  if (raw && !code) return NextResponse.json({ error: "Invalid invite" }, { status: 400 });
  const found = await findInvite(request, code);
  if ("error" in found) return found.error;
  await advanceInvite(found.db, found.row, "activated");
  return NextResponse.json({
    ok: true,
    igHandle: found.row.ig_handle,
    pageDoc: found.row.page_doc,
    launchAnswers: found.row.launch_answers,
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
  const found = await findInvite(request, null);
  if ("error" in found) return found.error;
  // The URL is logged, not stored: notes belong to Liz and are never overwritten.
  if (url) console.log("invites/redeem: published", { invite: found.row.id, url });
  await advanceInvite(found.db, found.row, "published");
  return NextResponse.json({ ok: true });
}
