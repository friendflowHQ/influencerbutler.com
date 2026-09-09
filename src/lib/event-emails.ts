/**
 * Transactional emails for group events (registration confirmation, day-before
 * reminder, and the post-call AI recap). Posts directly to the Resend API (the
 * repo's transactional convention: no unsubscribe footer), from
 * "Influencer Butler <hello@influencerbutler.com>", plain text + email-safe
 * HTML, with an optional .ics attachment. No em-dashes in customer-facing copy.
 *
 * Modeled on src/lib/call-emails.ts.
 */
import { DateTime } from "luxon";
import { buildIcs, icsBase64 } from "./ics";
import { bodyToHtml } from "./newsletter";
import { sendEmail } from "@/lib/email-send";
import type { AiNotes } from "@/lib/ai-notes";

const FROM = "Influencer Butler <hello@influencerbutler.com>";
const ORGANIZER_EMAIL = "hello@influencerbutler.com";
const SITE = process.env.SITE_URL ?? process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.influencerbutler.com";
const EVENTS_URL = `${SITE}/dashboard/events`;

export type EventEmailData = {
  id: string;
  title: string;
  description?: string | null;
  startMs: number;
  endMs: number;
  joinUrl?: string | null;
  toEmail: string;
  toName?: string | null;
  timezone?: string | null; // recipient display TZ (falls back to the event TZ)
  imageUrl?: string | null; // branded cover, embedded at the top of the email
};

type Attachment = { filename: string; content: string };

/** Email-safe cover image block, prepended to the HTML body when present. */
function imageBlock(url?: string | null): string {
  if (!url) return "";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return (
    `<img src="${esc(url)}" alt="" width="600" ` +
    `style="display:block;width:100%;max-width:600px;height:auto;border-radius:12px;margin:0 0 16px;" />`
  );
}

function htmlFrom(text: string, links: { phrase: string; href: string }[]): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let html = bodyToHtml(text);
  for (const { phrase, href } of links) {
    const anchor = `<a href="${esc(href)}" style="color:#f97316;text-decoration:underline;">${esc(phrase)}</a>`;
    html = html.split(esc(phrase)).join(anchor);
  }
  return html;
}

async function sendResend(
  to: string,
  subject: string,
  text: string,
  category: string,
  attachments?: Attachment[],
  html?: string,
): Promise<boolean> {
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

function icsAttachment(e: EventEmailData, method: "REQUEST" | "CANCEL" = "REQUEST"): Attachment {
  const ics = buildIcs({
    uid: `event-${e.id}@influencerbutler.com`,
    startMs: e.startMs,
    endMs: e.endMs,
    summary: e.title,
    description: [e.description || "", e.joinUrl ? `Join: ${e.joinUrl}` : ""].filter(Boolean).join("\n"),
    location: e.joinUrl || undefined,
    conferenceUrl: e.joinUrl || undefined,
    organizerEmail: ORGANIZER_EMAIL,
    attendeeEmail: e.toEmail,
    attendeeName: e.toName || undefined,
    method,
  });
  return { filename: "invite.ics", content: icsBase64(ics) };
}

export async function sendEventRegistrationConfirmation(e: EventEmailData): Promise<boolean> {
  const tz = e.timezone || "UTC";
  const body = [
    `Hi ${firstName(e.toName, e.toEmail)},`,
    ``,
    `You are registered for ${e.title}:`,
    ``,
    whenLine(e.startMs, e.endMs, tz),
    e.joinUrl ? `Join link: ${e.joinUrl}` : `The join link will be emailed to you before it starts.`,
    e.description ? `\n${e.description}` : "",
    ``,
    `A calendar invite is attached, so it will drop straight onto your calendar.`,
    `You can see all upcoming events any time from your dashboard under Upcoming Events.`,
    `This session is recorded and AI-summarized, and we will email you the highlights afterward.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].filter((l) => l !== "").join("\n");
  const html =
    imageBlock(e.imageUrl) +
    htmlFrom(body, [
      { phrase: "Upcoming Events", href: EVENTS_URL },
      ...(e.joinUrl ? [{ phrase: e.joinUrl, href: e.joinUrl }] : []),
    ]);
  return sendResend(e.toEmail, `You are registered: ${e.title}`, body, "event_confirmation", [icsAttachment(e)], html);
}

export async function sendEventReminder(e: EventEmailData, which: "24h" | "1h"): Promise<boolean> {
  const tz = e.timezone || "UTC";
  const lead = which === "24h" ? "tomorrow" : "in about an hour";
  const body = [
    `Hi ${firstName(e.toName, e.toEmail)},`,
    ``,
    `A reminder that ${e.title} is ${lead}:`,
    ``,
    whenLine(e.startMs, e.endMs, tz),
    e.joinUrl ? `Join link: ${e.joinUrl}` : `The join link will be emailed shortly.`,
    ``,
    `See you there.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  ].join("\n");
  const html =
    imageBlock(e.imageUrl) + htmlFrom(body, e.joinUrl ? [{ phrase: e.joinUrl, href: e.joinUrl }] : []);
  return sendResend(e.toEmail, `Reminder: ${e.title} is ${lead}`, body, "event_reminder", [icsAttachment(e)], html);
}

/**
 * Post-call recap: highlights, action items, and tips discussed on the call.
 * `notes` comes from the AI summarizer; sections with nothing are omitted.
 */
export async function sendEventRecap(
  e: EventEmailData,
  notes: AiNotes,
  recordingUrl: string | null,
): Promise<boolean> {
  const lines: string[] = [
    `Hi ${firstName(e.toName, e.toEmail)},`,
    ``,
    `Thanks for joining ${e.title}. Here is a quick recap:`,
  ];
  if (notes.summary) {
    lines.push(``, notes.summary);
  }
  if (notes.actionItems.length) {
    lines.push(``, `Action items:`);
    for (const item of notes.actionItems) lines.push(`- ${item}`);
  }
  if (notes.keyTopics.length) {
    lines.push(``, `Tips and topics covered:`);
    for (const t of notes.keyTopics) lines.push(`- ${t}`);
  }
  if (notes.followUps.length) {
    lines.push(``, `Follow-ups:`);
    for (const f of notes.followUps) lines.push(`- ${f}`);
  }
  if (recordingUrl) {
    lines.push(``, `Recording: ${recordingUrl}`);
  }
  lines.push(
    ``,
    `You can find upcoming events any time from your dashboard under Upcoming Events.`,
    ``,
    `Warmly,`,
    `Your Influencer Butler Team`,
  );
  const body = lines.join("\n");
  const html = htmlFrom(body, [
    { phrase: "Upcoming Events", href: EVENTS_URL },
    ...(recordingUrl ? [{ phrase: recordingUrl, href: recordingUrl }] : []),
  ]);
  return sendResend(e.toEmail, `Recap: ${e.title}`, body, "event_recap", undefined, html);
}
