/**
 * /api/extension/accepts - Creator Connections campaign accepts reported by the
 * extension. A campaign accept happens entirely in the browser (the extension
 * clicks Amazon's own Accept button in a background tab), so unlike deals or
 * scans it never otherwise reaches our backend. This endpoint records how many
 * accepts happened, keyed by source (auto vs manual), into the metric-generic
 * client_action_events feed that powers the public "proof of numbers" counter.
 *
 * We store aggregate counts, not per-campaign detail: one row per (source)
 * carrying the accept count for this batch. POST only, Bearer license key.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXT_MAX_BATCH,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAMPAIGN_ID_RE = /^amzn1\.campaign\.[A-Za-z0-9]+$/;

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }
  const accepts = (body as { accepts?: unknown })?.accepts;
  if (!Array.isArray(accepts) || accepts.length === 0 || accepts.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `accepts must be an array of 1-${EXT_MAX_BATCH}` }, 400);
  }

  // Tally valid accepts by source. A malformed campaign id is skipped rather
  // than failing the batch (the count is best-effort social proof, not a ledger).
  let autoCount = 0;
  let manualCount = 0;
  for (const raw of accepts) {
    const item = raw as Record<string, unknown>;
    const campaignId = typeof item.campaignId === "string" ? item.campaignId : "";
    if (!CAMPAIGN_ID_RE.test(campaignId)) continue;
    if (item.source === "auto") autoCount += 1;
    else manualCount += 1;
  }
  if (autoCount === 0 && manualCount === 0) {
    return jsonWithCors({ error: "No valid accepts in batch" }, 400);
  }

  const rows: Array<Record<string, unknown>> = [];
  if (autoCount > 0) {
    rows.push({
      metric: "campaign_accepted",
      source: "auto",
      user_id: auth.auth.userId,
      count: autoCount,
    });
  }
  if (manualCount > 0) {
    rows.push({
      metric: "campaign_accepted",
      source: "manual",
      user_id: auth.auth.userId,
      count: manualCount,
    });
  }

  const admin = createAdminClient();
  const { error } = await admin.from("client_action_events").insert(rows);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/accepts: insert failed", error);
    return jsonWithCors({ error: "Could not save accepts" }, 500);
  }

  return jsonWithCors({ ok: true, recorded: autoCount + manualCount });
}
