/**
 * GET /api/extension/storefront-issues/export - downloads the signed-in user's
 * storefront checkup issues (untagged videos, over-tagged, unavailable
 * products) as a CSV report. Session cookie or Bearer license key, so a plain
 * <a href download> from the dashboard works.
 */
import { resolveAuth } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError, jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { csvResponse, toCsv } from "@/lib/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IssueRow = {
  issue_type: string;
  severity: string;
  subject: string | null;
  detail: string | null;
  storefront_url: string | null;
  detected_at: string;
};

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  const auth = await resolveAuth(request);
  if (!auth.ok) return jsonWithCors({ error: auth.error }, auth.status);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_storefront_issues")
    .select("issue_type, severity, subject, detail, storefront_url, detected_at")
    .eq("user_id", auth.auth.userId)
    .order("detected_at", { ascending: false })
    .limit(5000);

  if (error) {
    if (isMissingTableError(error)) return jsonWithCors({ migrationPending: true }, 200);
    console.error("extension/storefront-issues/export: read failed", error);
    return jsonWithCors({ error: "Could not load issues" }, 500);
  }

  const rows = (data ?? []) as IssueRow[];
  const csv = toCsv(
    ["issue_type", "severity", "subject", "detail", "storefront_url", "detected_at"],
    rows.map((r) => [r.issue_type, r.severity, r.subject, r.detail, r.storefront_url, r.detected_at]),
  );

  const today = new Date().toISOString().slice(0, 10);
  return csvResponse(csv, `storefront-checkup-${today}.csv`);
}
