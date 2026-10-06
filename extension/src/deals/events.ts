// Event days (Prime Day, Prime Big Deal Days, Walmart Deals) as the site
// announces them through the remote flags. On those days a creator who sends a
// deal to the Deals Butler often wants it in the Prime Day Deals workspace too,
// so the send surfaces offer a second target while a window is open.

export type DealEventRetailer = "amazon" | "walmart";

export type DealEvent = {
  id: string;
  retailers: DealEventRetailer[];
  // Epoch ms. The site serves the day-before start already, so the window opens
  // when creators begin prepping.
  startsAt: number;
  endsAt: number;
};

export const MAX_DEAL_EVENTS = 12;
const MAX_EVENT_ID_LEN = 60;

// Pure: coerce an untrusted payload into valid events. Malformed entries are
// dropped, never thrown on, so a typo in the flag config cannot break a send.
export function sanitizeDealEvents(raw: unknown): DealEvent[] {
  if (!Array.isArray(raw)) return [];
  const out: DealEvent[] = [];
  for (const item of raw) {
    if (out.length >= MAX_DEAL_EVENTS) break;
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const id = typeof obj.id === "string" ? obj.id.trim().slice(0, MAX_EVENT_ID_LEN) : "";
    const startsAt = toMs(obj.startsAt);
    const endsAt = toMs(obj.endsAt);
    if (!id || startsAt === null || endsAt === null || endsAt <= startsAt) continue;
    const retailers = Array.isArray(obj.retailers)
      ? obj.retailers.filter((r): r is DealEventRetailer => r === "amazon" || r === "walmart")
      : [];
    if (retailers.length === 0) continue;
    out.push({ id, retailers: [...new Set(retailers)], startsAt, endsAt });
  }
  return out;
}

function toMs(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? null : ms;
  }
  return null;
}

// The event open right now for this retailer, if any.
export function activeDealEvent(
  events: readonly DealEvent[] | undefined,
  retailer: DealEventRetailer,
  now: number = Date.now(),
): DealEvent | null {
  for (const event of events ?? []) {
    if (event.retailers.includes(retailer) && now >= event.startsAt && now < event.endsAt) {
      return event;
    }
  }
  return null;
}

type WorkspaceRef = { key: string; label: string };

// The Prime Day Deals workspace, from the app's live list. The desktop owns the
// key, so match the known key first and then any label naming Prime Day. Null
// means the app does not offer it (closed, or the butler is hidden), in which
// case the extra option must not appear at all.
export function findPrimeDayWorkspace(workspaces: readonly WorkspaceRef[]): WorkspaceRef | null {
  return (
    workspaces.find((w) => w.key === "prime-day") ??
    workspaces.find((w) => /prime\s*day/i.test(w.label)) ??
    null
  );
}

export function retailerOfMarketplace(marketplace: string): DealEventRetailer {
  return /walmart/.test(marketplace) ? "walmart" : "amazon";
}
