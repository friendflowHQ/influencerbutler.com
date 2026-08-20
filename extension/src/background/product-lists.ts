import { getState, patchState } from "../storage/store";
import {
  PRODUCT_LISTS_CAP,
  PRODUCT_LIST_ITEMS_CAP,
  type ProductList,
  type ProductListItem,
} from "../storage/schema";
import type { ProductListInput, ProductListsResult } from "../shared/messages";

// User-named product collections ("Add to List"). A lightweight, local-only
// sibling of the watchlist (background/watchlist.ts): no polling, no server
// sync, just curated sets the creator builds while researching. The tile menu
// and the popup both drive these operations through the background.

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // randomUUID is available in MV3 service workers, but keep a fallback so a
    // stray environment never throws on list creation.
    return `pl_${Date.now().toString(36)}${Math.floor(performance.now()).toString(36)}`;
  }
}

function cleanName(name: string): string {
  return name.trim().slice(0, 60);
}

function findList(lists: ProductList[], id: string): ProductList | undefined {
  return lists.find((l) => l.id === id);
}

export async function getProductLists(): Promise<ProductListsResult> {
  return { lists: (await getState()).productLists };
}

export async function createProductList(name: string): Promise<ProductListsResult> {
  const clean = cleanName(name);
  if (!clean) return getProductLists();
  let atCap = false;
  let listId: string | undefined;
  const state = await patchState((s) => {
    if (s.productLists.length >= PRODUCT_LISTS_CAP) {
      atCap = true;
      return;
    }
    const id = newId();
    listId = id;
    s.productLists.push({ id, name: clean, createdAt: Date.now(), items: [] });
  });
  return { lists: state.productLists, atCap, listId };
}

export async function renameProductList(id: string, name: string): Promise<ProductListsResult> {
  const clean = cleanName(name);
  if (!clean) return getProductLists();
  const state = await patchState((s) => {
    const list = findList(s.productLists, id);
    if (list) list.name = clean;
  });
  return { lists: state.productLists };
}

export async function deleteProductList(id: string): Promise<ProductListsResult> {
  const state = await patchState((s) => {
    const idx = s.productLists.findIndex((l) => l.id === id);
    if (idx >= 0) s.productLists.splice(idx, 1);
  });
  return { lists: state.productLists };
}

// Add a product to an existing list (listId) or to a freshly created one
// (newListName). Returns the affected list's id so the caller can confirm
// "added to <name>". Idempotent per (asin, marketplace) within a list.
export async function addToProductList(input: {
  listId?: string;
  newListName?: string;
  item: ProductListInput;
}): Promise<ProductListsResult> {
  const asin = input.item.asin.toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return getProductLists();

  let atCap = false;
  let atItemCap = false;
  let listId: string | undefined = input.listId;
  const state = await patchState((s) => {
    let list = input.listId ? findList(s.productLists, input.listId) : undefined;
    if (!list) {
      // Create-and-add path: the tile menu lets the user name a new list inline.
      if (s.productLists.length >= PRODUCT_LISTS_CAP) {
        atCap = true;
        return;
      }
      const id = newId();
      list = {
        id,
        name: cleanName(input.newListName || "") || defaultListName(s.productLists.length),
        createdAt: Date.now(),
        items: [],
      };
      s.productLists.push(list);
    }
    listId = list.id;
    const exists = list.items.some(
      (it) => it.asin === asin && it.marketplace === input.item.marketplace,
    );
    if (exists) return; // already in this list
    if (list.items.length >= PRODUCT_LIST_ITEMS_CAP) {
      atItemCap = true;
      return;
    }
    const item: ProductListItem = {
      asin,
      marketplace: input.item.marketplace,
      title: input.item.title ?? null,
      imageUrl: input.item.imageUrl ?? null,
      addedAt: Date.now(),
    };
    list.items.push(item);
  });
  return { lists: state.productLists, atCap, atItemCap, listId };
}

// Add many products at once (e.g. every variation of a listing) to one list,
// creating it from newListName when no listId is given. Deduping and the item
// cap are applied per item; `added` reports how many actually landed.
export async function addManyToProductList(input: {
  listId?: string;
  newListName?: string;
  items: ProductListInput[];
}): Promise<ProductListsResult & { added?: number }> {
  const valid = input.items
    .map((it) => ({ ...it, asin: it.asin.toUpperCase() }))
    .filter((it) => /^[A-Z0-9]{10}$/.test(it.asin));
  if (valid.length === 0) return getProductLists();

  let atCap = false;
  let atItemCap = false;
  let added = 0;
  let listId: string | undefined = input.listId;
  const state = await patchState((s) => {
    let list = input.listId ? findList(s.productLists, input.listId) : undefined;
    if (!list) {
      if (s.productLists.length >= PRODUCT_LISTS_CAP) {
        atCap = true;
        return;
      }
      const id = newId();
      list = {
        id,
        name: cleanName(input.newListName || "") || defaultListName(s.productLists.length),
        createdAt: Date.now(),
        items: [],
      };
      s.productLists.push(list);
    }
    listId = list.id;
    for (const it of valid) {
      const exists = list.items.some(
        (existing) => existing.asin === it.asin && existing.marketplace === it.marketplace,
      );
      if (exists) continue;
      if (list.items.length >= PRODUCT_LIST_ITEMS_CAP) {
        atItemCap = true;
        break;
      }
      list.items.push({
        asin: it.asin,
        marketplace: it.marketplace,
        title: it.title ?? null,
        imageUrl: it.imageUrl ?? null,
        addedAt: Date.now(),
      });
      added += 1;
    }
  });
  return { lists: state.productLists, atCap, atItemCap, listId, added };
}

export async function removeFromProductList(
  listId: string,
  asin: string,
  marketplace: string,
): Promise<ProductListsResult> {
  const upper = asin.toUpperCase();
  const state = await patchState((s) => {
    const list = findList(s.productLists, listId);
    if (!list) return;
    const idx = list.items.findIndex(
      (it) => it.asin === upper && it.marketplace === marketplace,
    );
    if (idx >= 0) list.items.splice(idx, 1);
  });
  return { lists: state.productLists };
}

function defaultListName(count: number): string {
  return `My list ${count + 1}`;
}
