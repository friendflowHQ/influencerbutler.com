/**
 * Server-side proxy to the feedback Worker's bearer-gated /agent/* routes
 * (workers/feedback in the InfluencerButler repo). The SUPPORT_BOT_TOKEN bearer
 * lives ONLY here in server env — it never reaches the browser. The admin
 * Support dashboard calls same-origin /api/admin/support/* routes, which call
 * this. Mirrors the "client -> /api/admin -> upstream" pattern used elsewhere.
 */

const DEFAULT_WORKER_URL = "https://feedback.influencerbutler.com";

/**
 * Ticket ids the admin Support routes accept: app/website reports are
 * `fb-<uuid>`; tickets the feedback Worker files from TestFlight feedback are
 * `tf-crash-<appleId>` / `tf-screenshot-<appleId>`. Mirrors the Worker's own
 * TICKET_ID_RE (workers/feedback/src/routes/agent.js) so a TestFlight escalation
 * email's "Open ticket" link opens the ticket instead of a 400.
 */
const FB_TICKET_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TF_TICKET_ID_RE = /^tf-(?:crash|screenshot)-[A-Za-z0-9_-]{1,100}$/;
// Mirrors the Worker's own KI_ID_RE (workers/feedback/src/routes/knownIssues.js).
const KI_ID_RE = /^ki-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSupportTicketId(id: unknown): id is string {
  return typeof id === "string" && (FB_TICKET_ID_RE.test(id) || TF_TICKET_ID_RE.test(id));
}

export function isKnownIssueId(id: unknown): id is string {
  return typeof id === "string" && KI_ID_RE.test(id);
}

export type SupportWorkerResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string };

function workerBaseUrl(): string {
  return (process.env.FEEDBACK_WORKER_URL || DEFAULT_WORKER_URL).replace(/\/+$/, "");
}

/** True when the server has the bearer configured. Routes 500 if not. */
export function isSupportWorkerConfigured(): boolean {
  return !!process.env.SUPPORT_BOT_TOKEN;
}

/**
 * Call an /agent/* path on the feedback Worker with the bot bearer.
 * `path` must start with "/agent". Returns a normalized result the route
 * handlers translate into NextResponse.
 */
