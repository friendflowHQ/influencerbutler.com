import { addSection, chip, el } from "../../ui/components";
import type { CarouselResult } from "../../amazon/video-carousel";

// The headline tool: who owns this product's video carousel?
export function renderVideoCounts(result: CarouselResult): void {
  const section = addSection("Video competition");

  if (result.counts.total === 0) {
    const empty = el("p", "note");
    empty.textContent =
      result.strategy === "none"
        ? "No video carousel found on this page."
        : "No videos yet: wide-open opportunity.";
    section.append(empty);
    return;
  }

  if (result.strategy === "header") {
    const pending = el("p", "note");
    pending.textContent = `${result.counts.total} videos on this product. Scroll to the Product Videos section and the influencer / brand / customer breakdown fills in here automatically.`;
    section.append(pending);
    return;
  }

  const counts = el("div", "counts");
  counts.append(
    chip("influencer", `${result.counts.influencer} influencer`),
    chip("brand", `${result.counts.brand} brand`),
    chip("customer", `${result.counts.customer} customer`),
  );
  if (result.counts.unknown > 0) {
    counts.append(chip("", `${result.counts.unknown} unclassified`));
  }
  section.append(counts);

  const summary = el("p", "note");
  summary.textContent = `${result.counts.total} videos total (read via ${result.strategy === "json" ? "page data" : "carousel"})`;
  section.append(summary);

  const influencers = result.videos.filter(
    (v) => v.creatorType === "influencer" && (v.creatorName || v.title),
  );
  if (influencers.length > 0) {
    const list = el("ul", "list");
    for (const video of influencers.slice(0, 6)) {
      const item = el("li");
      item.append(el("span", "t", video.creatorName ?? "Influencer"));
      if (video.title) {
        const title = el("span", "", video.title.slice(0, 70));
        item.append(title);
      }
      list.append(item);
    }
    section.append(list);
  }
}
