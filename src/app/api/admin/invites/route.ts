/**
 * /api/admin/invites: the invite-only "done-for-you Foyer page" pilot.
 *
 *   GET    list invites (no page blobs) + funnel counts, optional ?batch=
 *   POST   upload one researched invite from scripts/outreach/upload-invite.js
 *          (Bearer = Liz's admin license key, or a signed-in admin session).
 *          Upserts by email while still a draft; refuses once it has been sent.
 *          With enroll:true, enrolls the creator in the PAUSED cold invite
 *          sequence (nothing is emailed until Liz activates that sequence).
 *   PATCH  {id, action}: "decline" (stop + suppress), "note" (save notes),
 *          "enroll" (enroll a drafted invite), "unenroll".
 *
 * Gated on licenses.view, the same permission as the Comps page.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { enrollEmails } from "@/lib/email-marketing";
import { recordSuppression } from "@/lib/email-unsubscribe";
import {
  INVITE_LIST_COLUMNS,
  INVITE_SEQUENCE_ID,
  INVITE_STATUSES,
  advanceInvite,
  cancelInviteEnrollment,
  inviteDb,
  newInviteCode,
  previewUrlFor,
  type InviteRow,
} from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const MAX_HTML = 400_000;
const EM_DASH = "—";

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function GET(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });
  const batch = new URL(request.url).searchParams.get("batch");
  let q = db.from("foyer_invites").select(INVITE_LIST_COLUMNS).order("created_at", { ascending: false }).limit(1000);
  if (batch) q = q.eq("batch", batch);
  const { data, error } = await q;
  if (error) {
    const missing = /foyer_invites/.test(String((error as { message?: string }).message ?? ""));
    return NextResponse.json(
      { error: missing ? "Run 20261111_foyer_invites.sql in Supabase first." : "Lookup failed", migrationPending: missing },
      { status: missing ? 200 : 500 },
    );
  }
  const rows = (data ?? []) as unknown as InviteRow[];

  // Which step of the invite drip each address has had.
  const steps = new Map<string, { last: number; cancelled: boolean }>();
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200).map((r) => r.email);
    const { data: enr } = await db
      .from("email_sequence_enrollments")
      .select("email, last_step_sent, cancelled_at")
      .eq("sequence_id", INVITE_SEQUENCE_ID)
      .in("email", slice);
    for (const e of (enr ?? []) as { email: string; last_step_sent: number; cancelled_at: string | null }[]) {
      steps.set(e.email, { last: e.last_step_sent ?? 0, cancelled: Boolean(e.cancelled_at) });
    }
  }

  const funnel: Record<string, number> = Object.fromEntries(INVITE_STATUSES.map((s) => [s, 0]));
  for (const r of rows) funnel[r.status] = (funnel[r.status] ?? 0) + 1;
  const batches = Array.from(new Set(rows.map((r) => r.batch).filter(Boolean))).sort();

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      previewUrl: previewUrlFor(r.code),
      enrolled: steps.has(r.email),
      lastStepSent: steps.get(r.email)?.last ?? 0,
      enrollmentCancelled: steps.get(r.email)?.cancelled ?? false,
    })),
    funnel,
    batches,
  });
}

export async function POST(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = str(body.email, 200).toLowerCase();
  const handle = str(body.igHandle, 30).toLowerCase().replace(/^@/, "");
  const opener = str(body.opener, 600);
  const previewHtml = typeof body.previewHtml === "string" ? body.previewHtml : "";
  const pageDoc = body.pageDoc && typeof body.pageDoc === "object" ? body.pageDoc : null;
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "Invalid igHandle" }, { status: 400 });
  if (opener.length < 60) return NextResponse.json({ error: "Opener too short" }, { status: 400 });
  if (opener.includes(EM_DASH)) return NextResponse.json({ error: "Opener contains an em-dash" }, { status: 400 });
  if (!pageDoc) return NextResponse.json({ error: "pageDoc required" }, { status: 400 });
  if (!previewHtml || previewHtml.length > MAX_HTML) {
    return NextResponse.json({ error: "previewHtml missing or too large" }, { status: 400 });
  }

  const fields = {
    ig_handle: handle,
    email,
    first_name: str(body.firstName, 60),
    niche: str(body.niche, 80),
    followers: Number.isFinite(Number(body.followers)) ? Math.round(Number(body.followers)) : null,
    opener,
    batch: str(body.batch, 40),
    source: str(body.source, 40) || "ig-research",
    evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 10).map((e) => String(e).slice(0, 300)) : [],
    page_doc: pageDoc,
    preview_html: previewHtml,
    launch_answers: body.launchAnswers && typeof body.launchAnswers === "object" ? body.launchAnswers : {},
    updated_at: new Date().toISOString(),
  };

  const existing = await db.from("foyer_invites").select("id, code, status").eq("email", email).maybeSingle();
  if (existing.error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  let id: string;
  let code: string;
  if (existing.data) {
    const row = existing.data as { id: string; code: string; status: string };
    if (row.status !== "drafted") {
      return NextResponse.json(
        { error: `This creator was already contacted (status ${row.status}). Never contact anyone twice.` },
        { status: 409 },
      );
    }
    const { error } = await db.from("foyer_invites").update(fields).eq("id", row.id);
    if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
    id = row.id;
    code = row.code;
  } else {
    code = newInviteCode();
    const { data, error } = await db
      .from("foyer_invites")
      .insert({ ...fields, code, created_by: actor.email ?? "" })
      .select("id")
      .single();
    if (error || !data) return NextResponse.json({ error: "Insert failed" }, { status: 500 });
    id = (data as { id: string }).id;
  }

  let enrolled = false;
  if (body.enroll === true) {
    const result = await enrollEmails(db, INVITE_SEQUENCE_ID, [email]);
    enrolled = result.inserted + result.reactivated > 0 || result.skipped > 0;
  }

  return NextResponse.json({ ok: true, id, code, previewUrl: previewUrlFor(code), enrolled });
}

export async function PATCH(request: Request) {
  const actor = await requirePermission("licenses.view", request);
  if (!actor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const db = inviteDb();
  if (!db) return NextResponse.json({ error: "Server misconfigured" }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const id = str(body.id, 60);
  const action = str(body.action, 20);
  const found = await db.from("foyer_invites").select("id, email, status").eq("id", id).maybeSingle();
  if (found.error || !found.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const row = found.data as { id: string; email: string; status: InviteRow["status"] };

  if (action === "note") {
    const { error } = await db
      .from("foyer_invites")
      .update({ notes: str(body.notes, 2000), updated_at: new Date().toISOString() })
      .eq("id", id);
    return error ? NextResponse.json({ error: "Save failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (action === "decline") {
    await cancelInviteEnrollment(db, row.email);
    await recordSuppression(row.email, "manual");
    const { error } = await db
      .from("foyer_invites")
      .update({ status: "declined", declined_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", id);
    return error ? NextResponse.json({ error: "Save failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (action === "enroll") {
    if (row.status !== "drafted") return NextResponse.json({ error: "Only a drafted invite can be enrolled" }, { status: 409 });
    const result = await enrollEmails(db, INVITE_SEQUENCE_ID, [row.email]);
    return NextResponse.json({ ok: true, ...result });
  }
  if (action === "unenroll") {
    await cancelInviteEnrollment(db, row.email);
    return NextResponse.json({ ok: true });
  }
  if (action === "converted") {
    await advanceInvite(db, row, "converted");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
