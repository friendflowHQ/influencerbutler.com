import {
  buildPublishTags,
  fetchStats,
  listLinks,
  mintLink,
  publishLink,
  repointLink,
  savePixels,
  type LinkMintTarget,
  type LinkPixel,
  type LinkStatsRange,
  type LinkTrafficFilter,
  type ListResult,
  type MintResult,
  type PixelsResult,
  type RepointResult,
  type StatsResult,
} from "../integrations/ib-links-client";
import { canonicalProductUrl, withAffiliateTag } from "../integrations/url";
import { resolveTag } from "../integrations/routing";
import { LINK_MINT_BULK_CAP, LINK_MINT_DELAY_MAX_MS, LINK_MINT_DELAY_MIN_MS } from "../shared/constants";
import { getIntegrations, getSettings, getState, patchSettings } from "../storage/store";

// State-reading wrappers around the pure ib-links-client. The background is the
// only place the license key is read, so every UI-facing link action routes
// through here. The client itself stays free of chrome/storage so it unit-tests
// without a browser.

// A product (or raw url) to mint a branded link for. The tagged Amazon url is
// built here from the creator's per-country tags, exactly like "Copy my link".
export type BrandedMintInput = {
  asin?: string;
  marketplace: string;
  url?: string;
  label?: string;
};

async function licenseKey(): Promise<string> {
  return (await getState()).auth.licenseKey ?? "";
}

// Build the tagged Amazon target url for a product, mirroring buildAffiliateLink's
// tagging step: canonical /dp/ url, then the per-country tag (US falls back to the
// storefront handle). This is the target the branded short link points at.
async function taggedTargetUrl(input: BrandedMintInput): Promise<string> {
  const [settings, integrations] = await Promise.all([getSettings(), getIntegrations()]);
  const base =
    input.url && /^https?:\/\//i.test(input.url)
      ? input.url
      : canonicalProductUrl(input.asin ?? "", input.marketplace, input.url ?? "");
  const tag = resolveTag(input.marketplace, integrations.global.perCountryTags, settings.storefrontHandle);
  return tag ? withAffiliateTag(base, tag) : base;
}

// Mint (or reuse) a branded link for one product, and publish smart routing when
// the toggle is on. Returns the mint result; a smart-routing publish failure is
// swallowed so it never blocks handing back a working short link.
export async function mintBranded(input: BrandedMintInput): Promise<MintResult> {
  const [settings, key] = await Promise.all([getSettings(), licenseKey()]);
  const url = await taggedTargetUrl(input);
  const target: LinkMintTarget = {
    url,
    asin: input.asin,
    marketplace: input.marketplace,
    label: input.label,
    sourceId: "extension",
  };
  const result = await mintLink(target, key);
  if (result.ok && settings.linkButler.smartRouting) {
    try {
      const [tagsSettings, integrations] = await Promise.all([getSettings(), getIntegrations()]);
      const tags = buildPublishTags(integrations.global.perCountryTags, tagsSettings.storefrontHandle);
      await publishLink({ slug: result.slug, tags }, key);
    } catch {
      // Publish is best-effort; the link still works as a plain redirect.
    }
  }
  return result;
}

// Called from the generate-link path: if the freshly generated link is a branded
// short url and smart routing is on, publish its definition. The slug is parsed
// from the /l/<slug> short url so this needs no separate mint round-trip.
export async function maybePublishGeneratedLink(url: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings.linkButler.smartRouting) return;
    const parsed = new URL(url);
    if (parsed.hostname !== "links.influencerbutler.com") return;
    const slug = /^\/l\/([^/?#]+)/.exec(parsed.pathname)?.[1];
    if (!slug) return;
    const [integrations, key] = await Promise.all([getIntegrations(), licenseKey()]);
    const tags = buildPublishTags(integrations.global.perCountryTags, settings.storefrontHandle);
    await publishLink({ slug, tags }, key);
  } catch {
    // Best-effort: never let a publish attempt break link generation.
  }
}

export type BulkMintItem = {
  asin?: string;
  marketplace: string;
  ok: boolean;
  shortUrl?: string;
  slug?: string;
  error?: string;
};
export type BulkMintResult = {
  items: BulkMintItem[];
  minted: number;
  failed: number;
  capped: boolean;
};

function jitterDelay(): Promise<void> {
  const span = LINK_MINT_DELAY_MAX_MS - LINK_MINT_DELAY_MIN_MS;
  const ms = LINK_MINT_DELAY_MIN_MS + Math.floor(Math.random() * (span + 1));
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mint a branded link for each product in a harvested batch. Sequential and
// paced with jitter (like the deal/order harvesters) so it reads like a person
// creating links, and capped so one huge harvest can never be an unbounded run.
export async function bulkMintBranded(inputs: BrandedMintInput[]): Promise<BulkMintResult> {
  const capped = inputs.length > LINK_MINT_BULK_CAP;
  const slice = capped ? inputs.slice(0, LINK_MINT_BULK_CAP) : inputs;
  const items: BulkMintItem[] = [];
  let minted = 0;
  let failed = 0;
  for (let i = 0; i < slice.length; i++) {
    const input = slice[i];
    if (!input) continue;
    if (i > 0) await jitterDelay();
    const result = await mintBranded(input);
    if (result.ok) {
      minted++;
      items.push({ asin: input.asin, marketplace: input.marketplace, ok: true, shortUrl: result.shortUrl, slug: result.slug });
    } else {
      failed++;
      items.push({ asin: input.asin, marketplace: input.marketplace, ok: false, error: result.error });
    }
  }
  return { items, minted, failed, capped };
}

export async function listOwnerLinks(cursor?: string | null): Promise<ListResult> {
  return listLinks(await licenseKey(), cursor);
}

export async function repointOwnerLink(input: {
  slug: string;
  url: string;
  asin?: string;
  marketplace?: string;
}): Promise<RepointResult> {
  return repointLink(input, await licenseKey());
}

export async function ownerStats(
  range: LinkStatsRange,
  opts: { slug?: string; traffic?: LinkTrafficFilter } = {},
): Promise<StatsResult> {
  return fetchStats(await licenseKey(), range, opts);
}

// Pixels have no worker read endpoint, so the current list lives in settings.
export async function getOwnerPixels(): Promise<LinkPixel[]> {
  return (await getSettings()).linkButler.pixels;
}

// Save pixels to the worker (the Doorbell) and mirror the sanitized list back
// into local settings so the form reflects what the server actually stored.
export async function saveOwnerPixels(pixels: LinkPixel[]): Promise<PixelsResult> {
  const result = await savePixels(pixels, await licenseKey());
  if (result.ok) {
    const current = await getSettings();
    await patchSettings({ linkButler: { ...current.linkButler, pixels: result.pixels } });
  }
  return result;
}
