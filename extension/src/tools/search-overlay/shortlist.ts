import overlayCss from "../../ui/overlay.css";
import { UI_PREFIX } from "../../shared/constants";
import { el } from "../../ui/components";
import { noteMilestone } from "../../ui/milestone-toast";
import {
  sendToBackground,
  type GenerateLinkResult,
  type ProductListsResult,
} from "../../shared/messages";
import type { ProductRef } from "../../transport/hud-commands";
import {
  deserializeItems,
  serializeItems,
  SHORTLIST_MAX,
  toggleItem,
  toProductRefs,
  type ShortlistItem,
} from "./shortlist-model";

// Shortlist: a star on each search tile collects products into a small tray at
// the bottom of the page, so a creator can scan a long results page and then act
// on the picks together: add to a list, copy branded links, or send to the app.
// The selection lives in sessionStorage (survives page re-renders in this tab,
// never leaves it). One tray per page, in its own closed shadow host.

const STORAGE_KEY = "ib-shortlist";

type Copy = {
  add: string;
  added: string;
  count: (n: number, max: number) => string;
  full: (max: number) => string;
  addToList: string;
  listLabel: string;
  newList: string;
  newListName: string;
  copyLinks: string;
  sendToApp: string;
  appNotConnected: string;
  clear: string;
  region: string;
  working: string;
  addedTo: (n: number, list: string) => string;
  listFailed: string;
  skipped: (n: number) => string;
  copied: (n: number) => string;
  copyFailed: string;
  sent: (n: number) => string;
  sendFailed: string;
  toggleLabel: (title: string) => string;
};

const EN: Copy = {
  add: "Shortlist",
  added: "Shortlisted",
  count: (n, max) => `${n} of ${max} selected`,
  full: (max) => `Shortlist is full (${max}). Remove one to add another.`,
  addToList: "Add to list",
  listLabel: "List",
  newList: "New list...",
  newListName: "New list name",
  copyLinks: "Copy links",
  sendToApp: "Send to Content Butler",
  appNotConnected: "Connect the desktop app to send.",
  clear: "Clear",
  region: "Shortlist",
  working: "Working...",
  addedTo: (n, list) => `Added ${n} to ${list}`,
  listFailed: "Could not add to the list.",
  skipped: (n) => `${n} could not be added`,
  copied: (n) => `Copied ${n} link${n === 1 ? "" : "s"}`,
  copyFailed: "Could not copy the links.",
  sent: (n) => `Sent ${n} to the app`,
  sendFailed: "Could not reach the app.",
  toggleLabel: (title) => `Shortlist: ${title}`,
};
const ES: Copy = {
  add: "Preseleccionar",
  added: "Preseleccionado",
  count: (n, max) => `${n} de ${max} seleccionados`,
  full: (max) => `La lista corta está llena (${max}). Quita uno para agregar otro.`,
  addToList: "Agregar a lista",
  listLabel: "Lista",
  newList: "Nueva lista...",
  newListName: "Nombre de la nueva lista",
  copyLinks: "Copiar enlaces",
  sendToApp: "Enviar a Content Butler",
  appNotConnected: "Conecta la app de escritorio para enviar.",
  clear: "Borrar",
  region: "Lista corta",
  working: "Trabajando...",
  addedTo: (n, list) => `Se agregaron ${n} a ${list}`,
  listFailed: "No se pudo agregar a la lista.",
  skipped: (n) => `${n} no se pudieron agregar`,
  copied: (n) => `Se copiaron ${n} enlace${n === 1 ? "" : "s"}`,
  copyFailed: "No se pudieron copiar los enlaces.",
  sent: (n) => `Se enviaron ${n} a la app`,
  sendFailed: "No se pudo contactar la app.",
  toggleLabel: (title) => `Lista corta: ${title}`,
};
const FR: Copy = {
  add: "Présélection",
  added: "Présélectionné",
  count: (n, max) => `${n} sur ${max} sélectionnés`,
  full: (max) => `La présélection est pleine (${max}). Retirez-en un pour en ajouter.`,
  addToList: "Ajouter à une liste",
  listLabel: "Liste",
  newList: "Nouvelle liste...",
  newListName: "Nom de la nouvelle liste",
  copyLinks: "Copier les liens",
  sendToApp: "Envoyer à Content Butler",
  appNotConnected: "Connectez l'application de bureau pour envoyer.",
  clear: "Effacer",
  region: "Présélection",
  working: "En cours...",
  addedTo: (n, list) => `${n} ajouté${n === 1 ? "" : "s"} à ${list}`,
  listFailed: "Impossible d'ajouter à la liste.",
  skipped: (n) => `${n} n'ont pas pu être ajoutés`,
  copied: (n) => `${n} lien${n === 1 ? "" : "s"} copié${n === 1 ? "" : "s"}`,
  copyFailed: "Impossible de copier les liens.",
  sent: (n) => `${n} envoyé${n === 1 ? "" : "s"} à l'appli`,
  sendFailed: "Appli injoignable.",
  toggleLabel: (title) => `Présélection : ${title}`,
};

