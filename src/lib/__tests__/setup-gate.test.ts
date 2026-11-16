import { describe, expect, it } from "vitest";
import { rowSaysSetupSkipped, setupWalkthroughSkipped, SETUP_REQUIRED_MESSAGE } from "@/lib/setup-gate";

type Row = { onboarding_profile?: unknown; tags?: unknown } | null;

function fakeDb(row: Row, opts: { failFirst?: boolean; throws?: boolean } = {}) {
  let calls = 0;
  return {
    from() {
      if (opts.throws) throw new Error("boom");
      return {
        select() {
          return {
            eq() {
              return {
                maybeSingle: async () => {
                  calls += 1;
                  if (opts.failFirst && calls === 1) return { data: null, error: { code: "42703" } };
                  return { data: row, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

describe("rowSaysSetupSkipped", () => {
  it("blocks only a recorded skipped outcome", () => {
    expect(rowSaysSetupSkipped({ onboarding_profile: { outcome: "skipped" } })).toBe(true);
    expect(rowSaysSetupSkipped({ onboarding_profile: { outcome: "complete" } })).toBe(false);
    expect(rowSaysSetupSkipped({ onboarding_profile: { outcome: "complete-with-skips" } })).toBe(false);
    expect(rowSaysSetupSkipped({ onboarding_profile: { goal: "everything" } })).toBe(false);
    expect(rowSaysSetupSkipped(null)).toBe(false);
  });

  it("falls back to the wt-done tag when the profile column has no outcome", () => {
    expect(rowSaysSetupSkipped({ tags: ["wt-done-skipped"] })).toBe(true);
    expect(rowSaysSetupSkipped({ tags: ["wt-done-complete"] })).toBe(false);
  });

  it("a finished walkthrough in the column wins over a stale skipped tag", () => {
    expect(rowSaysSetupSkipped({ onboarding_profile: { outcome: "complete" }, tags: ["wt-done-skipped"] })).toBe(false);
  });
});

describe("setupWalkthroughSkipped", () => {
  it("reads the subscriber row", async () => {
    expect(await setupWalkthroughSkipped(fakeDb({ onboarding_profile: { outcome: "skipped" } }), "A@B.com")).toBe(true);
  });

  it("retries with tags only when the profile column is missing", async () => {
    expect(await setupWalkthroughSkipped(fakeDb({ tags: ["wt-done-skipped"] }, { failFirst: true }), "a@b.com")).toBe(true);
  });

  it("fails open: no email, no row, or an error never blocks", async () => {
    expect(await setupWalkthroughSkipped(fakeDb({ onboarding_profile: { outcome: "skipped" } }), "")).toBe(false);
    expect(await setupWalkthroughSkipped(fakeDb(null), "a@b.com")).toBe(false);
    expect(await setupWalkthroughSkipped(fakeDb(null, { throws: true }), "a@b.com")).toBe(false);
  });

  it("customer copy has no em-dash", () => {
    expect(SETUP_REQUIRED_MESSAGE).not.toContain("—");
  });
});
