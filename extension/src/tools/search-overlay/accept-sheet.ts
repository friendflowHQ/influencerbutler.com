import overlayCss from "../../ui/overlay.css";
import { UI_PREFIX } from "../../shared/constants";
import { el } from "../../ui/components";
import {
  formatEnds,
  isBatchStopper,
  selectedIds,
  summarize,
  type RowStatus,
  type SheetItem,
} from "./accept-sheet-model";

// Review sheet for "Accept campaigns on this page". Replaces a bare
// window.confirm: the user sees every campaign, unticks the ones they do not
// want, confirms once, then watches each row go Waiting, Accepting, Accepted or
// Failed (with a per-row Retry). Accepting is not reversible from here, so the
// sheet says so before the button. Mounted in its own closed shadow host.

export type AcceptResult = { ok: boolean; reason?: string; note?: string | null };

export type AcceptSheetOptions = {
  items: SheetItem[];
  locale: string;
  // Accepts one campaign by item id. The caller owns the real accept route.
  accept: (id: string) => Promise<AcceptResult>;
  // Called when the sheet closes, with how many were accepted of how many tried.
  onClose: (summary: { accepted: number; attempted: number }) => void;
};

type SheetCopy = {
  title: string;
  warning: string;
  accept: (n: number) => string;
  cancel: string;
  stop: string;
  close: string;
  retry: string;
  none: string;
  rate: (pct: number) => string;
  ends: (date: string) => string;
  status: Record<RowStatus, string>;
  summary: (done: number, total: number) => string;
  stopped: string;
  selectAll: string;
};

const EN: SheetCopy = {
  title: "Accept these campaigns?",
  warning: "Accepting is final. It cannot be undone from here.",
  accept: (n) => `Accept ${n} campaign${n === 1 ? "" : "s"}`,
  cancel: "Cancel",
  stop: "Stop after this one",
  close: "Close",
  retry: "Retry",
  none: "Select at least one campaign.",
  rate: (pct) => `${pct}% commission`,
  ends: (date) => `Ends ${date}`,
  status: { waiting: "Waiting", working: "Accepting...", done: "Accepted", failed: "Failed", skipped: "Skipped" },
  summary: (done, total) => `Accepted ${done} of ${total}`,
  stopped: "Stopped. The rest were skipped.",
  selectAll: "Select all",
};
const ES: SheetCopy = {
  title: "Aceptar estas campanas?",
  warning: "Aceptar es definitivo. No se puede deshacer desde aqui.",
  accept: (n) => `Aceptar ${n} campana${n === 1 ? "" : "s"}`,
  cancel: "Cancelar",
  stop: "Detener despues de esta",
  close: "Cerrar",
  retry: "Reintentar",
  none: "Selecciona al menos una campana.",
  rate: (pct) => `${pct}% de comision`,
  ends: (date) => `Termina ${date}`,
  status: { waiting: "En espera", working: "Aceptando...", done: "Aceptada", failed: "Fallo", skipped: "Omitida" },
  summary: (done, total) => `Aceptadas ${done} de ${total}`,
  stopped: "Detenido. Se omitieron las demas.",
  selectAll: "Seleccionar todo",
};
const FR: SheetCopy = {
  title: "Accepter ces campagnes ?",
  warning: "L'acceptation est definitive. Elle ne peut pas etre annulee d'ici.",
  accept: (n) => `Accepter ${n} campagne${n === 1 ? "" : "s"}`,
  cancel: "Annuler",
  stop: "Arreter apres celle-ci",
  close: "Fermer",
  retry: "Reessayer",
  none: "Selectionnez au moins une campagne.",
  rate: (pct) => `${pct} % de commission`,
  ends: (date) => `Se termine le ${date}`,
  status: { waiting: "En attente", working: "Acceptation...", done: "Acceptee", failed: "Echec", skipped: "Ignoree" },
  summary: (done, total) => `${done} acceptee${done === 1 ? "" : "s"} sur ${total}`,
  stopped: "Arrete. Les autres ont ete ignorees.",
  selectAll: "Tout selectionner",
};

