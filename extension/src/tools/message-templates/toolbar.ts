// The Save + Templates toolbar mounted just above the Creator Connections
// message composer. Two controls: "Templates" opens a picker that inserts a
// saved message into the composer in one click, and "Save" stores the current
// composer text as a template (optionally pushing it to the desktop app too).
// The picker merges the creator's extension-local templates with the desktop
// app's own templates (read live over the bridge), so both sides share one
// library. All UI lives in an inline shadow host so Amazon's widget styles never
// touch it and vice versa.

import { createInlineShadow } from "../../ui/host";
import { el } from "../../ui/components";
import { insertIntoComposer, readComposer } from "./compose";
import { resolvePlaceholders } from "./placeholders";
import { deleteLocalTemplate, listLocalTemplates, saveLocalTemplate } from "./store";
import { sendToBackground, type HudCommandResult } from "../../shared/messages";
import type { DesktopTemplate } from "../../transport/hud-commands";
import { log } from "../../shared/log";

export const HOST_CLASS = "mtpl-host";

// The desktop template store the "Also save to desktop app" push targets. The
// composer is Amazon Creator Connections, so the Amazon outreach templates
// (amazonbutler) are the right destination, not the FB/IG messenger store.
const DESKTOP_WORKSPACE = "amazonbutler";

// What the toolbar reads from the live page / desktop cache each time it acts.
// Everything is resolved lazily (the widget re-renders under React, so the
// composer node and thread brand can change between mount and click).
export type ToolbarContext = {
  resolveComposer: () => HTMLElement | null;
  resolveBrand: () => string | null;
  getDesktop: () => { templates: DesktopTemplate[]; values: Record<string, string>; paired: boolean };
};

export function buildToolbar(ctx: ToolbarContext): HTMLElement {
  const { host, root } = createInlineShadow(HOST_CLASS);
  const bar = el("div", "mtpl-bar");

  const templatesBtn = el("button", "btn small secondary mtpl-btn");
  templatesBtn.type = "button";
  templatesBtn.textContent = "Templates";
  const saveBtn = el("button", "btn small secondary mtpl-btn");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";

  // The pop-over the two buttons share (picker in one mode, save form in the
  // other). Rebuilt on each open so it always reflects the current templates.
  const menu = el("div", "mtpl-menu");
  menu.hidden = true;

  const close = () => {
    menu.hidden = true;
    menu.replaceChildren();
  };
  const toggle = (build: () => void) => {
    if (!menu.hidden) {
      close();
      return;
    }
    menu.replaceChildren();
    build();
    menu.hidden = false;
  };

  templatesBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    void toggle(() => renderPicker(menu, ctx, close));
  });
  saveBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    e.preventDefault();
    toggle(() => renderSaveForm(menu, ctx, close));
  });
  // Keep clicks inside the toolbar from bubbling into Amazon's widget (which
  // would otherwise treat them as clicks on the conversation/composer). The
  // pop-over closes via its own buttons (toggle, pick, save, cancel); we avoid a
  // document-level outside-click listener so there is nothing to leak across the
  // SPA navigations that remove and re-mount this host.
  root.addEventListener("click", (e) => e.stopPropagation());

  bar.append(templatesBtn, saveBtn, menu);
  root.append(bar);
  return host;
}

// ── Picker ───────────────────────────────────────────────────────────────────

