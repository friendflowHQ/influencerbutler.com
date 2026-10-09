/**
 * GET /api/cron/process-account-deletions
 *
 * Daily (see vercel.json). Executes every account-deletion request whose grace
 * period has ended (see src/lib/account-deletion.ts). Gated on CRON_SECRET like
 * the other crons. Add ?dry=1 to list what is due without deleting anything.
 *
 * Outcomes per request:
 *   deleted / retired : done, completion email sent
 *   blocked           : they re-subscribed (or became staff) during the grace
 *                       window; the request is cancelled and they are told
 *   failed            : an erase step errored; left pending and retried next run
 *                       (up to MAX_ATTEMPTS, then it is only logged)
 */
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyBearer } from "@/lib/auth-secret";
import {
  MAX_ATTEMPTS,
  cancelDeletion,
  executeDeletion,
  listDueDeletions,
  recordFailedAttempt,
} from "@/lib/account-deletion";
import { sendDeletionCanceledEmail, sendDeletionCompletedEmail } from "@/lib/account-deletion-email";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  if (!verifyBearer(request, "CRON_SECRET")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dry = new URL(request.url).searchParams.get("dry") === "1";
  const admin = createAdminClient();
  const due = await listDueDeletions(admin);

  if (dry) {
    return NextResponse.json({ dry: true, due: due.map((d) => ({ scheduledFor: d.scheduledFor, attempts: d.attempts })) });
  }

  const summary = { deleted: 0, retired: 0, blocked: 0, failed: 0, skipped: 0 };

  for (const req of due) {
    if (req.attempts >= MAX_ATTEMPTS) {
      summary.skipped++;
      console.error("process-account-deletions: giving up after max attempts", {
        userId: req.userId,
        lastError: req.lastError,
      });
      continue;
    }

    try {
      const result = await executeDeletion(admin, req.userId);
      if (result.outcome === "deleted" || result.outcome === "retired") {
        summary[result.outcome]++;
        if (result.email) {
          await sendDeletionCompletedEmail(result.email).catch((e) =>
            console.error("process-account-deletions: completion email failed", e),
          );
        }
      } else if (result.outcome === "blocked") {
        summary.blocked++;
        if (result.blocker === "check_failed") {
          // Could not verify subscription state: try again next run.
          await recordFailedAttempt(admin, req, ["blocker check failed"]);
        } else {
          await cancelDeletion(admin, req.userId);
          if (result.email) {
            await sendDeletionCanceledEmail(result.email, result.blocker).catch((e) =>
              console.error("process-account-deletions: canceled email failed", e),
            );
          }
        }
      } else if (result.outcome === "failed") {
        summary.failed++;
        console.error("process-account-deletions: erase failed", { userId: req.userId, errors: result.errors });
        await recordFailedAttempt(admin, req, result.errors);
      }
      // not_found: the pending key was already cleared by executeDeletion.
    } catch (error) {
      summary.failed++;
      console.error("process-account-deletions: unexpected error", { userId: req.userId, error });
      await recordFailedAttempt(admin, req, [error instanceof Error ? error.message : String(error)]);
    }
  }

  return NextResponse.json({ ok: true, due: due.length, ...summary });
}
