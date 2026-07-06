import { addSection, chip, el } from "../../ui/components";
import { harvestStorefront, type ContentType, type HarvestResult } from "./harvest";
import { buildCsv, downloadCsv } from "./csv";
import { sendToBackground } from "../../shared/messages";
import type { Finding, StorefrontIssueFinding } from "../../transport/types";

const OVER_TAGGED_THRESHOLD = 10;

// Storefront checkup. One "Check" button harvests the whole storefront through
// Amazon's getItems feed (no scrolling, no image rendering, all pages), counts
// every content type, surfaces untagged and over-tagged videos, and exports
// the full tagged-product list as CSV.
export function initStorefrontPanel(): void {
  const section = addSection("Storefront checkup");
  const intro = el("p", "note");
  intro.textContent =
    "Scans your whole storefront through Amazon's own feed: fast, no scrolling, no images loaded.";
  const button = el("button", "btn");
  button.textContent = "Check my storefront";
  const progress = el("p", "progress");
  const summary = el("div", "counts");
  const list = el("ul", "list");
  const exportRow = el("div", "row");
  section.append(intro, button, progress, summary, list, exportRow);

  button.addEventListener("click", () => {
    button.disabled = true;
    summary.replaceChildren();
    list.replaceChildren();
    exportRow.replaceChildren();
    progress.textContent = "Scanning...";

    void harvestStorefront((pages, items) => {
      progress.textContent = `Scanning... ${items} items across ${pages} page${pages === 1 ? "" : "s"}`;
    })
      .then((result) => {
        render(result, summary, list, exportRow, section);
        progress.textContent = `Done: ${result.items.length} items in ${result.pages} pages${result.capped ? " (capped)" : ""}.`;
      })
      .catch(() => {
        progress.textContent = "Scan failed. Reload the storefront tab and try again.";
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = "Rescan";
      });
  });
}

function render(
  result: HarvestResult,
  summary: HTMLElement,
  list: HTMLElement,
  exportRow: HTMLElement,
  section: HTMLElement,
): void {
  const label: Record<ContentType, string> = {
    video: "videos",
    photo: "photos",
    "idea-list": "idea lists",
    "media-list": "media lists",
  };
  for (const type of ["video", "photo", "idea-list", "media-list"] as ContentType[]) {
    summary.append(chip("", `${result.counts[type]} ${label[type]}`));
  }

  const videos = result.items.filter((i) => i.type === "video");
  const untagged = videos.filter((v) => v.taggedAsins.length === 0);
  const overTagged = videos.filter((v) => v.taggedAsins.length > OVER_TAGGED_THRESHOLD);
  const uniqueProducts = new Set(result.items.flatMap((i) => i.taggedAsins));

  const stats = el("div", "counts");
  stats.append(
    chip(untagged.length > 0 ? "bad" : "good", `${untagged.length} untagged videos`),
    chip(overTagged.length > 0 ? "warn" : "good", `${overTagged.length} over-tagged`),
    chip("", `${uniqueProducts.size} unique products tagged`),
  );
  section.insertBefore(stats, list);

  // List the untagged videos (the ones earning nothing), and record them.
  const storefrontUrl = location.origin + location.pathname;
  const now = new Date().toISOString();
  for (const v of untagged.slice(0, 50)) {
    const li = el("li");
    li.append(el("span", "t", v.title));
    if (v.url) {
      const a = el("a", "", "Open");
      (a as HTMLAnchorElement).href = v.url;
      (a as HTMLAnchorElement).target = "_blank";
      li.append(a);
    }
    list.append(li);
    const finding: StorefrontIssueFinding = {
      type: "storefront_issue",
      storefrontUrl,
      issueType: "untagged",
      severity: "error",
      subject: v.title,
      detail: "Video has no tagged products, so it cannot earn commissions.",
      detectedAt: now,
    };
    void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding });
  }
  if (untagged.length === 0) {
    list.append(el("li", "", "No untagged videos. Every video tags at least one product."));
  }

  const csvBtn = el("button", "btn secondary");
  csvBtn.textContent = "Export all tagged products (CSV)";
  csvBtn.addEventListener("click", () => {
    downloadCsv(`storefront-${creatorHandle()}-${now.slice(0, 10)}.csv`, buildCsv(result));
  });
  exportRow.append(csvBtn);

  if (result.items.some((i) => i.type !== "video" && !i.productsKnown)) {
    section.append(
      el(
        "p",
        "note",
        "Photo and list product tags are not in the feed. The desktop app harvests those (and product availability) in full.",
      ),
    );
  }
}

function creatorHandle(): string {
  return location.pathname.match(/\/shop\/([^/?#]+)/)?.[1] ?? "storefront";
}
