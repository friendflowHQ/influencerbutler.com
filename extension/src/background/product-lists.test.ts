import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chrome.storage.local stub over a plain object. store.ts calls
// get(KEY) with a single string key and set({ [KEY]: state }); support both a
// string and an array of keys so this works regardless.
let store: Record<string, unknown> = {};
const localStub = {
  async get(keys: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys === null) return { ...store };
    const list = Array.isArray(keys) ? keys : [keys];
    const out: Record<string, unknown> = {};
    for (const k of list) if (k in store) out[k] = store[k];
    return out;
  },
  async set(items: Record<string, unknown>): Promise<void> {
    Object.assign(store, items);
  },
  async remove(keys: string[]): Promise<void> {
    for (const k of keys) delete store[k];
  },
};
vi.stubGlobal("chrome", { storage: { local: localStub } });

import {
  addToProductList,
  createProductList,
  deleteProductList,
  getProductLists,
  removeFromProductList,
  renameProductList,
} from "./product-lists";

const ITEM = { asin: "B00ABCDEFG", marketplace: "amazon.com", title: "A knee brace" };

beforeEach(() => {
  store = {};
});

describe("product lists store", () => {
  it("creates a named list and reads it back", async () => {
    const res = await createProductList("  Fitness picks  ");
    expect(res.lists).toHaveLength(1);
    expect(res.lists[0]?.name).toBe("Fitness picks");
    expect(res.listId).toBe(res.lists[0]?.id);
    expect((await getProductLists()).lists).toHaveLength(1);
  });

  it("ignores a blank list name", async () => {
    const res = await createProductList("   ");
    expect(res.lists).toHaveLength(0);
  });

  it("adds a product to an existing list, deduping by asin+marketplace", async () => {
    const created = await createProductList("List A");
    const id = created.listId!;
    await addToProductList({ listId: id, item: ITEM });
    const again = await addToProductList({ listId: id, item: { ...ITEM, asin: "b00abcdefg" } });
    expect(again.lists[0]?.items).toHaveLength(1);
    expect(again.lists[0]?.items[0]?.asin).toBe("B00ABCDEFG");
  });

  it("create-and-add path makes a new list from newListName", async () => {
    const res = await addToProductList({ newListName: "Fresh", item: ITEM });
    expect(res.lists).toHaveLength(1);
    expect(res.lists[0]?.name).toBe("Fresh");
    expect(res.lists[0]?.items).toHaveLength(1);
    expect(res.listId).toBe(res.lists[0]?.id);
  });

  it("rejects an invalid ASIN", async () => {
    const res = await addToProductList({ newListName: "X", item: { ...ITEM, asin: "nope" } });
    expect(res.lists).toHaveLength(0);
  });

  it("renames and deletes a list", async () => {
    const created = await createProductList("Old");
    const id = created.listId!;
    const renamed = await renameProductList(id, "New name");
    expect(renamed.lists[0]?.name).toBe("New name");
    const deleted = await deleteProductList(id);
    expect(deleted.lists).toHaveLength(0);
  });

  it("removes a product from a list", async () => {
    const created = await addToProductList({ newListName: "L", item: ITEM });
    const id = created.listId!;
    const after = await removeFromProductList(id, ITEM.asin, ITEM.marketplace);
    expect(after.lists[0]?.items).toHaveLength(0);
  });
});
