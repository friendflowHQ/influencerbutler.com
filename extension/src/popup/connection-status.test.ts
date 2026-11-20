import { describe, expect, it } from "vitest";
import { deriveConnection } from "./connection-status";

const base = { signedIn: true, appPaired: true, queueDepth: 0, lastSyncError: null };

describe("deriveConnection", () => {
  it("connected when signed in and paired", () => {
    expect(deriveConnection(base).state).toBe("connected");
  });
  it("partial when signed in but not paired", () => {
    expect(deriveConnection({ ...base, appPaired: false })).toMatchObject({ state: "partial", target: "app-bridge" });
  });
  it("disconnected when signed out, even if the app is paired", () => {
    expect(deriveConnection({ ...base, signedIn: false })).toMatchObject({ state: "disconnected", target: "account" });
  });
  it("syncing while items are queued, problem when a sync error exists", () => {
    expect(deriveConnection({ ...base, queueDepth: 3 }).state).toBe("syncing");
    expect(deriveConnection({ ...base, queueDepth: 3, lastSyncError: "timeout" }).state).toBe("problem");
  });
  it("a stale error with an empty queue is not a problem", () => {
    expect(deriveConnection({ ...base, lastSyncError: "old" }).state).toBe("connected");
  });
});
