import type { DealPlacement, HudCommand, HudCommandResult, ProductRef } from "../transport/hud-commands";
import { DEAL_PUSH_CHUNK } from "../shared/constants";
import type { DealsDict } from "../deals/strings";

// The one-click send behind the on-page "Send to Deals" chip.
//
// Clicks arrive in bursts: a creator sweeps down a page of cards tapping every
// deal they want. Each click on its own would be a separate bridge round trip
// to the desktop app, so the queue coalesces a burst into a single
// deal.push.batch (which the app already speaks) and keeps one handle per chip
// so each one can still be told what happened to it.

export type ChipState = "idle" | "pending" | "sent" | "error";
export type ChipHandle = { setState: (state: ChipState, detail?: string) => void };

export type Sender = (command: HudCommand) => Promise<HudCommandResult | null>;

export type SendQueueDeps = {
  send: Sender;
  // Read per flush rather than per click, so a workspace or placement changed
  // in the options page takes effect without reloading the deal site.
  // `alsoWorkspace` is the event-day "always send to both" second target: the
  // same products also go there, but its outcome never changes a chip, so a
  // failure there cannot make a send that landed in the main workspace look
  // failed.
  target: () => Promise<{
    workspace: string;
    placement: DealPlacement;
    alsoWorkspace?: string | null;
  }>;
  dict: DealsDict;
  debounceMs?: number;
  maxWaitMs?: number;
};

export const SEND_DEBOUNCE_MS = 250;
export const SEND_MAX_WAIT_MS = 800;

// `workspace` is set when one click targets a specific workspace (the event-day
// "+ Prime Day Deals" chip); otherwise the flush uses the configured target.
type Entry = { product: ProductRef; chips: ChipHandle[]; workspace?: string };

// Pure: what a chip should say about one bridge reply. `null` is the
// askBackground "nothing answered" case, which is a dead worker or an orphaned
// content script, not a refusal, so it gets its own wording.
export function chipStateFor(
  result: HudCommandResult | null,
  dict: DealsDict,
): { state: ChipState; detail?: string } {
  if (!result) return { state: "error", detail: dict.cardAppNotRunning };
  if (result.needsPairing) return { state: "error", detail: dict.cardNeedsPairing };
  if (!result.ok) return { state: "error", detail: result.message || dict.cardFailed };
  return { state: "sent" };
}

export function createSendQueue(deps: SendQueueDeps) {
  const debounceMs = deps.debounceMs ?? SEND_DEBOUNCE_MS;
  const maxWaitMs = deps.maxWaitMs ?? SEND_MAX_WAIT_MS;
  const pending = new Map<string, Entry>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let firstQueuedAt = 0;
  // Latched for the rest of the page once an older desktop build tells us it
  // does not know deal.push.batch, so we stop paying for the failed probe.
  let useSinglePush = false;

  function enqueue(product: ProductRef, chip: ChipHandle, workspace?: string): void {
    // Feedback must not wait on the flush: the chip reacts to the click itself.
    chip.setState("pending");
    const key = `${workspace ?? ""}|${product.marketplace}:${product.asin}`;
    const existing = pending.get(key);
    if (existing) {
      existing.chips.push(chip);
    } else {
      pending.set(key, { product, chips: [chip], workspace });
      if (firstQueuedAt === 0) firstQueuedAt = Date.now();
    }
    schedule();
  }

  function schedule(): void {
    if (timer) clearTimeout(timer);
    const waited = Date.now() - firstQueuedAt;
    const delay = Math.max(0, Math.min(debounceMs, maxWaitMs - waited));
    timer = setTimeout(() => void flush(), delay);
  }

  async function flush(): Promise<void> {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const entries = [...pending.values()];
    pending.clear();
    firstQueuedAt = 0;
    if (entries.length === 0) return;

    const { workspace, placement, alsoWorkspace } = await deps.target();
    const byWorkspace = new Map<string, Entry[]>();
    for (const entry of entries) {
      const ws = entry.workspace ?? workspace;
      byWorkspace.set(ws, [...(byWorkspace.get(ws) ?? []), entry]);
    }
    for (const [ws, group] of byWorkspace) {
      for (let i = 0; i < group.length; i += DEAL_PUSH_CHUNK) {
        await sendChunk(group.slice(i, i + DEAL_PUSH_CHUNK), ws, placement, true);
      }
    }
    // Event-day "always both": a quiet second send of what went to the main one.
    if (alsoWorkspace && alsoWorkspace !== workspace) {
      const mirrored = entries.filter((e) => e.workspace === undefined);
      for (let i = 0; i < mirrored.length; i += DEAL_PUSH_CHUNK) {
        await sendChunk(mirrored.slice(i, i + DEAL_PUSH_CHUNK), alsoWorkspace, placement, false);
      }
    }
  }

  async function sendChunk(
    chunk: Entry[],
    workspace: string,
    placement: DealPlacement,
    reportToChips: boolean,
  ): Promise<void> {
    const report = (entries: Entry[], result: HudCommandResult | null): void => {
      if (reportToChips) reportOutcome(entries, result);
    };
    const single = chunk[0];
    if (chunk.length === 1 && single) {
      const result = await deps.send({
        type: "deal.push",
        workspace,
        placement,
        product: single.product,
      });
      report(chunk, result);
      return;
    }

    if (!useSinglePush) {
      const result = await deps.send({
        type: "deal.push.batch",
        workspace,
        placement,
        products: chunk.map((entry) => entry.product),
      });
      // Same compatibility downgrade the Deal Sites Harvester does: an app that
      // predates the batch command answers "Unknown command", and one product
      // at a time still works there.
      if (result && !result.ok && /^Unknown command/i.test(result.message ?? "")) {
        useSinglePush = true;
      } else {
        report(chunk, result);
        return;
      }
    }

    for (const entry of chunk) {
      const result = await deps.send({
        type: "deal.push",
        workspace,
        placement,
        product: entry.product,
      });
      report([entry], result);
    }
  }

  // A batch is one reply for the whole frame, so every chip in it hears the
  // same outcome. That is why the queue carries chip handles and not just
  // products.
  function reportOutcome(entries: Entry[], result: HudCommandResult | null): void {
    const outcome = chipStateFor(result, deps.dict);
    for (const entry of entries) {
      for (const chip of entry.chips) chip.setState(outcome.state, outcome.detail);
    }
  }

  return { enqueue, flush };
}
