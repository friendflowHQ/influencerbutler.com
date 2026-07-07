import type { HarvestResult } from "./harvest";
import type { ProductDetail } from "./enrich";
import type { EnrichedProduct } from "../../shared/messages";

// Builds a CSV of every content item and its tagged products (one row per
// tagged product; items with no products get a single untagged /
// no_products_found row). A `flags` column marks every issue (untagged,
// over_tagged, unavailable) so the export is reviewable without opening any
// product page. When the opt-in availability / parent-ASIN pass ran, those
// columns are filled in; when the Creator API pass ran, the api_* columns are
// too. Triggers a browser download from the content script via a blob URL, so
// no downloads permission is needed.

// A content item tagged with more than this many products is flagged as
// over-tagged. Kept here (not in panel.ts) so both the panel and the CSV share
// one definition without a circular import.
export const OVER_TAGGED_THRESHOLD = 10;

function esc(value: string): string {
  const v = value ?? "";
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const HEADER = [
  "content_type",
  "title",
  "url",
  "status",
  "flags",
  "tagged_asin",
  "available",
  "parent_asin",
  "api_title",
  "brand",
  "price",
  "currency",
  "availability_message",
  "prime_eligible",
  "image_url",
  "marketplace",
];

export function buildCsv(
  result: HarvestResult,
  details?: Map<string, ProductDetail>,
  enriched?: Map<string, EnrichedProduct>,
): string {
  const rows: string[] = [HEADER.join(",")];

  const detailCols = (asin: string): [string, string] => {
    const d = details?.get(asin);
    if (!d) return ["", ""];
    return [d.available ? "yes" : "no", d.parentAsin ?? ""];
  };

  const enrichedCols = (asin: string): string[] => {
    const e = enriched?.get(asin);
    if (!e) return ["", "", "", "", "", "", "", ""];
    const price = e.priceDisplay ?? (e.priceCents != null ? (e.priceCents / 100).toFixed(2) : "");
    return [
      esc(e.title ?? ""),
      esc(e.brand ?? ""),
      esc(price),
      e.currency ?? "",
      esc(e.availability ?? ""),
      e.primeEligible == null ? "" : e.primeEligible ? "yes" : "no",
      esc(e.imageUrl ?? ""),
      e.marketplace ?? "",
    ];
  };

  for (const item of result.items) {
    const overTagged = item.taggedAsins.length > OVER_TAGGED_THRESHOLD;
    if (item.taggedAsins.length === 0) {
      // productsKnown is true for videos always and for photos/lists once the
      // deep-content pass has actually opened them; only then is "no products"
      // a real untagged finding rather than "not scanned yet".
      const untagged = item.productsKnown;
      const status = untagged ? "untagged" : "no_products_found";
      const flags = untagged ? "untagged" : "";
      rows.push(
        [item.type, esc(item.title), esc(item.url), status, flags, "", "", "", "", "", "", "", "", "", "", ""].join(","),
      );
    } else {
      for (const asin of item.taggedAsins) {
        const [available, parent] = detailCols(asin);
        const unavailable = details?.get(asin)?.available === false;
        const flags = [overTagged ? "over_tagged" : "", unavailable ? "unavailable" : ""]
          .filter(Boolean)
          .join(";");
        rows.push(
          [
            item.type,
            esc(item.title),
            esc(item.url),
            "tagged",
            flags,
            asin,
            available,
            parent,
            ...enrichedCols(asin),
          ].join(","),
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
