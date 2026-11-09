/**
 * Partner-reserved Setup-call slots.
 *
 * A partner program holds a handful of specific Setup-call times for one
 * affiliate's audience (e.g. Tanner Clemens' students after her private live
 * training). The times are:
 *   - held off the public calendar for everyone else (loadBusy adds them as
 *     busy unless the caller is booking the partner slot itself), and
 *   - offered only to accounts credited to that affiliate (profile, subscription
 *     or order attribution), via /api/booking/partner-slots.
 *
 * Kept in code rather than a table so a short promo ships without a
 * hand-applied migration. Times are wall-clock in `timezone`. A slot simply
 * stops being offered once it is in the past or booked.
 */
import { DateTime } from "luxon";
import { CALL_TYPES, type BusyRange } from "@/lib/scheduling";

export type PartnerProgram = {
  key: string;
  /** Short label on the slot ribbon. */
  label: string;
  partnerName: string;
  /** The affiliate whose referred accounts may book. */
  affiliateUserId: string;
  affiliateCode: string;
  /** Ribbon link. */
  url: string;
  /** Tooltip / screen-reader note explaining who can book. */
  note: string;
  /** Wall-clock starts ("YYYY-MM-DDTHH:mm") in `timezone`. Always Setup calls. */
  starts: string[];
  timezone: string;
  /** Max partner calls per customer, so a few people cannot take every slot. */
  perCustomerLimit: number;
};

export const PARTNER_PROGRAMS: PartnerProgram[] = [
  {
    key: "tanner",
    label: "Tanner",
    partnerName: "Tanner Clemens",
    affiliateUserId: "1bef58ce-b572-4343-a998-53b3a19bb0ca",
    affiliateCode: "TANNER",
    url: "https://tannerclemenscollective.com/",
    note:
      "Reserved for Tanner Clemens' students who joined her private live Influencer Butler training and signed up with her link or code TANNER.",
    starts: [
      "2026-11-13T10:30",
      "2026-11-17T10:00",
      "2026-11-19T10:30",
      "2026-11-23T10:30",
      "2026-11-24T10:00",
    ],
    timezone: "America/Denver",
    perCustomerLimit: 1,
  },
];

export const PARTNER_CALL_TYPE = "demo" as const;

export function findProgram(key: string | null | undefined): PartnerProgram | null {
  if (!key) return null;
  return PARTNER_PROGRAMS.find((p) => p.key === key) ?? null;
}

export type PartnerSlot = { startMs: number; endMs: number; userEndMs: number };

/** Every configured slot of a program as UTC ranges (Setup-call length). */
export function programSlots(program: PartnerProgram): PartnerSlot[] {
  const ct = CALL_TYPES[PARTNER_CALL_TYPE];
  const out: PartnerSlot[] = [];
  for (const s of program.starts) {
    const dt = DateTime.fromISO(s, { zone: program.timezone });
    if (!dt.isValid) continue;
    const startMs = dt.toMillis();
    out.push({
      startMs,
      endMs: startMs + ct.blockMinutes * 60_000,
      userEndMs: startMs + ct.userMinutes * 60_000,
    });
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

/**
 * Busy ranges that keep every partner slot off the public calendar inside
 * [fromMs, toMs]. Already-booked slots are busy through their booking anyway,
 * so this only matters for the open ones.
 */
export function partnerHoldRanges(fromMs: number, toMs: number): BusyRange[] {
  const out: BusyRange[] = [];
  for (const p of PARTNER_PROGRAMS) {
    for (const s of programSlots(p)) {
      if (s.startMs < toMs && s.endMs > fromMs) out.push({ startMs: s.startMs, endMs: s.endMs });
    }
  }
  return out;
}

/** Minimum notice for a partner slot (shorter than the public lead time). */
export const PARTNER_LEAD_MS = 2 * 3600_000;
