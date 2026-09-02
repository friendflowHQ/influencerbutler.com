// Commands the extension sends INTO the running desktop app (HUD) over the
// local bridge. Distinct from Finding sync (which flows the other way): these
// are user-triggered "do this now" actions. Field shapes mirror the command
// envelopes in docs/extension-local-bridge.md so the desktop receiver and the
// extension serialize the same thing.

import type { CreatorMode } from "../shared/creator-mode";

export type ProductRef = {
  asin: string;
  marketplace: string;
  title?: string;
  priceCents?: number | null;
  currency?: string;
  imageUrl?: string;
  commissionRatePct?: number | null;
  // Canonical product url for the item on its own marketplace (Amazon /dp/,
  // Walmart /ip/). Sent so the desktop persists the right link instead of
  // rebuilding an Amazon-shaped url from the id: for a non-Amazon retailer that
  // synthesized url would be wrong.
  url?: string;
  // A ready-to-post affiliate/tracked link when the extension could mint one for
  // this retailer (e.g. a Walmart Creator / Mavely link). Absent when no link
  // provider is configured; the desktop then falls back to `url`.
  affiliateUrl?: string;
};

// One Instagram Goldmine creator, sent in a batch to the desktop Pitch / Group
// Invite butlers. Field names mirror the desktop enqueue contract (email +
// source) so the receiver keys rows without translation.
export type CreatorRef = {
  username: string;
  email: string;
  fullName?: string | null;
  sourceHashtag?: string;
  followerCount?: number | null;
  engagementRatePct?: number | null;
  profileUrl?: string;
};

// One flagged storefront item, sent in a batch to the desktop Retag Butler.
// Field names mirror the retag-butler row (contentUrl/contentType/contentTitle)
// so the desktop can key rows without translation.
export type RetagIssue = {
  contentUrl: string;
  contentType: "video" | "photo" | "idea-list" | "media-list";
  contentTitle: string;
  issueType: "untagged" | "over_tagged" | "unavailable_product";
};

// Where a captured product should land in the user's Amazon Idea Lists:
// either an existing list (durable amzn1.ideas id, offered from the app's
// status.ideaLists) or a new list by title (the desktop creates it once the
// group reaches Amazon's 2-product minimum).
export type IdeaListTarget = {
  listId?: string;
  newListTitle?: string;
};

// One Amazon Idea List the desktop app knows about (from its storefront
// discovery pass or its own publishes), offered as a capture target.
export type IdeaListRef = {
  listId: string;
  title: string;
};

