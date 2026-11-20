import { ACCEPT_LEDGER_KEY } from "./constants";
import {
  MILESTONES_KEY,
  sanitizeMilestones,
  seedMilestones,
  type MilestoneId,
  type MilestonesState,
  type PriorActivity,
} from "./milestones";
import { getState } from "../storage/store";

// Storage side of first-success moments: read and write the small state object
// under its own key (no schema bump, like ib-review-ask), and work out what a
// person had already done before this feature existed. Every call is best-effort:
// a storage failure must never break the action being celebrated.

// A successful send of a PRODUCT to the app (content, deal, voiceover, collab, link or
// idea list actions). The log also holds automatic settings, findings and affiliate
// pushes, which are not something the person did and must not count.
const PRODUCT_SEND_RE = /^(content|deal|voiceover|collaboration|link|idealist)[.]/;

export function isProductSend(entry: unknown): boolean {
  if (!entry || typeof entry !== "object") return false;
  const e = entry as { dir?: unknown; outcome?: unknown; action?: unknown };
  return e.dir === "to-app" && e.outcome === "ok" && typeof e.action === "string" && PRODUCT_SEND_RE.test(e.action);
}

export async function loadMilestones(): Promise<MilestonesState> {
  try {
    const got = await chrome.storage.local.get(MILESTONES_KEY);
    return sanitizeMilestones(got?.[MILESTONES_KEY]);
  } catch {
    return sanitizeMilestones(null);
  }
}

export async function saveMilestones(state: MilestonesState): Promise<void> {
  try {
    await chrome.storage.local.set({ [MILESTONES_KEY]: state });
  } catch {
    // storage unavailable: the milestone is just not remembered
  }
}

// What the person had already done, read from data the extension already keeps.
export async function priorActivity(): Promise<PriorActivity> {
  const prior: PriorActivity = {};
  try {
    const got = (await chrome.storage.local.get([ACCEPT_LEDGER_KEY, "ib-desktop-activity"])) as Record<string, unknown>;
    const ledger = got[ACCEPT_LEDGER_KEY] as { items?: unknown[]; history?: unknown[] } | undefined;
    if ((ledger?.items?.length ?? 0) > 0 || (ledger?.history?.length ?? 0) > 0) prior.firstAccept = true;
    const activity = got["ib-desktop-activity"];
    if (Array.isArray(activity) && activity.some(isProductSend)) prior.firstSend = true;
  } catch {
    // unreadable: treat as no prior activity
  }
  try {
    const state = await getState();
    if (state.productLists.some((l) => l.items.length > 0)) prior.firstList = true;
  } catch {
    // unreadable: treat as no prior list
  }
  return prior;
}

// Initialize once (background: on install or update). Does nothing if already done.
export async function ensureMilestonesSeeded(now = Date.now(), except?: MilestoneId): Promise<MilestonesState> {
  const state = await loadMilestones();
  if (state.seeded) return state;
  const seeded = seedMilestones(state, await priorActivity(), now, except);
  await saveMilestones(seeded);
  return seeded;
}
