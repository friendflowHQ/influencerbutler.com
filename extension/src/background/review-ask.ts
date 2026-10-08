import {
  REVIEW_ASK_MAX_ASKS,
  REVIEW_ASK_MIN_ACTIVE_DAYS,
  REVIEW_ASK_MIN_AGE_MS,
  REVIEW_ASK_SNOOZE_MS,
  REVIEW_ASK_STORAGE_KEY,
} from "../shared/constants";
import { getState } from "../storage/store";

// "Is this saving you time?" review ask. The popup shows one passive card once an
// install has had time to prove itself (enough days since first use AND enough
// distinct active days). A happy answer sends the user to the Chrome Web Store
// reviews tab; an unhappy one goes to Feedback Butler instead. The card never
// mentions a reward: an incentivized store review would violate Chrome Web Store
// policy, so this is deliberately separate from the feedback-survey discount in
// the review email drip.
//
// State is one small object under its own storage key (no schema bump, like the
// What's New notice). All decisions are pure functions over that object so they
// can be unit-tested without chrome.

export type ReviewAskState = {
  // Distinct local calendar days the extension ran on a retailer page.
  activeDays: number;
  // The last local day counted, as YYYY-MM-DD, so a day is only counted once.
  lastActiveDay: string | null;
  // How many times the user has answered "Not now".
  asks: number;
  // The card stays hidden until this time (epoch ms) after a "Not now".
  snoozedUntil: number | null;
  // Permanently done: reviewed, gave feedback instead, or asked us to stop.
  closed: boolean;
};

export type ReviewAskAnswer = "yes" | "no" | "later" | "never";

export const DEFAULT_REVIEW_ASK_STATE: ReviewAskState = {
  activeDays: 0,
  lastActiveDay: null,
  asks: 0,
  snoozedUntil: null,
  closed: false,
};

// --- Pure helpers (unit-tested without chrome) -----------------------------

// Local calendar day key, so "active days" matches the user's own days.
export function dayKey(now: number): string {
  const d = new Date(now);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

// Coerce an untrusted stored value into a valid state. Anything malformed falls
// back to the default for that field.
export function normalizeReviewAsk(raw: unknown): ReviewAskState {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const num = (v: unknown, fallback: number): number =>
    typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
  return {
    activeDays: num(o.activeDays, 0),
    lastActiveDay: typeof o.lastActiveDay === "string" ? o.lastActiveDay : null,
    asks: num(o.asks, 0),
    snoozedUntil:
      typeof o.snoozedUntil === "number" && Number.isFinite(o.snoozedUntil) ? o.snoozedUntil : null,
    closed: o.closed === true,
  };
}

// Counts today as an active day (once per local day). Returns the same object
// when nothing changed so callers can skip the write.
export function withActiveDay(state: ReviewAskState, now: number): ReviewAskState {
  const today = dayKey(now);
  if (state.lastActiveDay === today) return state;
  return { ...state, activeDays: state.activeDays + 1, lastActiveDay: today };
}

// Whether the card is due: not closed, under the ask cap, past the snooze, and
// the install is both old enough and active enough.
export function isReviewAskDue(
  state: ReviewAskState,
  firstUseAt: number | null,
  now: number,
): boolean {
  if (state.closed || state.asks >= REVIEW_ASK_MAX_ASKS) return false;
  if (firstUseAt === null || now - firstUseAt < REVIEW_ASK_MIN_AGE_MS) return false;
  if (state.activeDays < REVIEW_ASK_MIN_ACTIVE_DAYS) return false;
  if (state.snoozedUntil !== null && now < state.snoozedUntil) return false;
  return true;
}

// Applies the user's answer. "yes" (went to review), "no" (went to feedback) and
// "never" close the card for good; "later" snoozes it and closes it once the ask
// cap is reached.
export function applyAnswer(
  state: ReviewAskState,
  answer: ReviewAskAnswer,
  now: number,
): ReviewAskState {
  if (answer !== "later") return { ...state, closed: true };
  const asks = state.asks + 1;
  return {
    ...state,
    asks,
    snoozedUntil: now + REVIEW_ASK_SNOOZE_MS,
    closed: asks >= REVIEW_ASK_MAX_ASKS,
  };
}

// --- Storage + handlers -----------------------------------------------------

async function readState(): Promise<ReviewAskState> {
  try {
    const out = await chrome.storage.local.get(REVIEW_ASK_STORAGE_KEY);
    return normalizeReviewAsk(out?.[REVIEW_ASK_STORAGE_KEY]);
  } catch {
    return { ...DEFAULT_REVIEW_ASK_STATE };
  }
}

async function writeState(state: ReviewAskState): Promise<void> {
  try {
    await chrome.storage.local.set({ [REVIEW_ASK_STORAGE_KEY]: state });
  } catch {
    // storage unavailable; the next event simply writes again
  }
}

// Called once per retailer page load (via NOTE_ACTIVE_DAY). Writes at most once
// per local day.
export async function noteActiveDay(now: number = Date.now()): Promise<void> {
  const state = await readState();
  const next = withActiveDay(state, now);
  if (next !== state) await writeState(next);
}

export async function isReviewAskCardDue(now: number = Date.now()): Promise<boolean> {
  const [state, app] = await Promise.all([readState(), getState()]);
  return isReviewAskDue(state, app.firstUseAt, now);
}

export async function answerReviewAsk(
  answer: ReviewAskAnswer,
  now: number = Date.now(),
): Promise<void> {
  await writeState(applyAnswer(await readState(), answer, now));
}
