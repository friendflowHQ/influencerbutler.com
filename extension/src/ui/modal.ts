import overlayCss from "./overlay.css";
import { UI_PREFIX } from "../shared/constants";
import { el } from "./components";
import logoUrl from "../../static/icons/icon-48.png";

// A centered modal dialog for the re-engagement nudges. It mounts in its own
// closed shadow host (separate from the tool panel's host) so a panel rebuild
// on SPA navigation, which calls removeHost(), never tears the modal down.
// Backdrop click, the close button, and Esc all dismiss it.

export type ModalAction = {
  label: string;
  // "primary" and "secondary" render as buttons; "link" is a subtle text link
  // (used for the "Intel Mac?" alternate download).
  variant?: "primary" | "secondary" | "link";
  onClick: () => void;
};

export type ModalOptions = {
  title: string;
  lines: string[];
  actions: ModalAction[];
  note?: string;
  closeLabel: string;
  // Called when the modal is dismissed without taking an action (close button,
  // backdrop, or Esc). Not called when an action button is clicked.
  onDismiss?: () => void;
};

export function showModal(opts: ModalOptions): void {
  const container = document.createElement("div");
  container.className = `${UI_PREFIX}-modal-host`;
  const root = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);

  const backdrop = el("div", "modal-backdrop");
  const modal = el("div", "modal");
  backdrop.append(modal);

  let closed = false;
  const teardown = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown, true);
    container.remove();
  };
  const dismiss = () => {
    if (closed) return;
    opts.onDismiss?.();
    teardown();
  };
  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      dismiss();
    }
  };

  const close = el("button", "modal-close", "×") as HTMLButtonElement;
  close.type = "button";
  close.setAttribute("aria-label", opts.closeLabel);
  close.addEventListener("click", dismiss);

  const head = el("div", "modal-head");
  const dot = el("img", "dot");
  (dot as HTMLImageElement).src = logoUrl;
  dot.alt = "";
  head.append(dot, el("h3", "modal-title", opts.title));

  const body = el("div", "modal-body");
  for (const line of opts.lines) body.append(el("p", undefined, line));
  if (opts.note) body.append(el("p", "note", opts.note));

  const actions = el("div", "modal-actions");
  for (const action of opts.actions) {
    if (action.variant === "link") {
      const link = el("button", "modal-link", action.label) as HTMLButtonElement;
      link.type = "button";
      link.addEventListener("click", () => {
        action.onClick();
        teardown();
      });
      actions.append(link);
      continue;
    }
    const btn = el(
      "button",
      action.variant === "secondary" ? "btn secondary" : "btn",
      action.label,
    ) as HTMLButtonElement;
    btn.type = "button";
    btn.addEventListener("click", () => {
      action.onClick();
      teardown();
    });
    actions.append(btn);
  }

  modal.append(close, head, body, actions);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) dismiss();
  });

  root.append(backdrop);
  document.addEventListener("keydown", onKeydown, true);
  document.documentElement.append(container);
}
