import type { IntegrationAdapter, TestResult } from "../types";
import { REQUEST_TIMEOUT_MS, obj, providerError, str } from "../adapter-utils";

// Walmart affiliate link providers. Walmart's affiliate program runs entirely
// through Impact, so both providers here mint a goto.walmart.com tracking link;
// the difference is which credentials the creator has. The user picks ONE in
// options (integrations.global.walmartLinkProvider), mirroring how the primary
// deeplink provider is chosen. routing.ts calls the chosen provider's
// generateLink for Walmart products and falls back to the plain /ip/ url.
//
// Both build Impact's documented deep-link format client-side (no per-link
// network round-trip), which wraps any destination url via the `u` parameter:
//   https://goto.walmart.com/c/<publisherId>/<campaignId>/<adId>?u=<encoded url>
// Impact also offers a server "create deep link" API, but the vanity format is
// what the creator's link tool emits and needs no request per link.
//
// NOTE: the exact publisher/campaign/ad ids come from the creator's own Impact
// (or Walmart Creator) account; the fields collect them. Confirm the account's
// link template before relying on attribution in production.

const GOTO_BASE = "https://goto.walmart.com/c";

// Build an Impact deep link wrapping the destination url. Falls back to the
// plain destination when the required ids are missing, so a half-configured
// provider never blocks copying a working link.
function buildImpactDeepLink(
  dest: string,
  ids: { publisherId: string; campaignId: string; adId: string; subId?: string },
): string {
  if (!ids.publisherId || !ids.campaignId || !ids.adId || !dest) return dest;
  const params = new URLSearchParams({ u: dest });
  if (ids.subId) params.set("subId1", ids.subId);
  return `${GOTO_BASE}/${encodeURIComponent(ids.publisherId)}/${encodeURIComponent(ids.campaignId)}/${encodeURIComponent(ids.adId)}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Impact (impact.com) - the direct publisher path
// ---------------------------------------------------------------------------

const IMPACT_API_BASE = "https://api.impact.com";

const impactAdapter: IntegrationAdapter = {
  id: "impact",
  labelKey: "provImpact",
  category: "walmartLink",
  descriptionKey: "provImpactDesc",
  hosts: ["https://api.impact.com/*", "https://goto.walmart.com/*"],
  credentialsUrl: "https://app.impact.com/",
  fields: [
    { name: "accountSid", labelKey: "fieldAccountSid", type: "text" },
    { name: "authToken", labelKey: "fieldAuthToken", type: "password" },
    { name: "campaignId", labelKey: "fieldCampaignId", type: "text" },
    { name: "adId", labelKey: "fieldAdId", type: "text" },
    { name: "subId", labelKey: "fieldSubId", type: "text", optional: true },
  ],
  async test(creds): Promise<TestResult> {
    const accountSid = str(creds.accountSid);
    const authToken = str(creds.authToken);
    if (!accountSid || !authToken) {
      return { ok: false, message: "Enter your Impact Account SID and Auth Token." };
    }
    // Read-only: list the publisher's campaigns. Impact uses HTTP Basic auth
    // with the Account SID as username and the Auth Token as password.
    const basic =
      typeof btoa === "function"
        ? btoa(`${accountSid}:${authToken}`)
        : Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    let res: Response;
    try {
      res = await fetch(`${IMPACT_API_BASE}/Mediapartners/${encodeURIComponent(accountSid)}/Campaigns?PageSize=1`, {
        method: "GET",
        headers: { Authorization: `Basic ${basic}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach Impact. Are you online?" };
    }
    if (res.ok) return { ok: true, message: "Connected to Impact." };
    if (res.status === 401 || res.status === 403) {
      return { ok: false, message: "Impact rejected those credentials. Check your Account SID and Auth Token." };
    }
    return { ok: false, message: await providerError(res, `Impact returned ${res.status}.`) };
  },
  async generateLink(target, creds): Promise<string> {
    // target.url is the canonical Walmart /ip/ url; wrap it as an Impact link.
    return buildImpactDeepLink(target.url, {
      publisherId: str(creds.accountSid),
      campaignId: str(creds.campaignId),
      adId: str(creds.adId),
      subId: str(creds.subId) || undefined,
    });
  },
};

// ---------------------------------------------------------------------------
// Walmart Creator (creator.walmart.com) - the creator-program path
// ---------------------------------------------------------------------------

const walmartCreatorAdapter: IntegrationAdapter = {
  id: "walmartCreator",
  labelKey: "provWalmartCreator",
  category: "walmartLink",
  descriptionKey: "provWalmartCreatorDesc",
  hosts: ["https://goto.walmart.com/*"],
  credentialsUrl: "https://creator.walmart.com/",
  fields: [
    { name: "publisherId", labelKey: "fieldPublisherId", type: "text" },
    { name: "campaignId", labelKey: "fieldCampaignId", type: "text" },
    { name: "adId", labelKey: "fieldAdId", type: "text" },
    { name: "subId", labelKey: "fieldSubId", type: "text", optional: true },
  ],
  async test(creds): Promise<TestResult> {
    const publisherId = str(creds.publisherId);
    const campaignId = str(creds.campaignId);
    const adId = str(creds.adId);
    if (!publisherId || !campaignId || !adId) {
      return { ok: false, message: "Enter your Walmart Creator publisher, campaign, and ad ids." };
    }
    // No public verification endpoint; validate that a link can be formed. The
    // real check is that a minted link redirects correctly, which the creator
    // can confirm by opening one.
    const preview = buildImpactDeepLink("https://www.walmart.com/", { publisherId, campaignId, adId });
    if (preview.startsWith(GOTO_BASE)) {
      return { ok: true, message: "Saved. Walmart Creator links will route through goto.walmart.com." };
    }
    return { ok: false, message: "Those ids do not form a valid link. Double-check them." };
  },
  async generateLink(target, creds): Promise<string> {
    return buildImpactDeepLink(target.url, {
      publisherId: str(creds.publisherId),
      campaignId: str(creds.campaignId),
      adId: str(creds.adId),
      subId: str(creds.subId) || undefined,
    });
  },
};

export const walmartLinkAdapters: IntegrationAdapter[] = [impactAdapter, walmartCreatorAdapter];

// Exported for unit testing the deep-link construction without a live account.
export const __test = { buildImpactDeepLink };
