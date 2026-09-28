/**
 * Minimal hand-rolled iCalendar (.ics) builder — no dependency, matching the
 * repo's no-library ethos. Produces a single VEVENT with UTC timestamps, used
 * as an email attachment so a booking lands on the customer's calendar.
 */

function fmtUtc(ms: number): string {
  // YYYYMMDDTHHMMSSZ
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeText(s: string): string {
  return String(s || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

// Fold lines to 75 octets per RFC 5545 (simple char-based fold is fine here).
function fold(line: string): string {
  if (line.length <= 74) return line;
  const parts: string[] = [];
  let rest = line;
  parts.push(rest.slice(0, 74));
  rest = rest.slice(74);
  while (rest.length > 0) {
    parts.push(" " + rest.slice(0, 73));
    rest = rest.slice(73);
  }
  return parts.join("\r\n");
}

export function buildIcs(args: {
  uid: string;
  startMs: number;
  endMs: number;
  summary: string;
  description: string;
  location?: string;
  conferenceUrl?: string;
  organizerEmail: string;
  organizerName?: string;
  attendeeEmail: string;
  attendeeName?: string;
  method?: "REQUEST" | "CANCEL";
  sequence?: number;
}): string {
  const method = args.method || "REQUEST";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Influencer Butler//Scheduling//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${method}`,
    "BEGIN:VEVENT",
    `UID:${escapeText(args.uid)}`,
    `DTSTAMP:${fmtUtc(Date.now())}`,
    `DTSTART:${fmtUtc(args.startMs)}`,
    `DTEND:${fmtUtc(args.endMs)}`,
    `SEQUENCE:${args.sequence ?? 0}`,
    `SUMMARY:${escapeText(args.summary)}`,
    `DESCRIPTION:${escapeText(args.description)}`,
    args.location ? `LOCATION:${escapeText(args.location)}` : "",
    // Google Calendar / Gmail render a "Join with Google Meet" button when the
    // event carries this property (in addition to the plain LOCATION link).
    args.conferenceUrl ? `X-GOOGLE-CONFERENCE:${escapeText(args.conferenceUrl)}` : "",
    `ORGANIZER;CN=${escapeText(args.organizerName || "Influencer Butler")}:mailto:${args.organizerEmail}`,
    `ATTENDEE;CN=${escapeText(args.attendeeName || args.attendeeEmail)};RSVP=TRUE:mailto:${args.attendeeEmail}`,
    method === "CANCEL" ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);
  return lines.map(fold).join("\r\n");
}

/** Base64 of the ics text, for the Resend `attachments[].content` field. */
export function icsBase64(ics: string): string {
  return Buffer.from(ics, "utf8").toString("base64");
}
