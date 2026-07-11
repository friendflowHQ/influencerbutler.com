import type { IntegrationAdapter, LinkTarget, TestResult } from "../types";
import { withAffiliateTag } from "../url";
import { IB_LINKS_ENDPOINTS } from "../../shared/constants";

// Influencer Butler branded links: the desktop app's "selfhosted" DeepLink
// Routing option, brought to the extension. Unlike the other deeplink providers
// (which are pure string construction from the user's own link pattern), this
// one mints a real short link on links.influencerbutler.com by calling the same
// worker the desktop app uses (see workers/links + SelfHostedLinkClient).
//
// There are no credential fields: the request authenticates with the license
// key the user already signed in with (injected by the background as
// creds.licenseKey), exactly as the desktop app authenticates per-user with no
// shared token. Branded links are free for every valid license (there is no
// server-side paid gate), so any signed-in extension user can create them.

const REQUEST_TIMEOUT_MS = 30_000;

function shortUrlFrom(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const p = payload as Record<string, unknown>;
  const value = p.shortUrl ?? p.short_url ?? p.url ?? p.link;
  return typeof value === "string" ? value : "";
}

// Mint (or look up: the worker is idempotent per owner+target) a branded short
// link for an already-affiliate-tagged url. Throws on any non-2xx so the caller
// (routing.buildAffiliateLink) falls back to the plain tagged url.
async function createBrandedLink(
  taggedUrl: string,
  licenseKey: string,
  target: LinkTarget,
): Promise<string> {
  const body: Record<string, string> = { url: taggedUrl, sourceId: "extension" };
  if (target.asin) body.asin = target.asin;
  if (target.marketplace) body.marketplace = target.marketplace;

  const response = await fetch(IB_LINKS_ENDPOINTS.create, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${licenseKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`branded link creation failed (status ${response.status})`);
  }
  const shortUrl = shortUrlFrom(await response.json().catch(() => null));
  if (!shortUrl) throw new Error("branded link service returned no short url");
  return shortUrl;
}

export const influencerButlerLinkAdapter: IntegrationAdapter = {
  id: "influencerbutler",
  labelKey: "provInfluencerButler",
  descriptionKey: "provInfluencerButlerDesc",
  category: "deeplink",
  // links.influencerbutler.com is a first-party host granted at install (see
  // static/manifest.json host_permissions), so no runtime permission prompt.
  hosts: [],
  // No fields: authentication is the signed-in license key, supplied by the
  // background as creds.licenseKey.
  fields: [],
  async test(creds): Promise<TestResult> {
    const licenseKey = (creds.licenseKey ?? "").trim();
    if (!licenseKey) {
      return { ok: false, message: "Sign in with your license key to create branded links." };
    }
    // Validate the license and paid tier without minting a link: the list
    // endpoint is owner-scoped and paid-gated with the same auth as create.
    let response: Response;
    try {
      response = await fetch(`${IB_LINKS_ENDPOINTS.list}?limit=1`, {
        method: "GET",
        headers: { Authorization: `Bearer ${licenseKey}`, Accept: "application/json" },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      return { ok: false, message: "Could not reach the branded link service. Are you online?" };
    }
    if (response.ok) {
      return { ok: true, message: "Connected. Branded links will be created from your account." };
    }
    if (response.status === 401) {
      return { ok: false, message: "License not recognized. Sign in again from the popup." };
    }
    return { ok: false, message: `Branded link service is unavailable (status ${response.status}).` };
  },
  async generateLink(target, creds): Promise<string> {
    const licenseKey = (creds.licenseKey ?? "").trim();
    const tagged = target.tag ? withAffiliateTag(target.url, target.tag) : target.url;
    if (!licenseKey) return tagged;
    return createBrandedLink(tagged, licenseKey, target);
  },
};
