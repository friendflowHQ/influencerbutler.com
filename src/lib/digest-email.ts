// Daily-digest presentation + send.
//
// Turns a DigestData object into a pretty, ADHD-friendly HTML email (and a
// plain-text fallback) and sends it to the owner inbox via Resend. Charts are
// pure HTML/CSS tables so they render everywhere (Gmail strips SVG and often
// blocks external images); nothing here loads a remote asset.
//
// Repo rule: no em dashes anywhere. Use ":" for label/value and "-" for breaks.

import type {
  DigestData,
  DigestMetric,
  DigestSeries,
  LocationCount,
} from "@/lib/daily-digest";
import { sendEmail } from "@/lib/email-send";

const FROM = "Influencer Butler <hello@influencerbutler.com>";
const FALLBACK_RECIPIENT = "thesocialmediaposse@gmail.com";

// Palette: green = growth, blue = neutral, amber = watch, red = churn.
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
  bar: "#93c5fd",
  barStrong: "#2563eb",
};

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function money(cents: number | null): string {
  if (cents === null) return "n/a";
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function delta(frac: number | null): { text: string; color: string } {
  if (frac === null) return { text: "", color: C.sub };
  const pct = Math.round(frac * 100);
  if (pct === 0) return { text: "no change vs last month", color: C.sub };
  const up = pct > 0;
  return {
    text: `${up ? "↑" : "↓"} ${Math.abs(pct)}% vs last month`,
    color: up ? C.green : C.red,
  };
}

function fmtDay(iso: string | null, tz: string): string {
  if (!iso) return "n/a";
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return "n/a";
  }
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** A colored headline stat tile. */
function statTile(
  label: string,
  value: string,
  emoji: string,
  fg: string,
  bg: string,
  metric?: DigestMetric,
): string {
  const d = metric ? delta(metric.momDelta) : { text: "", color: C.sub };
  const mtd =
    metric && metric.mtd !== null
      ? `<div style="font-size:12px;color:${C.sub};margin-top:2px;">${metric.mtd} this month</div>`
      : "";
  const deltaLine = d.text
    ? `<div style="font-size:11px;color:${d.color};margin-top:4px;font-weight:600;">${d.text}</div>`
    : "";
  return `
  <td width="50%" style="padding:6px;" valign="top">
    <div style="background:${bg};border-radius:14px;padding:16px 18px;">
      <div style="font-size:13px;color:${fg};font-weight:700;">${emoji} ${esc(label)}</div>
      <div style="font-size:34px;line-height:1.1;color:${C.ink};font-weight:800;margin-top:6px;">${esc(value)}</div>
      ${mtd}
      ${deltaLine}
    </div>
  </td>`;
}

/** A compact vertical bar chart from a day series (last N days). */
function barChart(series: DigestSeries, tz: string, color: string): string {
  const vals = series.values;
  const max = Math.max(1, ...vals);
  const cells = vals
    .map((v, i) => {
      const h = Math.max(3, Math.round((v / max) * 90));
      const isLast = i === vals.length - 1;
      const day = series.labels[i]?.slice(8) ?? "";
      const bg = isLast ? C.barStrong : color;
      return `
      <td valign="bottom" align="center" style="padding:0 2px;">
        <div style="font-size:10px;color:${C.sub};margin-bottom:3px;height:12px;">${v > 0 ? v : ""}</div>
        <div style="width:16px;height:${h}px;background:${bg};border-radius:4px 4px 0 0;"></div>
        <div style="font-size:9px;color:${C.sub};margin-top:4px;">${esc(day)}</div>
      </td>`;
    })
    .join("");
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:8px;">
    <tr>${cells}</tr>
  </table>
  <div style="font-size:11px;color:${C.sub};margin-top:6px;">Last ${vals.length} days (times in ${esc(tzShort(tz))})</div>`;
}

function tzShort(tz: string): string {
  const map: Record<string, string> = {
    "America/Denver": "Mountain",
    "America/Phoenix": "Arizona",
    "America/Los_Angeles": "Pacific",
    "America/Chicago": "Central",
    "America/New_York": "Eastern",
  };
  return map[tz] ?? tz;
}

/** Horizontal proportional bars for the location breakdown. */
function locationBars(locations: LocationCount[]): string {
  if (locations.length === 0) {
    return `<div style="font-size:13px;color:${C.sub};padding:4px 0;">No trial clicks in this window.</div>`;
  }
  const max = Math.max(1, ...locations.map((l) => l.count));
  return locations
    .map((l) => {
      const w = Math.max(6, Math.round((l.count / max) * 100));
      return `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:4px 0;">
        <tr>
          <td width="55%" style="font-size:13px;color:${C.ink};padding-right:8px;">${esc(l.label)}</td>
          <td width="35%">
            <div style="background:${C.blueBg};border-radius:6px;height:14px;">
              <div style="width:${w}%;background:${C.barStrong};border-radius:6px;height:14px;"></div>
            </div>
          </td>
          <td width="10%" align="right" style="font-size:13px;color:${C.ink};font-weight:700;">${l.count}</td>
        </tr>
      </table>`;
    })
    .join("");
}

function sectionHeader(text: string): string {
  return `<div style="font-size:16px;font-weight:800;color:${C.ink};margin:26px 0 8px;">${text}</div>`;
}

// ---------------------------------------------------------------------------
// HTML render
// ---------------------------------------------------------------------------

export function renderDigestHtml(d: DigestData): string {
  const m = d.metrics;
  const greeting = d.variant === "morning" ? "Good morning" : "Evening update";

  const tiles = `
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      ${statTile("Trial clicks", String(m.trialClicks.window), "\u{1F5B1}️", C.blue, C.blueBg, m.trialClicks)}
      ${statTile("Trials started", String(m.trialsStarted.window), "\u{1F680}", C.green, C.greenBg, m.trialsStarted)}
    </tr>
    <tr>
      ${statTile("Conversions", m.conversions.mtd === null ? String(m.conversions.window) : String(m.conversions.window), "\u{1F4B3}", C.purple, C.purpleBg, m.conversions)}
      ${statTile("New subscriptions", String(m.newSubs.window), "⭐", C.green, C.greenBg, m.newSubs)}
    </tr>
    <tr>
      ${statTile("Revenue", money(m.revenueCents.window), "\u{1F4B0}", C.amber, C.amberBg, m.revenueCents)}
      ${statTile("Cancellations", String(m.cancellations.window), "\u{1F44B}", C.red, C.redBg, m.cancellations)}
    </tr>
  </table>`;

  const onTrial =
    d.onTrialList.length === 0
      ? `<div style="font-size:13px;color:${C.sub};">Nobody is on trial right now.</div>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;">
          <tr style="color:${C.sub};text-align:left;">
            <th align="left" style="padding:4px 0;font-weight:600;">Who</th>
            <th align="left" style="padding:4px 0;font-weight:600;">Plan</th>
            <th align="left" style="padding:4px 0;font-weight:600;">Trial ends</th>
          </tr>
          ${d.onTrialList
            .map(
              (t) => `<tr style="border-top:1px solid ${C.line};">
            <td style="padding:6px 0;color:${C.ink};">${esc(t.emailMasked ?? "unknown")}</td>
            <td style="padding:6px 0;color:${C.ink};">${esc(t.plan ?? "-")}</td>
            <td style="padding:6px 0;color:${C.ink};">${fmtDay(t.renewsAt, d.tz)}</td>
          </tr>`,
            )
            .join("")}
        </table>`;

  const cancelReasons =
    d.cancellations.reasonCounts.length > 0
      ? `<div style="font-size:13px;color:${C.ink};margin-top:8px;">${d.cancellations.reasonCounts
          .map((r) => `${esc(r.label)}: <strong>${r.count}</strong>`)
          .join(" &nbsp;·&nbsp; ")}</div>`
      : "";
  const cancelBody =
    d.cancellations.recent.length === 0
      ? `<div style="font-size:13px;color:${C.sub};">No cancellations in this window. \u{1F389}</div>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;">
          ${d.cancellations.recent
            .map(
              (c) => `<tr style="border-top:1px solid ${C.line};">
            <td style="padding:6px 0;color:${C.ink};">${esc(c.emailMasked ?? "unknown")}</td>
            <td style="padding:6px 0;color:${C.ink};">${esc(c.reasonLabel)}</td>
            <td style="padding:6px 0;color:${C.sub};">${c.wouldReturn ? `may return: ${esc(c.wouldReturn)}` : ""}</td>
          </tr>`,
            )
            .join("")}
        </table>`;
  const coverage =
    d.cancellations.unsurveyedEnded && d.cancellations.unsurveyedEnded > 0
      ? `<div style="font-size:12px;color:${C.sub};margin-top:6px;">${d.cancellations.unsurveyedEnded} ended subscription(s) left no reason on file.</div>`
      : "";

  const footer = `
  <div style="background:${C.panel};border-radius:14px;padding:18px 20px;margin-top:26px;">
    <div style="font-size:13px;font-weight:800;color:${C.ink};margin-bottom:10px;">\u{1F4CA} Running totals: ${esc(d.monthLabel)}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="font-size:13px;color:${C.ink};">
      <tr>
        <td style="padding:3px 0;">Active subscribers</td><td align="right" style="font-weight:700;">${d.running.activeSubscribers ?? "n/a"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">On trial right now</td><td align="right" style="font-weight:700;">${d.running.onTrialNow ?? "n/a"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">Trial clicks this month</td><td align="right" style="font-weight:700;">${m.trialClicks.mtd ?? "n/a"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">Trials started this month</td><td align="right" style="font-weight:700;">${m.trialsStarted.mtd ?? "n/a"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">New subscriptions this month</td><td align="right" style="font-weight:700;">${m.newSubs.mtd ?? "n/a"}</td>
      </tr>
      <tr>
        <td style="padding:3px 0;">Revenue this month</td><td align="right" style="font-weight:700;">${money(d.running.revenueMtdCents)}</td>
      </tr>
    </table>
  </div>`;

  const migrationNote = d.migrationPending
    ? `<div style="font-size:12px;color:${C.amber};background:${C.amberBg};border-radius:10px;padding:8px 12px;margin-top:16px;">Heads up: trial-conversion tracking is not fully live in production yet, so conversion numbers may read low.</div>`
    : "";

  return `
<div style="background:#f3f4f6;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;">
        <tr><td style="background:${C.card};border-radius:20px;padding:28px 26px;">

          <div style="font-size:22px;font-weight:800;color:${C.ink};">${greeting} ☀️</div>
          <div style="font-size:14px;color:${C.sub};margin-top:2px;">Your ${esc(d.periodLabel)}: <strong style="color:${C.ink};">${esc(d.windowLabel)}</strong></div>

          ${sectionHeader("✨ Since your last digest")}
          ${tiles}

          ${sectionHeader("\u{1F4C8} Trial clicks trend")}
          ${barChart(d.trends.trialClicks, d.tz, C.bar)}

          ${sectionHeader("\u{1F4CD} Where clicks came from")}
          <div style="font-size:12px;color:${C.sub};margin-bottom:6px;">${d.locationTotal} click(s) in this window</div>
          ${locationBars(d.locations)}

          ${sectionHeader("\u{1F680} On trial right now")}
          ${onTrial}

          ${sectionHeader("\u{1F44B} Cancellations")}
          ${cancelBody}
          ${cancelReasons}
          ${coverage}

          ${footer}
          ${migrationNote}

          <div style="font-size:11px;color:${C.sub};margin-top:22px;border-top:1px solid ${C.line};padding-top:14px;">
            You get this twice a day (morning recap + evening update) instead of one email per trial click.
            Numbers are in ${esc(tzShort(d.tz))} time. Full detail lives in your admin dashboard.
          </div>

        </td></tr>
      </table>
    </td></tr>
  </table>
</div>`;
}

// ---------------------------------------------------------------------------
// Plain-text fallback
// ---------------------------------------------------------------------------

export function renderDigestText(d: DigestData): string {
  const m = d.metrics;
  const line = (label: string, v: string, mtd: number | null) =>
    `${label}: ${v}${mtd !== null ? ` (${mtd} this month)` : ""}`;
  const lines = [
    `${d.variant === "morning" ? "Good morning" : "Evening update"} - ${d.windowLabel}`,
    ``,
    `Since your last digest:`,
    line("  Trial clicks", String(m.trialClicks.window), m.trialClicks.mtd),
    line("  Trials started", String(m.trialsStarted.window), m.trialsStarted.mtd),
    line("  Conversions", String(m.conversions.window), m.conversions.mtd),
    line("  New subscriptions", String(m.newSubs.window), m.newSubs.mtd),
    line("  Revenue", money(m.revenueCents.window), m.revenueCents.mtd),
    line("  Cancellations", String(m.cancellations.window), m.cancellations.mtd),
    ``,
    `Top locations (this window):`,
    ...(d.locations.length
      ? d.locations.map((l) => `  ${l.label}: ${l.count}`)
      : ["  none"]),
    ``,
    `Running totals (${d.monthLabel}):`,
    `  Active subscribers: ${d.running.activeSubscribers ?? "n/a"}`,
    `  On trial right now: ${d.running.onTrialNow ?? "n/a"}`,
    `  Revenue this month: ${money(d.running.revenueMtdCents)}`,
  ];
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Subject + send
// ---------------------------------------------------------------------------

export function digestSubject(d: DigestData): string {
  const m = d.metrics;
  const bits = [
    `${m.trialClicks.window} trial click${m.trialClicks.window === 1 ? "" : "s"}`,
    `${m.trialsStarted.window} trial${m.trialsStarted.window === 1 ? "" : "s"}`,
  ];
  if (m.newSubs.window > 0) bits.push(`${m.newSubs.window} new sub${m.newSubs.window === 1 ? "" : "s"}`);
  const prefix = d.variant === "morning" ? "Morning recap" : "Evening update";
  return `${prefix}: ${bits.join(", ")}`;
}

function recipients(): string[] {
  const explicit = process.env.DIGEST_RECIPIENT;
  const raw = explicit || process.env.ADMIN_EMAILS || FALLBACK_RECIPIENT;
  const list = raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter((s) => s.includes("@"));
  return list.length > 0 ? list : [FALLBACK_RECIPIENT];
}

export async function sendDigest(d: DigestData): Promise<{ ok: boolean; skipped?: string }> {
  if (!process.env.RESEND_API_KEY) {
    console.log("daily-digest: skipped (RESEND_API_KEY not set)");
    return { ok: false, skipped: "not_configured" };
  }
  const subject = digestSubject(d);
  const html = renderDigestHtml(d);
  const text = renderDigestText(d);
  const results = await Promise.all(
    recipients().map((to) =>
      sendEmail({ from: FROM, to, subject, html, text, category: "daily_digest" }),
    ),
  );
  if (!results.every((r) => r.ok)) return { ok: false, skipped: "send_failed" };
  return { ok: true };
}
