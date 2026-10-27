/**
 * POST /api/extension/known-issues/:id/logs - proxies the extension's
 * one-click "I'm seeing this too, send my logs" action to the feedback
 * Worker's `POST /known-issues/:id/logs`. The Worker hard-gates this on the
 * issue's needsLogs flag and does no server-side redaction, so the body
 * passed through here must already be the extension's own pre-redacted
 * diagnostic text (collectLogs() in extension/src/background/feedback.ts):
 * this route is a pure pass-through, not a generic upload endpoint.
 */
import { isKnownIssueId, callFeedbackWorkerPublic } from "@/lib/support-worker";
import { cleanString, jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_TEXT_MAX = 2 * 1024 * 1024; // mirrors the Worker's own MAX_LOG_BYTES

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isKnownIssueId(id)) return jsonWithCors({ ok: false, error: "Invalid id" }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ ok: false, error: "Invalid JSON" }, 400);
  }
  const input = body as Record<string, unknown>;
  const logText = cleanString(input.logText, LOG_TEXT_MAX);
  if (!logText) return jsonWithCors({ ok: false, error: "No log content" }, 400);

  const headers: Record<string, string> = {};
  const authorization = request.headers.get("authorization");
  const voterId = request.headers.get("x-ib-voter-id");
  if (authorization) headers.authorization = authorization;
  if (voterId) headers["x-ib-voter-id"] = voterId;

  const result = await callFeedbackWorkerPublic<{ ticketAdvanced: boolean }>(
    `/known-issues/${encodeURIComponent(id)}/logs`,
    {
      method: "POST",
      headers,
      body: {
        source: "extension",
        logText,
        appVersion: cleanString(input.appVersion, 20) || "",
        platform: cleanString(input.platform, 40) || "",
        ...(cleanString(input.ticketId, 64) ? { ticketId: cleanString(input.ticketId, 64) } : {}),
      },
    },
  );
  if (!result.ok) return jsonWithCors({ ok: false, error: result.error }, result.status);
  return jsonWithCors({ ok: true, ticketAdvanced: !!result.data.ticketAdvanced });
}
