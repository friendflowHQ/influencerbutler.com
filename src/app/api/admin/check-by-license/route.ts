/**
 * GET /api/admin/check-by-license - tells the Influencer Butler desktop
 * app whether the user holding the bearer license is in the
 * ADMIN_EMAILS allowlist. The desktop app probes this once per boot to
 * decide whether to reveal admin-only DOM nodes (renderer/hud/
 * admin-only-gate.js).
 *
 * Auth: `Authorization: Bearer <license-key>` only. Session cookies are
 *   not accepted - the in-browser admin UI uses getAdminSession().
 *
 * Response: { ok: true, isAdmin: boolean, email: string|null }
 */
import { NextResponse } from "next/server";
import { resolveLicenseOnly, isEmailAdmin } from "@/lib/license-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authResult = await resolveLicenseOnly(request);
  if (!authResult.ok) {
    // Don't leak whether the license was valid - return isAdmin=false
    // on any auth failure short-circuit.
    return NextResponse.json(
      { ok: true, isAdmin: false, email: null },
      { status: 200 },
    );
  }
  const { auth } = authResult;
  return NextResponse.json({
    ok: true,
    isAdmin: isEmailAdmin(auth.email),
    email: auth.email,
  });
}
