/**
 * /api/extension/storefront-issues - storefront checkup snapshots from the
 * Chrome extension (untagged videos, over-tagging, dead tagged products).
 *
 * POST (extension, Bearer license key): replace-on-scan. A checkup is a
 * snapshot, so previous rows for that storefront_url are deleted before the
 * new batch is inserted. An empty issues array is valid: it means the last
 * checkup came back clean.
 * GET (dashboard or extension): the latest snapshot rows.
 */
import { resolveAuth, resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  EXT_DETAIL_MAX,
  EXT_MAX_BATCH,
  EXT_TITLE_MAX,
  cleanString,
  clampInt,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
  parseTimestamp,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ISSUE_TYPES = new Set(["untagged", "over_tagged", "unavailable_product"]);
const SEVERITIES = new Set(["info", "warn", "error"]);

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
  const parsed = body as { storefront_url?: unknown; issues?: unknown };
  const issues = parsed.issues;
  if (!Array.isArray(issues) || issues.length > EXT_MAX_BATCH) {
    return jsonWithCors({ error: `issues must be an array of 0-${EXT_MAX_BATCH}` }, 400);
  }
  const storefrontUrl = cleanString(parsed.storefront_url, 300);

  const rows = [];
  for (const raw of issues) {
    const issue = raw as Record<string, unknown>;
    const issueType = typeof issue.issue_type === "string" ? issue.issue_type : "";
    const severity = typeof issue.severity === "string" ? issue.severity : "warn";
    const detectedAt = parseTimestamp(issue.detected_at);
    if (!ISSUE_TYPES.has(issueType) || !detectedAt) continue;
    rows.push({
      user_id: auth.auth.userId,
      storefront_url: storefrontUrl,
      issue_type: issueType,
      severity: SEVERITIES.has(severity) ? severity : "warn",
      subject: cleanString(issue.subject, EXT_TITLE_MAX),
      detail: cleanString(issue.detail, EXT_DETAIL_MAX),
      detected_at: detectedAt,
    });
  }

  const admin = createAdminClient();

  // Replace-on-scan: clear the previous snapshot for this storefront (or the
  // user's whole set when no URL was sent), then insert the new state.
  let deletion = admin
    .from("extension_storefront_issues")
    .delete()
    .eq("user_id", auth.auth.userId);
  if (storefrontUrl) deletion = deletion.eq("storefront_url", storefrontUrl);
  const { error: deleteError } = await deletion;
  if (deleteError) {
    if (isMissingTableError(deleteError)) return migrationPendingResponse();
    console.error("extension/storefront-issues: delete failed", deleteError);
    return jsonWithCors({ error: "Could not save issues" }, 500);
  }

  if (rows.length > 0) {
    const { error: insertError } = await admin
      .from("extension_storefront_issues")
      .insert(rows);
    if (insertError) {
      if (isMissingTableError(insertError)) return migrationPendingResponse();
      console.error("extension/storefront-issues: insert failed", insertError);
      return jsonWithCors({ error: "Could not save issues" }, 500);
    }
  }

  return jsonWithCors({ ok: true, count: rows.length });
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const url = new URL(request.url);
  const limit = clampInt(Number(url.searchParams.get("limit") ?? 100), 1, 500) ?? 100;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_storefront_issues")
    .select("storefront_url, issue_type, severity, subject, detail, detected_at")
    .eq("user_id", auth.auth.userId)
    .order("detected_at", { ascending: false })
    .limit(limit);
  if (error) {
    if (isMissingTableError(error)) return migrationPendingResponse();
    console.error("extension/storefront-issues: list failed", error);
    return jsonWithCors({ error: "Could not load issues" }, 500);
  }

  return jsonWithCors({ ok: true, issues: data ?? [] });
}
