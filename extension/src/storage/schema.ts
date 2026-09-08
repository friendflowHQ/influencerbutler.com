import type { Finding, VideoCounts } from "../transport/types";
import type { LocaleSetting } from "../i18n";
import type { CreatorMode } from "../shared/creator-mode";
import type { LinkPixel } from "../integrations/ib-links-client";
import type { CampaignScoreBand } from "../tools/campaign-radar/score";
import {
  AUTO_ACCEPT_DAILY_HARD_CAP,
  AUTO_ACCEPT_PER_RUN_HARD_CAP,
} from "../shared/constants";

// Everything lives in chrome.storage.local. The license key deliberately
// never goes to storage.sync so it cannot leave the machine via Chrome sync.

// Voiceover Butler (extension edition): the enum values mirror the desktop
// app's Voiceover Butler workspace so a creator moving between the two sees
// the same choices. The prompt directives for each value live in
// src/tools/my-link/voiceover-prompt.ts.
export type VoiceoverVideoType =
  | "social-hook"
  | "tutorial"
  | "unboxing"
  | "problem-solution"
  | "edu-story"
  | "product-setup";
export type VoiceoverHookStyle =
  | "joke-pun"
  | "relatable"
  | "30-day-review"
  | "tired-of"
  | "bold-claim"
  | "question"
  | "surprise-reveal"
  | "custom";
export type VoiceoverPacing = "slow" | "standard" | "fast";
export type VoiceoverDisclosureKey =
  | "honest-paid-sample"
  | "affiliate-link"
  | "free-pr-sample"
  | "none";

// The creator's own fit and styling, injected into the prompt only when the
// product classifies as apparel/beauty so scripts can ground sizing in the
// creator's real measurements ("I'm 5'6 and wear a medium").
export type VoiceoverAboutMe = {
  height: string;
  topSize: string;
  bustSize: string;
  dressSize: string;
  pantSize: string;
  shoeSize: string;
  hairColor: string;
  eyeColor: string;
  skinTone: string;
  preferredColors: string;
  preferredStyles: string;
};

export type VoiceoverDefaults = {
  // Spoken length in seconds; clamped to 5-120 on save and again at prompt time.
  lengthSeconds: number;
  videoType: VoiceoverVideoType;
  hookStyle: VoiceoverHookStyle;
  // Used verbatim as the opening line when hookStyle is "custom".
  hookCustom: string;
  pacing: VoiceoverPacing;
  disclosureKey: VoiceoverDisclosureKey;
};

