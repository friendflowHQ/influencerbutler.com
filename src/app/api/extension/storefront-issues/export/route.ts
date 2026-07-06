/**
 * GET /api/extension/storefront-issues/export - downloads the signed-in user's
 * storefront checkup issues (untagged videos, over-tagged, unavailable
 * products) as a CSV report. Session cookie or Bearer license key, so a plain
 * <a href download> from the dashboard works.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isMissingTableError, jsonWithCors, optionsResponse } from "@/lib/extension-api";

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

function csvCell(value: string | null): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

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
  const header = "issue_type,severity,subject,detail,storefront_url,detected_at";
  const body = rows
    .map((r) =>
      [
        r.issue_type,
        r.severity,
        csvCell(r.subject),
        csvCell(r.detail),
        csvCell(r.storefront_url),
        r.detected_at,
      ].join(","),
    )
    .join("\n");
  const csv = `${header}\n${body}\n`;

  const today = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="storefront-checkup-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
