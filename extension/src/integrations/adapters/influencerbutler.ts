import type { IntegrationAdapter, TestResult } from "../types";
import { withAffiliateTag } from "../url";
import { listLinks, mintLink } from "../ib-links-client";

// Influencer Butler branded links: the desktop app's "selfhosted" DeepLink
// Routing option, brought to the extension. Unlike the other deeplink providers
// (which are pure string construction from the user's own link pattern), this
// one mints a real short link on links.influencerbutler.com by calling the same
// worker the desktop app uses (see workers/links + SelfHostedLinkClient). The
// request layer lives in ib-links-client (shared with the background Ledger
// wrappers); this adapter is the routing-time entry point.
//
// There are no credential fields: the request authenticates with the license
// key the user already signed in with (injected by the background as
// creds.licenseKey), exactly as the desktop app authenticates per-user with no
// shared token. Branded links are free for every valid license (there is no
// server-side paid gate), so any signed-in extension user can create them.

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
    // Validate the license without minting: the list endpoint is owner-scoped
    // and uses the same auth as create.
    const result = await listLinks(licenseKey);
    if (result.ok) {
      return { ok: true, message: "Connected. Branded links will be created from your account." };
    }
    if (result.code === "not_signed_in") {
      return { ok: false, message: "License not recognized. Sign in again from the popup." };
    }
    if (result.code === "network") {
      return { ok: false, message: "Could not reach the branded link service. Are you online?" };
    }
    return { ok: false, message: result.error };
  },
  async generateLink(target, creds): Promise<string> {
    const licenseKey = (creds.licenseKey ?? "").trim();
    const tagged = target.tag ? withAffiliateTag(target.url, target.tag) : target.url;
    if (!licenseKey) return tagged;
    // Mint (or reuse) a branded short link. Throw on failure so the caller
    // (routing.buildAffiliateLink) falls back to the plain tagged url.
    const result = await mintLink(
      { url: tagged, asin: target.asin, marketplace: target.marketplace, sourceId: "extension" },
      licenseKey,
    );
    if (!result.ok) throw new Error(result.error);
    return result.shortUrl;
  },
};
