// Creator channel the user declared in the desktop app, published to the
// extension over the local bridge status frame and mirrored into Settings so
// every surface can read it synchronously via getSettings(). Mirrors the
// desktop classifier (renderer/hud/creator-mode.js in the app repo):
//   onsite  = Amazon on-platform creator (shoppable videos/photos, storefront,
//             Creator Connections, campaigns).
//   offsite = drives social-media traffic to Amazon affiliate links (deal
//             harvesting, deep links, sharing).
//   both    = show everything (the default, and the prior behavior).
// A feature belongs to one channel; it is shown when the user's mode allows
// that channel. "both" on either side always allows.

export type CreatorMode = "onsite" | "offsite" | "both";
export type FeatureChannel = "onsite" | "offsite" | "both";

export const DEFAULT_CREATOR_MODE: CreatorMode = "both";

export function normalizeCreatorMode(value: unknown): CreatorMode {
  const v = String(value ?? "").trim().toLowerCase();
  return v === "onsite" || v === "offsite" || v === "both" ? v : DEFAULT_CREATOR_MODE;
}

// A feature in `channel` is visible under `mode` when either side is "both",
// or the two match. Neutral features should pass channel "both".
export function channelAllowed(mode: CreatorMode, channel: FeatureChannel): boolean {
  if (mode === "both" || channel === "both") return true;
  return mode === channel;
}