export type VoiceoverSettings = {
  tone: string;
  niche: string;
  audience: string;
  defaults: VoiceoverDefaults;
  aboutMe: VoiceoverAboutMe;
  // Brand names a script must never mention, stored parsed (not the raw comma
  // string). Enforced as a prompt constraint and post-checked on the output.
  brandDenylist: string[];
};

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
  // User-tunable floors for Campaign Radar's highlight on the Creator
  // Connections grid. This is the differentiator over the competitor's fixed
  // thresholds: a campaign is highlighted only when it clears all three.
  // minRemainingBudget is in dollars, matching approved.minPrice.
  campaignRadar: {
    minCommissionPct: number;
    minDaysRemaining: number;
    minRemainingBudget: number;
  };
  // Last Call Butler: when a watched Creator Connections campaign crosses this
  // fill level (creator slots claimed / cap, as a percent), the background poll
  // fires a "Last Call" notification so the creator can accept before it closes.
  lastCall: {
    alertAtPct: number;
  };
  // Rule-based accept: "accept campaigns that match rules you set". OPT-IN
  // (enabled is false until the creator turns it on in Settings, after reading
  // the disclosure there). When on, the Last Call poll tab runs these rules
  // over the Creator Connections grid every 30 minutes and clicks Amazon's own
  // Accept on the campaigns that pass, up to the caps. The options page writes
  // this whole object at once because patchSettings shallow-merges. Also gated
  // by tools.autoAccept and the remote "autoAccept" kill flag.
  autoAccept: AutoAcceptSettings;
  // Voiceover Butler: creator profile, script defaults, About Me apparel
  // block, and brand denylist behind the "Draft voiceover (AI)" button in the
  // My Link panel. The options page writes this whole object at once (never a
  // partial nested patch) because patchSettings shallow-merges.
  voiceover: VoiceoverSettings;
  // Marketplace codes (US/CA/UK/AU) whose buy-box availability Campaign Radar
  // checks per campaign product, rendering per-country chips on the grid.
  // Empty (the default) = feature off, zero extra fetches. Top-level rather
  // than nested under campaignRadar because patchSettings shallow-merges and
  // the radar toolbar patches campaignRadar wholesale on every threshold edit.
  availabilityMarkets: string[];
  storefrontHandle: string | null;
  orderHarvestScope: "new" | "all";
  // Link Butler config for the branded-link Ledger tab. `smartRouting` publishes
  // a routing definition (Passport / Best-Rate / heal) when a link is minted, so
  // browser-minted links route at the edge like desktop-minted ones. `pixels`
  // are the account-wide retargeting pixels (the Doorbell); the worker has no
  // read endpoint, so the list is kept here for the form and POSTed on save.
  linkButler: {
    smartRouting: boolean;
    pixels: LinkPixel[];
  };
  // Creator channel mirrored from the desktop app over the bridge. Drives which
  // on-page tools and popup launchers are shown. Defaults to "both" (show
  // everything) so an install that never connects the app is unfiltered.
  creatorMode: CreatorMode;
  // The user's own saved list of deal-aggregator URLs for the Deal Sites
  // Harvester, on top of the curated list served from the site.
  dealSources: string[];
  // Cross-device relay: the default desktop app on ANOTHER computer to send
  // commands to when no local app is running here (e.g. queue a harvested deal
  // to post from the other machine). Chosen in the popup's Remote devices
  // section after linking; null when unconfigured. instanceId is that device's
  // activation token, the receiver id the relay routes to.
  relayDefaultTarget: { instanceId: string; label: string | null } | null;
  locale: LocaleSetting;
  tools: {
    videoCounts: boolean;
    videoLandscape: boolean;
    approved: boolean;
    calculator: boolean;
    storefront: boolean;
    ordersButler: boolean;
    searchOverlay: boolean;
    storeOverlay: boolean;
    trendRadar: boolean;
    globalMaximizer: boolean;
    campaignMatcher: boolean;
    campaignRadar: boolean;
    earningsOverlay: boolean;
    watchlist: boolean;
    lastCallButler: boolean;
    ideaListOverlay: boolean;
    // Deals overlay: money-signal badges on the Today's Deals grid
    // (amazon.com/deals). Same scoring as the search overlay, sourcing ASINs
    // from the MAIN-world deals hook. On by default; backfilled to true for
    // existing users by the tools shallow-merge in migrate().
    dealsOverlay: boolean;
    // Campaign Butler: the on-demand "Butler's Brief" panel on Creator
    // Connections campaigns (score + confidence + AI reasoning). Backfilled to
    // true for existing users by the tools shallow-merge in migrate().
    campaignButler: boolean;
    // Campaign detail overlay: the persistent per-product panel on a single
    // campaign's /p/connect/request page (demand + creator-video saturation +
    // verdict). Backfilled to true by the tools shallow-merge in migrate().
    campaignDetail: boolean;
    // Video Money: per-row earnings / EPV / live-rate / demand badges plus a
    // reshoot panel on the Creator Hub "Manage videos" list. Backfilled to true
    // for existing users by the tools shallow-merge in migrate().
    videoMoney: boolean;
    // Brand Keywords: badge each Creator Connections Messages conversation with
    // the search keyword the desktop "Message Brands" tool used to find that
    // brand (read from the app over the bridge). Self-gates to paired users with
    // outreach history, so it is a no-op for everyone else. Backfilled to true
    // for existing users by the tools shallow-merge in migrate().
    brandKeywords: boolean;
    // Message Templates: a Save + one-click "load a template into the message"
    // toolbar on the Creator Connections Messages composer. Saves templates
    // locally and also lists the desktop app's own templates (read over the
    // bridge) so both sides share one library. On by default; backfilled to true
    // for existing users by the tools shallow-merge in migrate().
    messageTemplates: boolean;
    // Ownership: a live "you already own this / you already posted this" badge on
    // product pages and search/deals tiles, read from the desktop Orders Butler
    // (order history) + content-coverage (Storefront / Deals / YouTube) over
    // the bridge. Self-gates to paired users who own/posted the product, so it is
    // a no-op for everyone else. On by default; backfilled to true for existing
    // users by the tools shallow-merge in migrate().
    ownership: boolean;
    // Shows an "Enrolled in Creator Connections / SPCC" badge on product pages,
    // read from the desktop app's accepted-history ledger (kept fresh by its hourly
    // sync) over the bridge. Self-gates to paired users who are actually enrolled,
    // so it is a no-op for everyone else. On by default; backfilled to true for
    // existing users by the tools shallow-merge in migrate().
    enrolledBadge: boolean;
    // Master gate for all Walmart.com support (the neutral overlays run on
    // Walmart pages when this is on). Lets a user turn Walmart off without
    // touching their Amazon overlays. Backfilled to true by the tools
    // shallow-merge in migrate().
    walmart: boolean;
    // Standalone campaign accept: "Accept CC campaign" without the desktop app,
    // by driving Amazon's own Accept button (in-page on the campaign grid, or
    // in a background tab from a product / upload page). The desktop bridge is
    // still preferred when paired. Also the key the remote flags kill switch
    // targets ("standaloneAccept" in disabledTools). On by default; backfilled
    // to true for existing users by the tools shallow-merge in migrate().
    standaloneAccept: boolean;
    // Upload-page campaign prompts: on the Creator Hub "Edit Video" page, flag
    // any tagged product that has a Creator Connections / SPCC campaign (from
    // the local membership filters) with an Accept button, so the campaign is
    // joined before the video goes live. On by default; backfilled to true for
    // existing users by the tools shallow-merge in migrate().
    uploadCampaignPrompt: boolean;
    // Rule-based accept tool gate. On by default but meaningless until the
    // creator opts in via settings.autoAccept.enabled; this is the key the
    // remote flags kill switch targets ("autoAccept" in disabledTools) and the
    // one a support flow can flip off without touching the creator's rules.
    // Backfilled to true by the tools shallow-merge in migrate().
    autoAccept: boolean;
  };
  syncEnabled: boolean;
  // Opt-in (default OFF): contribute product facts (ASIN, price, best-seller
  // rank, "bought in past month", category, brand) AND de-identified video
  // placement observations (which creator videos hold a product's carousel, and
  // where) the extension already reads, to the shared catalogue, so the whole
  // community sees real demand, price/rank history, and video competition over
  // time. Never personal data. Gated at the transport: when off, none of these
  // are transmitted. Requires syncEnabled + a signed-in key. Widening what this
  // shares is a user-facing disclosure change (see contributeBlurb), not a
  // silent addition, and rides the same pending legal review as the catalogue.
  contributeCatalogue: boolean;
  debug: boolean;
};

