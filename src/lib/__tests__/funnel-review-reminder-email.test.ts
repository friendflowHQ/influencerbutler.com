const DASHES = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/email-send", () => ({ sendEmail: vi.fn(async () => ({ ok: true, id: "x" })) }));
vi.mock("@/lib/email-senders", () => ({ transactionalFrom: () => "Influencer Butler <hello@example.com>" }));
vi.mock("@/lib/founder-recipient", () => ({ founderRecipients: () => ["founder@example.com"] }));

import {
  buildFunnelReviewReminder,
  buildFunnelReviewReminderBody,
  funnelReviewSubject,
  isStalled,
  selectStale,
  sendFunnelReviewReminder,
  type FunnelReviewReminderInput,
  type ReviewExperiment,
} from "@/lib/funnel-review-reminder-email";
import { sendEmail } from "@/lib/email-send";

const NOW = new Date("2026-12-01T15:00:00Z");

function exp(over: Partial<ReviewExperiment>): ReviewExperiment {
  return {
    name: "Test",
    where: "App trial: Day 3",
    status: "running",
    primaryMetric: "click",
    startedAt: "2026-11-20T00:00:00Z",
    decidedAt: null,
    winnerArm: null,
    outcome: null,
    rates: null,
    p: null,
    sends: { a: 50, b: 50 },
    minSendsPerArm: 200,
    maxDays: 45,
    ...over,
  };
}

function fullInput(): FunnelReviewReminderInput {
  return {
    now: NOW,
    stale: [
      { kind: "step", label: "Trial: Day 3", updatedAt: "2026-09-01T00:00:00Z", updatedBy: "code default" },
      { kind: "sequence", label: "Sequence: Cold IG", updatedAt: "2026-07-02T00:00:00Z", updatedBy: "Elizabeth" },
      { kind: "step", label: "Pro: Day 0", updatedAt: "2026-11-25T00:00:00Z", updatedBy: "Elizabeth" },
      { kind: "funnel", label: "Win-back", updatedAt: null, updatedBy: null },
    ],
    belowTarget: [
      {
        label: "Trial",
        activation: { rate: 0.41, target: 0.8, den: 120 },
        paid: { rate: 0.12, target: 0.8, den: 120 },
      },
      {
        label: "Onboarding",
        activation: { rate: 0.9, target: 0.8 },
        paid: { rate: 0.85, target: 0.8 },
      },
      {
        label: "Pro",
        activation: { rate: null, target: 0.8, measurable: false },
        paid: { rate: null, target: 0.8 },
      },
    ],
    experiments: [
      exp({
        name: "Founder story vs module",
        status: "decided",
        decidedAt: "2026-11-15T00:00:00Z",
        winnerArm: "b",
        outcome: "promote",
        rates: { a: 0.15, b: 0.25 },
        p: 0.0132,
        sends: { a: 210, b: 205 },
      }),
      exp({ name: "Old decision", status: "decided", decidedAt: "2026-09-01T00:00:00Z", winnerArm: "a" }),
      exp({ name: "Discount vs downsell", where: "Win-back: Touch 2", startedAt: "2026-10-01T00:00:00Z", sends: { a: 30, b: 28 } }),
    ],
    priceChange: { effectiveAt: "2026-11-29T05:00:00Z" },
  };
}

