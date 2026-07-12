// The Instagram Goldmine crawl engine. Full-parity port of the desktop app's
// crawlHashtags() (workspaces/instagram-goldmine/instagram-goldmine-runner.js),
// re-expressed against Instagram's own web JSON endpoints instead of Puppeteer
// DOM navigation. Runs inside a content script on instagram.com so every fetch
// is same-origin and carries the user's real session.
//
// Design notes vs the desktop runner:
//  - Tag sections embed each post's owner username, so most creators resolve
//    WITHOUT opening the individual post (a real speed win over the DOM crawl).
//  - web_profile_info returns bio + contact emails + follower count + a slice of
//    recent media in ONE call, so email, cap, and engagement come together.
//  - Bio-link following is cross-origin, so it goes through a background fetch
//    (injected as fetchBioLinkEmail) exactly like the Deal Sites Harvester.
//  - Block handling is detection-to-STOP: a rate-limit / challenge ends the run
//    cleanly rather than pushing through.

import {
  fetchHashtagFirstPage,
  fetchHashtagSection,
  fetchProfile,
  type IgOutcome,
  type IgPostNode,
} from "./endpoints";
import {
  computeEngagementRate,
  emailDedupeKey,
  exceedsFollowerCap,
  extractEmailsFromText,
  humanDelay,
  isWithinRecentDays,
  normalizeBioLinkUrl,
  normalizeHashtag,
  normalizeUsername,
} from "./helpers";

// A creator harvested less than this ago is skipped, unless the user turned on
// "recheck creators seen before". Matches the desktop's 14-day cooldown.
export const RECHECK_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

// Grid enumeration gives up after this many consecutive pages add nothing new.
const MAX_STABLE_PAGES = 3;

// Pager pacing (between hashtag section fetches) and the per-creator dwell
// before a profile read. The safe-mode toggle doubles both.
const PAGER_DELAY_MIN_MS = 1200;
const PAGER_DELAY_MAX_MS = 2600;
const PROFILE_DWELL_MIN_MS = 1500;
const PROFILE_DWELL_MAX_MS = 3800;

export type GoldmineSettings = {
  hashtags: string[];
  targetUniqueEmails: number; // stop after N emails; 0 = no email target
  recentDays: number; // only posts from last N days; 0 = any age
  maxPostsPerHashtag: number;
  maxFollowers: number; // skip creators over this; 0 = no cap
  reelsFirst: boolean;
  safeMode: boolean; // 2x human delays
  followBioLinks: boolean;
  harvestEngagement: boolean;
  ignoreRecheckCooldown: boolean; // "recheck creators seen before"
};

export type GoldmineRow = {
  username: string;
  fullName: string | null;
  email: string;
  sourceHashtag: string;
  followerCount: number | null;
  engagementRatePct: number | null;
  engagementBasis: "likes+comments" | "comments-only" | null;
  bioLinkUrl: string | null;
  postUrl: string | null;
};

export type GoldmineProgress = {
  hashtag: string;
  hashtagsDone: number;
  hashtagsTotal: number;
  postsScanned: number;
  profilesVisited: number;
  uniqueEmails: number;
  authorsOverCap: number;
  skippedRecheck: number;
};

export type GoldmineSummary = {
  stopped: "done" | "target" | "abort" | "blocked";
  blockedReason?: string;
  postsScanned: number;
  profilesVisited: number;
  uniqueEmails: number;
  authorsOverCap: number;
  skippedRecheck: number;
};

export type RunGoldmineOptions = {
  settings: GoldmineSettings;
  // Persistent per-creator recheck cache: username -> last-harvested epoch ms.
  // The caller loads it from chrome.storage before the run and saves it after;
  // the engine mutates it in place as creators are harvested.
  cache: Map<string, number>;
  now?: number;
  onRow: (row: GoldmineRow) => void;
  onProgress: (progress: GoldmineProgress) => void;
  shouldAbort: () => boolean;
  // Cross-origin bio-link email harvest, routed through the background worker
  // (content scripts cannot fetch third-party sites). Returns the first email
  // found on the linked site, or null.
  fetchBioLinkEmail?: (url: string) => Promise<string | null>;
};

