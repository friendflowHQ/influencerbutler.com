// MAIN-world hook, injected at document_start on benable.com list + rec pages.
//
// Benable is a SvelteKit site whose list cards are rendered from server-side
// data; the page never fetches the rec_objects endpoint at runtime and the
// list's group id is not left in the live DOM, so the isolated-world content
// script has no way to read each card's outbound Amazon link. The page DOES
// call api.benable.com/api/groups/<groupId>/... (embedded_posts, rec_requests)
// on load, which carries the group id in the URL path. This shim wraps
// fetch/XHR as a pure passthrough, captures that group id, then fetches the
// group's public rec_objects itself (anonymously: api.benable.com allows the
// benable.com origin for uncredentialed reads), reads the Amazon ASIN out of
// each rec's affiliate_url, and republishes a compact { asin, title, photoIds } to
// the content script via a DOM CustomEvent. Nothing on the page is modified,
// blocked, or sent anywhere else. This mirrors src/content/deals-hook.ts.
//
// Verified live 2026-09-15: rec_objects returns the whole list in one array;
// each rec carries `affiliate_url` (for Amazon items a raw /dp/<ASIN> URL with
// the creator's tag, sometimes a benable.com/a/<code> redirect instead),
// `display_name` (the card title), and `rec_object_photos[].id` (the photo ids
// that appear in the card's <img src="…/rec_object_photos/<id>/…">, the join
// key back to the rendered card).

type BenableRec = { asin: string; title: string | null; photoIds: string[] };

(() => {
  const w = window as typeof window & { __ibBenableHooked?: boolean };
  if (w.__ibBenableHooked) return;
  w.__ibBenableHooked = true;

  // A group-scoped api.benable.com call, capturing the group id (a UUID). Any
  // of the calls the page makes on load (embedded_posts, rec_requests, config)
  // matches, so we learn the id before the app has rendered the cards.
  const GROUP_URL_RE = /api\.benable\.com\/api\/groups\/([0-9a-f-]{36})\b/i;
  // A product ASIN out of a /dp/ or /gp/product/ url. Mirrors ASIN_URL_RE in
  // src/amazon/product-signals.ts; kept inline so this shim pulls in no DOM deps.
  const ASIN_URL_RE = /\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/;

  // Keep the page's real fetch so our own rec_objects request bypasses the
  // wrapper (and so no site code observes an extra hooked call).
  const originalFetch = window.fetch;

  const fetchedGroups = new Set<string>();

  const parseAsin = (value: unknown): string | null => {
    const match = String(value ?? "").match(ASIN_URL_RE);
    return match && match[1] ? match[1].toUpperCase() : null;
  };

  const photoIdsOf = (rec: Record<string, unknown>): string[] => {
    const photos = rec.rec_object_photos;
    if (!Array.isArray(photos)) return [];
    const ids: string[] = [];
    for (const photo of photos) {
      const id = (photo as Record<string, unknown>)?.id;
      if (id != null) ids.push(String(id));
    }
    return ids;
  };

  const emit = (recs: BenableRec[]): void => {
    if (!recs.length) return;
    try {
      document.dispatchEvent(new CustomEvent("ib-ext-benable-feed", { detail: { recs } }));
    } catch {
      // never let the shim surface an error on the page
    }
  };

  // Fetch a group's rec_objects once, extract the Amazon items, and emit them.
  const loadGroup = (groupId: string): void => {
    if (fetchedGroups.has(groupId)) return;
    fetchedGroups.add(groupId);
    const url =
      `https://api.benable.com/api/groups/${groupId}/rec_objects` +
      `?metadata%5Bscreen_width%5D=0&metadata%5Bscreen_height%5D=0&source=web`;
    // Anonymous: api.benable.com allows the benable.com origin for uncredentialed
    // reads of a public list; a credentialed request is refused by CORS. Private
    // lists are out of scope (their recs need the site's own session).
    originalFetch
      .call(window, url)
      .then((response) => (response.ok ? response.json() : []))
      .then((data: unknown) => {
        if (!Array.isArray(data)) return;
        const out: BenableRec[] = [];
        for (const raw of data) {
          const rec = raw as Record<string, unknown>;
          // The raw product URL first, then Benable's affiliate_url (which is a
          // raw /dp/ link for most Amazon items). Either yields the ASIN.
          const asin = parseAsin(rec.url) ?? parseAsin(rec.affiliate_url) ?? parseAsin(rec.weblink);
          if (!asin) continue;
          const title = typeof rec.display_name === "string" ? rec.display_name : typeof rec.name1 === "string" ? rec.name1 : null;
          out.push({ asin, title, photoIds: photoIdsOf(rec) });
        }
        emit(out);
      })
      .catch(() => undefined);
  };

  const noteUrl = (value: unknown): void => {
    const match = String(value ?? "").match(GROUP_URL_RE);
    if (match && match[1]) loadGroup(match[1].toLowerCase());
  };

  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    try {
      const input = args[0];
      const url =
        typeof input === "string" ? input : input instanceof Request ? input.url : String(input);
      noteUrl(url);
    } catch {
      // passthrough regardless
    }
    return originalFetch.apply(this as typeof globalThis, args);
  };

  const openOriginal = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (
    this: XMLHttpRequest,
    ...args: Parameters<XMLHttpRequest["open"]>
  ) {
    try {
      noteUrl(args[1]);
    } catch {
      // passthrough regardless
    }
    return openOriginal.apply(this, args as unknown as Parameters<XMLHttpRequest["open"]>);
  } as typeof XMLHttpRequest.prototype.open;
})();