describe("funnel review reminder email", () => {
  it("never contains an em dash or en dash", () => {
    const { subject, text } = buildFunnelReviewReminder({
      ...fullInput(),
      now: new Date("2026-11-01T15:00:00Z"),
    });
    expect(subject + text).not.toMatch(DASHES);
    const empty = buildFunnelReviewReminder({ now: NOW, stale: [], belowTarget: [], experiments: [] });
    expect(empty.subject + empty.text).not.toMatch(DASHES);
  });

  it("is plain text (no HTML tags)", () => {
    const text = buildFunnelReviewReminderBody(fullInput());
    expect(text).not.toMatch(/<[a-z][^>]*>/i);
  });

  it("lists stale items oldest first, never-stamped first, and drops fresh ones", () => {
    const rows = selectStale(fullInput().stale, NOW);
    expect(rows.map((r) => r.label)).toEqual(["Win-back", "Sequence: Cold IG", "Trial: Day 3"]);
    const text = buildFunnelReviewReminderBody(fullInput());
    const iWin = text.indexOf("Win-back: never updated");
    const iSeq = text.indexOf("Sequence: Cold IG: updated Jul 2, 2026 (152 days) by Elizabeth");
    const iTrial = text.indexOf("Trial: Day 3: updated Sep 1, 2026");
    expect(iWin).toBeGreaterThan(-1);
    expect(iSeq).toBeGreaterThan(iWin);
    expect(iTrial).toBeGreaterThan(iSeq);
    expect(text).toContain("by code default");
    expect(text).not.toContain("Pro: Day 0");
  });

  it("shows funnels below target with activation and paid vs target", () => {
    const text = buildFunnelReviewReminderBody(fullInput());
    expect(text).toContain("- Trial: Activation 41% vs 80% target, cohort 120; Paid 12% vs 80% target, cohort 120");
    expect(text).not.toContain("- Onboarding:");
    expect(text).not.toContain("- Pro: Activation");
  });

  it("shows recent A/B decisions and running tests, flags stalled ones", () => {
    const text = buildFunnelReviewReminderBody(fullInput());
    expect(text).toContain("Founder story vs module (App trial: Day 3): winner B (now the live copy)");
    expect(text).toContain("p=0.013");
    expect(text).not.toContain("Old decision");
    expect(text).toMatch(/Discount vs downsell \(Win-back: Touch 2\): day 61 of 45.*STALLED/);
    expect(isStalled(exp({ startedAt: "2026-11-25T00:00:00Z" }), NOW)).toBe(false);
  });

  it("includes the price note only before the change date", () => {
    const before = buildFunnelReviewReminderBody({ ...fullInput(), now: new Date("2026-11-01T15:00:00Z") });
    expect(before).toContain("PRICE CHANGE");
    expect(before).toContain("Nov 29, 2026");
    const after = buildFunnelReviewReminderBody(fullInput());
    expect(after).not.toContain("PRICE CHANGE");
  });

  it("counts items in the subject", () => {
    const { subject, count } = buildFunnelReviewReminder(fullInput());
    // 3 stale + 1 below target + 1 recent decision + 1 stalled
    expect(count).toBe(6);
    expect(subject).toBe("Monthly email funnel review: 6 items need a look");
    expect(funnelReviewSubject(1)).toBe("Monthly email funnel review: 1 item needs a look");
  });

  it("handles the empty state", () => {
    const { subject, text } = buildFunnelReviewReminder({ now: NOW, stale: [], belowTarget: [], experiments: [] });
    expect(subject).toBe("Monthly email funnel review: 0 items need a look");
    expect(text).toContain("All funnels fresh");
    expect(text).toContain("No decisions in the last month and no tests running.");
    expect(text).toContain("https://www.influencerbutler.com/dashboard/admin/emails");
  });

  it("sends plain text only with the funnel_review_reminder category", async () => {
    const n = await sendFunnelReviewReminder(fullInput());
    expect(n).toBe(1);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.to).toBe("founder@example.com");
    expect(call.category).toBe("funnel_review_reminder");
    expect(call.html).toBeUndefined();
    expect(call.text).toContain("STALE COPY");
  });
});

import { collectFunnelStaleItems, belowTargetRow } from "@/lib/funnel-review-reminder-email";

describe("collectFunnelStaleItems", () => {
  const funnels = [
    {
      key: "trial",
      name: "Trial",
      steps: [
        { tier: "day0", label: "Day 0", contentKeys: ["day0", "day0.beginner"] },
        { tier: "day3", label: "Day 3", contentKeys: ["day3"] },
      ],
    },
    {
      key: "pro",
      name: "Pro",
      steps: [
        { tier: "d0", label: "Welcome", contentKeys: ["d0"] },
        { tier: "d7", label: "Week 1", contentKeys: ["d7"] },
      ],
    },
  ];

  it("takes the newest stamp across keys, overrides, reviews and code dates", () => {
    const overrides = new Map([
      ["trial:day0.beginner", { updatedAt: "2026-11-20T00:00:00Z", updatedBy: "Elizabeth" }],
      ["trial:day3", { updatedAt: "2026-08-01T00:00:00Z", updatedBy: "Elizabeth", reviewedAt: "2026-09-15T00:00:00Z", reviewedBy: "Liz" }],
    ]);
    const rows = collectFunnelStaleItems({
      funnels,
      overrides,
      codeDateFor: (f, k) => (f === "trial" && k === "day3" ? "2026-09-01" : f === "pro" ? "2026-07-01" : null),
      now: NOW,
    });
    // Trial day0 is fresh via the tailored override; day3 is stale via its review.
    expect(rows).toContainEqual({
      kind: "step",
      label: "Trial: Day 3",
      updatedAt: "2026-09-15T00:00:00Z",
      updatedBy: "Liz (reviewed)",
    });
    expect(rows.find((r) => r.label === "Trial: Day 0")).toBeUndefined();
    // Every Pro step is stale, so they collapse into one funnel row.
    expect(rows).toContainEqual({
      kind: "funnel",
      label: "Pro (all 2 steps)",
      updatedAt: "2026-07-01",
      updatedBy: "code default",
    });
    expect(rows.filter((r) => r.label.startsWith("Pro:"))).toHaveLength(0);
  });

  it("treats 30 days as fresh and 31 as stale", () => {
    const one = [{ key: "x", name: "X", steps: [{ tier: "a", label: "A", contentKeys: ["a"] }] }];
    const at = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    const r30 = collectFunnelStaleItems({ funnels: one, overrides: new Map(), codeDateFor: () => at(30), now: NOW });
    const r31 = collectFunnelStaleItems({ funnels: one, overrides: new Map(), codeDateFor: () => at(31), now: NOW });
    expect(r30).toHaveLength(0);
    expect(r31).toHaveLength(1);
  });

  it("builds a below-target row from metrics and targets", () => {
    const row = belowTargetRow(
      "Trial",
      { activation: { rate: 0.4, den: 10, measurable: true }, paid: { rate: 0.1, den: 10 } },
      { activation: 0.8, paid: 0.5 },
    );
    expect(row.activation).toEqual({ rate: 0.4, den: 10, measurable: true, target: 0.8 });
    expect(row.paid.target).toBe(0.5);
  });
});
