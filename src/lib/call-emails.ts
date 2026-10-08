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
import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";
import { topicLabelsText } from "@/lib/call-topics";
import { manageUrl } from "@/lib/call-manage";

const FROM = transactionalFrom();
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
  topics?: string[] | null; // chip keys picked at booking (see call-topics.ts)
  joinUrl?: string | null;
  recorded?: boolean; // true when a recording bot is scheduled for this call
};

type Attachment = { filename: string; content: string };

async function sendResend(to: string, subject: string, text: string, category: string, attachments?: Attachment[], html?: string): Promise<boolean> {
  const { ok } = await sendEmail({
    from: FROM,
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(attachments?.length ? { attachments } : {}),
    category,
  });
  return ok;
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

/**
 * The "change it" line for a booking email, plus the link to hyperlink. The
 * signed link works without logging in; with no signing secret configured we
 * fall back to the dashboard wording the emails used before.
 */
function manageLine(id: string, lead: string): { line: string; links: { phrase: string; href: string }[] } {
  const url = manageUrl(id);
  if (!url) return { line: `${lead} You can reschedule or cancel from your dashboard under Book a Call.`, links: [] };
  return { line: `${lead} Reschedule or cancel in one click, no login needed: ${url}`, links: [{ phrase: url, href: url }] };
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
  const manage = manageLine(b.id, "Need to change it?");
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `Your ${ct.label.toLowerCase()} is confirmed:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    b.joinUrl ? `Join link: ${b.joinUrl}` : `Your join link will be emailed to you shortly.`,
    topicLabelsText(b.topics) ? `\nTopics: ${topicLabelsText(b.topics)}` : "",
    b.topic ? `\nWhat you asked about: ${b.topic}` : "",
    ``,
    `A calendar invite is attached, so it will drop straight onto your calendar.`,
    manage.line,
    `If we are not there within 10 minutes of the start time, go ahead and rebook a new time from your dashboard under Book a Call.`,
    `Having technical trouble joining? Email us at hello@influencerbutler.com and we will help.`,
    b.recorded ? `\nPlease note: this call is recorded, transcribed, and AI-summarized so we can prepare notes to review afterward, and any product issues or feature requests raised may be logged to our support queue so we can follow up.` : "",
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].filter((l) => l !== "").join("\n");
  const html = htmlFrom(body, [
    { phrase: "Book a Call", href: BOOK_URL },
    ...manage.links,
    ...(b.joinUrl ? [{ phrase: b.joinUrl, href: b.joinUrl }] : []),
  ]);
  return sendResend(b.userEmail, `Confirmed: your ${ct.label.toLowerCase()}`, body, "booking_confirm", [icsAttachment(b)], html);
}

export async function sendOwnerNotification(b: BookingEmailData, prepSummary: string): Promise<boolean> {
  const to = ownerNotifyEmail();
  if (!to) return false;
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  // A booking with no join link is confirmed but the customer has nothing to
  // join with, so flag it loudly: the subject and a banner make it impossible to
  // miss, and the owner can attach a link under Scheduling to auto-email the
  // customer.
  const noLink = !b.joinUrl;
  const banner = noLink
    ? [`ACTION NEEDED: no video link is attached to this booking. Connect Google Calendar or set a default link so links auto-attach, and for this call attach one under Scheduling (the customer is emailed the link automatically when you do).`, ``]
    : [];
  const body = [
    ...banner,
    `New ${ct.label.toLowerCase()} booked.`,
    ``,
    `Who: ${b.userName || ""} <${b.userEmail}>`,
    `When: ${whenLine(b.startMs, b.userEndMs, tz)} (their time)`,
    topicLabelsText(b.topics) ? `Topics: ${topicLabelsText(b.topics)}` : "Topics: (none picked)",
    b.topic ? `Notes: ${b.topic}` : "Notes: (none given)",
    b.joinUrl ? `Join: ${b.joinUrl}` : "Join: (no link yet)",
    ``,
    prepSummary,
    ``,
    `Full prep sheet: dashboard > Scheduling.`,
  ].join("\n");
  const subject = noLink
    ? `[Call booked - NO LINK, action needed] ${ct.label}: ${b.userEmail}`
    : `[Call booked] ${ct.label}: ${b.userEmail}`;
  return sendResend(to, subject, body, "booking_owner_notify");
}

/**
 * Tells the owner a CUSTOMER cancelled or moved their own call (via the emailed
 * link or the dashboard), so a freed or shifted slot never goes unnoticed.
 */
export async function sendOwnerChange(b: BookingEmailData, kind: "rescheduled" | "cancelled", detail: string): Promise<boolean> {
  const to = ownerNotifyEmail();
  if (!to) return false;
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const body = [
    `A customer ${kind === "cancelled" ? "cancelled" : "rescheduled"} their ${ct.label.toLowerCase()}.`,
    ``,
    `Who: ${b.userName || ""} <${b.userEmail}>`,
    kind === "cancelled" ? `Was: ${whenLine(b.startMs, b.userEndMs, tz)} (their time)` : `Now: ${whenLine(b.startMs, b.userEndMs, tz)} (their time)`,
    topicLabelsText(b.topics) ? `Topics: ${topicLabelsText(b.topics)}` : "",
    b.topic ? `Notes: ${b.topic}` : "",
    detail,
    ``,
    `Full details: dashboard > Scheduling.`,
  ].filter((l) => l !== "").join("\n");
  return sendResend(to, `[Call ${kind} by customer] ${ct.label}: ${b.userEmail}`, body, "booking_owner_change");
}

/**
 * Emails the customer the join link after the owner attaches (or fixes) one
 * post-booking, with an updated .ics (SEQUENCE 1) so the link drops onto the
 * existing calendar entry. This keeps the confirmation email's "will be emailed
 * to you shortly" promise, which nothing else fulfils.
 */
export async function sendLinkAttached(b: BookingEmailData): Promise<boolean> {
  if (!b.joinUrl) return false;
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const manage = manageLine(b.id, "Need to change the time?");
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `Here is the join link for your ${ct.label.toLowerCase()}:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    `Join link: ${b.joinUrl}`,
    b.topic ? `\nWhat you asked about: ${b.topic}` : "",
    ``,
    `An updated calendar invite is attached, so the link will drop onto your calendar entry.`,
    manage.line,
    `If we are not there within 10 minutes of the start time, go ahead and rebook a new time from your dashboard under Book a Call.`,
    `Having technical trouble joining? Email us at hello@influencerbutler.com and we will help.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].filter((l) => l !== "").join("\n");
  const ics = buildIcs({
    uid: `call-${b.id}@influencerbutler.com`,
    startMs: b.startMs,
    endMs: b.userEndMs,
    summary: `${ct.label} with Influencer Butler`,
    description: [b.topic ? `Topic: ${b.topic}` : "", `Join: ${b.joinUrl}`].filter(Boolean).join("\n"),
    location: b.joinUrl,
    conferenceUrl: b.joinUrl,
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: b.userEmail,
    attendeeName: b.userName || undefined,
    method: "REQUEST",
    sequence: 1,
  });
  const html = htmlFrom(body, [
    { phrase: "Book a Call", href: BOOK_URL },
    ...manage.links,
    { phrase: b.joinUrl, href: b.joinUrl },
  ]);
  return sendResend(b.userEmail, `Join link for your ${ct.label.toLowerCase()}`, body, "call_link_attached", [
    { filename: "invite.ics", content: icsBase64(ics) },
  ], html);
}

/**
 * Tells the customer their call moved. The .ics reuses the booking's UID with a
 * higher SEQUENCE (time-based so a second move still outranks the first), so
 * calendar apps update the existing entry instead of adding a duplicate.
 */
export async function sendRescheduled(b: BookingEmailData, previousStartMs: number): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const manage = manageLine(b.id, "Does the new time not work?");
  const oldStart = DateTime.fromMillis(previousStartMs, { zone: tz });
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `We had to move your ${ct.label.toLowerCase()}. It was ${oldStart.toFormat("cccc, LLLL d")} at ${oldStart.toFormat("h:mm a")}. Your new time is:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    b.joinUrl ? `Join link: ${b.joinUrl}` : `Your join link will be emailed to you shortly.`,
    ``,
    `An updated calendar invite is attached, so it will replace the old entry on your calendar.`,
    manage.line,
    `Having technical trouble joining? Email us at hello@influencerbutler.com and we will help.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].filter((l) => l !== "").join("\n");
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
    sequence: Math.floor(Date.now() / 60_000),
  });
  const html = htmlFrom(body, [
    { phrase: "Book a Call", href: BOOK_URL },
    ...manage.links,
    ...(b.joinUrl ? [{ phrase: b.joinUrl, href: b.joinUrl }] : []),
  ]);
  return sendResend(b.userEmail, `New time for your ${ct.label.toLowerCase()}`, body, "call_rescheduled", [
    { filename: "invite.ics", content: icsBase64(ics) },
  ], html);
}

export async function sendReminder(b: BookingEmailData, which: "24h" | "1h"): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const lead = which === "24h" ? "tomorrow" : "in about an hour";
  const manage = manageLine(b.id, "Can't make it?");
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `A reminder that your ${ct.label.toLowerCase()} is ${lead}:`,
    ``,
    whenLine(b.startMs, b.userEndMs, tz),
    b.joinUrl ? `Join link: ${b.joinUrl}` : `Your join link will be emailed shortly.`,
    manage.line,
    ...(which === "1h" ? [
      `If we are not there within 10 minutes of the start time, go ahead and rebook a new time from your dashboard under Book a Call.`,
      `Having technical trouble joining? Email us at hello@influencerbutler.com and we will help.`,
    ] : []),
    ``,
    `See you soon.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].join("\n");
  const html = htmlFrom(body, [
    ...(which === "1h" || manage.links.length === 0 ? [{ phrase: "Book a Call", href: BOOK_URL }] : []),
    ...manage.links,
    ...(b.joinUrl ? [{ phrase: b.joinUrl, href: b.joinUrl }] : []),
  ]);
  return sendResend(b.userEmail, `Reminder: your ${ct.label.toLowerCase()} is ${lead}`, body, "call_reminder", undefined, html);
}

export async function sendMissedYou(b: BookingEmailData): Promise<boolean> {
  const ct = CALL_TYPES[b.callType];
  const tz = b.userTimezone || "UTC";
  const body = [
    `Hi ${firstName(b.userName, b.userEmail)},`,
    ``,
    `We were looking forward to your ${ct.label.toLowerCase()} on ${whenLine(b.startMs, b.userEndMs, tz)}, but we did not manage to connect this time.`,
    ``,
    `No worries at all: you can grab a new time whenever it suits you from your dashboard under Book a Call. We would love to catch up with you.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].join("\n");
  const html = htmlFrom(body, [{ phrase: "Book a Call", href: BOOK_URL }]);
  return sendResend(b.userEmail, `We missed you: your ${ct.label.toLowerCase()}`, body, "call_missed", undefined, html);
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
  return sendResend(b.userEmail, `Cancelled: your ${ct.label.toLowerCase()}`, body, "call_cancellation", [
    { filename: "cancel.ics", content: icsBase64(cancelIcs) },
  ], html);
}
