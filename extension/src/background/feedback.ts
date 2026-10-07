import { ENDPOINTS } from "../shared/constants";
import { getState } from "../storage/store";
import { collectBridgeDiagnostics } from "./bridge-diagnostics";
import type {
  FeedbackInput,
  FeedbackResult,
  RichFeedbackInput,
  RichFeedbackResult,
  MyFeedbackItem,
  MyFeedbackListResult,
  ArchiveFeedbackResult,
  FeedbackThread,
  FeedbackThreadReply,
  FeedbackThreadsResult,
  PostReplyResult,
  MarkThreadReadResult,
} from "../shared/messages";

// Sends a single feedback submission to the site. Attaches the license key as
// a Bearer token when the user has connected one, so signed-in feedback is
// attributed; anonymous feedback is fully supported (the endpoint allows it).

// The reported version is read from the running manifest rather than a source
// constant, so it can never drift from the build the user actually has.
export function extensionVersion(): string {
  return chrome.runtime.getManifest().version;
}

export async function sendFeedback(input: FeedbackInput): Promise<FeedbackResult> {
  const message = input.message?.trim() ?? "";
  if (message.length < 3) return { ok: false, error: "Please write a bit more." };

  const state = await getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.auth.licenseKey) headers.Authorization = `Bearer ${state.auth.licenseKey}`;

  try {
    const response = await fetch(ENDPOINTS.feedback, {
      method: "POST",
      headers,
      body: JSON.stringify({
        feedback_type: input.feedbackType,
        message,
        page_url: input.pageUrl ?? null,
        ext_version: extensionVersion(),
        browser: "chrome",
      }),
    });
    if (!response.ok) {
      return { ok: false, error: "Could not send right now. Try again in a minute." };
    }
    const data = (await response.json().catch(() => ({}))) as { migrationPending?: boolean };
    if (data.migrationPending) {
      return { ok: false, error: "Feedback is being set up. Please try again soon." };
    }
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }
}

// ---- Rich feedback (the chat bubble's Report view) --------------------------

// Local "My reports" store: the bubble's history tab reads this so it works even
// when the user is anonymous (the server has no id to key on then). Kept in its
// own chrome.storage.local key (no schema bump), capped, newest-first.
const MY_FEEDBACK_KEY = "ib-my-feedback";
const MY_FEEDBACK_CAP = 50;

async function readLocalFeedback(): Promise<MyFeedbackItem[]> {
  try {
    const got = await chrome.storage.local.get(MY_FEEDBACK_KEY);
    const rows = got?.[MY_FEEDBACK_KEY];
    return Array.isArray(rows) ? (rows as MyFeedbackItem[]) : [];
  } catch {
    return [];
  }
}

async function writeLocalFeedback(rows: MyFeedbackItem[]): Promise<void> {
  try {
    await chrome.storage.local.set({ [MY_FEEDBACK_KEY]: rows.slice(0, MY_FEEDBACK_CAP) });
  } catch {
    /* storage full / unavailable: the report still sent, only history is best-effort */
  }
}

export async function listLocalFeedback(): Promise<MyFeedbackListResult> {
  const rows = await readLocalFeedback();
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return { ok: true, submissions: rows };
}

// Hide a submission from the default "Active" view without discarding it
// (unlike the old dismiss, which deleted the row outright). Idempotent --
// archiving an already-archived row is a no-op success.
export async function archiveLocalFeedback(id: string): Promise<ArchiveFeedbackResult> {
  if (!id) return { ok: false, error: "Missing id" };
  const rows = await readLocalFeedback();
  const idx = rows.findIndex((r) => r.id === id);
  const row = idx === -1 ? null : rows[idx];
  if (idx === -1 || !row) return { ok: false, error: "Not found" };
  if (!row.archived) {
    rows[idx] = { ...row, archived: true };
    await writeLocalFeedback(rows);
  }
  return { ok: true };
}

// Restore a submission archived via `archiveLocalFeedback` back to the
// "Active" view.
export async function unarchiveLocalFeedback(id: string): Promise<ArchiveFeedbackResult> {
  if (!id) return { ok: false, error: "Missing id" };
  const rows = await readLocalFeedback();
  const idx = rows.findIndex((r) => r.id === id);
  const row = idx === -1 ? null : rows[idx];
  if (idx === -1 || !row) return { ok: false, error: "Not found" };
  if (row.archived) {
    rows[idx] = { ...row, archived: false };
    await writeLocalFeedback(rows);
  }
  return { ok: true };
}

// ---- Support-reply threads (read the answer + reply in-app) -----------------

// Per-thread "last seen reply id" so the extension can compute unread without a
// server-side read flag (the D1 read state is desktop-local). Its own key.
const THREADS_SEEN_KEY = "ib-feedback-threads-seen";

async function readSeen(): Promise<Record<string, number | string>> {
  try {
    const got = await chrome.storage.local.get(THREADS_SEEN_KEY);
    const rec = got?.[THREADS_SEEN_KEY];
    return rec && typeof rec === "object" ? (rec as Record<string, number | string>) : {};
  } catch {
    return {};
  }
}

async function writeSeen(seen: Record<string, number | string>): Promise<void> {
  try {
    await chrome.storage.local.set({ [THREADS_SEEN_KEY]: seen });
  } catch {
    /* best-effort: unread just recomputes next fetch */
  }
}

function newestOutboundId(thread: FeedbackThread): number | string | null {
  let best: number | string | null = null;
  let bestSent = -1;
  for (const r of thread.replies || []) {
    if (r.direction !== "outbound") continue;
    const sent = Number(r.sentAt) || 0;
    if (sent >= bestSent) { bestSent = sent; best = r.id; }
  }
  return best;
}

