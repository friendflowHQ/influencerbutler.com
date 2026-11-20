/**
 * Shared pieces of the Butler AI website chat UIs (the signed-in dashboard bubble
 * and the public visitor widget): reply types, the validators that decide what a
 * server reply is allowed to render, and the link-safe rich text renderer.
 */

export type Role = "you" | "butler";
export type ReplyImage = { url: string; alt: string };
export type ReplyVideo = { title: string; url: string };
export type ReplyCallType = { key: string; label: string; userMinutes: number; requiresSubscription: boolean; description: string };
export type ReplySource = { title: string; url: string };
export type Rating = "up" | "down";
export type Entry = {
  id: number;
  role: Role;
  text: string;
  images?: ReplyImage[];
  video?: ReplyVideo;
  callTypes?: ReplyCallType[];
  sources?: ReplySource[];
  rating?: Rating;
};
export type Extras = Pick<Entry, "images" | "video" | "callTypes" | "sources">;

// Links the assistant writes (markdown or bare) only become clickable when they
// point at our own site or YouTube; anything else stays plain text.
const LINK_HOSTS = new Set([
  "influencerbutler.com",
  "www.influencerbutler.com",
  "youtube.com",
  "www.youtube.com",
  "youtu.be",
]);
const LINK_RE = /\[([^\]]+)\]\(([^\s)]+)\)|(https?:\/\/[^\s)<>]+)/g;
export const FEEDBACK_REASONS = ["Wrong answer", "Didn't answer my question", "Out of date"];

export function safeHref(raw: string): string | null {
  if (raw.startsWith("/") && !raw.startsWith("//")) return raw;
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" || !LINK_HOSTS.has(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function renderRichText(text: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const m of text.matchAll(LINK_RE)) {
    const at = m.index ?? 0;
    const label = m[1] ?? m[3];
    const href = safeHref(m[2] ?? m[3]);
    if (at > last) out.push(text.slice(last, at));
    if (href) {
      out.push(
        <a
          key={key++}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-orange-700 underline hover:text-orange-800"
        >
          {label}
        </a>,
      );
    } else {
      out.push(m[0]);
    }
    last = at + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function safeVideo(raw: unknown): ReplyVideo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const v = raw as Record<string, unknown>;
  if (typeof v.url !== "string" || !v.url.startsWith("https://www.youtube.com/")) return undefined;
  return { url: v.url, title: typeof v.title === "string" ? v.title.slice(0, 120) : "Watch the tutorial" };
}

export function safeCallTypes(raw: unknown): ReplyCallType[] | undefined {
  const list = (raw as { callTypes?: unknown } | null)?.callTypes;
  if (!Array.isArray(list)) return undefined;
  const out: ReplyCallType[] = [];
  for (const c of list.slice(0, 3)) {
    if (!c || typeof c !== "object" || typeof c.key !== "string" || typeof c.label !== "string") continue;
    out.push({
      key: c.key.slice(0, 20),
      label: c.label.slice(0, 80),
      userMinutes: typeof c.userMinutes === "number" ? c.userMinutes : 0,
      requiresSubscription: !!c.requiresSubscription,
      description: typeof c.description === "string" ? c.description.slice(0, 200) : "",
    });
  }
  return out.length ? out : undefined;
}

export function safeSources(raw: unknown): ReplySource[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out = raw
    .filter(
      (s): s is ReplySource =>
        !!s && typeof s.title === "string" && typeof s.url === "string" && s.url.startsWith("https://www.influencerbutler.com/help/"),
    )
    .slice(0, 2)
    .map((s) => ({ title: s.title.slice(0, 120), url: s.url }));
  return out.length ? out : undefined;
}

export function uiLocale(): string {
  return typeof navigator !== "undefined" && navigator.language ? navigator.language : "en-US";
}

export function uiPlatform(): string | undefined {
  if (typeof navigator === "undefined") return undefined;
  if (/Mac/i.test(navigator.userAgent)) return "darwin";
  if (/Win/i.test(navigator.userAgent)) return "win32";
  return undefined;
}

// Only same-origin tutorial screenshots ever render in the chat.
const IMAGE_URL_PREFIX = "https://www.influencerbutler.com/assets/";

export function safeImages(raw: unknown): ReplyImage[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is ReplyImage => !!i && typeof i.url === "string" && i.url.startsWith(IMAGE_URL_PREFIX))
    .slice(0, 4)
    .map((i) => ({ url: i.url, alt: typeof i.alt === "string" ? i.alt : "" }));
}
