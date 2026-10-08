/**
 * Summary: Shared constants for the Build Week event (idea pitches in the
 *   Facebook group, ten ideas built in one week, lifetime-access guarantee).
 *   Dates, the launch flag, the consent text stored with each entry, and the
 *   tag used for event emails live here so the page, the entry API and the
 *   tests agree. Safe to import from client and server code (no secrets).
 * Dependencies: ./social (FACEBOOK_GROUP_URL).
 */

import { FACEBOOK_GROUP_URL } from "@/lib/social";

export const BUILD_WEEK_SLUG = "build-week-2026-11";
export const BUILD_WEEK_TAG = "build-week";
export const BUILD_WEEK_SOURCE = "build-week";

/** Bump when the Official Rules change in a way entrants must re-accept. */
export const BUILD_WEEK_RULES_VERSION = "2026-10-08";
export const BUILD_WEEK_RULES_PATH = "/legal/build-week-rules";
export const BUILD_WEEK_PAGE_PATH = "/build-week";
export const BUILD_WEEK_GROUP_URL = FACEBOOK_GROUP_URL;

/** The exact wording the entrant agreed to; stored with the entry as the consent record. */
export const BUILD_WEEK_CONSENT_TEXT =
  "I have read and agree to the Build Week Official Rules and the Privacy Policy, and I confirm I am 18 or older.";
export const BUILD_WEEK_UPDATES_TEXT =
  "Email me Build Week updates (you can unsubscribe at any time).";

/**
 * Mountain Time. Daylight time ends Sun Nov 1, 2026, so October dates are UTC-6
 * and November dates are UTC-7. Keep these in step with the Official Rules page.
 */
export const BUILD_WEEK_DATES = {
  ideasOpen: "2026-10-12T00:00:00-06:00",
  ideasClose: "2026-10-28T23:59:00-06:00",
  votingClose: "2026-10-31T23:59:00-06:00",
  announce: "2026-11-01T12:00:00-07:00",
  buildStart: "2026-11-02T09:00:00-07:00",
  demoDay: "2026-11-06T17:00:00-07:00",
  buildDeadline: "2026-11-08T23:59:00-07:00",
  results: "2026-11-09T12:00:00-07:00",
} as const;

export type BuildWeekMilestone = {
  key: keyof typeof BUILD_WEEK_DATES;
  at: string;
};

/** Milestones in order, for the countdown (next one that has not passed yet). */
export const BUILD_WEEK_MILESTONES: readonly BuildWeekMilestone[] = [
  { key: "ideasOpen", at: BUILD_WEEK_DATES.ideasOpen },
  { key: "ideasClose", at: BUILD_WEEK_DATES.ideasClose },
  { key: "votingClose", at: BUILD_WEEK_DATES.votingClose },
  { key: "buildStart", at: BUILD_WEEK_DATES.buildStart },
  { key: "buildDeadline", at: BUILD_WEEK_DATES.buildDeadline },
];

/** The next milestone after `now`, or null when the event is over. */
export function nextMilestone(now: Date = new Date()): BuildWeekMilestone | null {
  for (const m of BUILD_WEEK_MILESTONES) {
    if (new Date(m.at).getTime() > now.getTime()) return m;
  }
  return null;
}

/**
 * Launch switch. The page and the entry API return 404 until this is "1", so a
 * pre-launch deploy never exposes the event. NEXT_PUBLIC_ so the footer link and
 * the page agree (inlined at build time: flip it, then redeploy).
 */
export function isBuildWeekEnabled(): boolean {
  return process.env.NEXT_PUBLIC_BUILD_WEEK_ENABLED === "1";
}
