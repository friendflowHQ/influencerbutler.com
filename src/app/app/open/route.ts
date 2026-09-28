/**
 * GET /app/open?to=influencerbutler://... - https bounce page that opens the
 * desktop app via its custom protocol, injecting the affiliate code along the
 * way.
 *
 * This mirrors the licensing worker's /open bounce (same ?to= contract, same
 * "fire the custom scheme from a real web origin so Gmail keeps the href"
 * purpose), with one addition: it runs on www.influencerbutler.com, so it can
 * read the ib_aff_src affiliate cookie that was set when the user clicked an
 * affiliate link. For an influencerbutler://auth deep link it appends
 * &aff=CODE, so a desktop sign-in can be attributed to the referring affiliate
 * (the app persists the code and reports it via /api/desktop/attribution).
 *
 * The magic-link email points here (via the worker's MAGIC_LINK_OPEN_REDIRECT_BASE)
 * instead of the worker's own /open. It is a pure redirector to our own
 * influencerbutler:// scheme, never an open redirect.
 */
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readAffiliateSourceCookie } from "@/lib/promo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TO_LEN = 512;
const DOWNLOAD_URL = "https://dl.influencerbutler.com";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    c === "&" ? "&amp;" : c === "<" ? "&lt;" : c === ">" ? "&gt;" : c === '"' ? "&quot;" : "&#39;",
  );
}

/**
 * Validate that `to` is one of our own custom-protocol URLs and nothing else.
 * Returns the trimmed URL string, or null to reject (missing, too long, wrong
 * scheme, unparseable). This is the open-redirect guard: the page must never
 * bounce to javascript:, http(s):, data:, or any other scheme.
 */
function validateDeepLink(rawTo: string | null): string | null {
  const to = (rawTo ?? "").trim();
  if (!to || to.length > MAX_TO_LEN) return null;
  if (!/^influencerbutler:\/\//i.test(to)) return null;
  try {
    const parsed = new URL(to);
    if (parsed.protocol.toLowerCase() !== "influencerbutler:") return null;
  } catch {
    return null;
  }
  return to;
}

/**
 * Append &aff=CODE to an influencerbutler://auth deep link when the affiliate
 * cookie is present and the link does not already carry one. Only the auth
 * deep link is augmented; every other target passes through untouched. The
 * original string is preserved (we append rather than re-serialize the URL, so
 * the token is not reshaped).
 */
function withAffiliate(deepLink: string, code: string | null): string {
  if (!code) return deepLink;
  let host = "";
  let hasAff = false;
  try {
    const parsed = new URL(deepLink);
    host = (parsed.hostname || "").toLowerCase();
    hasAff = parsed.searchParams.has("aff");
  } catch {
    return deepLink;
  }
  if (host !== "auth" || hasAff) return deepLink;
  const sep = deepLink.includes("?") ? "&" : "?";
  return `${deepLink}${sep}aff=${encodeURIComponent(code)}`;
}

function renderInvalidHtml(): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Open Influencer Butler</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#1f2937;background:#f9fafb;margin:0;padding:48px 20px;text-align:center}.card{max-width:460px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}h1{color:#f97316;font-size:20px;margin:0 0 8px}p{font-size:14px;color:#374151}.btn{display:inline-block;margin:16px 0 4px;padding:12px 24px;background:#f97316;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}</style>
</head><body><div class="card"><h1>Open Influencer Butler</h1><p>This link is missing or invalid. Open the app directly to continue.</p><a class="btn" href="${DOWNLOAD_URL}">Get Influencer Butler</a></div></body></html>`;
}

function renderRedirectHtml(targetUrl: string): string {
  const safe = escapeHtml(targetUrl);
  // Safe to embed in an inline script: escape "<" so a "</script>" in the query
  // cannot break out; JSON.stringify handles quotes/backslashes.
  const jsLiteral = JSON.stringify(targetUrl).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><meta name="robots" content="noindex" /><title>Opening Influencer Butler...</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;line-height:1.5;color:#1f2937;background:#f9fafb;margin:0;padding:48px 20px;text-align:center}.card{max-width:460px;margin:0 auto;background:#fff;border-radius:12px;padding:32px 28px;box-shadow:0 1px 3px rgba(0,0,0,0.08)}h1{color:#f97316;font-size:20px;margin:0 0 8px}p{font-size:14px;color:#374151}.btn{display:inline-block;margin:20px 0 4px;padding:12px 24px;background:#f97316;color:#fff;text-decoration:none;border-radius:6px;font-weight:600}.muted{font-size:12px;color:#6b7280;margin-top:18px}.muted a{color:#6b7280}</style>
</head><body><div class="card"><h1>Opening Influencer Butler</h1><p>Your browser should ask for permission to open the app. If it doesn't, use the button below.</p><a class="btn" href="${safe}">Open Influencer Butler</a><p class="muted">Nothing happening? Make sure Influencer Butler is installed, then click the button again.<br />Need the app? <a href="${DOWNLOAD_URL}">Download Influencer Butler</a>.</p></div>
<script>(function(){try{window.location.replace(${jsLiteral});}catch(e){try{window.location.href=${jsLiteral};}catch(e2){}}})();</script>
</body></html>`;
}

function htmlResponse(body: string, status = 200): NextResponse {
  return new NextResponse(body, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export async function GET(request: Request) {
  const target = validateDeepLink(new URL(request.url).searchParams.get("to"));
  if (!target) {
    return htmlResponse(renderInvalidHtml(), 400);
  }

  const cookieStore = await cookies();
  const affiliateCode = readAffiliateSourceCookie(cookieStore);
  const finalUrl = withAffiliate(target, affiliateCode);

  return htmlResponse(renderRedirectHtml(finalUrl));
}
