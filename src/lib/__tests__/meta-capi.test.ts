import { describe, expect, it } from "vitest";
import { readMetaCookies, sha256Normalized } from "../meta-capi";

describe("sha256Normalized", () => {
  // Known SHA-256 vector for "test@example.com" so a hashing regression can't
  // silently ship: Meta matches on exact hashes, a wrong one matches nobody.
  const EXPECTED = "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";

  it("hashes a normalized email", () => {
    expect(sha256Normalized("test@example.com")).toBe(EXPECTED);
  });

  it("trims and lowercases before hashing (Meta's required normalization)", () => {
    expect(sha256Normalized("  TEST@Example.COM ")).toBe(EXPECTED);
  });
});

describe("readMetaCookies", () => {
  it("returns nulls for a missing header", () => {
    expect(readMetaCookies(null)).toEqual({ fbp: null, fbc: null });
    expect(readMetaCookies("")).toEqual({ fbp: null, fbc: null });
  });

  it("extracts _fbp and _fbc among other cookies", () => {
    const header = "ib_trial_ping=1; _fbp=fb.1.1700000000000.123456789; _fbc=fb.1.1700000000000.AbCdEf; sb-token=x";
    expect(readMetaCookies(header)).toEqual({
      fbp: "fb.1.1700000000000.123456789",
      fbc: "fb.1.1700000000000.AbCdEf",
    });
  });

  it("handles only one of the pair being present", () => {
    expect(readMetaCookies("_fbp=fb.1.2.3")).toEqual({ fbp: "fb.1.2.3", fbc: null });
  });

  it("ignores lookalike names and empty values", () => {
    expect(readMetaCookies("x_fbp=nope; _fbp=; _fbc=fb.1.2.3")).toEqual({
      fbp: null,
      fbc: "fb.1.2.3",
    });
  });
});
