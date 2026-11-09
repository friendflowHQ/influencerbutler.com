/**
 * Server half of partner-reserved Setup-call slots (see partner-call-slots.ts):
 * who may book them, and which are still open.
 */
import { hasConflict } from "@/lib/scheduling";
import { getAdmin, loadBusy, loadConfig } from "@/lib/scheduling-server";
import {
  PARTNER_CALL_TYPE,
  PARTNER_LEAD_MS,
  programSlots,
  type PartnerProgram,
  type PartnerSlot,
} from "@/lib/partner-call-slots";

type Admin = NonNullable<ReturnType<typeof getAdmin>>;

/**
 * True when the account is credited to the program's affiliate: the profile
 * referral stamp (signup via link/code, no-card trial, admin credit), or an
 * attributed subscription or order (checkout with the code).
 */
export async function isPartnerAudience(
  admin: Admin,
  userId: string,
  program: PartnerProgram,
): Promise<boolean> {
  if (userId === program.affiliateUserId) return false;
  const aff = program.affiliateUserId;
  const prof = await admin
    .from("profiles")
    .select("ref_affiliate_user_id")
    .eq("id", userId)
    .maybeSingle();
  if (!prof.error && prof.data?.ref_affiliate_user_id === aff) return true;

  const sub = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .eq("ref_affiliate_user_id", aff)
    .limit(1);
  if (!sub.error && (sub.data?.length ?? 0) > 0) return true;

  const ord = await admin
    .from("orders")
    .select("ls_order_id")
    .eq("user_id", userId)
    .eq("ref_affiliate_user_id", aff)
    .limit(1);
  return !ord.error && (ord.data?.length ?? 0) > 0;
}

/** Confirmed partner bookings this customer already holds for the program. */
export async function partnerBookingsForUser(
  admin: Admin,
  userId: string,
  program: PartnerProgram,
): Promise<number> {
  const starts = programSlots(program).map((s) => new Date(s.startMs).toISOString());
  if (starts.length === 0) return 0;
  const { data, error } = await admin
    .from("call_bookings")
    .select("starts_at")
    .eq("user_id", userId)
    .eq("status", "confirmed")
    .eq("call_type", PARTNER_CALL_TYPE);
  if (error) return 0;
  const set = new Set(starts.map((s) => Date.parse(s)));
  return (data ?? []).filter((r) => set.has(Date.parse(r.starts_at as string))).length;
}

/**
 * Program slots that are still bookable now: in the future (past the short
 * partner lead time) and not overlapping any real busy time (bookings, blocks,
 * events, recurring holds, the owner's Google Calendar). Partner holds are
 * excluded from busy here, or every slot would conflict with itself.
 */
export async function openPartnerSlots(
  admin: Admin,
  program: PartnerProgram,
  nowMs: number,
): Promise<PartnerSlot[]> {
  const slots = programSlots(program).filter((s) => s.startMs >= nowMs + PARTNER_LEAD_MS);
  if (slots.length === 0) return [];
  const config = await loadConfig(admin);
  const from = slots[0].startMs - 3600_000;
  const to = slots[slots.length - 1].endMs + 3600_000;
  const busy = await loadBusy(admin, from, to, {
    googleRefreshToken: config.googleRefreshToken,
    callType: PARTNER_CALL_TYPE,
    skipPartnerHolds: true,
  });
  return slots.filter((s) => !hasConflict(s.startMs, s.endMs, busy));
}
