/**
 * GET /api/admin/emails/customer?email=<address>
 *
 * Everything we know about one address for the admin Emails customer drawer:
 * profile, subscription tier/status, suppression, every email sent to them,
 * and their position in each lifecycle funnel. Read-only; all aggregation
 * lives in loadCustomerEmailProfile (src/lib/customer-email-profile.ts).
 */
import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/admin";
import { loadCustomerEmailProfile } from "@/lib/customer-email-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET(request: Request) {
  const actor = await requirePermission("reports.view", request);
  if (!actor) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const email = (new URL(request.url).searchParams.get("email") ?? "").trim();
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const profile = await loadCustomerEmailProfile(email);
  if (!profile) {
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  return NextResponse.json(profile);
}
