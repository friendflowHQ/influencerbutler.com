/**
 * Server-side proxy to the feedback Worker's bearer-gated /agent/* routes
 * (workers/feedback in the InfluencerButler repo). The SUPPORT_BOT_TOKEN bearer
 * lives ONLY here in server env — it never reaches the browser. The admin
 * Support dashboard calls same-origin /api/admin/support/* routes, which call
 * this. Mirrors the "client -> /api/admin -> upstream" pattern used elsewhere.
 */

const DEFAULT_WORKER_URL = "https://feedback.influencerbutler.com";

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
  type: "bug" | "feature";
  title: string;
  description: string;
  userEmail?: string;
  platform?: string;
  appVersion?: string;
  tags?: string;
}): Promise<{ ok: boolean; id: string | null }> {
  const title = (input.title || "").trim().slice(0, 200);
  if (!title) return { ok: false, id: null };
  const description = (input.description || "").trim().slice(0, 7000);

  const headers: Record<string, string> = { "content-type": "application/json" };
  const sharedKey = process.env.FEEDBACK_SHARED_KEY;
  if (sharedKey) headers["x-ib-key"] = sharedKey;

  try {
    const res = await fetch(`${workerBaseUrl()}/submit`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        type: input.type === "feature" ? "feature" : "bug",
        title,
        description,
        userEmail: input.userEmail || "",
        appVersion: input.appVersion || "",
        platform: input.platform || "call-notes",
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
