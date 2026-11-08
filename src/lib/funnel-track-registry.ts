// Funnels v2: registry for tailored (track / module) code-default copy.
//
// Copy files (app-trial-emails.ts, trial-emails.ts, funnel-modules.ts, the
// upgrade copy, ...) call registerTrackCopy() at import time. system-funnels.ts
// consults it through funnelDefaultsForKey(). This module must stay
// DEPENDENCY-FREE (no imports at all) so copy files can import it without
// creating a cycle with system-funnels.ts, which imports those copy files.
//
// Map keys are content keys (see funnel-types.ts), plus two wildcard forms:
//   "day3.mod-walmart.power"  exact key in this funnel
//   "*.mod-walmart.power"     any tier of this funnel with that module/base
//   "*.mod-walmart"           any tier of this funnel with that module
// Registering under funnel "*" applies to every funnel (lowest priority).
// A bare key ("u1") is allowed too: funnelDefaults() falls back to it when the
// funnel has no hard-coded copy for that tier (used by the upgrade funnel).

export type TrackCopyVars = Record<string, unknown>;

export type TrackCopyEntry = {
  subject: string | ((vars: TrackCopyVars) => string);
  build: (vars: TrackCopyVars) => string;
  /** Optional YYYY-MM-DD the copy was last edited (COPY_UPDATED_AT owns the truth). */
  updatedAt?: string;
};

export type TrackCopyMap = Record<string, TrackCopyEntry>;

const registry = new Map<string, TrackCopyMap>();

/** Adds (or replaces, key by key) tailored copy for a funnel. Safe to call
 * more than once; later registrations win per key. */
export function registerTrackCopy(funnel: string, map: TrackCopyMap): void {
  const cur = registry.get(funnel) ?? {};
  registry.set(funnel, { ...cur, ...map });
}

/** Everything registered for a funnel (empty object when none). */
export function getTrackCopy(funnel: string): Readonly<TrackCopyMap> {
  return registry.get(funnel) ?? {};
}

/** Finds the entry for exactly this content key, honoring wildcards:
 * funnel exact key, funnel "*.<rest>", then "*" funnel exact, "*" "*.<rest>".
 * Does NOT walk to less specific keys; callers walk contentKeyFallbacks(). */
export function lookupTrackCopy(funnel: string, key: string): TrackCopyEntry | null {
  const dot = key.indexOf(".");
  const wildcard = dot > 0 ? `*${key.slice(dot)}` : null;
  for (const f of [funnel, "*"]) {
    const map = registry.get(f);
    if (!map) continue;
    if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
    if (wildcard && Object.prototype.hasOwnProperty.call(map, wildcard)) return map[wildcard];
  }
  return null;
}

/** Test helper: clears one funnel's registrations, or all of them. */
export function clearTrackCopy(funnel?: string): void {
  if (funnel === undefined) registry.clear();
  else registry.delete(funnel);
}
