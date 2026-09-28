import { UI_PREFIX } from "../shared/constants";
import type { DealsDict } from "../deals/strings";
import type { ChipHandle, ChipState } from "./send";
import {
  FONT_STACK,
  PRIMARY_GRADIENT,
  PRIMARY_SHADOW,
  PRIMARY_SHADOW_HOVER,
  GOOD,
  BAD,
  PENDING,
} from "./theme";

// The "Send to Deals" chip that sits in the top right corner of each product
// card. Closed shadow root with its own CSS text (no import of the shared ui
// host: that would pull the whole overlay stylesheet into this standalone
// content-script bundle).

export const CHIP_HOST_CLASS = `${UI_PREFIX}-deal-chip-host`;

export function mountChip(
  card: HTMLElement,
  dict: DealsDict,
  onSend: () => void,
  // A grid card gets the chip pinned to its corner. An article page has no card
  // to pin to (a blog post links one product from inside a sentence), so the
  // chip sits inline after the link instead of floating over the prose.
  placement: "corner" | "inline" = "corner",
): ChipHandle | null {
  if (card.querySelector(`:scope > .${CHIP_HOST_CLASS}`)) return null;

  const host = document.createElement("div");
  host.className = CHIP_HOST_CLASS;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CHIP_CSS;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "chip";
  btn.textContent = dict.cardAction;
  btn.onclick = (event) => {
    // The whole card is usually itself a link, so a bare click would navigate
    // to Amazon instead of sending the deal.
    event.preventDefault();
    event.stopPropagation();
    if (btn.dataset.state === "pending" || btn.dataset.state === "sent") return;
    onSend();
  };

  root.append(style, btn);

  if (placement === "inline") {
    host.dataset.ibChipInline = "1";
    // After the link, in the flow, so nothing is covered up.
    card.insertAdjacentElement("afterend", host);
  } else {
    // Anchor the chip to the card. A card that lays out statically has to be
    // promoted first, or the chip would position against the page instead.
    if (getComputedStyle(card).position === "static") card.style.position = "relative";
    card.append(host);
  }

  const setState: ChipHandle["setState"] = (state, detail) => {
    btn.dataset.state = state;
    btn.textContent = labelFor(state, dict);
    btn.disabled = state === "pending" || state === "sent";
    // An error keeps its click handler so the chip doubles as a retry.
    const tooltip = detail ?? "";
    btn.title = tooltip;
    btn.setAttribute("aria-label", tooltip ? `${btn.textContent}: ${tooltip}` : btn.textContent);
  };
  setState("idle");

  return { setState };
}

function labelFor(state: ChipState, dict: DealsDict): string {
  if (state === "pending") return dict.cardSending;
  if (state === "sent") return dict.cardSent;
  if (state === "error") return dict.cardFailed;
  return dict.cardAction;
}

// A branded gradient pill matching the Amazon panel's primary button (see
// deal-badge/theme.ts -> overlay.css .btn), with the panel's semantic
// palette for the sent / error / pending feedback states.
const CHIP_CSS = `
:host { all: initial; }
:host([data-ib-chip-inline]) { display: inline-block; vertical-align: middle; }
:host([data-ib-chip-inline]) .chip { position: static; margin-left: 6px; }
.chip {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2147483000;
  font: 11.5px/1 ${FONT_STACK};
  font-weight: 700;
  letter-spacing: -0.01em;
  color: #fff;
  background: ${PRIMARY_GRADIENT};
  border: none;
  border-radius: 999px;
  padding: 6px 11px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: ${PRIMARY_SHADOW};
  transition: filter 0.12s ease, box-shadow 0.12s ease, transform 0.02s ease;
}
.chip:hover { filter: brightness(0.96); box-shadow: ${PRIMARY_SHADOW_HOVER}; }
.chip:active { transform: translateY(1px); }
.chip[data-state="pending"] { background: ${PENDING}; box-shadow: none; cursor: default; opacity: 0.85; }
.chip[data-state="sent"] { background: ${GOOD}; box-shadow: none; cursor: default; }
.chip[data-state="error"] { background: ${BAD}; box-shadow: none; cursor: pointer; }
`;
