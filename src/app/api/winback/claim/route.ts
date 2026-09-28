/**
 * Win-back comp claim endpoint.
 *
 * The tier-2 / tier-3 win-back emails (comp segment) link here with a signed id:
 *   /api/winback/claim?id=<cancel_row_id>&t=<hmac>
 *
 * On a valid click we mint a free 2-month in-house Pro comp for the recipient
 * (issueInHouseComp provisions the account, emails the license key + a magic
 * sign-in link, and the comp-expiry cron auto-cancels it at the 2-month mark)
 * and stamp the cancellation row so a re-click doesn't mint a second comp.
 *
 * Unauthenticated by design: the HMAC token is the proof the caller was sent the
 * email. Minting only happens on GET-with-valid-token; nothing is created for a
 * missing/bad token.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import { issueInHouseComp } from "@/lib/comp-issue";
import { AFFILIATE_COMP_PLAN, AFFILIATE_COMP_SEATS } from "@/lib/affiliate-comps";
import { verifyWinbackClaimToken, WINBACK_COMP_MONTHS } from "@/lib/winback-emails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DOWNLOAD_URL = "https://www.influencerbutler.com/download";
const LIVE_STATUSES = ["active", "on_trial", "past_due", "paused"];

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function page(title: string, message: string, ok: boolean): string {
  const accent = ok ? "#16a34a" : "#dc2626";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} : Influencer Butler</title>
<style>
  body { margin:0; font-family:Inter,Arial,sans-serif; background:#f9fafb; color:#111827;
         display:flex; min-height:100vh; align-items:center; justify-content:center; }
  .card { background:#fff; max-width:460px; margin:24px; padding:32px; border-radius:14px;
          box-shadow:0 1px 3px rgba(0,0,0,.08); text-align:center; }
  h1 { font-size:20px; margin:0 0 12px; color:${accent}; }
  p { font-size:15px; line-height:1.5; margin:0 0 12px; color:#374151; }
  .btn { display:inline-block; margin-top:8px; padding:12px 20px; border-radius:10px;
         background:#2563eb; color:#fff; font-weight:600; text-decoration:none; }
  a { color:#2563eb; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    ${message}
    <p><a href="https://www.influencerbutler.com">Back to Influencer Butler</a></p>
  </div>
</body>
</html>`;
}

function htmlResponse(body: string, status: number): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

const activePage = (email: string) =>
  htmlResponse(
    page(
      "You're all set",
      `<p>Your free ${WINBACK_COMP_MONTHS} months of Pro are already active. We've emailed your license key and a sign-in link to <strong>${escapeHtml(
        email,
      )}</strong>.</p><p><a class="btn" href="${DOWNLOAD_URL}">Download the app</a></p>`,
      true,
    ),
    200,
  );

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") ?? "";
  const token = url.searchParams.get("t") ?? "";

  if (!id || !verifyWinbackClaimToken(id, token)) {
    return htmlResponse(
      page(
        "Link not valid",
        `<p>This link is invalid or has expired. Reply to the email we sent and we'll sort it out by hand.</p>`,
        false,
      ),
      400,
    );
  }

  const supabase = createAdminClient();

  const { data: row } = await supabase
    .from("subscription_cancel_reasons")
    .select("id,user_id,reason,winback_comp_claimed_at")
    .eq("id", id)
    .maybeSingle();

  if (!row || typeof row.user_id !== "string") {
    return htmlResponse(
      page(
        "Link not valid",
        `<p>We couldn't find this offer. Reply to the email we sent and we'll help.</p>`,
        false,
      ),
      400,
    );
  }

  // Recipient email (issueInHouseComp needs it, and we show it on success).
  const { data: profile } = await supabase
    .from("profiles")
    .select("email,full_name")
    .eq("id", row.user_id)
    .maybeSingle();
  const email = typeof profile?.email === "string" ? profile.email : "";
  const name = typeof profile?.full_name === "string" ? profile.full_name : "";

  // Already claimed -> friendly "you're set" page (idempotent re-click).
  if (row.winback_comp_claimed_at) {
    return activePage(email);
  }

  // Re-subscribed since the email went out -> nothing to grant.
  const { data: liveSubs } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", row.user_id)
    .in("status", LIVE_STATUSES)
    .limit(1);
  if ((liveSubs ?? []).length > 0) {
    return htmlResponse(
      page(
        "You're already Pro",
        `<p>Good news: your account already has an active Pro subscription, so there's nothing to claim. Enjoy!</p><p><a class="btn" href="${DOWNLOAD_URL}">Open the app</a></p>`,
        true,
      ),
      200,
    );
  }

  if (!email) {
    return htmlResponse(
      page(
        "Something went wrong",
        `<p>We couldn't read your account email. Reply to the email we sent and we'll set up your free months by hand.</p>`,
        false,
      ),
      500,
    );
  }

  const result = await issueInHouseComp({
    email,
    name,
    months: WINBACK_COMP_MONTHS,
    plan: AFFILIATE_COMP_PLAN,
    seats: AFFILIATE_COMP_SEATS,
  });

  if (!result.ok) {
    // 409 = the stacking guard fired (a live sub appeared between our check and
    // the mint): treat as already-active rather than an error.
    if (result.status === 409) return activePage(email);
    console.error("winback claim: issueInHouseComp failed", { id, status: result.status, error: result.error });
    return htmlResponse(
      page(
        "Something went wrong",
        `<p>We hit a snag setting up your free months. Reply to the email we sent and we'll fix it right away.</p>`,
        false,
      ),
      500,
    );
  }

  // Best-effort: link the tracking grant we just created for admin traceability.
  const { data: grant } = await supabase
    .from("comp_grants")
    .select("id")
    .eq("user_id", result.userId)
    .order("issued_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error: stampErr } = await supabase
    .from("subscription_cancel_reasons")
    .update({
      winback_comp_claimed_at: new Date().toISOString(),
      winback_comp_grant_id: typeof grant?.id === "string" ? grant.id : null,
    })
    .eq("id", id);
  if (stampErr) {
    console.error("winback claim: stamp claimed failed", { id, stampErr });
  }

  return htmlResponse(
    page(
      "Your 2 free months are live",
      `<p>Done! We've set up your free ${WINBACK_COMP_MONTHS} months of Pro and emailed your license key and a one-click sign-in link to <strong>${escapeHtml(
        email,
      )}</strong>.</p><p>Install the desktop app, paste your key, and you're back in business. No card, and nothing charges when the ${WINBACK_COMP_MONTHS} months are up.</p><p><a class="btn" href="${DOWNLOAD_URL}">Download the app</a></p>`,
      true,
    ),
    200,
  );
}
