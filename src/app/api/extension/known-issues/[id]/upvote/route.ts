/**
 * POST /api/extension/known-issues/:id/upvote - proxies to the feedback
 * Worker's `POST /known-issues/:id/upvote`. Forwards whichever identity the
 * caller presents (a Bearer license/trial key, or the extension's own
 * `x-ib-voter-id` anonymous id header, chrome.storage.local-backed) and
 * lets the Worker 401 if neither is present. This route never requires auth
 * itself; the Worker is the one that decides.
 */
import { isKnownIssueId, callFeedbackWorkerPublic } from "@/lib/support-worker";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isKnownIssueId(id)) return jsonWithCors({ ok: false, error: "Invalid id" }, 400);

  const headers: Record<string, string> = {};
  const authorization = request.headers.get("authorization");
  const voterId = request.headers.get("x-ib-voter-id");
  if (authorization) headers.authorization = authorization;
  if (voterId) headers["x-ib-voter-id"] = voterId;

  const result = await callFeedbackWorkerPublic<{ alreadyVoted: boolean; upvoteCount: number }>(
    `/known-issues/${encodeURIComponent(id)}/upvote`,
    { method: "POST", headers },
  );
  if (!result.ok) return jsonWithCors({ ok: false, error: result.error }, result.status);
  return jsonWithCors({ ok: true, alreadyVoted: result.data.alreadyVoted, upvoteCount: result.data.upvoteCount });
}
