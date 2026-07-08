import { describe, expect, it } from "vitest";
import { addMonthsUtc, compNameFromCode, parseCompMonths } from "../comp-codes";

describe("parseCompMonths", () => {
  it("parses the going-forward NAMEFREE#M format", () => {
    expect(parseCompMonths("CAREESEFREE3M")).toBe(3);
    expect(parseCompMonths("BRANDONFREE12M")).toBe(12);
    expect(parseCompMonths("careesefree6m")).toBe(6); // case-insensitive
  });

  it("parses FREE#Y as years", () => {
    expect(parseCompMonths("JOFREE1Y")).toBe(12);
    expect(parseCompMonths("JOFREE2YEARS")).toBe(24);
  });

  it("parses legacy digit-adjacent-to-FREE codes", () => {
    expect(parseCompMonths("BRANDON3FREE")).toBe(3);
    expect(parseCompMonths("CAREESE3FREE")).toBe(3);
    expect(parseCompMonths("FREE6")).toBe(6);
    expect(parseCompMonths("3MOFREE")).toBe(3);
  });

  it("parses spelled-out month/year windows", () => {
    expect(parseCompMonths("CHRISTINAONEYEARFREE")).toBe(12);
    expect(parseCompMonths("CARRIEONEYEARFREE")).toBe(12);
    expect(parseCompMonths("SIXMONTHSFREE")).toBe(6);
    expect(parseCompMonths("YEARFREE")).toBe(12);
  });

  it("returns null for non-comp codes", () => {
    expect(parseCompMonths("COURTNEY")).toBeNull();
    expect(parseCompMonths("SAMANTHA")).toBeNull();
    expect(parseCompMonths("AFFNEWBIE20")).toBeNull();
    expect(parseCompMonths("AFFBOOST30")).toBeNull();
    expect(parseCompMonths("BENABLE")).toBeNull(); // free comp but code carries no duration -> manual
    expect(parseCompMonths("")).toBeNull();
    expect(parseCompMonths(null)).toBeNull();
  });

  it("rejects out-of-range durations", () => {
    expect(parseCompMonths("XFREE0M")).toBeNull();
    expect(parseCompMonths("XFREE99M")).toBeNull();
  });
});

describe("compNameFromCode", () => {
  it("extracts the leading name segment", () => {
    expect(compNameFromCode("CAREESEFREE3M")).toBe("Careese");
    expect(compNameFromCode("BRANDON3FREE")).toBe("Brandon");
    expect(compNameFromCode("CHRISTINAONEYEARFREE")).toBe("Christina");
  });

  it("returns null when nothing sensible remains", () => {
    expect(compNameFromCode("3FREE")).toBeNull();
    expect(compNameFromCode("")).toBeNull();
  });
});

describe("addMonthsUtc", () => {
  it("adds whole months in UTC", () => {
    expect(addMonthsUtc("2026-01-15T00:00:00.000Z", 3)).toBe("2026-04-15T00:00:00.000Z");
    expect(addMonthsUtc("2026-01-15T00:00:00.000Z", 12)).toBe("2027-01-15T00:00:00.000Z");
  });

  it("clamps overflowing day-of-month to the last day", () => {
    // Jan 31 + 1 month -> Feb 28 (2026 is not a leap year).
    expect(addMonthsUtc("2026-01-31T00:00:00.000Z", 1)).toBe("2026-02-28T00:00:00.000Z");
  });
});
