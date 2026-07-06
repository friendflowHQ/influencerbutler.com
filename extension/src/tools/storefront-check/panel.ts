import { addSection, chip, el } from "../../ui/components";
import { harvestStorefront, type ContentType, type HarvestResult } from "./harvest";
import {
  enrichContentProducts,
  enrichProductDetails,
  DETAIL_CAP,
  type ProductDetail,
} from "./enrich";
import { enrichWithCreatorApi } from "./creator-enrich";
import { buildCsv, downloadCsv, OVER_TAGGED_THRESHOLD } from "./csv";
import { t } from "../../i18n";
import { sendToBackground, type EnrichedProduct } from "../../shared/messages";
import type { Finding, StorefrontIssueFinding } from "../../transport/types";

// How many issues of each kind to list in the panel. The lists scroll, but a
// pathological storefront should not build tens of thousands of DOM nodes, so
// cap the render and point the rest at the CSV. Untagged can be large, so it
// gets a shorter preview than the (usually small) unavailable / over-tagged
// sets.
const UNTAGGED_PREVIEW = 100;
const LIST_CAP = 500;
// Findings are deduped server-side, but do not flood the sync queue from one
// huge storefront: record at most this many of each issue type.
const RECORD_CAP = 100;

// Storefront checkup. The fast default (one getItems harvest, no scrolling, no
// images) counts every content type and checks video tags. Opt-in boxes (off
// by default) add slower per-item passes: photo/list product tags, product
// availability, parent ASINs, and Creator API enrichment.
export function initStorefrontPanel(): void {
  const section = addSection(t().storefrontCheckup);
  section.append(el("p", "note", t().sfFastScanNote));

  const deepContent = checkbox(t().sfDeepContent);
  const checkAvailability = checkbox(t().sfCheckAvailability);
  const parentAsins = checkbox(t().sfParentAsins);
  const creatorApi = checkbox(t().sfCreatorApiEnrich);
  section.append(deepContent.wrap, checkAvailability.wrap, parentAsins.wrap, creatorApi.wrap);

  const button = el("button", "btn");
  button.textContent = t().sfCheckButton;
  const stopBtn = el("button", "btn secondary");
  stopBtn.textContent = t().sfStop;
  stopBtn.style.display = "none";
  const controls = el("div", "row");
  controls.append(button, stopBtn);

  const progress = el("p", "progress");
  const summary = el("div", "counts");
  const stats = el("div", "counts");
  const list = el("div", "issues");
  const exportRow = el("div", "row");
  section.append(controls, progress, summary, stats, list, exportRow);

  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  button.addEventListener("click", () => {
    abort = new AbortController();
    const signal = abort.signal;
    const wantDetails = checkAvailability.input.checked || parentAsins.input.checked;
    const wantLongPass = wantDetails || deepContent.input.checked || creatorApi.input.checked;

    button.disabled = true;
    stopBtn.style.display = wantLongPass ? "inline-block" : "none";
    [summary, stats, list, exportRow].forEach((n) => n.replaceChildren());
    progress.textContent = t().sfScanningFeed;

    void run()
      .catch((err) => {
        if ((err as Error)?.name !== "AbortError") {
          progress.textContent = t().sfScanFailed;
        } else {
          progress.textContent = t().sfStopped;
        }
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = t().sfRescan;
        stopBtn.style.display = "none";
      });

    async function run(): Promise<void> {
      const result = await harvestStorefront((pages, items) => {
        progress.textContent = t().sfScanningProgress(items, pages);
      });

      if (deepContent.input.checked) {
        const started = Date.now();
        await enrichContentProducts(
          result.items,
          (done, total) =>
            (progress.textContent = t().sfOpeningPhotos(done, total) + etaSuffix(started, done, total)),
          signal,
        );
      }

      let details: Map<string, ProductDetail> | undefined;
      if (wantDetails) {
        const unique = [...new Set(result.items.flatMap((i) => i.taggedAsins))];
        const started = Date.now();
        const res = await enrichProductDetails(
          unique,
          (done, total) =>
            (progress.textContent =
              t().sfOpeningProducts(done, total) + etaSuffix(started, done, total)),
          signal,
        );
        details = res.details;
        if (res.capped) {
          progress.textContent = t().sfCheckedFirst(DETAIL_CAP);
        }
      }

      let enriched: Map<string, EnrichedProduct> | undefined;
      let creatorApiNote: string | null = null;
      if (creatorApi.input.checked) {
        const unique = [...new Set(result.items.flatMap((i) => i.taggedAsins))];
        const started = Date.now();
        const res = await enrichWithCreatorApi(
          unique,
          location.host,
          (done, total) =>
            (progress.textContent =
              t().sfEnrichingProducts(done, total) + etaSuffix(started, done, total)),
          signal,
        );
        enriched = res.byAsin;
        if (!res.configured) creatorApiNote = t().sfCreatorApiNote;
      }

      render(
        result,
        details,
        enriched,
        { summary, stats, list, exportRow },
        { checkedAvailability: checkAvailability.input.checked, creatorApiNote },
      );
      progress.textContent = t().sfDone(result.items.length, result.pages, result.capped);
    }
  });

  stopBtn.addEventListener("click", () => abort?.abort());
}

