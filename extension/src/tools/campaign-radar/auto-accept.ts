import {
  AUTO_ACCEPT_DELAY_MAX_MS,
  AUTO_ACCEPT_DELAY_MIN_MS,
  AUTO_ACCEPT_TAB_DWELL_MS,
} from "../../shared/constants";
import { log } from "../../shared/log";
import {
  sendToBackground,
  type AcceptLedgerView,
  type AcceptOutcome,
  type AutoAcceptStopReason,
  type AutoAcceptedItem,
  type RuntimeMessage,
} from "../../shared/messages";
import {
  applyCampaignFills,
  daysUntil,
  readCampaignGrid,
  type CampaignFill,
} from "../../amazon/creator-campaigns";
import {
  clampAutoAcceptDailyCap,
  clampAutoAcceptPerRunCap,
  type AutoAcceptSettings,
  type Settings,
} from "../../storage/schema";
import { bandFor, campaignFillPct, computeCampaignScore } from "./score";
import { runAcceptOnPage } from "./accept-runner";

// "Accept campaigns that match rules you set": the rule-based accept pass.
//
// OPT-IN, capped, and remotely killable. The creator writes the rules on the
// options page (minimum commission, which Campaign Radar bands qualify, skip
// anything ending soon, a daily cap and a per-check cap). Every 30 minutes the
// Last Call poll (background/last-call.ts) opens the Creator Connections grid in
// a background tab; once the grid's fill report has landed, the worker sends
// RUN_AUTO_ACCEPT and this module, running in that tab, reads the cards, keeps
// the ones that pass every rule and are not already in the accept ledger, and
// clicks Amazon's OWN Accept button on each pick through the same in-page
// runner a manual click uses (accept-runner.ts), with a human-paced gap between
// clicks. It never replays Amazon's API. The outcome goes back as
// AUTO_ACCEPT_DONE; the worker records the ledger and posts one summary.
//
// The rule evaluation (evaluateAutoAccept) is pure and unit-tested; the DOM
// reader and the click loop are validated by live QA.

// One campaign card as the rules see it. Built from the grid by
// candidatesFromGrid; tests build them by hand.
export type AutoAcceptCandidate = {
  campaignId: string | null;
  brand: string | null;
  commissionRatePct: number | null;
  remainingBudgetCents: number | null;
  endsAt: Date | null;
  // Creator slots claimed vs. cap, from the API fill capture (null = unknown).
  fillPct: number | null;
  fullyClaimed: boolean | null;
  // The card still shows Amazon's own Accept button (an accepted / pending /
  // declined card has none, and a card without one cannot be accepted anyway).
  hasAcceptButton: boolean;
  // Personal signals for the score. The grid overlay enriches these from order
  // history / the desktop ledger; the background pass has neither at hand and
  // leaves them null (neutral), which is documented on the options card.
  owned?: boolean | null;
  provenEarner?: boolean | null;
};

// The parts of the ledger the rules read: today's count (for the daily cap)
// and both id lists (today's items + the 30-day history) for the dedupe.
export type AutoAcceptLedgerLike = Pick<AcceptLedgerView, "count" | "items" | "history">;

// A pick with the score it was ranked by, so a caller can log / explain it.
export type AutoAcceptPick<T extends AutoAcceptCandidate> = { row: T; score: number };

// Pure: whole days until the card's end date (calendar days, local), or null
// when the card showed no end date.
export function candidateDaysRemaining(row: AutoAcceptCandidate, now: number): number | null {
  return row.endsAt ? daysUntil(row.endsAt, new Date(now)) : null;
}

