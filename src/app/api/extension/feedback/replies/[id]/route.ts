/**
 * POST /api/extension/feedback/replies/[id] - the user's reply back to one of
 * their own support tickets, from the extension's chat bubble. Forwards the
 * caller's Bearer license key to the feedback Worker's per-user
 * POST /replies/:id, which verifies ownership (license hash OR verified email),
 * stores an inbound reply, and flips the ticket to user_replied. The in-app
 * equivalent of replying to the support email.
 *
 * Auth: a valid Bearer license key is required (there is no anonymous reply).
 * CORS follows the other /api/extension/* routes.
 */
import { callFeedbackWorkerAsUser } from "@/lib/support-worker";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FB_ID_RE = /^fb-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BODY_LEN = 8000;

type RouteContext = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request, context: RouteContext) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+.+/i.test(authorization)) {
    return jsonWithCors({ ok: false, error: "Sign in to reply to support" }, 401);
  }

  const { id } = await context.params;
  if (!id || !FB_ID_RE.test(id)) {
    return jsonWithCors({ ok: false, error: "Invalid id" }, 400);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ ok: false, error: "Invalid JSON" }, 400);
  }
  const text = typeof (body as { body?: unknown })?.body === "string"
    ? (body as { body: string }).body.trim().slice(0, MAX_BODY_LEN)
    : "";
  if (!text) return jsonWithCors({ ok: false, error: "Reply is empty" }, 400);

  const result = await callFeedbackWorkerAsUser<{ reply?: unknown; ticketId?: string }>(
    `/replies/${encodeURIComponent(id)}`,
    authorization,
    { method: "POST", body: { body: text } },
  );
  if (!result.ok) {
    return jsonWithCors({ ok: false, error: result.error }, result.status);
  }
  return jsonWithCors({ ok: true, ticketId: result.data.ticketId ?? id, reply: result.data.reply ?? null });
}
