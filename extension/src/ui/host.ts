import overlayCss from "./overlay.css";
import { UI_PREFIX } from "../shared/constants";

// One shadow-DOM host per page. All tool UI mounts inside it so styles never
// leak in either direction and cleanup on SPA navigation is one removal.
let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;

export function getShadowRoot(): ShadowRoot {
  if (shadow && host && host.isConnected) return shadow;
  host = document.createElement("div");
  host.id = `${UI_PREFIX}-host`;
  shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  shadow.append(style);
  document.documentElement.append(host);
  return shadow;
}

export function removeHost(): void {
  host?.remove();
  host = null;
  shadow = null;
}

// A reusable inline shadow host for content that lives in the page flow rather
// than the floating panel (search-tile badges, the search toolbar). The caller
// builds arbitrary nodes into `root`; the overlay stylesheet is already loaded
// so panel classes (.chip, .btn, .score-badge, ...) work inside it.
export function createInlineShadow(hostClass?: string): { host: HTMLElement; root: ShadowRoot } {
  const host = document.createElement("div");
  host.className = hostClass ? `${UI_PREFIX}-inline ${hostClass}` : `${UI_PREFIX}-inline`;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);
  return { host, root };
}

// Inline badges live in the page flow (for example next to order items), so
// they get their own tiny shadow hosts with the same stylesheet.
export function createInlineBadge(className: string, text: string): HTMLElement {
  const el = document.createElement("span");
  el.className = `${UI_PREFIX}-inline`;
  const root = el.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  const badge = document.createElement("span");
  badge.className = `badge-inline ${className}`;
  badge.textContent = text;
  root.append(style, badge);
  return el;
}
