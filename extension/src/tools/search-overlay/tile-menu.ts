import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { t } from "../../i18n";
import { APP_TRIAL_URL } from "../../shared/constants";
import {
  sendToBackground,
  type GenerateLinkResult,
  type HudCommandResult,
  type ProductListsResult,
} from "../../shared/messages";
import type { HudCommand, ProductRef } from "../../transport/hud-commands";

// The per-tile "..." action menu: the search-card equivalent of the product
// page's "Send to your app" panel (tools/hud-actions/panel.ts). It surfaces the
// actions we already have (branded link, product lists, and the desktop-bridge
// commands) one click from search, instead of only after opening a product.
//
// Free actions (Add to list, Copy link, Open page) always work. The app actions
// need the desktop app paired; when it is not, the menu shows a single locked
// row that doubles as the extension-to-subscription upsell, mirroring the panel.

export type TileMenuTarget = {
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  href: string | null;
  retailer?: "amazon" | "walmart";
};

// Read live at open time so the menu reflects the latest bridge/auth state even
// though the button was mounted before GET_HUD_STATUS resolved.
export type HudRef = { connected: boolean; signedIn: boolean };

// The one desktop-bridge action set a search tile can offer. The product page
// panel offers more (deal workspaces, campaign accept, pitch/sample), but those
// need signals a search tile does not have (workspace picker, brand); these four
// only need a ProductRef, so they are safe from search.
const APP_ACTIONS: Array<{ labelKey: keyof ReturnType<typeof t>; command: (p: ProductRef) => HudCommand }> = [
  { labelKey: "sendToContentButler", command: (product) => ({ type: "content.push", product }) },
  { labelKey: "addToCollab", command: (product) => ({ type: "collaboration.add", product }) },
  { labelKey: "saveToLinkButler", command: (product) => ({ type: "link.mint", product }) },
  {
    labelKey: "generatePhoto",
    command: (product) => ({ type: "photo.generate", product, style: "shoppable" }),
  },
];

let activeHost: HTMLElement | null = null;
let detach: (() => void) | null = null;

function closeMenu(): void {
  detach?.();
  detach = null;
  activeHost?.remove();
  activeHost = null;
}

function productRefOf(target: TileMenuTarget): ProductRef {
  return {
    asin: target.asin,
    marketplace: target.marketplace,
    title: target.title?.slice(0, 200),
    imageUrl: target.imageUrl ?? undefined,
  };
}

// Append the "..." trigger to the badge row. Called on every renderBadge, so it
// only wires the button; the popover it opens is a separate top-level host that
// outlives badge re-renders.
export function mountTileMenuButton(container: HTMLElement, target: TileMenuTarget, hud: HudRef): void {
  const btn = el("button", "tile-menu-btn");
  btn.type = "button";
  btn.textContent = "⋯"; // horizontal ellipsis
  btn.title = t().tileMenuLabel;
  btn.setAttribute("aria-label", t().tileMenuLabel);
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (activeHost) {
      closeMenu();
      return;
    }
    openTileMenu(btn, target, hud);
  });
  container.append(btn);
}

function openTileMenu(anchor: HTMLElement, target: TileMenuTarget, hud: HudRef): void {
  closeMenu();
  const { host, root } = createInlineShadow("tile-menu-host");
  const menu = el("div", "tile-menu");
  const status = el("div", "tile-menu-status");
  status.style.display = "none";

  const setStatus = (text: string): void => {
    status.textContent = text;
    status.style.display = text ? "block" : "none";
  };

  menu.append(buildFreeSection(target, setStatus));
  menu.append(buildAppSection(target, hud, setStatus));
  menu.append(status);
  root.append(menu);

  // Fixed-position overlay anchored under the trigger, kept on-screen.
  host.style.position = "fixed";
  host.style.zIndex = "2147483646";
  document.documentElement.append(host);
  activeHost = host;
  position(host, menu, anchor);

  // Close on any outside click, on scroll, or on Escape. Clicks inside the menu
  // are in a closed shadow root, so they never reach this document listener.
  const onDocClick = (): void => closeMenu();
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") closeMenu();
  };
  const onScroll = (): void => closeMenu();
  // Defer so the click that opened the menu does not immediately close it.
  setTimeout(() => {
    document.addEventListener("click", onDocClick, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", onScroll, true);
  }, 0);
  detach = () => {
    document.removeEventListener("click", onDocClick, true);
    document.removeEventListener("keydown", onKey, true);
    window.removeEventListener("scroll", onScroll, true);
  };
}

function position(host: HTMLElement, menu: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  // Measure after paint; menu width is bounded by CSS max-width.
  const width = menu.offsetWidth || 220;
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
  const height = menu.offsetHeight || 0;
  const below = rect.bottom + 4;
  const top = below + height > window.innerHeight - 8 ? Math.max(8, rect.top - height - 4) : below;
  host.style.left = `${Math.round(left)}px`;
  host.style.top = `${Math.round(top)}px`;
}