// Where a marketplace's incremental harvest last stopped. "Only new since
// last run" walks newest-first and halts at lastOrderId, so ongoing syncs
// finish in seconds instead of re-walking the whole history.
export type OrderCursor = {
  lastOrderId: string;
  lastHarvestAt: number;
};

export type AuthState = {
  licenseKey: string | null;
  // Masked email for display only (e***@gmail.com). The server never sends the
  // raw address to a license-bearer client. API auth uses licenseKey, not this.
  email: string | null;
  verifiedAt: number | null;
};

// The affiliate who referred this install, captured first-touch from the
// ib_aff_src cookie / ?code= param on an influencerbutler.com visit (see the
// site-referral content script). Kept durably here - unlike the 30-day web
// cookie - so that when the user later connects a license key, the extension
// can hand the code to /api/extension/auth/check and the affiliate is credited
// even weeks later or on another device. First-touch: never overwritten once
// set, so the first affiliate a user encountered wins.
export type AffiliateReferralState = {
  // The branded affiliate code, as captured (upper-cased by the site).
  code: string;
  // When it was captured (epoch ms). Sent to the server as the causal floor for
  // back-attributing already-paid orders.
  capturedAt: number;
  // Where it came from ("cookie" | "param"), for debugging only.
  source: string | null;
};

// Third-party API integrations (OpenAI, Amazon Creators API, deeplink
// providers, affiliate networks) configured on the options page. Credentials
// are encrypted at rest with AES-GCM (see src/integrations/crypto.ts) and never
// leave the machine: tests and live use call each provider's own API directly.
// The one exception is the Influencer Butler branded-link provider, which is a
// first-party service (links.influencerbutler.com) authenticated with the
// signed-in license key rather than a stored third-party credential. Keyed by
// the adapter id (src/integrations).
export type EncryptedBlob = { iv: string; ct: string };

export type IntegrationTestStatus = "untested" | "ok" | "fail";

export type IntegrationTestResult = {
  status: IntegrationTestStatus;
  at: number | null;
  message: string | null;
};

export type IntegrationState = {
  enabled: boolean;
  // Encrypted JSON of the provider's credential fields (Record<string,string>),
  // or null when nothing has been saved yet.
  credentialsEnc: EncryptedBlob | null;
  lastTest: IntegrationTestResult;
  // Whether this provider takes part in affiliate routing when connected.
  routingParticipates: boolean;
};

export type IntegrationsState = {
  global: {
    // Run every saved test on browser startup (adds a few seconds; off by default).
    testOnStartup: boolean;
    // Master switch for rewriting Amazon links through connected providers.
    affiliateRoutingEnabled: boolean;
    // When on, routing picks the connected provider with the highest known
    // commission rate per product (tie-broken by the fixed priority order),
    // mirroring the desktop app's "highest commission" strategy. When off,
    // routing keeps the fixed priority order (networks first, then Amazon).
    useHighestCommission: boolean;
    // Which roster providers may take part in affiliate routing, keyed by the
    // roster id shown on the Affiliate Routing Strategy card: "amazon",
    // "levanta", "archer", "mavely", "walmart". A missing key means enabled
    // (default all on). Networks also honor their per-provider
    // routingParticipates flag.
    routingProviders: Record<string, boolean>;
    // Which deeplink provider wraps generated links (adapter id), or null.
    primaryDeeplinkProvider: string | null;
    // Which Walmart link provider mints Walmart affiliate links
    // ("walmartCreator" | "mavely"), or null when the creator has not chosen
    // one yet.
    walmartLinkProvider: string | null;
    // Amazon Associates tag per marketplace country code, for example
    // { US: "mytag-20", UK: "mytag-21" }. US defaults to the storefront handle.
    perCountryTags: Record<string, string>;
    // When on, every Amazon link the extension builds carries Amazon's own
    // SiteStripe share params (linkCode=ssc + creativeASIN) so it opens the
    // Amazon app on phones. Free and first-party; on by default.
    appOpeningLinks: boolean;
  };
  providers: Record<string, IntegrationState>;
};

export const DEFAULT_INTEGRATION_STATE: IntegrationState = {
  enabled: false,
  credentialsEnc: null,
  lastTest: { status: "untested", at: null, message: null },
  routingParticipates: true,
};

export type CachedScan = {
  counts: VideoCounts;
  title?: string;
  inStock: boolean;
  ts: number;
};

// A single observed price for a product, so the product panel can draw a small
// price-history sparkline and flag an all-time low. Built locally from the
// prices the extension already reads as the creator browses (no extra fetch, no
// server): the record starts empty and grows over time. Keyed by
// `marketplace:asin`; points are kept oldest-first.
export type PricePoint = { at: number; cents: number };

