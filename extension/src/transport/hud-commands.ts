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
  | { type: "sample.request"; brand: string; product?: ProductRef };

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
