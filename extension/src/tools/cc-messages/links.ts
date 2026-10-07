// Pull the actionable links out of a brand's Creator Connections message and
// label them ("Sample form", "Content assets", "Brief"). Brands paste their
// content folder and sample-request form as bare short links in one long
// message, so the creator has to hunt through the text for them. Pure and
// DOM-free so it is unit-tested.

export type LinkKind = "sample" | "content" | "brief" | "link";

export type MessageLink = {
  // Always absolute http(s). Shorteners are kept as pasted, never expanded or
  // cleaned (stripping parameters from a short link would break it).
  url: string;
  // Compact host + path for the button tooltip.
  display: string;
  kind: LinkKind;
  // The button text.
  label: string;
};

const LABELS: Record<LinkKind, string> = {
  sample: "Sample form",
  content: "Content assets",
  brief: "Brief",
  link: "Link",
};

// A URL needs a scheme, a leading "www.", or a bare domain WITH a path
// ("shorturl.at/oUgCE"). A bare domain without a path ("etc.Then") is far more
// likely to be prose than a link. The path alphabet is ASCII URL characters only,
// so an emoji pasted right after a link is not swallowed into it.
const URL_RE =
  /\b(?:https?:\/\/[\w\-.~:/?#@!$&*+,;=%()[\]]+|(?:www\.[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\/)[\w\-.~:/?#@!$&*+,;=%]*)/gi;

const TRAILING_PUNCT = /[.,;:!?)\]}'"]+$/;

const SAMPLE_WORDS = /\b(samples?|forms?|ship(?:ping)?|address|request)\b/i;
const CONTENT_WORDS =
  /\b(content|folders?|drive|assets?|photos?|images?|pictures?|videos?|footage|grab|download|swipe|library)\b/i;
const BRIEF_WORDS = /\b(briefs?|guidelines?|requirements?|talking points|do'?s and don'?ts)\b/i;

const SAMPLE_HOSTS = /(?:^|\.)(forms\.gle|typeform\.com|jotform\.com|tally\.so|airtable\.com)$/i;
const CONTENT_HOSTS =
  /(?:^|\.)(drive\.google\.com|dropbox\.com|canva\.com|box\.com|wetransfer\.com|frame\.io|sharepoint\.com)$/i;

// The words a link is labelled by: the text since the previous link (or the
// start), last ~80 characters. Looking only backwards keeps "grab from <A> and if
// you need a sample fill in this form <B>" from labelling A as a sample form.
const CONTEXT_CHARS = 80;

function withScheme(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function dedupeKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url.toLowerCase();
  }
}

function classify(host: string, context: string): LinkKind {
  if (SAMPLE_HOSTS.test(host)) return "sample";
  if (CONTENT_HOSTS.test(host)) return "content";
  // Nearest cue wins: score each kind by the position of its LAST match in the
  // context, so "...you may share, grab from <link>" reads as content even when
  // "sample" appears earlier in the same stretch.
  const last = (re: RegExp): number => {
    let best = -1;
    const g = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = g.exec(context)) !== null) {
      best = m.index;
      if (m[0].length === 0) g.lastIndex += 1;
    }
    return best;
  };
  const scored: Array<[LinkKind, number]> = [
    ["sample", last(SAMPLE_WORDS)],
    ["content", last(CONTENT_WORDS)],
    ["brief", last(BRIEF_WORDS)],
  ];
  scored.sort((a, b) => b[1] - a[1]);
  const top = scored[0];
  return top && top[1] >= 0 ? top[0] : "link";
}

// Extract the links from a set of message texts (oldest first), deduped across
// the whole thread. A later mention of the same link keeps the first label.
export function extractMessageLinks(texts: string[]): MessageLink[] {
  const out: MessageLink[] = [];
  const seen = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    const matches = Array.from(text.matchAll(URL_RE));
    let prevEnd = 0;
    for (const match of matches) {
      const index = match.index ?? 0;
      const raw = match[0].replace(TRAILING_PUNCT, "");
      const url = withScheme(raw);
      const host = hostOf(url);
      const before = text.slice(prevEnd, index);
      prevEnd = index + match[0].length;
      if (!host) continue;
      const key = dedupeKey(url);
      if (seen.has(key)) continue;
      seen.add(key);
      const context = before.slice(-CONTEXT_CHARS);
      const kind = classify(host, context);
      let display = `${host}${safePath(url)}`;
      if (display.length > 48) display = `${display.slice(0, 47)}…`;
      out.push({ url, display, kind, label: LABELS[kind] });
    }
  }
  return out;
}

function safePath(url: string): string {
  try {
    const u = new URL(url);
    const path = `${u.pathname === "/" ? "" : u.pathname}${u.search}`;
    return path;
  } catch {
    return "";
  }
}
