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
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { maskEmail } from "@/lib/mask-email";
import { jsonWithCors, optionsResponse } from "@/lib/extension-api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function OPTIONS() {
  return optionsResponse();
}

export async function POST(request: Request) {
  const result = await resolveLicenseOnly(request);
  if (!result.ok) {
    return jsonWithCors({ error: result.error }, result.status);
  }

  return jsonWithCors({
    ok: true,
    maskedEmail: maskEmail(result.auth.email),
  });
}
