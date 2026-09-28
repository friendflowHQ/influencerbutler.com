/**
 * Summary: Unit tests for the engineering-queue dedupe + ranking (pure funcs).
 * Dependencies: vitest, ../engineering-queue. No network (buildQueue/clusterTickets
 * are pure over an array of tickets).
 */
import { describe, it, expect } from "vitest";
import { buildQueue, clusterTickets } from "../engineering-queue";
import type { WorkerTicket } from "../support-sweep";

function t(p: Partial<WorkerTicket> & { id: string }): WorkerTicket {
  return { classification: "bug", status: "sent", ...p };
}

const TICKETS: WorkerTicket[] = [
  t({ id: "fb-1", classification: "bug", title: "Export button broken on Walmart list", userEmail: "a@x.com", priority: "P2", submittedAt: 100 }),
  t({ id: "fb-2", classification: "bug", title: "Walmart list export button not working", userEmail: "b@x.com", priority: "P1", submittedAt: 200 }),
  t({ id: "fb-3", classification: "feature", title: "Add dark mode to desktop", userEmail: "c@x.com", submittedAt: 150 }),
  t({ id: "fb-4", classification: "bug", title: "Instagram post keeps failing", userEmail: "d@x.com", priority: "P0", submittedAt: 300 }),
  t({ id: "fb-5", classification: "bug", title: "Export drops rows on Walmart", userEmail: "e@x.com", status: "fixed", submittedAt: 50 }),
  t({ id: "fb-6", classification: "feature", title: "Dark mode please", userEmail: "f@x.com", submittedAt: 160 }),
];

describe("clusterTickets", () => {
  it("merges near-duplicate titles within a classification", () => {
    const clusters = clusterTickets([TICKETS[0], TICKETS[1]]);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].tickets.map((x) => x.id).sort()).toEqual(["fb-1", "fb-2"]);
  });

  it("never merges a bug with a feature even on shared words", () => {
    const clusters = clusterTickets([
      t({ id: "fb-a", classification: "bug", title: "dark mode screen is broken" }),
      t({ id: "fb-b", classification: "feature", title: "add dark mode screen" }),
    ]);
    expect(clusters).toHaveLength(2);
  });
});

describe("buildQueue", () => {
  const items = buildQueue(TICKETS);

  it("excludes terminal-status tickets (fixed)", () => {
    const allIds = items.flatMap((i) => i.sourceTicketIds);
    expect(allIds).not.toContain("fb-5");
  });

  it("dedupes the two export reports into one item with frequency 2", () => {
    const exportItem = items.find((i) => i.sourceTicketIds.includes("fb-1"));
    expect(exportItem).toBeDefined();
    expect(exportItem!.sourceTicketIds.sort()).toEqual(["fb-1", "fb-2"]);
    expect(exportItem!.frequency).toBe(2);
    expect(exportItem!.priority).toBe("P1"); // best of P2/P1
    expect(exportItem!.queueId).toMatch(/^eng-[0-9a-f]{1,6}$/);
  });

  it("ranks bugs before features, and P0 before P1 within bugs", () => {
    expect(items).toHaveLength(3); // {export}, {instagram}, {dark mode}
    expect(items[0].classification).toBe("bug");
    expect(items[0].sourceTicketIds).toContain("fb-4"); // Instagram P0 first
    expect(items[1].classification).toBe("bug"); // export P1 second
    expect(items[2].classification).toBe("feature"); // dark mode last
    expect(items[2].frequency).toBe(2);
  });

  it("excludes items already tagged eng-done", () => {
    const withDone = buildQueue([
      ...TICKETS,
      t({ id: "fb-9", classification: "bug", title: "Totally unique done bug", tags: "eng-done", userEmail: "z@x.com" }),
    ]);
    const ids = withDone.flatMap((i) => i.sourceTicketIds);
    expect(ids).not.toContain("fb-9");
  });

  it("flags never-before-queued items as new", () => {
    expect(items.every((i) => i.isNew)).toBe(true);
    const withQueued = buildQueue([
      t({ id: "fb-x", classification: "bug", title: "Something previously queued", tags: "eng-queue", userEmail: "q@x.com" }),
    ]);
    expect(withQueued[0].isNew).toBe(false);
  });
});
