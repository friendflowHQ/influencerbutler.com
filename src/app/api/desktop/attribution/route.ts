/**
 * POST /api/desktop/attribution - the Influencer Butler DESKTOP app reports an
 * affiliate code it captured at sign-in, so the referring affiliate is credited
 * for a desktop-originated conversion.
 *
 * Bearer only: the desktop app authenticates with the user's license key
 * (Authorization: Bearer <key>), the same key_hash lookup the extension and
 * other app-facing routes use. This is the desktop twin of the extension's
 * /api/extension/auth/check attribution: the desktop app has no browser cookie,
 * so it carries the affiliate code in via the influencerbutler:// deep link
 * (see /app/open), persists it locally, and hands it over here once it has a
 * real license key to tie it to an account.
 *
 * Records the referral with channel "desktop" so the affiliate dashboard's
 * "Referred signups" feed labels the lead as coming from the desktop app.
 * Best-effort and never blocks: a bad/missing code is simply ignored.
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
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

  // Optional attribution payload. Older desktop builds send no body, so a parse
  // failure is expected and ignored.
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
    // Awaited so it completes within the request on serverless, but fully
    // guarded so it can never fail the response.
    await attributeExtensionReferral({
      userId: result.auth.userId,
      userEmail: result.auth.email,
      code: affiliateCode,
      capturedAtMs,
      channel: "desktop",
    });
  }

  return jsonWithCors({ ok: true });
}
