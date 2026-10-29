import { createInlineShadow } from "../../ui/host";
import { el, showHudPanel } from "../../ui/components";
import { t } from "../../i18n";
import { startStorefrontPlan } from "../storefront-planner/panel";

// One toolbar on the creator's storefront, above the All / Idea Lists / Photos /
// Videos pills, that gathers the places a creator jumps to from here: the
// storefront checkup and the campaign planner (both open in the HUD), Creator
// Connections, Manage Content and My Orders (plain links on the same Amazon
// host). Each is a real <button> or <a href>, so it is keyboard reachable.

const BAR_HOST_CLASS = "sftoolbar-host";
const TABS_SELECTOR = "#allTab";

let controller: AbortController | null = null;

export function initStorefrontToolbar(): void {
  controller?.abort();
  const run = new AbortController();
  controller = run;
  for (const host of Array.from(document.querySelectorAll(`.${BAR_HOST_CLASS}`))) host.remove();
  void start(run.signal);
}

async function waitForTabs(signal: AbortSignal): Promise<HTMLElement | null> {
  for (let i = 0; i < 40 && !signal.aborted; i++) {
    const row = document.querySelector<HTMLElement>(TABS_SELECTOR)?.parentElement?.parentElement;
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

function link(href: string, text: string): HTMLAnchorElement {
  const a = el("a", "sftoolbar-btn", text) as HTMLAnchorElement;
  a.href = href;
  return a;
}

function action(text: string, onClick: () => void): HTMLButtonElement {
  const b = el("button", "sftoolbar-btn", text) as HTMLButtonElement;
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

async function start(signal: AbortSignal): Promise<void> {
  const row = await waitForTabs(signal);
  if (!row || signal.aborted || !row.parentElement) return;

  const { host, root } = createInlineShadow(BAR_HOST_CLASS);
  const style = document.createElement("style");
  style.textContent = `
    .sftoolbar { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
    .sftoolbar-btn {
      font: 600 13px/1 system-ui, sans-serif; padding: 8px 12px; border-radius: 999px;
      border: 1px solid #c2410c; background: #fff; color: #c2410c; cursor: pointer;
      text-decoration: none; display: inline-block;
    }
    .sftoolbar-btn:hover { background: #fff7ed; }
    .sftoolbar-btn:focus-visible { outline: 2px solid #c2410c; outline-offset: 2px; }
  `;
  root.append(style);

  const origin = location.origin;
  const connect = `${location.protocol}//${location.hostname.replace(/^www\./, "affiliate-program.")}/p/connect`;
  const wrap = el("nav", "sftoolbar");
  wrap.setAttribute("aria-label", t().sfBarLabel);
  wrap.append(
    action(t().sfBarCheck, () => void showHudPanel()),
    action(t().sfBarPlanner, () => {
      showHudPanel();
      startStorefrontPlan();
    }),
    link(connect, t().sfBarConnections),
    link(`${origin}/creatorhub/manage`, t().sfBarManage),
    link(`${origin}/gp/css/order-history`, t().sfBarOrders),
  );
  root.append(wrap);
  row.parentElement.insertBefore(host, row);
}