export async function runGoldmine(opts: RunGoldmineOptions): Promise<GoldmineSummary> {
  const { settings, cache, onRow, onProgress, shouldAbort } = opts;
  const now = opts.now ?? Date.now();
  const mult = settings.safeMode ? 2 : 1;

  const tags = uniqueTags(settings.hashtags);
  const visitedAuthors = new Set<string>();
  const seenEmailKeys = new Set<string>();

  const counters = {
    postsScanned: 0,
    profilesVisited: 0,
    uniqueEmails: 0,
    authorsOverCap: 0,
    skippedRecheck: 0,
  };

  const emit = (hashtag: string, hashtagsDone: number): void =>
    onProgress({ hashtag, hashtagsDone, hashtagsTotal: tags.length, ...counters });

  const targetReached = (): boolean =>
    settings.targetUniqueEmails > 0 && counters.uniqueEmails >= settings.targetUniqueEmails;

  const finish = (stopped: GoldmineSummary["stopped"], blockedReason?: string): GoldmineSummary => ({
    stopped,
    ...(blockedReason ? { blockedReason } : {}),
    ...counters,
  });

  for (let t = 0; t < tags.length; t++) {
    const tag = tags[t]!;
    if (shouldAbort()) return finish("abort");
    if (targetReached()) return finish("target");
    emit(tag, t);

    const enumerated = await enumerateHashtag(tag, settings, mult, shouldAbort);
    if (enumerated.blocked) return finish("blocked", enumerated.blocked);

    let nodes = enumerated.nodes;
    if (settings.reelsFirst) {
      nodes = [...nodes].sort((a, b) => Number(b.isReel) - Number(a.isReel));
    }

    for (const node of nodes) {
      if (shouldAbort()) return finish("abort");
      if (targetReached()) return finish("target");

      counters.postsScanned++;

      const author = node.ownerUsername ? normalizeUsername(node.ownerUsername) : "";
      if (!author) continue;

      // Recency: skip posts older than the window (unknown dates are kept).
      if (!isWithinRecentDays(node.takenAt, settings.recentDays, now)) continue;

      // One attempt per creator per run, regardless of how many of their posts
      // appear under the tag.
      if (visitedAuthors.has(author)) continue;
      visitedAuthors.add(author);

      // Cross-run recheck cooldown.
      if (!settings.ignoreRecheckCooldown) {
        const last = cache.get(author);
        if (typeof last === "number" && now - last < RECHECK_COOLDOWN_MS) {
          counters.skippedRecheck++;
          continue;
        }
      }

      // Human dwell before reading a fresh creator's profile.
      await humanDelay(PROFILE_DWELL_MIN_MS, PROFILE_DWELL_MAX_MS, mult);
      if (shouldAbort()) return finish("abort");

      const profileRes = await fetchProfile(author);
      if (!profileRes.ok) {
        if (profileRes.blocked) return finish("blocked", profileRes.blocked);
        continue; // not found / transient: move on
      }
      counters.profilesVisited++;
      const profile = profileRes.data;

      // Follower cap: drop over-cap creators entirely (no row, no cache write,
      // so a later higher-cap run revisits them).
      if (exceedsFollowerCap(profile.followerCount, settings.maxFollowers)) {
        counters.authorsOverCap++;
        emit(tag, t);
        continue;
      }

      const emails = new Set<string>();
      if (profile.publicEmail) emails.add(profile.publicEmail.toLowerCase());
      if (profile.businessEmail) emails.add(profile.businessEmail.toLowerCase());
      for (const found of extractEmailsFromText(profile.biography)) emails.add(found);

      let bioLinkUrl: string | null = null;
      if (emails.size === 0 && settings.followBioLinks && opts.fetchBioLinkEmail) {
        const target = normalizeBioLinkUrl(profile.bioLinks[0] ?? "");
        if (target) {
          bioLinkUrl = target;
          try {
            const linkedEmail = await opts.fetchBioLinkEmail(target);
            if (linkedEmail) emails.add(linkedEmail.toLowerCase());
          } catch {
            // bio-link fetch is best-effort
          }
        }
      }

      if (emails.size === 0) {
        emit(tag, t);
        continue;
      }

      const engagement = settings.harvestEngagement
        ? computeEngagementRate({
            samples: profile.recentMedia,
            followerCount: profile.followerCount ?? 0,
          })
        : null;

      let harvestedForThisAuthor = false;
      for (const email of emails) {
        const key = emailDedupeKey(author, email);
        if (seenEmailKeys.has(key)) continue;
        seenEmailKeys.add(key);
        onRow({
          username: author,
          fullName: profile.fullName,
          email,
          sourceHashtag: tag,
          followerCount: profile.followerCount,
          engagementRatePct: engagement?.engagementRate ?? null,
          engagementBasis: engagement?.engagementBasis ?? null,
          bioLinkUrl,
          postUrl: node.postUrl,
        });
        counters.uniqueEmails++;
        harvestedForThisAuthor = true;
        emit(tag, t);
        if (targetReached()) {
          if (harvestedForThisAuthor) cache.set(author, now);
          return finish("target");
        }
      }
      if (harvestedForThisAuthor) cache.set(author, now);
    }

    emit(tag, t + 1);
  }

  return finish(targetReached() ? "target" : "done");
}

