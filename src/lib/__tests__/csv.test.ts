import { describe, expect, it } from "vitest";
import { csvCell, csvResponse, toCsv } from "../csv";

describe("csvCell", () => {
  it("passes plain values through untouched", () => {
    expect(csvCell("hello")).toBe("hello");
    expect(csvCell("B0ABC12345")).toBe("B0ABC12345");
    expect(csvCell(42)).toBe("42");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(true)).toBe("true");
  });

  it("renders null and undefined as an empty cell", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes cells containing commas", () => {
    expect(csvCell("Widget, blue")).toBe('"Widget, blue"');
  });

  it("quotes and doubles embedded double quotes", () => {
    expect(csvCell('12" wheel')).toBe('"12"" wheel"');
    expect(csvCell('"quoted"')).toBe('"""quoted"""');
  });

  it("quotes cells containing line breaks (LF and CRLF)", () => {
    expect(csvCell("line one\nline two")).toBe('"line one\nline two"');
    expect(csvCell("line one\r\nline two")).toBe('"line one\r\nline two"');
  });

  it("does not quote whitespace-only or unicode content", () => {
    expect(csvCell("  padded ")).toBe("  padded ");
    expect(csvCell("Café au lait")).toBe("Café au lait");
  });
});

describe("toCsv", () => {
  it("emits a header line, one line per row, and a trailing newline", () => {
    const csv = toCsv(
      ["asin", "title", "amount_cents"],
      [
        ["B0ABC12345", "Plain title", 1234],
        ["B0DEF67890", 'Say "hi", friend', null],
      ],
    );
    expect(csv).toBe(
      'asin,title,amount_cents\nB0ABC12345,Plain title,1234\nB0DEF67890,"Say ""hi"", friend",\n',
    );
  });

  it("quotes headers too", () => {
    expect(toCsv(["a,b", "c"], [])).toBe('"a,b",c\n');
  });

  it("handles an empty row set", () => {
    expect(toCsv(["month", "total_cents"], [])).toBe("month,total_cents\n");
  });
});

describe("csvResponse", () => {
  it("sets download headers and keeps the body verbatim", async () => {
    const res = csvResponse("a,b\n1,2\n", "earnings-months-2026-09-08.csv");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("content-disposition")).toBe(
      'attachment; filename="earnings-months-2026-09-08.csv"',
    );
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.text()).toBe("a,b\n1,2\n");
  });

  it("sanitises unsafe filenames and appends .csv", () => {
    const res = csvResponse("", 'my "report"/2026');
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="my-report-2026.csv"');
    const fallback = csvResponse("", "///");
    expect(fallback.headers.get("content-disposition")).toBe('attachment; filename="export.csv"');
  });
});
