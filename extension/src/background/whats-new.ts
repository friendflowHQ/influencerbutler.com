import { ENDPOINTS, WHATS_NEW_STORAGE_KEY } from "../shared/constants";
import { getState } from "../storage/store";
import { compareVersions } from "./update";
import { log } from "../shared/log";

// Post-update "What's New" notice. Chrome applies extension updates silently, so
// once a new version is running we surface what changed: the curated highlights
// from the bundled changelog.json plus the user's own bug reports that have
// since been marked resolved ("issues you reported that we fixed"). It mirrors
// the desktop app's What's New toast.
//
// The whole thing hangs off one stored value, `lastShownVersion`. The notice
// shows while the running version is ahead of it; dismissing from either surface
// (the on-page corner card or the popup card) advances it to the running
// version, so both stop. Detection uses chrome.runtime.onInstalled's native
// `reason`/`previousVersion` rather than a stored-version diff: a fresh install
// records the current version (nothing to show), an update leaves the marker
// behind so the notice appears.

export type WhatsNewState = {
  // The version whose notes the user last saw (dismissed). null means an update
  // landed but no notice has been shown yet.
  lastShownVersion: string | null;
  // The version we upgraded from, recorded on the update event. Used as the
  // "since" boundary for resolved bug reports the first time we show a notice.
  previousVersion: string | null;
};

// One curated release entry in changelog.json (shape shared with the desktop
// app's docs/releases/changelog.json).
export type ChangelogSection = { heading: string; items: string[] };
export type ChangelogRelease = { version: string; date: string; sections: ChangelogSection[] };
export type Changelog = { lastUpdated?: string; releases: ChangelogRelease[] };

// One of the signed-in user's bug reports that has since been resolved.
export type ResolvedBug = { id: string; summary: string; resolvedVersion: string };

// What both surfaces render. Lists are uncapped: the corner card slices to a
// few top items, the popup shows them all. Empty arrays when there is nothing
// to show; the renderers skip a card with no content.
export type WhatsNewView = {
  show: boolean;
  version: string;
  date: string;
  features: string[];
  fixes: string[];
  other: string[];
  reportedBugs: ResolvedBug[];
};

const FEATURES_HEADING = "New Features";
const FIXES_HEADING = "Bug Fixes";
const OTHER_HEADING = "Other Notable Changes";

// --- Pure helpers (unit-tested without chrome/fetch) -----------------------

// Whether a notice is due for the running version given the stored marker.
export function computeShow(state: WhatsNewState | null, currentVersion: string): boolean {
  if (!state) return false; // no install/update recorded: nothing to announce
  if (state.lastShownVersion === null) {
    // An update landed and we have not shown anything yet.
    return state.previousVersion !== null;
  }
  return compareVersions(currentVersion, state.lastShownVersion) > 0;
}

// The version boundary for "issues you reported that we fixed": everything
// resolved after the version whose notes the user last saw.
export function resolvedSince(state: WhatsNewState | null, currentVersion: string): string {
  return state?.lastShownVersion ?? state?.previousVersion ?? currentVersion;
}

// Exact version match, falling back to the newest release, mirroring the
// desktop toast: a build shipped without its own changelog entry still shows
// the latest notes rather than nothing.
export function pickRelease(changelog: Changelog | null, version: string): ChangelogRelease | null {
  const releases = changelog?.releases;
  if (!releases || releases.length === 0) return null;
  return releases.find((r) => String(r.version) === version) ?? releases[0] ?? null;
}

// Items of a section, matched by case-insensitive heading. Uncapped by default;
// pass `max` to take only the top N (the corner card does this).
export function sectionItems(
  release: ChangelogRelease | null,
  heading: string,
  max?: number,
): string[] {
  if (!release) return [];
  const section = release.sections.find(
    (s) => s.heading.trim().toLowerCase() === heading.trim().toLowerCase(),
  );
  if (!section) return [];
  const items = section.items.filter((item) => typeof item === "string" && item.trim());
  return max === undefined ? items : items.slice(0, max);
}

// --- Storage ---------------------------------------------------------------

async function readState(): Promise<WhatsNewState | null> {
  try {
    const out = await chrome.storage.local.get(WHATS_NEW_STORAGE_KEY);
    const value = out?.[WHATS_NEW_STORAGE_KEY] as WhatsNewState | undefined;
    if (!value) return null;
    return {
      lastShownVersion: typeof value.lastShownVersion === "string" ? value.lastShownVersion : null,
      previousVersion: typeof value.previousVersion === "string" ? value.previousVersion : null,
    };
  } catch {
    return null;
  }
}

