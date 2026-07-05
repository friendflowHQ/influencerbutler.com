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
 */
import { resolveLicenseOnly } from "@/lib/license-auth";
import { createAdminClient } from "@/lib/supabase/admin";
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

  let displayName: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("display_name")
      .eq("id", result.auth.userId)
      .maybeSingle();
    displayName = (data?.display_name as string | null) ?? null;
  } catch (error) {
    // Best effort: the key is valid either way.
    console.warn("extension/auth/check: profile lookup failed", error);
  }

  return jsonWithCors({
    ok: true,
    userId: result.auth.userId,
    email: result.auth.email,
    displayName,
  });
}
