/**
 * GET /api/extension/feedback/replies?since=<cursor> - the read side of in-app
 * support replies for the Chrome extension. Returns the signed-in user's own
 * support-ticket threads that support has answered, so the extension's chat
 * bubble can show the conversation and let the user reply back.
 *
 * Backend: new extension feedback is filed into the same feedback Worker (D1)
 * the desktop app uses, so this forwards the caller's Bearer license key to the
 * Worker's per-user GET /replies (the Worker matches ownership by license hash
 * OR verified email). Older extension tickets live in Supabase; their replies
 * are folded in here too (see foldSupabaseThreads).
 *
 * Auth: a valid Bearer license key. Anonymous callers get an empty list (there
 * is no identity to key threads on), never an error. CORS follows the other
 * /api/extension/* routes.
 */
import { callFeedbackWorkerAsUser } from "@/lib/support-worker";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+.+/i.test(authorization)) {
    return jsonWithCors({ ok: true, threads: [], cursor: 0 });
  }

  const url = new URL(request.url);
  const since = (url.searchParams.get("since") || "").trim();
  const q = /^\d+$/.test(since) ? `?since=${encodeURIComponent(since)}` : "";

  const result = await callFeedbackWorkerAsUser<{ threads?: unknown[]; cursor?: number }>(
    `/replies${q}`,
    authorization,
  );
  if (!result.ok) {
    // A bad/expired license (401) is not an error the extension should surface;
    // degrade to an empty list. Other failures pass their status through.
    if (result.status === 401) return jsonWithCors({ ok: true, threads: [], cursor: 0 });
    return jsonWithCors({ ok: false, error: result.error }, result.status);
  }

  const threads = Array.isArray(result.data.threads) ? result.data.threads : [];
  const cursor = Number(result.data.cursor) || 0;
  return jsonWithCors({ ok: true, threads, cursor });
}