// The signed-in user's answered support threads, with an `unread` flag computed
// against the local seen-store. Returns an empty list when signed out or on any
// error (the bubble simply shows no conversations).
export async function listFeedbackThreads(): Promise<FeedbackThreadsResult> {
  const state = await getState();
  if (!state.auth.licenseKey) return { ok: true, threads: [], unread: 0 };
  let threads: FeedbackThread[] = [];
  try {
    const response = await fetch(ENDPOINTS.feedbackReplies, {
      headers: { Authorization: `Bearer ${state.auth.licenseKey}` },
    });
    if (!response.ok) return { ok: true, threads: [], unread: 0 };
    const data = (await response.json().catch(() => ({}))) as { threads?: unknown };
    threads = Array.isArray(data.threads) ? (data.threads as FeedbackThread[]) : [];
  } catch {
    return { ok: true, threads: [], unread: 0 };
  }
  const seen = await readSeen();
  let unread = 0;
  for (const t of threads) {
    const newest = newestOutboundId(t);
    t.unread = newest != null && seen[t.id] !== newest;
    if (t.unread) unread += 1;
  }
  return { ok: true, threads, unread };
}

// Mark a thread read: remember its newest outbound reply id so it no longer
// counts as unread.
export async function markFeedbackThreadRead(ticketId: string): Promise<MarkThreadReadResult> {
  if (!ticketId) return { ok: false };
  const { threads } = await listFeedbackThreads();
  const thread = threads.find((t) => t.id === ticketId);
  if (thread) {
    const newest = newestOutboundId(thread);
    if (newest != null) {
      const seen = await readSeen();
      seen[ticketId] = newest;
      await writeSeen(seen);
    }
  }
  const after = await listFeedbackThreads();
  return { ok: true, unread: after.unread };
}

// Post the user's reply to one of their own tickets, then mark the thread read.
export async function postFeedbackReply(ticketId: string, body: string): Promise<PostReplyResult> {
  const id = (ticketId || "").trim();
  const text = (body || "").trim();
  if (!id) return { ok: false, error: "Missing ticket id" };
  if (!text) return { ok: false, error: "Reply is empty" };
  const state = await getState();
  if (!state.auth.licenseKey) return { ok: false, error: "Sign in to reply to support." };
  try {
    const response = await fetch(`${ENDPOINTS.feedbackReplies}/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${state.auth.licenseKey}` },
      body: JSON.stringify({ body: text }),
    });
    const data = (await response.json().catch(() => ({}))) as { ok?: boolean; reply?: FeedbackThreadReply; error?: string };
    if (!response.ok || !data.ok) {
      return { ok: false, error: data.error || "Could not send right now. Try again in a minute." };
    }
    await markFeedbackThreadRead(id);
    return { ok: true, reply: data.reply ?? null };
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }
}

// A compact, redaction-friendly diagnostic blob. Version, page, environment,
// plus a live probe of the desktop bridge (ports, pairing token, auth result).
async function collectLogs(pageUrl?: string): Promise<string> {
  const lines = [
    "== Extension ==",
    `Version: ${extensionVersion()}`,
    `Browser: chrome`,
    `User agent: ${typeof navigator !== "undefined" ? navigator.userAgent : "?"}`,
    `Page: ${pageUrl || "(unknown)"}`,
    `Captured at: ${new Date().toISOString()}`,
  ];
  let bridge = "";
  try {
    bridge = await collectBridgeDiagnostics();
  } catch {
    bridge = "== Desktop connection ==\n(diagnostics unavailable)";
  }
  return `${lines.join("\n")}\n\n${bridge}`;
}

export async function submitFeedbackRich(input: RichFeedbackInput): Promise<RichFeedbackResult> {
  const title = (input.title || "").trim();
  if (!title) return { ok: false, error: "Please enter a title." };
  const description = (input.description || "").trim();

  const state = await getState();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.auth.licenseKey) headers.Authorization = `Bearer ${state.auth.licenseKey}`;

  const screenshots = Array.isArray(input.screenshots) ? input.screenshots.slice(0, 6) : [];
  const body = {
    feedback_type: input.type,
    title,
    // The server requires a non-empty message; fall back to the title when the
    // user left the description blank.
    message: description || title,
    user_email: (input.userEmail || "").trim() || null,
    page_url: input.pageUrl ?? null,
    ext_version: extensionVersion(),
    browser: "chrome",
    screenshots,
    logs: input.attachLogs === false ? null : await collectLogs(input.pageUrl),
  };

  let serverId: string | null = null;
  try {
    const response = await fetch(ENDPOINTS.feedback, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      return { ok: false, error: "Could not send right now. Try again in a minute." };
    }
    const data = (await response.json().catch(() => ({}))) as {
      migrationPending?: boolean;
      id?: string;
    };
    if (data.migrationPending) {
      return { ok: false, error: "Feedback is being set up. Please try again soon." };
    }
    serverId = typeof data.id === "string" && data.id ? data.id : null;
  } catch {
    return { ok: false, error: "Network error. Are you online?" };
  }

  // Record locally for the "My reports" list (best-effort; never fails the send).
  const id = serverId || `fb-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
  const rows = await readLocalFeedback();
  rows.unshift({
    id,
    type: input.type,
    title,
    status: "sent",
    createdAt: new Date().toISOString(),
    attachmentCount: screenshots.length,
  });
  await writeLocalFeedback(rows);

  return { ok: true, id };
}
