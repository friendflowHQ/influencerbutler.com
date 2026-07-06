import { addSection, chip, el } from "../../ui/components";
import { scanStorefront } from "./scanner";
import { sendToBackground } from "../../shared/messages";
import { findVideoTiles } from "../../amazon/storefront-dom";
import type { Finding } from "../../transport/types";

// Storefront checkup. Tagged products are in the grid, so the check runs
// instantly on whatever the user has scrolled into view. Scrolling loads more
// videos; a Recheck button re-reads the grid so the counts grow with them.
export function initStorefrontPanel(): void {
  const section = addSection("Storefront checkup");
  const intro = el("p", "note");
  const progress = el("p", "progress");
  const summary = el("div", "counts");
  const list = el("ul", "list");
  const button = el("button", "btn");
  section.append(intro, button, progress, summary, list);

  const refresh = () => {
    const tiles = findVideoTiles(document);
    if (tiles.length === 0) {
      intro.textContent = "No videos loaded on this storefront view yet. Scroll down, then Recheck.";
      button.textContent = "Recheck";
      return;
    }
    intro.textContent = `${tiles.length} videos loaded. Checking for untagged and over-tagged videos.`;
    button.textContent = "Recheck (scroll to load more first)";

    const result = scanStorefront(document, location.origin + location.pathname);
    progress.textContent = `Checked ${result.checked} videos.`;
    summary.replaceChildren();
    list.replaceChildren();

    const untagged = result.issues.filter((i) => i.issueType === "untagged").length;
    const overTagged = result.issues.filter((i) => i.issueType === "over_tagged").length;
    summary.append(
      chip(untagged > 0 ? "bad" : "good", `${untagged} untagged`),
      chip(overTagged > 0 ? "warn" : "good", `${overTagged} over-tagged`),
    );

    for (const issue of result.issues) {
      const li = el("li");
      li.append(el("span", "t", issue.subject ?? "Video"));
      li.append(el("span", "", issue.detail ?? issue.issueType));
      list.append(li);
      void sendToBackground<void>({ kind: "RECORD_FINDING", finding: issue as Finding });
    }
    if (result.issues.length === 0) {
      list.append(el("li", "", "No untagged or over-tagged videos in the loaded set."));
    }
  };

  button.addEventListener("click", refresh);
  refresh();
}