export type HudCommand =
  | { type: "deal.push"; workspace: string; product: ProductRef }
  // Batch push of harvested deals into one Deals Influencer Butler workspace, from the Deal
  // Sites Harvester. Same target as deal.push, many products at once.
  | { type: "deal.push.batch"; workspace: string; products: ProductRef[] }
  | { type: "content.push"; product: ProductRef }
  // Batch push of harvested order products into the Content Butler planner.
  | { type: "content.push.batch"; products: ProductRef[] }
  | { type: "campaign.accept"; kind: "cc" | "spcc"; product: ProductRef }
  // Batch "accept all available campaigns" found across a storefront scan.
  | { type: "campaign.accept.batch"; items: Array<{ kind: "cc" | "spcc"; product: ProductRef }> }
  // Batch push of storefront-checkup issues into the desktop Retag Butler.
  | { type: "retag.push"; issues: RetagIssue[] }
  | { type: "collaboration.add"; product: ProductRef }
  // Butler Bar "Save to Link Butler": mint + record a Butler Link (branded,
  // app-opening, tracked Calling Card) for the product in the desktop Link
  // Butler, so it shows up in The Ledger. The extension mints its own copyable
  // Calling Card directly; this records + enriches it (routing/Best-Rate). The
  // worker is idempotent per owner+target, so both resolve to the same slug.
  | { type: "link.mint"; product: ProductRef; url?: string; campaign?: string }
  // Batch push of Instagram Goldmine creators into the desktop app. `target`
  // picks the destination butler ("pitch" -> Pitch Butler prospects,
  // "group-invite" -> Group Invite Butler). Mirrors the desktop enqueue
  // contracts (groupInvite.enqueue / pitch:enqueue-contacts) so the receiver
  // keys rows without translation.
  | { type: "creator.push.batch"; target: "pitch" | "group-invite"; creators: CreatorRef[] }
  // Turn the brand of the product being viewed into a Pitch Butler prospect.
  // The desktop resolves/creates the brand and opens a deal; product carries the
  // ASIN context so the pitch links back to what prompted it.
  | { type: "pitch.add"; brand: string; product?: ProductRef }
  // "Generate AI photo": ask the desktop app to make a shoppable AI image for
  // this ASIN using its existing multi-provider image engine (OpenAI / Fal /
  // Ideogram). The desktop reuses its ASIN->image cache so a repeat ask returns
  // the prior render. `style` picks the look ("shoppable" lifestyle hero,
  // "collage" multi-shot, "thumbnail" video thumbnail); the desktop defaults it.
  | { type: "photo.generate"; product: ProductRef; style?: "shoppable" | "collage" | "thumbnail" }
  // "Request a sample": turn the brand of the product being viewed into a Pitch
  // Butler deal pre-staged for a free-sample outreach (the free-sample workflow
  // pill + the sample-request message template), so the creator can send the ask
  // in one step. product carries the ASIN context the sample request is about.
  | { type: "sample.request"; brand: string; product?: ProductRef }
  // "Add to Idea List": queue the product in the desktop Idea List Butler for
  // its target list. The desktop publishes on its schedule (or Run now); the
  // command itself is a pure data write and is idempotent per
  // (asin, marketplace, target).
  | { type: "idealist.push"; product: ProductRef; target: IdeaListTarget }
  // Batch form of idealist.push (many products, each with its own target).
  | { type: "idealist.push.batch"; items: Array<{ product: ProductRef; target: IdeaListTarget }> }
  // "Also save to desktop app": push a template the creator saved in the
  // extension up to the desktop app's own template store, so the same library is
  // available on both sides. `workspace` names the destination store (the
  // extension sends "amazonbutler", the Amazon Creator Connections outreach
  // templates, since that is where the composer lives). The desktop upserts by
  // label and returns command.result { ok }. Idempotent per (workspace, label).
  | { type: "template.save"; workspace: string; template: { label: string; body: string } };

export type HudCommandResult = {
  ok: boolean;
  // A short line the panel can show, e.g. "Added to Garden Bargains" or the
  // reason it could not run.
  message?: string;
  // Set when the command failed because the extension is not paired with the
  // app yet, so the UI can prompt the user to connect instead of showing a
  // generic error.
  needsPairing?: boolean;
};

// Result of the popup's pairing steps.
export type PairResult = {
  ok: boolean;
  // "pending" after the code was requested (app is now showing it); "paired"
  // once the typed code was accepted; "error" otherwise.
  stage: "pending" | "paired" | "error";
  message?: string;
};

export type HudStatus = {
  connected: boolean;
  appVersion?: string;
  // Workspaces the app actually has, when it reports them; the extension
  // falls back to DEAL_WORKSPACES otherwise.
  dealWorkspaces?: Array<{ key: string; label: string }>;
  // Creator channel the user declared in the app ("onsite" | "offsite" |
  // "both"), so the extension can surface only the relevant tools. Absent on
  // older app builds; the reader defaults to "both".
  creatorMode?: CreatorMode;
  // Amazon Idea Lists the app knows about (durable id + title), offered as
  // targets by the "Add to Idea List" capture menu. Absent on older app
  // builds; the menu then offers "New list" only.
  ideaLists?: IdeaListRef[];
};

// What the creator has actually earned on one ASIN, read from the desktop app's
// Daily Commission Butler ledger over the bridge. Earnings are keyed by ASIN
// (not marketplace) and can span currencies; amount is in whole currency units.
//
// `byCurrency`/`totalCount` are the flat totals every build has always sent. The
// `byStore`/`byYear`/`byMonth`/`campaigns` buckets are optional: newer desktop
// builds fill them so the extension can show the full store/year/month/campaign
// breakdown, and any consumer degrades gracefully to the flat totals when they
// are absent. All amounts are in whole currency units.
export type AsinEarnings = {
  asin: string;
  hasEarnings: boolean;
  byCurrency: Array<{ currency: string; amount: number; count: number }>;
  totalCount: number;
  // Per tracking-id (store) split, tagged onsite (on-Amazon storefront/video) vs
  // offsite (links shared elsewhere) and by marketplace, so a creator viewing
  // one storefront can scope earnings to that marketplace instead of the ASIN's
  // worldwide total (the confusion Cha-Ching's ASIN-only rollup caused).
  byStore?: Array<{
    trackingId: string;
    placement: "onsite" | "offsite";
    marketplace: string;
    currency: string;
    amount: number;
    units: number;
    orders: number;
  }>;
  byYear?: Array<{ year: number; currency: string; amount: number; units: number; orders: number }>;
  // month is "YYYY-MM"; used for the earnings-by-month bar chart.
  byMonth?: Array<{ month: string; currency: string; amount: number }>;
  // Creator Connections campaign rows for this ASIN: the campaign name, its
  // commission rate, and the clicks/orders/commission it drove.
  campaigns?: Array<{
    name: string;
    ratePct: number | null;
    clicks: number | null;
    orders: number | null;
    currency: string;
    amount: number;
  }>;
};

