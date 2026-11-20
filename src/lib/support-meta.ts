/**
 * Human-side support data kept in Supabase next to the feedback Worker's
 * tickets: internal notes, assignee, and the bot drafts the auto-reply sweep
 * wrote but did not send. Keyed by the Worker's ticket id ("fb-...").
 *
 * Every helper is best-effort and reports `pending: true` when the tables do
 * not exist yet (migration 20261121 is hand-applied), so the dashboard and the
 * sweep keep working before it runs.
 */
import { createAdminClient } from "@/lib/admin";

export type TicketNote = { id: string; authorEmail: string; body: string; createdAt: string };

export type DraftStatus = "pending" | "sent" | "edited_sent" | "rejected" | "superseded";

export type BotDraft = {
  id: string;
  ticketId: string;
  title: string;
  customerEmail: string;
  priority: string;
  subject: string;
  body: string;
  confidence: number | null;
  grounded: boolean;
  classification: string;
  reason: string;
  status: DraftStatus;
  createdAt: string;
};

export type TicketMeta = { assignee: string; noteCount: number; draftId: string | null };

/** Drafts older than this are treated as stale and hidden from the review tab. */
export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const MAX_NOTE_LEN = 4000;

/* eslint-disable @typescript-eslint/no-explicit-any */
type Db = any;

function db(): Db | null {
  return createAdminClient() as unknown as Db | null;
}

/** True for "table does not exist yet" errors from PostgREST / Postgres. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = err.code || "";
  const msg = (err.message || "").toLowerCase();
  return code === "42P01" || code === "PGRST205" || msg.includes("does not exist") || msg.includes("schema cache");
}

/** Assignee, note count and pending-draft id for a page of tickets, in 3 queries. */
export async function getTicketMeta(
  ids: string[],
): Promise<{ meta: Record<string, TicketMeta>; pending: boolean }> {
  const meta: Record<string, TicketMeta> = {};
  const client = db();
  if (!client || ids.length === 0) return { meta, pending: false };
  let pending = false;
  const ensure = (id: string) => (meta[id] ??= { assignee: "", noteCount: 0, draftId: null });
  const since = new Date(Date.now() - DRAFT_TTL_MS).toISOString();

  const [assign, notes, drafts] = await Promise.all([
    client.from("support_ticket_assignments").select("ticket_id, assignee_email").in("ticket_id", ids),
    client.from("support_ticket_notes").select("ticket_id").in("ticket_id", ids),
    client
      .from("support_bot_drafts")
      .select("id, ticket_id")
      .in("ticket_id", ids)
      .eq("status", "pending")
      .gte("created_at", since),
  ]);
  for (const r of [assign, notes, drafts]) if (r.error && isMissingTable(r.error)) pending = true;

  for (const row of (assign.data ?? []) as { ticket_id: string; assignee_email: string }[]) {
    ensure(row.ticket_id).assignee = row.assignee_email;
  }
  for (const row of (notes.data ?? []) as { ticket_id: string }[]) ensure(row.ticket_id).noteCount += 1;
  for (const row of (drafts.data ?? []) as { id: string; ticket_id: string }[]) ensure(row.ticket_id).draftId = row.id;
  return { meta, pending };
}

export async function listNotes(ticketId: string): Promise<{ notes: TicketNote[]; pending: boolean }> {
  const client = db();
  if (!client) return { notes: [], pending: false };
  const { data, error } = await client
    .from("support_ticket_notes")
    .select("id, author_email, body, created_at")
    .eq("ticket_id", ticketId)
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) return { notes: [], pending: isMissingTable(error) };
  return {
    notes: ((data ?? []) as { id: string; author_email: string; body: string; created_at: string }[]).map((r) => ({
      id: r.id,
      authorEmail: r.author_email,
      body: r.body,
      createdAt: r.created_at,
    })),
    pending: false,
  };
}

export async function addNote(
  ticketId: string,
  authorEmail: string,
  body: string,
): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
  const text = body.trim().slice(0, MAX_NOTE_LEN);
  if (!text) return { ok: false, error: "Note is empty" };
  const client = db();
  if (!client) return { ok: false, error: "Database not configured" };
  const { error } = await client
    .from("support_ticket_notes")
    .insert({ ticket_id: ticketId, author_email: authorEmail, body: text });
  if (error) return { ok: false, pending: isMissingTable(error), error: error.message };
  return { ok: true };
}