function render(
  result: HarvestResult,
  details: Map<string, ProductDetail> | undefined,
  enriched: Map<string, EnrichedProduct> | undefined,
  nodes: { summary: HTMLElement; stats: HTMLElement; list: HTMLElement; exportRow: HTMLElement },
  opts: { checkedAvailability: boolean; creatorApiNote: string | null },
): void {
  const label: Record<ContentType, string> = {
    video: t().sfLabelVideos,
    photo: t().sfLabelPhotos,
    "idea-list": t().sfLabelIdeaLists,
    "media-list": t().sfLabelMediaLists,
  };
  for (const type of ["video", "photo", "idea-list", "media-list"] as ContentType[]) {
    nodes.summary.append(chip("", `${result.counts[type]} ${label[type]}`));
  }

  // Untagged is any content whose products are known but empty: videos always,
  // and photos/idea-lists/media-lists once the deep-content pass has opened
  // them. Counting video-only made a storefront with untagged photos read as
  // "0 untagged", which is what this replaces.
  const untagged = result.items.filter((i) => i.productsKnown && i.taggedAsins.length === 0);
  const overTagged = result.items.filter((i) => i.taggedAsins.length > OVER_TAGGED_THRESHOLD);
  const uniqueProducts = new Set(result.items.flatMap((i) => i.taggedAsins));
  const unavailable = details
    ? [...uniqueProducts].filter((a) => details.get(a)?.available === false)
    : [];

  nodes.stats.append(
    chip(untagged.length > 0 ? "bad" : "good", t().chipUntagged(untagged.length)),
    chip(overTagged.length > 0 ? "warn" : "good", t().chipOverTagged(overTagged.length)),
    chip("", t().sfUniqueProducts(uniqueProducts.size)),
  );
  if (opts.checkedAvailability) {
    nodes.stats.append(chip(unavailable.length > 0 ? "bad" : "good", t().sfUnavailable(unavailable.length)));
  }

  const storefrontUrl = location.origin + location.pathname;
  const now = new Date().toISOString();
  const record = (finding: StorefrontIssueFinding) =>
    void sendToBackground<void>({ kind: "RECORD_FINDING", finding: finding as Finding });

  // Untagged content: a shorter in-panel preview (can be long), full set in CSV.
  issueSection(nodes.list, t().sfUntaggedHeading(untagged.length), untagged.length, UNTAGGED_PREVIEW, (item) => {
    const li = el("li");
    li.append(el("span", "t", item.title));
    appendOpen(li, item.url);
    return li;
  }, untagged);
  untagged.slice(0, RECORD_CAP).forEach((v) =>
    record({ type: "storefront_issue", storefrontUrl, issueType: "untagged", severity: "error", subject: v.title, detail: t().sfNoTaggedEarns, detectedAt: now }),
  );

  // Over-tagged content: previously counted but never listed anywhere.
  issueSection(nodes.list, t().sfOverTaggedHeading(overTagged.length), overTagged.length, LIST_CAP, (item) => {
    const li = el("li");
    li.append(el("span", "t", item.title));
    li.append(el("span", "note", t().sfOverTaggedCount(item.taggedAsins.length)));
    appendOpen(li, item.url);
    return li;
  }, overTagged);
  overTagged.slice(0, RECORD_CAP).forEach((v) =>
    record({ type: "storefront_issue", storefrontUrl, issueType: "over_tagged", severity: "warn", subject: v.title, detail: t().sfOverTaggedDetail, detectedAt: now }),
  );

  // Unavailable products: the full set (was capped at 40 before), with the
  // Creator API title when we have it so the ASIN is not the only handle.
  if (opts.checkedAvailability) {
    issueSection(nodes.list, t().sfUnavailableHeading(unavailable.length), unavailable.length, LIST_CAP, (asin) => {
      const li = el("li");
      const title = enriched?.get(asin)?.title;
      li.append(el("span", "t", title ? `${title} (${asin})` : t().sfUnavailableProduct(asin)));
      appendOpen(li, `${location.origin}/dp/${asin}`);
      return li;
    }, unavailable);
    unavailable.slice(0, RECORD_CAP).forEach((asin) =>
      record({ type: "storefront_issue", storefrontUrl, issueType: "unavailable_product", severity: "warn", subject: asin, detail: t().sfTaggedUnavailable, detectedAt: now }),
    );
  }

  if (untagged.length === 0 && overTagged.length === 0 && unavailable.length === 0) {
    nodes.list.append(el("p", "note", t().sfNoIssues));
  }

  if (opts.creatorApiNote) {
    nodes.exportRow.append(el("p", "note", opts.creatorApiNote));
  }
  const csvBtn = el("button", "btn secondary");
  csvBtn.textContent = t().sfExportCsv;
  csvBtn.addEventListener("click", () =>
    downloadCsv(`storefront-${creatorHandle()}-${now.slice(0, 10)}.csv`, buildCsv(result, details, enriched)),
  );
  nodes.exportRow.append(csvBtn);
}

// Renders one collapsible-in-spirit issue block: a heading, then up to `cap`
// rows in a scrollable list, then an "and N more" note when the set is longer.
function issueSection<T>(
  container: HTMLElement,
  heading: string,
  total: number,
  cap: number,
  renderRow: (item: T) => HTMLElement,
  items: T[],
): void {
  if (total === 0) return;
  container.append(el("p", "issues-heading", heading));
  const ul = el("ul", "list");
  for (const item of items.slice(0, cap)) ul.append(renderRow(item));
  container.append(ul);
  if (total > cap) container.append(el("p", "note", t().sfAndMore(total - cap)));
}

function appendOpen(li: HTMLElement, url: string): void {
  if (!url) return;
  const a = el("a", "", t().sfOpen);
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

// A rough "time left" for the long opt-in passes, so a multi-thousand-product
// storefront does not look frozen. Needs a few samples before the rate is
// meaningful, and drops off near the end.
function etaSuffix(started: number, done: number, total: number): string {
  if (done < 5 || done >= total) return "";
  const perItemMs = (Date.now() - started) / done;
  const minutes = Math.round((perItemMs * (total - done)) / 60000);
  return minutes >= 1 ? t().sfEtaMinLeft(minutes) : "";
}
