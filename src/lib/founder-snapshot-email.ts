// Founder Snapshot email: a live KPI digest of how the business is doing,
// mailed to the owner on the 1st and 15th by /api/cron/founder-snapshot.
//
// Email-safe HTML only: a centered table layout with inline styles and
// web-safe fonts (no external fonts, no <style> media queries, no script), so
// it renders in Gmail/Outlook/Apple Mail. The numbers come from the same
// engines the admin Growth + Overview pages use, so this stays in sync with the
// dashboard without duplicating any query logic.

export type SnapshotKpi = {
  label: string;
  value: string;
  /** Month-over-month change as a fraction (0.1 = +10%), or null when N/A. */
  delta: number | null;
  /** For a "watch" number (e.g. money owed), up is not necessarily good. */
  higherIsBetter?: boolean;
};

export type SnapshotAffiliates = {
  total: number;
  producing: number;
  dormant: number;
  owedCents: number;
};

export type SnapshotTraffic = {
  activeUsers: number;
  activeUsersDelta: number | null;
  newUsers: number;
  channels: { channel: string; sessions: number }[];
};

export type FounderSnapshotData = {
  periodLabel: string; // e.g. "August 2026" or "September 2026 (through the 15th)"
  generatedLabel: string; // e.g. "26 Aug 2026"
  kpis: SnapshotKpi[];
  affiliates: SnapshotAffiliates | null;
  traffic: SnapshotTraffic | null;
};

const BRAND = "#ea6a1e";
const INK = "#1c1714";
const MUTED = "#6b6259";
const LINE = "#e7e1d8";
const GOOD = "#157f4a";
const BAD = "#c02b2b";
const CARD_BG = "#faf8f4";
const FONT = "Arial, Helvetica, sans-serif";

export function formatMoneyCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatInt(n: number): string {
  return n.toLocaleString("en-US");
}

/** "+12%" / "-8%" / "flat", with color, or empty when delta is null. */
function deltaBadge(delta: number | null, higherIsBetter: boolean): string {
  if (delta === null) return "";
  const pct = Math.round(delta * 100);
  if (pct === 0) {
    return `<span style="font-size:12px;color:${MUTED};">flat</span>`;
  }
  const up = pct > 0;
  const good = higherIsBetter ? up : !up;
  const color = good ? GOOD : BAD;
  const arrow = up ? "&#9650;" : "&#9660;"; // triangle up/down
  return `<span style="font-size:12px;color:${color};font-weight:bold;white-space:nowrap;">${arrow} ${Math.abs(pct)}%</span>`;
}

function kpiCell(kpi: SnapshotKpi): string {
  const badge = deltaBadge(kpi.delta, kpi.higherIsBetter !== false);
  return `
    <td width="50%" valign="top" style="padding:6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${LINE};border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <div style="font-size:12px;color:${MUTED};font-family:${FONT};line-height:1.3;">${kpi.label}</div>
          <div style="font-size:26px;color:${INK};font-family:${FONT};font-weight:bold;padding-top:4px;line-height:1.1;">${kpi.value}</div>
          <div style="padding-top:4px;">${badge || "&nbsp;"}</div>
        </td></tr>
      </table>
    </td>`;
}

function kpiGrid(kpis: SnapshotKpi[]): string {
  const rows: string[] = [];
  for (let i = 0; i < kpis.length; i += 2) {
    const left = kpiCell(kpis[i]);
    const right = kpis[i + 1] ? kpiCell(kpis[i + 1]) : `<td width="50%" style="padding:6px;">&nbsp;</td>`;
    rows.push(`<tr>${left}${right}</tr>`);
  }
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table>`;
}

function sectionHeading(text: string): string {
  return `<div style="font-size:13px;letter-spacing:1px;text-transform:uppercase;color:${BRAND};font-family:${FONT};font-weight:bold;padding:22px 6px 8px;">${text}</div>`;
}

function affiliatesBlock(a: SnapshotAffiliates): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${LINE};border-radius:10px;">
      <tr><td style="padding:16px 18px;font-family:${FONT};color:${INK};font-size:14px;line-height:1.6;">
        <strong>${formatInt(a.producing)}</strong> of <strong>${formatInt(a.total)}</strong> affiliates are producing referrals;
        <strong>${formatInt(a.dormant)}</strong> are still dormant.<br>
        <span style="color:${MUTED};">Outstanding commission owed:</span> <strong>${formatMoneyCents(a.owedCents)}</strong>
      </td></tr>
    </table>`;
}

