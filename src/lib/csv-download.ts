// Browser-side CSV download for admin table exports. (The server export routes
// use src/lib/csv.ts, which imports next/server and cannot run in the browser.)
// Every field is quoted, and a leading = + - @ is turned into text so exported
// user data cannot run as a formula when opened in Excel or Sheets.

export type CsvCell = string | number | null | undefined;

function esc(value: CsvCell): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
}

export function downloadCsv(filename: string, headers: string[], rows: CsvCell[][]): void {
  const blob = new Blob(["﻿" + buildCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
