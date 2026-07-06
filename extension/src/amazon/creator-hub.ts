// Reads the Amazon Creator Hub "Edit Video" page (/creatorhub/video/<id>).
// The tagged ASINs, title, and marketplace are NOT on DOM attributes; they live
// in a state script keyed "cp-upload-widget-params" (see the desktop repo's
// docs/developer/amazon-creator-hub-selectors.md, Page 2 sections G/H). This
// module is the single place that knows that shape.

export type UploadState = {
  contentId: string | null;
  title: string | null;
  asins: string[];
  marketplaceId: string | null;
  marketplaceCode: string | null;
  statusState: string | null;
};

// Home marketplace id -> short code (docs/developer/amazon-creator-hub-selectors.md
// Page 2 section G; kept in sync with COUNTRY_TO_MARKETPLACE in the desktop repo).
const MARKETPLACE_CODE: Record<string, string> = {
  ATVPDKIKX0DER: "US",
  A1F83G8C2ARO7P: "UK",
  A2EUQ1WTGCTBG2: "CA",
  A1PA6795UKMFR9: "DE",
  A39IBJ37TRP1C6: "AU",
};

const ASIN_RE = /^[A-Z0-9]{10}$/;
const UPLOAD_STATE_SELECTOR = 'script[type="a-state"][data-a-state*="upload-widget-params"]';

// Pure parser (exported for tests): the a-state JSON string -> UploadState.
export function parseUploadState(json: string): UploadState | null {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  const video = (data as { video?: Record<string, unknown> })?.video;
  if (!video || typeof video !== "object") return null;

  const rawAsins = (video.associatedAsins as { originalValue?: unknown })?.originalValue;
  const asins = Array.isArray(rawAsins)
    ? [
        ...new Set(
          rawAsins
            .map((a) => String(a ?? "").trim().toUpperCase())
            .filter((a) => ASIN_RE.test(a)),
        ),
      ]
    : [];

  const marketplaceId = typeof video.homeMarketPlaceId === "string" ? video.homeMarketPlaceId : null;

  return {
    contentId: strOrNull(video.contentId),
    title: strOrNull(video.title),
    asins,
    marketplaceId,
    marketplaceCode: marketplaceId ? MARKETPLACE_CODE[marketplaceId] ?? null : null,
    statusState: strOrNull((video.status as { state?: unknown })?.state),
  };
}

export function readUploadState(doc: Document): UploadState | null {
  const text = doc.querySelector(UPLOAD_STATE_SELECTOR)?.textContent;
  return text ? parseUploadState(text) : null;
}

// The creator handle for the storefront, read from the header link
// (docs Page 3, `.cp-storefront-link` -> /shop/<handle>). Used to look the
// storefront's existing videos up for the duplicate check.
export function readStorefrontHandle(doc: Document): string | null {
  const href = doc.querySelector(".cp-storefront-link")?.getAttribute("href") ?? "";
  return href.match(/\/shop\/([^/?#]+)/)?.[1] ?? null;
}

function strOrNull(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}