function renderPicker(menu: HTMLElement, ctx: ToolbarContext, close: () => void): void {
  const insert = (body: string) => {
    const composer = ctx.resolveComposer();
    if (!composer) {
      showNote(menu, "Open a conversation first.");
      return;
    }
    const values = mergeValues(ctx);
    const text = resolvePlaceholders(body, values);
    const ok = insertIntoComposer(composer, text);
    if (!ok) showNote(menu, "Could not insert into the message box.");
    else close();
  };

  void (async () => {
    const local = await listLocalTemplates();
    const desktop = ctx.getDesktop();
    menu.replaceChildren();

    if (local.length === 0 && desktop.templates.length === 0) {
      menu.append(
        el(
          "p",
          "mtpl-empty",
          desktop.paired
            ? "No templates yet. Type a message and click Save."
            : "No saved templates yet. Type a message and click Save. Connect the desktop app to also see templates you saved there.",
        ),
      );
      return;
    }

    if (local.length > 0) {
      menu.append(el("p", "mtpl-group", "Your templates"));
      for (const tpl of local) {
        const row = el("div", "mtpl-row");
        const pick = el("button", "mtpl-pick");
        pick.type = "button";
        pick.append(el("span", "mtpl-label", tpl.label), el("span", "mtpl-preview", preview(tpl.body)));
        pick.title = tpl.body;
        pick.addEventListener("click", () => insert(tpl.body));

        const del = el("button", "mtpl-del", "×"); // multiplication sign
        del.type = "button";
        del.title = "Delete this template";
        del.setAttribute("aria-label", `Delete ${tpl.label}`);
        del.addEventListener("click", async (e) => {
          e.stopPropagation();
          await deleteLocalTemplate(tpl.id);
          renderPicker(menu, ctx, close); // re-render the now-shorter list
        });

        row.append(pick, del);
        menu.append(row);
      }
    }

    const desktopUsable = desktop.templates.filter((t) => firstVariation(t).length > 0);
    if (desktopUsable.length > 0) {
      menu.append(el("p", "mtpl-group", "From desktop app"));
      for (const tpl of desktopUsable) {
        const body = firstVariation(tpl);
        const row = el("div", "mtpl-row");
        const pick = el("button", "mtpl-pick");
        pick.type = "button";
        pick.append(el("span", "mtpl-label", tpl.label), el("span", "mtpl-preview", preview(body)));
        pick.title = body;
        pick.addEventListener("click", () => insert(body));
        row.append(pick);
        menu.append(row);
      }
    }
  })();
}

// ── Save form ─────────────────────────────────────────────────────────────────

function renderSaveForm(menu: HTMLElement, ctx: ToolbarContext, close: () => void): void {
  const composer = ctx.resolveComposer();
  const current = composer ? readComposer(composer).trim() : "";
  menu.replaceChildren();

  if (!current) {
    menu.append(el("p", "mtpl-empty", "Type a message in the box first, then Save it as a template."));
    return;
  }

  menu.append(el("p", "mtpl-group", "Save this message as a template"));
  const nameInput = el("input", "mtpl-name") as HTMLInputElement;
  nameInput.type = "text";
  nameInput.placeholder = "Template name";
  nameInput.maxLength = 60;
  menu.append(nameInput);

  const desktop = ctx.getDesktop();
  let pushCheckbox: HTMLInputElement | null = null;
  if (desktop.paired) {
    const label = el("label", "mtpl-check");
    pushCheckbox = el("input") as HTMLInputElement;
    pushCheckbox.type = "checkbox";
    label.append(pushCheckbox, document.createTextNode(" Also save to desktop app"));
    menu.append(label);
  }

  const actions = el("div", "mtpl-actions");
  const confirm = el("button", "btn small mtpl-btn", "Save");
  confirm.type = "button";
  const cancel = el("button", "btn small secondary mtpl-btn", "Cancel");
  cancel.type = "button";
  actions.append(confirm, cancel);
  menu.append(actions);

  cancel.addEventListener("click", () => close());
  confirm.addEventListener("click", async () => {
    const result = await saveLocalTemplate(nameInput.value, current);
    if (!result.ok) {
      showNote(menu, result.message ?? "Could not save.");
      return;
    }
    if (pushCheckbox?.checked && result.template) {
      await pushToDesktop(result.template.label, result.template.body);
    }
    close();
  });

  nameInput.focus();
}

async function pushToDesktop(label: string, body: string): Promise<void> {
  try {
    const res = await sendToBackground<HudCommandResult>({
      kind: "SEND_HUD_COMMAND",
      command: { type: "template.save", workspace: DESKTOP_WORKSPACE, template: { label, body } },
    });
    log("message-templates", "push to desktop", { ok: res?.ok === true });
  } catch (error) {
    // The local save already succeeded; a failed push is non-fatal.
    log("message-templates", "push to desktop failed", error);
  }
}

// ── helpers ────────────────────────────────────────────────────────────────────

function mergeValues(ctx: ToolbarContext): Record<string, string> {
  const brand = ctx.resolveBrand();
  const desktop = ctx.getDesktop();
  // The thread's brand wins over anything the desktop sent for {brandName}.
  return brand ? { ...desktop.values, brandName: brand } : { ...desktop.values };
}

function firstVariation(tpl: DesktopTemplate): string {
  const first = tpl.variations.find((v) => typeof v === "string" && v.trim().length > 0);
  return (first ?? "").trim();
}

function preview(body: string): string {
  const oneLine = body.replace(/\s+/g, " ").trim();
  return oneLine.length > 48 ? `${oneLine.slice(0, 47)}…` : oneLine;
}

function showNote(menu: HTMLElement, text: string): void {
  const existing = menu.querySelector(".mtpl-note");
  if (existing) existing.remove();
  menu.append(el("p", "mtpl-note", text));
}