function trafficBlock(t: SnapshotTraffic): string {
  const maxSessions = Math.max(1, ...t.channels.map((c) => c.sessions));
  const bars = t.channels
    .slice(0, 6)
    .map((c) => {
      const pct = Math.round((c.sessions / maxSessions) * 100);
      return `
        <tr>
          <td width="42%" style="font-family:${FONT};font-size:13px;color:${MUTED};padding:3px 8px 3px 0;">${c.channel}</td>
          <td width="43%" style="padding:3px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
              <td style="background:${BRAND};height:8px;border-radius:4px;width:${pct}%;line-height:8px;font-size:0;">&nbsp;</td>
              <td>&nbsp;</td>
            </tr></table>
          </td>
          <td width="15%" align="right" style="font-family:${FONT};font-size:13px;color:${INK};padding:3px 0;">${formatInt(c.sessions)}</td>
        </tr>`;
    })
    .join("");
  const delta = deltaBadge(t.activeUsersDelta, true);
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CARD_BG};border:1px solid ${LINE};border-radius:10px;">
      <tr><td style="padding:16px 18px;font-family:${FONT};color:${INK};">
        <div style="font-size:14px;line-height:1.6;">
          <strong>${formatInt(t.activeUsers)}</strong> active users in the last 28 days ${delta}
          &nbsp;&middot;&nbsp; <span style="color:${MUTED};">${formatInt(t.newUsers)} new</span>
        </div>
        <div style="font-size:12px;color:${MUTED};padding:10px 0 4px;">Where visitors come from</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${bars}</table>
      </td></tr>
    </table>`;
}

export function buildFounderSnapshotEmail(data: FounderSnapshotData): {
  subject: string;
  html: string;
  text: string;
} {
  const subject = `Founder Snapshot: ${data.periodLabel}`;

  const affiliates = data.affiliates ? affiliatesBlock(data.affiliates) : "";
  const traffic = data.traffic ? trafficBlock(data.traffic) : "";

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2efe9;padding:24px 12px;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid ${LINE};border-radius:14px;overflow:hidden;">
      <tr><td style="padding:26px 26px 18px;border-bottom:1px solid ${LINE};">
        <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:${BRAND};font-family:${FONT};font-weight:bold;">Influencer Butler // Founder Snapshot</div>
        <div style="font-size:24px;color:${INK};font-family:${FONT};font-weight:bold;padding-top:8px;line-height:1.15;">The funnel converts. Now feed it.</div>
        <div style="font-size:13px;color:${MUTED};font-family:${FONT};padding-top:8px;">Reporting period: ${data.periodLabel}</div>
      </td></tr>
      <tr><td style="padding:16px 20px 8px;">
        ${sectionHeading("The vital signs")}
        ${kpiGrid(data.kpis)}
        ${affiliates ? sectionHeading("Affiliates") + affiliates : ""}
        ${traffic ? sectionHeading("Traffic") + traffic : ""}
      </td></tr>
      <tr><td style="padding:18px 26px 26px;border-top:1px solid ${LINE};">
        <div style="font-size:12px;color:${MUTED};font-family:${FONT};line-height:1.6;">
          Numbers pulled live on ${data.generatedLabel} from your own subscriptions, orders, affiliate, and analytics data. Month-over-month deltas compare to the prior calendar month. Open the admin Growth dashboard for the full picture.
        </div>
      </td></tr>
    </table>
  </td></tr>
</table>`.trim();

  // Plain-text fallback.
  const textLines: string[] = [
    `INFLUENCER BUTLER // FOUNDER SNAPSHOT`,
    `The funnel converts. Now feed it.`,
    `Reporting period: ${data.periodLabel}`,
    ``,
    `THE VITAL SIGNS`,
  ];
  for (const k of data.kpis) {
    const d =
      k.delta === null
        ? ""
        : ` (${k.delta >= 0 ? "+" : ""}${Math.round(k.delta * 100)}% MoM)`;
    textLines.push(`  ${k.label}: ${k.value}${d}`);
  }
  if (data.affiliates) {
    textLines.push(
      ``,
      `AFFILIATES`,
      `  ${data.affiliates.producing} of ${data.affiliates.total} producing, ${data.affiliates.dormant} dormant.`,
      `  Commission owed: ${formatMoneyCents(data.affiliates.owedCents)}`,
    );
  }
  if (data.traffic) {
    textLines.push(
      ``,
      `TRAFFIC (last 28 days)`,
      `  ${formatInt(data.traffic.activeUsers)} active users, ${formatInt(data.traffic.newUsers)} new`,
      ...data.traffic.channels.slice(0, 6).map((c) => `    ${c.channel}: ${formatInt(c.sessions)}`),
    );
  }
  textLines.push(``, `Numbers pulled live on ${data.generatedLabel}.`);

  return { subject, html, text: textLines.join("\n") };
}
