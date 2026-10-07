/**
 * Summary: Tests the daily ops health report logic: parsing untrusted input,
 * alert throttling/dedupe, recovery reset and the stale-report heartbeat.
 * Dependencies: vitest; ../supabase/admin and ../email-send are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("../email-send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: "x" })) }));

import {
  ALERT_THROTTLE_MS,
  STALE_AFTER_MS,
  isReportStale,
  parseOpsHealthReport,
  planAlert,
  renderAlertEmail,
  type OpsHealthReport,
  type StoredOpsHealthStatus,
} from "../ops-health-alert";

const NOW = new Date("2026-10-08T14:00:00Z");

function report(over: Partial<OpsHealthReport> = {}): OpsHealthReport {
  return { ranAt: NOW.toISOString(), findings: [], autoFixed: [], ...over };
}
const crit = { service: "supabase" as const, severity: "critical" as const, title: "DB paused", detail: "d", fix: "Restore it" };
const warn = { service: "vercel" as const, severity: "warning" as const, title: "Deploy failed", detail: "d", fix: "Check logs" };

function stored(over: Partial<StoredOpsHealthStatus> = {}): StoredOpsHealthStatus {
  return {
    checkedAt: NOW.toISOString(),
    findings: [],
    autoFixed: [],
    alertedAt: null,
    fingerprints: [],
    ...over,
  };
}

describe("parseOpsHealthReport", () => {
  it("rejects non-objects and bodies without a findings array", () => {
    expect(parseOpsHealthReport(null)).toBeNull();
    expect(parseOpsHealthReport("x")).toBeNull();
    expect(parseOpsHealthReport({})).toBeNull();
  });

  it("accepts an empty all-clear report", () => {
    const r = parseOpsHealthReport({ findings: [] }, NOW);
    expect(r).not.toBeNull();
    expect(r!.findings).toEqual([]);
  });

  it("normalizes bad service/severity and drops findings without a title", () => {
    const r = parseOpsHealthReport(
      { findings: [{ service: "nope", severity: "bad", title: "T" }, { title: "" }, 5] },
      NOW,
    )!;
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].service).toBe("other");
    expect(r.findings[0].severity).toBe("warning");
  });

  it("ignores a ranAt far from server time so the heartbeat cannot be defeated", () => {
    const r = parseOpsHealthReport({ findings: [], ranAt: "2030-01-01T00:00:00Z" }, NOW)!;
    expect(r.ranAt).toBe(NOW.toISOString());
  });
});

describe("planAlert", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not email on an all-clear report", () => {
    expect(planAlert(null, report(), NOW).send).toBe(false);
  });

  it("does not email for info-only findings", () => {
    const r = report({ findings: [{ ...warn, severity: "info" }] });
    expect(planAlert(null, r, NOW).send).toBe(false);
  });

  it("emails on a new warning or critical finding", () => {
    expect(planAlert(null, report({ findings: [crit] }), NOW).send).toBe(true);
  });

  it("does not repeat the same finding inside the throttle window", () => {
    const prev = stored({
      alertedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
      fingerprints: ["supabase:db paused"],
    });
    expect(planAlert(prev, report({ findings: [crit] }), NOW).send).toBe(false);
  });

  it("re-alerts a persisting finding after the throttle window", () => {
    const prev = stored({
      alertedAt: new Date(NOW.getTime() - ALERT_THROTTLE_MS - 1000).toISOString(),
      fingerprints: ["supabase:db paused"],
    });
    expect(planAlert(prev, report({ findings: [crit] }), NOW).send).toBe(true);
  });

  it("alerts a second, new finding even inside the throttle window", () => {
    const prev = stored({
      alertedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
      fingerprints: ["supabase:db paused"],
    });
    expect(planAlert(prev, report({ findings: [crit, warn] }), NOW).send).toBe(true);
  });

  it("emails when auto-fixes were applied even with no remaining problems", () => {
    const r = report({ autoFixed: [{ service: "vercel", action: "Retried deploy", result: "passed" }] });
    expect(planAlert(null, r, NOW).send).toBe(true);
  });
});

describe("renderAlertEmail", () => {
  it("lists critical first, with fix steps and auto-fixes, and no em dashes", () => {
    const { subject, text } = renderAlertEmail(
      report({ findings: [warn, crit], autoFixed: [{ service: "vercel", action: "Retried deploy", result: "ok" }] }),
      [warn, crit],
    );
    expect(subject).toContain("1 critical");
    expect(subject).toContain("1 warning");
    expect(text.indexOf("[CRITICAL]")).toBeLessThan(text.indexOf("[WARNING]"));
    expect(text).toContain("Fix: Restore it");
    expect(text).toContain("Already fixed automatically");
    expect(subject + text).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("isReportStale", () => {
  it("is stale when there is no report", () => {
    expect(isReportStale(null, NOW).stale).toBe(true);
  });
  it("is fresh inside 36h and stale after", () => {
    const fresh = stored({ checkedAt: new Date(NOW.getTime() - STALE_AFTER_MS + 60_000).toISOString() });
    const old = stored({ checkedAt: new Date(NOW.getTime() - STALE_AFTER_MS - 60_000).toISOString() });
    expect(isReportStale(fresh, NOW).stale).toBe(false);
    expect(isReportStale(old, NOW).stale).toBe(true);
  });
});
