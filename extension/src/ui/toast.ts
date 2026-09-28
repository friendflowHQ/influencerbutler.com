import { UI_PREFIX } from "../shared/constants";
import logoUrl from "../../static/icons/icon-48.png";

// A small, non-blocking toast for passive notices (e.g. "Detected your
// storefront"). Unlike showModal it never grabs focus or dims the page: it
// slides in bottom-right, auto-dismisses, and can be closed early. It mounts in
// its own closed shadow host with fully inline styles so it does not depend on
// the tool panel's overlay.css and survives a panel rebuild on SPA navigation.

export type ToastOptions = {
  title?: string;
  message: string;
  closeLabel: string;
  // How long before it slides out on its own. Default 8s; pass 0 to keep it up
  // until the user closes it.
  durationMs?: number;
};

const TOAST_CSS = `
:host { all: initial; }
.wrap {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  max-width: 320px;
  font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1f2937;
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-left: 4px solid #c2410c;
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(15, 23, 42, 0.22);
  padding: 12px 14px 12px 12px;
  display: flex;
  gap: 10px;
  align-items: flex-start;
  transform: translateY(12px);
  opacity: 0;
  transition: transform 180ms ease, opacity 180ms ease;
}
.wrap.in { transform: translateY(0); opacity: 1; }
.dot { width: 22px; height: 22px; border-radius: 6px; flex: 0 0 auto; }
.body { flex: 1 1 auto; min-width: 0; }
.title { font-weight: 600; margin: 0 0 2px; }
.msg { margin: 0; color: #374151; word-break: break-word; }
.close {
  flex: 0 0 auto;
  background: none;
  border: none;
  color: #9ca3af;
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 2px;
}
.close:hover { color: #4b5563; }
@media (prefers-color-scheme: dark) {
  .wrap { color: #f3f4f6; background: #1f2937; border-color: #374151; }
  .msg { color: #d1d5db; }
  .close { color: #9ca3af; }
}
`;

export function showToast(opts: ToastOptions): void {
  const container = document.createElement("div");
  container.className = `${UI_PREFIX}-toast-host`;
  const root = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = TOAST_CSS;
  root.append(style);

  const wrap = document.createElement("div");
  wrap.className = "wrap";

  const dot = document.createElement("img");
  dot.className = "dot";
  dot.src = logoUrl;
  dot.alt = "";

  const bodyEl = document.createElement("div");
  bodyEl.className = "body";
  if (opts.title) {
    const title = document.createElement("p");
    title.className = "title";
    title.textContent = opts.title;
    bodyEl.append(title);
  }
  const msg = document.createElement("p");
  msg.className = "msg";
  msg.textContent = opts.message;
  bodyEl.append(msg);

  let removed = false;
  const remove = () => {
    if (removed) return;
    removed = true;
    wrap.classList.remove("in");
    window.setTimeout(() => container.remove(), 200);
  };

  const close = document.createElement("button");
  close.className = "close";
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", opts.closeLabel);
  close.addEventListener("click", remove);

  wrap.append(dot, bodyEl, close);
  root.append(wrap);
  document.documentElement.append(container);
  // Next frame so the entry transition runs.
  requestAnimationFrame(() => wrap.classList.add("in"));

  const duration = opts.durationMs ?? 8000;
  if (duration > 0) window.setTimeout(remove, duration);
}
