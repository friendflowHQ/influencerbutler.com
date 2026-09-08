import { t } from "../../i18n";
import {
  sendToBackground,
  type AcceptOutcome,
  type AcceptResult,
  type AcceptSource,
  type CcRatesResult,
  type HudCommandResult,
  type HudStatus,
} from "../../shared/messages";
import type { ProductRef } from "../../transport/hud-commands";

// Content-side entry for accepting a campaign, from any page that knows a
// product (the product panel's Campaigns block, the Creator Hub upload page).
// Picks the route: the desktop app over the bridge when it is paired (the app
// confirms and accepts, and keeps its own ledger), else our standalone path
// that drives Amazon's own Accept button in a background tab
// (background/campaign-accept.ts). SPCC accepts have no standalone path yet
// (the SPCC tab carries a different card schema we have not verified), so
// without the app they report needs-app and the panel keeps its connect note.

export type AcceptKind = "cc" | "spcc";
export type AcceptRoute = "bridge" | "standalone" | "needs-lookup" | "needs-app";

export type AcceptRequest = {
  asin: string | null;
  marketplace: string;
  kind: AcceptKind;
  campaignId?: string | null;
  brand?: string | null;
  source?: AcceptSource;
  // False when the caller's settings (with remote flags applied) have the
  // standalone tool off: the bridge still runs, but an unpaired CC accept is
  // reported as needs-app instead of opening a tab.
  allowStandalone?: boolean;
};

// Pure: which route an accept takes. The bridge wins whenever the app answered
// and this extension holds a pairing token (paired is undefined on older app
// builds that never reported it, which we treat as paired since `connected`
// alone used to be enough). Standalone needs a Creator Connections campaign id;
// without one the caller resolves it first (needs-lookup) and asks again.
export function chooseAcceptRoute(
  hud: HudStatus | null | undefined,
  kind: AcceptKind,
  campaignId: string | null | undefined,
): AcceptRoute {
  if (hud && hud.connected && hud.paired !== false) return "bridge";
  if (kind !== "cc") return "needs-app";
  return campaignId ? "standalone" : "needs-lookup";
}

export async function requestAccept(input: AcceptRequest): Promise<AcceptResult> {
  let hud: HudStatus | null;
  try {
    hud = await sendToBackground<HudStatus>({ kind: "GET_HUD_STATUS" });
  } catch {
    hud = null;
  }

  const asin = input.asin ? input.asin.trim().toUpperCase() : null;
  let campaignId = input.campaignId ?? null;
  let route = chooseAcceptRoute(hud, input.kind, campaignId);

  if (route === "needs-lookup" && asin && input.allowStandalone !== false) {
    campaignId = await lookupCampaignId(asin);
    route = chooseAcceptRoute(hud, input.kind, campaignId);
  }
  if (input.allowStandalone === false && route !== "bridge") route = "needs-app";

  if (route === "bridge") {
    const product: ProductRef = {
      asin: asin ?? "",
      marketplace: input.marketplace,
      brand: input.brand?.slice(0, 120) || undefined,
    };
    let result: HudCommandResult;
    try {
      result = await sendToBackground<HudCommandResult>({
        kind: "SEND_HUD_COMMAND",
        command: { type: "campaign.accept", kind: input.kind, product },
      });
    } catch {
      return { ok: false, route: "bridge", reason: "error", message: t().couldNotReachApp };
    }
    if (result.ok) {
      return { ok: true, route: "bridge", state: "accepted", message: result.message };
    }
    return {
      ok: false,
      route: "bridge",
      reason: result.needsPairing ? "needs-app" : "error",
      message: result.needsPairing ? t().connectAppToPair : result.message ?? t().couldNotReachApp,
    };
  }

  if (route === "standalone" && campaignId) {
    let outcome: AcceptOutcome;
    try {
      outcome = await sendToBackground<AcceptOutcome>({
        kind: "ACCEPT_CAMPAIGN_IN_TAB",
        campaignId,
        asin,
        marketplace: input.marketplace,
        source: input.source ?? "manual",
      });
    } catch {
      outcome = { ok: false, reason: "error" };
    }
    return { ...outcome, route: "standalone" };
  }

  return {
    ok: false,
    route: "none",
    reason: route === "needs-app" ? "needs-app" : "needs-id",
  };
}

// The campaign a product's Creator Connections rate came from, via the daily
// cc-rates lookup (cached a day in the background). Null when the server has
// no active campaign for the ASIN, or has not learned campaign ids yet.
export async function lookupCampaignId(asin: string): Promise<string | null> {
  try {
    const res = await sendToBackground<CcRatesResult>({ kind: "LOOKUP_CC_RATES", asins: [asin] });
    const id = res.rates[asin]?.campaignId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

// The line a panel shows for a finished accept. Success and the well-known
// failures get their own copy; anything else falls through to the generic
// "could not accept (reason)" so a live failure is at least named.
export function describeAcceptResult(result: AcceptResult): string {
  if (result.ok) {
    if (result.route === "bridge") return result.message ?? t().sentToApp;
    return result.state === "pending" ? t().acceptPending : t().acceptAccepted;
  }
  switch (result.reason) {
    case "blocked":
    case "cooldown":
      return t().acceptCooldown;
    case "not-found":
      return t().acceptNeedsSignIn;
    case "needs-app":
      return result.message ?? t().campaignConnectNote;
    default:
      return result.message ?? t().acceptFailed(result.reason);
  }
}
