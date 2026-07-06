import type { HarvestResult } from "./harvest";
import type { ProductDetail } from "./enrich";

// Builds a CSV of every content item and its tagged products (one row per
// tagged product; untagged videos get a single UNTAGGED row). When the opt-in
// availability / parent-ASIN passes ran, those columns are filled in too.
// Triggers a browser download from the content script via a blob URL, so no
// downloads permission is needed.

function esc(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildCsv(
  result: HarvestResult,
  details?: Map<string, ProductDetail>,
): string {
  const rows: string[] = ["content_type,title,url,status,tagged_asin,available,parent_asin"];
  const detailCols = (asin: string): [string, string] => {
    const d = details?.get(asin);
    if (!d) return ["", ""];
    return [d.available ? "yes" : "no", d.parentAsin ?? ""];
  };

  for (const item of result.items) {
    if (item.taggedAsins.length === 0) {
      const status = item.type === "video" ? "UNTAGGED" : "no_products_found";
      rows.push([item.type, esc(item.title), esc(item.url), status, "", "", ""].join(","));
    } else {
      for (const asin of item.taggedAsins) {
        const [available, parent] = detailCols(asin);
        rows.push(
          [item.type, esc(item.title), esc(item.url), "tagged", asin, available, parent].join(","),
        );
      }
    }
  }
  return rows.join("\n");
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
