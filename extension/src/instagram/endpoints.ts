// Instagram web JSON endpoints, called SAME-ORIGIN from a content script
// running on instagram.com so the user's own session cookies ride along and the
// requests are indistinguishable from the Instagram web client's own XHRs.
// There is no Puppeteer and no stealth here: it is genuinely the user's Chrome
// and their real login. This is the primary data path for the Goldmine crawl;
// selectors.ts is the DOM last-resort when a JSON shape changes.
//
// These private endpoints ARE the brittle part (Instagram rotates shapes and
// query surfaces). Shapes verified against the live web client 2026-07-12; when
// they drift, update the parsers here and the DOM fallbacks in selectors.ts.
// Every response is checked for a block/redirect (401/429, /accounts/login,
// /challenge/) so the crawl can detection-to-stop rather than hammer.

import { blockReasonForUrl, looksBlockedByText } from "./selectors";
import { normalizeUsername } from "./helpers";

// The web app id the Instagram client sends on its private API calls. Public,
// stable, and the same value the site ships in its own JS.
const IG_APP_ID = "936619743392459";
const IG_ORIGIN = "https://www.instagram.com";

export type IgPostNode = {
  shortcode: string;
  ownerUsername: string | null;
  ownerId: string | null;
  takenAt: number | null; // unix seconds
  isReel: boolean;
  postUrl: string;
};

export type IgProfileMedia = {
  likeCount: number | null; // null when Instagram hides likes on the account
  commentCount: number | null;
  takenAt: number | null;
};

export type IgProfile = {
  username: string;
  fullName: string | null;
  biography: string;
  publicEmail: string | null;
  businessEmail: string | null;
  followerCount: number | null;
  externalUrl: string | null;
  bioLinks: string[];
  recentMedia: IgProfileMedia[];
};

export type IgHashtagPage = {
  nodes: IgPostNode[];
  nextMaxId: string | null;
  moreAvailable: boolean;
};

export type IgOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; blocked?: string; status?: number; error: string };

// csrftoken must be echoed as a header on the tag-section POST. It lives in a
// first-party cookie the logged-in web client sets; read it from document.cookie.
function csrfToken(): string {
  try {
    const match = document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/);
    return match ? decodeURIComponent(match[1]!) : "";
  } catch {
    return "";
  }
}

function igHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "x-ig-app-id": IG_APP_ID,
    "x-requested-with": "XMLHttpRequest",
    "x-asbd-id": "129477",
  };
  const token = csrfToken();
  if (token) headers["x-csrftoken"] = token;
  return { ...headers, ...(extra ?? {}) };
}

// Read a JSON response, folding block/redirect detection into the outcome so
// every caller stops cleanly on a rate-limit or challenge.
async function readJson<T>(res: Response): Promise<IgOutcome<T>> {
  const blockedByUrl = blockReasonForUrl(res.url);
  if (blockedByUrl) return { ok: false, blocked: blockedByUrl, status: res.status, error: blockedByUrl };
  if (res.status === 401 || res.status === 403) {
    return { ok: false, blocked: "login-required", status: res.status, error: "Not authorized" };
  }
  if (res.status === 429) {
    return { ok: false, blocked: "rate-limited", status: res.status, error: "Rate limited" };
  }
  const text = await res.text();
  if (looksBlockedByText(text)) {
    return { ok: false, blocked: "rate-limited", status: res.status, error: "Rate limited" };
  }
  if (!res.ok) return { ok: false, status: res.status, error: `HTTP ${res.status}` };
  try {
    return { ok: true, data: JSON.parse(text) as T };
  } catch {
    // A JSON endpoint returning HTML is Instagram serving a login/challenge wall.
    return { ok: false, blocked: "login-required", error: "Non-JSON response" };
  }
}

function igFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    credentials: "include",
    headers: igHeaders(init?.headers as Record<string, string> | undefined),
    ...init,
  });
}

// One raw media item from a tag section or profile grid, normalized. Instagram
// wraps items as `{ media: {...} }` in tag sections and as bare nodes elsewhere.
function normalizeMedia(raw: unknown): IgPostNode | null {
  const media = ((raw as { media?: unknown })?.media ?? raw) as Record<string, unknown>;
  if (!media || typeof media !== "object") return null;
  const shortcode = typeof media.code === "string" ? media.code : "";
  if (!shortcode) return null;
  const user = (media.user ?? {}) as Record<string, unknown>;
  const ownerUsername =
    typeof user.username === "string" ? normalizeUsername(user.username) : null;
  const ownerId =
    user.pk != null ? String(user.pk) : media.owner ? String((media.owner as { id?: unknown }).id ?? "") : null;
  const takenAt = typeof media.taken_at === "number" ? media.taken_at : null;
  const productType = typeof media.product_type === "string" ? media.product_type : "";
  const mediaType = Number(media.media_type);
  const isReel = productType === "clips" || productType === "igtv" || mediaType === 2;
  return {
    shortcode,
    ownerUsername: ownerUsername || null,
    ownerId: ownerId || null,
    takenAt,
    isReel,
    postUrl: `${IG_ORIGIN}/${isReel ? "reel" : "p"}/${shortcode}/`,
  };
}

