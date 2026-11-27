import { describe, expect, it } from "vitest";
import { summarizeActivity, WINDOW_DAY_MS, WINDOW_WEEK_MS } from "./activity-summary";

const NOW = 1_800_000_000_000;
const H = 60 * 60 * 1000;

const base = { ledgerItems: [], ledgerHistory: [], desktop: [], breakage: {}, now: NOW, windowMs: WINDOW_DAY_MS };

describe("summarizeActivity", () => {
  it("is empty with no data", () => {
    const s = summarizeActivity(base);
    expect(s.events).toEqual([]);
    expect(s.counts).toEqual({ accepted: 0, acceptedAuto: 0, sentToApp: 0, failures: 0 });
  });

  it("counts accepts, splits auto, and dedupes history against today's items", () => {
    const s = summarizeActivity({
      ...base,
      windowMs: WINDOW_WEEK_MS,
      ledgerItems: [
        { campaignId: "a", at: NOW - 1 * H, source: "auto" },
        { campaignId: "b", at: NOW - 2 * H, source: "manual" },
      ],
      ledgerHistory: [
        { campaignId: "a", at: NOW - 1 * H },
        { campaignId: "c", at: NOW - 3 * 24 * H },
        { campaignId: "old", at: NOW - 30 * 24 * H },
      ],
    });
    expect(s.counts.accepted).toBe(3);
    expect(s.counts.acceptedAuto).toBe(1);
    expect(s.events.map((e) => e.detail)).toEqual(["a", "b", "c"]);
    expect(s.events[2]?.kind).toBe("accepted");
  });

  it("honors the window", () => {
    const s = summarizeActivity({ ...base, ledgerHistory: [{ campaignId: "c", at: NOW - 3 * 24 * H }] });
    expect(s.counts.accepted).toBe(0);
  });

  it("summarizes desktop sends and failures, skipping connection and queued rows", () => {
    const s = summarizeActivity({
      ...base,
      desktop: [
        { at: NOW - H, dir: "to-app", action: "content.push", outcome: "ok", count: 3 },
        { at: NOW - 2 * H, dir: "to-app", action: "deal.push.batch", outcome: "failed", message: "app closed" },
        { at: NOW - 3 * H, dir: "connection", action: "pairing", outcome: "ok" },
        { at: NOW - 4 * H, dir: "to-app", action: "link.mint", outcome: "queued" },
      ],
    });
    expect(s.counts.sentToApp).toBe(3);
    expect(s.counts.failures).toBe(1);
    expect(s.events.map((e) => e.kind)).toEqual(["sent", "send-failed"]);
  });

  it("leaves failed background pushes off the card", () => {
    const s = summarizeActivity({
      ...base,
      desktop: [{ at: NOW - H, dir: "to-app", action: "storefront.verify", outcome: "failed", count: 9 }],
    });
    expect(s.counts.failures).toBe(0);
    expect(s.events).toEqual([]);
  });

  it("includes recent tool problems and sorts newest first with a limit", () => {
    const s = summarizeActivity({
      ...base,
      breakage: { searchOverlay: { lastAt: NOW - H }, old: { lastAt: NOW - 5 * 24 * H }, bad: {} },
      ledgerItems: [{ campaignId: "x", at: NOW - 2 * H, source: "manual" }],
      limit: 1,
    });
    expect(s.counts.failures).toBe(1);
    expect(s.events).toHaveLength(1);
    expect(s.events[0]?.kind).toBe("tool-problem");
  });
});
