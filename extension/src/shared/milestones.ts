// First-success moments: the first accepted campaign, the first send to the
// desktop app, and the first list save each get one short celebration and feed a
// small getting-started checklist in the popup. Pure helpers (no chrome, no DOM)
// so the rules are unit-testable; storage and the toast live elsewhere.

export const MILESTONES_KEY = "ib-milestones";

export type MilestoneId = "firstAccept" | "firstSend" | "firstList";

export const MILESTONE_IDS: readonly MilestoneId[] = ["firstAccept", "firstSend", "firstList"];

export type MilestonesState = {
  // Epoch ms the milestone was first reached.
  done: Partial<Record<MilestoneId, number>>;
  // The user closed the checklist.
  dismissed: boolean;
  // The state has been initialized (fresh install or first run of this feature).
  seeded: boolean;
  // Seeded from existing activity: this person is not new, so no checklist.
  existing: boolean;
};

export const DEFAULT_MILESTONES: MilestonesState = { done: {}, dismissed: false, seeded: false, existing: false };

// Never trust stored data: anything malformed falls back to the default.
export function sanitizeMilestones(raw: unknown): MilestonesState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_MILESTONES, done: {} };
  const r = raw as Record<string, unknown>;
  const done: Partial<Record<MilestoneId, number>> = {};
  const rawDone = r.done && typeof r.done === "object" ? (r.done as Record<string, unknown>) : {};
  for (const id of MILESTONE_IDS) {
    const at = rawDone[id];
    if (typeof at === "number" && Number.isFinite(at) && at > 0) done[id] = at;
  }
  return { done, dismissed: r.dismissed === true, seeded: r.seeded === true, existing: r.existing === true };
}

// Mark a milestone reached. `celebrate` is true only the first time.
export function applyMilestone(
  state: MilestonesState,
  id: MilestoneId,
  now: number,
): { state: MilestonesState; celebrate: boolean } {
  if (state.done[id]) return { state, celebrate: false };
  return { state: { ...state, done: { ...state.done, [id]: now } }, celebrate: true };
}

export type PriorActivity = Partial<Record<MilestoneId, boolean>>;

// Initialize the state once. A person who already did these things before this
// feature existed gets them marked done silently (no "first" toast for something
// they did months ago) and no checklist. A fresh install starts empty.
// `except` leaves one id unseeded: used when seeding lazily at the moment that
// milestone is being reached, so its own just-written activity does not erase
// the celebration.
export function seedMilestones(
  state: MilestonesState,
  prior: PriorActivity,
  now: number,
  except?: MilestoneId,
): MilestonesState {
  if (state.seeded) return state;
  const done = { ...state.done };
  let existing = false;
  for (const id of MILESTONE_IDS) {
    if (id === except) continue;
    if (prior[id] && !done[id]) {
      done[id] = now;
      existing = true;
    }
  }
  return { ...state, done, seeded: true, existing };
}

export type ChecklistId = "signedIn" | "paired" | MilestoneId;
export type ChecklistItem = { id: ChecklistId; done: boolean };

// On mobile (Android browsers) the desktop app cannot be paired, so the pairing and
// send steps are left out instead of being impossible.
export function checklistItems(
  state: MilestonesState,
  live: { signedIn: boolean; paired: boolean; mobile?: boolean },
): ChecklistItem[] {
  const items: ChecklistItem[] = [
    { id: "signedIn", done: live.signedIn },
    { id: "paired", done: live.paired },
    ...MILESTONE_IDS.map((id) => ({ id, done: !!state.done[id] })),
  ];
  return live.mobile ? items.filter((i) => i.id !== "paired" && i.id !== "firstSend") : items;
}

export function checklistComplete(items: readonly ChecklistItem[]): boolean {
  return items.every((i) => i.done);
}

// The getting-started card is for people who are new: hidden once dismissed,
// once everything is done, and for anyone who already had activity.
export function shouldShowChecklist(state: MilestonesState, items: readonly ChecklistItem[]): boolean {
  return state.seeded && !state.existing && !state.dismissed && !checklistComplete(items);
}
