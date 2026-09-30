// Google Sheet deal importer: a curator-maintained spreadsheet (e.g. "Save
// With Cindy") as one more deal source alongside scraped aggregator pages.
// One row per deal. A public ("Anyone with the link can view") sheet is
// fetchable as a CSV export with no sign-in, so this stays credential-less
// like the rest of the harvester. Pure and DOM-free (no googleapis
// dependency, no DOMParser), so it runs fine in the MV3 service worker and is
// unit-testable the same way extract.ts is.

import { parseDealBlock, type HarvestedDeal } from "./extract";

const SHEET_URL_RE = /^https?:\/\/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/;

export function isGoogleSheetUrl(url: string): boolean {
  return SHEET_URL_RE.test(url.trim());
}

/**
 * The CSV export URL for the sheet and tab a share link points at. The tab
 * (gid) rides in the URL's `#gid=` fragment (or occasionally a `gid=` query
 * param) whenever the link was copied from a specific tab, which is how a
 * multi-tab sheet like "Save With Cindy" (one tab per day) naturally scopes
 * an import to "whichever tab the user linked" with no picker needed.
 * Defaults to gid 0 (the sheet's first tab) when the link carries none.
 * Returns null for a non-Sheets URL.
 */
export function sheetCsvExportUrl(url: string): string | null {
  const m = url.trim().match(SHEET_URL_RE);
  if (!m) return null;
  const id = m[1] as string;
  let gid = "0";
  try {
    const parsed = new URL(url);
    const fromHash = parsed.hash.match(/gid=(\d+)/);
    const fromQuery = parsed.searchParams.get("gid");
    gid = fromHash?.[1] ?? fromQuery ?? "0";
  } catch {
    // malformed URL past the regex match; fall back to gid 0
  }
  return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

/**
 * Minimal RFC4180 CSV parser: quoted fields, embedded commas/newlines inside
 * quotes, and doubled-quote escaping ("" -> "). No third-party CSV dependency
 * exists in this project, and Sheets' CSV export never needs anything fancier
 * (no custom delimiters, no BOM handling beyond a leading strip).
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.startsWith("﻿") ? text.slice(1) : text;

  const endField = (): void => {
    row.push(field);
    field = "";
  };
  const endRow = (): void => {
    endField();
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i] as string;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      endField();
    } else if (c === "\r") {
      // swallow; \n (bare or paired with this \r) ends the row
    } else if (c === "\n") {
      endRow();
    } else {
      field += c;
    }
  }
  // Trailing field/row if the text didn't end on a newline.
  if (field.length > 0 || row.length > 0) endRow();

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

const CODE_HEADER_RE = /code|coupon|promo/i;

/**
 * Turn parsed CSV rows (header row first) into deals, one per data row.
 * Layout-agnostic on purpose: rather than requiring specific column names,
 * every cell in a row is joined into one text block and run through the same
 * block parser the savewithcindy.shop HTML path uses (parseDealBlock), which
 * finds the Amazon link + promo code + dates wherever they land. A header
 * explicitly named "Code"/"Coupon"/"Promo" is used to prefer that column's
 * value over the block guess (more precise when the sheet is explicit about
 * it, and harmless when it agrees), so this keeps working whether a sheet
 * puts everything in one free-text "Deals" cell (like Save With Cindy) or
 * spreads it across columns.
 */
export function extractDealsFromSheetRows(rows: string[][], sourceUrl: string): HarvestedDeal[] {
  if (rows.length < 2) return [];
  const header = rows[0] as string[];
  let codeCol = -1;
  header.forEach((h, i) => {
    if (codeCol === -1 && CODE_HEADER_RE.test(h.trim())) codeCol = i;
  });

  const out: HarvestedDeal[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r] as string[];
    const block = cells.join("\n");
    const codeCell = codeCol >= 0 ? (cells[codeCol] ?? "").trim() : "";

    const deal = parseDealBlock(block, sourceUrl);
    if (!deal) continue;

    out.push(codeCell ? { ...deal, promoCode: codeCell } : deal);
  }
  return out;
}

/**
 * Fetch a public Google Sheet's active tab as CSV and extract its deals. No
 * credentials are sent (matches the rest of the harvester: an aggregator
 * never sees the user's session). Throws on a non-OK response - a private
 * sheet, a deleted sheet, or a network failure - so the caller's existing
 * per-URL error handling surfaces it instead of this silently returning
 * nothing.
 */
export async function fetchGoogleSheetDeals(url: string): Promise<HarvestedDeal[]> {
  const csvUrl = sheetCsvExportUrl(url);
  if (!csvUrl) return [];
  const res = await fetch(csvUrl, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = await res.text();
  const rows = parseCsv(text);
  return extractDealsFromSheetRows(rows, url);
}
