import { addSection, chip, el } from "../../ui/components";
import { scanStorefront } from "./scanner";
import { sendToBackground } from "../../shared/messages";
import { findVideoTiles } from "../../amazon/storefront-dom";
import { STOREFRONT_SCAN_CAP } from "../../shared/constants";
import type { Finding } from "../../transport/types";

export function initStorefrontPanel(): void {
  const tiles = findVideoTiles(document);
  const section = addSection("Storefront checkup");

  if (tiles.length === 0) {
    section.append(
      el(
        "p",
        "note",
        "No videos detected on this storefront view yet. Scroll so videos load, then reopen the panel via a page refresh.",
      ),
    );
    return;
  }

  const intro = el("p", "note");
  intro.textContent = `${tiles.length} videos visible. Check them for untagged videos, over-tagging, and dead products.`;
  section.append(intro);

  const progress = el("p", "progress");
  const summary = el("div", "counts");
  const list = el("ul", "list");
  const button = el("button", "btn");
  button.textContent = `Check my storefront (up to ${Math.min(tiles.length, STOREFRONT_SCAN_CAP)})`;
  section.append(button, progress, summary, list);

  let abort: AbortController | null = null;
  window.addEventListener("pagehide", () => abort?.abort());

  button.addEventListener("click", () => {
    button.disabled = true;
    abort = new AbortController();
    const storefrontUrl = location.origin + location.pathname;

    void scanStorefront(document, storefrontUrl, abort.signal, (done, total) => {
      progress.textContent = `Checked ${done} of ${total} videos...`;
    })
      .then((result) => {
        progress.textContent = `Done: checked ${result.checked} videos.`;
        summary.replaceChildren();
        list.replaceChildren();

        const untagged = result.issues.filter((i) => i.issueType === "untagged").length;
        const overTagged = result.issues.filter((i) => i.issueType === "over_tagged").length;
        const dead = result.issues.filter((i) => i.issueType === "unavailable_product").length;
        summary.append(
          chip(untagged > 0 ? "bad" : "good", `${untagged} untagged`),
          chip(overTagged > 0 ? "warn" : "good", `${overTagged} over-tagged`),
          chip(dead > 0 ? "warn" : "good", `${dead} with dead products`),
        );

        for (const issue of result.issues) {
          const li = el("li");
          li.append(el("span", "t", issue.subject ?? "Video"));
          li.append(el("span", "", issue.detail ?? issue.issueType));
          list.append(li);
          void sendToBackground<void>({ kind: "RECORD_FINDING", finding: issue as Finding });
        }
        if (result.issues.length === 0) {
          list.append(el("li", "", "No issues found. Clean storefront."));
        }
      })
      .catch(() => {
        progress.textContent = "Scan failed; try again in a minute.";
      })
      .finally(() => {
        button.disabled = false;
        button.textContent = "Recheck";
      });
  });
}
