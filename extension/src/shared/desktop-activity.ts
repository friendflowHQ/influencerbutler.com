// Summary: Pure helpers for the "Desktop app activity" log: what the extension
//   sent to (or got from) the desktop app, and what happened. DOM-free and
//   storage-free so the background, the options page and the feedback report can
//   all share it and it can be unit-tested. The background owns persistence
//   (background/desktop-activity.ts). Never put secrets in an entry: no pairing
//   token, license key, or credentials, only action names, ids and short outcomes.

export type ActivityDirection = "to-app" | "from-app" | "connection";
export type ActivityOutcome = "ok" | "failed" | "queued" | "info";
export type ActivityRoute = "local" | "relay";

export type DesktopActivityEntry = {
  at: number; // epoch ms of the most recent occurrence
  dir: ActivityDirection;
  action: string; // e.g. "content.push", "settings.push", "pairing"
  outcome: ActivityOutcome;
  route?: ActivityRoute;
  detail?: string; // what it was about: "B0ABC (amazon.com)", "12 products"
  message?: string; // the app's or the bridge's one-line answer, for failures
  count?: number; // times this identical entry repeated back to back
};

export type NewActivity = Omit<DesktopActivityEntry, "at" | "count">;

export const ACTIVITY_CAP = 200;
// An identical entry this soon after the last one is folded into it (x2, x3...)
// instead of adding a row, so a flaky bridge cannot flood the log.
export const ACTIVITY_COALESCE_MS = 10 * 60 * 1000;
// How many of the newest entries ride along on a feedback report / chat bubble.
export const ACTIVITY_REPORT_LIMIT = 60;

const MAX_DETAIL = 160;

function clip(text: string, max = MAX_DETAIL): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}...` : flat;
}

// Commands the page fires on its own (not because the creator clicked). Logged
// only when they fail, so a healthy session is not buried in routine reports.
const AUTOMATIC_COMMANDS = new Set(["reach.report.batch", "audioSuppressed.report.batch"]);

export function isAutomaticCommand(type: string): boolean {
  return AUTOMATIC_COMMANDS.has(type);
}

// Boil a HudCommand down to an action name and a short, safe description of its
// subject (ids and counts, never titles, prices or image urls).
export function summarizeCommand(command: unknown): { action: string; detail?: string } {
  const c = (command && typeof command === "object" ? command : {}) as Record<string, unknown>;
  const action = typeof c.type === "string" && c.type ? c.type : "unknown";
  const parts: string[] = [];

  const workspace = typeof c.workspace === "string" ? c.workspace : "";
  if (workspace) parts.push(`workspace ${workspace}`);

  const product = c.product as { asin?: unknown; marketplace?: unknown } | undefined;
  if (product && typeof product === "object" && typeof product.asin === "string") {
    parts.push(`${product.asin}${typeof product.marketplace === "string" ? ` (${product.marketplace})` : ""}`);
  }
  for (const [key, noun] of [
    ["products", "products"],
    ["items", "items"],
    ["issues", "issues"],
  ] as const) {
    const list = c[key];
    if (Array.isArray(list)) parts.push(`${list.length} ${noun}`);
  }
  const video = c.video as { contentId?: unknown } | undefined;
  if (video && typeof video === "object" && typeof video.contentId === "string") {
    parts.push(`video ${video.contentId.slice(0, 24)}`);
  }
  if (typeof c.brand === "string" && c.brand) parts.push(`brand ${clip(c.brand, 40)}`);

  return { action, detail: parts.length ? clip(parts.join(", ")) : undefined };
}

export function describeOutcome(result: {
  ok?: boolean;
  needsPairing?: boolean;
  message?: string;
}): { outcome: ActivityOutcome; message?: string } {
  if (result.ok) return { outcome: "ok" };
  if (result.needsPairing) {
    return { outcome: "failed", message: clip(result.message || "Extension is not paired with the app") };
  }
  return { outcome: "failed", message: result.message ? clip(result.message) : undefined };
}

// Newest first. Folds a repeat of the newest entry into it, otherwise prepends,
// and trims to the cap. Pure: returns a new list.
export function appendActivity(
  list: DesktopActivityEntry[],
  entry: NewActivity,
  now: number,
): DesktopActivityEntry[] {
  const clean: DesktopActivityEntry = {
    ...entry,
    detail: entry.detail ? clip(entry.detail) : undefined,
    message: entry.message ? clip(entry.message) : undefined,
    at: now,
  };
  const head = list[0];
  if (
    head &&
    now - head.at < ACTIVITY_COALESCE_MS &&
    head.dir === clean.dir &&
    head.action === clean.action &&
    head.outcome === clean.outcome &&
    head.route === clean.route &&
    head.detail === clean.detail &&
    head.message === clean.message
  ) {
    return [{ ...head, at: now, count: (head.count ?? 1) + 1 }, ...list.slice(1)];
  }
  return [clean, ...list].slice(0, ACTIVITY_CAP);
}

const DIR_LABEL: Record<ActivityDirection, string> = {
  "to-app": "to app",
  "from-app": "from app",
  connection: "connection",
};

const OUTCOME_LABEL: Record<ActivityOutcome, string> = {
  ok: "OK",
  failed: "FAILED",
  queued: "QUEUED",
  info: "info",
};

// One plain-text line, used by the options page's Copy button and the feedback
// report: `2026-10-07 18:30:01Z | to app | content.push | OK | local | B0ABC (amazon.com) | x3`.
export function formatActivityLine(entry: DesktopActivityEntry): string {
  const when = new Date(entry.at).toISOString().replace("T", " ").replace(/\.\d+Z$/, "Z");
  const cols = [
    when,
    DIR_LABEL[entry.dir],
    entry.action,
    OUTCOME_LABEL[entry.outcome],
    entry.route ?? "-",
    entry.detail ?? "-",
  ];
  if (entry.message) cols.push(entry.message);
  if ((entry.count ?? 1) > 1) cols.push(`x${entry.count}`);
  return cols.join(" | ");
}

// The text block attached to feedback reports and chat-bubble logs. Newest
// first, capped, with a header that explains the columns.
export function formatActivityLog(
  entries: DesktopActivityEntry[],
  limit = ACTIVITY_REPORT_LIMIT,
): string {
  const header = "== Desktop app activity (newest first) ==";
  if (entries.length === 0) return `${header}\n(nothing sent to or received from the app yet)`;
  const cols = "time (UTC) | direction | action | result | route | detail | note";
  const shown = entries.slice(0, limit).map(formatActivityLine);
  const more = entries.length > limit ? [`(${entries.length - limit} older entries not shown)`] : [];
  return [header, cols, ...shown, ...more].join("\n");
}
