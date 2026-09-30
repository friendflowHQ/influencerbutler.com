import { afterEach, describe, expect, it, vi } from "vitest";
import {
  extractDealsFromSheetRows,
  fetchGoogleSheetDeals,
  isGoogleSheetUrl,
  parseCsv,
  sheetCsvExportUrl,
} from "./sheet-import";

describe("isGoogleSheetUrl", () => {
  it("recognizes a spreadsheet share link", () => {
    expect(isGoogleSheetUrl("https://docs.google.com/spreadsheets/d/1tWluC8seWjSEkrd3K8mukyNaPv_JWowi3242UIg0ioY/edit?gid=799185511#gid=799185511")).toBe(true);
  });

  it("rejects a non-Sheets URL, including other docs.google.com paths", () => {
    expect(isGoogleSheetUrl("https://www.savewithcindy.shop/")).toBe(false);
    expect(isGoogleSheetUrl("https://docs.google.com/document/d/abc")).toBe(false);
  });
});

describe("sheetCsvExportUrl", () => {
  it("reads the spreadsheet id and the tab's gid from the URL hash", () => {
    const url =
      "https://docs.google.com/spreadsheets/d/1tWluC8seWjSEkrd3K8mukyNaPv_JWowi3242UIg0ioY/edit?gid=799185511#gid=799185511";
    expect(sheetCsvExportUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/1tWluC8seWjSEkrd3K8mukyNaPv_JWowi3242UIg0ioY/export?format=csv&gid=799185511",
    );
  });

  it("falls back to gid 0 when the link carries none", () => {
    const url = "https://docs.google.com/spreadsheets/d/abcXYZ123/edit";
    expect(sheetCsvExportUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/abcXYZ123/export?format=csv&gid=0",
    );
  });

  it("reads a gid carried as a query param instead of a hash", () => {
    const url = "https://docs.google.com/spreadsheets/d/abcXYZ123/edit?gid=42";
    expect(sheetCsvExportUrl(url)).toBe(
      "https://docs.google.com/spreadsheets/d/abcXYZ123/export?format=csv&gid=42",
    );
  });

  it("returns null for a non-Sheets URL", () => {
    expect(sheetCsvExportUrl("https://www.savewithcindy.shop/")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("splits plain comma-separated rows", () => {
    expect(parseCsv("a,b,c\n1,2,3\n")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("keeps a quoted field's embedded commas and newlines intact", () => {
    const csv = 'Image,Deals,Code\n,"line one\nline two, still in cell",XZ6YABJ5\n';
    expect(parseCsv(csv)).toEqual([
      ["Image", "Deals", "Code"],
      ["", "line one\nline two, still in cell", "XZ6YABJ5"],
    ]);
  });

  it("unescapes doubled quotes inside a quoted field", () => {
    expect(parseCsv('a\n"say ""hi"" now"\n')).toEqual([["a"], ['say "hi" now']]);
  });

  it("drops blank rows and tolerates missing trailing newline", () => {
    expect(parseCsv("a,b\n\n1,2")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

// Fixture mirrors the "Save With Cindy" sheet: an Image column (always blank
// in a CSV export - inserted images never carry over), a Seq column, a
// free-text "Deals" block column in the same line format parseSaveWithCindy
// already understands, then dedicated Product link and Code columns.
const SHEET_CSV =
  "Image,Seq,Deals,Product link,Code\n" +
  '"","#1","44% off UNCLECAT Bow Tie Front Cardigan Sweater\n' +
  "44% off Code: OA5HTSXE\n" +
  "13.99(Reg.24.99)\n" +
  "https://www.amazon.com/dp/B0FDKT757V\n" +
  "End Date: 2026-10-05 23:59 PDT\n" +
  "Start Date: 2026-9-30 00:30 PDT\n" +
  'Note: CC B0FDKT757V","https://www.amazon.com/dp/B0FDKT757V","OA5HTSXE"\n' +
  '"","#2","50% off PRETTYGARDEN Womens Basic Long Sleeve\n' +
  "40% off Code: 3R139Z4Y + 10% Coupon\n" +
  "12.49-13.49(Reg.24.99-26.99)\n" +
  "https://www.amazon.com/dp/B0GS1XP5W1\n" +
  "End Date: 2026-10-05 11:59 PM PDT\n" +
  "Start Date: 2026-09-30 02:00 AM PDT\n" +
  'Note: 15%CC B0GS1XP5W1","https://www.amazon.com/dp/B0GS1XP5W1","3R139Z4Y"\n' +
  '"","#3","no amazon link in this row, just filler text","",""\n';

describe("extractDealsFromSheetRows", () => {
  it("extracts asin, code, percent, and normalized dates from a Save With Cindy-shaped sheet", () => {
    const rows = parseCsv(SHEET_CSV);
    const deals = extractDealsFromSheetRows(rows, "https://docs.google.com/spreadsheets/d/abc/edit");
    expect(deals).toHaveLength(2);
    expect(deals[0]).toEqual({
      asin: "B0FDKT757V",
      marketplace: "amazon.com",
      sourceUrl: "https://docs.google.com/spreadsheets/d/abc/edit",
      promoCode: "OA5HTSXE",
      promoPercentOff: 44,
      startDate: "2026-09-30T00:30:00-07:00",
      endDate: "2026-10-05T23:59:00-07:00",
    });
    expect(deals[1]?.asin).toBe("B0GS1XP5W1");
    expect(deals[1]?.promoCode).toBe("3R139Z4Y");
  });

  it("skips a row with no Amazon link anywhere in it", () => {
    const rows = parseCsv(SHEET_CSV);
    const asins = extractDealsFromSheetRows(rows, "https://docs.google.com/spreadsheets/d/abc/edit").map(
      (d) => d.asin,
    );
    expect(asins).toEqual(["B0FDKT757V", "B0GS1XP5W1"]);
  });

  it("prefers a dedicated Code column over a block-parsed code", () => {
    const csv =
      "Deals,Product link,Code\n" +
      '"50% off Code: WRONGCODE\nhttps://www.amazon.com/dp/B0JJJJJJJJ","https://www.amazon.com/dp/B0JJJJJJJJ","RIGHTCODE"\n';
    const deals = extractDealsFromSheetRows(parseCsv(csv), "https://sheet.example/");
    expect(deals[0]?.promoCode).toBe("RIGHTCODE");
  });

  it("returns nothing for a header-only sheet", () => {
    expect(extractDealsFromSheetRows(parseCsv("Image,Seq,Deals,Product link,Code\n"), "https://sheet.example/")).toEqual(
      [],
    );
  });
});

describe("fetchGoogleSheetDeals", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches the CSV export with no credentials and extracts its deals", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => SHEET_CSV }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const url = "https://docs.google.com/spreadsheets/d/abc/edit#gid=5";
    const deals = await fetchGoogleSheetDeals(url);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://docs.google.com/spreadsheets/d/abc/export?format=csv&gid=5",
      { credentials: "omit" },
    );
    expect(deals).toHaveLength(2);
  });

  it("throws on a non-OK response instead of returning nothing silently", async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 403, text: async () => "" })) as unknown as typeof fetch;
    await expect(fetchGoogleSheetDeals("https://docs.google.com/spreadsheets/d/abc/edit")).rejects.toThrow("HTTP 403");
  });
});
