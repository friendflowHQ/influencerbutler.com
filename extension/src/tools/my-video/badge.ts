import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import type { MyVideoMatch } from "./resolve";

// A small "Yours" badge on the creator's own video card inside Amazon's own
// carousel, so they can spot their placement at a glance without opening the
// panel. Mounted ONLY from a CardPlacement, which is a card carrying their own
// storefront handle, so it can never land on somebody else's video.
//
// Same mechanics as video-likes/overlay.ts: a per-card inline shadow host, a
// done-marker so a rebuild cannot double-badge, and a teardown of prior hosts at
// the top of every run. Positioned top-right, since Video Likes owns top-left
// and Amazon's own heart sits bottom-right.

const DONE_ATTR = "data-ib-myvideo";
const HOST_CLASS = "myvideo-badge-host";

export function renderMyVideoBadges(matches: MyVideoMatch[]): void {
  for (const host of Array.from(document.querySelectorAll(`.${HOST_CLASS}`))) host.remove();
  for (const marked of Array.from(document.querySelectorAll(`[${DONE_ATTR}]`))) {
    marked.removeAttribute(DONE_ATTR);
  }

  for (const match of matches) {
    const card = match.card;
    if (!card || !card.isConnected || card.getAttribute(DONE_ATTR)) continue;
    card.setAttribute(DONE_ATTR, "1");
    mount(card, match);
  }
}

function mount(card: HTMLElement, match: MyVideoMatch): void {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const badge = el("div", "myvideo-badge");
  badge.textContent = t().myVideoCardBadge;
  // The rail and rank read on hover; the badge itself stays one short word so it
  // never covers the thumbnail it is sitting on.
  badge.title = match.position
    ? t().myVideoCardBadgeTitle(match.position)
    : t().myVideoCardBadge;
  root.append(badge);

  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  host.style.position = "absolute";
  host.style.right = "6px";
  host.style.top = "6px";
  host.style.width = "auto";
  host.style.zIndex = "5";
  host.style.pointerEvents = "none";
  card.append(host);
}