// Bounds so the history can never grow without limit: at most this many points
// per product, and at most this many products tracked (least-recently-seen
// products drop out first).
export const PRICE_HISTORY_POINTS_CAP = 90;
export const PRICE_HISTORY_ASINS_CAP = 300;

// One ASIN the user is watching for a change. The background poller opens each
// watched product briefly on an alarm, reads its current state, and fires a
// notification when a subscribed condition trips. `last` is the state at the
// previous check, so a change is a diff against it; null until the first check.
export type WatchCondition = "back_in_stock" | "slot_opens" | "price_drop";

export type WatchSnapshot = {
  inStock: boolean | null;
  influencerVideos: number | null;
  priceCents: number | null;
  checkedAt: number;
};

export type WatchItem = {
  asin: string;
  marketplace: string;
  title: string | null;
  // Product thumbnail, backfilled once from the Creator API when the popup
  // first renders the row (older items predate this field, so it may be absent
  // on read and is treated as null). Never overwritten once a real value lands.
  imageUrl: string | null;
  addedAt: number;
  notifyOn: WatchCondition[];
  last: WatchSnapshot | null;
};

// A product cannot be watched forever with no ceiling: cap the list so the
// background poller's per-alarm work (one background tab per item, paced) stays
// bounded. Oldest entries are kept; adds past the cap are rejected in the UI.
export const WATCHLIST_CAP = 50;

// One product saved into a user-named list ("Add to List"). Lighter than a
// WatchItem: lists are just curated collections for research/planning, with no
// background polling, so they carry only what a card needs to render + reopen.
export type ProductListItem = {
  asin: string;
  marketplace: string;
  title: string | null;
  imageUrl: string | null;
  addedAt: number;
};

// A user-named collection of products. `id` is a stable local id (not an ASIN),
// so two lists can hold the same product and a rename never moves items.
export type ProductList = {
  id: string;
  name: string;
  createdAt: number;
  items: ProductListItem[];
};

// Bounds mirroring the watchlist's: enough for real research use without letting
// local storage grow unbounded. Adds past a cap are rejected in the UI.
export const PRODUCT_LISTS_CAP = 30;
export const PRODUCT_LIST_ITEMS_CAP = 200;

// One reusable outreach message the creator saved from the Creator Connections
// Messages composer (the Message Templates tool). Local-only and never synced to
// the server; the tool separately reads the desktop app's own templates live
// over the bridge and merges them into the picker at display time. `body` may
// contain {placeholder} tokens (e.g. {brandName}); they are resolved on insert.
export type Template = {
  // Stable local id (not derived from the label, so a rename never moves it).
  id: string;
  label: string;
  body: string;
  createdAt: number;
  updatedAt: number;
};

// Enough saved templates for real use without letting local storage grow
// unbounded. Adds past the cap are rejected in the UI.
export const TEMPLATES_CAP = 50;

// One Creator Connections campaign the creator is watching for Last Call: an
// alert before it fills up. Keyed by the Amazon campaignId. `lastFillPct` and
// `lastFullyClaimed` are the last observed values, so the poll fires the alert
// exactly once when the fill first crosses the user's threshold (or the campaign
// first flips to fully claimed) and stays quiet afterward.
export type CampaignWatchItem = {
  campaignId: string;
  brand: string | null;
  addedAt: number;
  lastFillPct: number | null;
  lastFullyClaimed: boolean | null;
  notifiedAt: number | null;
};

// The campaign watchlist is bounded like the product one. The poll opens the
// grid in a single background tab per cycle regardless of list size, but the cap
// keeps the stored list and the per-campaign diff work sane.
export const CAMPAIGN_WATCHLIST_CAP = 50;

// Per-nudge delivery state for the re-engagement prompts (join the Facebook
// group on day 1, download the free desktop app on day 3). Each nudge reaches
// the user through two channels: an OS notification (fired by the background on
// an alarm) and an in-page modal (shown by the content script on the next
// Amazon visit). `notifiedAt`/`modalShownAt` make each channel fire at most
// once; `actedAt` (set when the user clicks either one) suppresses the other so
// nobody is nagged twice for the same thing.
export type NudgeState = {
  notifiedAt: number | null;
  modalShownAt: number | null;
  actedAt: number | null;
};

export type NudgesState = {
  fbGroup: NudgeState;
  appDownload: NudgeState;
  communityNotice: NudgeState;
};

export const DEFAULT_NUDGE_STATE: NudgeState = {
  notifiedAt: null,
  modalShownAt: null,
  actedAt: null,
};

// One-time in-page hints. Unlike the nudges above these are not timed and have
// no notification channel: a hint is drawn next to the feature it explains, and
// the first interaction (act or dismiss) stamps the key so it never shows again.
// null means "not settled yet", a timestamp means done.
export type HintsState = {
  // "Copy my link" tip pointing out free branded short links, shown to a
  // signed-in creator who is still copying plain tagged Amazon urls.
  brandedLinks: number | null;
  // Stamped the first time we auto-fill the storefront handle from the creator's
  // own Creator Hub, so the "Detected your storefront" toast shows at most once
  // even though the auto-fill itself re-runs whenever the field is empty.
  storefrontAutofill: number | null;
};

