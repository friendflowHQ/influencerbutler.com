/**
 * GET /extension-review - the landing page the review-nudge flow lands on.
 *
 *   ?done=1  after the "already left a review" confirm link: a thank-you.
 *   (no arg) a neutral fallback with a plain link to the Web Store review page,
 *            e.g. someone who opens the URL directly.
 *
 * Rendered as a small self-contained HTML page from the route handler, matching
 * the one-click unsubscribe confirmation page, so it needs no site chrome.
 */
import { CHROME_REVIEW_URL } from "@/lib/extension-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function page(done: boolean): string {
  const title = done ? "Thank you!" : "Leave a review";
  const body = done
    ? `<h1>Thank you!</h1>
       <p>Your review means a lot to our small team, and it helps other Amazon creators find Influencer Butler. That is the last you will hear from us about reviews.</p>
       <p><a class="btn" href="https://www.influencerbutler.com">Back to Influencer Butler</a></p>`
    : `<h1>Leave a review</h1>
       <p>Enjoying the Influencer Butler extension? A quick rating on the Chrome Web Store helps other creators find it and takes about a minute.</p>
       <p><a class="btn" href="${CHROME_REVIEW_URL}" target="_blank" rel="noopener noreferrer">Open the review page</a></p>`;
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
  h1 { font-size:22px; margin:0 0 12px; color:#111827; }
  p { font-size:15px; line-height:1.55; margin:0 0 16px; color:#374151; }
  .btn { display:inline-block; background:#c2410c; color:#fff; padding:11px 20px;
         border-radius:9px; font-weight:600; text-decoration:none; }
  .btn:hover { background:#9a3412; }
</style>
</head>
<body>
  <div class="card">${body}</div>
</body>
</html>`;
}

export async function GET(request: Request) {
  const done = new URL(request.url).searchParams.get("done") === "1";
  return new Response(page(done), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
