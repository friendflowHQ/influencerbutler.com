/**
 * Pure helpers for the event image (scene prompt + date/time formatting +
 * title sizing). Kept free of next/og and any heavy runtime so they can be unit
 * tested and reused by both the image generator and the share page. No
 * em-dashes in any string that can reach a reader.
 */
import { DateTime } from "luxon";

/**
 * A text-free scene prompt for the AI backdrop, themed on the event title. The
 * house STYLE_SUFFIX (added by generateHeroImage) forbids any text, so this
 * only describes subjects and mood, never words to render.
 */
export function buildScenePrompt(title: string): string {
  const theme = (title || "creator workshop").trim().replace(/\s+/g, " ").slice(0, 160);
  return (
    `A warm, inviting scene evoking a live online workshop and group video call for ` +
    `social media creators, themed around "${theme}". Friendly people, laptops, a cozy ` +
    `home studio, soft daylight, a sense of community and momentum.`
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
