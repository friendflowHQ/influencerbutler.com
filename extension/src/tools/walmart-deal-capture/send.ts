import type { HudCommand, HudCommandResult } from "../../transport/hud-commands";
import { WALMART_DEAL_CAPTURE_CHUNK, type WalmartEventProduct } from "../../walmart/deal-capture";
import type { DealCaptureDict } from "../../walmart/deal-capture-strings";

// Sends the products read off a walmart.com deal page to the desktop's Black
// Friday Deals table as walmartEvent.capture commands (200 products each) and
// boils the replies down to one plain sentence for the button. DOM-free so it
// can be unit-tested; the button (./button.ts) owns the page.

// A reply that came back through the relay (no app on this computer, a linked
// desktop elsewhere took it) carries the relay's own sentence instead of counts.
export type CaptureReply = (HudCommandResult & { viaRemote?: boolean }) | null;
export type CaptureSender = (command: HudCommand) => Promise<CaptureReply>;

export type CaptureOutcome = { ok: boolean; message: string };

export type CaptureStrings = DealCaptureDict & { appNotRunning: string; needsPairing: string };

export async function sendCapturedDeals(opts: {
  products: WalmartEventProduct[];
  pageUrl: string;
  workspace?: string | null;
  capped?: boolean;
  capMax?: number;
  send: CaptureSender;
  dict: CaptureStrings;
  onProgress?: (sent: number, total: number) => void;
  chunkSize?: number;
}): Promise<CaptureOutcome> {
  const { products, dict } = opts;
  if (products.length === 0) return { ok: false, message: dict.noProducts };
  const chunkSize = opts.chunkSize ?? WALMART_DEAL_CAPTURE_CHUNK;
  const workspace = (opts.workspace ?? "").trim();

  let sent = 0;
  let added = 0;
  let total: number | undefined;
  let sawCounts = false;
  let relayMessage: string | undefined;

  for (let i = 0; i < products.length; i += chunkSize) {
    const chunk = products.slice(i, i + chunkSize);
    opts.onProgress?.(sent, products.length);
    const command: HudCommand = {
      type: "walmartEvent.capture",
      ...(workspace ? { workspace } : {}),
      pageUrl: opts.pageUrl,
      products: chunk,
    };
    const result = await opts.send(command);
    const failure = failureMessage(result, dict);
    if (failure !== null) {
      // Say how far it got when an earlier chunk already landed.
      const message = sent > 0 ? `${failure} ${dict.partial(sent, products.length)}` : failure;
      return { ok: false, message };
    }
    sent += chunk.length;
    if (result?.viaRemote) relayMessage = result.message;
    if (typeof result?.added === "number") {
      added += result.added;
      sawCounts = true;
    }
    if (typeof result?.total === "number") {
      total = result.total;
      sawCounts = true;
    }
  }

  const cappedNote = opts.capped && opts.capMax ? ` ${dict.capped(opts.capMax)}` : "";
  if (relayMessage && !sawCounts) return { ok: true, message: relayMessage + cappedNote };
  if (!sawCounts) return { ok: true, message: dict.sent(sent) + cappedNote };
  if (added === 0 && total !== undefined) return { ok: true, message: dict.nothingNew(total) + cappedNote };
  const totalNote = total !== undefined ? ` ${dict.tableTotal(total)}` : "";
  return { ok: true, message: dict.sent(added) + totalNote + cappedNote };
}

// Null when the reply is a success; otherwise what to tell the creator. Same
// three cases the Send to Deals chips distinguish (deal-badge/send.ts
// chipStateFor), plus an older desktop that does not know the command yet.
export function failureMessage(result: CaptureReply, dict: CaptureStrings): string | null {
  if (!result) return dict.appNotRunning;
  if (result.needsPairing) return dict.needsPairing;
  if (result.ok) return null;
  if (/^Unknown command/i.test(result.message ?? "")) return dict.needsUpdate;
  // hud-bridge's English "is not running" line (nothing answered on any port):
  // say it in the creator's language instead.
  if (/not running/i.test(result.message ?? "")) return dict.appNotRunning;
  return result.message || dict.failed;
}
