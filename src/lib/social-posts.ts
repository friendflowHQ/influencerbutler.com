/**
 * social-posts.ts - shared validation + normalization for scheduled_social_posts,
 * the backend queue behind the extension's "click an image, schedule a post"
 * flow. Used by the create route (POST /api/extension/social-posts) and the edit
 * route (PATCH .../[id]).
 *
 * The cadence shapes mirror the desktop Social Posting Butler's library model so
 * the desktop poller can map a row straight across:
 *   - mode 'once'     : fires once at scheduled_at (ISO string).
 *   - mode 'evergreen': recurs per `schedule`, either an interval ("every N
 *                       hours") or weekly (certain weekdays at a time of day).
 */
export const SOCIAL_CAPTION_MAX = 5000;
export const SOCIAL_LINK_MAX = 500;
export const SOCIAL_TITLE_MAX = 200;
export const SOCIAL_URL_MAX = 1000;
export const SOCIAL_FIRST_COMMENT_MAX = 5000;
export const SOCIAL_MAX_DESTINATIONS = 20;
export const SOCIAL_DESTINATION_MAX_LEN = 60;
// A destination/platform key: lowercase letters, digits, dash, underscore, dot.
const DESTINATION_RE = /^[a-z0-9._-]{1,60}$/;

export type SocialImageSource = "url" | "upload" | "none";
export type SocialMode = "once" | "evergreen";
export type SocialStatus = "pending" | "claimed" | "posted" | "canceled" | "failed";

export type SocialSchedule =
  | { type: "interval"; everyHours: number; anchorAt?: string }
  | { type: "weekly"; days: number[]; hour: number; minute: number };

/** The validated, DB-ready fields of a scheduled post (no user_id / timestamps). */
export type SocialPostFields = {
  title: string | null;
  caption: string | null;
  link: string | null;
  link_in_first_comment: boolean;
  first_comment_text: string | null;
  image_source: SocialImageSource;
  image_url: string | null;
  image_path: string | null;
  destinations: string[] | null;
  mode: SocialMode;
  scheduled_at: string | null;
  schedule: SocialSchedule | null;
  page_url: string | null;
};

export type SocialPostValidation =
  | { ok: true; fields: SocialPostFields }
  | { ok: false; error: string };

function str(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function intIn(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.round(value);
  if (n < min || n > max) return null;
  return n;
}

function normalizeDestinations(value: unknown): string[] | null {
  // Absent / null means "use the creator's enabled destinations" on the desktop.
  if (value == null) return null;
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const raw of value) {
    if (typeof raw !== "string") continue;
    const key = raw.trim().toLowerCase();
    if (DESTINATION_RE.test(key) && !out.includes(key)) out.push(key);
    if (out.length >= SOCIAL_MAX_DESTINATIONS) break;
  }
  // An explicit empty list also means "use enabled destinations": store null.
  return out.length ? out : null;
}

function isoOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

/** Validate an evergreen cadence blob. Returns null if the shape is invalid. */
export function normalizeSchedule(value: unknown): SocialSchedule | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (o.type === "interval") {
    const everyHours = intIn(o.everyHours, 1, 24 * 90); // 1 hour to 90 days
    if (everyHours == null) return null;
    const anchorAt = isoOrNull(o.anchorAt);
    return anchorAt ? { type: "interval", everyHours, anchorAt } : { type: "interval", everyHours };
  }
  if (o.type === "weekly") {
    if (!Array.isArray(o.days)) return null;
    const days: number[] = [];
    for (const d of o.days) {
      const n = intIn(d, 0, 6);
      if (n != null && !days.includes(n)) days.push(n);
    }
    if (days.length === 0) return null;
    const hour = intIn(o.hour, 0, 23);
    const minute = intIn(o.minute, 0, 59);
    if (hour == null || minute == null) return null;
    return { type: "weekly", days: days.sort((a, b) => a - b), hour, minute };
  }
  return null;
}

/**
 * Validate a raw create/edit payload into DB-ready fields. Enforces: a real
 * image source, a valid schedule for the chosen mode, and length caps. Returns
 * { ok: false, error } with a short reason on any invalid input.
 */
export function validateSocialPost(body: unknown): SocialPostValidation {
  const o = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  const imageSourceRaw = typeof o.image_source === "string" ? o.image_source : "url";
  const image_source: SocialImageSource =
    imageSourceRaw === "upload" || imageSourceRaw === "none" ? imageSourceRaw : "url";

  const image_url = str(o.image_url, SOCIAL_URL_MAX);
  const image_path = str(o.image_path, SOCIAL_URL_MAX);
  if (image_source === "url" && !image_url) {
    return { ok: false, error: "image_url is required when image_source is 'url'" };
  }
  if (image_source === "upload" && !image_path) {
    return { ok: false, error: "image_path is required when image_source is 'upload'" };
  }

  const caption = str(o.caption, SOCIAL_CAPTION_MAX);
  // A post needs something to publish: a caption or an image.
  if (!caption && image_source === "none") {
    return { ok: false, error: "A post needs a caption or an image" };
  }

  const modeRaw = typeof o.mode === "string" ? o.mode : "once";
  const mode: SocialMode = modeRaw === "evergreen" ? "evergreen" : "once";

  let scheduled_at: string | null = null;
  let schedule: SocialSchedule | null = null;
  if (mode === "once") {
    scheduled_at = isoOrNull(o.scheduled_at);
    if (!scheduled_at) {
      return { ok: false, error: "scheduled_at is required and must be a valid date for a one-time post" };
    }
  } else {
    schedule = normalizeSchedule(o.schedule);
    if (!schedule) {
      return { ok: false, error: "A valid evergreen schedule (interval or weekly) is required" };
    }
  }

  return {
    ok: true,
    fields: {
      title: str(o.title, SOCIAL_TITLE_MAX),
      caption,
      link: str(o.link, SOCIAL_LINK_MAX),
      link_in_first_comment: o.link_in_first_comment === true,
      first_comment_text: str(o.first_comment_text, SOCIAL_FIRST_COMMENT_MAX),
      image_source,
      image_url,
      image_path,
      destinations: normalizeDestinations(o.destinations),
      mode,
      scheduled_at,
      schedule,
      page_url: str(o.page_url, SOCIAL_URL_MAX),
    },
  };
}

/** The columns the extension / dashboard read back (no internal-only fields). */
export const SOCIAL_POST_SELECT =
  "id, title, caption, link, link_in_first_comment, first_comment_text, image_source, image_url, image_path, destinations, mode, scheduled_at, schedule, status, claimed_at, posted_at, error, source, page_url, created_at, updated_at";
