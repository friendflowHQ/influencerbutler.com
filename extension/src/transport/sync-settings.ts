// Wire shapes for settings sync with the paired desktop app, carried over the
// local loopback bridge ONLY (never the cloud relay): the payload can contain
// decrypted credentials, which must not leave the machine. The desktop maps
// these extension adapter ids and field names onto its own settings keys; see
// src/tools/settings-sync/merge.ts for what participates and the mapping notes.

export type SyncProviderPayload = {
  enabled: boolean;
  routingParticipates: boolean;
  // Decrypted credential fields for this provider (secret and non-secret). The
  // receiving side re-encrypts into its own store. Empty map = nothing saved.
  creds: Record<string, string>;
};

export type SyncSettingsPayload = {
  storefrontHandle: string | null;
  primaryDeeplinkProvider: string | null;
  walmartLinkProvider: string | null;
  affiliateRoutingEnabled: boolean;
  // Amazon Associates tag per marketplace country code (e.g. { US: "tag-20" }).
  perCountryTags: Record<string, string>;
  // Credential-based integration providers, keyed by extension adapter id
  // (linktwin, creatorsApi, urlgenius, geniuslink, selfhosted, openai, levanta,
  // archer, logie, benable). Session-based and license-based providers are not
  // synced (they have no portable secret).
  providers: Record<string, SyncProviderPayload>;
};

// How the receiving side folds an incoming payload into its own settings.
// "fill" is non-destructive (only sets fields that are empty locally); "overwrite"
// takes the incoming value for every field the payload carries a value for.
export type SyncMode = "fill" | "overwrite";

// Result of asking the desktop app for its settings over the bridge.
export type DesktopSettingsResult =
  | { status: "ok"; payload: SyncSettingsPayload }
  // No pairing token: the app has never been connected.
  | { status: "not-paired" }
  // Paired, but nothing answered the settings frame: the app is closed, or it is
  // an older build that does not yet handle settings.* (unknown frames are
  // ignored on both sides, so this is how "too old" surfaces).
  | { status: "app-unavailable" };

export type PushSettingsResult =
  | { status: "ok"; applied: number }
  | { status: "not-paired" }
  | { status: "app-unavailable" };
