/**
 * GET /api/extension/known-issues - proxies the Chrome extension's "known
 * issues" chat-bubble view to the feedback Worker's public, anonymous
 * `GET /known-issues?scope=extension` route (workers/feedback in the
 * InfluencerButler repo). No auth required to READ; `scope` is hardcoded to
 * "extension" here regardless of what the caller sends, so the extension can
 * only ever see extension-scoped (+ "both") issues, never the desktop list.
 */
import { callFeedbackWorkerPublic } from "@/lib/support-worker";
import { cleanString, jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Q_MAX = 120;

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query: Record<string, string> = { scope: "extension" };
  const q = cleanString(searchParams.get("q"), Q_MAX);
  if (q) query.q = q;
  // GET /known-issues takes a precomputed `voterHash` to report
  // `viewerHasVoted`, not a Bearer. We don't have that hash here, so a
  // freshly-loaded list always starts unvoted and the panel updates a card
  // to "voted" locally the moment its own upvote call succeeds.

  const result = await callFeedbackWorkerPublic<{ issues: unknown[] }>("/known-issues", { query });
  if (!result.ok) return jsonWithCors({ ok: false, error: result.error }, result.status);
  return jsonWithCors({ ok: true, issues: result.data.issues ?? [] });
}
