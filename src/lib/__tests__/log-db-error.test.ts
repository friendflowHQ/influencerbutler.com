/**
 * Summary: logDbError must never emit the PostgREST `details` field (row PII).
 * Dependencies: vitest, ../log-db-error.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { logDbError } from "../log-db-error";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logDbError", () => {
  it("logs code/message/hint but never details", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logDbError("tax-form POST: form upsert failed", {
      code: "23514",
      message: "new row violates check constraint",
      hint: "check the form_type value",
      // details on a CHECK failure is "Failing row contains (SAMANTHA JO OLSON, 7795 171ST ST W, ...)"
      details: "Failing row contains (SAMANTHA JO OLSON, 7795 171ST ST W, 6729)",
    });

    expect(spy).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(spy.mock.calls[0]);
    expect(logged).toContain("23514");
    expect(logged).toContain("check the form_type value");
    expect(logged).not.toContain("Failing row contains");
    expect(logged).not.toContain("SAMANTHA");
    expect(logged).not.toContain("6729");
  });

  it("tolerates a null/non-object error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logDbError("tag", null);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