// Page through a hashtag's recent grid, accumulating deduped post nodes up to
// maxPostsPerHashtag. Stops on: enough posts, no-more-available, MAX_STABLE
// empty pages, abort, or a block (surfaced so the whole run can stop).
async function enumerateHashtag(
  tag: string,
  settings: GoldmineSettings,
  mult: number,
  shouldAbort: () => boolean,
): Promise<{ nodes: IgPostNode[]; blocked?: string }> {
  const nodes: IgPostNode[] = [];
  const seenCodes = new Set<string>();
  const cap = Math.max(1, settings.maxPostsPerHashtag || 200);

  const absorb = (page: { nodes: IgPostNode[] }): number => {
    let added = 0;
    for (const node of page.nodes) {
      if (nodes.length >= cap) break;
      if (seenCodes.has(node.shortcode)) continue;
      seenCodes.add(node.shortcode);
      nodes.push(node);
      added++;
    }
    return added;
  };

  const first: IgOutcome<{ nodes: IgPostNode[]; nextMaxId: string | null; moreAvailable: boolean }> =
    await fetchHashtagFirstPage(tag);
  if (!first.ok) return { nodes, blocked: first.blocked };
  absorb(first.data);
  let maxId = first.data.nextMaxId;
  let moreAvailable = first.data.moreAvailable;

  let stable = 0;
  let page = 1;
  while (nodes.length < cap && moreAvailable && maxId && !shouldAbort()) {
    await humanDelay(PAGER_DELAY_MIN_MS, PAGER_DELAY_MAX_MS, mult);
    page++;
    const res = await fetchHashtagSection(tag, maxId, page);
    if (!res.ok) {
      if (res.blocked) return { nodes, blocked: res.blocked };
      break; // transient pager error: use what we have
    }
    const added = absorb(res.data);
    maxId = res.data.nextMaxId;
    moreAvailable = res.data.moreAvailable;
    if (added === 0) {
      stable++;
      if (stable >= MAX_STABLE_PAGES) break;
    } else {
      stable = 0;
    }
  }

  return { nodes };
}

function uniqueTags(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw ?? []) {
    const tag = normalizeHashtag(item);
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}
