/**
 * GET /api/cron/invite-cleanup (daily, CRON_SECRET)
 *
 * Deletes the content of unclaimed Storefront Score pages 90 days after the
 * first email (the pilot brief's retention rule) and stops their drip. The row
 * stays as a record that this creator was contacted, so nobody is ever
 * contacted twice. Claimed pages are never touched.
 */
import { NextResponse } from "next/server";
import { verifyBearer } from "@/lib/auth-secret";
import { CLEARED_CONTENT, DRIP_STATUSES, cancelInviteEnrollment, inviteDb } from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  const nowIso = new Date().toISOString();
  const { data, error } = await db
    .from("foyer_invites")
    .select("id, email, status, expires_at, content_deleted_at")
    .lte("expires_at", nowIso)
    .is("content_deleted_at", null)
    .limit(500);
  if (error) {
    const missing = /foyer_invites|content_deleted_at/.test(String((error as { message?: string }).message ?? ""));
    return NextResponse.json({ ok: true, skipped: missing ? "migration-pending" : "query-failed" });
  }
  // Statuses that stop the drip but never claimed (replied stays unclaimed too).
  const unclaimed = new Set<string>([...DRIP_STATUSES, "replied", "declined"]);
  let deleted = 0;
  for (const row of (data ?? []) as { id: string; email: string; status: string }[]) {
    if (!unclaimed.has(row.status)) continue;
    await cancelInviteEnrollment(db, row.email);
    const { error: upErr } = await db
      .from("foyer_invites")
      .update({ ...CLEARED_CONTENT, content_deleted_at: nowIso, updated_at: nowIso })
      .eq("id", row.id);
    if (!upErr) deleted += 1;
  }
  return NextResponse.json({ ok: true, deleted });
}