export const DEFAULT_HINTS_STATE: HintsState = {
  brandedLinks: null,
  storefrontAutofill: null,
};

// First-run walkthrough progress. Mirrors the desktop app's walkthroughComplete
// + onboardingStepIndex: completedAt stamps when the user finished (or skipped),
// stepIndex resumes a reopened wizard on the right step, and skipped records that
// they chose to skip rather than complete. Opened once on fresh install and
// replayable from the popup afterward.
export type OnboardingState = {
  completedAt: number | null;
  stepIndex: number;
  skipped: boolean;
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completedAt: null,
  stepIndex: 0,
  skipped: false,
};

export type StorageShape = {
  schemaVersion: number;
  settings: Settings;
  auth: AuthState;
  // The referring affiliate (first-touch), or null if none captured. See
  // AffiliateReferralState.
  affiliate: AffiliateReferralState | null;
  integrations: IntegrationsState;
  queue: Finding[];
  lastSyncAt: number | null;
  cache: Record<string, CachedScan>;
  // Maps a child variant to its listing's parent ASIN, keyed `marketplace:asin`,
  // value the bare parent ASIN. Written whenever a product page is scanned (for
  // the viewed ASIN and every sibling in its twister), so the search overlay can
  // roll a card up to a sibling variant's already-scanned video split instead of
  // showing a thinner per-variant estimate. A hint cache: bounded, best-effort.
  variantParents: Record<string, string>;
  // Price history per `marketplace:asin`, oldest-first. See PricePoint.
  priceHistory: Record<string, PricePoint[]>;
  orderCursors: Record<string, OrderCursor>;
  watchlist: WatchItem[];
  campaignWatchlist: CampaignWatchItem[];
  // User-named product collections ("Add to List"). Local-only, no server sync.
  productLists: ProductList[];
  // Saved outreach message templates (the Message Templates tool). Local-only;
  // desktop-app templates are read live over the bridge, not stored here.
  templates: Template[];
  telemetry: { selectorMisses: Record<string, number> };
  // When the extension was first actually used (first content-script run on an
  // Amazon page). Anchors the re-engagement nudge timers; null until first use.
  firstUseAt: number | null;
  nudges: NudgesState;
  hints: HintsState;
  // First-run walkthrough progress (see OnboardingState).
  onboarding: OnboardingState;
};

// The rules behind "accept campaigns that match rules you set". Every number is
// clamped by normalizeAutoAccept (in migrate and on every options-page save),
// so the runner can trust the stored values.
export type AutoAcceptSettings = {
  // Opt-in master switch. Off on a fresh install and after every migration
  // that lacks the block; never backfilled to true.
  enabled: boolean;
  // A campaign must pay at least this commission rate (percent).
  minCommissionPct: number;
  // Which Campaign Radar score bands qualify (the band of computeCampaignScore).
  bands: CampaignScoreBand[];
  // Skip a campaign ending within this many hours (its runway is too short to
  // film, post, and earn). Compared as whole days: hours / 24.
  excludeEndingWithinHours: number;
  // At most this many rule-based accepts per local calendar day
  // (1..AUTO_ACCEPT_DAILY_HARD_CAP).
  dailyCap: number;
  // At most this many accepts per 30-minute pass (1..AUTO_ACCEPT_PER_RUN_HARD_CAP).
  perRunCap: number;
};

export const AUTO_ACCEPT_BANDS: readonly CampaignScoreBand[] = ["hot", "warm", "cool"];

const clampInt = (n: unknown, lo: number, hi: number, fallback: number): number => {
  const v = typeof n === "number" && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.min(hi, Math.max(lo, v));
};

// Clamp the daily cap to 1..AUTO_ACCEPT_DAILY_HARD_CAP. Exported so the options
// page and the runner clamp exactly the way migrate() does.
export function clampAutoAcceptDailyCap(n: unknown): number {
  return clampInt(n, 1, AUTO_ACCEPT_DAILY_HARD_CAP, DEFAULT_AUTO_ACCEPT.dailyCap);
}

export function clampAutoAcceptPerRunCap(n: unknown): number {
  return clampInt(n, 1, AUTO_ACCEPT_PER_RUN_HARD_CAP, DEFAULT_AUTO_ACCEPT.perRunCap);
}

// Pure: coerce an untrusted (stored / typed) autoAccept block into a valid one.
// Missing or malformed fields fall back to the defaults; `enabled` is true only
// for an explicit true. Bands keep only known values, in canonical order, and
// an empty list falls back to the default ("hot"): an empty band list would
// silently match nothing, which reads as broken.
export function normalizeAutoAccept(raw: unknown): AutoAcceptSettings {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rawBands = Array.isArray(obj.bands) ? obj.bands : [];
  const bands = AUTO_ACCEPT_BANDS.filter((b) => rawBands.includes(b));
  const minCommission =
    typeof obj.minCommissionPct === "number" && Number.isFinite(obj.minCommissionPct)
      ? Math.min(100, Math.max(0, obj.minCommissionPct))
      : DEFAULT_AUTO_ACCEPT.minCommissionPct;
  return {
    enabled: obj.enabled === true,
    minCommissionPct: minCommission,
    bands: bands.length ? bands : [...DEFAULT_AUTO_ACCEPT.bands],
    excludeEndingWithinHours: clampInt(
      obj.excludeEndingWithinHours,
      0,
      24 * 90,
      DEFAULT_AUTO_ACCEPT.excludeEndingWithinHours,
    ),
    dailyCap: clampAutoAcceptDailyCap(obj.dailyCap),
    perRunCap: clampAutoAcceptPerRunCap(obj.perRunCap),
  };
}

