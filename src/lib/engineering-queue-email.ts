// Engineering-queue recap email: presentation + send.
//
// Turns an EngQueueReport (from engineering-queue.ts) into a Gmail-safe HTML
// email (plus plain-text fallback) for the owner. Quiet runs are NOT emailed:
// it goes out only when there are NEW items in the queue since last run, or the
// run hit errors. Everything else is visible to the routine via the list
// endpoint. Same house style as support-recap-email.ts: pure HTML/CSS tables,
// no remote assets, no em dashes.

import type { EngItem, EngQueueReport } from "@/lib/engineering-queue";
import { sendEmail } from "@/lib/email-send";
import { transactionalFrom } from "@/lib/email-senders";

const FROM = transactionalFrom();
const FALLBACK_RECIPIENT = "thesocialmediaposse@gmail.com";

const C = {
  ink: "#111827",
  sub: "#6b7280",
  line: "#e5e7eb",
  panel: "#f9fafb",
  card: "#ffffff",
  green: "#16a34a",
  greenBg: "#dcfce7",
  blue: "#2563eb",
  blueBg: "#dbeafe",
  amber: "#d97706",
  amberBg: "#fef3c7",
  red: "#dc2626",
  redBg: "#fee2e2",
  purple: "#7c3aed",
  purpleBg: "#ede9fe",
};

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function age(hrs: number | null): string {
  if (hrs == null) return "unknown";
  if (hrs < 1) return `${Math.round(hrs * 60)}m`;
  if (hrs < 48) return `${Math.round(hrs)}h`;
  return `${Math.round(hrs / 24)}d`;
}

function statTile(label: string, value: string, fg: string, bg: string): string {
  return `
  <td width="33%" style="padding:6px;" valign="top">
    <div style="background:${bg};border-radius:14px;padding:14px 12px;text-align:center;">
      <div style="font-size:12px;color:${fg};font-weight:700;">${esc(label)}</div>
      <div style="font-size:30px;line-height:1.1;color:${C.ink};font-weight:800;margin-top:4px;">${esc(value)}</div>
    </div>
  </td>`;
}

function sectionHeader(text: string): string {
  return `<div style="font-size:16px;font-weight:800;color:${C.ink};margin:26px 0 8px;">${text}</div>`;
}

function itemRow(it: EngItem): string {
  const kind = it.classification === "bug" ? "BUG" : "FEATURE";
  const kindFg = it.classification === "bug" ? C.red : C.purple;
  const kindBg = it.classification === "bug" ? C.redBg : C.purpleBg;
  const pri = it.priority
    ? ` <span style="font-size:11px;font-weight:700;color:${it.priority === "P0" || it.priority === "P1" ? C.red : C.sub};">${esc(it.priority)}</span>`
    : "";
  const freq = it.frequency > 1 ? ` <span style="font-size:11px;color:${C.sub};">x${it.frequency} reporters</span>` : "";
  const isNew = it.isNew ? ` <span style="font-size:10px;font-weight:700;color:${C.green};">NEW</span>` : "";
  return `<tr style="border-top:1px solid ${C.line};">
    <td style="padding:8px 6px 8px 0;vertical-align:top;">
      <span style="background:${kindBg};color:${kindFg};font-weight:700;border-radius:6px;padding:1px 6px;font-size:11px;">${kind}</span>${pri}${isNew}
      <a href="${esc(it.deepLink)}" style="color:${C.blue};font-weight:600;text-decoration:none;margin-left:6px;">${esc(it.title)}</a>${freq}
      <div style="font-size:12px;color:${C.sub};margin-top:2px;">${esc(it.description.slice(0, 200))}</div>
    </td>
    <td align="right" style="padding:8px 0;vertical-align:top;white-space:nowrap;">
      <div style="font-size:12px;color:${C.sub};">${esc(age(it.ageHrs))} old</div>
      ${it.working ? `<div style="font-size:11px;color:${C.amber};">in progress</div>` : ""}
    </td>
  </tr>`;
}

export function recapSubject(report: EngQueueReport): string {
  const news = report.queued.filter((i) => i.isNew).length;
  const bugs = report.queued.filter((i) => i.classification === "bug").length;
  const flag = news > 0 ? "\u{1F6E0} " : "\u{2705} ";
  return `${flag}Engineering queue: ${report.queued.length} open (${news} new, ${bugs} bug${bugs === 1 ? "" : "s"})`;
}

