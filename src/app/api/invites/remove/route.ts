/**
 * POST /api/invites/remove  { code }
 *
 * The "Remove my page" button on a private Storefront Score page. Deletes the
 * page content and score immediately, stops every email, and adds the address
 * to the do-not-contact list permanently (the admin upload API then refuses
 * that email for good). The handle + email row is kept only as the
 * do-not-contact record. Idempotent.
 */
import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { recordSuppression } from "@/lib/email-unsubscribe";
import { CLEARED_CONTENT, cancelInviteEnrollment, inviteDb, isValidInviteCode } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let code = "";
  try {
    const body = (await request.json()) as { code?: unknown };
    code = typeof body.code === "string" ? body.code.trim() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!isValidInviteCode(code)) return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await rateLimit(`invite-remove:ip:${ip}`, 20, 3600);
  if (!limited.allowed) return NextResponse.json({ error: "Too many tries. Please try again shortly." }, { status: 429 });

  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Please try again in a few minutes." }, { status: 503 });
  const { data } = await db.from("foyer_invites").select("id, email, status").eq("code", code).maybeSingle();
  const row = data as { id: string; email: string; status: string } | null;
  if (!row) return NextResponse.json({ ok: true });

  const now = new Date().toISOString();
  await cancelInviteEnrollment(db, row.email);
  await recordSuppression(row.email, "manual");
  const { error } = await db
    .from("foyer_invites")
    .update({ ...CLEARED_CONTENT, status: "removed", removed_at: now, content_deleted_at: now, updated_at: now })
    .eq("id", row.id);
  if (error) {
    console.error("invites/remove: update failed", error);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
