/**
 * /api/admin/invites: the invite-only Storefront Score page pilot.
 *
 *   GET    list invites (no page blobs), funnel counts, the day-14 report
 *          (emailed, delivered, opened, visited, claim clicked, claimed, trial
 *          started, converted) and per-row delivery, optional ?batch=
 *   POST   upload one invite from scripts/outreach/upload-invite.js (Bearer =
 *          Liz's admin license key, or a signed-in admin session): the score,
 *          the 4 written emails, the draft page. Refuses the do-not-contact
 *          list, existing customers and trial users, and anyone already
 *          contacted (by email or handle). With enroll:true, enrolls the
 *          creator in the PAUSED cold sequence.
 *   PATCH  {id, action}: "decline" (stop + suppress), "replied" (stop), "note",
 *          "enroll" (a drafted invite), "unenroll", "converted".
 *
 * Gated on licenses.view, the same permission as the Comps page.
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { enrollEmails, stepCategory } from "@/lib/email-marketing";
import { isEmailSuppressed, recordSuppression } from "@/lib/email-unsubscribe";
import {
  INVITE_LIST_COLUMNS,
  INVITE_SEQUENCE_ID,
  INVITE_STATUSES,
  INVITE_STEP_COUNT,
  advanceInvite,
  cancelInviteEnrollment,
  inviteDb,
  isExistingCustomer,
  newInviteCode,
  normalizeEmailSteps,
  previewUrlFor,
  type InviteRow,
} from "@/lib/foyer-invites";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const HANDLE_RE = /^[a-z0-9._]{1,30}$/;
const MAX_HTML = 400_000;
const EM_DASH = "\u2014";

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

  // Delivered / opened per address, from the tracked sends of the invite steps.
  const categories = Array.from({ length: INVITE_STEP_COUNT }, (_, i) => stepCategory(INVITE_SEQUENCE_ID, i + 1));
  const sends = new Map<string, { sent: number; delivered: boolean; opened: boolean; bounced: boolean }>();
  for (let i = 0; i < rows.length; i += 200) {
    const slice = rows.slice(i, i + 200).map((r) => r.email);
    const { data: sendRows } = await db
      .from("email_sends")
      .select("recipient, status, delivered_at, opened_at, bounced_at")
      .in("category", categories)
      .in("recipient", slice)
      .limit(5000);
    for (const s of (sendRows ?? []) as {
      recipient: string;
      status: string;
      delivered_at: string | null;
      opened_at: string | null;
      bounced_at: string | null;
    }[]) {
      const cur = sends.get(s.recipient) ?? { sent: 0, delivered: false, opened: false, bounced: false };
      if (s.status === "sent") cur.sent += 1;
      cur.delivered = cur.delivered || Boolean(s.delivered_at);
      cur.opened = cur.opened || Boolean(s.opened_at);
      cur.bounced = cur.bounced || Boolean(s.bounced_at);
      sends.set(s.recipient, cur);
    }
  }

  const funnel: Record<string, number> = Object.fromEntries(INVITE_STATUSES.map((s) => [s, 0]));
  for (const r of rows) funnel[r.status] = (funnel[r.status] ?? 0) + 1;
  const batches = Array.from(new Set(rows.map((r) => r.batch).filter(Boolean))).sort();

  // Day-14 report stages from the pilot brief.
  const emailed = rows.filter((r) => sends.get(r.email)?.sent);
  const count = (pred: (r: InviteRow) => boolean) => emailed.filter(pred).length;
  const report = {
    emailed: emailed.length,
    delivered: count((r) => Boolean(sends.get(r.email)?.delivered)),
    opened: count((r) => Boolean(sends.get(r.email)?.opened)),
    visited: count((r) => r.view_count > 0),
    claimClicked: count((r) => Boolean(r.claim_clicked_at)),
    claimed: count((r) => Boolean(r.claimed_at)),
    trialStarted: count((r) => Boolean(r.activated_at)),
    converted: count((r) => Boolean(r.converted_at)),
    replied: count((r) => Boolean(r.replied_at)),
    removed: count((r) => Boolean(r.removed_at)),
  };

  return NextResponse.json({
    rows: rows.map((r) => ({
      ...r,
      previewUrl: previewUrlFor(r.code),
      enrolled: steps.has(r.email),
      lastStepSent: steps.get(r.email)?.last ?? 0,
      enrollmentCancelled: steps.get(r.email)?.cancelled ?? false,
      delivered: sends.get(r.email)?.delivered ?? false,
      opened: sends.get(r.email)?.opened ?? false,
      bounced: sends.get(r.email)?.bounced ?? false,
    })),
    funnel,
    report,
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
  const emailSteps = normalizeEmailSteps(body.emailSteps);
  const score = body.score && typeof body.score === "object" ? (body.score as Record<string, unknown>) : null;
  const storefrontUrl = str(body.storefrontUrl, 300);
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  if (!HANDLE_RE.test(handle)) return NextResponse.json({ error: "Invalid igHandle" }, { status: 400 });
  if (opener.includes(EM_DASH)) return NextResponse.json({ error: "Opener contains an em-dash" }, { status: 400 });
  if (!emailSteps || emailSteps.length < 4) {
    return NextResponse.json({ error: "emailSteps must hold the 4 written emails (no em-dashes)" }, { status: 400 });
  }
  if (!emailSteps.every((s) => s.body.includes("{{INVITE_PREVIEW_URL}}"))) {
    return NextResponse.json({ error: "Every email needs the {{INVITE_PREVIEW_URL}} link" }, { status: 400 });
  }
  if (!score || !Number.isInteger(score.score) || !Array.isArray(score.fixes)) {
    return NextResponse.json({ error: "score (the Storefront Score) is required" }, { status: 400 });
  }
  if (!/^https:\/\/www\.amazon\.[a-z.]+\/shop\//i.test(storefrontUrl)) {
    return NextResponse.json({ error: "storefrontUrl must be the public Amazon storefront" }, { status: 400 });
  }
  if (!pageDoc) return NextResponse.json({ error: "pageDoc required" }, { status: 400 });
  if (!previewHtml || previewHtml.length > MAX_HTML) {
    return NextResponse.json({ error: "previewHtml missing or too large" }, { status: 400 });
  }

  // Exclusions from the pilot brief, enforced server-side too.
  if (await isEmailSuppressed(email)) {
    return NextResponse.json({ error: "This email is on the do-not-contact list." }, { status: 409 });
  }
  if (await isExistingCustomer(db, email)) {
    return NextResponse.json({ error: "This email is already a customer or on a trial." }, { status: 409 });
  }

  const fields = {
    ig_handle: handle,
    email,
    first_name: str(body.firstName, 60),
    niche: str(body.niche, 80),
    followers: Number.isFinite(Number(body.followers)) ? Math.round(Number(body.followers)) : null,
    opener,
    batch: str(body.batch, 40),
    source: str(body.source, 40) || "ig-hashtag",
    evidence: Array.isArray(body.evidence) ? body.evidence.slice(0, 10).map((e) => String(e).slice(0, 300)) : [],
    page_doc: pageDoc,
    preview_html: previewHtml,
    launch_answers: body.launchAnswers && typeof body.launchAnswers === "object" ? body.launchAnswers : {},
    email_steps: emailSteps,
    score,
    storefront_url: storefrontUrl,
    updated_at: new Date().toISOString(),
  };

  // Handle check too: one creator can have several emails, and is contacted once.
  const byHandle = await db.from("foyer_invites").select("id, email, status").eq("ig_handle", handle).limit(5);
  const otherRow = ((byHandle.data ?? []) as { email: string; status: string }[]).find((r) => r.email !== email);
  if (otherRow) {
    return NextResponse.json({ error: `@${handle} was already added with another email. Never contact anyone twice.` }, { status: 409 });
  }

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
  if (action === "replied") {
    // A reply stops the drip (Liz answers by hand from her inbox).
    await cancelInviteEnrollment(db, row.email);
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { replied_at: now, updated_at: now };
    if (["drafted", "sent", "viewed"].includes(row.status)) patch.status = "replied";
    const { error } = await db.from("foyer_invites").update(patch).eq("id", id);
    return error ? NextResponse.json({ error: "Save failed" }, { status: 500 }) : NextResponse.json({ ok: true });
  }
  if (action === "converted") {
    await advanceInvite(db, row, "converted");
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
