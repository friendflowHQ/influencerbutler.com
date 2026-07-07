// Commands the extension sends INTO the running desktop app (HUD) over the
// local bridge. Distinct from Finding sync (which flows the other way): these
// are user-triggered "do this now" actions. Field shapes mirror the command
// envelopes in docs/extension-local-bridge.md so the desktop receiver and the
// extension serialize the same thing.

export type ProductRef = {
  asin: string;
  marketplace: string;
  title?: string;
  priceCents?: number | null;
  currency?: string;
  imageUrl?: string;
  commissionRatePct?: number | null;
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
  | { type: "content.push"; product: ProductRef }
  // Batch push of harvested order products into the Content Butler planner.
  | { type: "content.push.batch"; products: ProductRef[] }
  | { type: "campaign.accept"; kind: "cc" | "spcc"; product: ProductRef }
  // Batch "accept all available campaigns" found across a storefront scan.
  | { type: "campaign.accept.batch"; items: Array<{ kind: "cc" | "spcc"; product: ProductRef }> }
  // Batch push of storefront-checkup issues into the desktop Retag Butler.
  | { type: "retag.push"; issues: RetagIssue[] }
  | { type: "collaboration.add"; product: ProductRef };

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
};
