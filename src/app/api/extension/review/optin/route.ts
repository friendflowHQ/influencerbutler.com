/**
 * POST /api/extension/review/optin - the free Chrome extension captures an email
 * at (or shortly after) install and posts it here to start the "leave a review"
 * nudge. No auth: the extension is anonymous, and the only thing this can do is
 * add an address to a marketing drip that carries a one-click unsubscribe.
 *
 * Effect: land the address in email_subscribers (source = 'extension-install'),
 * tag it 'ext-review-nudge' so the review sequence auto-enrolls it once active,
 * and open/refresh its extension_review_nudges lifecycle row. Best-effort and
 * idempotent: re-posting the same address never double-enrolls (the enrollment
 * unique constraint) and never resets an install already recorded.
 *
 * CORS: called from a chrome-extension:// origin; Allow-Origin '*' is safe here
 * because there is no auth and no cookies (same pattern as the other
 * /api/extension/* routes).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonWithCors, optionsResponse, isMissingTableError, parseTimestamp } from "@/lib/extension-api";
import { tagRecipientsAsContacts } from "@/lib/email-marketing";
import { isEmailSuppressed, normalizeEmail } from "@/lib/email-unsubscribe";
import { EXT_REVIEW_TAG, EXT_REVIEW_SOURCE } from "@/lib/extension-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Body = { email?: unknown; installedAt?: unknown };

export async function OPTIONS() {
  return optionsResponse();
}

/** Records / refreshes the lifecycle row without clobbering an existing install. */
async function upsertLifecycle(
  db: SupabaseClient,
  email: string,
  installedAt: string | null,
): Promise<void> {
  const { data, error } = await db
    .from("extension_review_nudges")
    .select("email")
    .eq("email", email)
    .maybeSingle();
  if (error) {
    if (!isMissingTableError(error)) console.error("review optin: lifecycle read failed", error);
    return; // migration not applied yet: the drip still works, just no lifecycle row
  }
  if (data) return; // already tracking this install; leave installed_at as first-seen
  const row: Record<string, unknown> = { email };
  if (installedAt) row.installed_at = installedAt;
  const { error: insErr } = await db.from("extension_review_nudges").insert(row);
  if (insErr && !isMissingTableError(insErr)) console.error("review optin: lifecycle insert failed", insErr);
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return jsonWithCors({ error: "Invalid JSON" }, 400);
  }

  const email = typeof body.email === "string" ? normalizeEmail(body.email) : "";
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return jsonWithCors({ error: "Invalid email" }, 400);
  }
  // installedAt may arrive as an ISO string or epoch ms; keep it if it parses.
  const installedAt =
    typeof body.installedAt === "number" && Number.isFinite(body.installedAt)
      ? new Date(body.installedAt).toISOString()
      : parseTimestamp(body.installedAt);

  let db: SupabaseClient;
  try {
    db = createAdminClient();
  } catch {
    return jsonWithCors({ error: "Server misconfigured" }, 500);
  }

  // Respect an existing opt-out: never re-add a suppressed address to a drip.
  if (await isEmailSuppressed(email)) {
    return jsonWithCors({ ok: true, suppressed: true });
  }

  // Upsert contact + union the tag + auto-enroll into the active sequence. This
  // helper degrades to a no-op if the marketing tables are not applied yet.
  await tagRecipientsAsContacts(db, [email], EXT_REVIEW_TAG, EXT_REVIEW_SOURCE);
  await upsertLifecycle(db, email, installedAt);

  return jsonWithCors({ ok: true });
}