function menuItem(label: string, onClick: () => void, extraClass = ""): HTMLElement {
  const item = el("button", `tile-menu-item ${extraClass}`.trim());
  item.type = "button";
  item.textContent = label;
  item.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return item;
}

function buildFreeSection(target: TileMenuTarget, setStatus: (t: string) => void): HTMLElement {
  const section = el("div", "tile-menu-section");

  // Add to list: expands inline into the user's lists + a "new list" row.
  const addToList = menuItem(t().tileMenuAddToList, () => {}, "has-sub");
  const sub = el("div", "tile-menu-sub");
  sub.style.display = "none";
  addToList.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    const open = sub.style.display !== "none";
    sub.style.display = open ? "none" : "block";
    if (!open) void populateLists(sub, target, setStatus);
  });
  section.append(addToList, sub);

  // Copy branded link (works without the desktop app).
  section.append(
    menuItem(t().tileMenuCopyLink, () => {
      setStatus(t().tileMenuWorking);
      void sendToBackground<GenerateLinkResult>({
        kind: "GENERATE_AFFILIATE_LINK",
        asin: target.asin,
        marketplace: target.marketplace,
        retailer: target.retailer,
      }).then(async (res) => {
        if (res.ok && res.url) {
          try {
            await navigator.clipboard.writeText(res.url);
            setStatus(t().tileMenuCopied);
          } catch {
            setStatus(res.url);
          }
        } else {
          setStatus(res.error ?? t().tileMenuLinkFailed);
        }
      });
    }),
  );

  // Open the product page (where every analytics panel renders).
  section.append(
    menuItem(t().tileMenuOpenPage, () => {
      const path = target.retailer === "walmart" ? "ip" : "dp";
      const url = target.href ?? `https://www.${target.marketplace}/${path}/${target.asin}`;
      void sendToBackground<void>({ kind: "OPEN_URL", url });
      closeMenu();
    }),
  );

  return section;
}

async function populateLists(
  sub: HTMLElement,
  target: TileMenuTarget,
  setStatus: (t: string) => void,
): Promise<void> {
  sub.replaceChildren();
  const res = await sendToBackground<ProductListsResult>({ kind: "GET_PRODUCT_LISTS" });

  const add = (listId: string | undefined, newListName: string | undefined, name: string): void => {
    setStatus(t().tileMenuWorking);
    void sendToBackground<ProductListsResult>({
      kind: "ADD_TO_PRODUCT_LIST",
      listId,
      newListName,
      item: {
        asin: target.asin,
        marketplace: target.marketplace,
        title: target.title,
        imageUrl: target.imageUrl,
      },
    }).then((r) => {
      if (r.atCap) return setStatus(t().tileMenuListsCapped);
      if (r.atItemCap) return setStatus(t().tileMenuListFull);
      const finalName = r.lists.find((l) => l.id === r.listId)?.name ?? name;
      setStatus(t().tileMenuAddedTo(finalName));
    });
  };

  for (const list of res.lists) {
    const count = list.items.length;
    sub.append(
      menuItem(`${list.name} (${count})`, () => add(list.id, undefined, list.name), "tile-menu-sub-item"),
    );
  }

  // "New list" row: reveals an inline name input + Create.
  const newRow = el("div", "tile-menu-newlist");
  const input = el("input", "tile-menu-input") as HTMLInputElement;
  input.type = "text";
  input.placeholder = t().tileMenuNewListPlaceholder;
  input.maxLength = 60;
  const create = el("button", "tile-menu-create");
  create.type = "button";
  create.textContent = t().tileMenuCreate;
  const submit = (): void => {
    const name = input.value.trim();
    if (!name) return;
    add(undefined, name, name);
  };
  create.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    submit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submit();
    }
  });
  // Keep clicks inside the input from bubbling to the menu-item toggle.
  input.addEventListener("click", (event) => event.stopPropagation());
  newRow.append(input, create);
  sub.append(newRow);
}

function buildAppSection(
  target: TileMenuTarget,
  hud: HudRef,
  setStatus: (t: string) => void,
): HTMLElement {
  const section = el("div", "tile-menu-section tile-menu-app");
  section.append(el("div", "tile-menu-heading", t().sendToApp));

  if (!hud.connected) {
    const locked = el("div", "tile-menu-locked", t().tileMenuAppLocked);
    section.append(locked);
    section.append(
      menuItem(t().ctaOpenApp, () => {
        void sendToBackground<void>({ kind: "OPEN_URL", url: APP_TRIAL_URL });
        closeMenu();
      }, "tile-menu-cta"),
    );
    return section;
  }

  const product = productRefOf(target);
  for (const action of APP_ACTIONS) {
    section.append(
      menuItem(t()[action.labelKey] as string, () => {
        setStatus(t().tileMenuWorking);
        void sendToBackground<HudCommandResult>({
          kind: "SEND_HUD_COMMAND",
          command: action.command(product),
        }).then((res) => {
          setStatus(res.ok ? (res.message ?? t().sentToApp) : (res.message ?? t().couldNotReachApp));
        });
      }),
    );
  }
  return section;
}
