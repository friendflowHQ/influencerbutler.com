import { beforeEach, describe, expect, it, vi } from "vitest";

// Minimal chrome.storage.local stub over a plain object, mirroring the pattern
// in background/product-lists.test.ts. store.ts reads the whole "ib" blob via
// get(KEY) and writes it back via set({ [KEY]: state }).
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

import { deleteLocalTemplate, listLocalTemplates, saveLocalTemplate } from "./store";
import { TEMPLATES_CAP } from "../../storage/schema";

beforeEach(() => {
  store = {};
});

describe("message template store", () => {
  it("saves a template and reads it back, trimming label and body", async () => {
    const res = await saveLocalTemplate("  Intro  ", "  Hi {brandName}  ");
    expect(res.ok).toBe(true);
    expect(res.template?.label).toBe("Intro");
    expect(res.template?.body).toBe("Hi {brandName}");
    const all = await listLocalTemplates();
    expect(all).toHaveLength(1);
    expect(all[0]?.id).toBeTruthy();
  });

  it("rejects a blank name or an empty body", async () => {
    expect((await saveLocalTemplate("   ", "hi")).ok).toBe(false);
    expect((await saveLocalTemplate("Name", "   ")).ok).toBe(false);
    expect(await listLocalTemplates()).toHaveLength(0);
  });

  it("overwrites the body when saving under an existing label (case-insensitive)", async () => {
    const first = await saveLocalTemplate("Intro", "First version");
    const second = await saveLocalTemplate("intro", "Second version");
    expect(second.ok).toBe(true);
    const all = await listLocalTemplates();
    expect(all).toHaveLength(1); // updated, not duplicated
    expect(all[0]?.body).toBe("Second version");
    expect(all[0]?.id).toBe(first.template?.id); // same row, id preserved
  });

  it("deletes a template by id", async () => {
    const saved = await saveLocalTemplate("Intro", "hi");
    await deleteLocalTemplate(saved.template!.id);
    expect(await listLocalTemplates()).toHaveLength(0);
  });

  it("rejects a new template past the cap but still allows overwriting existing ones", async () => {
    for (let i = 0; i < TEMPLATES_CAP; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await saveLocalTemplate(`T${i}`, `body ${i}`);
    }
    expect(await listLocalTemplates()).toHaveLength(TEMPLATES_CAP);
    const over = await saveLocalTemplate("one too many", "nope");
    expect(over.ok).toBe(false);
    // Overwriting an existing label is fine even at the cap.
    const update = await saveLocalTemplate("T0", "updated");
    expect(update.ok).toBe(true);
    expect(await listLocalTemplates()).toHaveLength(TEMPLATES_CAP);
  });
});