async function writeState(state: WhatsNewState): Promise<void> {
  try {
    await chrome.storage.local.set({ [WHATS_NEW_STORAGE_KEY]: state });
  } catch {
    // storage unavailable; the next event simply writes again
  }
}

// Called from the onInstalled listener. A fresh install records the running
// version so a brand-new user is not shown release notes for changes they never
// experienced; an update leaves the marker behind (keeping any prior
// lastShownVersion) so the notice appears for the new version.
export async function noteInstall(
  reason: chrome.runtime.OnInstalledReason | string,
  previousVersion: string | undefined,
): Promise<void> {
  const currentVersion = chrome.runtime.getManifest().version;
  if (reason === "install") {
    await writeState({ lastShownVersion: currentVersion, previousVersion: null });
    log("whatsnew", `fresh install at ${currentVersion}; nothing to announce`);
    return;
  }
  if (reason === "update") {
    const prev = await readState();
    await writeState({
      lastShownVersion: prev?.lastShownVersion ?? null,
      previousVersion: previousVersion ?? prev?.previousVersion ?? null,
    });
    log("whatsnew", `updated from ${previousVersion ?? "?"} -> ${currentVersion}`);
  }
}

// Dismiss from either surface: advance the marker to the running version so the
// notice stops showing everywhere.
export async function markWhatsNewSeen(): Promise<void> {
  const currentVersion = chrome.runtime.getManifest().version;
  await writeState({ lastShownVersion: currentVersion, previousVersion: null });
}

// --- Changelog + resolved-bugs sourcing ------------------------------------

let changelogCache: Changelog | null | undefined;

// changelog.json is copied into the build from static/, so the worker reads its
// own packaged file (no network, no host permission). Cached per worker
// lifetime; a null cache means we tried and failed and should not keep retrying.
async function loadChangelog(): Promise<Changelog | null> {
  if (changelogCache !== undefined) return changelogCache;
  try {
    const response = await fetch(chrome.runtime.getURL("changelog.json"));
    changelogCache = (await response.json()) as Changelog;
  } catch (error) {
    log("whatsnew", "failed to load changelog.json", error);
    changelogCache = null;
  }
  return changelogCache;
}

// The signed-in user's own resolved bug reports since the given version. Uses
// the same license Bearer as sendFeedback; returns [] when signed out or on any
// error (the notice still shows its changelog highlights).
export async function fetchResolvedFeedback(since: string): Promise<ResolvedBug[]> {
  const state = await getState();
  if (!state.auth.licenseKey) return [];
  try {
    const url = `${ENDPOINTS.feedbackResolved}?since=${encodeURIComponent(since)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${state.auth.licenseKey}` },
    });
    if (!response.ok) return [];
    const data = (await response.json().catch(() => ({}))) as { bugs?: unknown };
    if (!Array.isArray(data.bugs)) return [];
    return data.bugs
      .map((row): ResolvedBug | null => {
        const r = row as Record<string, unknown>;
        if (typeof r.id !== "string" || typeof r.summary !== "string") return null;
        return {
          id: r.id,
          summary: r.summary,
          resolvedVersion: typeof r.resolvedVersion === "string" ? r.resolvedVersion : "",
        };
      })
      .filter((b): b is ResolvedBug => b !== null);
  } catch {
    return [];
  }
}

// What both surfaces call. Assembles the changelog highlights for the running
// version plus (when a notice is due and the user is signed in) their resolved
// bug reports.
export async function getWhatsNewView(): Promise<WhatsNewView> {
  const currentVersion = chrome.runtime.getManifest().version;
  const state = await readState();
  const show = computeShow(state, currentVersion);

  const empty: WhatsNewView = {
    show,
    version: currentVersion,
    date: "",
    features: [],
    fixes: [],
    other: [],
    reportedBugs: [],
  };
  if (!show) return empty;

  const changelog = await loadChangelog();
  const release = pickRelease(changelog, currentVersion);
  const reportedBugs = await fetchResolvedFeedback(resolvedSince(state, currentVersion));

  return {
    show: true,
    version: currentVersion,
    date: release?.date ?? "",
    features: sectionItems(release, FEATURES_HEADING),
    fixes: sectionItems(release, FIXES_HEADING),
    other: sectionItems(release, OTHER_HEADING),
    reportedBugs,
  };
}
