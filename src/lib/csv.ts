/**
 * csv.ts - tiny CSV helpers shared by the dashboard export routes.
 *
 * RFC 4180 quoting: a cell is wrapped in double quotes when it contains a
 * comma, a double quote, or a line break, and embedded double quotes are
 * doubled. Everything else is emitted verbatim. Numbers are stringified;
 * null/undefined become an empty cell.
 */
import { NextResponse } from "next/server";

export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const v = typeof value === "string" ? value : String(value);
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Builds a CSV document: one header line, one line per row, "\n" line
 * endings, and a trailing newline. Every cell (headers included) goes through
 * csvCell so callers never have to think about quoting.
 */
export function toCsv(headers: readonly string[], rows: readonly (readonly CsvValue[])[]): string {
  const lines = [headers.map(csvCell).join(",")];
  for (const row of rows) lines.push(row.map(csvCell).join(","));
  return `${lines.join("\n")}\n`;
}

/**
 * Wraps a CSV body as a file download. The filename is sanitised to a safe
 * subset so a caller can pass anything (dates, user-provided labels) without
 * breaking the Content-Disposition header.
 */
export function csvResponse(body: string, filename: string): NextResponse {
  const safeName = filename.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "export.csv";
  const withExt = safeName.toLowerCase().endsWith(".csv") ? safeName : `${safeName}.csv`;
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${withExt}"`,
      "Cache-Control": "no-store",
    },
  });
}
