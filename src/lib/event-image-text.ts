/**
 * Pure helpers for the event image (scene prompt + date/time formatting +
 * title sizing). Kept free of next/og and any heavy runtime so they can be unit
 * tested and reused by both the image generator and the share page. No
 * em-dashes in any string that can reach a reader.
 */
import { DateTime } from "luxon";

/**
 * Framings rotated across events. Each one blends the "live video call" look
 * (friendly faces on a screen, headset, podcast mic) with the event's topic
 * scene, and they differ in how the two share the picture, so covers feel like
 * the same series without all being the same person at a laptop.
 */
export const SCENE_COMPOSITIONS = [
  "a big screen showing a grid of friendly waving faces on a video call, with the topic's objects spilling out of the screen into the cozy room",
  "a creator in a headset beside a podcast microphone, mid-conversation on a live call, surrounded by the topic's props",
  "a split scene: on one side video-call tiles of smiling people, on the other side the topic scene in full detail",
  "an overhead flat lay of the topic's objects on a table, with a tablet showing a small video call of happy faces",
  "close-up hands at work on the topic in the foreground, with a monitor behind showing a lively group video call",
  "a playful isometric miniature world themed on the topic, with a giant screen in the middle showing a live group call",
  "a warm live-studio set with a ring light and microphone, the topic's props arranged around it, and video-call faces on the back wall",
  "a cozy room where two or three people on video-call screens float like picture frames around the topic scene",
];

/** Topic scenes used when the AI scene writer is unavailable. */
const KEYWORD_SCENES: Array<[RegExp, string]> = [
  [/black friday|cyber monday|holiday|christmas|gift/i, "stacks of wrapped gift boxes, shopping bags, and price tags with a countdown clock"],
  [/prime day|deal|coupon|sale|discount/i, "a treasure chest overflowing with shopping tags, coupons, and small products"],
  [/facebook|group|community/i, "a lively town-square bulletin board covered with product cards and notes"],
  [/digital product|ebook|course|template|pdf/i, "a glowing digital product box on a pedestal with tidy stacked guides"],
  [/fashion|outfit|look|collage|style/i, "a styled clothing rack with outfits, a mirror, and accessories laid out"],
  [/ai|clone|automation|butler|robot/i, "a friendly little robot butler arranging products and photos on shelves"],
  [/mobile|app|phone/i, "a giant smartphone standing like a storefront with tiny shoppers around it"],
  [/tiktok|video|youtube|reel/i, "a ring light, tripod, and camera set up beside a styled product shelf"],
  [/instagram|story|post|content/i, "a mood board wall of photo prints, product samples, and color swatches"],
  [/affiliate|amazon|storefront|commission|earn/i, "a charming little shop front with shelves of curated products and a rising chart"],
];

function keywordScene(title: string): string {
  for (const [re, scene] of KEYWORD_SCENES) if (re.test(title)) return scene;
  return "a creator workshop table with products, notebooks, and fresh ideas pinned to a board";
}

/** Deterministic pick so the same event keeps a stable framing unless varied. */
export function pickComposition(seed: string, variant = 0): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SCENE_COMPOSITIONS[(h + variant) % SCENE_COMPOSITIONS.length];
}

/**
 * A text-free scene prompt for the AI backdrop, themed on the event title. The
 * house STYLE_SUFFIX (added by generateHeroImage) forbids any text, so this
 * only describes subjects and mood, never words to render. sceneIdea is an
 * optional AI-written concrete scene; without it a keyword scene is used.
 */
export function buildScenePrompt(title: string, sceneIdea?: string | null, composition?: string): string {
  const theme = (title || "creator workshop").trim().replace(/\s+/g, " ").slice(0, 160);
  const subject = (sceneIdea || "").trim() || keywordScene(theme);
  const frame = composition || pickComposition(theme);
  return (
    `Cover art for an event themed around "${theme}". Composition: ${frame}. ` +
    `Topic scene: ${subject}. Keep the friendly, live group-call energy, but make ` +
    `the topic scene clearly visible so it does not look like a generic video call.`
  );
}

/** "Thursday, September 24" in the event's timezone. */
export function formatEventDate(startsAtIso: string, tz: string): string {
  const d = DateTime.fromISO(startsAtIso, { zone: tz || "UTC" });
  if (!d.isValid) return "";
  return d.toFormat("cccc, LLLL d");
}

/** "11:00 AM to 12:00 PM MDT" in the event's timezone. */
export function formatEventTime(startsAtIso: string, endsAtIso: string, tz: string): string {
  const s = DateTime.fromISO(startsAtIso, { zone: tz || "UTC" });
  const e = DateTime.fromISO(endsAtIso, { zone: tz || "UTC" });
  if (!s.isValid) return "";
  const range = e.isValid
    ? `${s.toFormat("h:mm a")} to ${e.toFormat("h:mm a")}`
    : s.toFormat("h:mm a");
  return `${range} ${s.toFormat("ZZZZ")}`.trim();
}

/** Ramp the title size down as it gets longer so it always fits the card. */
export function titleFontSize(title: string): number {
  const len = (title || "").length;
  if (len <= 32) return 68;
  if (len <= 60) return 54;
  if (len <= 90) return 44;
  return 36;
}
