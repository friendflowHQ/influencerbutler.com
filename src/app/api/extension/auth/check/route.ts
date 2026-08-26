/**
 * POST /api/extension/auth/check - the Chrome extension verifies a license
 * key here when the user OPTIONALLY connects their account in the popup.
 * Bearer only: this endpoint exists for the extension, not the browser
 * dashboard.
 *
 * The extension is part of the Free forever tier: all of its tools run
 * anonymously with no login. Connecting a license key here is optional and
 * only enables syncing scans/gaps back to the dashboard - it is NOT a
 * paywall, and this endpoint deliberately does not check subscription tier.
 *
 * PRIVACY: a license key is an account credential, so the caller is not
 * necessarily the account owner (e.g. a comp key the owner shared). We never
 * return the raw account email or display name here - only a masked email
 * (e***@gmail.com) so the legitimate owner can confirm they connected the
 * right account without disclosing the full address to a key holder.
 *
 * AFFILIATE ATTRIBUTION: the extension may include an affiliate code it captured
 * on an earlier influencerbutler.com visit (see the site-referral content
 * script). Connecting the key is the moment we can tie that code to a real
 * account, so we record the referral here - crediting the affiliate for a
 * conversion even when the 30-day web cookie is long gone. Best-effort and never
 * blocks the verify response.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { maskEmail } from "@/lib/mask-email";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";
import { attributeExtensionReferral } from "@/lib/extension-affiliate-attribution";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  affiliateCode?: unknown;
  affiliateCapturedAt?: unknown;
};

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : null;
}

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const result = await resolveLicenseOnly(request);
  if (!result.ok) {
    return jsonWithCors({ error: result.error }, result.status);
  }

  // Optional attribution payload. Older extension builds send no body, so a
  // parse failure is expected and ignored.
  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    body = {};
  }
  const affiliateCode = str(body.affiliateCode);
  if (affiliateCode) {
    const capturedAtMs =
      typeof body.affiliateCapturedAt === "number" && Number.isFinite(body.affiliateCapturedAt)
        ? body.affiliateCapturedAt
        : null;
    // Awaited so it completes within the request on serverless (no reliable
    // after-response work), but fully guarded so it can never fail the verify.
    await attributeExtensionReferral({
      userId: result.auth.userId,
      userEmail: result.auth.email,
      code: affiliateCode,
      capturedAtMs,
      channel: "extension",
    });
  }

  return jsonWithCors({
    ok: true,
    maskedEmail: maskEmail(result.auth.email),
  });
}
