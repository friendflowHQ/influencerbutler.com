// Daily ops health report: state + owner alert.
//
// A scheduled Claude routine checks the Cloudflare, Vercel, Resend and Supabase
// dashboards once a day and POSTs what it found to /api/admin/ops-health. This
// module persists the latest report in app_config (so the heartbeat cron can tell
// when the routine stopped reporting) and emails the owner when something is
// alarming, with the fix steps. Modelled on recall-credit-alert.ts.
//
// Alert rules:
//   - warning/critical findings email the owner when a finding is NEW since the
//     last report, or when ALERT_THROTTLE_MS has passed while it persists.
//   - a report with auto-fixes always emails once (the routine changed something
//     on the owner's accounts and they should hear about it).
//   - a clean report clears the throttle so the next problem alerts immediately.
//   - if the email fails to send, the throttle is NOT advanced, so the next
//     report retries.
//
// Plain text on purpose: heavy HTML alerts get silently spam-filtered by Gmail.

import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email-send";

/** app_config key holding the latest health report (JSON below). */
export const OPS_HEALTH_STATUS_KEY = "ops_health_status";
/** app_config key holding when the heartbeat last emailed about a missing report. */
export const OPS_HEALTH_HEARTBEAT_KEY = "ops_health_heartbeat";

/** Don't re-email about a persisting problem more than once per this window. */
export const ALERT_THROTTLE_MS = 24 * 3600_000;
/** A report older than this means the daily routine did not run. */
export const STALE_AFTER_MS = 36 * 3600_000;

const FROM_ADDRESS = "Influencer Butler <alerts@influencerbutler.com>";
const REPLY_TO = "support@influencerbutler.com";

export const SERVICES = ["cloudflare", "vercel", "resend", "supabase", "site", "other"] as const;
export type OpsService = (typeof SERVICES)[number];
export type OpsSeverity = "info" | "warning" | "critical";

export type OpsFinding = {
  service: OpsService;
  severity: OpsSeverity;
  title: string;
  detail: string;
  /** Exact steps the owner should take. */
  fix: string;
};

export type OpsAutoFix = {
  service: OpsService;
  action: string;
  result: string;
};

export type OpsHealthReport = {
  ranAt: string;
  findings: OpsFinding[];
  autoFixed: OpsAutoFix[];
};

export type StoredOpsHealthStatus = {
  /** When the routine last reported (ISO). */
  checkedAt: string;
  findings: OpsFinding[];
  autoFixed: OpsAutoFix[];
  /** When we last emailed the owner about findings (ISO), or null. */
  alertedAt: string | null;
  /** Fingerprints of the actionable findings the owner was last told about. */
  fingerprints: string[];
};

type Admin = ReturnType<typeof createAdminClient>;

const SEVERITIES: OpsSeverity[] = ["info", "warning", "critical"];

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

/**
 * Validate and normalize an untrusted POST body into a report, or null when it
 * is not usable. Bounded so a runaway routine cannot write megabytes to app_config.
 */
export function parseOpsHealthReport(body: unknown, now: Date = new Date()): OpsHealthReport | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.findings)) return null;

  const findings: OpsFinding[] = [];
  for (const raw of b.findings.slice(0, 50)) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = clip(r.title, 160);
    if (!title) continue;
    const service = (SERVICES as readonly string[]).includes(String(r.service))
      ? (r.service as OpsService)
      : "other";
    const severity = SEVERITIES.includes(r.severity as OpsSeverity) ? (r.severity as OpsSeverity) : "warning";
    findings.push({
      service,
      severity,
      title,
      detail: clip(r.detail, 1500),
      fix: clip(r.fix, 1500),
    });
  }

  const autoFixed: OpsAutoFix[] = [];
  if (Array.isArray(b.autoFixed)) {
    for (const raw of b.autoFixed.slice(0, 20)) {
      if (!raw || typeof raw !== "object") continue;
      const r = raw as Record<string, unknown>;
      const action = clip(r.action, 300);
      if (!action) continue;
      const service = (SERVICES as readonly string[]).includes(String(r.service))
        ? (r.service as OpsService)
        : "other";
      autoFixed.push({ service, action, result: clip(r.result, 500) });
    }
  }

  const ranMs = typeof b.ranAt === "string" ? Date.parse(b.ranAt) : NaN;
  // Never trust the routine's clock for freshness: a bad ranAt would defeat the
  // heartbeat. Fall back to the server time when it is missing or far off.
  const ranAt =
    Number.isFinite(ranMs) && Math.abs(ranMs - now.getTime()) < 6 * 3600_000
      ? new Date(ranMs).toISOString()
      : now.toISOString();

  return { ranAt, findings, autoFixed };
}

