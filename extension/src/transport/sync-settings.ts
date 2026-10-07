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

// A session-based integration's connection as the desktop app sees it (Mavely,
// Walmart Creator). These have no portable secret: the login lives in the app's
// own browser profile. So the app reports only a verdict (read-only, app to
// extension) and the extension asks the app to mint links when its own browser
// session is signed out. `label` is a display name (the account email), never a
// credential. An integration the app has no verdict for is simply absent.
export type SessionConnection = { connected: boolean; label?: string };

export type SyncSettingsPayload = {
  storefrontHandle: string | null;
  primaryDeeplinkProvider: string | null;
  walmartLinkProvider: string | null;
  affiliateRoutingEnabled: boolean;
  // Amazon Associates tag per marketplace country code (e.g. { US: "tag-20" }).
  perCountryTags: Record<string, string>;
  // Credential-based integration providers, keyed by extension adapter id
  // (linktwin, creatorsApi, urlgenius, geniuslink, selfhosted, openai, levanta,
  // archer, benable). Session-based and license-based providers are not
  // synced (they have no portable secret).
  providers: Record<string, SyncProviderPayload>;
  // Desktop-reported session verdicts, keyed by extension adapter id ("mavely",
  // "walmartCreator"). Only ever present on a payload read FROM the app; the
  // extension never sends it and never folds it into its own settings (it is
  // stored per provider instead, see applyDesktopConnections).
  sessionConnections?: Record<string, SessionConnection>;
};

// The extension's answer from asking the desktop app to mint a link with its own
// signed-in session. `needsSignin` means the app itself is signed out of that
// provider (so the creator has to sign in somewhere); `message` is a short line
// safe to show.
export type MintViaDesktopResult =
  | { status: "ok"; url: string }
  | { status: "needs-signin"; message?: string }
  | { status: "failed"; message?: string }
  | { status: "not-paired" }
  | { status: "app-unavailable" };

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
