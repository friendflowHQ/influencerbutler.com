import type { SyncProviderPayload, SyncSettingsPayload } from "../../transport/sync-settings";

// Pure merge + diff for settings sync. No storage, no crypto, no network: the
// background decrypts into a SyncSettingsPayload, these functions decide what to
// change, and the background writes the result back (re-encrypting secrets).
//
// The diff returns human labels only, never values, so the "are you sure" confirm
// can list which settings differ without ever printing a secret on screen.

// Friendly provider names for the diff labels. Keyed by extension adapter id.
const PROVIDER_LABELS: Record<string, string> = {
  linktwin: "linktw.in",
  creatorsApi: "Amazon Creators API",
  urlgenius: "URLgenius",
  geniuslink: "Geniuslink",
  selfhosted: "Self-hosted links",
  openai: "OpenAI",
  levanta: "Levanta",
  archer: "Archer",
  logie: "Logie",
  benable: "Benable",
};

function providerLabel(id: string): string {
  return PROVIDER_LABELS[id] ?? id;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || !value.trim();
}

// Coerce an untrusted frame from the desktop app into a well-formed payload.
// Defensive: a malformed field must never break the merge (the app is ours, but
// a version skew or a tampered socket should degrade to safe defaults).
export function coerceSyncPayload(raw: unknown): SyncSettingsPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const strOrNull = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v : null;

  const perCountryTags: Record<string, string> = {};
  if (o.perCountryTags && typeof o.perCountryTags === "object") {
    for (const [k, v] of Object.entries(o.perCountryTags as Record<string, unknown>)) {
      if (typeof v === "string" && v.trim()) perCountryTags[k] = v;
    }
  }

  const providers: Record<string, SyncProviderPayload> = {};
  if (o.providers && typeof o.providers === "object") {
    for (const [id, pv] of Object.entries(o.providers as Record<string, unknown>)) {
      if (!pv || typeof pv !== "object") continue;
      const p = pv as Record<string, unknown>;
      const creds: Record<string, string> = {};
      if (p.creds && typeof p.creds === "object") {
        for (const [f, val] of Object.entries(p.creds as Record<string, unknown>)) {
          if (typeof val === "string") creds[f] = val;
        }
      }
      providers[id] = {
        enabled: p.enabled === true,
        routingParticipates: p.routingParticipates !== false,
        creds,
      };
    }
  }

  return {
    storefrontHandle: strOrNull(o.storefrontHandle),
    primaryDeeplinkProvider: strOrNull(o.primaryDeeplinkProvider),
    walmartLinkProvider: strOrNull(o.walmartLinkProvider),
    affiliateRoutingEnabled: o.affiliateRoutingEnabled === true,
    perCountryTags,
    providers,
  };
}

function providerHasValue(p: SyncProviderPayload | undefined): boolean {
  return Boolean(p && Object.values(p.creds).some((v) => !isBlank(v)));
}

function emptyProvider(): SyncProviderPayload {
  return { enabled: false, routingParticipates: true, creds: {} };
}

// The fields (by human label) that differ between the two sides: both hold a
// non-blank value and the values are not equal. Used only to inform the reconcile
// confirm; values are never included.
export function diffPayloads(ext: SyncSettingsPayload, app: SyncSettingsPayload): string[] {
  const diffs: string[] = [];

  const scalar = (label: string, a: string | null, b: string | null) => {
    if (!isBlank(a) && !isBlank(b) && a !== b) diffs.push(label);
  };
  scalar("Storefront handle", ext.storefrontHandle, app.storefrontHandle);
  scalar("Primary deeplink provider", ext.primaryDeeplinkProvider, app.primaryDeeplinkProvider);
  scalar("Walmart link provider", ext.walmartLinkProvider, app.walmartLinkProvider);

  if (ext.affiliateRoutingEnabled !== app.affiliateRoutingEnabled) {
    diffs.push("Affiliate link rewriting");
  }

  const countries = new Set([
    ...Object.keys(ext.perCountryTags),
    ...Object.keys(app.perCountryTags),
  ]);
  for (const c of countries) {
    const a = ext.perCountryTags[c] ?? "";
    const b = app.perCountryTags[c] ?? "";
    if (!isBlank(a) && !isBlank(b) && a.trim() !== b.trim()) diffs.push(`${c} affiliate tag`);
  }

  const providerIds = new Set([...Object.keys(ext.providers), ...Object.keys(app.providers)]);
  for (const id of providerIds) {
    const a = ext.providers[id];
    const b = app.providers[id];
    if (!providerHasValue(a) || !providerHasValue(b)) continue;
    const fields = new Set([...Object.keys(a!.creds), ...Object.keys(b!.creds)]);
    for (const f of fields) {
      const av = a!.creds[f] ?? "";
      const bv = b!.creds[f] ?? "";
      if (!isBlank(av) && !isBlank(bv) && av.trim() !== bv.trim()) {
        diffs.push(`${providerLabel(id)} credentials`);
        break;
      }
    }
  }

  return diffs;
}