// Pure: the rule-based selection. Keeps a card only when EVERY rule passes:
//   - it has a campaign id and still shows Amazon's Accept button;
//   - it is not fully claimed;
//   - its commission rate is known and >= rules.minCommissionPct;
//   - its end date is known and at least rules.excludeEndingWithinHours / 24
//     whole days away (an unknown end date is skipped, not waved through: this
//     pass clicks on the creator's behalf, so it is conservative);
//   - its Campaign Radar band (bandFor(computeCampaignScore)) is in rules.bands;
//   - its id is not in the ledger (today's items or the 30-day history).
// Then the survivors are sorted by score (best first, ties keep grid order) and
// cut to min(perRunCap, dailyCap - ledger.count), never below zero. The caps
// are re-clamped here so a hand-edited storage value cannot lift the ceiling.
export function evaluateAutoAccept<T extends AutoAcceptCandidate>(
  rows: T[],
  rules: AutoAcceptSettings,
  ledger: AutoAcceptLedgerLike,
  now: number,
): T[] {
  return rankAutoAccept(rows, rules, ledger, now).map((p) => p.row);
}

export function rankAutoAccept<T extends AutoAcceptCandidate>(
  rows: T[],
  rules: AutoAcceptSettings,
  ledger: AutoAcceptLedgerLike,
  now: number,
): Array<AutoAcceptPick<T>> {
  const minDays = Math.max(0, rules.excludeEndingWithinHours) / 24;
  const bands = new Set(rules.bands);
  const taken = new Set<string>([
    ...ledger.items.map((i) => i.campaignId),
    ...ledger.history.map((h) => h.campaignId),
  ]);

  const picks: Array<AutoAcceptPick<T>> = [];
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.campaignId;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (!row.hasAcceptButton) continue;
    if (row.fullyClaimed === true) continue;
    if (row.commissionRatePct === null || row.commissionRatePct < rules.minCommissionPct) continue;
    const days = candidateDaysRemaining(row, now);
    if (days === null || days < minDays) continue;
    const score = computeCampaignScore({
      commissionRatePct: row.commissionRatePct,
      daysRemaining: days,
      remainingBudgetCents: row.remainingBudgetCents,
      owned: row.owned ?? null,
      provenEarner: row.provenEarner ?? null,
      fillPct: row.fillPct,
      fullyClaimed: row.fullyClaimed,
    }).score;
    if (!bands.has(bandFor(score))) continue;
    if (taken.has(id)) continue;
    picks.push({ row, score });
  }

  // Stable sort: equal scores keep the grid's own order.
  const ranked = picks
    .map((p, i) => ({ p, i }))
    .sort((a, b) => b.p.score - a.p.score || a.i - b.i)
    .map(({ p }) => p);

  const dailyRoom = clampAutoAcceptDailyCap(rules.dailyCap) - Math.max(0, ledger.count);
  const cap = Math.max(0, Math.min(clampAutoAcceptPerRunCap(rules.perRunCap), dailyRoom));
  return ranked.slice(0, cap);
}

// Read the grid's cards into candidates. Fill data (slots / fully claimed) is
// API-only, so the content script's captured fill map is merged in first.
export function candidatesFromGrid(
  doc: Document,
  fills: Record<string, CampaignFill>,
): AutoAcceptCandidate[] {
  const campaigns = readCampaignGrid(doc);
  applyCampaignFills(campaigns, fills);
  return campaigns.map((c) => ({
    campaignId: c.campaignId,
    brand: c.brand,
    commissionRatePct: c.commissionRatePct,
    remainingBudgetCents: c.remainingBudgetCents,
    endsAt: c.endsAt,
    fillPct: campaignFillPct(c.slotsFilled, c.slotsTotal),
    fullyClaimed: c.fullyClaimed,
    hasAcceptButton: !!c.el.querySelector('[data-testid$="-campaign-card-accept-btn"]'),
    owned: null,
    provenEarner: null,
  }));
}

// ---- The in-tab run -----------------------------------------------------------

export type AutoAcceptRunResult = {
  accepted: AutoAcceptedItem[];
  stoppedReason: AutoAcceptStopReason | null;
};