const DEFAULT_AUTO_ACCEPT: AutoAcceptSettings = {
  enabled: false,
  minCommissionPct: 12,
  bands: ["hot"],
  excludeEndingWithinHours: 48,
  dailyCap: 5,
  perRunCap: 2,
};

export const DEFAULTS: StorageShape = {
  schemaVersion: 28,
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
    campaignRadar: {
      minCommissionPct: 10,
      minDaysRemaining: 7,
      minRemainingBudget: 1000,
    },
    lastCall: {
      alertAtPct: 90,
    },
    autoAccept: { ...DEFAULT_AUTO_ACCEPT, bands: [...DEFAULT_AUTO_ACCEPT.bands] },
    voiceover: {
      tone: "",
      niche: "",
      audience: "",
      defaults: {
        lengthSeconds: 30,
        videoType: "social-hook",
        hookStyle: "relatable",
        hookCustom: "",
        pacing: "standard",
        disclosureKey: "honest-paid-sample",
      },
      aboutMe: {
        height: "",
        topSize: "",
        bustSize: "",
        dressSize: "",
        pantSize: "",
        shoeSize: "",
        hairColor: "",
        eyeColor: "",
        skinTone: "",
        preferredColors: "",
        preferredStyles: "",
      },
      brandDenylist: [],
    },
    availabilityMarkets: [],
    storefrontHandle: null,
    orderHarvestScope: "new",
    linkButler: { smartRouting: false, pixels: [] },
    creatorMode: "both",
    dealSources: [],
    relayDefaultTarget: null,
    locale: "auto",
    tools: {
      videoCounts: true,
      videoLandscape: true,
      approved: true,
      calculator: true,
      storefront: true,
      ordersButler: true,
      searchOverlay: true,
      storeOverlay: true,
      trendRadar: true,
      globalMaximizer: true,
      campaignMatcher: true,
      campaignRadar: true,
      earningsOverlay: true,
      watchlist: true,
      lastCallButler: true,
      ideaListOverlay: true,
      dealsOverlay: true,
      campaignButler: true,
      campaignDetail: true,
      videoMoney: true,
      brandKeywords: true,
      messageTemplates: true,
      ownership: true,
      enrolledBadge: true,
      walmart: true,
      standaloneAccept: true,
      uploadCampaignPrompt: true,
      autoAccept: true,
    },
    syncEnabled: true,
    contributeCatalogue: false,
    debug: false,
  },
  auth: { licenseKey: null, email: null, verifiedAt: null },
  affiliate: null,
  integrations: {
    global: {
      testOnStartup: false,
      affiliateRoutingEnabled: false,
      // On by default: routing picks the highest-commission connected provider
      // per product out of the box, so the creator earns the most without having
      // to discover the toggle. They can switch back to fixed-order on the
      // Settings page. This default reaches fresh installs; migrate() also
      // backfills it onto pre-v25 installs that never stored the key.
      useHighestCommission: true,
      // Every roster provider takes part by default; the creator can exclude one
      // on the Affiliate Routing Strategy card. Backfilled onto existing installs
      // by the global shallow-merge in migrate().
      routingProviders: { amazon: true, levanta: true, archer: true, mavely: true, walmart: true },
      // Branded short links out of the box: free on every plan, no credentials
      // (the signed-in license is the auth), and it keeps the creator's
      // affiliate tag out of the url they post. This default reaches FRESH
      // INSTALLS ONLY. migrate() spreads stored global state over these
      // defaults, and any patchState writes the whole blob back, so an existing
      // install has `primaryDeeplinkProvider: null` stored explicitly and keeps
      // it. Existing users are reached by the one-time hint in the "My link"
      // panel instead, which asks rather than deciding for them.
      primaryDeeplinkProvider: "influencerbutler",
      // No Walmart provider until the creator connects one (fresh installs and
      // existing users alike start null; the global shallow-merge backfills it).
      walmartLinkProvider: null,
      perCountryTags: {},
      // App-opening Amazon links on by default (fresh installs and, via the
      // global shallow-merge in migrate(), pre-v26 installs alike).
      appOpeningLinks: true,
    },
    providers: {},
  },
  queue: [],
  lastSyncAt: null,
  cache: {},
  variantParents: {},
  priceHistory: {},
  orderCursors: {},
  watchlist: [],
  campaignWatchlist: [],
  productLists: [],
  templates: [],
  telemetry: { selectorMisses: {} },
  firstUseAt: null,
  nudges: {
    fbGroup: { ...DEFAULT_NUDGE_STATE },
    appDownload: { ...DEFAULT_NUDGE_STATE },
    communityNotice: { ...DEFAULT_NUDGE_STATE },
  },
  hints: { ...DEFAULT_HINTS_STATE },
  onboarding: { ...DEFAULT_ONBOARDING_STATE },
};

