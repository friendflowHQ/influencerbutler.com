"use client";

/**
 * Chip marking a call booked through a partner-reserved Setup slot (e.g.
 * Tanner's students), in the same rose ribbon color the customer sees on
 * /dashboard/book. White on #8f4f61 is 6.1:1 (WCAG AA).
 */

import { partnerProgramForBooking } from "@/lib/partner-call-slots";

export function PartnerChip({
  booking,
  size = "sm",
}: {
  booking: { call_type: string; starts_at: string; host_notes?: string | null };
  size?: "xs" | "sm";
}) {
  const p = partnerProgramForBooking(booking);
  if (!p) return null;
  const pad = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-xs";
  return (
    <span
      className={`inline-flex items-center rounded-full bg-[#8f4f61] font-semibold text-white ${pad}`}
      title={`Reserved ${p.partnerName} slot (code ${p.affiliateCode})`}
    >
      {p.label}
      <span className="sr-only">: reserved {p.partnerName} slot</span>
    </span>
  );
}
