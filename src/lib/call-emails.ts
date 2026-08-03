/**
 * Transactional emails for call scheduling. Posts directly to the Resend API
 * (the repo's transactional convention — no unsubscribe footer), from
 * "Influencer Butler <hello@influencerbutler.com>", plain text, with an
 * optional .ics attachment. No em-dashes in customer-facing copy.
 */
import { DateTime } from "luxon";
import { buildIcs, icsBase64 } from "./ics";
import { bodyToHtml } from "./newsletter";
import { CALL_TYPES, type CallTypeKey } from "./scheduling";

const FROM = "Influencer Butler <hello@influencerbutler.com>";
const ORGANIZER_EMAIL = "hello@influencerbutler.com";
const SITE = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
const BOOK_URL = `${SITE}/dashboard/book`;

/**
 * Turns a plain-text body into email-safe HTML (via the shared bodyToHtml) and
 * hyperlinks specific phrases. Each phrase is escaped before matching so it
 * lines up with bodyToHtml's escaped output; the phrases we use ("Book a Call",
 * a bare https URL) contain no HTML-special characters, so a plain replace is safe.
 */
function htmlFrom(text: string, links: { phrase: string; href: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = bodyToHtml(text);
  for (const { phrase, href } of links) {
    const anchor = `<a href="${esc(href)}" style="color:#f97316;text-decoration:underline;">${esc(phrase)}</a>`;
    html = html.split(esc(phrase)).join(anchor);
  }
  return html;
}

export function ownerNotifyEmail(): string | null {
  const explicit = process.env.SCHEDULING_OWNER_EMAIL?.trim();
  if (explicit) return explicit;
  const first = (process.env.ADMIN_EMAILS || "").split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)[0];
  return first || null;
}

export type BookingEmailData = {
  id: string;
  callType: CallTypeKey;
  userEmail: string;
  userName?: string | null;
  startMs: number;
  userEndMs: number;
  userTimezone?: string | null;
  topic?: string | null;
  joinUrl?: string | null;
};

type Attachment = { filename: string; content: string };

async function sendResend(to: string, subject: string, text: string, attachments?: Attachment[], html?: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) { console.error("[call-emails] RESEND_API_KEY not set"); return false; }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, text, ...(html ? { html } : {}), ...(attachments?.length ? { attachments } : {}) }),
    });
    if (!res.ok) { console.error("[call-emails] resend failed", res.status, await res.text().catch(() => "")); return false; }
    return true;
  } catch (err) { console.error("[call-emails] resend threw", err); return false; }
}

function whenLine(startMs: number, endMs: number, tz: string): string {
  const z = tz || "UTC";
  const start = DateTime.fromMillis(startMs, { zone: z });
  const end = DateTime.fromMillis(endMs, { zone: z });
  return `${start.toFormat("cccc, LLLL d, yyyy")} from ${start.toFormat("h:mm a")} to ${end.toFormat("h:mm a")} (${start.toFormat("ZZZZ")})`;
}

function firstName(name?: string | null, email?: string): string {
  const n = (name || "").trim().split(" ")[0];
  if (n) return n;
  const local = (email || "").split("@")[0];
  return local || "there";
}

function icsAttachment(b: BookingEmailData): Attachment {
  const ct = CALL_TYPES[b.callType];
  const ics = buildIcs({
    uid: `call-${b.id}@influencerbutler.com`,
    startMs: b.startMs,
    endMs: b.userEndMs,
    summary: `${ct.label} with Influencer Butler`,
    description: [b.topic ? `Topic: ${b.topic}` : "", b.joinUrl ? `Join: ${b.joinUrl}` : ""].filter(Boolean).join("\n"),
    location: b.joinUrl || undefined,
    conferenceUrl: b.joinUrl || undefined,
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: b.userEmail,
    attendeeName: b.userName || undefined,
    method: "REQUEST",
  });
  return { filename: "invite.ics", content: icsBase64(ics) };
}

export async function sendBookingConfirmation(b: BookingEmailData): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `Your ${ct.label.toLowerCase()} is confirmed:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    b.joinUrl ? `Join link: ${b.joinUrl}` : `Your join link will be emailed to you shortly.`,
    b.topic ? `\nWhat you asked about: ${b.topic}` : "",
    ``,
    `A calendar invite is attached, so it will drop straight onto your calendar.`,
    `Need to change it? You can reschedule or cancel from your dashboard under Book a Call.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].filter((l) => l !== "").join("\n");
  const html = htmlFrom(body, [
    { phrase: "Book a Call", href: BOOK_URL },
    ...(b.joinUrl ? [{ phrase: b.joinUrl, href: b.joinUrl }] : []),
  ]);
  return sendResend(b.userEmail, `Confirmed: your ${ct.label.toLowerCase()}`, body, [icsAttachment(b)], html);
}

export async function sendOwnerNotification(b: BookingEmailData, prepSummary: string): Promise<boolean> {
  const to = ownerNotifyEmail();
  if (!to) return false;
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const body = [
    `New ${ct.label.toLowerCase()} booked.`,
    ``,
    `Who: ${b.userName || ""} <${b.userEmail}>`,
    `When: ${whenLine(b.startMs, b.userEndMs, tz)} (their time)`,
    b.topic ? `Topic: ${b.topic}` : "Topic: (none given)",
    b.joinUrl ? `Join: ${b.joinUrl}` : "Join: (no link yet)",
    ``,
    prepSummary,
    ``,
    `Full prep sheet: dashboard > Scheduling.`,
  ].join("\n");
  return sendResend(to, `[Call booked] ${ct.label} — ${b.userEmail}`, body);
}

export async function sendReminder(b: BookingEmailData, which: "24h" | "1h"): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const lead = which === "24h" ? "tomorrow" : "in about an hour";
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `A reminder that your ${ct.label.toLowerCase()} is ${lead}:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    b.joinUrl ? `Join link: ${b.joinUrl}` : `Your join link will be emailed shortly.`,
    ``,
    `See you soon.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].join("\n");
  const html = htmlFrom(body, b.joinUrl ? [{ phrase: b.joinUrl, href: b.joinUrl }] : []);
  return sendResend(b.userEmail, `Reminder: your ${ct.label.toLowerCase()} is ${lead}`, body, undefined, html);
}

export async function sendCancellation(b: BookingEmailData): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const cancelIcs = buildIcs({
    uid: `call-${b.id}@influencerbutler.com`,
    startMs: b.startMs,
    endMs: b.userEndMs,
    summary: `${ct.label} with Influencer Butler`,
    description: "This call has been cancelled.",
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: b.userEmail,
    method: "CANCEL",
    sequence: 1,
  });
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `Your ${ct.label.toLowerCase()} on ${whenLine(b.startMs, b.userEndMs, tz)} has been cancelled.`,
    ``,
    `You can book a new time any time from your dashboard under Book a Call.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].join("\n");
  const html = htmlFrom(body, [{ phrase: "Book a Call", href: BOOK_URL }]);
  return sendResend(b.userEmail, `Cancelled: your ${ct.label.toLowerCase()}`, body, [
    { filename: "cancel.ics", content: icsBase64(cancelIcs) },
  ], html);
}
