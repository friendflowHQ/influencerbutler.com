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
  const fromLink = href.match(/\/shop\/([^/?#]+)/)?.[1] ?? null;
  if (fromLink) return fromLink;
  // On the Manage page the header link markup differs; fall back to any anchor
  // that points at the creator's own /shop/<handle> page.
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href*="/shop/"]'))) {
    const m = (a.getAttribute("href") ?? "").match(/\/shop\/([^/?#]+)/);
    if (m && m[1] && m[1] !== "influencer") return m[1];
  }
  return null;
}

// One row of the Creator Hub "Manage videos" list (/creatorhub/manage). The
// list is a React table with no ASINs inline (unlike the Edit Video page), so
// Video Money resolves each row's products by joining `contentId` against the
// storefront feed. `views` is best-effort: drafts have no metrics, and the
// column markup is unlabeled, so it is read from the row's plain-integer cell.
export type ManageRowStatus = "published" | "draft" | "other";

export type ManageRow = {
  el: HTMLElement;
  contentId: string;
  title: string | null;
  status: ManageRowStatus;
  views: number | null;
};

const VIDEO_LINK_RE = /\/creatorhub\/video\/([^/?#]+)/;

// Reads the manage-list rows from the live DOM. Anchored on the per-row link to
// the Edit Video page (`/creatorhub/video/<contentId>`), which is the stable
// signal: the "Manage"/"Edit draft" control always links there. Title and views
// are read from the same row, best-effort. Selectors are deliberately loose so a
// React markup revision degrades (fewer signals) rather than breaking.
export function readManageRows(doc: Document): ManageRow[] {
  const rows: ManageRow[] = [];
  const seen = new Set<string>();
  const anchors = Array.from(
    doc.querySelectorAll<HTMLAnchorElement>('a[href*="/creatorhub/video/"]'),
  );
  for (const anchor of anchors) {
    const contentId = (anchor.getAttribute("href") ?? "").match(VIDEO_LINK_RE)?.[1]?.trim();
    if (!contentId || seen.has(contentId)) continue;
    const row = rowContainerFor(anchor);
    if (!row) continue;
    seen.add(contentId);
    rows.push({
      el: row,
      contentId,
      title: rowTitle(row),
      status: rowStatus(row),
      views: rowViews(row),
    });
  }
  return rows;
}

// Climb from the per-row link to the closest ancestor that looks like a table
// row (or list item), so a badge and the metric read scope to one video.
function rowContainerFor(anchor: HTMLElement): HTMLElement | null {
  const row = anchor.closest<HTMLElement>('[role="row"], tr, li');
  if (row) return row;
  // No semantic row: walk up a few levels to a container that holds more than
  // just the link (a real row has the thumbnail, title, and metric cells).
  let node: HTMLElement | null = anchor.parentElement;
  for (let i = 0; i < 5 && node; i += 1) {
    if (node.querySelectorAll("*").length > 6) return node;
    node = node.parentElement;
  }
  return anchor.parentElement;
}

function rowStatus(row: HTMLElement): ManageRowStatus {
  const text = (row.textContent ?? "").toLowerCase();
  if (/\bdraft\b|\bbrouillon\b|\bborrador\b/.test(text)) return "draft";
  if (/\bpublished\b|\bpublié\b|\bpublicado\b/.test(text)) return "published";
  return "other";
}

// The row's video title. Prefer the anchor/heading nearest the thumbnail; fall
// back to the longest text node that is not a metric or a status word.
function rowTitle(row: HTMLElement): string | null {
  const link = row.querySelector<HTMLElement>('a[href*="/creatorhub/video/"]');
  const linkText = link?.textContent?.trim();
  if (linkText && linkText.length > 1 && !/^manage$|^edit draft$/i.test(linkText)) {
    return linkText.slice(0, 200);
  }
  const heading = row.querySelector<HTMLElement>("h1, h2, h3, h4, h5, strong");
  const headingText = heading?.textContent?.trim();
  return headingText ? headingText.slice(0, 200) : null;
}

// Views is the row's integer-only cell. The manage table's other numeric cells
// are a duration (m:ss) and a percentage (N%); a bare integer is the view count.
// Returns null for drafts (no metrics) or when the markup cannot be read.
function rowViews(row: HTMLElement): number | null {
  const cells = Array.from(row.querySelectorAll<HTMLElement>('[role="cell"], td, span, div'));
  for (const cell of cells) {
    // Only leaf-ish cells: a wrapper's textContent concatenates several columns.
    if (cell.children.length > 0) continue;
    const raw = (cell.textContent ?? "").trim();
    if (!raw) continue;
    if (raw.includes(":") || raw.includes("%")) continue; // duration or percent
    const digits = raw.match(/^([\d][\d,\s.]*)$/)?.[1];
    if (!digits) continue;
    const n = parseInt(digits.replace(/[^\d]/g, ""), 10);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function strOrNull(value: unknown): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s ? s : null;
}
