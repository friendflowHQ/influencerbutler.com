import { UI_PREFIX } from "../shared/constants";

// A small spotlight + coachmark runner for guided page tours. Mounts in its own
// closed shadow host (like the What's New card) so an SPA panel rebuild never
// tears it down. A step whose anchor cannot be found is shown centered rather
// than skipped silently, so the explanation still lands; a step with `skipIfMissing`
// is dropped instead. Never throws into the page.

export type TourStep = {
  title: string;
  body: string;
  // Returns the box to spotlight, or null when the target is not on the page.
  anchor?: () => DOMRect | null;
  skipIfMissing?: boolean;
};

export type TourLabels = { next: string; back: string; skip: string; done: string; stepOf: (n: number, total: number) => string };

const CSS = `
:host { all: initial; }
.scrim { position: fixed; inset: 0; z-index: 2147483646; pointer-events: auto; }
.spot { position: fixed; z-index: 2147483646; border-radius: 10px; pointer-events: none;
  box-shadow: 0 0 0 9999px rgba(15, 23, 42, 0.55); outline: 2px solid #fb923c; transition: all .18s ease; }
.spot.none { box-shadow: none; outline: none; }
.dim { position: fixed; inset: 0; z-index: 2147483645; background: rgba(15, 23, 42, 0.55); }
.dim.hidden { display: none; }
.card { position: fixed; z-index: 2147483647; width: min(340px, calc(100vw - 24px)); box-sizing: border-box;
  background: #fff; color: #0f172a; border-radius: 12px; padding: 14px 16px; font: 13px/1.5 system-ui, sans-serif;
  box-shadow: 0 12px 40px rgba(0,0,0,.35); }
.card h2 { margin: 0 0 4px; font-size: 15px; }
.card p { margin: 0 0 12px; color: #334155; }
.meta { font-size: 11.5px; color: #475569; margin-bottom: 6px; }
.row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.row .grow { flex: 1; }
button { font: inherit; font-weight: 600; border-radius: 8px; padding: 7px 12px; cursor: pointer; border: 1px solid #cbd5e1; background: #f1f5f9; color: #0f172a; }
button.primary { background: #c2410c; border-color: #c2410c; color: #fff; }
button.link { border: 0; background: none; color: #475569; padding: 7px 4px; font-weight: 500; }
button:focus-visible { outline: 3px solid #1d4ed8; outline-offset: 2px; }
`;

let host: HTMLElement | null = null;

export function stopTour(): void {
  host?.remove();
  host = null;
}

export function startTour(steps: TourStep[], labels: TourLabels, onEnd?: (finished: boolean) => void): void {
  stopTour();
  if (steps.length === 0) return;
  host = document.createElement("div");
  host.className = `${UI_PREFIX}-tour-host`;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = CSS;
  const dim = document.createElement("div");
  dim.className = "dim";
  const spot = document.createElement("div");
  spot.className = "spot none";
  const card = document.createElement("div");
  card.className = "card";
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "false");
  root.append(style, dim, spot, card);
  document.documentElement.append(host);

  let index = 0;
  let live = steps;

  const end = (finished: boolean) => {
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("resize", render);
    stopTour();
    onEnd?.(finished);
  };

  const render = () => {
    const step = live[index];
    if (!step) return end(true);
    let rect: DOMRect | null = null;
    try {
      rect = step.anchor?.() ?? null;
    } catch {
      rect = null;
    }
    if (!rect && step.skipIfMissing) {
      live = live.filter((s) => s !== step);
      if (index >= live.length) return end(true);
      return render();
    }
    if (rect && rect.width > 0 && rect.height > 0) {
      const pad = 6;
      Object.assign(spot.style, {
        left: `${rect.left - pad}px`,
        top: `${rect.top - pad}px`,
        width: `${rect.width + pad * 2}px`,
        height: `${rect.height + pad * 2}px`,
      });
      spot.classList.remove("none");
      dim.classList.add("hidden");
    } else {
      rect = null;
      spot.classList.add("none");
      dim.classList.remove("hidden");
    }
    card.replaceChildren();
    const meta = document.createElement("div");
    meta.className = "meta";
    meta.textContent = labels.stepOf(index + 1, live.length);
    const h = document.createElement("h2");
    h.textContent = step.title;
    const p = document.createElement("p");
    p.textContent = step.body;
    const row = document.createElement("div");
    row.className = "row";
    const skip = button(labels.skip, "link", () => end(false));
    const grow = document.createElement("span");
    grow.className = "grow";
    row.append(skip, grow);
    if (index > 0) row.append(button(labels.back, "", () => { index -= 1; render(); }));
    const last = index === live.length - 1;
    const nextBtn = button(last ? labels.done : labels.next, "primary", () => {
      if (last) end(true);
      else { index += 1; render(); }
    });
    row.append(nextBtn);
    card.append(meta, h, p, row);
    place(card, rect);
    nextBtn.focus({ preventScroll: true });
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      end(false);
    }
  };
  document.addEventListener("keydown", onKey, true);
  window.addEventListener("resize", render);
  render();
}

function button(label: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  if (cls) b.className = cls;
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

// Put the card beside the spotlight (below if there is room, else above, else
// centered); with no anchor, center it.
function place(card: HTMLElement, rect: DOMRect | null): void {
  const w = Math.min(340, window.innerWidth - 24);
  const h = card.offsetHeight || 170;
  let left = (window.innerWidth - w) / 2;
  let top = (window.innerHeight - h) / 2;
  if (rect) {
    left = Math.min(Math.max(12, rect.left), window.innerWidth - w - 12);
    if (rect.bottom + h + 16 < window.innerHeight) top = rect.bottom + 14;
    else if (rect.top - h - 16 > 0) top = rect.top - h - 14;
    else if (rect.left - w - 16 > 0) { left = rect.left - w - 14; top = Math.max(12, rect.top); }
    else { left = Math.max(12, rect.left - w - 14); top = Math.max(12, rect.top); }
  }
  card.style.left = `${Math.max(12, left)}px`;
  card.style.top = `${Math.max(12, top)}px`;
}
