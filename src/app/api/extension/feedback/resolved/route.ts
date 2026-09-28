/**
 * GET /api/extension/feedback/resolved?since=<version> - the read side of the
 * Feedback Butler. Returns the signed-in user's own bug reports that have since
 * been marked resolved, so the extension's post-update "What's New" notice can
 * show "issues you reported that we fixed".
 *
 * Auth: a valid Bearer license key is required to attribute reports to a user.
 * Anonymous callers get an empty list (there is no identifier to key on), never
 * an error, so the notice still shows its changelog highlights.
 *
 * `since` bounds the result to fixes shipped after that version (the version
 * whose notes the user last saw). Missing/invalid `since` returns everything
 * resolved. CORS + the migrationPending soft-fail follow the other
 * /api/extension/* routes.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cleanString,
  isMissingColumnError,
  isMissingTableError,
  jsonWithCors,
  migrationPendingResponse,
  optionsResponse,
} from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Newest first, capped: the notice only shows the top few anyway.
const MAX_ROWS = 20;
const SUMMARY_MAX = 300;

// Numeric dotted compare, matching the extension's compareVersions: missing
// segments count as 0, so "1.0" equals "1.0.0". Returns <0, 0, >0.
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const pb = b.split(".").map((part) => Number.parseInt(part, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function OPTIONS() {
  return optionsResponse();
}

export async function GET(request: Request) {
  // Anonymous or bad license: no identity to key resolved reports on, so return
  // an empty list rather than an error. The notice still shows changelog notes.
  const auth = await resolveLicenseOnly(request);
  if (!auth.ok) return jsonWithCors({ bugs: [] });

  const url = new URL(request.url);
  const since = cleanString(url.searchParams.get("since"), 20);

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("extension_feedback")
    .select("id, message, resolution_note, resolved_version, resolved_at")
    .eq("user_id", auth.auth.userId)
    .eq("status", "resolved")
    .not("resolved_version", "is", null)
    .order("resolved_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    // Table or the new resolution columns not applied yet: soft-fail so the
    // notice degrades to changelog-only rather than erroring.
    if (isMissingTableError(error) || isMissingColumnError(error)) {
      return migrationPendingResponse();
    }
    console.error("extension/feedback/resolved: query failed", error);
    return jsonWithCors({ error: "Could not load resolved feedback" }, 500);
  }

  const bugs = (data ?? [])
    .filter((row) => {
      const version = row.resolved_version as string | null;
      if (!version) return false;
      // Only fixes shipped after the version whose notes the user last saw.
      return !since || compareVersions(version, since) > 0;
    })
    .map((row) => ({
      id: String(row.id),
      summary: (
        (row.resolution_note as string | null) ||
        (row.message as string | null) ||
        ""
      ).slice(0, SUMMARY_MAX),
      resolvedVersion: row.resolved_version as string,
    }))
    .filter((bug) => bug.summary.length > 0);

  return jsonWithCors({ bugs });
}
