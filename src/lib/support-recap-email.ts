// Support recap email: presentation + send.
//
// Turns a SweepReport (from support-sweep.ts) into a Gmail-safe HTML email (plus
// a plain-text fallback) and sends it to the owner inbox via Resend after every
// sweep. Same house style as digest-email.ts: pure HTML/CSS tables, no remote
// assets, no em dashes.

import type {
  SweepReport,
  NeedsYouItem,
  AutoSentItem,
  DraftItem,
} from "@/lib/support-sweep";
import { sendEmail } from "@/lib/email-send";

const FROM = "Influencer Butler <hello@influencerbutler.com>";
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
  <td width="25%" style="padding:6px;" valign="top">
    <div style="background:${bg};border-radius:14px;padding:14px 12px;text-align:center;">
      <div style="font-size:12px;color:${fg};font-weight:700;">${esc(label)}</div>
      <div style="font-size:30px;line-height:1.1;color:${C.ink};font-weight:800;margin-top:4px;">${esc(value)}</div>
    </div>
  </td>`;
}

function sectionHeader(text: string): string {
  return `<div style="font-size:16px;font-weight:800;color:${C.ink};margin:26px 0 8px;">${text}</div>`;
}

function needsYouTable(items: NeedsYouItem[]): string {
  if (items.length === 0) {
    return `<div style="font-size:13px;color:${C.sub};">Nothing is waiting on you. \u{1F389}</div>`;
  }
  const rows = items
    .map((t) => {
      const pill = t.priority
        ? `<span style="font-size:11px;font-weight:700;color:${t.priority === "P0" || t.priority === "P1" ? C.red : C.sub};">${esc(t.priority)}</span> `
        : "";
      return `<tr style="border-top:1px solid ${C.line};">
        <td style="padding:8px 6px 8px 0;vertical-align:top;">
          <a href="${esc(t.deepLink)}" style="color:${C.blue};font-weight:600;text-decoration:none;">${pill}${esc(t.title)}</a>
          <div style="font-size:12px;color:${C.sub};margin-top:2px;">${esc(t.reason)}</div>
        </td>
        <td align="right" style="padding:8px 0;vertical-align:top;white-space:nowrap;">
          <div style="font-size:12px;color:${C.ink};">${esc(t.userEmail || "anon")}</div>
          <div style="font-size:12px;color:${C.sub};">${esc(age(t.ageHrs))} old</div>
        </td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;">${rows}</table>`;
}

function replyCard(
  t: AutoSentItem | DraftItem,
  badge: string,
  badgeFg: string,
  badgeBg: string,
): string {
  const conf =
    "confidence" in t
      ? ` <span style="color:${C.sub};font-weight:400;">(${Math.round(t.confidence * 100)}% sure)</span>`
      : "";
  return `
  <div style="border:1px solid ${C.line};border-radius:12px;padding:12px 14px;margin:8px 0;">
    <div style="font-size:12px;">
      <span style="background:${badgeBg};color:${badgeFg};font-weight:700;border-radius:6px;padding:1px 6px;">${esc(badge)}</span>
      <a href="${esc(t.deepLink)}" style="color:${C.blue};font-weight:600;text-decoration:none;margin-left:6px;">${esc(t.title)}</a>${conf}
    </div>
    <div style="font-size:12px;color:${C.sub};margin-top:4px;">To: ${esc(t.userEmail || "anon")} &nbsp;·&nbsp; ${esc(t.subject)}</div>
    <div style="font-size:13px;color:${C.ink};margin-top:6px;white-space:pre-wrap;">${esc(t.body)}</div>
  </div>`;
}

function statusFooter(report: SweepReport): string {
  const entries = Object.entries(report.openByStatus);
  const line =
    entries.length === 0
      ? "No open tickets in the attention queue."
      : entries.map(([s, n]) => `${esc(s)}: <strong>${n}</strong>`).join(" &nbsp;·&nbsp; ");
  return `
  <div style="background:${C.panel};border-radius:14px;padding:16px 18px;margin-top:26px;">
    <div style="font-size:13px;font-weight:800;color:${C.ink};margin-bottom:8px;">\u{1F4CA} Attention queue right now</div>
    <div style="font-size:13px;color:${C.ink};">${line}</div>
    <div style="font-size:12px;color:${C.sub};margin-top:6px;">Swept ${report.swept} ticket(s). Oldest open: ${age(report.oldestAgeHrs)}.</div>
  </div>`;
}