export function fingerprint(f: Pick<OpsFinding, "service" | "title">): string {
  return `${f.service}:${f.title}`.toLowerCase();
}

function actionable(findings: OpsFinding[]): OpsFinding[] {
  return findings.filter((f) => f.severity === "warning" || f.severity === "critical");
}

/**
 * Pure decision: should this report email the owner, given the previous state?
 * `newFingerprints` are the actionable findings not previously alerted.
 */
export function planAlert(
  prev: StoredOpsHealthStatus | null,
  report: OpsHealthReport,
  now: Date = new Date(),
): { send: boolean; actionable: OpsFinding[]; fingerprints: string[] } {
  const act = actionable(report.findings);
  const fingerprints = act.map(fingerprint);

  if (act.length === 0) {
    return { send: report.autoFixed.length > 0, actionable: act, fingerprints };
  }

  const prevPrints = new Set(prev?.fingerprints ?? []);
  const hasNew = fingerprints.some((fp) => !prevPrints.has(fp));
  const lastMs = prev?.alertedAt ? Date.parse(prev.alertedAt) : 0;
  const throttleOpen = !Number.isFinite(lastMs) || now.getTime() - lastMs >= ALERT_THROTTLE_MS;
  const send = hasNew || throttleOpen || report.autoFixed.length > 0;
  return { send, actionable: act, fingerprints };
}

/** Pure decision for the heartbeat: has the routine gone quiet? */
export function isReportStale(
  prev: StoredOpsHealthStatus | null,
  now: Date = new Date(),
): { stale: boolean; ageHours: number | null } {
  if (!prev?.checkedAt) return { stale: true, ageHours: null };
  const ms = Date.parse(prev.checkedAt);
  if (!Number.isFinite(ms)) return { stale: true, ageHours: null };
  const age = now.getTime() - ms;
  return { stale: age >= STALE_AFTER_MS, ageHours: Math.round(age / 3600_000) };
}

const SEVERITY_RANK: Record<OpsSeverity, number> = { critical: 0, warning: 1, info: 2 };

export function renderAlertEmail(
  report: OpsHealthReport,
  act: OpsFinding[],
): { subject: string; text: string } {
  const sorted = [...act].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
  const critical = sorted.filter((f) => f.severity === "critical").length;
  const warning = sorted.length - critical;
  const services = [...new Set(sorted.map((f) => f.service))].join(", ");

  const parts: string[] = [];
  if (critical) parts.push(`${critical} critical`);
  if (warning) parts.push(`${warning} warning${warning === 1 ? "" : "s"}`);
  const subject =
    sorted.length > 0
      ? `Action needed: ${parts.join(", ")} (${services})`
      : "Ops health: auto-fixes applied, nothing else needed";

  const lines: string[] = [];
  if (sorted.length > 0) {
    lines.push("The daily ops health check found something that needs you.", "");
    for (const f of sorted) {
      lines.push(`[${f.severity.toUpperCase()}] ${f.service}: ${f.title}`);
      if (f.detail) lines.push(`What: ${f.detail}`);
      lines.push(`Fix: ${f.fix || "No fix steps were provided. Open the dashboard and review."}`);
      lines.push("");
    }
  } else {
    lines.push("The daily ops health check applied safe fixes and found nothing else wrong.", "");
  }
  if (report.autoFixed.length > 0) {
    lines.push("Already fixed automatically:");
    for (const a of report.autoFixed) {
      lines.push(`- ${a.service}: ${a.action}${a.result ? ` (${a.result})` : ""}`);
    }
    lines.push("");
  }
  const info = report.findings.filter((f) => f.severity === "info");
  if (info.length > 0) {
    lines.push("FYI (no action needed):");
    for (const f of info) lines.push(`- ${f.service}: ${f.title}`);
    lines.push("");
  }
  lines.push(`Checked: ${report.ranAt}`);
  return { subject, text: lines.join("\n") };
}

