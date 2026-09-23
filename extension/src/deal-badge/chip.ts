import { UI_PREFIX } from "../shared/constants";
import type { DealsDict } from "../deals/strings";
import type { ChipHandle, ChipState } from "./send";

// The "Send to Deals" chip that sits in the top right corner of each product
// card. Closed shadow root with its own CSS text (no import of the shared ui
// host: that would pull the whole overlay stylesheet into this standalone
// content-script bundle).

export const CHIP_HOST_CLASS = `${UI_PREFIX}-deal-chip-host`;

export function mountChip(
  card: HTMLElement,
  dict: DealsDict,
  onSend: () => void,
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

  // Anchor the chip to the card. A card that lays out statically has to be
  // promoted first, or the chip would position against the page instead.
  if (getComputedStyle(card).position === "static") card.style.position = "relative";
  card.append(host);

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

const CHIP_CSS = `
:host { all: initial; }
.chip {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 2147483000;
  font: 11px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-weight: 600;
  color: #fff;
  background: #c2410c;
  border: none;
  border-radius: 999px;
  padding: 5px 10px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 1px 4px rgba(15, 23, 42, 0.28);
}
.chip:hover { background: #9a3412; }
.chip[data-state="pending"] { background: #9a3412; cursor: default; opacity: 0.8; }
.chip[data-state="sent"] { background: #15803d; cursor: default; }
.chip[data-state="error"] { background: #b91c1c; cursor: pointer; }
`;
