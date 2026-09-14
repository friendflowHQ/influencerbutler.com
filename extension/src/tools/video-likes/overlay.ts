import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { queryAll } from "../../amazon/selectors";
import { formatLikeCount, parseLikeCount } from "./model";

// Video Likes: an orange heart + count badge on each video/content card that has
// likes, matching a competitor's pink-heart overlay in our own brand color.
//
// Source: Amazon's OWN like/heart count, which it renders (server-side) into a
// `.heart-count` element on creator storefront cards (/shop/*), verified live
// 2026-09-14. We read that number straight from the DOM and re-present it as a
// bold orange badge on the card corner. No network call, no fabrication: a card
// with no heart-count element, or a zero count, gets no badge.

// Marks a card as badged so a rebuild does not double-badge it.
const DONE_ATTR = "data-ib-vlike";
const HOST_CLASS = "vlike-badge-host";

export function initVideoLikes(): void {
  // Tear down prior badges + markers so a rebuild (SPA nav, storefront re-render,
  // product-widget hydration) re-badges the current cards cleanly.
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }

  for (const countEl of queryAll<HTMLElement>(document, "videoHeartCount")) {
    const count = parseLikeCount(countEl.getAttribute("aria-label") ?? countEl.textContent);
    if (count === null || count <= 0) continue;

    const card = cardFor(countEl);
    if (!card || card.getAttribute(DONE_ATTR)) continue;
    card.setAttribute(DONE_ATTR, "1");

    mountBadge(card, count);
  }
}

// The card element to hang the badge on: climb from the heart-count element to
// the nearest ancestor that is card-sized (so the badge lands on the thumbnail's
// top-left, not the title strip), falling back to the count's parent. Size, not
// an <img> check, because storefront thumbnails are background images. Bounded
// climb so a detached node can never walk to <html>.
function cardFor(countEl: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = countEl.parentElement;
  for (let i = 0; i < 8 && node; i++) {
    if (node.offsetWidth >= 140 && node.offsetHeight >= 140) return node;
    node = node.parentElement;
  }
  return countEl.parentElement;
}

function mountBadge(card: HTMLElement, count: number): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const badge = el("div", "vlike-badge");
  badge.title = t().videoLikesTitle;
  const heart = el("span", "vlike-heart");
  heart.textContent = "♥"; // heart
  heart.setAttribute("aria-hidden", "true");
  const label = el("span", "vlike-count", formatLikeCount(count));
  badge.append(heart, label);
  root.append(badge);

  // Overlay the badge on the card's top-left corner. Amazon's own heart sits at
  // the bottom-right, so top-left keeps ours from colliding with it.
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  host.style.position = "absolute";
  host.style.left = "6px";
  host.style.top = "6px";
  host.style.zIndex = "5";
  host.style.pointerEvents = "none";
  card.append(host);
}