export function migrate(raw: Partial<StorageShape> | undefined): StorageShape {
  if (!raw || typeof raw.schemaVersion !== "number") {
    return structuredClone(DEFAULTS);
  }
  // Future schema bumps switch on raw.schemaVersion here. Merging with defaults
  // also backfills any keys added within a version. v1 -> v2 added the
  // integrations slice; v2 -> v3 added firstUseAt + nudges; v3 -> v4 added the
  // watchlist array plus the searchOverlay/campaignMatcher/watchlist tool flags;
  // v4 -> v5 added the priceHistory map; v5 -> v6 added the campaignRadar
  // thresholds plus the campaignRadar tool flag; v6 -> v7 added
  // settings.creatorMode (defaults to "both", so existing users stay
  // unfiltered until the app reports their channel); v7 -> v8 added
  // settings.linkButler (smart-routing off, no pixels); v8 -> v9 added the
  // storeOverlay tool flag (brand-store research overlay, on by default);
  // v9 -> v10 added the trendRadar tool flag (Best Sellers / New Releases /
  // Movers & Shakers discovery overlay) and the globalMaximizer tool flag
  // (per-market availability + international links), both on by default.
  // v10 -> v11 added Last Call Butler (the lastCallButler tool flag, on by
  // default, the settings.lastCall.alertAtPct threshold at 90%, and the empty
  // campaignWatchlist array) plus the `hints` map (one-time in-page tips); an
  // existing user starts with every hint unseen, so the branded-links tip
  // reaches people who installed before it existed, which is the whole point
  // of it. Older stored state simply gains its defaults untouched (an
  // existing user's price history starts empty). v11 -> v12 added the
  // ideaListOverlay tool flag (money signals on Idea List detail pages, on
  // by default); the tools shallow-merge backfills it. v12 -> v13 added
  // settings.contributeCatalogue (shared product-catalogue contribution,
  // OFF by default); the settings shallow-merge backfills it, so every
  // existing user stays opted OUT until they turn it on. v13 -> v14 added the
  // productLists array ("Add to List" collections); an existing user starts
  // with no lists, reconciled below like the watchlist. v14 -> v15 added the
  // videoLandscape tool flag (aggregate video-intelligence panel on product
  // pages, on by default); the tools shallow-merge backfills it. v15 -> v16
  // added the videoMoney tool flag (per-row money signals + reshoot panel on
  // the Creator Hub "Manage videos" list, on by default); the tools
  // shallow-merge backfills it. v16 -> v17 added Walmart.com support: the
  // tools.walmart master gate (on by default, backfilled by the tools
  // shallow-merge) and integrations.global.walmartLinkProvider (null until the
  // creator connects Impact or Walmart Creator, backfilled by the global
  // shallow-merge). v17 -> v18 replaced the credential-based Walmart link
  // providers with session-based ones: the Impact provider is gone (a stored
  // "impact" selection resets to null and its saved credentials are dropped),
  // and Walmart Creator no longer takes publisher/campaign/ad ids, so its
  // stale stored credentials are cleared and its test badge reset. v18 -> v19
  // added settings.voiceover (Voiceover Butler creator profile, script
  // defaults, About Me apparel block, brand denylist), deep-merged below
  // because patchSettings shallow-merges nested blocks. v19 -> v20 added the
  // brandKeywords tool flag (keyword chips on the Creator Connections Messages
  // widget, on by default); the tools shallow-merge backfills it. v20 -> v21
  // added the dealsOverlay tool flag (money signals on the Today's Deals grid,
  // on by default); the tools shallow-merge backfills it. v21 -> v22 added the
  // top-level `affiliate` slice (the referring affiliate captured on the site,
  // for extension-carried attribution); an existing user starts with null and
  // gains a code the first time they revisit influencerbutler.com with an
  // affiliate cookie set. v22 -> v23 added the messageTemplates tool flag (Save
  // + one-click load on the Creator Connections Messages composer, on by
  // default, backfilled by the tools shallow-merge) and the top-level
  // `templates` array (saved outreach messages); an existing user starts with no
  // saved templates, reconciled below like productLists. v23 -> v24 added the
  // `onboarding` slice (first-run walkthrough progress) and the
  // hints.storefrontAutofill stamp; both backfill from their defaults (an
  // existing user starts with onboarding uncompleted, so the walkthrough is
  // available to replay from the popup but never force-opens on an update).
  // v24 -> v25 added integrations.global.useHighestCommission (on by default,
  // so both fresh installs and pre-v25 installs that never stored the key get
  // highest-commission routing) and
  // integrations.global.routingProviders (the Affiliate Routing Strategy roster,
  // every provider on by default); both backfill through the global
  // shallow-merge, with routingProviders deep-merged so a stored partial roster
  // still gains any newly added provider key. v25 -> v26 added
  // integrations.global.appOpeningLinks (SiteStripe app-opening params on every
  // Amazon link, on by default); the global shallow-merge backfills it.
  // v26 -> v27 added tools.standaloneAccept (accept a CC campaign without the
  // desktop app) and tools.uploadCampaignPrompt (campaign prompts on the
  // Creator Hub upload page), both on by default; the tools shallow-merge
  // backfills them. v27 -> v28 added settings.autoAccept (rule-based accept:
  // OPT-IN, enabled stays false unless stored true; the other fields deep-merge
  // and clamp through normalizeAutoAccept) and tools.autoAccept (on by default,
  // the kill-flag key; the tools shallow-merge backfills it).
  const migratedProviders = { ...(raw.integrations?.providers ?? {}) };
  delete migratedProviders.impact;
  if (migratedProviders.walmartCreator) {
    migratedProviders.walmartCreator = {
      ...migratedProviders.walmartCreator,
      credentialsEnc: null,
      lastTest: { status: "untested", at: null, message: null },
    };
  }
  const migratedGlobal = {
    ...structuredClone(DEFAULTS.integrations.global),
    ...(raw.integrations?.global ?? {}),
    perCountryTags: { ...(raw.integrations?.global?.perCountryTags ?? {}) },
    // Deep-merge the roster so a stored partial map still gains any provider key
    // added in a later version (a bare shallow spread would keep the old map).
    routingProviders: {
      ...structuredClone(DEFAULTS.integrations.global.routingProviders),
      ...(raw.integrations?.global?.routingProviders ?? {}),
    },
  };
  if (migratedGlobal.walmartLinkProvider === "impact") migratedGlobal.walmartLinkProvider = null;
  return {
    ...structuredClone(DEFAULTS),
    ...raw,
    settings: {
      ...structuredClone(DEFAULTS.settings),
      ...(raw.settings ?? {}),
      approved: { ...DEFAULTS.settings.approved, ...(raw.settings?.approved ?? {}) },
      campaignRadar: {
        ...DEFAULTS.settings.campaignRadar,
        ...(raw.settings?.campaignRadar ?? {}),
      },
      lastCall: {
        ...DEFAULTS.settings.lastCall,
        ...(raw.settings?.lastCall ?? {}),
      },
      autoAccept: normalizeAutoAccept({
        ...DEFAULTS.settings.autoAccept,
        ...(raw.settings?.autoAccept ?? {}),
      }),
      voiceover: {
        ...structuredClone(DEFAULTS.settings.voiceover),
        ...(raw.settings?.voiceover ?? {}),
        defaults: {
          ...DEFAULTS.settings.voiceover.defaults,
          ...(raw.settings?.voiceover?.defaults ?? {}),
        },
        aboutMe: {
          ...DEFAULTS.settings.voiceover.aboutMe,
          ...(raw.settings?.voiceover?.aboutMe ?? {}),
        },
        brandDenylist: Array.isArray(raw.settings?.voiceover?.brandDenylist)
          ? raw.settings.voiceover.brandDenylist
          : [],
      },
      linkButler: {
        ...structuredClone(DEFAULTS.settings.linkButler),
        ...(raw.settings?.linkButler ?? {}),
        pixels: Array.isArray(raw.settings?.linkButler?.pixels)
          ? raw.settings.linkButler.pixels
          : [],
      },
      tools: { ...DEFAULTS.settings.tools, ...(raw.settings?.tools ?? {}) },
      availabilityMarkets: Array.isArray(raw.settings?.availabilityMarkets)
        ? raw.settings.availabilityMarkets
        : [],
    },
    auth: { ...DEFAULTS.auth, ...(raw.auth ?? {}) },
    affiliate: normalizeAffiliate(raw.affiliate),
    integrations: {
      global: migratedGlobal,
      providers: migratedProviders,
    },
    telemetry: { selectorMisses: { ...(raw.telemetry?.selectorMisses ?? {}) } },
    nudges: {
      fbGroup: { ...DEFAULT_NUDGE_STATE, ...(raw.nudges?.fbGroup ?? {}) },
      appDownload: { ...DEFAULT_NUDGE_STATE, ...(raw.nudges?.appDownload ?? {}) },
      communityNotice: { ...DEFAULT_NUDGE_STATE, ...(raw.nudges?.communityNotice ?? {}) },
    },
    hints: { ...DEFAULT_HINTS_STATE, ...(raw.hints ?? {}) },
    onboarding: { ...DEFAULT_ONBOARDING_STATE, ...(raw.onboarding ?? {}) },
    watchlist: Array.isArray(raw.watchlist) ? raw.watchlist : [],
    campaignWatchlist: Array.isArray(raw.campaignWatchlist) ? raw.campaignWatchlist : [],
    productLists: Array.isArray(raw.productLists) ? raw.productLists : [],
    templates: Array.isArray(raw.templates) ? raw.templates : [],
    priceHistory:
      raw.priceHistory && typeof raw.priceHistory === "object" ? raw.priceHistory : {},
    variantParents:
      raw.variantParents && typeof raw.variantParents === "object" ? raw.variantParents : {},
    schemaVersion: 28,
  };
}

// Coerce a stored affiliate slice back to a valid AffiliateReferralState or
// null. Defensive: a malformed value (from a tampered storage or a partial
// write) must never break sign-in, which reads code/capturedAt off it.
function normalizeAffiliate(
  raw: AffiliateReferralState | null | undefined,
): AffiliateReferralState | null {
  if (!raw || typeof raw !== "object") return null;
  const code = typeof raw.code === "string" ? raw.code.trim() : "";
  if (!code) return null;
  const capturedAt =
    typeof raw.capturedAt === "number" && Number.isFinite(raw.capturedAt) ? raw.capturedAt : 0;
  const source = typeof raw.source === "string" ? raw.source : null;
  return { code, capturedAt, source };
}
