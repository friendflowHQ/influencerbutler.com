import type { HarvestResult } from "./harvest";

// Builds a CSV of every video and its tagged products (one row per tagged
// product; untagged videos get a single row flagged UNTAGGED). Photos and
// lists are included as counted rows without products, since the feed does not
// carry their tags. Triggers a browser download from the content script via a
// blob URL, so no downloads permission is needed.

function esc(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildCsv(result: HarvestResult): string {
  const rows: string[] = ["content_type,title,url,status,tagged_asin"];
  for (const item of result.items) {
    if (item.type === "video" && item.taggedAsins.length === 0) {
      rows.push([item.type, esc(item.title), esc(item.url), "UNTAGGED", ""].join(","));
    } else if (item.taggedAsins.length > 0) {
      for (const asin of item.taggedAsins) {
        rows.push([item.type, esc(item.title), esc(item.url), "tagged", asin].join(","));
      }
    } else {
      // photo / idea-list / media-list: products not in the feed
      rows.push([item.type, esc(item.title), esc(item.url), "products_need_deep_scan", ""].join(","));
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
