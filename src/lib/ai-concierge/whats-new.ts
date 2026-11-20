/**
 * "What's new" answers for Butler AI. The only curated, dated release notes this
 * site can read are the Chrome extension's changelog (the desktop app's notes
 * live in the desktop repo), so the tool says exactly that and points desktop
 * questions at the app's own What's New. Imported statically so it ships with
 * the bundle instead of reading the filesystem at request time.
 */
import changelog from "../../../extension/static/changelog.json";

type Section = { heading: string; items: string[] };
type Release = { version: string; date: string; sections: Section[] };

const MAX_RELEASES = 3;
const MAX_ITEMS_PER_RELEASE = 12;

export type WhatsNewResult = {
  source: string;
  releases: Array<{ version: string; date: string; highlights: Array<{ heading: string; items: string[] }> }>;
  note: string;
};

/** The newest `n` extension releases, trimmed so a tool result stays small. */
export function latestExtensionReleases(n = MAX_RELEASES): WhatsNewResult {
  const releases = ((changelog as { releases?: Release[] }).releases ?? []).slice(0, Math.max(1, n));
  return {
    source: "Chrome extension release notes",
    releases: releases.map((r) => {
      let budget = MAX_ITEMS_PER_RELEASE;
      const highlights: Array<{ heading: string; items: string[] }> = [];
      for (const s of r.sections ?? []) {
        if (budget <= 0) break;
        const items = (s.items ?? []).slice(0, budget);
        budget -= items.length;
        if (items.length) highlights.push({ heading: s.heading, items });
      }
      return { version: r.version, date: r.date, highlights };
    }),
    note:
      "These are the Chrome extension's release notes only. Summarize the few changes most relevant to the user's question, with the version and date. For the desktop app, tell them to open What's New inside the app after an update, and do not invent desktop changes.",
  };
}
