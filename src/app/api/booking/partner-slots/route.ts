/**
 * GET /api/booking/partner-slots
 * Partner-reserved Setup-call slots this customer may book (see
 * src/lib/partner-call-slots.ts). Returns only programs whose affiliate referred
 * this account. Admins get every program as a view-only preview so the owner
 * can check what students see without taking a slot.
 */
import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/license-auth";
import { isEmailAdmin } from "@/lib/admin";
import { getAdmin } from "@/lib/scheduling-server";
import { PARTNER_PROGRAMS } from "@/lib/partner-call-slots";
import {
  isPartnerAudience,
  openPartnerSlots,
  partnerBookingsForUser,
} from "@/lib/partner-call-slots-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authed = await resolveAuth(request);
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const { userId, email } = authed.auth;

  const admin = getAdmin();
  if (!admin) return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });

  const isAdmin = isEmailAdmin(email);
  const now = Date.now();
  const programs = [];
  for (const p of PARTNER_PROGRAMS) {
    const eligible = await isPartnerAudience(admin, userId, p);
    if (!eligible && !isAdmin) continue;
    const used = eligible ? await partnerBookingsForUser(admin, userId, p) : 0;
    const slots = await openPartnerSlots(admin, p, now);
    programs.push({
      key: p.key,
      label: p.label,
      partnerName: p.partnerName,
      url: p.url,
      note: p.note,
      preview: !eligible,
      limitReached: eligible && used >= p.perCustomerLimit,
      slots,
    });
  }
  return NextResponse.json({ programs });
}