function copyFor(locale: string): Copy {
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}

export type ShortlistHooks = {
  locale: string;
  // Live: is the desktop app paired right now?
  appConnected: () => boolean;
  // Sends the products to the app (the overlay owns placement and the bridge).
  sendToApp: (products: ProductRef[]) => Promise<{ ok: boolean }>;
};

let hooks: ShortlistHooks | null = null;
let items: ShortlistItem[] = loadStored();
let trayHost: HTMLElement | null = null;
let paintTray: () => void = () => undefined;
let flash: (text: string) => void = () => undefined;
// Every live toggle button, by "marketplace:asin", so a change anywhere repaints
// all of them (badges re-render often; disconnected ones are pruned on repaint).
const buttons = new Map<string, Set<HTMLButtonElement>>();

function keyOf(i: { marketplace: string; asin: string }): string {
  return `${i.marketplace}:${i.asin}`;
}

function loadStored(): ShortlistItem[] {
  try {
    return deserializeItems(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

function persist(): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, serializeItems(items));
  } catch {
    /* storage blocked: the shortlist just lasts until the page reloads */
  }
}

export function isShortlisted(i: { marketplace: string; asin: string }): boolean {
  return items.some((x) => keyOf(x) === keyOf(i));
}

export function shortlistCount(): number {
  return items.length;
}

function paintButtons(): void {
  const c = copyFor(hooks?.locale ?? "en");
  for (const [key, set] of buttons) {
    for (const btn of Array.from(set)) {
      if (!btn.isConnected) {
        set.delete(btn);
        continue;
      }
      const on = items.some((x) => keyOf(x) === key);
      btn.setAttribute("aria-pressed", String(on));
      btn.textContent = `${on ? "★" : "☆"} ${on ? c.added : c.add}`;
    }
    if (set.size === 0) buttons.delete(key);
  }
}

// Toggle one product in or out. Returns false when the list was full.
export function toggleShortlist(item: ShortlistItem): boolean {
  const result = toggleItem(items, item);
  items = result.items;
  persist();
  paintButtons();
  paintTray();
  if (result.full) {
    flash(copyFor(hooks?.locale ?? "en").full(SHORTLIST_MAX));
    return false;
  }
  return true;
}

export function clearShortlist(): void {
  items = [];
  persist();
  paintButtons();
  paintTray();
}

// The star button for one tile. Appended by renderBadge; safe to create many
// times for the same product (each is registered and kept in sync).
export function shortlistButton(item: ShortlistItem): HTMLButtonElement {
  const c = copyFor(hooks?.locale ?? "en");
  const btn = el("button", "shortlist-btn") as HTMLButtonElement;
  btn.type = "button";
  btn.setAttribute("aria-label", c.toggleLabel(item.title ?? item.asin));
  btn.addEventListener("click", (event) => {
    // The badge sits inside the product tile's link area: do not navigate.
    event.preventDefault();
    event.stopPropagation();
    toggleShortlist(item);
  });
  const key = keyOf(item);
  const set = buttons.get(key) ?? new Set<HTMLButtonElement>();
  set.add(btn);
  buttons.set(key, set);
  const on = isShortlisted(item);
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = `${on ? "★" : "☆"} ${on ? c.added : c.add}`;
  return btn;
}

export function initShortlist(next: ShortlistHooks): void {
  hooks = next;
  if (trayHost?.isConnected) {
    paintButtons();
    paintTray();
    return;
  }
  mountTray();
}

export function teardownShortlist(): void {
  trayHost?.remove();
  trayHost = null;
  paintTray = () => undefined;
  flash = () => undefined;
}

