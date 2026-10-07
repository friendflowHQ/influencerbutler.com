import { daysUntil } from "../../amazon/creator-campaigns";

// Pure helpers for the Idea List campaign chips and hover card: the calendar
// end day of a Creator Connections campaign, a short label for it, and the
// per-sale commission amount. Kept DOM-free so they are unit-testable.

export type CampaignEnd = {
  // Local-midnight Date for the campaign's last day.
  day: Date;
  // Whole calendar days from `now` (0 = ends today, negative = already over).
  daysLeft: number;
};

// The cc-rates endpoint serves `endsAt` as a full ISO timestamp. A date-only
// source lands on exactly 00:00:00Z and that UTC date is the end day. An
// end-of-day source in a US zone (23:59 local) lands in the early hours UTC of
// the NEXT day, so reading its UTC date would be one day late; stepping back 12
// hours recovers the intended day for both that and a 23:59:59Z stamp.
export function campaignEnd(iso: string | null | undefined, now: Date = new Date()): CampaignEnd | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return null;
  const exact = new Date(ms);
  const midnightUtc =
    exact.getUTCHours() === 0 && exact.getUTCMinutes() === 0 && exact.getUTCSeconds() === 0;
  const anchor = midnightUtc ? exact : new Date(ms - 12 * 60 * 60 * 1000);
  const day = new Date(anchor.getUTCFullYear(), anchor.getUTCMonth(), anchor.getUTCDate());
  return { day, daysLeft: daysUntil(day, now) };
}

// "Oct 31", or "Oct 31, 2027" when the end falls in a different year than `now`.
export function formatEndDay(day: Date, now: Date = new Date()): string {
  const sameYear = day.getFullYear() === now.getFullYear();
  return day.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

// Commission in cents for one sale at `priceCents` and a percent rate, or null
// when the price is unknown.
export function perSaleCents(priceCents: number | null, ratePct: number): number | null {
  if (priceCents === null) return null;
  return Math.round((priceCents * ratePct) / 100);
}

export function budgetLevel(raw: string | null | undefined): "high" | "medium" | "low" | null {
  const v = (raw ?? "").trim().toLowerCase();
  return v === "high" || v === "medium" || v === "low" ? v : null;
}
