/**
 * Google Calendar free/busy reader. Given the owner's stored refresh token,
 * asks the Calendar API which time ranges are already busy so the scheduling
 * engine can subtract them from bookable slots (school pickup/dropoff, buffers,
 * ADHD deep-work blocks, and any other Busy event on the connected calendar).
 *
 * Zero dependencies: hand-rolled fetch against the REST API, mirroring
 * google-meet.ts / ga4.ts. Server-side only (no CSP connect-src impact). Every
 * failure degrades to an empty list so availability never hard-fails on a
 * Google hiccup; the DB rules/blocks still apply.
 *
 * Requires the calendar.freebusy (or calendar.readonly) scope. If the owner
 * connected before that scope was added, freeBusy returns 403 until she clicks
 * "Connect Google Calendar" again.
 */
import { accessTokenFrom } from "@/lib/google-meet";
import type { BusyRange } from "@/lib/scheduling";

// The freeBusy endpoint caps a query at ~3 months; our horizon is ~2 weeks, so
// a single request always covers it.
export async function freeBusy(args: {
  refreshToken: string;
  timeMinMs: number;
  timeMaxMs: number;
  calendarIds?: string[];
}): Promise<BusyRange[]> {
  const calendarIds = args.calendarIds?.length ? args.calendarIds : ["primary"];
  const accessToken = await accessTokenFrom(args.refreshToken);
  if (!accessToken) return [];
  try {
    const res = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        timeMin: new Date(args.timeMinMs).toISOString(),
        timeMax: new Date(args.timeMaxMs).toISOString(),
        items: calendarIds.map((id) => ({ id })),
      }),
    });
    if (!res.ok) { console.error("[google] freeBusy", res.status, await res.text().catch(() => "")); return []; }
    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: { start?: string; end?: string }[]; errors?: { reason?: string }[] }>;
    };
    return parseFreeBusy(json);
  } catch (err) { console.error("[google] freeBusy threw", err); return []; }
}

/** Flatten a freeBusy response into UTC busy ranges (exported for tests). */
export function parseFreeBusy(json: {
  calendars?: Record<string, { busy?: { start?: string; end?: string }[]; errors?: { reason?: string }[] }>;
}): BusyRange[] {
  const out: BusyRange[] = [];
  for (const cal of Object.values(json.calendars ?? {})) {
    if (cal.errors?.length) console.error("[google] freeBusy calendar errors", cal.errors);
    for (const b of cal.busy ?? []) {
      const startMs = b.start ? Date.parse(b.start) : NaN;
      const endMs = b.end ? Date.parse(b.end) : NaN;
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) out.push({ startMs, endMs });
    }
  }
  return out;
}
