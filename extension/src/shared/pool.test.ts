import { describe, expect, it } from "vitest";
import { runPool } from "./pool";

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("runPool", () => {
  it("processes every item", async () => {
    const seen: number[] = [];
    await runPool([1, 2, 3, 4, 5], async (n) => {
      await tick();
      seen.push(n);
    }, { limit: 3 });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async () => {
    let inFlight = 0;
    let peak = 0;
    await runPool(Array.from({ length: 10 }, (_, i) => i), async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await tick();
      inFlight -= 1;
    }, { limit: 3 });
    expect(peak).toBe(3);
  });

  it("starts items in order", async () => {
    const started: number[] = [];
    await runPool([0, 1, 2, 3, 4, 5], async (n) => {
      started.push(n);
      await tick();
    }, { limit: 2 });
    expect(started).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("stops starting new items once shouldStop is true, letting in-flight finish", async () => {
    let stop = false;
    const finished: number[] = [];
    await runPool([0, 1, 2, 3, 4, 5, 6, 7], async (n) => {
      if (n === 1) stop = true;
      await tick();
      finished.push(n);
    }, { limit: 2, shouldStop: () => stop });
    expect(finished).toContain(0);
    expect(finished).toContain(1);
    expect(finished.length).toBeLessThan(8);
  });

  it("handles an empty list and a limit larger than the list", async () => {
    await runPool([], async () => {}, { limit: 3 });
    const seen: string[] = [];
    await runPool(["a"], async (s) => { seen.push(s); }, { limit: 5 });
    expect(seen).toEqual(["a"]);
  });
});
