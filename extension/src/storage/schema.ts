import type { Finding, VideoCounts } from "../transport/types";

// Everything lives in chrome.storage.local. The license key deliberately
// never goes to storage.sync so it cannot leave the machine via Chrome sync.

export type Settings = {
  commissionRatePct: number;
  categoryKey: string;
  hourlyValue: number;
  minutesPerVideo: number;
  conversionPct: number;
  contentGapThreshold: number;
  approved: {
    minBoughtPerMonth: number;
    maxInfluencerVideos: number;
    minPrice: number;
  };
  storefrontHandle: string | null;
  tools: {
    videoCounts: boolean;
    approved: boolean;
    calculator: boolean;
    storefront: boolean;
  };
  syncEnabled: boolean;
  debug: boolean;
};

export type AuthState = {
  licenseKey: string | null;
  email: string | null;
  verifiedAt: number | null;
};

export type CachedScan = {
  counts: VideoCounts;
  title?: string;
  inStock: boolean;
  ts: number;
};

export type StorageShape = {
  schemaVersion: number;
  settings: Settings;
  auth: AuthState;
  queue: Finding[];
  lastSyncAt: number | null;
  cache: Record<string, CachedScan>;
  telemetry: { selectorMisses: Record<string, number> };
};

export const DEFAULTS: StorageShape = {
  schemaVersion: 1,
  settings: {
    commissionRatePct: 2.5,
    categoryKey: "default",
    hourlyValue: 25,
    minutesPerVideo: 60,
    conversionPct: 2,
    contentGapThreshold: 2,
    approved: {
      minBoughtPerMonth: 50,
      maxInfluencerVideos: 5,
      minPrice: 20,
    },
    storefrontHandle: null,
    tools: {
      videoCounts: true,
      approved: true,
      calculator: true,
      storefront: true,
    },
    syncEnabled: true,
    debug: false,
  },
  auth: { licenseKey: null, email: null, verifiedAt: null },
  queue: [],
  lastSyncAt: null,
  cache: {},
  telemetry: { selectorMisses: {} },
};

export function migrate(raw: Partial<StorageShape> | undefined): StorageShape {
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULTS);
  }
  // Future schema bumps switch on raw.schemaVersion here. Merging with
  // defaults also backfills any keys added within version 1.
  return {
    ...structuredClone(DEFAULTS),
    ...raw,
    settings: {
      ...structuredClone(DEFAULTS.settings),
      ...(raw.settings ?? {}),
      approved: { ...DEFAULTS.settings.approved, ...(raw.settings?.approved ?? {}) },
      tools: { ...DEFAULTS.settings.tools, ...(raw.settings?.tools ?? {}) },
    },
    auth: { ...DEFAULTS.auth, ...(raw.auth ?? {}) },
    telemetry: { selectorMisses: { ...(raw.telemetry?.selectorMisses ?? {}) } },
    schemaVersion: 1,
  };
}