// Non-destructive fold: take an incoming value only where the base is blank.
// Booleans are never touched (they have no "empty"). Returns how many distinct
// fields were filled.
export function fillEmpty(
  base: SyncSettingsPayload,
  incoming: SyncSettingsPayload,
): { merged: SyncSettingsPayload; filled: number } {
  let filled = 0;
  const merged: SyncSettingsPayload = {
    storefrontHandle: base.storefrontHandle,
    primaryDeeplinkProvider: base.primaryDeeplinkProvider,
    walmartLinkProvider: base.walmartLinkProvider,
    affiliateRoutingEnabled: base.affiliateRoutingEnabled,
    perCountryTags: { ...base.perCountryTags },
    providers: {},
  };

  const scalar = (key: "storefrontHandle" | "primaryDeeplinkProvider" | "walmartLinkProvider") => {
    if (isBlank(base[key]) && !isBlank(incoming[key])) {
      merged[key] = incoming[key];
      filled += 1;
    }
  };
  scalar("storefrontHandle");
  scalar("primaryDeeplinkProvider");
  scalar("walmartLinkProvider");

  for (const [c, tag] of Object.entries(incoming.perCountryTags)) {
    if (isBlank(merged.perCountryTags[c]) && !isBlank(tag)) {
      merged.perCountryTags[c] = tag.trim();
      filled += 1;
    }
  }

  const providerIds = new Set([...Object.keys(base.providers), ...Object.keys(incoming.providers)]);
  for (const id of providerIds) {
    const b = base.providers[id];
    const inc = incoming.providers[id];
    if (!b && inc && providerHasValue(inc)) {
      // Brand-new provider on the incoming side: adopt it wholesale.
      merged.providers[id] = { ...inc, creds: { ...inc.creds } };
      filled += 1;
      continue;
    }
    const next: SyncProviderPayload = b
      ? { enabled: b.enabled, routingParticipates: b.routingParticipates, creds: { ...b.creds } }
      : emptyProvider();
    if (inc) {
      for (const [f, v] of Object.entries(inc.creds)) {
        if (isBlank(next.creds[f]) && !isBlank(v)) {
          next.creds[f] = v.trim();
          filled += 1;
        }
      }
    }
    merged.providers[id] = next;
  }

  return { merged, filled };
}

// Destructive fold: take the incoming value for every field it carries a value
// for (booleans always). Never wipes a base value with a blank incoming one.
// Returns how many distinct fields changed.
export function overwriteWith(
  base: SyncSettingsPayload,
  incoming: SyncSettingsPayload,
): { merged: SyncSettingsPayload; changed: number } {
  let changed = 0;
  const merged: SyncSettingsPayload = {
    storefrontHandle: base.storefrontHandle,
    primaryDeeplinkProvider: base.primaryDeeplinkProvider,
    walmartLinkProvider: base.walmartLinkProvider,
    affiliateRoutingEnabled: base.affiliateRoutingEnabled,
    perCountryTags: { ...base.perCountryTags },
    providers: {},
  };

  const scalar = (key: "storefrontHandle" | "primaryDeeplinkProvider" | "walmartLinkProvider") => {
    if (!isBlank(incoming[key]) && incoming[key] !== base[key]) {
      merged[key] = incoming[key];
      changed += 1;
    }
  };
  scalar("storefrontHandle");
  scalar("primaryDeeplinkProvider");
  scalar("walmartLinkProvider");

  if (incoming.affiliateRoutingEnabled !== base.affiliateRoutingEnabled) {
    merged.affiliateRoutingEnabled = incoming.affiliateRoutingEnabled;
    changed += 1;
  }

  for (const [c, tag] of Object.entries(incoming.perCountryTags)) {
    if (!isBlank(tag) && tag.trim() !== (merged.perCountryTags[c] ?? "")) {
      merged.perCountryTags[c] = tag.trim();
      changed += 1;
    }
  }

  const providerIds = new Set([...Object.keys(base.providers), ...Object.keys(incoming.providers)]);
  for (const id of providerIds) {
    const b = base.providers[id];
    const inc = incoming.providers[id];
    const next: SyncProviderPayload = b
      ? { enabled: b.enabled, routingParticipates: b.routingParticipates, creds: { ...b.creds } }
      : emptyProvider();
    if (inc) {
      for (const [f, v] of Object.entries(inc.creds)) {
        if (!isBlank(v) && v.trim() !== (next.creds[f] ?? "")) {
          next.creds[f] = v.trim();
          changed += 1;
        }
      }
      // Provider-level flags follow the incoming side on an overwrite.
      if (providerHasValue(inc)) {
        next.enabled = inc.enabled;
        next.routingParticipates = inc.routingParticipates;
      }
    }
    merged.providers[id] = next;
  }

  return { merged, changed };
}
