import overlayCss from "./overlay.css";
import { UI_PREFIX } from "../shared/constants";
import { el } from "./components";
import { t } from "../i18n";
import logoUrl from "../../static/icons/icon-48.png";

// The extension-update pill: a compact floating banner near the top of the
// viewport. Mounts in its own closed shadow host (like the modal) so a panel
// rebuild on SPA navigation, which calls removeHost(), never tears it down.
// Two phases: "update waiting" (Update now / Remind me later), then "update
// installed, refresh to finish" once the update actually applies. The refresh
// phase must keep working after this content script is orphaned by the update,
// so it only uses page-local APIs (location.reload()).

export type UpdateBannerHandlers = {
  // "Update now" clicked. The caller messages the background; the banner flips
  // itself to the refresh phase.
  onUpdate: () => void;
  // "Remind me later" or the close X clicked while still in phase 1.
  onLater: () => void;
};

let container: HTMLElement | null = null;
let banner: HTMLElement | null = null;
let refreshPhase = false;

export function isUpdateBannerMounted(): boolean {
  return container !== null && container.isConnected;
}

export function showUpdateBanner(availableVersion: string, handlers: UpdateBannerHandlers): void {
  if (isUpdateBannerMounted()) return;
  refreshPhase = false;

  container = document.createElement("div");
  container.className = `${UI_PREFIX}-banner-host`;
  const root = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);

  banner = el("div", "update-banner");
  banner.setAttribute("role", "status");
  renderWaitingPhase(availableVersion, handlers);

  root.append(banner);
  document.documentElement.append(container);
}

// Called when the pending update has been applied (by our button, another tab,
// or Chrome's own MV3 auto-apply on worker idle). Safe to call repeatedly and
// while orphaned; does nothing if the banner is gone or already flipped.
export function flipToRefreshPhase(): void {
  if (!banner || !isUpdateBannerMounted() || refreshPhase) return;
  refreshPhase = true;
  renderRefreshPhase();
}

export function removeUpdateBanner(): void {
  container?.remove();
  container = null;
  banner = null;
}

function renderWaitingPhase(availableVersion: string, handlers: UpdateBannerHandlers): void {
  if (!banner) return;
  banner.replaceChildren(
    brandDot(),
    textColumn(t().updateBannerTitle, t().updateBannerBody(availableVersion)),
    actionsRow(
      button(t().updateNow, () => {
        handlers.onUpdate();
        flipToRefreshPhase();
      }),
      link(t().updateRemindLater, () => {
        handlers.onLater();
        removeUpdateBanner();
      }),
    ),
    closeButton(() => {
      // Closing while still in phase 1 is a snooze, same as "Remind me later".
      handlers.onLater();
      removeUpdateBanner();
    }),
  );
}

function renderRefreshPhase(): void {
  if (!banner) return;
  banner.replaceChildren(
    brandDot(),
    textColumn(t().updateAppliedTitle, t().updateRefreshBody),
    actionsRow(button(t().updateRefreshBtn, () => location.reload())),
    closeButton(() => removeUpdateBanner()),
  );
}

function brandDot(): HTMLElement {
  const dot = el("img", "dot");
  dot.src = logoUrl;
  dot.alt = "";
  return dot;
}

function textColumn(title: string, body: string): HTMLElement {
  const column = el("div", "update-banner-text");
  column.append(el("strong", "update-banner-title", title), el("span", "update-banner-body", body));
  return column;
}

function actionsRow(...children: HTMLElement[]): HTMLElement {
  const row = el("div", "update-banner-actions");
  row.append(...children);
  return row;
}

function button(label: string, onClick: () => void): HTMLButtonElement {
  const btn = el("button", "btn", label);
  btn.type = "button";
  btn.addEventListener("click", onClick);
  return btn;
}

function link(label: string, onClick: () => void): HTMLButtonElement {
  const anchor = el("button", "modal-link", label);
  anchor.type = "button";
  anchor.addEventListener("click", onClick);
  return anchor;
}

function closeButton(onClick: () => void): HTMLButtonElement {
  const close = el("button", "update-banner-close", "×");
  close.type = "button";
  close.setAttribute("aria-label", t().nudgeCloseLabel);
  close.addEventListener("click", onClick);
  return close;
}
