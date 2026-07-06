import { addSection, chip, el } from "../../ui/components";
import { harvestStorefront, type ContentType, type HarvestResult } from "./harvest";
import {
  enrichContentProducts,
  enrichProductDetails,
  DETAIL_CAP,
  type ProductDetail,
} from "./enrich";
import { buildCsv, downloadCsv } from "./csv";
import { sendToBackground } from "../../shared/messages";
import type { Finding, StorefrontIssueFinding } from "../../transport/types";

const OVER_TAGGED_THRESHOLD = 10;

// Storefront checkup. The fast default (one getItems harvest, no scrolling, no
// images) counts every content type and checks video tags. Three opt-in boxes
// (off by default) add slower per-item passes: photo/list product tags,
// product availability, and parent ASINs.
export function initStorefrontPanel(): void {
  const section = addSection("Storefront checkup");
  section.append(
    el(
      "p",
      "note",
      "Fast scan of your whole storefront through Amazon's own feed: no scrolling, no images loaded. The boxes below add slower deep checks that open each item.",
    ),
  );

  const deepContent = checkbox("Also scan photo and list product tags");
  const checkAvailability = checkbox("Check product availability (opens each product)");
  const parentAsins = checkbox("Resolve parent ASINs (opens each product)");
  section.append(deepContent.wrap, checkAvailability.wrap, parentAsins.wrap);

  const button = el("button", "btn");
  button.textContent = "Check my storefront";
  const stopBtn = el("button", "btn secondary");
  stopBtn.textContent = "Stop";
  stopBtn.style.display = "none";
  const controls = el("div", "row");
  controls.append(button, stopBtn);

  const progress = el("p", "progress");
  const summary = el("div", "counts");
  const stats = el("div", "counts");
  const list = el("ul", "list");
  const exportRow = el("div", "row");
  section.append(controls, progress, summary, stats, list, exportRow);

  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  button.addEventListener("click", () => {
    abort = new AbortController();
    const signal = abort.signal;
    const wantDetails = checkAvailability.input.checked || parentAsins.input.checked;

    button.disabled = true;
    stopBtn.style.display = wantDetails || deepContent.input.checked ? "inline-block" : "none";
    [summary, stats, list, exportRow].forEach((n) => n.replaceChildren());
    progress.textContent = "Scanning the feed...";

    void run()
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") {
          progress.textContent = "Scan failed. Reload the storefront tab and try again.";
        } else {
          progress.textContent = "Stopped.";
        }
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = "Rescan";
        stopBtn.style.display = "none";
      });

    async function run(): Promise<void> {
      const result = await harvestStorefront((pages, items) => {
        progress.textContent = `Scanning the feed... ${items} items across ${pages} pages`;
      });

      if (deepContent.input.checked) {
        await enrichContentProducts(
          result.items,
          (done, total) => (progress.textContent = `Opening photos and lists... ${done} of ${total}`),
          signal,
        );
      }

      let details: Map<string, ProductDetail> | undefined;
      if (wantDetails) {
        const unique = [...new Set(result.items.flatMap((i) => i.taggedAsins))];
        const res = await enrichProductDetails(
          unique,
          (done, total) => (progress.textContent = `Opening products... ${done} of ${total}`),
          signal,
        );
        details = res.details;
        if (res.capped) {
          progress.textContent = `Checked the first ${DETAIL_CAP} products (storefront has more).`;
        }
      }

      render(result, details, { summary, stats, list, exportRow }, checkAvailability.input.checked);
      progress.textContent = `Done: ${result.items.length} items across ${result.pages} pages${result.capped ? " (feed capped)" : ""}.`;
    }
  });

  stopBtn.addEventListener("click", () => abort?.abort());
}

function render(
  result: HarvestResult,
  details: Map<string, ProductDetail> | undefined,
  nodes: { summary: HTMLElement; stats: HTMLElement; list: HTMLElement; exportRow: HTMLElement },
  checkedAvailability: boolean,
): void {
  const label: Record<ContentType, string> = {
    video: "videos",
    photo: "photos",
    "idea-list": "idea lists",
    "media-list": "media lists",
  };
  for (const type of ["video", "photo", "idea-list", "media-list"] as ContentType[]) {
    nodes.summary.append(chip("", `${result.counts[type]} ${label[type]}`));
  }

  const untagged = result.items.filter((i) => i.type === "video" && i.taggedAsins.length === 0);
  const overTagged = result.items.filter((i) => i.taggedAsins.length > OVER_TAGGED_THRESHOLD);
  const uniqueProducts = new Set(result.items.flatMap((i) => i.taggedAsins));
  const unavailable = details
    ? [...uniqueProducts].filter((a) => details.get(a)?.available === false)
    : [];

  nodes.stats.append(
    chip(untagged.length > 0 ? "bad" : "good", `${untagged.length} untagged`),
    chip(overTagged.length > 0 ? "warn" : "good", `${overTagged.length} over-tagged`),
    chip("", `${uniqueProducts.size} unique products`),
  );
  if (checkedAvailability) {
    nodes.stats.append(chip(unavailable.length > 0 ? "bad" : "good", `${unavailable.length} unavailable`));
  }

  const storefrontUrl = location.origin + location.pathname;
  const now = new Date().toISOString();
  const record = (finding: StorefrontIssueFinding) =>
    void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding });

  for (const v of untagged.slice(0, 40)) {
    const li = el("li");
    li.append(el("span", "t", v.title));
    appendOpen(li, v.url);
    nodes.list.append(li);
    record({ type: "storefront_issue", storefrontUrl, issueType: "untagged", severity: "error", subject: v.title, detail: "No tagged products, so it earns nothing.", detectedAt: now });
  }
  for (const asin of unavailable.slice(0, 40)) {
    const li = el("li");
    li.append(el("span", "t", `Unavailable product ${asin}`));
    appendOpen(li, `${location.origin}/dp/${asin}`);
    nodes.list.append(li);
    record({ type: "storefront_issue", storefrontUrl, issueType: "unavailable_product", severity: "warn", subject: asin, detail: "Tagged product is no longer available.", detectedAt: now });
  }
  if (untagged.length === 0 && unavailable.length === 0) {
    nodes.list.append(el("li", "", "No untagged or unavailable issues found."));
  }

  const csvBtn = el("button", "btn secondary");
  csvBtn.textContent = "Export tagged products (CSV)";
  csvBtn.addEventListener("click", () =>
    downloadCsv(`storefront-${creatorHandle()}-${now.slice(0, 10)}.csv`, buildCsv(result, details)),
  );
  nodes.exportRow.append(csvBtn);
}

function appendOpen(li: HTMLElement, url: string): void {
  if (!url) return;
  const a = el("a", "", "Open");
  (a as HTMLAnchorElement).href = url;
  (a as HTMLAnchorElement).target = "_blank";
  li.append(a);
}

function checkbox(text: string): { wrap: HTMLElement; input: HTMLInputElement } {
  const wrap = el("label", "row toggle");
  wrap.style.gap = "8px";
  const input = el("input");
  input.type = "checkbox";
  input.style.width = "auto";
  input.style.flex = "none";
  wrap.append(input, el("span", "note", text));
  return { wrap, input };
}

function creatorHandle(): string {
  return location.pathname.match(/\/shop\/([^/?#]+)/)?.[1] ?? "storefront";
}
