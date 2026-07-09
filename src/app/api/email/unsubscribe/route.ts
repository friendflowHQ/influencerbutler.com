/**
 * One-click email unsubscribe endpoint.
 *
 * Links in marketing / funnel emails point here with a signed token:
 *   /api/email/unsubscribe?e=<email>&t=<hmac>
 *
 * GET  - a recipient clicked the "Unsubscribe" link. Verify the token, record
 *        the opt-out, and render a small confirmation page.
 * POST - RFC 8058 one-click (List-Unsubscribe-Post). Gmail / Apple Mail POST
 *        here when the recipient taps the native Unsubscribe button. Verify,
 *        record, return 200 with no body.
 *
 * The endpoint is intentionally unauthenticated: the HMAC token IS the proof
 * that the caller was sent an email for this address. A missing or bad token
 * records nothing.
 */
import { NextResponse } from "next/server";
import { recordSuppression, verifyUnsubscribeToken } from "@/lib/email-unsubscribe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function readParams(request: Request): { email: string; token: string } {
  const url = new URL(request.url);
  return {
    email: url.searchParams.get("e") ?? "",
    token: url.searchParams.get("t") ?? "",
  };
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
  .card { background:#fff; max-width:440px; margin:24px; padding:32px; border-radius:14px;
          box-shadow:0 1px 3px rgba(0,0,0,.08); text-align:center; }
  h1 { font-size:20px; margin:0 0 12px; color:${accent}; }
  p { font-size:15px; line-height:1.5; margin:0 0 8px; color:#374151; }
  a { color:#2563eb; text-decoration:none; }
</style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${message}</p>
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

export async function GET(request: Request) {
  const { email, token } = readParams(request);

  if (!email || !verifyUnsubscribeToken(email, token)) {
    return htmlResponse(
      page(
        "Link not valid",
        "This unsubscribe link is invalid or has expired. If you keep getting emails you didn't ask for, reply to any of them and we'll remove you by hand.",
        false,
      ),
      400,
    );
  }

  await recordSuppression(email, "unsubscribe");

  return htmlResponse(
    page(
      "You're unsubscribed",
      `We've removed <strong>${escapeHtml(email)}</strong> from our marketing and reminder emails. You won't receive them anymore. Account and purchase emails (like license keys and receipts) still send, since your account needs them.`,
      true,
    ),
    200,
  );
}

export async function POST(request: Request) {
  const { email, token } = readParams(request);

  if (!email || !verifyUnsubscribeToken(email, token)) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  await recordSuppression(email, "unsubscribe");
  // RFC 8058: a 2xx with no body is the expected one-click response.
  return new NextResponse(null, { status: 200 });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
