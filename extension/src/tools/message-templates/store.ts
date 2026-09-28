// Local CRUD for the creator's saved message templates. These live in
// chrome.storage.local under the shared "ib" blob (see storage/schema.ts) and
// never leave the machine; the desktop app's own templates are read separately
// over the bridge and merged only at display time. Kept thin: the toolbar reads
// the list fresh each time it opens, so there is no in-memory cache to keep in
// sync here.

import { getState, patchState } from "../../storage/store";
import { TEMPLATES_CAP, type Template } from "../../storage/schema";

export type SaveResult = { ok: boolean; message?: string; template?: Template };

// A stable local id. crypto.randomUUID exists in the content-script context
// (a secure page), but fall back so a hardened/edge environment never throws.
function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `tpl_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  }
}

export async function listLocalTemplates(): Promise<Template[]> {
  return (await getState()).templates;
}

// Save a new template, or overwrite the body of an existing one with the same
// label (case-insensitive) so re-saving under a name the user already used
// updates it instead of piling up near-duplicates. Rejected past the cap so
// storage stays bounded.
export async function saveLocalTemplate(rawLabel: string, rawBody: string): Promise<SaveResult> {
  const label = rawLabel.trim();
  const body = rawBody.trim();
  if (!label) return { ok: false, message: "Give the template a name." };
  if (!body) return { ok: false, message: "The message is empty, nothing to save." };

  let saved: Template | undefined;
  let error: string | undefined;
  await patchState((state) => {
    const existing = state.templates.find((t) => t.label.toLowerCase() === label.toLowerCase());
    const now = Date.now();
    if (existing) {
      existing.body = body;
      existing.updatedAt = now;
      saved = existing;
      return;
    }
    if (state.templates.length >= TEMPLATES_CAP) {
      error = `You have reached the ${TEMPLATES_CAP}-template limit. Delete one first.`;
      return;
    }
    const template: Template = { id: newId(), label, body, createdAt: now, updatedAt: now };
    state.templates.push(template);
    saved = template;
  });

  if (error) return { ok: false, message: error };
  return { ok: true, template: saved };
}

export async function deleteLocalTemplate(id: string): Promise<void> {
  await patchState((state) => {
    state.templates = state.templates.filter((t) => t.id !== id);
  });
}