/** Set (or, with an empty email, clear) the ticket's assignee. */
export async function setAssignee(
  ticketId: string,
  assigneeEmail: string,
  assignedBy: string,
): Promise<{ ok: boolean; pending?: boolean; error?: string }> {
  const client = db();
  if (!client) return { ok: false, error: "Database not configured" };
  const email = assigneeEmail.trim().toLowerCase();
  const res = email
    ? await client.from("support_ticket_assignments").upsert(
        { ticket_id: ticketId, assignee_email: email, assigned_by: assignedBy, assigned_at: new Date().toISOString() },
        { onConflict: "ticket_id" },
      )
    : await client.from("support_ticket_assignments").delete().eq("ticket_id", ticketId);
  if (res.error) return { ok: false, pending: isMissingTable(res.error), error: res.error.message };
  return { ok: true };
}

export type DraftInput = {
  ticketId: string;
  title: string;
  customerEmail: string;
  priority: string;
  subject: string;
  body: string;
  confidence: number;
  grounded: boolean;
  classification: string;
  reason: string;
};

/**
 * Store a sweep draft for review. A ticket keeps at most one pending draft: an
 * older pending one is marked superseded so the review tab never shows two for
 * the same ticket. Best-effort (the sweep must never fail on this).
 */
export async function saveBotDraft(input: DraftInput): Promise<void> {
  try {
    const client = db();
    if (!client) return;
    const { error: supersedeErr } = await client
      .from("support_bot_drafts")
      .update({ status: "superseded", resolved_at: new Date().toISOString() })
      .eq("ticket_id", input.ticketId)
      .eq("status", "pending");
    if (supersedeErr) {
      if (!isMissingTable(supersedeErr)) console.error("[support-meta] supersede failed", supersedeErr.message);
      return;
    }
    const { error } = await client.from("support_bot_drafts").insert({
      ticket_id: input.ticketId,
      title: input.title.slice(0, 200),
      customer_email: input.customerEmail,
      priority: input.priority,
      subject: input.subject.slice(0, 200),
      body: input.body.slice(0, 32000),
      confidence: input.confidence,
      grounded: input.grounded,
      classification: input.classification,
      reason: input.reason.slice(0, 500),
    });
    if (error) console.error("[support-meta] save draft failed", error.message);
  } catch (e) {
    console.error("[support-meta] save draft threw", e);
  }
}

function rowToDraft(r: Record<string, unknown>): BotDraft {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id),
    title: String(r.title ?? ""),
    customerEmail: String(r.customer_email ?? ""),
    priority: String(r.priority ?? ""),
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    confidence: typeof r.confidence === "number" ? r.confidence : r.confidence != null ? Number(r.confidence) : null,
    grounded: !!r.grounded,
    classification: String(r.classification ?? ""),
    reason: String(r.reason ?? ""),
    status: String(r.status ?? "pending") as DraftStatus,
    createdAt: String(r.created_at ?? ""),
  };
}

export async function listPendingDrafts(limit = 100): Promise<{ drafts: BotDraft[]; pending: boolean }> {
  const client = db();
  if (!client) return { drafts: [], pending: false };
  const since = new Date(Date.now() - DRAFT_TTL_MS).toISOString();
  const { data, error } = await client
    .from("support_bot_drafts")
    .select("*")
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return { drafts: [], pending: isMissingTable(error) };
  return { drafts: ((data ?? []) as Record<string, unknown>[]).map(rowToDraft), pending: false };
}

export async function getPendingDraftForTicket(ticketId: string): Promise<BotDraft | null> {
  const client = db();
  if (!client) return null;
  const since = new Date(Date.now() - DRAFT_TTL_MS).toISOString();
  const { data, error } = await client
    .from("support_bot_drafts")
    .select("*")
    .eq("ticket_id", ticketId)
    .eq("status", "pending")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return rowToDraft(data[0] as Record<string, unknown>);
}

/** Close out a pending draft: it was sent (as is or edited) or rejected. */
export async function resolveDraft(
  id: string,
  outcome: "sent" | "edited_sent" | "rejected",
  resolvedBy: string,
  rejectReason?: string,
): Promise<{ ok: boolean; error?: string }> {
  const client = db();
  if (!client) return { ok: false, error: "Database not configured" };
  const { error } = await client
    .from("support_bot_drafts")
    .update({
      status: outcome,
      resolved_by: resolvedBy,
      resolved_at: new Date().toISOString(),
      reject_reason: rejectReason ? rejectReason.slice(0, 500) : null,
    })
    .eq("id", id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
