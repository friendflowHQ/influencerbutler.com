/**
 * Server helpers for the emailed manage-link flow (/booking/manage/[id]?t=...).
 * The signed token proves the caller holds a link we emailed for that booking;
 * every route also re-checks that the call is still confirmed and upcoming.
 */
import { getAdmin } from "@/lib/scheduling-server";
import { BOOKING_ROW_COLS, type BookingRow } from "@/lib/call-actions";
import { isBookingId, verifyManageToken } from "@/lib/call-manage";

type Admin = NonNullable<ReturnType<typeof getAdmin>>;

export type ManageLoad =
  | { ok: true; admin: Admin; booking: BookingRow }
  | { ok: false; status: number; error: string };

const INVALID = "This link is not valid. Open the most recent email about your call, or manage it from your dashboard under Book a Call.";

/** Verifies the token and loads the booking. Never reveals whether an id exists. */
export async function loadManageable(id: string, token: string): Promise<ManageLoad> {
  if (!isBookingId(id) || !verifyManageToken(id, token)) return { ok: false, status: 403, error: INVALID };
  const admin = getAdmin();
  if (!admin) return { ok: false, status: 500, error: "Server misconfigured" };
  const { data, error } = await admin.from("call_bookings").select(BOOKING_ROW_COLS).eq("id", id.toLowerCase()).maybeSingle();
  if (error || !data) return { ok: false, status: 403, error: INVALID };
  return { ok: true, admin, booking: data as unknown as BookingRow };
}

/** Only a confirmed call that has not started yet can be moved or cancelled by link. */
export function canChange(b: Pick<BookingRow, "status" | "starts_at">, nowMs = Date.now()): boolean {
  return b.status === "confirmed" && Date.parse(b.starts_at) > nowMs;
}

/** The booking's own Google Calendar event window, so a move is not blocked by itself. */
export function ownEventOf(b: BookingRow): { startMs: number; endMs: number } | null {
  return b.meeting_provider === "google_meet" ? { startMs: Date.parse(b.starts_at), endMs: Date.parse(b.user_ends_at) } : null;
}