// Every side effect is injectable so the loop can be exercised without a DOM.
export type AutoAcceptDeps = {
  readCandidates: () => AutoAcceptCandidate[];
  getLedger: () => Promise<AcceptLedgerView>;
  accept: (campaignId: string) => Promise<AcceptOutcome>;
  report: (message: RuntimeMessage) => Promise<unknown>;
  sleep: (ms: number) => Promise<void>;
  random: () => number;
  now: () => number;
};

// A run must report before the worker's tab dwell (AUTO_ACCEPT_TAB_DWELL_MS)
// closes the tab, or accepted campaigns would go unrecorded. Each accept can
// take up to ~27s (jitter + card find + confirm watch), so no new accept is
// started once this much of the dwell has elapsed.
export const AUTO_ACCEPT_RUN_BUDGET_MS = AUTO_ACCEPT_TAB_DWELL_MS - 30_000;

// Pure: a human-paced gap, uniformly jittered in [MIN, MAX].
export function jitterDelay(random: number): number {
  const span = AUTO_ACCEPT_DELAY_MAX_MS - AUTO_ACCEPT_DELAY_MIN_MS;
  return Math.round(AUTO_ACCEPT_DELAY_MIN_MS + Math.min(1, Math.max(0, random)) * span);
}

// Run one pass over the grid: pick by the rules, click each pick with a
// jittered pause before it, stop on the first accept that does not go through
// (a blocked page, an error toast, a card that never confirmed...), and post
// AUTO_ACCEPT_DONE. Returns the same payload for the message reply.
export async function runAutoAccept(
  settings: Settings,
  fills: Record<string, CampaignFill> = {},
  overrides: Partial<AutoAcceptDeps> = {},
): Promise<AutoAcceptRunResult> {
  const deps: AutoAcceptDeps = {
    readCandidates: () => candidatesFromGrid(document, fills),
    getLedger: () => sendToBackground<AcceptLedgerView>({ kind: "GET_ACCEPT_LEDGER" }),
    accept: runAcceptOnPage,
    report: (message) => sendToBackground(message),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    random: Math.random,
    now: Date.now,
    ...overrides,
  };

  const result = await runPass(settings, deps);
  await deps.report({ kind: "AUTO_ACCEPT_DONE", ...result }).catch((error) => {
    log("auto-accept", "AUTO_ACCEPT_DONE send failed", error);
  });
  return result;
}

async function runPass(settings: Settings, deps: AutoAcceptDeps): Promise<AutoAcceptRunResult> {
  const accepted: AutoAcceptedItem[] = [];
  const rules = settings.autoAccept;
  if (!rules.enabled || !settings.tools.autoAccept) {
    return { accepted, stoppedReason: "disabled" };
  }

  let ledger: AcceptLedgerView;
  try {
    ledger = await deps.getLedger();
  } catch (error) {
    log("auto-accept", "ledger read failed", error);
    return { accepted, stoppedReason: "error" };
  }
  const started = deps.now();
  if (ledger.cooldownUntil !== null && ledger.cooldownUntil > started) {
    return { accepted, stoppedReason: "cooldown" };
  }

  const picks = rankAutoAccept(deps.readCandidates(), rules, ledger, started);
  log("auto-accept", `${picks.length} campaign(s) match the rules`);
  if (picks.length === 0) return { accepted, stoppedReason: null };

  for (const pick of picks) {
    const id = pick.row.campaignId;
    if (!id) continue;
    if (deps.now() - started > AUTO_ACCEPT_RUN_BUDGET_MS) {
      return { accepted, stoppedReason: "timeout" };
    }
    await deps.sleep(jitterDelay(deps.random()));
    let outcome: AcceptOutcome;
    try {
      outcome = await deps.accept(id);
    } catch (error) {
      log("auto-accept", "accept threw", error);
      outcome = { ok: false, reason: "error" };
    }
    if (!outcome.ok) {
      log("auto-accept", `stopped on ${id}: ${outcome.reason}`);
      return { accepted, stoppedReason: outcome.reason };
    }
    accepted.push({ campaignId: id, brand: pick.row.brand });
  }
  return { accepted, stoppedReason: null };
}
