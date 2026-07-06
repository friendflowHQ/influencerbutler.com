import type { Finding, VideoCounts } from "../transport/types";
import type { HudCommand, HudCommandResult, HudStatus } from "../transport/hud-commands";
import type { IntegrationsState, IntegrationTestResult } from "../storage/schema";

type IntegrationsGlobal = IntegrationsState["global"];

// Typed chrome.runtime message contracts. Content scripts and the popup talk
// to the background through these; content scripts never call the network
// for influencerbutler.com themselves.

export type AuthStatus = {
  signedIn: boolean;
  email: string | null;
  queueDepth: number;
  lastSyncAt: number | null;
};

export type PageStatus = {
  pageType: "product" | "order-history" | "storefront" | "creator-upload" | "other";
  toolSummaries: Array<{ label: string; value: string }>;
};

export type RuntimeMessage =
  | { kind: "RECORD_FINDING"; finding: Finding }
  | { kind: "GET_AUTH_STATUS" }
  | { kind: "SIGN_IN"; licenseKey: string }
  | { kind: "SIGN_OUT" }
  | { kind: "FLUSH_QUEUE" }
  | { kind: "GET_PAGE_STATUS" }
  | { kind: "GET_HUD_STATUS"; force?: boolean }
  | { kind: "SEND_HUD_COMMAND"; command: HudCommand }
  | { kind: "SEND_FEEDBACK"; feedback: FeedbackInput }
  | { kind: "OPEN_URL"; url: string }
  // Opens the extension's options/settings page. Content scripts cannot call
  // chrome.runtime.openOptionsPage directly, so the on-page gear routes here.
  | { kind: "OPEN_OPTIONS" }
  // Records first actual use so the background can schedule the re-engagement
  // nudge alarms. Idempotent: only the first one sets the clock.
  | { kind: "MARK_FIRST_USE" }
  // API integrations (options page + on-page link/AI use). Credentials never
  // ride these messages back to the UI; only non-secret field values do.
  | { kind: "GET_INTEGRATIONS" }
  | {
      kind: "SAVE_INTEGRATION";
      id: string;
      values: Record<string, string>;
      enabled?: boolean;
      routingParticipates?: boolean;
    }
  | { kind: "SET_INTEGRATION_GLOBAL"; partial: Partial<IntegrationsGlobal> }
  | { kind: "TEST_INTEGRATION"; id: string }
  | { kind: "TEST_ALL_INTEGRATIONS" }
  | { kind: "GENERATE_AFFILIATE_LINK"; asin: string; marketplace: string; url?: string }
  | { kind: "REWRITE_LINK"; url: string }
  | { kind: "OPENAI_COMPLETE"; prompt: string }
  // Per-country availability for a tagged product, checked from the worker
  // (cross-marketplace fetch needs the host_permissions CORS bypass).
  | { kind: "FETCH_MARKET_AVAILABILITY"; asin: string; markets: string[] }
  // Orders Butler "update influencer video count": the order-history content
  // script asks the worker to open one product in a background tab so its
  // client-side video breakdown hydrates and the page emits a product_scan.
  // The worker waits for that scan (or times out), closes the tab, and returns
  // the counts. Only the background can drive chrome.tabs, so the loop lives in
  // the content script and each product is one short request that keeps the
  // worker awake.
  | { kind: "SCAN_ASIN_IN_TAB"; asin: string; marketplace: string }
  // The list of unique products to run that count over: the account's synced
  // order history, read from /api/extension/orders with the license key.
  | { kind: "GET_ORDER_ASINS" }
  // Creator API (PA-API) enrichment for the storefront checkup. The worker
  // POSTs a batch of ASINs (<=10) to /api/extension/enrich with the license
  // key so the content script never handles the secret. `marketplaces` filters
  // to the storefront's own marketplace so each ASIN comes back as one row.
  | { kind: "ENRICH_PRODUCTS"; asins: string[]; marketplaces?: string[] };

export type FeedbackInput = {
  feedbackType: "bug" | "feature" | "praise" | "other";
  message: string;
  pageUrl?: string;
};

export type FeedbackResult = { ok: boolean; error?: string };

export type SignInResult = { ok: boolean; email?: string; error?: string };

// What the options page renders for one provider. `values` holds only
// non-secret field values (never a password/secret); `configured` says whether
// a credential is saved so the UI can show "connected" without exposing it.
export type IntegrationView = {
  id: string;
  enabled: boolean;
  configured: boolean;
  values: Record<string, string>;
  lastTest: IntegrationTestResult;
  routingParticipates: boolean;
};

export type IntegrationsView = {
  global: IntegrationsGlobal;
  providers: IntegrationView[];
};

// Result of scanning one product in a background tab. `classified` is true when
// the page hydrated far enough to split creators (influencer/brand/customer);
// when false, `counts` holds only what could be read (often the total) and the
// influencer figure is not trustworthy, so the UI shows "count not available".
export type ScanAsinResult = {
  counts: VideoCounts | null;
  classified: boolean;
};

export type OrderAsinItem = { asin: string; marketplace: string; title: string | null };
export type OrderAsinsResult = { ok: boolean; items: OrderAsinItem[]; error?: string };

// One normalized Creator API (PA-API) product row. Mirrors the server's
// EnrichedItem shape in src/lib/paapi.ts, one per (asin, marketplace).
export type EnrichedProduct = {
  asin: string | null;
  marketplace: string;
  found: boolean;
  title: string | null;
  brand: string | null;
  priceDisplay: string | null;
  priceCents: number | null;
  currency: string | null;
  availability: string | null;
  primeEligible: boolean | null;
  binding: string | null;
  browseNode: string | null;
  imageUrl: string | null;
  detailPageUrl: string | null;
  error: string | null;
};

// Response of ENRICH_PRODUCTS. `configured` is false when the user has not
// stored any Creator API credentials (so the caller can prompt them and fall
// back to scrape data); `items` holds one entry per requested ASIN.
export type EnrichResult = {
  ok: boolean;
  configured: boolean;
  items: Array<{ asin: string; results: EnrichedProduct[] }>;
  error?: string;
};

export type IntegrationTestOutcome = { ok: boolean; message: string };
export type GenerateLinkResult = { ok: boolean; url?: string; error?: string };
export type OpenAiResult = { ok: boolean; text?: string; error?: string };

export type { HudCommand, HudCommandResult, HudStatus };

export function sendToBackground<T>(message: RuntimeMessage): Promise<T> {
  return chrome.runtime.sendMessage(message);
}