// Result of a batched earnings lookup. `paired` is false when the extension has
// never connected the app, so the caller can stay silent rather than error.
export type EarningsLookupResult = {
  ok: boolean;
  paired?: boolean;
  results: AsinEarnings[];
  message?: string;
};

// One point of the desktop app's durable price/rank time-series for an ASIN.
// price is in currency units (not cents); bsr is the best-seller rank.
export type DesktopHistoryPoint = {
  capturedAt: string;
  price: number | null;
  bsr: number | null;
  boughtPastMonth: number | null;
  currency: string | null;
  inStock: boolean | null;
  source: string;
};

// Result of a history.backfill request against the desktop's durable store.
// `paired` is false when the extension has never connected the app, so the
// caller can silently fall back to the local capped store.
export type DesktopHistoryResult = {
  ok: boolean;
  paired?: boolean;
  asin?: string;
  points: DesktopHistoryPoint[];
};

// One thing the running app wants to surface in the extension (a butler run
// finished, earnings synced). Delivered by polling, not push, because an MV3
// worker cannot hold a socket open.
export type AppNotification = {
  seq: number;
  ts: number;
  kind: string;
  title: string;
  body: string;
  url: string | null;
};

// Result of a notification poll: the entries newer than the cursor we sent, and
// the app's current high-water cursor to store for next time.
export type NotifyPollResult = {
  ok: boolean;
  entries: AppNotification[];
  cursor: number;
};

// One brand the creator messaged with the desktop "Message Brands" tool, and the
// search keyword that surfaced it. Read from the app's sent-records ledger over
// the bridge so the Creator Connections Messages widget can show which keyword
// each conversation came from. `keyword` is the most recent one; `keywords`
// lists every distinct keyword the brand was messaged under, newest-first, for
// the chip's hover tooltip. `brandKey` is the app's own lowercased brand name;
// the extension re-normalizes `brand` itself, so exact parity is not required.
export type OutreachRecord = {
  brand: string;
  brandKey: string;
  keyword: string;
  keywords: string[];
  lastSentAt: number;
};

// Result of an outreach.lookup request against the desktop sent-records ledger.
// `paired` is false when the extension has never connected the app, so the
// caller stays silent (no chips) rather than erroring.
export type OutreachKeywordsResult = {
  ok: boolean;
  paired?: boolean;
  records: OutreachRecord[];
};

// One posted/promoted content item for a product, as recorded by the desktop
// app (a Storefront video/photo/idea-list, a Daily Deals post, or a YouTube
// upload). Unioned across every channel so the extension can say "you already
// posted this" and, on hover, where and when.
export type OwnershipPostedItem = {
  type: string; // video | photo | idea-list | deal-post | media-list
  platform: string; // amazon | youtube | facebook | telegram | reddit | instagram | benable
  url: string;
  title: string;
  at: string | null; // ISO timestamp, newest-first in `posted.items`
};

// The order detail the desktop app holds for a product the creator owns, from
// the Orders Butler snapshot. Every field is optional: an older snapshot row, or
// a re-purchase whose price fetch failed, may not carry them.
export type OwnershipOrder = {
  orderId?: string;
  year?: number;
  quantity?: number;
  title?: string;
  paidPrice?: number; // in currency units (e.g. 19.99), not cents
  currency?: string;
  marketplace?: string;
};