export function recapSubject(report: SweepReport): string {
  const need = report.needsYou.length;
  const sent = report.autoSent.length;
  const bits = [`${need} need${need === 1 ? "s" : ""} you`];
  if (sent > 0) bits.push(`${sent} auto-answered`);
  else if (report.drafts.length > 0) bits.push(`${report.drafts.length} draft${report.drafts.length === 1 ? "" : "s"} ready`);
  const flag = need > 0 ? "\u{1F534} " : "✅ ";
  return `${flag}Support: ${bits.join(", ")}`;
}

export function renderSupportRecapHtml(report: SweepReport): string {
  const needN = report.needsYou.length;
  const modeNote =
    report.mode === "live"
      ? "Auto-send is ON. Clear-cut how-to questions were answered automatically."
      : report.mode === "shadow"
        ? "Shadow mode: nothing was sent to customers. The drafts below are waiting for your OK. Set SUPPORT_SWEEP_ENABLED=true to let them send automatically."
        : "Dry run: nothing was sent or changed.";

  const tiles = `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      ${statTile("Needs you", String(needN), needN > 0 ? C.red : C.green, needN > 0 ? C.redBg : C.greenBg)}
      ${statTile("Auto-answered", String(report.autoSent.length), C.green, C.greenBg)}
      ${statTile("Drafts held", String(report.drafts.length), C.amber, C.amberBg)}
      ${statTile("Oldest open", age(report.oldestAgeHrs), C.blue, C.blueBg)}
    </tr>
  </table>`;

  const autoSection =
    report.autoSent.length > 0
      ? sectionHeader("✅ Handled automatically") +
        report.autoSent.map((t) => replyCard(t, "SENT", C.green, C.greenBg)).join("")
      : "";

  const draftSection =
    report.drafts.length > 0
      ? sectionHeader("✍️ Drafts awaiting your OK") +
        report.drafts.map((t) => replyCard(t, "DRAFT", C.amber, C.amberBg)).join("")
      : "";

  const errorNote =
    report.errors.length > 0
      ? `<div style="font-size:12px;color:${C.amber};background:${C.amberBg};border-radius:10px;padding:8px 12px;margin-top:16px;">Some tickets could not be processed: ${esc(report.errors.slice(0, 5).join("; "))}</div>`
      : "";

  return `
<div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">
        <tr><td style="background:${C.card};border-radius:20px;padding:28px 26px;">

          <div style="font-size:22px;font-weight:800;color:${C.ink};">Support check-in \u{1F4EC}</div>
          <div style="font-size:13px;color:${C.sub};margin-top:2px;">${esc(modeNote)}</div>

          ${sectionHeader("At a glance")}
          ${tiles}

          ${sectionHeader("\u{1F534} Still needs YOU")}
          ${needsYouTable(report.needsYou)}

          ${autoSection}
          ${draftSection}
          ${statusFooter(report)}
          ${errorNote}

          <div style="font-size:11px;color:${C.sub};margin-top:22px;border-top:1px solid ${C.line};padding-top:14px;">
            You get this after every support sweep (a few times a day in business hours). Click any ticket to open it in the admin dashboard.
          </div>

        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

export function renderSupportRecapText(report: SweepReport): string {
  const lines: string[] = [
    `Support check-in (${report.mode})`,
    `Needs you: ${report.needsYou.length}  |  Auto-answered: ${report.autoSent.length}  |  Drafts held: ${report.drafts.length}  |  Oldest open: ${age(report.oldestAgeHrs)}`,
    ``,
    `Still needs you:`,
  ];
  if (report.needsYou.length === 0) lines.push(`  Nothing waiting on you.`);
  else
    for (const t of report.needsYou)
      lines.push(`  [${t.priority || "-"}] ${t.title} (${age(t.ageHrs)}) - ${t.reason}\n    ${t.deepLink}`);
  if (report.autoSent.length) {
    lines.push(``, `Handled automatically:`);
    for (const t of report.autoSent) lines.push(`  ${t.title} -> ${t.userEmail}`);
  }
  if (report.drafts.length) {
    lines.push(``, `Drafts awaiting your OK:`);
    for (const t of report.drafts) lines.push(`  ${t.title} -> ${t.userEmail}\n    ${t.deepLink}`);
  }
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

export async function sendSupportRecap(
  report: SweepReport,
): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.log("support-recap: skipped (RESEND_API_KEY not set)");
    return { ok: false, skipped: "not_configured" };
  }
  const subject = recapSubject(report);
  const html = renderSupportRecapHtml(report);
  const text = renderSupportRecapText(report);
  const results = await Promise.all(
    recipients().map((to) =>
      sendEmail({ from: FROM, to, subject, html, text, category: "support_recap" }),
    ),
  );
  if (!results.every((r) => r.ok)) return { ok: false, skipped: "send_failed" };
  return { ok: true };
}