function collectSectionMedias(sections: unknown): IgPostNode[] {
  const out: IgPostNode[] = [];
  if (!Array.isArray(sections)) return out;
  for (const section of sections) {
    const medias = (section as { layout_content?: { medias?: unknown } })?.layout_content?.medias;
    if (!Array.isArray(medias)) continue;
    for (const item of medias) {
      const node = normalizeMedia(item);
      if (node) out.push(node);
    }
  }
  return out;
}

// First page of a hashtag's recent grid via the tag web_info endpoint.
export async function fetchHashtagFirstPage(tag: string): Promise<IgOutcome<IgHashtagPage>> {
  const url = `${IG_ORIGIN}/api/v1/tags/web_info/?tag_name=${encodeURIComponent(tag)}`;
  let res: Response;
  try {
    res = await igFetch(url);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  const parsed = await readJson<Record<string, unknown>>(res);
  if (!parsed.ok) return parsed;
  const root = (parsed.data.data ?? parsed.data) as Record<string, unknown>;
  const recent = (root.recent ?? {}) as Record<string, unknown>;
  const nodes = collectSectionMedias(recent.sections);
  return {
    ok: true,
    data: {
      nodes,
      nextMaxId: typeof recent.next_max_id === "string" ? recent.next_max_id : null,
      moreAvailable: recent.more_available === true,
    },
  };
}

// Subsequent pages of the recent grid. Instagram paginates the tag grid through
// a POST to the sections endpoint keyed on the previous page's next_max_id.
export async function fetchHashtagSection(
  tag: string,
  maxId: string,
  page: number,
): Promise<IgOutcome<IgHashtagPage>> {
  const url = `${IG_ORIGIN}/api/v1/tags/${encodeURIComponent(tag)}/sections/`;
  const body = new URLSearchParams({
    include_persistent: "0",
    max_id: maxId,
    page: String(page),
    surface: "grid",
    tab: "recent",
  });
  let res: Response;
  try {
    res = await igFetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  const parsed = await readJson<Record<string, unknown>>(res);
  if (!parsed.ok) return parsed;
  const root = parsed.data;
  return {
    ok: true,
    data: {
      nodes: collectSectionMedias(root.sections),
      nextMaxId: typeof root.next_max_id === "string" ? root.next_max_id : null,
      moreAvailable: root.more_available === true,
    },
  };
}

// A creator's public profile: bio, contact emails, follower count, external
// link(s), and a slice of recent media for the engagement-rate sample. One call
// resolves everything the crawl needs about a creator (no per-post navigation).
export async function fetchProfile(username: string): Promise<IgOutcome<IgProfile>> {
  const clean = normalizeUsername(username);
  if (!clean) return { ok: false, error: "Empty username" };
  const url = `${IG_ORIGIN}/api/v1/users/web_profile_info/?username=${encodeURIComponent(clean)}`;
  let res: Response;
  try {
    res = await igFetch(url);
  } catch (error) {
    return { ok: false, error: message(error) };
  }
  if (res.status === 404) return { ok: false, status: 404, error: "Profile not found" };
  const parsed = await readJson<{ data?: { user?: Record<string, unknown> } }>(res);
  if (!parsed.ok) return parsed;
  const user = parsed.data?.data?.user;
  if (!user) return { ok: false, error: "No user in response" };
  return { ok: true, data: normalizeProfile(clean, user) };
}

function normalizeProfile(username: string, user: Record<string, unknown>): IgProfile {
  const followerCount =
    typeof (user.edge_followed_by as { count?: unknown })?.count === "number"
      ? ((user.edge_followed_by as { count: number }).count)
      : null;

  const bioLinks: string[] = [];
  if (Array.isArray(user.bio_links)) {
    for (const link of user.bio_links) {
      const u = (link as { url?: unknown })?.url;
      if (typeof u === "string" && u) bioLinks.push(u);
    }
  }
  const externalUrl = typeof user.external_url === "string" ? user.external_url : null;
  if (externalUrl && !bioLinks.includes(externalUrl)) bioLinks.unshift(externalUrl);

  const recentMedia: IgProfileMedia[] = [];
  const edges = (user.edge_owner_to_timeline_media as { edges?: unknown })?.edges;
  if (Array.isArray(edges)) {
    for (const edge of edges) {
      const node = (edge as { node?: Record<string, unknown> })?.node;
      if (!node) continue;
      const likesDisabled = node.like_and_view_counts_disabled === true;
      const likeRaw = (node.edge_liked_by as { count?: unknown })?.count;
      const likeCount =
        likesDisabled || typeof likeRaw !== "number" || likeRaw < 0 ? null : likeRaw;
      const commentRaw = (node.edge_media_to_comment as { count?: unknown })?.count;
      const commentCount = typeof commentRaw === "number" && commentRaw >= 0 ? commentRaw : null;
      const takenAt = typeof node.taken_at_timestamp === "number" ? node.taken_at_timestamp : null;
      recentMedia.push({ likeCount, commentCount, takenAt });
    }
  }

  return {
    username,
    fullName: typeof user.full_name === "string" ? user.full_name : null,
    biography: typeof user.biography === "string" ? user.biography : "",
    publicEmail: typeof user.public_email === "string" && user.public_email ? user.public_email : null,
    businessEmail:
      typeof user.business_email === "string" && user.business_email ? user.business_email : null,
    followerCount,
    externalUrl,
    bioLinks,
    recentMedia,
  };
}

function message(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError") return "Timed out";
  return error instanceof Error ? error.message : "Fetch failed";
}