export async function callSupportWorker<T = unknown>(
  path: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<SupportWorkerResult<T>> {
  const token = process.env.SUPPORT_BOT_TOKEN;
  if (!token) {
    return { ok: false, status: 500, error: "SUPPORT_BOT_TOKEN not configured" };
  }
  const method = init?.method || "GET";
  const url = `${workerBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = { authorization: `Bearer ${token}` };
  if (init?.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    console.error("callSupportWorker fetch failed", err);
    return { ok: false, status: 502, error: "Support worker unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && typeof payload === "object" && (payload as { ok?: boolean }).ok === false)) {
    const error =
      (payload && typeof payload === "object" && (payload as { error?: string }).error) ||
      `Worker HTTP ${res.status}`;
    return { ok: false, status: res.ok ? 502 : res.status, error: String(error) };
  }

  return { ok: true, status: res.status, data: (payload ?? {}) as T };
}

/**
 * Proxy a PER-USER feedback-Worker call, forwarding the caller's OWN Bearer
 * license key (not the bot token). Used by the extension-facing /replies routes:
 * the Worker verifies the license itself and matches ticket ownership by
 * hash/email, so the site is a thin authenticated pass-through. `authorization`
 * is the incoming request's Authorization header (already "Bearer <key>").
 */
export async function callFeedbackWorkerAsUser<T = unknown>(
  path: string,
  authorization: string,
  init?: { method?: "GET" | "POST"; body?: unknown },
): Promise<SupportWorkerResult<T>> {
  const method = init?.method || "GET";
  const url = `${workerBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  const headers: Record<string, string> = {};
  if (authorization) headers.authorization = authorization;
  if (init?.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    console.error("callFeedbackWorkerAsUser fetch failed", err);
    return { ok: false, status: 502, error: "Support worker unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && typeof payload === "object" && (payload as { ok?: boolean }).ok === false)) {
    const error =
      (payload && typeof payload === "object" && (payload as { error?: string }).error) ||
      `Worker HTTP ${res.status}`;
    return { ok: false, status: res.ok ? 502 : res.status, error: String(error) };
  }

  return { ok: true, status: res.status, data: (payload ?? {}) as T };
}

/**
 * Proxy a call to the feedback Worker's PUBLIC `/known-issues` routes (no bot
 * token, no required auth: matches the Worker's own anonymous-GET /
 * either-bearer-or-voter-id-write design, see
 * workers/feedback/src/routes/knownIssues.js). Forwards an arbitrary header
 * set as-is (the extension's `/api/extension/known-issues/*` routes decide
 * whether to forward `authorization` or `x-ib-voter-id`), plus an optional
 * query string for GET. Used instead of callFeedbackWorkerAsUser because that
 * helper only ever forwards `authorization`.
 */
export async function callFeedbackWorkerPublic<T = unknown>(
  path: string,
  init?: { method?: "GET" | "POST"; headers?: Record<string, string>; body?: unknown; query?: Record<string, string> },
): Promise<SupportWorkerResult<T>> {
  const method = init?.method || "GET";
  let url = `${workerBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  if (init?.query) {
    const qs = new URLSearchParams(init.query).toString();
    if (qs) url += `?${qs}`;
  }
  const headers: Record<string, string> = { ...(init?.headers || {}) };
  if (init?.body !== undefined) headers["content-type"] = "application/json";

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch (err) {
    console.error("callFeedbackWorkerPublic fetch failed", err);
    return { ok: false, status: 502, error: "Support worker unreachable" };
  }

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || (payload && typeof payload === "object" && (payload as { ok?: boolean }).ok === false)) {
    const error =
      (payload && typeof payload === "object" && (payload as { error?: string }).error) ||
      `Worker HTTP ${res.status}`;
    return { ok: false, status: res.ok ? 502 : res.status, error: String(error) };
  }

  return { ok: true, status: res.status, data: (payload ?? {}) as T };
}

/**
 * Fetch a binary /agent/* path (e.g. an attachment stream) with the bot bearer
 * and return the raw upstream Response so the caller can pipe the body through.
 * Returns null when the bearer is unconfigured or the fetch fails at transport
 * level (the caller maps that to a 500 / 502). Unlike callSupportWorker this
 * does NOT parse JSON - it is for streaming stored attachment bytes.
 */
export async function fetchSupportWorkerRaw(path: string): Promise<Response | null> {
  const token = process.env.SUPPORT_BOT_TOKEN;
  if (!token) return null;
  const url = `${workerBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
  try {
    return await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    });
  } catch (err) {
    console.error("fetchSupportWorkerRaw fetch failed", err);
    return null;
  }
}

/**
 * File a new ticket into the feedback worker's public intake (`POST /submit`).
 * This is the SAME path the desktop Feedback panel and the Butler AI chat use
 * (see submitFeedback in ai-concierge/agent.ts). Unlike the /agent/* proxy above
 * this is unauthenticated except for the optional x-ib-key shared secret, which
 * the worker only enforces when it has FEEDBACK_SHARED_KEY set (today it does
 * not), so we send it only when the env var exists.
 *
 * Returns { ok, id } where id is the "fb-<uuid>" ticket id on success. Never
 * throws: callers (auto-filing from a finished call) treat filing as best-effort.
 */
export async function submitSupportTicket(input: {
  type: "bug" | "feature" | "question";
  title: string;
  description: string;
  userEmail?: string;
  platform?: string;
  appVersion?: string;
  tags?: string;
  /** Optional diagnostics text (ASCII-safe), stored as the ticket's log tail. */
  logs?: string;
}): Promise<{ ok: boolean; id: string | null }> {
  const title = (input.title || "").trim().slice(0, 200);
  if (!title) return { ok: false, id: null };
  const description = (input.description || "").trim().slice(0, 7000);

  const headers: Record<string, string> = { "content-type": "application/json" };
  const sharedKey = process.env.FEEDBACK_SHARED_KEY;
  if (sharedKey) headers["x-ib-key"] = sharedKey;

  const type = input.type === "feature" ? "feature" : input.type === "question" ? "question" : "bug";
  try {
    const res = await fetch(`${workerBaseUrl()}/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type,
        title,
        description,
        userEmail: input.userEmail || "",
        appVersion: input.appVersion || "",
        platform: input.platform || "call-notes",
        // The worker stores this as the ticket's logTail so support can read it.
        ...(input.logs ? { logsBase64: Buffer.from(input.logs.slice(0, 60_000), "latin1").toString("base64") } : {}),
        // The worker sets tags via triage, not /submit; it ignores an unknown
        // field, so this is a best-effort hint only (provenance also lives in
        // the description). Harmless if dropped upstream.
        ...(input.tags ? { tags: input.tags } : {}),
        submittedAt: new Date().toISOString(),
      }),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; id?: string } | null;
    if (!res.ok || !json?.ok) {
      console.error("submitSupportTicket failed", res.status, json);
      return { ok: false, id: null };
    }
    return { ok: true, id: json.id ?? null };
  } catch (err) {
    console.error("submitSupportTicket threw", err);
    return { ok: false, id: null };
  }
}