// One ASIN's ownership answer. `owned` is true when it is in the creator's synced
// order history; `posted.available` is true when they have already made content
// for it. Only ASINs with at least one of those signals are returned, so the
// caller treats an absent ASIN as "nothing to show". `reviewed` is reserved for a
// later phase (written Amazon reviews are not harvested yet) and is null for now.
export type OwnershipRecord = {
  asin: string;
  owned: boolean;
  order?: OwnershipOrder;
  posted: {
    available: boolean;
    count: number;
    platforms: string[];
    lastAt: string | null;
    items: OwnershipPostedItem[];
  };
  reviewed: null;
};

// Result of an ownership.lookup request against the desktop Orders Butler +
// content-coverage stores. `paired` is false when the extension has never
// connected the app, so the caller can fall back to the server-backed owned list
// (or stay silent) rather than erroring.
export type OwnershipLookupResult = {
  ok: boolean;
  paired?: boolean;
  results: OwnershipRecord[];
  message?: string;
};

// One reusable message template the desktop app knows about, read over the
// bridge so the extension's Message Templates picker can offer the creator's
// desktop-authored templates alongside their extension-local ones. `variations`
// is the desktop template's list of message texts (the extension inserts the
// first one); each may contain {placeholder} tokens resolved on insert.
export type DesktopTemplate = {
  id: string;
  label: string;
  variations: string[];
};

// Result of a templates.lookup request against the desktop app's own template
// store. `values` is the creator's resolved placeholder profile (storefrontUrl,
// address, mediakit, apparel sizes, ...) read from the same workspace settings,
// so the extension can fill {storefrontUrl} and friends the same way the desktop
// would. `paired` is false when the extension has never connected the app, so
// the caller stays silent (no desktop templates) rather than erroring.
export type TemplatesLookupResult = {
  ok: boolean;
  paired?: boolean;
  templates: DesktopTemplate[];
  values: Record<string, string>;
};

// One brand's Creator Connections signal, resolved by the desktop app against
// the global CC brand index (not the creator's own ledger), so the Messages
// widget can badge an *inbound* conversation the creator never pitched. `brand`
// echoes the display name the extension queried, so the two sides join on the
// same normalized key without depending on the app's own casing. Every numeric
// field is nullable: the app returns what the index knows and null for the rest,
// and a record with no rate and no cadence carries no chip.
export type BrandEnrichmentRecord = {
  brand: string;
  bestRatePct: number | null;
  slotsOpen: number | null;
  // Renewal cadence from the app's campaign history: "renews" (runs repeatedly),
  // "occasional", or "one-shot". null when the index has too little history.
  cadence: string | null;
  // Coarse verdict from the same signal ("strong" | "risky" | ...), used only to
  // tint the chip. null when unknown.
  verdict: string | null;
  distinctCampaigns: number | null;
  latestEndsInDays: number | null;
};

// Result of a brand.enrichment request. `paired` is false when the app was never
// connected, so the caller stays silent (no chips) rather than erroring. Records
// are returned only for brands the global index knows; unknown brands are absent.
export type BrandEnrichmentResult = {
  ok: boolean;
  paired?: boolean;
  records: BrandEnrichmentRecord[];
};

// One ASIN's Creator Connections / SPCC enrollment answer, resolved by the desktop
// app against its own accepted-history ledger (cc-check-items.json), kept fresh by
// the app's hourly background sync. This is *personal* enrollment ("you accepted
// this campaign"), a stronger and different signal than the global Bloom
// availability filter the extension checks locally. `ratePct` is the accepted
// campaign's commission rate when known; `epc` is the creator's *realized* revenue
// per click (earnings / clicks) from the Daily Commission Butler ledger, so it is
// null for products the creator has accepted but not yet earned on (not Amazon's
// forecast EPC). Only ASINs the creator is actually enrolled in are returned, so an
// absent ASIN means "not enrolled / nothing to show".
export type CampaignStatusRecord = {
  asin: string;
  cc: boolean;
  spcc: boolean;
  ratePct: number | null;
  epc: number | null; // realized revenue per click, in currency units (e.g. 0.84)
  brand: string | null;
  acceptedAt: string | null;
};

// Result of a campaign.status.lookup request against the desktop accepted-history
// ledger. `paired` is false when the extension has never connected the app; unlike
// ownership there is no server-backed fallback (enrollment lives only on the
// desktop), so the caller simply shows nothing new rather than erroring.
export type CampaignStatusResult = {
  ok: boolean;
  paired?: boolean;
  results: CampaignStatusRecord[];
  message?: string;
};
