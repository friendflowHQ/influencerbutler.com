import { describe, expect, it } from "vitest";
import {
  ACTIVITY_CAP,
  ACTIVITY_COALESCE_MS,
  appendActivity,
  describeOutcome,
  formatActivityLog,
  isAutomaticCommand,
  summarizeCommand,
  type DesktopActivityEntry,
  type NewActivity,
} from "./desktop-activity";

const send: NewActivity = { dir: "to-app", action: "content.push", outcome: "ok", route: "local", detail: "B0ABC (amazon.com)" };

describe("summarizeCommand", () => {
  it("names a single product by asin and marketplace, never its title", () => {
    const s = summarizeCommand({
      type: "content.push",
      product: { asin: "B0ABC", marketplace: "amazon.com", title: "Secret product title" },
    });
    expect(s).toEqual({ action: "content.push", detail: "B0ABC (amazon.com)" });
  });

  it("counts batches and carries the workspace", () => {
    const s = summarizeCommand({ type: "deal.push.batch", workspace: "default", products: [{}, {}, {}] });
    expect(s.detail).toBe("workspace default, 3 products");
  });

  it("survives junk", () => {
    expect(summarizeCommand(null)).toEqual({ action: "unknown", detail: undefined });
  });
});

describe("describeOutcome", () => {
  it("maps ok, needsPairing and failures", () => {
    expect(describeOutcome({ ok: true })).toEqual({ outcome: "ok" });
    expect(describeOutcome({ ok: false, needsPairing: true }).message).toMatch(/not paired/i);
    expect(describeOutcome({ ok: false, message: "App busy" })).toEqual({ outcome: "failed", message: "App busy" });
  });
});

describe("isAutomaticCommand", () => {
  it("flags the background report commands", () => {
    expect(isAutomaticCommand("reach.report.batch")).toBe(true);
    expect(isAutomaticCommand("content.push")).toBe(false);
  });
});

describe("appendActivity", () => {
  it("prepends newest first", () => {
    let list: DesktopActivityEntry[] = [];
    list = appendActivity(list, send, 1000);
    list = appendActivity(list, { ...send, action: "link.mint" }, 2000);
    expect(list.map((e) => e.action)).toEqual(["link.mint", "content.push"]);
  });

  it("folds an identical repeat into a count", () => {
    let list: DesktopActivityEntry[] = [];
    list = appendActivity(list, send, 1000);
    list = appendActivity(list, send, 2000);
    list = appendActivity(list, send, 3000);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ count: 3, at: 3000 });
  });

  it("does not fold across a long gap or a different outcome", () => {
    let list = appendActivity([], send, 1000);
    list = appendActivity(list, send, 1000 + ACTIVITY_COALESCE_MS + 1);
    expect(list).toHaveLength(2);
    list = appendActivity(list, { ...send, outcome: "failed", message: "x" }, 1000 + ACTIVITY_COALESCE_MS + 2);
    expect(list).toHaveLength(3);
  });

  it("caps the list", () => {
    let list: DesktopActivityEntry[] = [];
    for (let i = 0; i < ACTIVITY_CAP + 25; i += 1) {
      list = appendActivity(list, { ...send, detail: `item ${i}` }, i);
    }
    expect(list).toHaveLength(ACTIVITY_CAP);
    expect(list[0]?.detail).toBe(`item ${ACTIVITY_CAP + 24}`);
  });
});

describe("formatActivityLog", () => {
  it("says so when empty", () => {
    expect(formatActivityLog([])).toMatch(/nothing sent/);
  });

  it("renders a line per entry with the repeat count and a truncation note", () => {
    const entries = [
      { ...send, at: Date.UTC(2026, 9, 7, 18, 30, 1), count: 3 },
      { ...send, outcome: "failed" as const, message: "The app is not running.", at: Date.UTC(2026, 9, 7, 18, 0, 0) },
    ];
    const text = formatActivityLog(entries, 1);
    expect(text).toContain("2026-10-07 18:30:01Z | to app | content.push | OK | local | B0ABC (amazon.com) | x3");
    expect(text).toContain("(1 older entries not shown)");
    expect(text).not.toContain("not running");
  });
});