function mountTray(): void {
  const host = document.createElement("div");
  host.className = `${UI_PREFIX}-shortlist-host`;
  const root = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);

  const c = (): Copy => copyFor(hooks?.locale ?? "en");
  const tray = el("div", "shortlist-tray");
  tray.setAttribute("role", "region");
  tray.setAttribute("aria-label", c().region);
  tray.hidden = true;

  const count = el("span", "shortlist-count");
  const status = el("span", "shortlist-status");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");

  const listSelect = el("select", "shortlist-select") as HTMLSelectElement;
  listSelect.setAttribute("aria-label", c().listLabel);
  const newName = el("input", "shortlist-input") as HTMLInputElement;
  newName.type = "text";
  newName.maxLength = 60;
  newName.hidden = true;
  newName.setAttribute("aria-label", c().newListName);
  newName.placeholder = c().newListName;
  const addBtn = el("button", "btn small", c().addToList) as HTMLButtonElement;
  addBtn.type = "button";
  const copyBtn = el("button", "btn secondary small", c().copyLinks) as HTMLButtonElement;
  copyBtn.type = "button";
  const sendBtn = el("button", "btn secondary small", c().sendToApp) as HTMLButtonElement;
  sendBtn.type = "button";
  const clearBtn = el("button", "btn secondary small", c().clear) as HTMLButtonElement;
  clearBtn.type = "button";

  const NEW = "__new__";
  let listsLoaded = false;
  const loadLists = async (preferId?: string): Promise<void> => {
    if (listsLoaded) return;
    listsLoaded = true;
    try {
      const res = await sendToBackground<ProductListsResult>({ kind: "GET_PRODUCT_LISTS" });
      const previous = listSelect.value;
      listSelect.replaceChildren();
      for (const l of res.lists) {
        const opt = el("option") as HTMLOptionElement;
        opt.value = l.id;
        opt.textContent = `${l.name} (${l.items.length})`;
        listSelect.append(opt);
      }
      const opt = el("option") as HTMLOptionElement;
      opt.value = NEW;
      opt.textContent = c().newList;
      listSelect.append(opt);
      // Keep the user's choice (or move to the list just created).
      const want = preferId ?? previous;
      if (want && Array.from(listSelect.options).some((o) => o.value === want)) listSelect.value = want;
      newName.hidden = listSelect.value !== NEW;
    } catch {
      listsLoaded = false;
    }
  };
  listSelect.addEventListener("change", () => {
    newName.hidden = listSelect.value !== NEW;
    if (!newName.hidden) newName.focus();
  });

  let busy = false;
  const setBusy = (value: boolean): void => {
    busy = value;
    for (const b of [addBtn, copyBtn, sendBtn, clearBtn]) b.disabled = value;
    if (value) status.textContent = c().working;
  };

  addBtn.addEventListener("click", async () => {
    if (busy || items.length === 0) return;
    await loadLists();
    setBusy(true);
    try {
      let listId: string | undefined = listSelect.value === NEW ? undefined : listSelect.value;
      let newListName: string | undefined = listSelect.value === NEW ? newName.value.trim() || undefined : undefined;
      if (listSelect.value === NEW && !newListName) {
        status.textContent = c().newListName;
        newName.focus();
        return;
      }
      let added = 0;
      let skipped = 0;
      let listName = "";
      for (const item of items) {
        const r = await sendToBackground<ProductListsResult>({
          kind: "ADD_TO_PRODUCT_LIST",
          listId,
          newListName,
          item: { asin: item.asin, marketplace: item.marketplace, title: item.title, imageUrl: item.imageUrl },
        });
        if (r.atCap || r.atItemCap) break;
        // The background skips ids it cannot store (no listId back); only count a
        // product that is really in the list now.
        const target = r.listId ? r.lists.find((l) => l.id === r.listId) : undefined;
        const landed = !!target && target.items.some((i) => i.asin.toUpperCase() === item.asin.toUpperCase() && i.marketplace === item.marketplace);
        if (!landed) {
          skipped += 1;
          continue;
        }
        added += 1;
        // After the first call created a new list, the rest go into it.
        listId = r.listId ?? listId;
        newListName = undefined;
        listName = target?.name ?? listName;
      }
      listsLoaded = false;
      const base = added > 0 ? c().addedTo(added, listName || listSelect.selectedOptions[0]?.textContent || "") : c().listFailed;
      status.textContent = skipped > 0 && added > 0 ? `${base}. ${c().skipped(skipped)}` : base;
      if (added > 0) {
        void loadLists(listId);
        void noteMilestone("firstList");
      }
    } catch {
      status.textContent = c().listFailed;
    } finally {
      setBusy(false);
      paintTray();
    }
  });

  copyBtn.addEventListener("click", async () => {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const item of items) {
        const res = await sendToBackground<GenerateLinkResult>({
          kind: "GENERATE_AFFILIATE_LINK",
          asin: item.asin,
          marketplace: item.marketplace,
          retailer: item.retailer,
        });
        if (res.ok && res.url) urls.push(res.url);
      }
      if (urls.length === 0) throw new Error("no links");
      await navigator.clipboard.writeText(urls.join("\n"));
      status.textContent = c().copied(urls.length);
    } catch {
      status.textContent = c().copyFailed;
    } finally {
      setBusy(false);
    }
  });

  sendBtn.addEventListener("click", async () => {
    if (busy || items.length === 0) return;
    if (!hooks?.appConnected()) {
      status.textContent = c().appNotConnected;
      return;
    }
    setBusy(true);
    try {
      const res = await hooks.sendToApp(toProductRefs(items));
      status.textContent = res.ok ? c().sent(items.length) : c().sendFailed;
    } catch {
      status.textContent = c().sendFailed;
    } finally {
      setBusy(false);
    }
  });

  clearBtn.addEventListener("click", () => {
    if (busy) return;
    clearShortlist();
    status.textContent = "";
  });

  tray.append(count, listSelect, newName, addBtn, copyBtn, sendBtn, clearBtn, status);
  root.append(tray);
  document.documentElement.append(host);
  trayHost = host;

  paintTray = () => {
    tray.hidden = items.length === 0;
    count.textContent = c().count(items.length, SHORTLIST_MAX);
    if (items.length > 0) void loadLists();
    if (items.length === 0) status.textContent = "";
  };
  flash = (text) => {
    status.textContent = text;
  };
  paintTray();
}