export function renderEngRecapHtml(report: EngQueueReport): string {
  const news = report.queued.filter((i) => i.isNew).length;
  const bugs = report.queued.filter((i) => i.classification === "bug").length;
  const feats = report.queued.length - bugs;
  const modeNote =
    report.mode === "live"
      ? "Live: queued items are tagged on the support Worker so the routine can pick them up."
      : report.mode === "shadow"
        ? "Shadow mode: nothing was tagged or changed. Set ENG_AUTOPILOT_ENABLED=true to let the routine claim items."
        : "Dry run: nothing was tagged or changed.";

  const tiles = `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      ${statTile("New this run", String(news), news > 0 ? C.green : C.sub, news > 0 ? C.greenBg : C.panel)}
      ${statTile("Open bugs", String(bugs), C.red, C.redBg)}
      ${statTile("Feature asks", String(feats), C.purple, C.purpleBg)}
    </tr>
  </table>`;

  const list =
    report.queued.length > 0
      ? `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;">${report.queued.map(itemRow).join("")}</table>`
      : `<div style="font-size:13px;color:${C.sub};">Queue is empty. \u{1F389}</div>`;

  const errorNote =
    report.errors.length > 0
      ? `<div style="font-size:12px;color:${C.amber};background:${C.amberBg};border-radius:10px;padding:8px 12px;margin-top:16px;">Some sources could not be pulled: ${esc(report.errors.slice(0, 5).join("; "))}</div>`
      : "";

  return `
<div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">
        <tr><td style="background:${C.card};border-radius:20px;padding:28px 26px;">

          <div style="font-size:22px;font-weight:800;color:${C.ink};">Engineering queue \u{1F916}</div>
          <div style="font-size:13px;color:${C.sub};margin-top:2px;">${esc(modeNote)}</div>

          ${sectionHeader("At a glance")}
          ${tiles}

          ${sectionHeader("Ready to work (deduped, ranked)")}
          ${list}
          ${errorNote}

          <div style="font-size:11px;color:${C.sub};margin-top:22px;border-top:1px solid ${C.line};padding-top:14px;">
            Pulled ${report.pulled} bug/feature ticket(s) across calls, the desktop app, the extension, and chat, then deduped them into the items above. The routine works these one by one and opens a PR you review. You only get this email when there are new items or a pull failed.
          </div>

        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

export function renderEngRecapText(report: EngQueueReport): string {
  const lines: string[] = [
    `Engineering queue (${report.mode})`,
    `Open: ${report.queued.length}  |  New this run: ${report.queued.filter((i) => i.isNew).length}  |  Pulled: ${report.pulled}`,
    ``,
  ];
  for (const it of report.queued) {
    lines.push(
      `  [${it.classification.toUpperCase()}${it.priority ? " " + it.priority : ""}${it.isNew ? " NEW" : ""}] ${it.title}` +
        (it.frequency > 1 ? ` (x${it.frequency})` : "") +
        `\n    ${it.deepLink}`,
    );
  }
  if (report.errors.length) lines.push(``, `Errors: ${report.errors.join("; ")}`);
  return lines.join("\n");
}

function recipients(): string[] {
  const raw = process.env.DIGEST_RECIPIENT || process.env.ADMIN_EMAILS || FALLBACK_RECIPIENT;
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  return list.length > 0 ? list : [FALLBACK_RECIPIENT];
}

export async function sendEngRecap(
  report: EngQueueReport,
): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.log("eng-recap: skipped (RESEND_API_KEY not set)");
    return { ok: false, skipped: "not_configured" };
  }
  // Quiet run: no new items and no errors. The routine sees the full queue via
  // the list endpoint, so there is nothing for the owner to look at.
  const hasNew = report.queued.some((i) => i.isNew);
  if (!hasNew && report.errors.length === 0) {
    console.log("eng-recap: skipped (quiet run, no new items)");
    return { ok: true, skipped: "quiet" };
  }
  const subject = recapSubject(report);
  const html = renderEngRecapHtml(report);
  const text = renderEngRecapText(report);
  const results = await Promise.all(
    recipients().map((to) =>
      sendEmail({ from: FROM, to, subject, html, text, category: "eng_queue_recap" }),
    ),
  );
  if (!results.every((r) => r.ok)) return { ok: false, skipped: "send_failed" };
  return { ok: true };
}