/** Owner recipients: PAYOUT_DIGEST_INBOX, else ADMIN_EMAILS. Empty when neither set. */
export function ownerRecipients(): string[] {
  const raw = process.env.PAYOUT_DIGEST_INBOX || process.env.ADMIN_EMAILS || "";
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendToOwner(subject: string, text: string, category: string): Promise<boolean> {
  const to = ownerRecipients();
  if (to.length === 0) {
    console.error("[ops-health-alert] no owner recipients (set ADMIN_EMAILS)");
    return false;
  }
  let anySent = false;
  for (const recipient of to) {
    const { ok } = await sendEmail({
      from: FROM_ADDRESS,
      to: recipient,
      replyTo: REPLY_TO,
      subject,
      text,
      category,
      funnel: "transactional",
    });
    anySent = anySent || ok;
  }
  return anySent;
}

function adminClient(admin?: Admin | null): Admin | null {
  if (admin) return admin;
  try {
    return createAdminClient();
  } catch (e) {
    console.error("[ops-health-alert] admin client", e);
    return null;
  }
}

async function readKey<T>(db: Admin, key: string): Promise<T | null> {
  try {
    const { data } = await db.from("app_config").select("value").eq("key", key).maybeSingle();
    return (data?.value as T | undefined) ?? null;
  } catch {
    return null;
  }
}

async function writeKey(db: Admin, key: string, value: unknown): Promise<void> {
  try {
    await db.from("app_config").upsert(
      { key, value, updated_at: new Date().toISOString(), updated_by: "ops-health-alert" },
      { onConflict: "key" },
    );
  } catch (e) {
    console.error("[ops-health-alert] persist", key, e);
  }
}

export async function getOpsHealthStatus(admin?: Admin | null): Promise<StoredOpsHealthStatus | null> {
  const db = adminClient(admin);
  return db ? readKey<StoredOpsHealthStatus>(db, OPS_HEALTH_STATUS_KEY) : null;
}

/**
 * Record a fresh report and email the owner when warranted. Best-effort and
 * never throws. `dry` renders the decision and email without sending or writing.
 */
export async function recordOpsHealthReport(
  report: OpsHealthReport,
  opts: { admin?: Admin | null; dry?: boolean } = {},
): Promise<{ alerted: boolean; wouldAlert: boolean; subject: string | null; text: string | null }> {
  const db = adminClient(opts.admin);
  const prev = db ? await readKey<StoredOpsHealthStatus>(db, OPS_HEALTH_STATUS_KEY) : null;
  const plan = planAlert(prev, report);
  const email = plan.send ? renderAlertEmail(report, plan.actionable) : null;

  if (opts.dry) {
    return { alerted: false, wouldAlert: plan.send, subject: email?.subject ?? null, text: email?.text ?? null };
  }

  let alertedAt = prev?.alertedAt ?? null;
  let fingerprints = prev?.fingerprints ?? [];
  let alerted = false;

  if (plan.actionable.length === 0) {
    // Healthy: reset the throttle so the next problem alerts immediately.
    alertedAt = null;
    fingerprints = [];
  }
  if (email) {
    alerted = await sendToOwner(email.subject, email.text, "ops_health_alert");
    if (alerted && plan.actionable.length > 0) {
      alertedAt = new Date().toISOString();
      fingerprints = plan.fingerprints;
    }
  }

  if (db) {
    await writeKey(db, OPS_HEALTH_STATUS_KEY, {
      checkedAt: report.ranAt,
      findings: report.findings,
      autoFixed: report.autoFixed,
      alertedAt,
      fingerprints,
    } satisfies StoredOpsHealthStatus);
  }

  return { alerted, wouldAlert: plan.send, subject: email?.subject ?? null, text: email?.text ?? null };
}

/**
 * Heartbeat: email the owner when the daily routine has not reported in
 * STALE_AFTER_MS. Throttled to once per ALERT_THROTTLE_MS. Never throws.
 */
export async function checkOpsHealthHeartbeat(
  opts: { admin?: Admin | null; dry?: boolean; force?: boolean } = {},
): Promise<{ stale: boolean; ageHours: number | null; alerted: boolean }> {
  const db = adminClient(opts.admin);
  const prev = db ? await readKey<StoredOpsHealthStatus>(db, OPS_HEALTH_STATUS_KEY) : null;
  const { stale, ageHours } = isReportStale(prev);
  const isStale = stale || !!opts.force;
  if (!isStale || opts.dry) return { stale: isStale, ageHours, alerted: false };

  const last = db ? await readKey<{ alertedAt: string | null }>(db, OPS_HEALTH_HEARTBEAT_KEY) : null;
  const lastMs = last?.alertedAt ? Date.parse(last.alertedAt) : 0;
  const open = !Number.isFinite(lastMs) || Date.now() - lastMs >= ALERT_THROTTLE_MS;
  if (!open && !opts.force) return { stale: isStale, ageHours, alerted: false };

  const when = ageHours == null ? "never" : `${ageHours} hours ago`;
  const alerted = await sendToOwner(
    "Action needed: daily ops health check did not report",
    `The daily Cloudflare / Vercel / Resend / Supabase health check last reported: ${when}.\n\n` +
      `Fix: make sure your PC and Chrome are on at the scheduled time and you are signed in to each dashboard, ` +
      `then open the scheduled task in Claude and run it once by hand. Until it reports, nothing is watching those four services.`,
    "ops_health_heartbeat",
  );
  if (alerted && db) await writeKey(db, OPS_HEALTH_HEARTBEAT_KEY, { alertedAt: new Date().toISOString() });
  return { stale: isStale, ageHours, alerted };
}
