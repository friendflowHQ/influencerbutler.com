import { describe, expect, it } from "vitest";
import {
  applyMilestone,
  checklistComplete,
  checklistItems,
  DEFAULT_MILESTONES,
  sanitizeMilestones,
  seedMilestones,
  shouldShowChecklist,
} from "./milestones";

const NOW = 1_800_000_000_000;
const fresh = () => ({ ...DEFAULT_MILESTONES, done: {} });

describe("milestones", () => {
  it("celebrates only the first time", () => {
    const a = applyMilestone(fresh(), "firstAccept", NOW);
    expect(a.celebrate).toBe(true);
    expect(a.state.done.firstAccept).toBe(NOW);
    const b = applyMilestone(a.state, "firstAccept", NOW + 1000);
    expect(b.celebrate).toBe(false);
    expect(b.state.done.firstAccept).toBe(NOW);
  });

  it("tracks each milestone independently", () => {
    const a = applyMilestone(fresh(), "firstSend", NOW).state;
    expect(applyMilestone(a, "firstList", NOW).celebrate).toBe(true);
  });

  it("sanitizes junk storage", () => {
    expect(sanitizeMilestones(null)).toEqual(fresh());
    expect(sanitizeMilestones("x")).toEqual(fresh());
    const s = sanitizeMilestones({ done: { firstAccept: 5, firstSend: "yes", bogus: 9, firstList: -1 }, dismissed: 1, seeded: true });
    expect(s).toEqual({ done: { firstAccept: 5 }, dismissed: false, seeded: true, existing: false });
  });
});

describe("seedMilestones", () => {
  it("a fresh install seeds empty and is not an existing user", () => {
    const s = seedMilestones(fresh(), {}, NOW);
    expect(s).toMatchObject({ seeded: true, existing: false, done: {} });
  });

  it("marks prior activity done silently and flags an existing user", () => {
    const s = seedMilestones(fresh(), { firstAccept: true, firstList: true }, NOW);
    expect(s.done).toEqual({ firstAccept: NOW, firstList: NOW });
    expect(s.existing).toBe(true);
    expect(applyMilestone(s, "firstAccept", NOW + 1).celebrate).toBe(false);
  });

  it("leaves the milestone being reached unseeded so it still celebrates", () => {
    const s = seedMilestones(fresh(), { firstAccept: true }, NOW, "firstAccept");
    expect(s.done.firstAccept).toBeUndefined();
    expect(s.existing).toBe(false);
    expect(applyMilestone(s, "firstAccept", NOW).celebrate).toBe(true);
  });

  it("seeds only once", () => {
    const s = seedMilestones(fresh(), {}, NOW);
    const again = seedMilestones(s, { firstSend: true }, NOW + 5);
    expect(again).toBe(s);
  });
});

describe("checklist", () => {
  it("combines live status with milestones", () => {
    const state = applyMilestone(seedMilestones(fresh(), {}, NOW), "firstAccept", NOW).state;
    const items = checklistItems(state, { signedIn: true, paired: false });
    expect(items.map((i) => [i.id, i.done])).toEqual([
      ["signedIn", true],
      ["paired", false],
      ["firstAccept", true],
      ["firstSend", false],
      ["firstList", false],
    ]);
    expect(checklistComplete(items)).toBe(false);
  });

  it("leaves out pairing and sending on mobile", () => {
    const state = seedMilestones(fresh(), {}, NOW);
    const items = checklistItems(state, { signedIn: true, paired: false, mobile: true });
    expect(items.map((i) => i.id)).toEqual(["signedIn", "firstAccept", "firstList"]);
  });

  it("shows only for new users who have not dismissed or finished", () => {
    const seeded = seedMilestones(fresh(), {}, NOW);
    const items = checklistItems(seeded, { signedIn: false, paired: false });
    expect(shouldShowChecklist(seeded, items)).toBe(true);
    expect(shouldShowChecklist({ ...seeded, dismissed: true }, items)).toBe(false);
    expect(shouldShowChecklist({ ...seeded, existing: true }, items)).toBe(false);
    expect(shouldShowChecklist(fresh(), items)).toBe(false);
    const allDone = { ...seeded, done: { firstAccept: 1, firstSend: 1, firstList: 1 } };
    expect(shouldShowChecklist(allDone, checklistItems(allDone, { signedIn: true, paired: true }))).toBe(false);
  });
});