function copyFor(locale: string): SheetCopy {
  if (locale.startsWith("es")) return ES;
  if (locale.startsWith("fr")) return FR;
  return EN;
}

export function openAcceptSheet(opts: AcceptSheetOptions): void {
  const c = copyFor(opts.locale);
  const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const container = document.createElement("div");
  container.className = `${UI_PREFIX}-modal-host`;
  const root = container.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = overlayCss;
  root.append(style);

  const backdrop = el("div", "modal-backdrop");
  const modal = el("div", "modal wide accept-sheet");
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const titleId = `${UI_PREFIX}-sheet-title`;
  modal.setAttribute("aria-labelledby", titleId);
  backdrop.append(modal);

  const head = el("div", "modal-head");
  const title = el("h3", "modal-title", c.title);
  title.id = titleId;
  head.append(title);

  const warning = el("p", "sheet-warning", c.warning);
  const live = el("p", "sheet-live");
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");

  const checked = new Set(opts.items.map((i) => i.id));
  const status = new Map<string, RowStatus>(opts.items.map((i) => [i.id, "waiting"]));
  const rowEls = new Map<string, { row: HTMLElement; statusEl: HTMLElement; box: HTMLInputElement; retry: HTMLButtonElement; note: HTMLElement }>();
  let phase: "review" | "running" | "done" = "review";
  let stopRequested = false;
  let closed = false;

  const list = el("ul", "sheet-list");
  const allWrap = el("label", "sheet-all");
  const allBox = el("input") as HTMLInputElement;
  allBox.type = "checkbox";
  allBox.checked = true;
  allWrap.append(allBox, el("span", "", c.selectAll));

  const primary = el("button", "btn") as HTMLButtonElement;
  primary.type = "button";
  const secondary = el("button", "btn secondary") as HTMLButtonElement;
  secondary.type = "button";

  const refreshButtons = (): void => {
    if (phase === "review") {
      const n = selectedIds(opts.items, checked).length;
      primary.textContent = c.accept(n);
      primary.disabled = n === 0;
      secondary.textContent = c.cancel;
      secondary.disabled = false;
      live.textContent = n === 0 ? c.none : "";
      allBox.checked = n === opts.items.length;
    } else if (phase === "running") {
      primary.textContent = c.stop;
      primary.disabled = stopRequested;
      secondary.hidden = true;
    } else {
      primary.textContent = c.close;
      primary.disabled = false;
      secondary.hidden = true;
    }
  };

  const paintRow = (id: string): void => {
    const r = rowEls.get(id);
    const s = status.get(id) ?? "waiting";
    if (!r) return;
    r.statusEl.textContent = c.status[s];
    r.statusEl.dataset.state = s;
    r.retry.hidden = !(s === "failed" && phase === "done");
    r.box.disabled = phase !== "review";
  };

  for (const item of opts.items) {
    const li = el("li", "sheet-row");
    const label = el("label", "sheet-main");
    const box = el("input") as HTMLInputElement;
    box.type = "checkbox";
    box.checked = true;
    box.addEventListener("change", () => {
      if (box.checked) checked.add(item.id);
      else checked.delete(item.id);
      refreshButtons();
    });
    const text = el("span", "sheet-text");
    text.append(el("span", "sheet-title", item.title));
    const meta: string[] = [];
    if (item.brand) meta.push(item.brand);
    if (item.ratePct !== null) meta.push(c.rate(item.ratePct));
    const ends = formatEnds(item.endsAt, opts.locale);
    if (ends) meta.push(c.ends(ends));
    if (meta.length) text.append(el("span", "sheet-meta", meta.join(" · ")));
    const note = el("span", "sheet-note");
    note.hidden = true;
    text.append(note);
    label.append(box, text);
    const statusEl = el("span", "sheet-status");
    const retry = el("button", "btn secondary small", c.retry) as HTMLButtonElement;
    retry.type = "button";
    retry.hidden = true;
    retry.addEventListener("click", () => void runOne(item.id, true));
    li.append(label, statusEl, retry);
    list.append(li);
    rowEls.set(item.id, { row: li, statusEl, box, retry, note });
    paintRow(item.id);
  }

  allBox.addEventListener("change", () => {
    for (const item of opts.items) {
      const r = rowEls.get(item.id);
      if (!r) continue;
      r.box.checked = allBox.checked;
      if (allBox.checked) checked.add(item.id);
      else checked.delete(item.id);
    }
    refreshButtons();
  });

  const finish = (): void => {
    phase = "done";
    const sum = summarize(status.values());
    const attempted = sum.done + sum.failed;
    live.textContent = stopRequested ? `${c.summary(sum.done, attempted)}. ${c.stopped}` : c.summary(sum.done, attempted);
    for (const item of opts.items) paintRow(item.id);
    refreshButtons();
    primary.focus();
  };

  const runOne = async (id: string, isRetry: boolean): Promise<AcceptResult> => {
    status.set(id, "working");
    paintRow(id);
    const r = rowEls.get(id);
    if (r) r.note.hidden = true;
    let result: AcceptResult;
    try {
      result = await opts.accept(id);
    } catch {
      result = { ok: false, reason: "error" };
    }
    status.set(id, result.ok ? "done" : "failed");
    if (!result.ok && r && result.note) {
      r.note.textContent = result.note;
      r.note.hidden = false;
    }
    paintRow(id);
    if (isRetry) {
      const sum = summarize(status.values());
      live.textContent = c.summary(sum.done, sum.done + sum.failed);
    }
    return result;
  };

  const runBatch = async (): Promise<void> => {
    const ids = selectedIds(opts.items, checked);
    for (const item of opts.items) {
      if (!checked.has(item.id)) {
        status.set(item.id, "skipped");
      }
    }
    phase = "running";
    refreshButtons();
    for (const item of opts.items) paintRow(item.id);
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i] as string;
      if (stopRequested) {
        for (const rest of ids.slice(i)) status.set(rest, "skipped");
        break;
      }
      const result = await runOne(id, false);
      const sum = summarize(status.values());
      live.textContent = c.summary(sum.done, ids.length);
      if (!result.ok && isBatchStopper(result.reason)) {
        for (const rest of ids.slice(i + 1)) status.set(rest, "skipped");
        stopRequested = true;
        break;
      }
    }
    finish();
  };

  const teardown = (): void => {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKeydown, true);
    container.remove();
    const sum = summarize(status.values());
    opts.onClose({ accepted: sum.done, attempted: sum.done + sum.failed });
    try {
      previouslyFocused?.focus();
    } catch {
      /* element gone */
    }
  };

  primary.addEventListener("click", () => {
    if (phase === "review") void runBatch();
    else if (phase === "running") {
      stopRequested = true;
      refreshButtons();
    } else teardown();
  });
  secondary.addEventListener("click", teardown);

  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      // Never abandon a run mid-way; Stop is the explicit control for that.
      if (phase !== "running") teardown();
      return;
    }
    if (event.key !== "Tab") return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled]):not([hidden])"),
    ).filter((n) => !n.hidden && n.offsetParent !== null);
    if (focusables.length === 0) return;
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    const active = root.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const actions = el("div", "modal-actions");
  actions.append(primary, secondary);
  const body = el("div", "modal-body");
  body.append(warning, allWrap, list, live);
  modal.append(head, body, actions);
  root.append(backdrop);
  refreshButtons();
  document.addEventListener("keydown", onKeydown, true);
  document.documentElement.append(container);
  // Land on the safe control: Cancel, not the destructive Accept.
  secondary.focus();
}
